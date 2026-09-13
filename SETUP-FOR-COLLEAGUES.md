# Setting up your own copy of wRVU Tracker

This app was built for one physician's own tracking. If you'd like your own copy: you deploy your **own** Google Sheet, your **own** Apps Script Web App, and your **own** GitHub Pages site. Your data never touches the original deployer's Sheet or account, and vice versa — there is no shared or multi-tenant storage anywhere in this design.

You'll need: a Google account, a free GitHub account, and about 30 minutes.

## 1. Create your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new, blank spreadsheet.
2. Open **Extensions → Apps Script**.
3. Delete the default contents and paste in the entire contents of `apps-script/Code.gs` from this repo.
4. Save the project.
5. In the function dropdown, select **setup** and click **Run**. Approve the authorization prompt (it only grants access to this one spreadsheet).
6. Confirm the log says "Setup complete" and your sheet now has four tabs: `Log`, `Codes`, `Rules`, `Settings`.

## 2. Set your own shared secret and deploy

1. **Project Settings** (gear icon) → **Script Properties** → add `SHARED_SECRET` with a long random value of your own choosing. Keep it private — treat it like a password.
2. **Deploy → New deployment → Web app**. Execute as: **Me**. Who has access: **Anyone**.
   - This means anyone with the URL can call the endpoint, gated only by your shared secret rather than a Google login — acceptable because this sheet holds no patient-identifying information (no notes field exists anywhere in the app). Don't add one.
3. Copy the `/exec` URL. Open it in a browser to confirm you get a small JSON response back, not an error.

## 3. Import RVU values from CMS — do this yourself, every quarter

Work RVU values are never hardcoded in this app. You must download the current CMS PPRRVU file yourself:

1. [CMS Physician Fee Schedule search tool](https://www.cms.gov/medicare/physician-fee-schedule/search) → download the current quarter's RVU release CSV.
2. On your computer: `npm install`, then copy `.env.example` to `.env` and fill in your own `VITE_APPS_SCRIPT_URL` and `VITE_SHARED_SECRET` from step 2.
3. Run: `npm run import-rvu -- --file /path/to/PPRRVU_file.csv --label "PPRRVU 2026 Q3"` (use the actual year/quarter of the file you downloaded).
4. Review any codes it reports as not found — don't assume they're fine to ignore.

Re-run this every quarter.

## 4. Deploy your own copy to GitHub Pages

1. Fork or clone this repo into your own GitHub account.
2. Repo **Settings → Pages** → source: **GitHub Actions**.
3. Repo **Settings → Secrets and variables → Actions** → add your own `VITE_APPS_SCRIPT_URL` and `VITE_SHARED_SECRET` (from step 2 — not the original deployer's).
4. Push to `main`, or trigger the deploy workflow manually from the Actions tab.
5. Your app is now live at `https://<your-username>.github.io/<your-repo-name>/`.

## 5. Install on your phone

Open your Pages URL in **Safari itself** (not an in-app browser — Gmail, Slack, etc. hide the install option). Share icon → **Add to Home Screen**.

## 6. First launch and coding rules

- The app asks once whether your group bills in-office tests (PFTs) globally or professional-component only — answer for how **your** group actually bills. You can change this and override it per code later in Settings.
- The `Rules` tab is pre-seeded with bundling relationships but marked unverified. Before trusting the "after bundling" totals, reconcile them against the current CMS NCCI Procedure-to-Procedure edits and your own coding/billing staff, then mark rules verified in Settings. If your practice's coding differs from the seed, just edit the `Rules` sheet tab directly.

## Want a different code list?

The locked code set lives in `src/data/codeSeed.ts` (search terms, categories, favorites) and is what `scripts/import-rvu.ts` looks up in the CMS file. If you perform different procedures, edit that file to match your own practice before running the importer — don't add codes speculatively "just in case."
