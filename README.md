# Unified Calendar

A free, Google-Calendar-style web app that puts **all your calendars in one place**:

- 📅 **Google Calendar** from as many Google accounts as you like (read-only)
- 🎓 **Canvas assignments** via your personal Canvas *Calendar Feed* link — no API token needed
- 🔗 **Any other calendar** with an `.ics` / webcal link (holidays, sports, Outlook, clubs…)
- 📝 **PrairieLearn** deadlines (via a bookmarklet)
- ☁️ Optional **sync across devices** through a hidden app folder in your own Google Drive

Features: day / week / month / agenda views, search, per-calendar colors and visibility, a **“Due soon” checklist** for
assignments (check them off as you finish), **deadline reminders** as notifications, light/dark theme, works on phones
and installs as an app (PWA).

Tasks first: a **Today** list, one section per class, personal to-dos and quick items; a **time bar for today**
(events, scheduled work, deadlines and tracked time on one line); **schedule work sessions** on any task across several
days; a one-click **stopwatch** with day/week stats; a **floating mini window** (🗗 in the top bar) that shows your
timer and today's tasks on top of other tabs; and a **Gmail-style background** (⛰ in the top bar): eight landscapes
whose sun, shadows and sky follow the real time of day, across the whole page or just the header. Everything is stored in your browser — there is no app database.

**Live site:** https://harnwaln.github.io/unified-calendar/

---

## Using it

1. **Open the site.** A short welcome guide walks you through setup (you can skip it and use **Settings** ⚙️ later).
2. **Connect Google.** Click *Connect Google account*, pick an account and allow read-only calendar access. Repeat for
   every account you want to see (personal, school, work…). All of their calendars show up in the sidebar.
3. **Add Canvas.** Your school may not allow Canvas API tokens, but every Canvas user has a private calendar feed:
   1. Open Canvas in a browser and click **Calendar** in the left-hand menu.
   2. At the bottom right of the calendar page, click **Calendar Feed**.
   3. Copy the link it shows (it looks like `https://<school>.instructure.com/feeds/calendars/user_….ics`).
   4. Paste it into **Settings → Canvas** (or the welcome guide) and click **Add**.

   Assignments appear as deadlines and in the **Due soon** list. Treat the link like a password — anyone with it can
   see your Canvas calendar.
4. **Other calendars.** In **Settings → Other calendars**, give it a name, paste any `.ics`, `webcal://` or `https://`
   calendar link and pick a color. Example — US holidays:
   `https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics`
5. **Install as an app.** On Android/desktop Chrome or Edge use the install icon in the address bar (or menu → *Install
   app*). On iPhone/iPad: Safari → Share → **Add to Home Screen**.
6. **Reminders.** In **Settings → Reminders**, turn on notifications and choose when to be reminded (1 week, 1 day, 3
   hours, 1 hour, 15 min before). Reminders fire while the site is open in a tab or installed as an app. On iOS they
   only work for the Home-Screen app.

7. **Classes.** Assignments are grouped into classes automatically from their course names. In **Settings → Classes**
   you can rename, recolor, reorder, hide or delete them, and **merge** two classes when the same course shows up
   under different names (e.g. `CSE 110 - FA26` on Canvas and `CSE 110` on PrairieLearn).
8. **PrairieLearn.** PrairieLearn has no calendar feed, so **Settings → PrairieLearn** offers a **Send to Calendar**
   bookmarklet: drag it to your bookmarks bar, open a course’s *Assessments* page on PrairieLearn and click it. The app
   opens and imports the deadlines (run it again to update). Imported courses are listed there and can be removed.
9. **Sync across devices.** In **Settings → Sync**, pick one of your connected Google accounts. Google asks once for
    permission to use the app’s own hidden folder in your Drive (`drive.appdata` — it can’t see your other files). Your
    classes, task plans/notes, personal tasks, time logs and PrairieLearn imports are kept in one file there
    (`unified-calendar.json`) and merged per item (last edit wins) on start, on focus, every 5 minutes and a few
    seconds after each change. Accounts, tokens and feed links are never uploaded; choose the account on each device.

## Privacy

- Read-only Google access (`calendar.readonly` + basic profile), used only to show *you* your events.
- Only if you turn on Sync: `drive.appdata`, which lets the app read/write **its own hidden file** in your Drive (not
  your other files). That file holds your tasks, plans, notes, classes and time logs — never tokens or feed links.
- Settings, tokens, feed links and cached events live in **your browser** (localStorage + IndexedDB).
- Google data goes straight from Google to your browser. The small Cloudflare Worker only exchanges/refreshes sign-in
  tokens (it needs the OAuth client secret) and doesn’t store anything.
- No analytics, no ads, nothing sold. **Settings → Privacy & data → Reset app** wipes everything; you can also revoke
  access at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

Full policy: [`public/privacy.html`](public/privacy.html) (served at `https://harnwaln.github.io/unified-calendar/privacy.html`).

---

## Host your own copy

Everything runs on free tiers: GitHub Pages (site), Cloudflare Workers (token helper) and Google Cloud (OAuth).
Below, `<user>` is your GitHub username (lowercase) and `<repo>` the repository name.

