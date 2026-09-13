import type { CodeRow, LogEntry } from '../types';
import { round1, todayIso } from './util';

function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Column order per Build Spec §9. */
export function entriesToCsv(entries: LogEntry[], codesByHcpcs: Map<string, CodeRow>): string {
  const header = ['date', 'hcpcs', 'component', 'modifiers', 'description', 'workRVU', 'qty', 'totalRVU', 'rvuSource', 'setting', 'caseId'];
  const rows = entries
    .filter((e) => !e.voided)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((e) => {
      const code = codesByHcpcs.get(`${e.hcpcs}:${e.component}`) ?? codesByHcpcs.get(e.hcpcs);
      return [
        e.date,
        e.hcpcs,
        e.component,
        e.modifiers,
        code?.longDescriptor ?? '',
        e.workRVU,
        e.qty,
        round1(e.qty * e.workRVU),
        e.rvuSource,
        e.setting,
        e.caseId,
      ]
        .map(csvEscape)
        .join(',');
    });
  return [header.join(','), ...rows].join('\n');
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function monthlyExportFilename(): string {
  return `wRVU_${todayIso().slice(0, 7)}.csv`;
}

export function fullHistoryExportFilename(): string {
  return `wRVU_full-history.csv`;
}
