import { createStore, get, set, del } from 'idb-keyval';
import type { AppSettings, CodeRow, LogEntry, QueuedOp, RuleRow } from '../types';

/**
 * IndexedDB is a cache + offline write queue, never the database (Build Spec §1.5).
 * The Google Sheet is the source of truth. Everything here can be wiped (e.g. by
 * Safari clearing site data) and the app must rebuild it from a `fetch`/`codes`
 * round trip against the Apps Script backend — see acceptance test #2.
 */
const store = createStore('wrvu-tracker', 'cache');

const KEYS = {
  entries: 'entries',
  codes: 'codes',
  rules: 'rules',
  settings: 'settings',
  queue: 'queue',
  lastSync: 'lastSync',
} as const;

const DEFAULT_SETTINGS: AppSettings = {
  rvuSourceLabel: '',
  dailyTarget: null,
  annualTarget: null,
  defaultComponentPFT: '26',
  pftBillingModel: '',
};

export async function getEntries(): Promise<LogEntry[]> {
  return (await get<LogEntry[]>(KEYS.entries, store)) ?? [];
}

export async function setEntries(entries: LogEntry[]): Promise<void> {
  await set(KEYS.entries, entries, store);
}

export async function upsertLocalEntry(entry: LogEntry): Promise<void> {
  const entries = await getEntries();
  const idx = entries.findIndex((e) => e.clientId === entry.clientId);
  if (idx >= 0) entries[idx] = entry;
  else entries.push(entry);
  await setEntries(entries);
}

export async function getCodes(): Promise<CodeRow[]> {
  return (await get<CodeRow[]>(KEYS.codes, store)) ?? [];
}

export async function setCodes(codes: CodeRow[]): Promise<void> {
  await set(KEYS.codes, codes, store);
}

export async function getRules(): Promise<RuleRow[]> {
  return (await get<RuleRow[]>(KEYS.rules, store)) ?? [];
}

export async function setRules(rules: RuleRow[]): Promise<void> {
  await set(KEYS.rules, rules, store);
}

export async function getSettings(): Promise<AppSettings> {
  const stored = await get<AppSettings>(KEYS.settings, store);
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function setSettings(settings: AppSettings): Promise<void> {
  await set(KEYS.settings, settings, store);
}

export async function getQueue(): Promise<QueuedOp[]> {
  return (await get<QueuedOp[]>(KEYS.queue, store)) ?? [];
}

export async function enqueue(op: QueuedOp): Promise<void> {
  const queue = await getQueue();
  queue.push(op);
  await set(KEYS.queue, queue, store);
}

export async function dequeue(opId: string): Promise<void> {
  const queue = await getQueue();
  await set(
    KEYS.queue,
    queue.filter((o) => o.opId !== opId),
    store
  );
}

export async function bumpAttempts(opId: string): Promise<void> {
  const queue = await getQueue();
  const op = queue.find((o) => o.opId === opId);
  if (op) op.attempts += 1;
  await set(KEYS.queue, queue, store);
}

export async function getLastSync(): Promise<string | null> {
  return (await get<string>(KEYS.lastSync, store)) ?? null;
}

export async function setLastSync(iso: string): Promise<void> {
  await set(KEYS.lastSync, iso, store);
}

export async function clearAllCache(): Promise<void> {
  await Promise.all([del(KEYS.entries, store), del(KEYS.codes, store), del(KEYS.rules, store)]);
}
