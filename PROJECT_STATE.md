# TCM Daily Tracker App — Project State

Last updated: 2026-09-13

> This is the project root for the **tracker app** itself — distinct from
> `tcm-daily-tracker` (the Claude Skill that does the TCM analysis, repo
> `charlotte-wtl/tcm_daily_tracker_skill`) and from `personal_tcm_daily_log`
> (the private data repo). See "Open architecture question" at the bottom —
> the app's actual code currently still lives inside the skill repo and
> hasn't been physically moved here yet, pending your decision.

## What this is

A bilingual (ZH/EN) daily TCM health-log app for personal use, published as a
Claude Artifact so it works as an iPhone home-screen PWA. It replaces manual
CSV/MD logging with a structured, sequential daily questionnaire across 11
categories, then produces a bilingual plain-text summary the user pastes into
a separate TCM-analysis conversation (which runs the `tcm-daily-tracker`
skill).

## Tech stack

- **Runtime**: single self-contained `.html` file, published via the
  `Artifact` tool (Claude's Artifacts platform, not a standalone web host).
- **No framework, no build step.** Vanilla JS (ES5/ES6, no JSX/TS), inline
  `<style>`, inline `<script>`. Chosen deliberately — the whole app is one
  file so it stays trivially publishable/editable without tooling.
- **Persistence**: Artifact `db` capability (`window.claude.use("db")`) —
  per-user, cross-device document storage keyed by date
  (`entries/{YYYY-MM-DD}`). Last-writer-wins, no transactions. Falls back to
  an in-memory/no-persistence mode with a visible warning banner if `db` is
  unavailable.
- **Fonts**: Google Fonts (Fredoka for EN display type, Noto Sans TC for
  everything else) — the only external dependency.
- **No backend server, no auth beyond the Artifact's own owner/viewer model.**

## Code style / conventions

- **Single IIFE** (`(function(){ "use strict"; ... })()`) — no modules, no
  bundler.
- **Bilingual string convention**: every user-facing label/option is authored
  as one string `"中文||English"`. `T(pair)` splits on `state.lang` at render
  time. Never hardcode a single-language string for anything user-visible.
- **Data-driven schema, not hand-coded markup.** All questions live in the
  `SCHEMA` object (one entry per section, each field typed: `single`,
  `multi`, `text`, `number`, `yesno`, `slider`, plus `scale` — legacy, being
  phased toward `slider`). Adding/editing a question means editing `SCHEMA`
  data, not writing new render functions — this is intentional so future
  question-set changes are a content edit, not a UI rewrite.
- **Field-level feature flags** rather than one-off special cases:
  `detailsTrigger` / `details` (conditional follow-up questions),
  `detailsByValue` (branching follow-ups keyed by which value was picked —
  e.g. bowel movement yes/no branches to different question sets),
  `perItemSeverity` (per-selected-item severity picker on a multi-select),
  `allowOther` (defaults on — free-text "other" input under every
  choice-based field unless explicitly set to `false`).
- **No comments explaining *what* code does** — identifiers should carry
  that. Comments are reserved for non-obvious *why* (e.g. the CSS-variable
  design-rationale comment at the top of the file).
- **Sequential section-reveal UX**: sections open one at a time
  (`state.expanded`), a "Done" button per section closes it and auto-opens
  the next incomplete one (`firstIncompleteId`, `settleExpanded`), with
  auto-scroll respecting `prefers-reduced-motion`. Leaving a section's
  fields empty and hitting Done = an intentional skip, not an error.
- **Autosave**: every "Done" tap saves to `db` immediately — no relying on a
  final explicit save for data durability.
- **No live interactive testing available to Claude**: the published
  Artifact is private and Claude's browser tools cannot authenticate as the
  user. Verification during development is code review + `node --check` on
  the extracted `<script>` block. The user must test on her phone before
  relying on a same-day change.

## Architecture overview

```
daily-log.html
├── <style>            — CSS custom properties (light/dark aware), component styles
├── SCHEMA              — the single source of truth for all questions
├── state                — { lang, date, answers, done, expanded, db, dirty }
├── render*()             — pure-ish functions, state → HTML strings
├── event listeners       — delegated click/input handlers on #sections, mood, cycle field
├── buildSummary()        — state.answers → bilingual plain-text summary (the copy/paste bridge to the skill conversation)
└── storage (db)          — load/save one JSON doc per date, keyed off Artifact's `db` capability
```

**Current data flow (temporary, manual bridge — not the end state):**
```
user fills app → taps "Run analysis" → gets copyable summary text
  → pastes into her separate long-running claude.ai chat
  → that chat runs the tcm-daily-tracker skill (has ~5 months of her history)
  → she pastes the resulting analysis back to Claude Code
  → logged into personal_tcm_daily_log for a durable record
```
The eventual goal (Sprint 4, not yet built) is to collapse this into an
in-app "chat space" using the Artifact `sample` capability, so the analysis
and follow-up conversation happen inside the app itself.

## Sprint goals / roadmap

- **Sprint 1 — done.** Core daily-log UI, 11 sections, sequential reveal,
  db persistence, bilingual summary generation.
- **Sprint 1.5 — done (partial).** Visual pass: palette ("Booked": mustard
  #C2B500, pink #F5D6FF, periwinkle #AEB7FF, gold #FFBC54, cream #FBFDF7,
  dark brown #352900 — currently implemented as a close variant, see open
  question below), language toggle, mood "buddy" blob selector, wave-shaped
  section dividers, ticket-stub date card. Full mascot/brand identity still
  deferred to Sprint 2.
- **Sprint 1.9 — done, 2026-09-13 (this update).** Real-usage bug fixes from
  the first days of actual logging: several fields that should allow
  multiple simultaneous answers (e.g. 心智狀態/Mind, 汗/Sweating, 面色/
  Complexion, 咳嗽／痰, 經期腹痛/Pain type, etc.) were `single` and are now
  `multi`; the "Run analysis" button was gated on all sections being marked
  Done and silently did nothing otherwise — it now always shows the
  concatenated summary regardless of completion state.
- **Sprint 2 — not started.** Full visual/brand design pass: actual mascot
  character art, the "Booked" palette finalized precisely, section-divider
  and buddy-selector polish, animation. Needs art/design/UX-UI input — see
  the separate ask-list for the art director (in this project's `docs/`
  once relocated, or delivered to you directly in chat).
- **Sprint 3 — not scoped.** User is currently drafting a "user journey"
  document herself; her Sprint 2/3 shape may change once she shares it.
- **Sprint 4 — not started, blocked on Sprint 2/3.** In-app analysis
  integration: replace the manual copy/paste bridge with an in-app call to
  the `tcm-daily-tracker` skill logic (via the Artifact `sample`
  capability) plus a structured summary card + follow-up chat space (see
  `sprint2-feedback.md`'s "Structured summary + follow-up chat space"
  section for the agreed design direction). Needs a decision on how/whether
  to backfill ~5 months of the user's pre-existing history first.

## Known open items (not decided yet)

- Whether/how to backfill the user's ~5 months of prior TCM history into
  the new system before Sprint 4 is scoped.
- Whether some Section 5 (Liver/Spleen/Kidney) items — e.g. hair loss/
  greying — belong in a *daily* log at all vs. a less-frequent check-in.
- The exact structured-summary-card format for future in-app display
  (draft shape exists in `sprint2-feedback.md`, not finalized).
- Whether cross-viewer analytics on free-text "other" answers is ever worth
  building given this is single-user data (originally scoped assuming
  multi-user testing volume that doesn't apply here).

## Open architecture question (needs your call)

This directory currently holds only planning docs. The actual app code
(`daily-log.html`) and its design-reference docs (`backlog.md`,
`questions-v2-bilingual.md`, Clue screenshots, etc.) still physically live
inside the **skill repo** at `/Users/charlotte/tcm/app/` and
`/Users/charlotte/tcm/docs/` — the same inconsistency we already fixed once
for personal health data (moved to `personal_tcm_daily_log`). I'd recommend
moving `app/` and `docs/` here too, into this repo, so the skill repo goes
back to containing only the skill. Attempting that move triggered a safety
check (bulk-moving the live Artifact's source file), so I stopped rather
than force it — say the word and I'll do the move + re-verify the Artifact
still publishes correctly afterward.
