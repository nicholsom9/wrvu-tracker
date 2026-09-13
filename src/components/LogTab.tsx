import { useMemo, useState } from 'react';
import { useAppData } from '../lib/AppDataContext';
import type { CodeRow, Setting } from '../types';
import { evaluateRules, sumRvu } from '../lib/rules';
import { computeFavorites } from '../lib/favorites';
import { isToday, newId, round1, todayIso } from '../lib/util';
import FavoritesRow from './FavoritesRow';
import CodeSearch from './CodeSearch';
import EntryList from './EntryList';
import Toast, { type ToastData } from './Toast';

const SETTING_BY_CATEGORY: Record<string, Setting> = {
  'Outpatient Visits': 'office',
  'Outpatient Procedures': 'office',
  'Inpatient Visits': 'inpatient',
  'Critical Care / Bedside Procedures': 'procedure',
  Bronchoscopy: 'procedure',
};

export default function LogTab() {
  const { entries, codes, codesByHcpcs, rules, addEntry, addModifier, updateQty, voidEntry } = useAppData();
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [caseId, setCaseId] = useState('');
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const dayEntries = useMemo(
    () => entries.filter((e) => e.date === selectedDate && !e.voided),
    [entries, selectedDate]
  );

  const { warnings, excludedFromBundle } = useMemo(
    () => evaluateRules(dayEntries, rules, codesByHcpcs),
    [dayEntries, rules, codesByHcpcs]
  );

  const asEnteredTotal = round1(sumRvu(dayEntries));
  const bundledTotal = round1(sumRvu(dayEntries, excludedFromBundle));

  const favorites = useMemo(() => computeFavorites(entries, codesByHcpcs), [entries, codesByHcpcs]);

  function pushToast(toast: Omit<ToastData, 'id'>) {
    setToasts((prev) => [...prev, { ...toast, id: newId() }]);
  }
  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  async function handleTap(code: CodeRow) {
    const setting = SETTING_BY_CATEGORY[code.category] ?? 'office';
    const entry = await addEntry({
      hcpcs: code.hcpcs,
      component: code.modifier,
      qty: 1,
      date: selectedDate,
      setting,
      caseId,
    });
    pushToast({
      message: `Added ${code.shortLabel}`,
      onUndo: () => void voidEntry(entry.clientId),
    });
  }

  function startNewCase() {
    const existingNumbers = new Set(
      entries
        .filter((e) => e.date === selectedDate)
        .map((e) => e.caseId)
        .filter((c) => /^case \d+$/.test(c))
        .map((c) => Number(c.split(' ')[1]))
    );
    let n = 1;
    while (existingNumbers.has(n)) n++;
    setCaseId(`case ${n}`);
  }

  if (codes.length === 0) {
    return (
      <div className="log-tab">
        <p className="empty-state">Import RVU data to begin — see README §3 (CMS PPRRVU import).</p>
      </div>
    );
  }

  return (
    <div className="log-tab">
      <div className="date-row">
        <input
          type="date"
          value={selectedDate}
          max={todayIso()}
          onChange={(e) => setSelectedDate(e.target.value)}
          className={`date-input ${!isToday(selectedDate) ? 'past-date' : ''}`}
        />
        {!isToday(selectedDate) && <span className="past-date-label">Logging for a past date</span>}
      </div>

      <div className="day-total">
        <div className="day-total-bundled">
          <span className="day-total-value">{bundledTotal}</span>
          <span className="day-total-label">wRVU (after bundling)</span>
        </div>
        {asEnteredTotal !== bundledTotal && (
          <div className="day-total-entered">{asEnteredTotal} wRVU as entered</div>
        )}
      </div>

      <FavoritesRow favorites={favorites} onTap={handleTap} />
      <CodeSearch codes={codes} onTap={handleTap} />

      <div className="case-row">
        {caseId ? (
          <span className="active-case">
            Logging under <strong>{caseId}</strong>{' '}
            <button className="btn btn-small" onClick={() => setCaseId('')}>
              End case
            </button>
          </span>
        ) : (
          <button className="btn btn-small" onClick={startNewCase}>
            + New case
          </button>
        )}
      </div>

      <EntryList
        entries={dayEntries}
        codesByHcpcs={codesByHcpcs}
        warnings={warnings}
        excludedFromBundle={excludedFromBundle}
        onVoid={(id) => void voidEntry(id)}
        onQtyChange={(id, qty) => void updateQty(id, qty)}
        onAddModifier={(id, mod) => void addModifier(id, mod)}
      />

      <div className="toast-stack">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={dismissToast} />
        ))}
      </div>
    </div>
  );
}
