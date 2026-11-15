# Budget Tracker (PWA)

A no-build, static Progressive Web App for logging household spending in real time. Data lives on the device and syncs to a **visible JSON file in your Google Drive** (`Budget Tracker/budget-tracker.json`) so another assistant (Merlin) can read it through the Drive API. No backend, no third-party servers.

Budgets: Groceries & Household $1,450 · Shopping & Amazon $625 · Dining & Takeout $400 (editable in Settings).

## Files
`index.html`, `styles.css`, `app.js`, `config.js` (client ID + categories), `manifest.json`, `sw.js`, `icons/`.

## 1. Create the Google OAuth client ID
1. Go to <https://console.cloud.google.com/> and create a project (e.g. "Budget Tracker").
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen**: user type *External*, fill in app name and your email. Leave publishing status as **Testing** and add **both** Google accounts (John's and Annaliza's) under **Test users**. (In Testing mode, sign-in tokens/consent may need renewing about every 7 days.)
4. **Credentials → Create credentials → OAuth client ID → Web application.**
   Under **Authorized JavaScript origins** add the site's origin, e.g. `https://YOUR-USER.github.io` (no path, no trailing slash). Add `http://localhost:8000` for local testing.
5. Copy the Client ID and paste it into `config.js` as `GOOGLE_CLIENT_ID`. It's a public identifier, not a secret.

The app requests the `drive` scope so that both phones can find and share the same visible file (the narrower `drive.file` scope can't see files created by another account/device).

## 2. Deploy (GitHub Pages)
Repo **Settings → Pages →** deploy from the branch root. Open `https://YOUR-USER.github.io/REPO/`. It works on any static host (HTTPS required for the service worker). Local test: `python3 -m http.server 8000`.

## 3. Install
- **Galaxy Z Fold (Android/Chrome):** open the URL → ⋮ menu → **Install app** / **Add to Home screen**. Unfold for the two-pane layout.
- **iPhone (Safari):** open the URL → Share → **Add to Home Screen**. Use Safari (not an in-app browser).

## 4. First sign-in and the Drive file
Open ⚙ Settings → **Sign in with Google**. After the first successful sync, the **Drive file ID** appears in Settings (with a Copy button) — give it to Merlin. The file is `Budget Tracker/budget-tracker.json` in My Drive.

**Sharing between John and Annaliza:** John signs in first (creating the file), then shares the *Budget Tracker* folder with Annaliza's Google account (Editor). On her iPhone, sign in and — if she doesn't see the data — paste the file ID into Settings → Drive file ID. (Or sign both phones into the same Google account.)

## How sync works
- Every change is saved locally first, then pushed to Drive ~1.5 s later (debounced). Offline? It's queued and syncs when the connection returns or the app is reopened.
- Each sync downloads the Drive file, **merges** it with local data, and uploads the result. Entries are merged by `id` (newest `updatedAt` wins); deletions are recorded as tombstones so nothing is lost or resurrected. Budgets use last-write-wins.
- Google access tokens last ~1 hour. If the pill says "Tap to reconnect", tap it to re-authorize (needed occasionally on iPhone).

## JSON format
```json
{
  "version": 1,
  "updatedAt": "2026-11-15T17:00:00.000Z",
  "budgets": { "Groceries": 1450, "Shopping": 625, "Dining": 400 },
  "entries": [
    { "id": "…", "date": "2026-11-15", "category": "Groceries", "amount": 42.5,
      "store": "Costco", "note": "", "createdAt": "2026-11-15T17:00:00.000Z", "updatedAt": 1763226000000 }
  ],
  "deleted": [ { "id": "…", "deletedAt": 1763226000000 } ]
}
```
Merlin should ignore `deleted` and read `budgets` + `entries`.

## Privacy
No secrets in the code. Data goes only to your Google Drive and local browser storage. The only external script is Google Identity Services (`accounts.google.com/gsi/client`) for sign-in.
