/**
 * wRVU Tracker — Apps Script backend (Build Spec §3).
 *
 * Runs as the sheet owner, so the client never holds Google credentials.
 * A shared secret (kept ONLY in Script Properties — see setup() and the
 * README — never in the Settings sheet tab, so it can never leak through a
 * `getSettings`/`fetch` response) guards every write. That is a deliberate
 * tradeoff: it stops casual discovery, not a determined attacker, and is
 * acceptable only because this sheet holds no PHI (§1.2).
 *
 * Run `setup()` once from the Apps Script editor (Run > setup) after pasting
 * this file in, before deploying as a Web App.
 */

var LOG_SHEET = 'Log';
var CODES_SHEET = 'Codes';
var RULES_SHEET = 'Rules';
var SETTINGS_SHEET = 'Settings';

var LOG_HEADERS = ['clientId', 'date', 'hcpcs', 'component', 'modifiers', 'qty', 'workRVU', 'rvuSource', 'setting', 'caseId', 'createdAt', 'voided'];
var CODES_HEADERS = ['hcpcs', 'modifier', 'shortLabel', 'longDescriptor', 'synonyms', 'workRVU', 'statusCode', 'globalDays', 'category', 'favorite', 'trackable', 'defaultComponent'];
var RULES_HEADERS = ['id', 'type', 'codeA', 'codeB', 'message', 'verified', 'sourceNote'];
var SETTINGS_HEADERS = ['key', 'value'];

var DEFAULT_SETTINGS = {
  rvuSourceLabel: '',
  dailyTarget: '',
  annualTarget: '',
  defaultComponentPFT: '26',
  pftBillingModel: '',
};

/**
 * Seed rules mirror Build Spec §6 exactly, generated from the locked §5 code
 * list. All start verified=FALSE — see the README §6 reconciliation step.
 * Sentinels ANY_PROCEDURE / ANY_BRONCH_PRIMARY are interpreted client-side
 * (src/lib/rules.ts) rather than expanded into many literal rows here.
 */
var SEED_RULES = [
  { id: 'r1', type: 'mutually_exclusive', codeA: '31652', codeB: '31653', message: 'Report one or the other — station count determines which single code applies.', verified: false, sourceNote: 'Build Spec §6' },
  { id: 'r2', type: 'mutually_exclusive', codeA: '99406', codeB: '99407', message: 'Report one or the other — based on total counseling time (3–10 min vs >10 min).', verified: false, sourceNote: 'Build Spec §6' },
  { id: 'r3', type: 'conflict_same_target', codeA: '31629', codeB: '31652', message: 'TBNA (31629) may not be separately reportable if sampling the same nodal stations as EBUS-TBNA. Confirm it is a different target before billing both.', verified: false, sourceNote: 'Build Spec §6' },
  { id: 'r4', type: 'conflict_same_target', codeA: '31629', codeB: '31653', message: 'TBNA (31629) may not be separately reportable if sampling the same nodal stations as EBUS-TBNA. Confirm it is a different target before billing both.', verified: false, sourceNote: 'Build Spec §6' },
  { id: 'r5', type: 'add_on_requires', codeA: '31627', codeB: 'ANY_BRONCH_PRIMARY', message: '31627 (navigation) is an add-on and requires a primary bronchoscopy code in the same case.', verified: false, sourceNote: 'Build Spec §6' },
  { id: 'r6', type: 'add_on_requires', codeA: '31654', codeB: 'ANY_BRONCH_PRIMARY', message: '31654 (radial EBUS) is an add-on and requires a primary bronchoscopy code in the same case.', verified: false, sourceNote: 'Build Spec §6' },
  { id: 'r7', type: 'not_exclusive_note', codeA: '31654', codeB: '31652', message: 'Not a conflict: radial EBUS (31654) may be reported with linear EBUS in the same session for a genuinely separate peripheral target.', verified: false, sourceNote: 'Build Spec §6, corrected from an earlier draft' },
  { id: 'r8', type: 'not_exclusive_note', codeA: '31654', codeB: '31653', message: 'Not a conflict: radial EBUS (31654) may be reported with linear EBUS in the same session for a genuinely separate peripheral target.', verified: false, sourceNote: 'Build Spec §6, corrected from an earlier draft' },
  { id: 'r9', type: 'modifier_prompt', codeA: '99204,99205,99214,99215', codeB: 'ANY_PROCEDURE', message: 'Same-day E/M with a procedure — consider modifier -25 on the E/M code.', verified: false, sourceNote: 'Build Spec §5a' },
];

