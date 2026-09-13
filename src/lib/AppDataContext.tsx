import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AppSettings, CodeRow, Component, LogEntry, RuleRow, Setting } from '../types';
import * as api from './api';
import * as db from './db';
import { onSyncChange, pendingCount, queueAppend, queueDelete, queueUpdate, startBackgroundSync, syncQueue } from './sync';
import { newId } from './util';

interface NewEntryInput {
  hcpcs: string;
  component: Component;
  modifiers?: string;
  qty: number;
  date: string;
  setting: Setting;
  caseId: string;
}

interface AppDataValue {
  loading: boolean;
  entries: LogEntry[];
  codes: CodeRow[];
  codesByHcpcs: Map<string, CodeRow>;
  rules: RuleRow[];
  settings: AppSettings;
  online: boolean;
  pendingSync: number;
  rvuSourceStale: boolean;
  addEntry: (input: NewEntryInput) => Promise<LogEntry>;
  addModifier: (clientId: string, modifier: string) => Promise<void>;
  updateQty: (clientId: string, qty: number) => Promise<void>;
  voidEntry: (clientId: string) => Promise<void>;
  refresh: () => Promise<void>;
  saveSettings: (partial: Partial<AppSettings>) => Promise<void>;
  setRuleVerified: (id: string, verified: boolean) => Promise<void>;
  setCodeComponent: (hcpcs: string, component: Component) => Promise<void>;
}

const AppDataContext = createContext<AppDataValue | null>(null);

