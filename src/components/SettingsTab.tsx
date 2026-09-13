import { useMemo, useState } from 'react';
import { useAppData } from '../lib/AppDataContext';
import type { Component } from '../types';
import { distinctDisplayCodes } from '../lib/search';
import CodeLabel from './CodeLabel';

const COMPONENT_LABEL: Record<Component, string> = {
  '26': 'Professional (26)',
  TC: 'Technical (TC)',
  '': 'Global',
};

export default function SettingsTab() {
  const { codes, rules, settings, saveSettings, setRuleVerified, setCodeComponent } = useAppData();
  const [dailyTargetInput, setDailyTargetInput] = useState(settings.dailyTarget?.toString() ?? '');
  const [annualTargetInput, setAnnualTargetInput] = useState(settings.annualTarget?.toString() ?? '');

  const splitCodes = useMemo(() => {
    const byHcpcs = new Map<string, typeof codes>();
    for (const c of codes) {
      if (!byHcpcs.has(c.hcpcs)) byHcpcs.set(c.hcpcs, []);
      byHcpcs.get(c.hcpcs)!.push(c);
    }
    return [...byHcpcs.entries()].filter(([, rows]) => rows.length > 1);
  }, [codes]);

  const displayCodes = useMemo(() => distinctDisplayCodes(codes), [codes]);
  const unverifiedRules = rules.filter((r) => !r.verified && r.type !== 'not_exclusive_note');

  return (
    <div className="settings-tab">
      <section className="settings-section">
        <h3>Targets</h3>
        <p className="settings-hint">
          Leave blank if you don't want a target — there is no industry-standard benchmark baked into this app.
        </p>
        <label className="settings-field">
          Daily target (your target, not a benchmark)
          <input
            type="number"
            min={0}
            value={dailyTargetInput}
            onChange={(e) => setDailyTargetInput(e.target.value)}
            onBlur={() => saveSettings({ dailyTarget: dailyTargetInput === '' ? null : Number(dailyTargetInput) })}
          />
        </label>
        <label className="settings-field">
          Annual target
          <input
            type="number"
            min={0}
            value={annualTargetInput}
            onChange={(e) => setAnnualTargetInput(e.target.value)}
            onBlur={() => saveSettings({ annualTarget: annualTargetInput === '' ? null : Number(annualTargetInput) })}
          />
        </label>
      </section>

      <section className="settings-section">
        <h3>PFT billing model</h3>
        <p className="settings-hint">
          Changes which wRVU is credited to you for in-office tests (§4.1). Current: <strong>{settings.pftBillingModel || 'not set'}</strong>
        </p>
        <div className="modal-actions">
          <button className="btn" onClick={() => saveSettings({ pftBillingModel: 'professional' })}>
            Professional (26) only
          </button>
          <button className="btn" onClick={() => saveSettings({ pftBillingModel: 'global' })}>
            Global
          </button>
        </div>
      </section>

      {splitCodes.length > 0 && (
        <section className="settings-section">
          <h3>Per-code component</h3>
          <p className="settings-hint">Set Professional / Technical / Global per code that has a PC/TC split.</p>
          {splitCodes.map(([hcpcs, rows]) => {
            const display = displayCodes.find((c) => c.hcpcs === hcpcs)!;
            return (
              <div className="settings-field code-component-row" key={hcpcs}>
                <CodeLabel code={display} />
                <select
                  value={display.defaultComponent}
                  onChange={(e) => setCodeComponent(hcpcs, e.target.value as Component)}
                >
                  {rows.map((r) => (
                    <option key={r.modifier || 'global'} value={r.modifier}>
                      {COMPONENT_LABEL[r.modifier]}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </section>
      )}

      <section className="settings-section">
        <h3>Bundling rules</h3>
        <p className="settings-hint">
          Seeded rules are unverified until you reconcile them against your current NCCI Procedure-to-Procedure
          edits and your own coding staff (§6). {unverifiedRules.length} of {rules.filter((r) => r.type !== 'not_exclusive_note').length} unverified.
        </p>
        <ul className="rules-list">
          {rules.map((r) => (
            <li key={r.id} className="rules-list-item">
              <div>
                <strong>{r.type}</strong>: {r.codeA} / {r.codeB}
                <div className="rule-message">{r.message}</div>
                {r.sourceNote && <div className="rule-source-note">{r.sourceNote}</div>}
              </div>
              {r.type !== 'not_exclusive_note' && (
                <label className="rule-verified-toggle">
                  <input
                    type="checkbox"
                    checked={r.verified}
                    onChange={(e) => setRuleVerified(r.id, e.target.checked)}
                  />
                  Verified
                </label>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="settings-section">
        <h3>RVU source</h3>
        <p>{settings.rvuSourceLabel || 'No CMS PPRRVU file imported yet.'}</p>
      </section>
    </div>
  );
}
