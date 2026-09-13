# wRVU Tracker — Build Specification

**For:** Claude Code
**Goal:** A self-hosted, mobile-first daily wRVU logging app for a single pulmonary/interventional pulmonology physician, backed by Google Sheets, deployable to free static hosting, with no ongoing subscription dependency.

Read this whole document before writing code. Sections marked **CRITICAL** describe correctness requirements that a naive implementation will get wrong.

---

## 1. Non-negotiable constraints

1. **No hardcoded work RVU values.** See §4. This is the single most important requirement.
2. **No PHI.** The app stores counts of CPT codes by date. It must never accept or store patient names, MRNs, DOBs, accession numbers, or free-text notes that could contain them. There is no notes field. This constraint is what makes a lightweight backend acceptable.
3. **No credentials in client-side code that grant write access to anything beyond this one sheet.** See §3.
4. **Must work with intermittent connectivity.** The user logs from a phone inside a hospital. Writes queue locally and sync when a connection returns.
5. **Must survive browser cache clearing.** Local storage is a cache, not the database. The sheet is the database.

---

## 2. Architecture

```
iPhone Safari (home screen PWA)
  └── static React app  ──HTTPS POST/GET──▶  Google Apps Script Web App
        (GitHub Pages)                          (bound to the user's Sheet)
        IndexedDB write queue                        │
                                                     ▼
                                            Google Sheet ("wRVU Log")
```

### Why Apps Script and not the Sheets REST API

**CRITICAL — do not use a Google Sheets API key.** Sheets API keys grant *read-only* access to public sheets. They cannot write. Writing via the REST API requires OAuth2 or a service account, and neither can be done safely from a static site with no backend: a service account JSON key committed to a GitHub Pages repo is world-readable, and full OAuth for a single-user personal app is disproportionate setup.

A Google Apps Script Web App solves this cleanly:
- It runs as the sheet owner, so it needs no credentials on the client.
- It is free, has no project quota setup, and requires no Google Cloud Console project.
- Deploy once, get a stable `https://script.google.com/macros/s/…/exec` URL.

Guard it with a shared secret in the request body. Note honestly in the README that this secret is visible in the client bundle and therefore protects against casual discovery, not a determined attacker — which is acceptable **only because the sheet contains no PHI** (constraint §1.2). State this tradeoff in the README rather than implying the endpoint is secure.

### Stack

- Vite + React + TypeScript
- No UI framework; hand-rolled CSS. Small bundle, no build surprises.
- `idb-keyval` or raw IndexedDB for the offline queue
- Deploy target: GitHub Pages via `gh-pages` branch or Actions workflow
- Set `base` in `vite.config.ts` to the repo name so asset paths resolve on Pages

---

## 3. Backend: Apps Script

Write `apps-script/Code.gs` and include it in the repo for the user to paste into the sheet's Apps Script editor.

### Endpoints

`doPost(e)` handling a JSON body with `{ secret, action, payload }`:

| action | payload | behavior |
|---|---|---|
| `append` | `{ entries: Entry[] }` | Append rows to `Log`. Idempotent on `clientId` — skip any `clientId` already present. Returns accepted/skipped counts. |
| `delete` | `{ clientId }` | Soft-delete: set `Voided` column to `TRUE`. Never hard-delete rows. |
| `fetch` | `{ since?: "YYYY-MM-DD" }` | Return non-voided rows, optionally filtered by date. |
| `codes` | `{}` | Return the full contents of the `Codes` tab. |

`doGet(e)` returns a health-check JSON so the user can confirm deployment worked by opening the URL in a browser.

**Idempotency is critical** because the offline queue will retry. Every entry carries a client-generated UUID (`clientId`); the append handler must treat it as a unique key. Without this, a flaky hospital connection produces duplicate wRVUs.

Use `LockService.getScriptLock()` around writes to avoid interleaved appends.

---

