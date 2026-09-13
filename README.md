# wRVU Tracker

A self-hosted, mobile-first daily wRVU logging app backed by your own Google Sheet. No subscription, no PHI, no hardcoded RVU values.

This README is a checklist — follow it in order. It assumes no prior experience with Google Apps Script or GitHub Pages.

---

## 0. What this app is (and isn't)

- It stores **counts of CPT codes by date** — no patient names, no MRNs, no notes. There is no field anywhere that accepts free text that could hold a patient identifier.
- The Google Sheet is the database. Your phone's local storage is only a cache — clearing Safari's site data does not lose data, it just re-downloads it from the Sheet.
- Work RVU values come **only** from a CMS PPRRVU file you download yourself and import (§4 of the build spec). Nothing is hardcoded.
- Bundling/exclusivity warnings are a starting point, not verified coding advice, until you reconcile them against current NCCI edits and your own coding staff (see step 7).

---

## 1. Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new, blank spreadsheet. Name it something like "wRVU Log".
2. Open **Extensions → Apps Script**.
3. Delete the default `Code.gs` contents and paste in the entire contents of [`apps-script/Code.gs`](apps-script/Code.gs) from this repo.
4. Save the project (any name is fine, e.g. "wRVU Backend").
5. In the function dropdown at the top of the Apps Script editor, select **setup**, then click **Run**. The first time, Google will ask you to authorize the script — this is expected; it needs permission to edit this one spreadsheet. Approve it.
6. Check the **Execution log** (View → Logs) — it should say "Setup complete." Your spreadsheet now has four tabs: `Log`, `Codes`, `Rules`, `Settings`.

## 2. Set a shared secret and deploy the Web App

