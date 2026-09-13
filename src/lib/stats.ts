import type { CodeRow, LogEntry, RuleRow } from '../types';
import { evaluateRules, sumRvu } from './rules';
import { daysAgoIso, todayIso } from './util';

export function bundledTotalsByDate(entries: LogEntry[], rules: RuleRow[], codesByHcpcs: Map<string, CodeRow>): Map<string, number> {
  const byDate = new Map<string, LogEntry[]>();
  for (const e of entries) {
    if (e.voided) continue;
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)!.push(e);
  }
  const totals = new Map<string, number>();
  for (const [date, dayEntries] of byDate) {
    const { excludedFromBundle } = evaluateRules(dayEntries, rules, codesByHcpcs);
    totals.set(date, sumRvu(dayEntries, excludedFromBundle));
  }
  return totals;
}

export function monthToDateTotal(totals: Map<string, number>): number {
  const today = todayIso();
  const monthPrefix = today.slice(0, 7);
  let sum = 0;
  for (const [date, total] of totals) {
    if (date.slice(0, 7) === monthPrefix && date <= today) sum += total;
  }
  return sum;
}

/** Average over worked (non-zero) days in the trailing week — zero days would otherwise dilute a proceduralist's mixed clinic/OR week (§8). */
export function sevenDayWorkedAverage(totals: Map<string, number>): number | null {
  const cutoff = daysAgoIso(6);
  const today = todayIso();
  const workedDays: number[] = [];
  for (const [date, total] of totals) {
    if (date >= cutoff && date <= today && total > 0) workedDays.push(total);
  }
  if (workedDays.length === 0) return null;
  return workedDays.reduce((a, b) => a + b, 0) / workedDays.length;
}

export function rollingTwelveMonthTotal(totals: Map<string, number>): number {
  const cutoff = daysAgoIso(365);
  let sum = 0;
  for (const [date, total] of totals) {
    if (date >= cutoff) sum += total;
  }
  return sum;
}

export function lastNDaysSeries(totals: Map<string, number>, n: number): { date: string; total: number }[] {
  const series: { date: string; total: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = daysAgoIso(i);
    series.push({ date, total: totals.get(date) ?? 0 });
  }
  return series;
}

const PFT_HCPCS = new Set(['94010', '94727', '94729', '95012']);

export function categoryBucket(code: CodeRow): string {
  if (PFT_HCPCS.has(code.hcpcs)) return 'PFT';
  if (code.category === 'Bronchoscopy') return 'Bronchoscopy';
  if (code.category === 'Critical Care / Bedside Procedures') return 'Bedside Procedures';
  if (code.category === 'Outpatient Visits' || code.category === 'Inpatient Visits') return 'E/M';
  return 'Other';
}

export function breakdownByCategory(entries: LogEntry[], codesByHcpcs: Map<string, CodeRow>): { bucket: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const e of entries) {
    if (e.voided) continue;
    const code = codesByHcpcs.get(`${e.hcpcs}:${e.component}`) ?? codesByHcpcs.get(e.hcpcs);
    const bucket = code ? categoryBucket(code) : 'Other';
    totals.set(bucket, (totals.get(bucket) ?? 0) + e.qty * e.workRVU);
  }
  return [...totals.entries()]
    .map(([bucket, total]) => ({ bucket, total }))
    .sort((a, b) => b.total - a.total);
}