## 4. CRITICAL — the RVU values problem

The user previously received a code list with work RVU values that were generated from model memory. **Several were wrong, and the values as a group were unverified and in some cases stale.** Do not repeat this. Do not populate work RVU values from your own knowledge, and do not fetch them from coding blogs, specialty society summaries, or AAPC/Codify scraped content.

### Required approach

Work RVUs come from one authoritative source: the **CMS Physician Fee Schedule Relative Value Files** (the `PPRRVU<YY>.csv` inside the annual RVU release, published quarterly by CMS). It is free and public.

Build an **importer**, not a hardcoded table:

1. A `scripts/import-rvu.ts` Node script that takes a path to a downloaded `PPRRVU` CSV.
2. It filters to the HCPCS codes listed in §5 and writes them to the `Codes` tab of the sheet.
3. It captures, per code: `hcpcs`, `modifier` (blank / `26` / `TC`), `description`, `workRVU`, `status_code`, `global_days`, and the `PPRRVU` file's effective year/quarter.
4. Rows with modifier `26` and `TC` must be preserved as **separate rows**, not collapsed. See §4.1.
5. If a code in §5 is absent from the file, the script reports it rather than silently omitting it.

The app reads values from the `Codes` tab at runtime. A `Source` cell on the `Settings` tab displays which PPRRVU release is loaded, and the UI shows this in a footer, e.g. `RVU source: PPRRVU 2026 Q3`. When the loaded file is more than one quarter old, show a non-blocking banner prompting a re-import.

### 4.1 Professional vs technical component — CRITICAL

For in-office diagnostic tests (pulmonary function testing especially), the physician's personal work is the **professional component (modifier 26)** only. The global (unmodified) value includes practice expense for owning and running the equipment, which accrues to the practice, not to the physician's personal production credit.

The app must therefore:
- Store `26`, `TC`, and global rows separately for every code that has a PC/TC split.
- Let the user set a per-code default of `Professional (26)` / `Technical (TC)` / `Global` in a settings screen.
- Default PFT codes to `Professional (26)`.
- Show the selected component on each logged entry and in the CSV export.

Add a first-run prompt: *"For in-office tests, does your group bill globally or do you bill the professional component only? This changes which wRVU is credited to you."* Do not guess on the user's behalf.

### 4.2 Display honesty

Anywhere a wRVU total is shown, it is an estimate of *work* RVUs based on the loaded CMS file and the codes the user tapped. It is not a billing submission, not a claim, and not reconciled against what was actually coded and paid. Put a one-line disclaimer in the Stats tab footer. The user should reconcile against their group's actual production reports periodically.

---

## 5. Code set — FINAL, LOCKED

This is the complete and only code list for v1. It is shorter than earlier drafts of this spec on purpose: it is exactly what the physician confirmed he uses, not a speculative superset. **Do not add codes beyond this list without the user explicitly asking.** No RVU values are given here — those come from the CMS import per §4.

**Every code requires a short `abbrev` field (≤ 4 characters where possible, e.g. `OV4`, `EBUS1-2`, `TBLB`) shown directly next to the code number everywhere it appears** — favorites row, search results, today's entry list, history, and CSV export. The user does not have the CPT numbers memorized; the abbreviation is not a nice-to-have, it's the primary way he'll recognize a code at a glance. Pull the long descriptor from the PPRRVU import for a detail view/tooltip, but the abbreviation is what's on screen by default.

### Category: Outpatient Visits

| Code | Abbrev | Description |
|---|---|---|
| 99204 | New-Mod | New patient office visit, moderate complexity |
| 99205 | New-Hi | New patient office visit, high complexity |
| 99214 | Est-Mod | Established patient office visit, moderate complexity |
| 99215 | Est-Hi | Established patient office visit, high complexity |

### Category: Outpatient Procedures

