import type { CodeRow, LogEntry, RuleWarning } from '../types';
import CodeLabel from './CodeLabel';
import { round1 } from '../lib/util';

interface Props {
  entries: LogEntry[];
  codesByHcpcs: Map<string, CodeRow>;
  warnings: RuleWarning[];
  excludedFromBundle: Set<string>;
  onVoid: (clientId: string) => void;
  onQtyChange: (clientId: string, qty: number) => void;
  onAddModifier: (clientId: string, modifier: string) => void;
}

function warningsFor(clientId: string, warnings: RuleWarning[]): RuleWarning[] {
  return warnings.filter((w) => w.entryClientIds.includes(clientId));
}

export default function EntryList({
  entries,
  codesByHcpcs,
  warnings,
  excludedFromBundle,
  onVoid,
  onQtyChange,
  onAddModifier,
}: Props) {
  const groups = new Map<string, LogEntry[]>();
  for (const e of entries) {
    const key = e.caseId || '__default__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  if (entries.length === 0) {
    return <p className="empty-state">No entries yet.</p>;
  }

  return (
    <div className="entry-groups">
      {[...groups.entries()].map(([caseId, groupEntries]) => (
        <div className="entry-group" key={caseId}>
          {caseId !== '__default__' && <div className="entry-group-label">{caseId}</div>}
          {groupEntries.map((e) => {
            const code = codesByHcpcs.get(`${e.hcpcs}:${e.component}`) ?? codesByHcpcs.get(e.hcpcs);
            const entryWarnings = warningsFor(e.clientId, warnings);
            const modifierPrompt = entryWarnings.find((w) => w.type === 'modifier_prompt');
            const notes = entryWarnings.filter((w) => w.type === 'not_exclusive_note');
            const otherWarnings = entryWarnings.filter((w) => w.type !== 'modifier_prompt' && w.type !== 'not_exclusive_note');
            const isExcluded = excludedFromBundle.has(e.clientId);
            const has25 = e.modifiers.split(',').map((m) => m.trim()).includes('25');

            return (
              <div className={`entry-row ${e.voided ? 'voided' : ''}`} key={e.clientId}>
                <div className="entry-main">
                  {code ? <CodeLabel code={code} component={e.component || undefined} /> : <span>{e.hcpcs}</span>}
                  {has25 && <span className="badge badge-mod">-25</span>}
                  {isExcluded && <span className="badge badge-excluded">excluded from bundled total</span>}
                  <span className="entry-rvu">{round1(e.qty * e.workRVU)} wRVU</span>
                </div>

                <div className="entry-controls">
                  <div className="qty-stepper">
                    <button onClick={() => onQtyChange(e.clientId, e.qty - 1)} disabled={e.qty <= 1} aria-label="Decrease quantity">
                      −
                    </button>
                    <span>{e.qty}</span>
                    <button onClick={() => onQtyChange(e.clientId, e.qty + 1)} aria-label="Increase quantity">
                      +
                    </button>
                  </div>
                  <button className="void-button" onClick={() => onVoid(e.clientId)}>
                    Void
                  </button>
                </div>

                {modifierPrompt && !has25 && (
                  <div className="rule-warning modifier-prompt">
                    <span>{modifierPrompt.message}</span>
                    <button className="btn btn-small" onClick={() => onAddModifier(e.clientId, '25')}>
                      Add -25
                    </button>
                  </div>
                )}

                {otherWarnings.map((w) => (
                  <div className={`rule-warning ${w.verified ? '' : 'unverified'}`} key={w.ruleId}>
                    {w.message}
                    {!w.verified && <span className="unverified-tag"> (unverified rule)</span>}
                  </div>
                ))}

                {notes.map((w) => (
                  <div className="rule-note" key={w.ruleId}>
                    ✓ {w.message}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
