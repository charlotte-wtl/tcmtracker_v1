# TCM Tracker — app

Bilingual (ZH/EN) daily TCM health-log web app.

**Live: https://charlotte-wtl.github.io/tcmtracker_v1/**

> This repo is **public** because GitHub Pages serves from it on a free
> account. It holds production app code only — no health data, no credentials,
> no planning material. Keep it that way.

## Repos

- **tcmtracker_v1** (this, public) — the app
- **[tcm_tracker_project](https://github.com/charlotte-wtl/tcm_tracker_project)** (private) — PRD, backlog, sprint notes, design, `PROJECT_STATE.md`
- **personal_tcm_daily_log** (private) — daily entries the app writes

## Layout

```
app/web/            the real app (deployed)
├── index.html
├── css/style.css   Japandi design system
├── js/
│   ├── schema.js    11-section question schema — edit questions here, not the UI
│   ├── daily-log.js the daily-log screen
│   ├── db.js        IndexedDB — the primary store
│   ├── sync.js      GitHub mirror: user-data/<id>/<date>.json
│   ├── i18n.js      T("中文||English")
│   └── app.js       shell: nav, status strip, profile
└── sw.js           app-shell offline cache (network-first)

app/daily-log.html  Sprint 1 Claude Artifact — still in daily use, untouched
```

## Run locally

```bash
python3 -m http.server 8787 --directory app/web
```

Then open http://localhost:8787. Needs a real HTTP server — ES modules don't
load over `file://`.

## Deploy

Any push to `main` redeploys via `.github/workflows/pages.yml`, which
publishes `app/web/` only.

## Two things that are deliberate

**Saving.** IndexedDB is the primary store and every change is written within
~1.2s; GitHub sync is a background mirror layered on top and is never a
precondition for a save. This is the direct lesson from a Sprint 1 bug that
silently discarded input.

**The token is never persisted.** It lives in `sessionStorage` only and any
token written by an older build is purged at startup. The field is marked up
as a credential field so Apple Passwords / iCloud Keychain can hold it
instead. Don't "improve" this by saving it to IndexedDB — this origin is
public.