| Code | Abbrev | Description |
|---|---|---|
| 94010 | Spiro | Spirometry |
| 94727 | LungVol | Lung volumes, gas dilution/washout method |
| 94729 | DLCO | Diffusing capacity |
| 95012 | NIOX | Exhaled nitric oxide measurement |
| 99406 | SmkCes-S | Smoking cessation counseling, 3–10 min |
| 99407 | SmkCes-L | Smoking cessation counseling, >10 min |

All PFT codes here (94010, 94727, 94729, 95012) carry a PC/TC split — see §4.1. Confirmed default: **Professional (26)**, since the user bills these with modifier -25 on the same-day office visit rather than owning the technical/equipment side personally. See §5a for how -25 attaches.

### Category: Inpatient Visits

| Code | Abbrev | Description |
|---|---|---|
| 99222 | InitH-Mod | Initial hospital care, moderate complexity |
| 99223 | InitH-Hi | Initial hospital care, high complexity |
| 99232 | SubH-Mod | Subsequent hospital care, moderate complexity |
| 99233 | SubH-Hi | Subsequent hospital care, high complexity |
| 99239 | Disch | Hospital discharge day management, >30 min |
| 99291 | CritCare | Critical care, first 30–74 min |

### Category: Critical Care / Bedside Procedures

| Code | Abbrev | Description |
|---|---|---|
| 31500 | Intub | Emergency endotracheal intubation |
| 32555 | Thora | Thoracentesis, with imaging guidance |
| 32557 | PigCath | Percutaneous pleural drainage catheter insertion, with imaging guidance |
| 36556 | CVC | Insertion of non-tunneled central venous catheter |
| 36620 | ArtLine | Arterial catheter placement |
| 49083 | Paracen | Paracentesis, with imaging guidance |

Confirmed: **32550 is explicitly excluded** — the user does not place tunneled pleural catheters, only 32557 (percutaneous drainage catheter). Do not add 32550 back.

### Category: Bronchoscopy

| Code | Abbrev | Description |
|---|---|---|
| 31623 | Brush | Bronchoscopy with brushing/protected brushings |
| 31624 | BAL | Bronchoscopy with BAL |
| 31627 | Nav | + computer-assisted navigation (add-on) |
| 31628 | TBLB | Transbronchial lung biopsy, single lobe |
| 31629 | TBNA | Transbronchial needle aspiration, no EBUS |
| 31652 | EBUS1-2 | Linear EBUS-TBNA, 1–2 node stations |
| 31653 | EBUS3+ | Linear EBUS-TBNA, 3+ node stations |
| 31654 | RadEBUS | Radial EBUS, peripheral lesion (add-on) |

Confirmed exclusions from earlier drafts: **31622, 31625, 31626, 31632, 31633, 31660, 31661, 87811 are all explicitly out of scope.** Do not reintroduce them speculatively; if the user later performs one of these, he will say so.

### 5a. The -25 modifier — how it actually works in this app

**The modifier attaches to the E/M code, not the procedure, and it does not change any wRVU value.** It is a billing correctness flag: "this visit was significant and separately identifiable from the procedure performed the same day." Do not let it affect the day total math anywhere.

Behavior:
1. When an entry from **Outpatient Visits** and an entry from **Outpatient Procedures** (or Bronchoscopy) share the same `date` and the same `caseId`/session, show an inline prompt on the E/M entry: *"Add -25 modifier?"*
2. On confirmation, append `25` to that entry's `modifiers` field (§7, `Log` sheet) and render a small `-25` badge next to the E/M entry in the Log and History tabs.
3. This is a suggestion, not automatic — the physician confirms it, since not every same-day pairing warrants -25 (e.g. if the procedure was the sole reason for the visit).
4. Include the modifier in the CSV export column so the exported record matches what should have gone to billing.

This is the same rule-engine mechanism as §6's bundling warnings (`modifier_prompt` type) — implement it as one more seeded rule (`99204/99205/99214/99215` + any Outpatient Procedure or Bronchoscopy code, same day → prompt `-25`), not a special case.

