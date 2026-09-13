import type { CodeRow, LogEntry, RuleRow, RuleWarning } from '../types';
import { BRONCH_PRIMARY_CODES, PROCEDURE_TRIGGER_CATEGORIES } from '../data/codeSeed';

/** Sentinel values used in seeded Rules-tab rows instead of a literal second code. */
const SENTINEL_ANY_PROCEDURE = 'ANY_PROCEDURE';
const SENTINEL_ANY_BRONCH_PRIMARY = 'ANY_BRONCH_PRIMARY';

function groupKey(e: LogEntry): string {
  return `${e.date}::${e.caseId || '__default__'}`;
}

export interface BundledResult {
  warnings: RuleWarning[];
  /** clientIds of entries excluded from the "after bundling" total by a fired mutually_exclusive rule. */
  excludedFromBundle: Set<string>;
}

/**
 * Evaluate the seeded Rules tab against one day's (or one case's) entries.
 * Mirrors Build Spec §6: rules flag, they never silently decide for the user.
 * Only `mutually_exclusive` changes the "after bundling" total; every other
 * rule type is advisory only (§5a, §6 `conflict_same_target`).
 */
export function evaluateRules(
  entries: LogEntry[],
  rules: RuleRow[],
  codesByHcpcs: Map<string, CodeRow>
): BundledResult {
  const warnings: RuleWarning[] = [];
  const excludedFromBundle = new Set<string>();

  const groups = new Map<string, LogEntry[]>();
  for (const e of entries) {
    if (e.voided) continue;
    const key = groupKey(e);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  for (const group of groups.values()) {
    const byCode = new Map<string, LogEntry[]>();
    for (const e of group) {
      if (!byCode.has(e.hcpcs)) byCode.set(e.hcpcs, []);
      byCode.get(e.hcpcs)!.push(e);
    }
    const codesPresent = new Set(byCode.keys());

    for (const rule of rules) {
      if (rule.type === 'not_exclusive_note') {
        // Not a conflict — surfaced as a reassuring note (not counted as "flagged")
        // so the physician can see the app deliberately considered this pairing.
        if (codesPresent.has(rule.codeA) && codesPresent.has(rule.codeB)) {
          const involved = [...byCode.get(rule.codeA)!, ...byCode.get(rule.codeB)!];
          warnings.push(makeWarning(rule, involved));
        }
        continue;
      }

      if (rule.type === 'mutually_exclusive') {
        if (codesPresent.has(rule.codeA) && codesPresent.has(rule.codeB)) {
          const involved = [...byCode.get(rule.codeA)!, ...byCode.get(rule.codeB)!];
          warnings.push(makeWarning(rule, involved));
          // Keep the earliest-logged entry of the conflicting pair in the bundled
          // total; exclude the rest. The physician can override by voiding/editing.
          const sorted = [...involved].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          for (const e of sorted.slice(1)) excludedFromBundle.add(e.clientId);
        }
        continue;
      }

      if (rule.type === 'conflict_same_target') {
        if (codesPresent.has(rule.codeA) && codesPresent.has(rule.codeB)) {
          const involved = [...byCode.get(rule.codeA)!, ...byCode.get(rule.codeB)!];
          warnings.push(makeWarning(rule, involved));
        }
        continue;
      }

      if (rule.type === 'add_on_requires') {
        if (!codesPresent.has(rule.codeA)) continue;
        const requiresAnyBronchPrimary = rule.codeB === SENTINEL_ANY_BRONCH_PRIMARY;
        const satisfied = requiresAnyBronchPrimary
          ? BRONCH_PRIMARY_CODES.some((c) => codesPresent.has(c))
          : codesPresent.has(rule.codeB);
        if (!satisfied) {
          warnings.push(makeWarning(rule, byCode.get(rule.codeA)!));
        }
        continue;
      }

      if (rule.type === 'modifier_prompt') {
        const emCodes = rule.codeA.split(',').map((c) => c.trim()).filter(Boolean);
        const emEntriesPresent = group.filter((e) => emCodes.includes(e.hcpcs));
        if (emEntriesPresent.length === 0) continue;
        const hasProcedureSameDay =
          rule.codeB === SENTINEL_ANY_PROCEDURE
            ? group.some((e) => {
                const code = codesByHcpcs.get(e.hcpcs);
                return code ? PROCEDURE_TRIGGER_CATEGORIES.includes(code.category) : false;
              })
            : codesPresent.has(rule.codeB);
        if (hasProcedureSameDay) {
          warnings.push(makeWarning(rule, emEntriesPresent));
        }
      }
    }
  }

  return { warnings, excludedFromBundle };
}

function makeWarning(rule: RuleRow, involved: LogEntry[]): RuleWarning {
  return {
    ruleId: rule.id,
    type: rule.type,
    message: rule.message,
    entryClientIds: involved.map((e) => e.clientId),
    sourceNote: rule.sourceNote,
    verified: rule.verified,
  };
}

/** Sum qty * workRVU for non-voided entries, optionally excluding a set of clientIds. */
export function sumRvu(entries: LogEntry[], exclude?: Set<string>): number {
  return entries
    .filter((e) => !e.voided && !(exclude && exclude.has(e.clientId)))
    .reduce((total, e) => total + e.qty * e.workRVU, 0);
}
