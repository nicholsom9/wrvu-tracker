import * as api from './api';
import * as db from './db';
import type { LogEntry, QueuedOp } from './../types';

let syncing = false;
type Listener = () => void;
const listeners = new Set<Listener>();

export function onSyncChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn();
}

/**
 * Drains the local write queue against the Apps Script backend. Every queued
 * `append` carries the same clientId it was created with, so a retry after a
 * dropped hospital wifi connection can never double-count a wRVU (§3, §7) —
 * the backend's idempotency check on `clientId` is what makes this safe to
 * call repeatedly and aggressively.
 */
export async function syncQueue(): Promise<void> {
  if (syncing) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  syncing = true;
  try {
    let queue = await db.getQueue();
    for (const op of queue) {
      try {
        await runOp(op);
        await db.dequeue(op.opId);
      } catch (err) {
        if (err instanceof api.ApiError) {
          // Server reachable but rejected the op (e.g. bad payload) — drop it
          // rather than retry forever; log so it's visible during development.
          console.error('Dropping queued op after server error', op, err);
          await db.dequeue(op.opId);
          continue;
        }
        // Network-level failure: stop here, keep remaining ops queued for next attempt.
        await db.bumpAttempts(op.opId);
        break;
      }
    }
    queue = await db.getQueue();
    if (queue.length === 0) {
      await db.setLastSync(new Date().toISOString());
    }
  } finally {
    syncing = false;
    notify();
  }
}

async function runOp(op: QueuedOp): Promise<void> {
  if (op.kind === 'append') {
    const entry = op.payload as LogEntry;
    await api.appendEntries([entry]);
  } else if (op.kind === 'update') {
    const { clientId, changes } = op.payload as { clientId: string; changes: { qty?: number; modifiers?: string } };
    await api.updateEntry(clientId, changes);
  } else if (op.kind === 'delete') {
    const { clientId } = op.payload as { clientId: string };
    await api.deleteEntry(clientId);
  }
}

export function startBackgroundSync(): () => void {
  const onOnline = () => void syncQueue();
  window.addEventListener('online', onOnline);
  const interval = window.setInterval(() => void syncQueue(), 30_000);
  void syncQueue();
  return () => {
    window.removeEventListener('online', onOnline);
    window.clearInterval(interval);
  };
}

export async function queueAppend(entry: LogEntry): Promise<void> {
  await db.upsertLocalEntry(entry);
  await db.enqueue({
    opId: `append:${entry.clientId}`,
    kind: 'append',
    payload: entry,
    attempts: 0,
    createdAt: new Date().toISOString(),
  });
  void syncQueue();
}

export async function queueUpdate(clientId: string, changes: { qty?: number; modifiers?: string }): Promise<void> {
  const entries = await db.getEntries();
  const entry = entries.find((e) => e.clientId === clientId);
  if (entry) {
    if (changes.qty !== undefined) entry.qty = changes.qty;
    if (changes.modifiers !== undefined) entry.modifiers = changes.modifiers;
    await db.setEntries(entries);
  }
  await db.enqueue({
    opId: `update:${clientId}:${Date.now()}`,
    kind: 'update',
    payload: { clientId, changes },
    attempts: 0,
    createdAt: new Date().toISOString(),
  });
  void syncQueue();
}

export async function queueDelete(clientId: string): Promise<void> {
  const entries = await db.getEntries();
  const entry = entries.find((e) => e.clientId === clientId);
  if (entry) {
    entry.voided = true;
    await db.setEntries(entries);
  }
  await db.enqueue({
    opId: `delete:${clientId}:${Date.now()}`,
    kind: 'delete',
    payload: { clientId },
    attempts: 0,
    createdAt: new Date().toISOString(),
  });
  void syncQueue();
}

export async function pendingCount(): Promise<number> {
  return (await db.getQueue()).length;
}