/** A quarter is ~91 days; beyond that the loaded PPRRVU release is due for refresh (§4). */
function isSourceStale(rvuSourceLabel: string): boolean {
  if (!rvuSourceLabel) return false;
  const match = rvuSourceLabel.match(/(\d{4})\s*Q(\d)/i);
  if (!match) return false;
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  const quarterStartMonth = (quarter - 1) * 3;
  const loadedDate = new Date(year, quarterStartMonth, 1);
  const ageDays = (Date.now() - loadedDate.getTime()) / 86_400_000;
  return ageDays > 100;
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [entries, setEntriesState] = useState<LogEntry[]>([]);
  const [codes, setCodesState] = useState<CodeRow[]>([]);
  const [rules, setRulesState] = useState<RuleRow[]>([]);
  const [settings, setSettingsState] = useState<AppSettings>({
    rvuSourceLabel: '',
    dailyTarget: null,
    annualTarget: null,
    defaultComponentPFT: '26',
    pftBillingModel: '',
  });
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [pendingSync, setPendingSync] = useState(0);

  const codesByHcpcs = useMemo(() => {
    const map = new Map<string, CodeRow>();
    const byHcpcs = new Map<string, CodeRow[]>();
    for (const c of codes) {
      map.set(`${c.hcpcs}:${c.modifier}`, c);
      if (!byHcpcs.has(c.hcpcs)) byHcpcs.set(c.hcpcs, []);
      byHcpcs.get(c.hcpcs)!.push(c);
    }
    // Bare hcpcs key resolves to whichever component row is currently the
    // per-code default (§4.1), so a plain lookup always reflects the
    // physician's current Professional/Technical/Global choice for that code.
    for (const [hcpcs, rows] of byHcpcs) {
      const preferred = rows.find((r) => r.modifier === r.defaultComponent) ?? rows[0];
      map.set(hcpcs, preferred);
    }
    return map;
  }, [codes]);

  const loadFromCache = useCallback(async () => {
    const [e, c, r, s] = await Promise.all([db.getEntries(), db.getCodes(), db.getRules(), db.getSettings()]);
    setEntriesState(e);
    setCodesState(c);
    setRulesState(r);
    setSettingsState(s);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [serverEntries, serverCodes, serverRules, serverSettings] = await Promise.all([
        api.fetchEntries(),
        api.fetchCodes(),
        api.fetchRules(),
        api.fetchSettings(),
      ]);
      // Merge: server is authoritative for anything it knows about; keep any
      // locally-queued entries the server hasn't accepted yet (still in the
      // outbox), so an entry never visually disappears while offline.
      const queue = await db.getQueue();
      const pendingClientIds = new Set(
        queue.filter((o) => o.kind === 'append').map((o) => (o.payload as LogEntry).clientId)
      );
      const local = await db.getEntries();
      const localOnly = local.filter((e) => pendingClientIds.has(e.clientId));
      const merged = [...serverEntries, ...localOnly.filter((e) => !serverEntries.some((s) => s.clientId === e.clientId))];

      await db.setEntries(merged);
      await db.setCodes(serverCodes);
      await db.setRules(serverRules);
      await db.setSettings(serverSettings);
      setEntriesState(merged);
      setCodesState(serverCodes);
      setRulesState(serverRules);
      setSettingsState(serverSettings);
    } catch {
      // Offline or backend unreachable — the cached data loaded at startup stands.
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadFromCache();
      setLoading(false);
      await refresh();
    })();

    const stopSync = startBackgroundSync();
    const unsubSync = onSyncChange(() => {
      void (async () => {
        setPendingSync(await pendingCount());
        setEntriesState(await db.getEntries());
      })();
    });
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    void pendingCount().then(setPendingSync);

    return () => {
      stopSync();
      unsubSync();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addEntry = useCallback(
    async (input: NewEntryInput): Promise<LogEntry> => {
      const code = codesByHcpcs.get(`${input.hcpcs}:${input.component}`) ?? codesByHcpcs.get(input.hcpcs);
      const workRVU = code?.workRVU ?? 0;
      const entry: LogEntry = {
        clientId: newId(),
        date: input.date,
        hcpcs: input.hcpcs,
        component: input.component,
        modifiers: input.modifiers ?? '',
        qty: input.qty,
        workRVU,
        rvuSource: settings.rvuSourceLabel,
        setting: input.setting,
        caseId: input.caseId,
        createdAt: new Date().toISOString(),
        voided: false,
      };
      setEntriesState((prev) => [...prev, entry]);
      await queueAppend(entry);
      setPendingSync(await pendingCount());
      return entry;
    },
    [codesByHcpcs, settings.rvuSourceLabel]
  );

  const addModifier = useCallback(async (clientId: string, modifier: string) => {
    const all = await db.getEntries();
    const entry = all.find((e) => e.clientId === clientId);
    if (!entry) return;
    const mods = new Set(entry.modifiers.split(',').map((m) => m.trim()).filter(Boolean));
    mods.add(modifier);
    const modifiers = [...mods].join(',');
    await queueUpdate(clientId, { modifiers });
    setEntriesState(await db.getEntries());
  }, []);

  const updateQty = useCallback(async (clientId: string, qty: number) => {
    if (qty < 1) return;
    await queueUpdate(clientId, { qty });
    setEntriesState(await db.getEntries());
  }, []);

  const voidEntry = useCallback(async (clientId: string) => {
    await queueDelete(clientId);
    setEntriesState(await db.getEntries());
    setPendingSync(await pendingCount());
  }, []);

  const saveSettings = useCallback(async (partial: Partial<AppSettings>) => {
    const next = { ...settings, ...partial };
    setSettingsState(next);
    await db.setSettings(next);
    try {
      const confirmed = await api.updateSettings(partial);
      setSettingsState(confirmed);
      await db.setSettings(confirmed);
    } catch {
      // Queued implicitly: next refresh() will reconcile once back online.
    }
  }, [settings]);

  const setRuleVerified = useCallback(async (id: string, verified: boolean) => {
    setRulesState((prev) => prev.map((r) => (r.id === id ? { ...r, verified } : r)));
    try {
      await api.updateRuleVerified(id, verified);
    } catch {
      // best-effort; will read back correctly on next refresh
    }
    await refresh();
  }, [refresh]);

  const setCodeComponent = useCallback(async (hcpcs: string, component: Component) => {
    try {
      await api.setCodeDefaultComponent(hcpcs, component);
    } finally {
      await refresh();
    }
  }, [refresh]);

  const value: AppDataValue = {
    loading,
    entries,
    codes,
    codesByHcpcs,
    rules,
    settings,
    online,
    pendingSync,
    rvuSourceStale: isSourceStale(settings.rvuSourceLabel),
    addEntry,
    addModifier,
    updateQty,
    voidEntry,
    refresh,
    saveSettings,
    setRuleVerified,
    setCodeComponent,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}

// Exposed for the offline-queue "force retry" affordance in the History tab.
export { syncQueue as forceSyncQueue };
