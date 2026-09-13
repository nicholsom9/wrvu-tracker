export type Component = '' | '26' | 'TC';

export type Setting = 'office' | 'inpatient' | 'procedure';

export type RuleType =
  | 'mutually_exclusive'
  | 'conflict_same_target'
  | 'add_on_requires'
  | 'not_exclusive_note'
  | 'modifier_prompt';

/** One row of the `Codes` sheet tab. workRVU is populated only after a CMS PPRRVU import (§4). */
export interface CodeRow {
  hcpcs: string;
  modifier: Component;
  shortLabel: string;
  longDescriptor: string;
  synonyms: string;
  workRVU: number | null;
  statusCode: string;
  globalDays: string;
  category: string;
  favorite: boolean;
  trackable: boolean;
  defaultComponent: Component;
}

/** One row of the `Log` sheet tab (§7). */
export interface LogEntry {
  clientId: string;
  date: string;
  hcpcs: string;
  component: Component;
  modifiers: string;
  qty: number;
  workRVU: number;
  rvuSource: string;
  setting: Setting;
  caseId: string;
  createdAt: string;
  voided: boolean;
}

/** One row of the `Rules` sheet tab (§6). */
export interface RuleRow {
  id: string;
  type: RuleType;
  codeA: string;
  codeB: string;
  message: string;
  verified: boolean;
  sourceNote: string;
}

export interface AppSettings {
  rvuSourceLabel: string;
  dailyTarget: number | null;
  annualTarget: number | null;
  defaultComponentPFT: Component;
  pftBillingModel: 'professional' | 'global' | '';
}

export interface RuleWarning {
  ruleId: string;
  type: RuleType;
  message: string;
  entryClientIds: string[];
  sourceNote: string;
  verified: boolean;
}

export interface QueuedOp {
  opId: string;
  kind: 'append' | 'update' | 'delete';
  payload: unknown;
  attempts: number;
  createdAt: string;
}