---

## 6. CRITICAL — bundling and exclusivity rules

An earlier prototype let the user tap any combination of codes and summed them. For bronchoscopy this produces numbers that are not billable. Example of a bad output that must not be reproducible: 31622 + 31652 + 31653 + 31624 summed as a single case total.

Implement a rule engine driven by a `Rules` tab so rules can be corrected without a redeploy.

### Rule types to support, seeded against the §5 final code list only

| Type | Meaning | Examples to seed |
|---|---|---|
| `mutually_exclusive` | Report one or the other, never both | **31652 XOR 31653** (station count determines which single code applies); **99406 XOR 99407** |
| `conflict_same_target` | Two codes conflict only if aimed at the same lesion/target — flag for the user to confirm, don't assume | **31629 vs 31652/31653** — TBNA without EBUS is not separately reportable if it's sampling the *same* nodal stations already captured by 31652/31653; it *is* separately reportable if it's a different target the same session. Ask, don't auto-bundle. |
| `add_on_requires` | Add-on code requires a listed primary in the same session/case | 31627 (navigation) requires a primary bronchoscopy code in the same case; 31654 (radial EBUS) requires a primary bronchoscopy code in the same case |
| `not_exclusive_note` | Explicitly NOT a conflict — worth noting so the app doesn't wrongly flag it | **31654 is compatible with 31652/31653 in the same session** when it's sampling a genuinely separate peripheral lesion (confirmed against ATS/CHEST coding guidance). Do not treat 31654 as mutually exclusive with anything in this list. |
| `modifier_prompt` | Prompt for a modifier when a pattern occurs | See §5a — E/M + same-day procedure → prompt `-25` |

Note the shift from the earlier draft of this spec: with the code list now finalized to what the physician actually performs, the *bundled_into* 31622-swallows-everything rule set is no longer needed at all — **31622 was removed from the code list entirely** and isn't tracked as a separate tap. The remaining bronchoscopy relationships are narrower and mostly session-target-dependent rather than blanket bundles, which is exactly why `conflict_same_target` prompts for confirmation instead of silently subtracting.

### Behavior

- When a rule fires, the app shows an **inline, dismissible warning** on the day's entry list — not a hard block. Coding judgment is the physician's; the app flags, it does not decide.
- The day total shows two figures when any rule fires: **as entered** and **after bundling rules**. Make the second the prominent one.
- Every warning links to the rule row so the user can see and edit the basis.

### Seed the rules but do not vouch for them

Generate the seed `Rules` tab from the relationships above, and mark every seeded row `verified = FALSE`. The README must instruct the user to reconcile the rule set against current **NCCI Procedure-to-Procedure edits** (CMS publishes these quarterly and free) and against their own coding staff before relying on the "after bundling" number. Once checked, the user flips `verified` to `TRUE` and the UI stops showing the "unverified rules" banner.

---

## 7. Data model

### Sheet: `Log`

| Column | Notes |
|---|---|
| `clientId` | UUID from the client; idempotency key |
| `date` | `YYYY-MM-DD`, service date, not entry date |
| `hcpcs` | |
| `component` | ``, `26`, or `TC` |
| `modifiers` | comma-separated, e.g. `25` |
| `qty` | integer ≥ 1 |
| `workRVU` | value resolved at entry time |
| `rvuSource` | e.g. `PPRRVU 2026Q3` — so historical rows stay meaningful after a re-import |
| `setting` | `office` / `inpatient` / `procedure` — free-select, no PHI |
| `caseId` | optional local grouping label (e.g. `case 1`) so bundling rules can apply per case; **not** a patient identifier |
| `createdAt` | ISO timestamp |
| `voided` | boolean |

Snapshotting `workRVU` and `rvuSource` per row is deliberate: a re-import next year must not retroactively rewrite last year's totals.

