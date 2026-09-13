# User journey draft — v1 (as given 2026-09-13)

Captured verbatim/organized from the user's own draft, sent in chat. She is
still actively drafting this ("bare with me, I will share with you later") —
treat this as a working draft, not a locked spec. Do not build against it
without checking back once she confirms it's final.

## App entry flow

1. Loading screen on open.
2. Shows today's date + a mood check-in.
   - **Backend**: the mood check-in gets a timestamp and is saved as a log
     entry, reflected in a mood/health calendar view.
3. Lands on the **home page**, which shows:
   - Which day the user is in her cycle, and next-period estimate.
   - A button to modify/override this (whether she currently has her period
     or not changes how the daily log runs).
   - Current body condition (presumably the latest analysis result/summary).
   - Entry points: daily log, profile, straight to the AI skill chat, and
     log history (export all old logs, or view "user memories").

## Daily log flow

- If today's daily log isn't complete yet: run through all sections as
  today's app already does — first section shown, collapses on "Done", next
  section shown, repeat until everything's complete, then a "Run analysis"
  button appears.
- If today's daily log **is** already complete: show the **concatenated
  version** of the log instead of the blank form, with each section
  collapsed but expandable if the user wants to amend it. A **"re-run
  analysis"** button appears instead of "run analysis" — re-running should
  **emphasize the diff / what changed** since the last run, not just repeat
  the same analysis.
- A button to jump directly into the chat where the day's analysis first
  ran, to continue that conversation.
- **Backend**: edits made after the first run are stored as a "modify" event
  in a modify/audit log (for time-stamped re-analysis), and then aggregated
  into the most-current version of that day's daily log — i.e. the modify
  log is an audit trail, but the daily log record itself always reflects the
  latest state.
- **Chat history itself is not retained long-term** — only the *aggregated*
  observations about the user's condition/preferences over time are kept
  (e.g. constitution-file-style notes), not the raw chat transcripts.

### Analysis result screen (after "Run analysis")

1. Current body condition in short TCM terms (e.g. 上火, 脾虛).
2. A brief conclusion.
3. A visible flag/disclaimer: AI-generated, not a doctor's diagnosis.
4. A "details" version behind a toggle (collapsed by default).
5. A chat space to continue talking with the skill about today's result.
6. A concatenated plain-text version of the whole day's log, copyable, at
   the bottom (this is the same manual-bridge fallback the current app
   already has — kept as a safety net even once in-app chat exists).

## Navigation bar

Four items, home in the middle-ish position:
- Second from left: chat
- Middle: home
- Second from right: daily log / user profile (grouped)
- Last (rightmost): history log

(Her exact wording groups "daily log and user profile" as one nav position —
worth confirming whether that's really one combined destination or two
items that got merged in the description.)

## UX idea flagged for discussion

- Should the app show a calendar of which days the user actually completed
  the daily log? Two possible purposes in tension: (a) a retention/streak
  mechanic, or (b) a practical way to go back and fill in missed days. Not
  decided which framing (or both) is the goal.

## "What if" scenarios to design for

1. User fills in the daily log while not on her period (so the pre-period
   section shows), and her period actually starts partway through the same
   day. Both the pre-period section AND the period section should show for
   that day (not just whichever phase was true when she started filling it
   in).

## Backlog ideas mentioned alongside the journey

- **A "cabinet" feature**: tracks tea variations and supplements. For
  supplements taken daily, log them each day; for supplements not taken
  daily, let the user mark them as "as-needed"/non-daily so they show up as
  optional rather than expected every day.

## Profile / user-type requirements (must be in the final version)

- Profile must account for: **menopause**, **trying to conceive**,
  **pregnant** — likely asked once up front and saved to the profile, since
  each of these changes what should be asked and how advice should be
  screened.
- **Special skill variants needed** (beyond the standard skill) for
  pregnancy, menopause, and birth-control users — extra safety
  double-checking and question-screening logic specific to each, not just
  the general skill applied to everyone.

## Privacy model — stated as the app's top priority

- Research/trend-analysis data must be collected so that **no one can tie a
  userID back to a real identity** — no email address stored at all.
- Default mode: **local storage only**, for the user's own personal memory —
  nothing leaves the device unless the user opts in.
- **Opt-in research participation** is the only path to (a) contributing to
  aggregate trend research and (b) unlocking a more tailored/personalized
  version of the skill's daily assessment as a "perk" for participating.

**Note for later architecture discussion**: this privacy model (local-only
by default, anonymized opt-in sync) is a different data model than what the
current Sprint-1 build uses (Artifact `db` capability, keyed to the user's
Claude account, plus a separate personal GitHub repo for backup) — worth
resolving deliberately once the real app's tech stack is decided, rather
than assuming the current approach carries forward unchanged.
