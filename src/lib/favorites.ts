import type { CodeRow, LogEntry } from '../types';
import { CODE_SEED } from '../data/codeSeed';

export interface FavoriteEntry {
  hcpcs: string;
  component: string;
  code: CodeRow;
}

/**
 * Build Spec §8: "Favorites row pinned at top — the user's ten most-tapped
 * codes, computed from history." Falls back to the seeded favorite flags so
 * the row isn't empty on day one, before any history exists.
 */
export function computeFavorites(entries: LogEntry[], codesByHcpcs: Map<string, CodeRow>, limit = 10): FavoriteEntry[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (e.voided) continue;
    const key = `${e.hcpcs}:${e.component}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);

  const result: FavoriteEntry[] = [];
  // Dedupe by hcpcs, not hcpcs+component: a code with a PC/TC split (§4.1) must
  // only ever occupy one favorites slot, showing whichever component variant
  // was actually tapped (or the current per-code default as a fallback).
  const seenHcpcs = new Set<string>();

  for (const key of ranked) {
    if (result.length >= limit) break;
    const [hcpcs, component] = key.split(':');
    if (seenHcpcs.has(hcpcs)) continue;
    const code = codesByHcpcs.get(key) ?? codesByHcpcs.get(hcpcs);
    if (!code) continue;
    result.push({ hcpcs, component, code });
    seenHcpcs.add(hcpcs);
  }

  if (result.length < limit) {
    const seedHcpcsSeen = new Set<string>();
    for (const seed of CODE_SEED.filter((s) => s.favorite)) {
      if (seenHcpcs.has(seed.hcpcs) || seedHcpcsSeen.has(seed.hcpcs) || result.length >= limit) continue;
      seedHcpcsSeen.add(seed.hcpcs);
      const code = codesByHcpcs.get(seed.hcpcs);
      if (!code) continue;
      result.push({ hcpcs: seed.hcpcs, component: code.modifier, code });
      seenHcpcs.add(seed.hcpcs);
    }
  }

  return result;
}