function doGet(e) {
  return jsonOutput({ status: 'ok', sheet: SpreadsheetApp.getActiveSpreadsheet().getName(), time: new Date().toISOString() });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput({ error: 'Invalid JSON body' });
  }

  var secret = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
  if (!secret || body.secret !== secret) {
    return jsonOutput({ error: 'Unauthorized' });
  }

  var action = body.action;
  var payload = body.payload || {};

  try {
    switch (action) {
      case 'append':
        return jsonOutput(handleAppend(payload));
      case 'update':
        return jsonOutput(handleUpdate(payload));
      case 'delete':
        return jsonOutput(handleDelete(payload));
      case 'fetch':
        return jsonOutput(handleFetch(payload));
      case 'codes':
        return jsonOutput(handleCodes());
      case 'rules':
        return jsonOutput(handleRules());
      case 'getSettings':
        return jsonOutput(handleGetSettings());
      case 'setSettings':
        return jsonOutput(handleSetSettings(payload));
      case 'updateRule':
        return jsonOutput(handleUpdateRule(payload));
      case 'setCodeDefaultComponent':
        return jsonOutput(handleSetCodeDefaultComponent(payload));
      case 'importCodes':
        return jsonOutput(handleImportCodes(payload));
      default:
        return jsonOutput({ error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return jsonOutput({ error: String(err) });
  }
}

// ---------- Log (append / update / delete / fetch) ----------

function handleAppend(payload) {
  var entries = payload.entries || [];
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getSheet(LOG_SHEET, LOG_HEADERS);
    var existingIds = readColumnAsSet(sheet, 'clientId', LOG_HEADERS);
    var accepted = 0;
    var skipped = 0;
    var rows = [];
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (existingIds[entry.clientId]) {
        skipped++;
        continue;
      }
      rows.push(LOG_HEADERS.map(function (h) {
        return entry[h] !== undefined ? entry[h] : '';
      }));
      existingIds[entry.clientId] = true;
      accepted++;
    }
    if (rows.length > 0) {
      var startRow = sheet.getLastRow() + 1;
      protectTextColumns(sheet, LOG_SHEET, LOG_HEADERS, startRow, rows.length);
      sheet.getRange(startRow, 1, rows.length, LOG_HEADERS.length).setValues(rows);
    }
    return { accepted: accepted, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}

function handleUpdate(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getSheet(LOG_SHEET, LOG_HEADERS);
    var rowIndex = findRowByColumnValue(sheet, 'clientId', payload.clientId, LOG_HEADERS);
    if (rowIndex === -1) throw new Error('Unknown clientId: ' + payload.clientId);
    var changes = payload.changes || {};
    if (changes.qty !== undefined) {
      setCell(sheet, rowIndex, 'qty', changes.qty, LOG_HEADERS);
    }
    if (changes.modifiers !== undefined) {
      setCell(sheet, rowIndex, 'modifiers', changes.modifiers, LOG_HEADERS);
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function handleDelete(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getSheet(LOG_SHEET, LOG_HEADERS);
    var rowIndex = findRowByColumnValue(sheet, 'clientId', payload.clientId, LOG_HEADERS);
    if (rowIndex === -1) throw new Error('Unknown clientId: ' + payload.clientId);
    setCell(sheet, rowIndex, 'voided', true, LOG_HEADERS);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function handleFetch(payload) {
  var sheet = getSheet(LOG_SHEET, LOG_HEADERS);
  var rows = readRows(sheet, LOG_HEADERS);
  return rows
    .map(function (r) {
      return {
        clientId: r.clientId,
        date: asDateText(r.date, 'yyyy-MM-dd'),
        hcpcs: asText(r.hcpcs),
        component: r.component,
        modifiers: r.modifiers,
        qty: Number(r.qty),
        workRVU: Number(r.workRVU),
        rvuSource: r.rvuSource,
        setting: r.setting,
        caseId: r.caseId,
        createdAt: asDateText(r.createdAt, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"),
        voided: false,
        _voidedRaw: r.voided,
      };
    })
    .filter(function (r) {
      if (r._voidedRaw === true || r._voidedRaw === 'TRUE') return false;
      if (payload.since && r.date < payload.since) return false;
      return true;
    })
    .map(function (r) {
      delete r._voidedRaw;
      return r;
    });
}

// ---------- Codes ----------

function handleCodes() {
  var sheet = getSheet(CODES_SHEET, CODES_HEADERS);
  return readRows(sheet, CODES_HEADERS).map(function (r) {
    return {
      hcpcs: asText(r.hcpcs),
      modifier: r.modifier,
      shortLabel: r.shortLabel,
      longDescriptor: r.longDescriptor,
      synonyms: r.synonyms,
      workRVU: r.workRVU === '' ? null : Number(r.workRVU),
      statusCode: r.statusCode,
      globalDays: asText(r.globalDays),
      category: r.category,
      favorite: r.favorite === true || r.favorite === 'TRUE',
      trackable: r.trackable === true || r.trackable === 'TRUE' || r.trackable === '',
      defaultComponent: r.defaultComponent,
    };
  });
}

function handleImportCodes(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var codes = payload.codes || [];
    var effectiveLabel = payload.effectiveLabel;
    var sheet = getSheet(CODES_SHEET, CODES_HEADERS);
    if (sheet.getLastRow() >= 2) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, CODES_HEADERS.length).clearContent();
    }
    var rows = codes.map(function (c) {
      return CODES_HEADERS.map(function (h) {
        return c[h] !== undefined ? c[h] : '';
      });
    });
    if (rows.length > 0) {
      protectTextColumns(sheet, CODES_SHEET, CODES_HEADERS, 2, rows.length);
      sheet.getRange(2, 1, rows.length, CODES_HEADERS.length).setValues(rows);
    }
    if (effectiveLabel) {
      setSetting('rvuSourceLabel', effectiveLabel);
    }
    return { ok: true, imported: rows.length };
  } finally {
    lock.releaseLock();
  }
}

function handleSetCodeDefaultComponent(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getSheet(CODES_SHEET, CODES_HEADERS);
    var rows = readRows(sheet, CODES_HEADERS);
    var colIndex = CODES_HEADERS.indexOf('defaultComponent') + 1;
    for (var i = 0; i < rows.length; i++) {
      if (asText(rows[i].hcpcs) === asText(payload.hcpcs)) {
        sheet.getRange(i + 2, colIndex).setValue(payload.defaultComponent);
      }
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ---------- Rules ----------

function handleRules() {
  var sheet = getSheet(RULES_SHEET, RULES_HEADERS);
  return readRows(sheet, RULES_HEADERS).map(function (r) {
    return {
      id: r.id,
      type: r.type,
      codeA: asText(r.codeA),
      codeB: asText(r.codeB),
      message: r.message,
      verified: r.verified === true || r.verified === 'TRUE',
      sourceNote: r.sourceNote,
    };
  });
}

function handleUpdateRule(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getSheet(RULES_SHEET, RULES_HEADERS);
    var rowIndex = findRowByColumnValue(sheet, 'id', payload.id, RULES_HEADERS);
    if (rowIndex === -1) throw new Error('Unknown rule id: ' + payload.id);
    setCell(sheet, rowIndex, 'verified', !!payload.verified, RULES_HEADERS);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ---------- Settings ----------

function handleGetSettings() {
  var sheet = getSheet(SETTINGS_SHEET, SETTINGS_HEADERS);
  var rows = readRows(sheet, SETTINGS_HEADERS);
  var settings = {};
  for (var key in DEFAULT_SETTINGS) settings[key] = DEFAULT_SETTINGS[key];
  rows.forEach(function (r) {
    settings[r.key] = r.value;
  });
  settings.dailyTarget = settings.dailyTarget === '' ? null : Number(settings.dailyTarget);
  settings.annualTarget = settings.annualTarget === '' ? null : Number(settings.annualTarget);
  return settings;
}

function handleSetSettings(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    for (var key in payload) {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) {
        setSetting(key, payload[key] === null || payload[key] === undefined ? '' : payload[key]);
      }
    }
    return handleGetSettings();
  } finally {
    lock.releaseLock();
  }
}

function setSetting(key, value) {
  var sheet = getSheet(SETTINGS_SHEET, SETTINGS_HEADERS);
  var rowIndex = findRowByColumnValue(sheet, 'key', key, SETTINGS_HEADERS);
  if (rowIndex === -1) {
    sheet.appendRow([key, value]);
  } else {
    setCell(sheet, rowIndex, 'value', value, SETTINGS_HEADERS);
  }
}

// ---------- Sheet helpers ----------

function getSheet(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  }
  return sheet;
}

function readRows(sheet, headers) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values
    .filter(function (row) {
      return row.some(function (cell) {
        return cell !== '';
      });
    })
    .map(function (row) {
      var obj = {};
      headers.forEach(function (h, i) {
        obj[h] = row[i];
      });
      return obj;
    });
}

function readColumnAsSet(sheet, columnName, headers) {
  var colIndex = headers.indexOf(columnName);
  var lastRow = sheet.getLastRow();
  var set = {};
  if (lastRow < 2) return set;
  var values = sheet.getRange(2, colIndex + 1, lastRow - 1, 1).getValues();
  values.forEach(function (row) {
    if (row[0] !== '') set[row[0]] = true;
  });
  return set;
}

function findRowByColumnValue(sheet, columnName, value, headers) {
  var colIndex = headers.indexOf(columnName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var values = sheet.getRange(2, colIndex + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === value) return i + 2; // 1-indexed sheet row
  }
  return -1;
}

function setCell(sheet, rowIndex, columnName, value, headers) {
  var colIndex = headers.indexOf(columnName);
  sheet.getRange(rowIndex, colIndex + 1).setValue(value);
}

/**
 * Google Sheets auto-detects cell content and silently rewrites numeric- or
 * date-looking strings into Number/Date cells on write (both via the UI and
 * via setValues from this script) — a HCPCS code like "99204" becomes the
 * NUMBER 99204, and a global-days value like "000" becomes the number 0,
 * losing its meaning. Setting the column's number format to "@" (Plain Text)
 * BEFORE writing into it stops that coercion, for this write and for any
 * later manual edit to those same cells. Must be called before every
 * setValues/appendRow into a column listed in TEXT_COLUMNS.
 */
var TEXT_COLUMNS = {};
TEXT_COLUMNS[LOG_SHEET] = ['hcpcs', 'date', 'createdAt'];
TEXT_COLUMNS[CODES_SHEET] = ['hcpcs', 'globalDays'];
TEXT_COLUMNS[RULES_SHEET] = ['codeA', 'codeB'];

function protectTextColumns(sheet, sheetName, headers, startRow, numRows) {
  if (numRows <= 0) return;
  var columnNames = TEXT_COLUMNS[sheetName];
  if (!columnNames) return;
  columnNames.forEach(function (columnName) {
    var colIndex = headers.indexOf(columnName);
    if (colIndex === -1) return;
    sheet.getRange(startRow, colIndex + 1, numRows, 1).setNumberFormat('@');
  });
}

/**
 * Coerces a value Sheets may have auto-typed as Number back to a plain string
 * (hcpcs, codeA/codeB, globalDays). protectTextColumns() should make this a
 * no-op for anything written after this fix landed — this only guards
 * already-existing rows or a future manual edit to an unformatted cell.
 */
function asText(value) {
  if (value === '' || value === null || value === undefined) return '';
  return String(value);
}

/** Same idea, but for the two date-shaped Log columns, which must never gain a Date object's default formatting. */
function asDateText(value, pattern) {
  if (value === '' || value === null || value === undefined) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), pattern);
  }
  return String(value);
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- One-time setup ----------