### Sheet: `Codes`
Per §4. Columns: `hcpcs`, `modifier`, `shortLabel`, `longDescriptor`, `workRVU`, `statusCode`, `globalDays`, `category`, `favorite`, `trackable`, `defaultComponent`.

### Sheet: `Rules`
Columns: `id`, `type`, `codeA`, `codeB`, `message`, `verified`, `sourceNote`.

### Sheet: `Settings`
Key-value: `rvuSourceLabel`, `sharedSecret`, `dailyTarget`, `annualTarget`, `defaultComponentPFT`.

**On the daily target:** do not hardcode 20. An earlier prototype used 20 wRVU/day as a benchmark; that number was invented and is meaningless across specialties and practice models. Leave the target blank by default, hide the progress bar until the user sets one, and label it "your target" rather than implying a benchmark.

---

## 8. UI

Mobile-first. Assume a 390px-wide viewport, one-handed use, gloves off but in a hurry between cases. Tap targets ≥ 44px.

### Tab: Log
- Service date picker, defaulting to today, with clear "logging for a past date" styling when it isn't today
- Large day total
- Search field filtering on code number, abbreviation, description, and a synonyms field (so "PFT", "lung volumes", "EBUS", "nav", "cessation" all hit)
- **Every code display anywhere in the app shows the `abbrev` prominently, with the raw CPT number secondary/smaller.** The user does not have the numbers memorized — the abbreviation is the primary identifier, not a footnote.
- **Favorites row pinned at top** — the user's ten most-tapped codes, computed from history. This is the single highest-leverage feature for making daily logging fast; most days will be entirely favorites taps.
- Quantity stepper
- One-tap add with an undo affordance in the confirmation toast (undo is more useful than a delete button buried in a list)
- Optional "new case" button that starts a new `caseId` group so bundling rules scope correctly on procedure days
- Today's entries grouped by case, with per-entry component and modifier badges, and any rule warnings inline

### Tab: History
- Reverse-chronological days
- Per-day: total, entry list, and a note if any rule warnings were unresolved
- Edit and void from here

### Tab: Stats
- Month to date, 7-day average of *worked* days (exclude zero days from the average — including them makes the number meaningless for anyone with a procedure/clinic split week), rolling 12-month total
- Bar chart of the last 14 days
- Breakdown by category (E/M vs bronchoscopy vs PFT) — genuinely useful for a proceduralist deciding where their production actually comes from
- CSV export (§9)
- RVU source label and the §4.2 disclaimer

### PWA
Include `manifest.json` with icons and `display: standalone` so the Safari "Add to Home Screen" install opens chrome-less. Add a minimal service worker that caches the app shell — the app must open and accept entries with no connectivity.

---

## 9. Export

CSV with one row per entry: `date, hcpcs, component, modifiers, description, workRVU, qty, totalRVU, rvuSource, setting, caseId`. Filename `wRVU_<YYYY-MM>.csv`. Also offer a full-history export. Since the sheet is the source of truth, position the export as "for your records / to send to your practice manager," not as the backup mechanism.

---

## 10. Deployment — what the README must contain

Write `README.md` as a checklist a non-developer can follow. It must cover:

