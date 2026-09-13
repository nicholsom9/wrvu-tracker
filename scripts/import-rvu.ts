/**
 * CMS PPRRVU importer (Build Spec §4).
 *
 * Work RVUs come from exactly one place: the CMS Physician Fee Schedule
 * Relative Value File (PPRRVU<YY>.csv), downloaded by the physician from
 * https://www.cms.gov/medicare/physician-fee-schedule/search — never from
 * model memory, coding blogs, or scraped AAPC/Codify content. This script
 * reads that file, matches it against the locked §5 code list, and pushes
 * the result to the Apps Script backend, which replaces the Codes sheet tab.
 *
 * Usage:
 *   npm run import-rvu -- --file /path/to/PPRRVU2026_Q3.csv --label "PPRRVU 2026 Q3"
 *
 * Requires VITE_APPS_SCRIPT_URL and VITE_SHARED_SECRET in the environment or
 * in a .env file at the repo root (the same values used to build the app) —
 * this script authenticates the same way the client does, over the same
 * Apps Script Web App, rather than using a separate Google Cloud credential.
 */
import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { CODE_SEED, type CodeSeed } from '../src/data/codeSeed';

interface Args {
  file: string;
  label: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const file = get('--file');
  const label = get('--label');
  if (!file || !label) {
    console.error('Usage: npm run import-rvu -- --file <PPRRVU csv path> --label "PPRRVU 2026 Q3"');
    console.error('The --label is not inferred from the filename — CMS filenames vary and guessing the quarter is exactly the kind of silent assumption this importer must not make.');
    process.exit(1);
  }
  return { file, label };
}