/**
 * Run this once from the Apps Script editor (Run > setup) after pasting this
 * file into a Google Sheet's Extensions > Apps Script editor, BEFORE
 * deploying as a Web App. Safe to re-run: never overwrites existing Log data,
 * and only seeds Rules if that tab is empty.
 */
function setup() {
  getSheet(LOG_SHEET, LOG_HEADERS);
  getSheet(CODES_SHEET, CODES_HEADERS);
  var rulesSheet = getSheet(RULES_SHEET, RULES_HEADERS);
  var settingsSheet = getSheet(SETTINGS_SHEET, SETTINGS_HEADERS);

  if (rulesSheet.getLastRow() < 2) {
    var rows = SEED_RULES.map(function (r) {
      return RULES_HEADERS.map(function (h) {
        return r[h];
      });
    });
    protectTextColumns(rulesSheet, RULES_SHEET, RULES_HEADERS, 2, rows.length);
    rulesSheet.getRange(2, 1, rows.length, RULES_HEADERS.length).setValues(rows);
  }

  if (settingsSheet.getLastRow() < 2) {
    var settingsRows = [];
    for (var key in DEFAULT_SETTINGS) {
      settingsRows.push([key, DEFAULT_SETTINGS[key]]);
    }
    settingsSheet.getRange(2, 1, settingsRows.length, 2).setValues(settingsRows);
  }

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SHARED_SECRET')) {
    Logger.log(
      'No SHARED_SECRET set yet. Go to Project Settings > Script Properties and add ' +
        'SHARED_SECRET with a long random value, then use the same value as VITE_SHARED_SECRET in the app.'
    );
  }

  Logger.log('Setup complete. Tabs: Log, Codes, Rules, Settings.');
}
