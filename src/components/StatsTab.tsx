import { useMemo } from 'react';
import { useAppData } from '../lib/AppDataContext';
import {
  breakdownByCategory,
  bundledTotalsByDate,
  lastNDaysSeries,
  monthToDateTotal,
  rollingTwelveMonthTotal,
  sevenDayWorkedAverage,
} from '../lib/stats';
import { downloadCsv, entriesToCsv, fullHistoryExportFilename, monthlyExportFilename } from '../lib/csv';
import { round1, todayIso } from '../lib/util';
import BarChart from './BarChart';

export default function StatsTab() {
  const { entries, codesByHcpcs, rules, settings } = useAppData();

  const totalsByDate = useMemo(() => bundledTotalsByDate(entries, rules, codesByHcpcs), [entries, rules, codesByHcpcs]);
  const mtd = round1(monthToDateTotal(totalsByDate));
  const sevenDayAvg = sevenDayWorkedAverage(totalsByDate);
  const rolling12mo = round1(rollingTwelveMonthTotal(totalsByDate));
  const series = lastNDaysSeries(totalsByDate, 14);
  const breakdown = breakdownByCategory(entries, codesByHcpcs);

  const dailyTarget = settings.dailyTarget;
  const todayTotal = totalsByDate.get(todayIso()) ?? 0;
  const progressPct = dailyTarget ? Math.min(100, (todayTotal / dailyTarget) * 100) : null;

  function exportMonth() {
    const monthPrefix = todayIso().slice(0, 7);
    const monthEntries = entries.filter((e) => e.date.slice(0, 7) === monthPrefix);
    downloadCsv(entriesToCsv(monthEntries, codesByHcpcs), monthlyExportFilename());
  }
  function exportFullHistory() {
    downloadCsv(entriesToCsv(entries, codesByHcpcs), fullHistoryExportFilename());
  }

  return (
    <div className="stats-tab">
      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-value">{mtd}</div>
          <div className="stat-label">Month to date</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{sevenDayAvg !== null ? round1(sevenDayAvg) : '—'}</div>
          <div className="stat-label">7-day avg (worked days)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{rolling12mo}</div>
          <div className="stat-label">Rolling 12-month</div>
        </div>
      </div>

      {dailyTarget != null && progressPct !== null && (
        <div className="target-progress">
          <div className="target-progress-label">
            Today: {round1(todayTotal)} / {dailyTarget} (your target)
          </div>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      <section className="stats-section">
        <h3>Last 14 days</h3>
        <BarChart series={series} />
      </section>

      <section className="stats-section">
        <h3>Breakdown by category</h3>
        <ul className="breakdown-list">
          {breakdown.map((b) => (
            <li key={b.bucket}>
              <span>{b.bucket}</span>
              <span>{round1(b.total)} wRVU</span>
            </li>
          ))}
          {breakdown.length === 0 && <li className="empty-state">No entries yet.</li>}
        </ul>
      </section>

      <section className="stats-section">
        <h3>Export</h3>
        <div className="export-buttons">
          <button className="btn" onClick={exportMonth}>
            Export this month (CSV)
          </button>
          <button className="btn" onClick={exportFullHistory}>
            Export full history (CSV)
          </button>
        </div>
        <p className="export-note">For your records / to send to your practice manager — the Sheet is the source of truth.</p>
      </section>

      <footer className="stats-footer">
        <p>RVU source: {settings.rvuSourceLabel || 'not loaded'}</p>
        <p className="disclaimer">
          Figures are an estimate of work RVUs based on the loaded CMS file and the codes tapped. This is not a
          billing submission and is not reconciled against what was actually coded and paid. Reconcile periodically
          against your group's actual production reports.
        </p>
      </footer>
    </div>
  );
}
