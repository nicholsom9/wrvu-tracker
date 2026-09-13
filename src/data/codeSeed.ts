/**
 * The locked v1 code set (Build Spec §5). This is metadata only — abbreviation,
 * category, search synonyms, and PC/TC shape. NO work RVU values live here.
 * RVU values come exclusively from a CMS PPRRVU import into the `Codes` sheet
 * tab at runtime (§4). Do not add work RVU numbers to this file.
 *
 * PFT codes (94010/94727/94729/95012) get two seed rows each — Professional (26)
 * and Global — per §4.1. The import script fills in workRVU for whichever
 * modifier rows exist in the downloaded PPRRVU file.
 */
export interface CodeSeed {
  hcpcs: string;
  modifier: '' | '26' | 'TC';
  shortLabel: string;
  category: string;
  synonyms: string;
  favorite: boolean;
  defaultComponent: '' | '26' | 'TC';
  hasPcTcSplit: boolean;
}

const PFT_SYNONYMS = 'pft pulmonary function test';

/**
 * PFT codes carry a PC/TC split (§4.1): the Codes tab needs a Professional (26),
 * Technical (TC), and Global row for each, so the Settings-tab component
 * switcher has all three to choose from. Confirmed default is Professional (26).
 */
function pftRows(hcpcs: string, shortLabel: string, synonyms: string, favorite: boolean): CodeSeed[] {
  const base = { hcpcs, shortLabel, category: 'Outpatient Procedures', synonyms: `${synonyms} ${PFT_SYNONYMS}`, favorite, defaultComponent: '26' as const, hasPcTcSplit: true };
  return [
    { ...base, modifier: '26' },
    { ...base, modifier: 'TC' },
    { ...base, modifier: '' },
  ];
}