1. Create the Google Sheet, run the setup function that creates the four tabs.
2. Open Extensions → Apps Script, paste `Code.gs`, set a shared secret in Script Properties, deploy as a Web App ("Execute as: me", "Who has access: Anyone"), copy the `/exec` URL.
3. Explain plainly what "Anyone" means here and why it's acceptable given no PHI (§1.2). Do not gloss over this.
4. Download the current CMS PPRRVU file, run the import script.
5. Set repo secrets / `.env` with the Web App URL and shared secret; build; deploy to GitHub Pages.
6. Open the Pages URL **in Safari itself** (not inside another app's in-app browser) → Share → Add to Home Screen. In-app browsers do not offer this option, which caused confusion previously.
7. Quarterly maintenance: re-run the CMS import when a new PPRRVU release drops.

### Multi-user

Each colleague deploys their own copy: their own sheet, their own Apps Script deployment, their own Pages repo. Their data never touches the original user's sheet. Include a `SETUP-FOR-COLLEAGUES.md` that is the §10 checklist stripped of the original user's specific values, so it can be handed over as-is.

Do not build shared multi-tenant storage. Separate deployments are simpler, avoid any aggregation of one physician's production data into another's account, and sidestep the question of who owns the combined dataset.

---

## 11. Acceptance tests

1. Log 3 codes offline in airplane mode; re-enable network; confirm exactly 3 rows land in the sheet and none duplicate after a forced retry.
2. Clear all Safari website data; reopen the home screen icon; confirm full history reloads from the sheet.
3. Tap 31652 and 31653 in the same case; confirm a mutual-exclusivity warning and that the "after bundling" total counts only one.
4. Tap 31654 alongside 31652 in the same case; confirm **no** warning fires (they are compatible — see §6 `not_exclusive_note`).
5. Tap 31627 with no other bronchoscopy code present in the case; confirm the add-on warning fires.
6. Log 99214 and 94729 on the same date/case; confirm the -25 prompt appears on the 99214 entry only, and confirm the day's wRVU total is identical whether or not -25 is applied.
7. Switch a PFT code between Global and Professional; confirm the credited wRVU changes and the entry badge updates.
8. Re-run the CMS import with a newer file; confirm historical rows retain their original `workRVU` and `rvuSource`.
9. Confirm no field anywhere in the UI accepts free text that could hold a patient identifier.
10. Confirm the app builds and runs with an empty `Codes` tab, showing a clear "import RVU data to begin" state rather than crashing.
11. Confirm every code, everywhere in the UI, displays its `abbrev` — spot check the favorites row, search results, and CSV export.

---

## 12. Summary of prior errors this spec corrects

Carry these forward; they came from an earlier prototype and the user may still have them in a running copy:

- **31660 mislabeled as navigational/robotic bronchoscopy.** It is bronchial thermoplasty. Navigation is add-on 31627. (31660 is now excluded from scope entirely, per §5.)
- **31629 mislabeled as "transbronchial biopsy, each additional lobe."** It is TBNA; additional-lobe add-ons (31632/31633) are also out of scope per §5.
- **31652 and 31653 presented as stackable.** They are mutually exclusive.
- **31654 initially presented as mutually exclusive with 31652/31653.** Corrected: it's compatible with them for a genuinely separate peripheral target — see §6 `not_exclusive_note`. Don't over-correct into a false conflict.
- **31622 presented as separately billable alongside other bronchoscopy codes.** It is bundled, and is now excluded from scope entirely per §5.
- **32550 (tunneled pleural catheter) initially included.** The physician doesn't perform this — only 32557 (percutaneous drainage catheter). Do not reintroduce 32550.
- **PFT codes given global-looking values with no PC/TC distinction**, overstating physician work for a professional-component biller.
- **87811 (COVID rapid antigen) included as a trackable code**, despite having no physician work component. Now excluded from scope entirely.
- **All work RVU values supplied from model memory**, unverified and partly stale relative to the 2023 E/M revisions.
- **A 20 wRVU/day target presented as a benchmark.** It was invented.
- **`localStorage` used as the persistence layer**, which does not work in the environment it was first built for.
- **A Google Sheets API key proposed for writes.** API keys are read-only for Sheets; writes require OAuth, a service account, or an Apps Script backend.
- **An AAPC ICD-9-to-ICD-10 conversion link used as the RVU reference.** Unrelated tool. Link CMS's Physician Fee Schedule Look-Up instead.
- **Codes shown by raw CPT number only**, which the physician doesn't have memorized. Every code now requires a short `abbrev` displayed everywhere it appears (§5).