1. Still in the Apps Script editor, open **Project Settings** (the gear icon) → **Script Properties** → **Add script property**.
2. Key: `SHARED_SECRET`. Value: any long random string (e.g. generate one at [1password.com/password-generator](https://1password.com/password-generator) or run `openssl rand -hex 24` in a terminal). Save it somewhere — you'll need it again in step 5.
3. Back in the editor, click **Deploy → New deployment**.
4. Click the gear next to "Select type" and choose **Web app**.
5. Set **Execute as: Me**. Set **Who has access: Anyone**.

   **What "Anyone" actually means here:** anyone with the URL can send requests to this endpoint, gated only by the shared secret from step 2 — not by a Google login. That sounds alarming, but it's the standard, documented way to expose an Apps Script Web App, and it's an acceptable tradeoff *only* because this sheet never contains PHI — just CPT code counts by date. If you ever add a field that could hold patient-identifying information, this security model is no longer sufficient. Don't do that.
6. Click **Deploy**. Copy the URL ending in `/exec` — this is your `VITE_APPS_SCRIPT_URL`.
7. Sanity check: open that URL directly in a browser. You should see a small JSON health-check response, not an error page.

## 3. Download the current CMS RVU file and import it

1. Go to the [CMS Physician Fee Schedule search tool](https://www.cms.gov/medicare/physician-fee-schedule/search) and download the current quarter's **RVU release** (the file inside it is named `PPRRVU<YY>_<Q>.csv` or similar).
2. Note the year and quarter (e.g. "2026 Q3") — you'll type this in manually in the next step. The importer will not guess it from the filename.
3. On your computer, in this project folder:
   ```bash
   npm install
   ```
4. Create a `.env` file (copy `.env.example`) and fill in `VITE_APPS_SCRIPT_URL` (from step 2.6) and `VITE_SHARED_SECRET` (from step 2.2).
5. Run the importer:
   ```bash
   npm run import-rvu -- --file /path/to/PPRRVU2026_Q3.csv --label "PPRRVU 2026 Q3"
   ```
6. The script will tell you how many codes it matched, and **loudly list any of the app's codes it could not find** in the file rather than silently skipping them. If everything matched, your Sheet's `Codes` tab is now populated and `Settings!rvuSourceLabel` is set.

Re-run this step every quarter when CMS publishes a new RVU release (the app shows a banner once the loaded file is more than ~100 days old).

## 4. Build and deploy to GitHub Pages

1. Create a new GitHub repository and push this project to it.
2. In the repo's **Settings → Pages**, set the source to **GitHub Actions**.
3. In **Settings → Secrets and variables → Actions**, add two repository secrets:
   - `VITE_APPS_SCRIPT_URL`
   - `VITE_SHARED_SECRET`
4. Push to `main` (or run the "Deploy to GitHub Pages" workflow manually from the Actions tab). It builds the app and publishes `dist/` to Pages.
5. Your app will be live at `https://<your-username>.github.io/<repo-name>/`.

(If you'd rather run it locally first: `npm run dev` starts a dev server. `npm run build && npm run preview` builds and serves the production bundle.)

## 5. Install it on your phone

1. Open the Pages URL **in Safari itself** — not inside Gmail's, Slack's, or any other app's in-app browser. In-app browsers hide the "Add to Home Screen" option, which is confusing if you don't know that's why it's missing.
2. Tap the Share icon → **Add to Home Screen**.
3. Open it from the home screen icon. It should launch full-screen, with no Safari address bar.

## 6. First launch

The app will ask one question the first time: *does your practice bill in-office tests (PFTs) globally, or professional-component only?* This determines which wRVU is credited to you for spirometry, lung volumes, DLCO, and FeNO. Answer honestly for how your group actually bills — you can change it later in Settings, and you can also override the default per individual code there.

## 7. Reconcile the bundling rules before trusting them

The `Rules` tab comes pre-seeded with the bronchoscopy/E-M relationships described in the build spec, but every row starts with `verified = FALSE`, and the app shows a banner reminding you of that until you clear it. Before you rely on the "after bundling" total:

1. Pull the current quarter's **NCCI Procedure-to-Procedure edits** from CMS (also free, published quarterly) and check them against the seeded rules in the `Rules` tab.
2. Check with your coding/billing staff that these still reflect how your practice actually bills.
3. In the app's Settings tab, tick "Verified" for each rule you've confirmed. Once everything is verified, the banner disappears.

If CMS's edits or your coder tell you a rule is wrong, just edit the row directly in the `Rules` sheet tab (message, codeA/codeB, verified) — no redeploy needed, the app reads rules live.

## 8. Ongoing use

- **Daily**: tap codes from the Favorites row or search. Entries queue locally and sync automatically when you have a connection; a badge in the header shows how many are still syncing.
- **History tab**: edit quantities, add a missed `-25` modifier, or void a mis-tap.
- **Stats tab**: month-to-date, 7-day average (worked days only), rolling 12-month total, and CSV export for your own records or your practice manager. This app's numbers are an estimate for your own tracking — reconcile periodically against your group's actual production reports.
- **Quarterly**: re-run step 3 when CMS publishes a new RVU file.

---

## For colleagues who want their own copy

See [SETUP-FOR-COLLEAGUES.md](SETUP-FOR-COLLEAGUES.md) — the same checklist above, without any of the original deployer's specific values. Each physician deploys their own Sheet, their own Apps Script Web App, and their own Pages site. Nobody's data ever touches anyone else's account.

---

## Technical notes (for whoever maintains this later)

- **Why Apps Script instead of the Sheets API**: Sheets API keys are read-only. Writing requires OAuth2, a service account, or an Apps Script Web App. A service account key committed to a public static site is world-readable; full OAuth is disproportionate for a single-user app. Apps Script runs as the sheet owner and needs no client-side credentials.
- **Idempotency**: every logged entry carries a client-generated UUID. The `append` endpoint skips any UUID it's already seen, so a flaky hospital wifi connection retrying a write can never double-count a wRVU. Edits (quantity changes, added modifiers) go through a separate `update` action addressed by that same UUID — `append` is intentionally write-once.
- **No PHI**: there is no notes field, no free-text field of any kind, anywhere in the data model.
- **Local storage is a cache**: IndexedDB holds a local mirror of the Sheet plus an outbox of not-yet-synced writes. It can be wiped at any time without data loss — the next launch re-syncs from the Sheet.
