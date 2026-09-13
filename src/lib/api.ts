import type { AppSettings, CodeRow, LogEntry, RuleRow } from '../types';

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL as string | undefined;
const SHARED_SECRET = import.meta.env.VITE_SHARED_SECRET as string | undefined;

/**
 * This shared secret is bundled into the client and is therefore visible to
 * anyone who inspects the deployed site. That is an accepted tradeoff — see
 * Build Spec §3 and the README — because the sheet holds no PHI, only CPT
 * code counts by date. It deters casual discovery, not a determined attacker.
 */
export class ApiError extends Error {}

async function callAppsScript<T>(action: string, payload: unknown): Promise<T> {
  if (!APPS_SCRIPT_URL || !SHARED_SECRET) {
    throw new ApiError('App is not configured: missing VITE_APPS_SCRIPT_URL / VITE_SHARED_SECRET.');
  }
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secret: SHARED_SECRET, action, payload }),
  });
  if (!res.ok) {
    throw new ApiError(`Server responded ${res.status}`);
  }
  const json = await res.json();
  if (json.error) {
    throw new ApiError(json.error);
  }
  return json as T;
}

export interface AppendResult {
  accepted: number;
  skipped: number;
}

export function appendEntries(entries: LogEntry[]): Promise<AppendResult> {
  return callAppsScript<AppendResult>('append', { entries });
}

export function deleteEntry(clientId: string): Promise<{ ok: true }> {
  return callAppsScript<{ ok: true }>('delete', { clientId });
}

export function updateEntry(clientId: string, changes: { qty?: number; modifiers?: string }): Promise<{ ok: true }> {
  return callAppsScript<{ ok: true }>('update', { clientId, changes });
}

export function fetchEntries(since?: string): Promise<LogEntry[]> {
  return callAppsScript<LogEntry[]>('fetch', since ? { since } : {});
}

export function fetchCodes(): Promise<CodeRow[]> {
  return callAppsScript<CodeRow[]>('codes', {});
}

export function fetchRules(): Promise<RuleRow[]> {
  return callAppsScript<RuleRow[]>('rules', {});
}

export function fetchSettings(): Promise<AppSettings> {
  return callAppsScript<AppSettings>('getSettings', {});
}

export function updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  return callAppsScript<AppSettings>('setSettings', partial);
}

export function updateRuleVerified(id: string, verified: boolean): Promise<{ ok: true }> {
  return callAppsScript<{ ok: true }>('updateRule', { id, verified });
}

export function setCodeDefaultComponent(hcpcs: string, defaultComponent: '' | '26' | 'TC'): Promise<{ ok: true }> {
  return callAppsScript<{ ok: true }>('setCodeDefaultComponent', { hcpcs, defaultComponent });
}

export async function healthCheck(): Promise<boolean> {
  if (!APPS_SCRIPT_URL) return false;
  try {
    const res = await fetch(APPS_SCRIPT_URL, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}