export const CODE_SEED: CodeSeed[] = [
  // Outpatient Visits
  { hcpcs: '99204', modifier: '', shortLabel: 'New-Mod', category: 'Outpatient Visits', synonyms: 'new patient moderate office visit em', favorite: true, defaultComponent: '', hasPcTcSplit: false },
  { hcpcs: '99205', modifier: '', shortLabel: 'New-Hi', category: 'Outpatient Visits', synonyms: 'new patient high office visit em', favorite: false, defaultComponent: '', hasPcTcSplit: false },
  { hcpcs: '99214', modifier: '', shortLabel: 'Est-Mod', category: 'Outpatient Visits', synonyms: 'established patient moderate office visit em followup', favorite: true, defaultComponent: '', hasPcTcSplit: false },
  { hcpcs: '99215', modifier: '', shortLabel: 'Est-Hi', category: 'Outpatient Visits', synonyms: 'established patient high office visit em followup', favorite: true, defaultComponent: '', hasPcTcSplit: false },

  // Outpatient Procedures (PFTs carry a PC/TC split — §4.1)
  ...pftRows('94010', 'Spiro', 'spirometry', true),
  ...pftRows('94727', 'LungVol', 'lung volumes gas dilution washout', true),
  ...pftRows('94729', 'DLCO', 'dlco diffusing capacity', true),
  ...pftRows('95012', 'NIOX', 'exhaled nitric oxide feno niox', false),
  { hcpcs: '99406', modifier: '', shortLabel: 'SmkCes-S', category: 'Outpatient Procedures', synonyms: 'smoking cessation counseling short tobacco', favorite: false, defaultComponent: '', hasPcTcSplit: false },
  { hcpcs: '99407', modifier: '', shortLabel: 'SmkCes-L', category: 'Outpatient Procedures', synonyms: 'smoking cessation counseling long tobacco', favorite: false, defaultComponent: '', hasPcTcSplit: false },

  // Inpatient Visits
  { hcpcs: '99222', modifier: '', shortLabel: 'InitH-Mod', category: 'Inpatient Visits', synonyms: 'initial hospital care moderate admit', favorite: false, defaultComponent: '', hasPcTcSplit: false },
  { hcpcs: '99223', modifier: '', shortLabel: 'InitH-Hi', category: 'Inpatient Visits', synonyms: 'initial hospital care high admit', favorite: true, defaultComponent: '', hasPcTcSplit: false },
  { hcpcs: '99232', modifier: '', shortLabel: 'SubH-Mod', category: 'Inpatient Visits', synonyms: 'subsequent hospital care moderate rounding', favorite: true, defaultComponent: '', hasPcTcSplit: false },
  { hcpcs: '99233', modifier: '', shortLabel: 'SubH-Hi', category: 'Inpatient Visits', synonyms: 'subsequent hospital care high rounding', favorite: true, defaultComponent: '', hasPcTcSplit: false },
  { hcpcs: '99239', modifier: '', shortLabel: 'Disch', category: 'Inpatient Visits', synonyms: 'hospital discharge day management', favorite: false, defaultComponent: '', hasPcTcSplit: false },
  { hcpcs: '99291', modifier: '', shortLabel: 'CritCare', category: 'Inpatient Visits', synonyms: 'critical care first 30 74 min', favorite: false, defaultComponent: '', hasPcTcSplit: false },

  // Critical Care / Bedside Procedures
  { hcpcs: '31500', modifier: '', shortLabel: 'Intub', category: 'Critical Care / Bedside Procedures', synonyms: 'emergency endotracheal intubation airway', favorite: false, defaultComponent: '', hasPcTcSplit: false },
  { hcpcs: '32555', modifier: '', shortLabel: 'Thora', category: 'Critical Care / Bedside Procedures', synonyms: 'thoracentesis imaging guidance', favorite: true, defaultComponent: '', hasPcTcSplit: false },
  { hcpcs: '32557', modifier: '', shortLabel: 'PigCath', category: 'Critical Care / Bedside Procedures', synonyms: 'percutaneous pleural drainage catheter pigtail imaging', favorite: false, defaultComponent: '', hasPcTcSplit: false },
  { hcpcs: '36556', modifier: '', shortLabel: 'CVC', category: 'Critical Care / Bedside Procedures', synonyms: 'central venous catheter non-tunneled line', favorite: false, defaultComponent: '', hasPcTcSplit: false },
  { hcpcs: '36620', modifier: '', shortLabel: 'ArtLine', category: 'Critical Care / Bedside Procedures', synonyms: 'arterial line catheter placement', favorite: false, defaultComponent: '', hasPcTcSplit: false },
  { hcpcs: '49083', modifier: '', shortLabel: 'Paracen', category: 'Critical Care / Bedside Procedures', synonyms: 'paracentesis imaging guidance', favorite: false, defaultComponent: '', hasPcTcSplit: false },

  // Bronchoscopy
  { hcpcs: '31623', modifier: '', shortLabel: 'Brush', category: 'Bronchoscopy', synonyms: 'bronchoscopy brushing protected brushings', favorite: false, defaultComponent: '', hasPcTcSplit: false },
  { hcpcs: '31624', modifier: '', shortLabel: 'BAL', category: 'Bronchoscopy', synonyms: 'bronchoscopy bronchoalveolar lavage', favorite: true, defaultComponent: '', hasPcTcSplit: false },
  { hcpcs: '31627', modifier: '', shortLabel: 'Nav', category: 'Bronchoscopy', synonyms: 'computer assisted navigation bronchoscopy add-on', favorite: false, defaultComponent: '', hasPcTcSplit: false },
  { hcpcs: '31628', modifier: '', shortLabel: 'TBLB', category: 'Bronchoscopy', synonyms: 'transbronchial lung biopsy single lobe', favorite: true, defaultComponent: '', hasPcTcSplit: false },
  { hcpcs: '31629', modifier: '', shortLabel: 'TBNA', category: 'Bronchoscopy', synonyms: 'transbronchial needle aspiration no ebus', favorite: false, defaultComponent: '', hasPcTcSplit: false },
  { hcpcs: '31652', modifier: '', shortLabel: 'EBUS1-2', category: 'Bronchoscopy', synonyms: 'linear ebus tbna 1-2 node stations', favorite: true, defaultComponent: '', hasPcTcSplit: false },
  { hcpcs: '31653', modifier: '', shortLabel: 'EBUS3+', category: 'Bronchoscopy', synonyms: 'linear ebus tbna 3+ node stations', favorite: true, defaultComponent: '', hasPcTcSplit: false },
  { hcpcs: '31654', modifier: '', shortLabel: 'RadEBUS', category: 'Bronchoscopy', synonyms: 'radial ebus peripheral lesion add-on nav', favorite: false, defaultComponent: '', hasPcTcSplit: false },
];

/** Codes that carry a same-day "-25" E/M modifier prompt (Build Spec §5a). */
export const EM_CODES = ['99204', '99205', '99214', '99215'];

/** Codes counted as "the procedure" side of the -25 same-day pairing check. */
export const PROCEDURE_TRIGGER_CATEGORIES = ['Outpatient Procedures', 'Bronchoscopy'];

/** Primary (non-add-on) bronchoscopy codes, used by `add_on_requires` rules. */
export const BRONCH_PRIMARY_CODES = ['31623', '31624', '31628', '31629', '31652', '31653'];
