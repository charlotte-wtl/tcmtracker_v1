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
│   ├── app.js           shell: nav, status strip, boot + foreground sync
│   ├── schema.js        question schema — edit questions here, not the UI
│   ├── daily-log.js     the daily-log screen (+ cycle line, merge-on-save)
│   ├── calendar.js      history: month calendar, cycle markers, day preview
│   ├── home.js          cycle day, next period, period start/end button
│   ├── profile.js       account, period history, Apple Health import
│   ├── connect.js       "I have an ID" / "I'm new" connect screen
│   ├── sync.js          GitHub sync: pull recent days, sha-checked uploads
│   ├── merge.js         field-level merge of two devices' edits
│   ├── cycle.js         cycle maths (pure)
│   ├── cycle-store.js   period records (cycle.json) + log phase link
│   ├── health-import.js streams export.zip, finds period records
│   ├── ids.js           typo-safe user ids with a check character
│   ├── summary.js       entry → readable lines (preview + Run analysis)
│   ├── dates.js         local-day date helpers — never toISOString() for a day
│   ├── db.js            IndexedDB — the primary store
│   ├── ui.js            escaping, bottom sheets
│   └── i18n.js          T("中文||English")
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
~1.2s; GitHub sync is layered on top and is never a precondition for a save.
This is the direct lesson from a Sprint 1 bug that silently discarded input.

**Syncing.** Data lives at `user-data/<id>/<date>.json` plus `cycle.json`. On
open and on returning to the app, the last 14 days and cycle.json are pulled;
older days load when opened. Every upload sends the file's sha, so a stale
device gets 409/422 instead of overwriting — it then merges field by field
(merge.js) and retries. Never replace this with a blind overwrite.

**The token is never persisted.** It lives in `sessionStorage` only and any
token written by an older build is purged at startup. The field is marked up
as a credential field so Apple Passwords / iCloud Keychain can hold it
instead. Don't "improve" this by saving it to IndexedDB — this origin is
public.
