import { useMemo } from 'react';
import { useAppData, forceSyncQueue } from '../lib/AppDataContext';
import { evaluateRules, sumRvu } from '../lib/rules';
import { formatDateLabel, round1 } from '../lib/util';
import EntryList from './EntryList';

export default function HistoryTab() {
  const { entries, codesByHcpcs, rules, addModifier, updateQty, voidEntry, pendingSync, online } = useAppData();

  const days = useMemo(() => {
    const byDate = new Map<string, typeof entries>();
    for (const e of entries) {
      if (!byDate.has(e.date)) byDate.set(e.date, []);
      byDate.get(e.date)!.push(e);
    }
    return [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  if (days.length === 0) {
    return <p className="empty-state">No history yet — logged days will appear here.</p>;
  }

  return (
    <div className="history-tab">
      {pendingSync > 0 && (
        <div className="sync-banner">
          <span>{pendingSync} entr{pendingSync === 1 ? 'y' : 'ies'} waiting to sync{online ? '' : ' (offline)'}</span>
          {online && (
            <button className="btn btn-small" onClick={() => void forceSyncQueue()}>
              Retry now
            </button>
          )}
        </div>
      )}
      {days.map(([date, dayEntries]) => {
        const active = dayEntries.filter((e) => !e.voided);
        const { warnings, excludedFromBundle } = evaluateRules(active, rules, codesByHcpcs);
        const unresolvedCount = warnings.filter((w) => w.type !== 'not_exclusive_note').length;
        const bundled = round1(sumRvu(active, excludedFromBundle));

        return (
          <details className="history-day" key={date} open={days[0][0] === date}>
            <summary>
              <span className="history-date">{formatDateLabel(date)}</span>
              <span className="history-total">{bundled} wRVU</span>
              {unresolvedCount > 0 && <span className="history-flag">{unresolvedCount} flagged</span>}
            </summary>
            <EntryList
              entries={dayEntries}
              codesByHcpcs={codesByHcpcs}
              warnings={warnings}
              excludedFromBundle={excludedFromBundle}
              onVoid={(id) => void voidEntry(id)}
              onQtyChange={(id, qty) => void updateQty(id, qty)}
              onAddModifier={(id, mod) => void addModifier(id, mod)}
            />
          </details>
        );
      })}
    </div>
  );
}