### 1. Fork

Fork this repository on GitHub. Replace `OWNER/REPO` in `README.md` and `public/privacy.html` with `<user>/<repo>`.

### 2. Google Cloud (OAuth client)

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and **create a project**.
2. **APIs & Services → Library** → search **Google Calendar API** → **Enable**. Do the same for **Google Drive API**
   (used by Sync).
3. **APIs & Services → OAuth consent screen** (a.k.a. *Google Auth Platform*):
   - User type **External**, publishing status **Testing**.
   - App name, support email, developer contact. App home page `https://<user>.github.io/<repo>/`, privacy policy
     `https://<user>.github.io/<repo>/privacy.html`.
   - **Scopes / Data access:** add `.../auth/calendar.readonly`, `openid`, `.../auth/userinfo.email`,
     `.../auth/userinfo.profile`, and `.../auth/drive.appdata` (for Sync; it is requested only when a user turns
     Sync on).
   - **Test users / Audience:** add the Google accounts that may sign in (up to 100) — including your own.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type **Web application**.
   - **Authorized JavaScript origins:** `https://<user>.github.io` and `http://localhost:5173`.
   - Copy the **Client ID** and **Client secret**.

### 3. Cloudflare (token helper Worker)

1. Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com/).
2. **My Profile → API Tokens → Create Token →** template **Edit Cloudflare Workers** → create and copy the token.
3. Copy your **Account ID** (Workers & Pages overview, right sidebar).
4. Store the Google client secret in the Worker once (from your clone of the repo, after `npm ci`):

   ```sh
   npx wrangler login
   npx wrangler secret put GOOGLE_CLIENT_SECRET --config worker/wrangler.toml
   ```

   (If the Worker doesn’t exist yet, Wrangler offers to create it; or run step 4 below first, then this.)

### 4. GitHub

1. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Repo **Settings → Secrets and variables → Actions**:
   - **Variables:** `GOOGLE_CLIENT_ID` = your client ID. `WORKER_URL` = leave for now.
   - **Secrets:** `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
3. **Actions → Deploy → Run workflow.** This deploys the site and the Worker (the Worker job is skipped if
   `CLOUDFLARE_API_TOKEN` isn’t set). The Worker is configured with `GOOGLE_CLIENT_ID` and
   `ALLOWED_ORIGINS=https://<user>.github.io` automatically.
4. Copy the Worker URL from the job log (e.g. `https://unified-calendar-proxy.<subdomain>.workers.dev`), set it as the
   `WORKER_URL` variable, and **run the workflow again** so the site is built with it.
5. Open `https://<user>.github.io/<repo>/`. Every push to `main` redeploys.

### 5. Going public (Google verification)

While the OAuth app is in **Testing** mode:

- only the (max. 100) **test users** you added can sign in, and
- Google **refresh tokens expire after 7 days**, so users see “Reconnect” about once a week.

To let anyone sign in and stay signed in, go to the OAuth consent screen and **Publish app**, then **submit for
verification**. `calendar.readonly` is a *sensitive* scope, so Google reviews the app: you’ll need the home page and
privacy policy links (`/privacy.html` is written for this, including the Limited Use statement), a short demo video of
the sign-in and how calendar data is shown, and a verified domain for the home page (GitHub Pages under `github.io`
can’t be verified — use a custom domain for the Pages site if you go this route).

---

## Local development

```sh
npm ci
cp .env.example .env.local              # VITE_GOOGLE_CLIENT_ID=…, VITE_WORKER_URL=http://localhost:8787
cp worker/.dev.vars.example worker/.dev.vars   # GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ALLOWED_ORIGINS=http://localhost:5173
npm run worker:dev                      # Worker on http://localhost:8787
npm run dev                             # app on http://localhost:5173
```

- Open `http://localhost:5173/?mock` to load mock data without connecting anything.
- `npm test` runs the unit tests (Vitest), `npm run typecheck` the TypeScript checks, `npm run build` a production build.
- To see onboarding again, run `localStorage.clear()` in the console and reload.

## Tech stack

React 19 · TypeScript · Vite · zustand (state, persisted to localStorage) · idb-keyval (IndexedDB event cache) ·
date-fns · ical.js (feed parsing) · vite-plugin-pwa · Cloudflare Workers (OAuth token exchange) · GitHub Actions/Pages.

## Project structure

```
src/
  App.tsx               app shell
  types.ts              shared data contracts (events, calendars, accounts, feeds, settings)
  config.ts             build-time config (client ID, Worker URL) and color palette
  store/                zustand store (+ selectors)
  sources/              Google, .ics/Canvas sync, Drive app-data sync, PrairieLearn import
  lib/                  date helpers, IndexedDB cache, recurrence expansion
  features/             checklist (Due soon), reminders, feed-link validation, reset
  components/           TopBar, Sidebar, views, EventPopover, SettingsDialog, Onboarding, DueSoon
  styles/               design tokens (light/dark) and layout
worker/                 Cloudflare Worker: Google code → refresh-token exchange and token refresh
public/                 icons, privacy.html
.github/workflows/      deploy.yml (Pages + Worker)
```