function loadEnvFile(): void {
  const path = new URL('../.env', import.meta.url);
  if (!existsSync(path)) return;
  const contents = readFileSync(path, 'utf-8');
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

// Candidate header names CMS has used for these columns across annual PPRRVU
// releases; matched case-insensitively so a year with slightly different
// header text still resolves instead of silently misreading a column.
const HEADER_CANDIDATES: Record<string, string[]> = {
  hcpcs: ['HCPCS'],
  modifier: ['MOD', 'MODIFIER'],
  description: ['DESCRIPTION', 'SHORT DESCRIPTION'],
  workRvu: ['WORK RVU'],
  statusCode: ['STATUS CODE', 'STATUS'],
  globalDays: ['GLOB DAYS', 'GLOBAL DAYS', 'GLOB'],
};

function findHeaderIndex(headerRow: string[], candidates: string[]): number {
  const normalized = headerRow.map((h) => h.trim().toUpperCase());
  for (const candidate of candidates) {
    const idx = normalized.indexOf(candidate.toUpperCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

interface PprrvuRow {
  hcpcs: string;
  modifier: string;
  description: string;
  workRvu: string;
  statusCode: string;
  globalDays: string;
}

function parsePprrvu(csvText: string): PprrvuRow[] {
  // CMS PPRRVU files carry a title/preamble before the real header, AND the
  // real header itself is word-wrapped across multiple stacked rows (e.g.
  // "STATUS" on one row directly above "CODE" on the next, together meaning
  // "STATUS CODE"). Find the row containing the literal "HCPCS" cell, then
  // merge it with the row(s) above it column-by-column to reconstruct full
  // column names before matching — reading only the "HCPCS" row in isolation
  // would see just "CODE", "RVU", "DAYS" and fail to find WORK RVU/STATUS
  // CODE/GLOB DAYS at all.
  const rawRecords: string[][] = parse(csvText, { skip_empty_lines: true, relax_column_count: true });
  const headerRowIdx = rawRecords.findIndex((row) => row.some((cell) => cell.trim().toUpperCase() === 'HCPCS'));
  if (headerRowIdx === -1) {
    throw new Error('Could not find a header row containing "HCPCS" in the CSV. Is this really a PPRRVU file?');
  }
  const STACKED_HEADER_ROWS = 3;
  const firstStackedRow = Math.max(0, headerRowIdx - STACKED_HEADER_ROWS);
  const stackedRows = rawRecords.slice(firstStackedRow, headerRowIdx + 1);
  const width = Math.max(...stackedRows.map((r) => r.length));
  const headerRow: string[] = [];
  for (let col = 0; col < width; col++) {
    headerRow.push(
      stackedRows
        .map((row) => (row[col] ?? '').trim())
        .filter(Boolean)
        .join(' ')
    );
  }

  const colIndex: Record<string, number> = {};
  for (const [field, candidates] of Object.entries(HEADER_CANDIDATES)) {
    const idx = findHeaderIndex(headerRow, candidates);
    if (idx === -1) {
      throw new Error(`Could not find a column for "${field}" (looked for: ${candidates.join(', ')}). Reconstructed header row was: ${headerRow.join(' | ')}`);
    }
    colIndex[field] = idx;
  }

  const dataRows = rawRecords.slice(headerRowIdx + 1);
  return dataRows
    .filter((row) => row[colIndex.hcpcs] && row[colIndex.hcpcs].trim() !== '')
    .map((row) => ({
      hcpcs: row[colIndex.hcpcs].trim(),
      modifier: (row[colIndex.modifier] || '').trim().toUpperCase(),
      description: (row[colIndex.description] || '').trim(),
      workRvu: (row[colIndex.workRvu] || '').trim(),
      statusCode: (row[colIndex.statusCode] || '').trim(),
      globalDays: (row[colIndex.globalDays] || '').trim(),
    }));
}

function findMatch(rows: PprrvuRow[], hcpcs: string, modifier: string): PprrvuRow | undefined {
  return rows.find((r) => r.hcpcs === hcpcs && r.modifier === modifier);
}

async function main() {
  loadEnvFile();
  const { file, label } = parseArgs();
  const appsScriptUrl = process.env.VITE_APPS_SCRIPT_URL;
  const sharedSecret = process.env.VITE_SHARED_SECRET;
  if (!appsScriptUrl || !sharedSecret) {
    console.error('Missing VITE_APPS_SCRIPT_URL / VITE_SHARED_SECRET. Set them in the environment or in a .env file at the repo root.');
    process.exit(1);
  }

  const csvText = readFileSync(file, 'utf-8');
  const pprrvuRows = parsePprrvu(csvText);
  console.log(`Parsed ${pprrvuRows.length} rows from ${file}.`);

  const missing: string[] = [];
  const codes = CODE_SEED.map((seed: CodeSeed) => {
    const match = findMatch(pprrvuRows, seed.hcpcs, seed.modifier);
    if (!match) {
      missing.push(`${seed.hcpcs}${seed.modifier ? '-' + seed.modifier : ''} (${seed.shortLabel})`);
      return null;
    }
    return {
      hcpcs: seed.hcpcs,
      modifier: seed.modifier,
      shortLabel: seed.shortLabel,
      longDescriptor: match.description,
      synonyms: seed.synonyms,
      workRVU: match.workRvu === '' ? '' : Number(match.workRvu),
      statusCode: match.statusCode,
      globalDays: match.globalDays,
      category: seed.category,
      favorite: seed.favorite,
      trackable: true,
      defaultComponent: seed.defaultComponent,
    };
  }).filter((c): c is NonNullable<typeof c> => c !== null);

  if (missing.length > 0) {
    console.warn('\nThe following codes from the locked §5 list were NOT found in this PPRRVU file (§4 item 5):');
    for (const m of missing) console.warn(`  - ${m}`);
    console.warn('These will be absent from the Codes tab until a file that includes them is imported.\n');
  }

  console.log(`Uploading ${codes.length} code rows to the Apps Script backend as "${label}"...`);
  const res = await fetch(appsScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secret: sharedSecret, action: 'importCodes', payload: { codes, effectiveLabel: label } }),
  });
  const json = await res.json();
  if (json.error) {
    console.error('Import failed:', json.error);
    process.exit(1);
  }
  console.log(`Done. Imported ${json.imported} rows. RVU source is now "${label}".`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
