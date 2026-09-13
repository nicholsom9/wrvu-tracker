import type { CodeRow } from '../types';

/** One row per distinct hcpcs, resolved to its current default-component variant (§4.1). */
export function distinctDisplayCodes(codes: CodeRow[]): CodeRow[] {
  const byHcpcs = new Map<string, CodeRow[]>();
  for (const c of codes) {
    if (!byHcpcs.has(c.hcpcs)) byHcpcs.set(c.hcpcs, []);
    byHcpcs.get(c.hcpcs)!.push(c);
  }
  const result: CodeRow[] = [];
  for (const rows of byHcpcs.values()) {
    result.push(rows.find((r) => r.modifier === r.defaultComponent) ?? rows[0]);
  }
  return result;
}

/** Matches on code number, abbreviation, long descriptor, and synonyms (§8). */
export function searchCodes(codes: CodeRow[], query: string): CodeRow[] {
  const list = distinctDisplayCodes(codes.filter((c) => c.trackable));
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((c) => {
    const haystack = `${c.hcpcs} ${c.shortLabel} ${c.longDescriptor} ${c.synonyms}`.toLowerCase();
    return haystack.includes(q);
  });
}
