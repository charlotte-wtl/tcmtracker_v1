# PRD v1 — TCM Daily Tracker (the "real app")

Status: **draft v1**, 2026-09-15. Synthesized from the 2026-09-13 user-journey
draft (`user-journey-draft-2026-09-13.md`), the backlog (`backlog.md`), sprint
feedback (`sprint2-feedback.md`), and the 2026-09-15 clarifying-question round
(see "Resolved decisions" below). This supersedes those documents as the
single planning reference for Sprint 2+; they stay in place as source
material, not duplicated here in full.

Sprint 1 (the Claude Artifact daily-log tool, still live and in daily use at
`app/daily-log.html`) is explicitly **not** being replaced by this PRD yet —
see "Migration" at the end.

---

## 1. Vision

A private, bilingual (ZH/EN) daily TCM health-tracking app. You log a
structured daily questionnaire, get a bilingual TCM-pattern analysis, and
build a long-term constitutional profile — without anyone but you ever being
able to tie the data back to your identity. Local-first by default; sharing
data for research or a more tailored analysis is an explicit opt-in perk, never
the default.

## 2. Resolved decisions (2026-09-15)

| Decision | Resolution |
|---|---|
| **Tech stack** | Real coded web app with its own backend, built in JS (not staying on the Claude Artifact long-term, not native/App Store for v1). Top priority for the whole build: **saving what the user does must be bulletproof** — this was explicitly called out as the one thing that must not regress from the Artifact bug that started this PRD. |
| **Retention/completion calendar** | Not a streak/gamification mechanic. Purpose: **a calendar picker to jump back to any past day, view its log, and edit it** — a navigation + amendment tool, not a habit-streak display. |
| **Nav bar** | **5 destinations, not 4**: chat, daily log, home, profile, history are each their own item — "daily log" and "profile" are two separate destinations, not one grouped entry as the original draft's wording suggested. |
| **~5 months of pre-app TCM history** | Bring it into the new system. Storage: **stays in `personal_tcm_daily_log` (the private data repo), never in the app/tracker repo.** Product shape: a **profile-level upload/import feature** — the user attaches her prior history (including period history) to her profile, rather than it being pre-seeded into the app's own database structure. |

## 3. Non-functional requirement: data durability (P0, informed by the Sprint 1 bug)

This is called out as its own requirement, not folded into "storage," because
it's the direct lesson from the bug that triggered this PRD: the Artifact
version silently lost any input inside a section until that section's "Done"
button was pressed. Whatever the real app's storage layer turns out to be
(see open question in §7), it must satisfy:

- Every field change (button tap, text keystroke, slider drag) is persisted
  within ~1-2 seconds, not just on an explicit save/done action.
- Reopening the app — same day or any previous day — resumes exactly what
  was last saved, including inside a not-yet-completed section.
- A visible, honest save-state indicator ("Saved" / "Saving..." / "Unsaved —
  offline") at all times — never a silent failure.
- If the primary storage is unreachable, the app degrades to a local,
  on-device fallback (not silent data loss) and clearly tells the user their
  entry hasn't left the device yet.
- This requirement applies uniformly to every future data-entry surface
  (profile setup, cabinet/supplement log, mood check-in) — not just the daily
  questionnaire.

## 4. User journey (from the 2026-09-13 draft, incorporating resolutions above)

### 4.1 App entry
1. Loading screen.
2. Today's date + a mood check-in (timestamped, feeds a mood/health calendar).
3. **Home**: current cycle day + next-period estimate (with an override
   control, since "on my period or not" changes which daily-log sections
   show), current body condition (latest analysis), and entry points to
   daily log, profile, chat, and history.

### 4.2 Daily log
- Incomplete today → sequential section flow (as Sprint 1 already works):
  one section open at a time, "Done" collapses and reveals the next, until a
  "Run analysis" button appears.
- Complete today → show the **concatenated version**, sections collapsed but
  expandable to amend. Button becomes **"Re-run analysis"**, which must
  **emphasize the diff** — what changed since the last run — not just
  regenerate from scratch.
- A shortcut into the chat thread where that day's analysis first ran.
- **What-if**: if the log is started expecting no period and the period
  starts partway through the same day, **both** the pre-period and period
  sections become available for that day, not just whichever was true when
  the user started.
- Edits after the first run are recorded as timestamped "modify" events (an
  audit trail), then folded into the current version of that day's record —
  the record itself always reflects the latest state; the audit trail is
  separate and never shown as the primary view.
- Chat transcripts themselves are **not** retained long-term — only
  aggregated, distilled observations about the user's condition/preferences
  over time (constitution-file style), consistent with how the skill already
  works.

### 4.3 Analysis result screen
1. Current condition in short TCM terms (e.g. 上火, 脾虛).
2. Brief conclusion.
3. Visible AI-generated / not-a-diagnosis disclaimer.
4. Collapsed-by-default "details" toggle.
5. In-app chat to continue discussing the result (replaces the current
   manual copy-paste-into-a-separate-chat bridge — see §7 open question on
   sequencing).
6. Copyable plain-text summary at the bottom, kept as a permanent fallback
   even once in-app chat exists.

### 4.4 Navigation bar (resolved: 5 items)
Chat · Daily log · Home · Profile · History — each its own destination.
(Design note to carry into the visual pass: this is one more icon than the
Sprint 1.5 nav design assumed — needs a layout revisit, not just a content
swap.)

### 4.5 Completion / history calendar (resolved: navigation tool, not a streak)
A calendar view (likely inside "History") where any past day can be tapped
to open, review, and edit that day's log — including days that were skipped
entirely at the time.

### 4.6 Profile
Captured up front, changes what's asked and how advice is screened:
- User type: **menopause**, **trying to conceive**, or **pregnant** (mutually
  exclusive or independently trackable — see §7 open question).
- **History import**: upload/attach prior TCM history (~5 months), including
  past period history, at the profile level. Source data stays in
  `personal_tcm_daily_log`; the app treats it as an attached reference the
  skill can draw on, not as pre-migrated structured daily-log rows (those two
  are different things — see §7).

### 4.7 Cabinet (backlog → promoted into this PRD's scope for Sprint 2/3 planning, not necessarily v1 build)
Tea-variation + supplement tracker. Daily supplements logged each day;
non-daily ones marked "as-needed" so the app doesn't nag on days they're
skipped by design.

## 5. Special skill variants (from backlog, carried forward as a requirement)

Pregnancy, menopause, and birth-control users each need extra
safety-screening logic layered on top of the general `tcm-daily-tracker`
skill — not the general skill applied uniformly. This gates directly on the
profile's user-type field (§4.6) and must be resolved before those user
types are supported, not shipped as a "coming soon" toggle.

## 6. Privacy & data model (stated priority: highest)

- No one — including the operator of any future research/aggregate feature —
  can tie a userID back to a real identity. No email stored.
- **Default: local storage only**, for the user's own use. Nothing leaves the
  device unless the user opts in.
- **Opt-in research participation** unlocks (a) contributing anonymized data
  to aggregate trend research and (b) a more tailored/personalized skill
  experience, as a stated "perk" — never a requirement to use the core app.
- This is a materially different model from the current Sprint 1 Artifact
  `db` (tied to the user's Claude account) + `personal_tcm_daily_log` GitHub
  repo approach. The real app's storage layer needs to be chosen (§7) with
  this model as the target, not an assumption that the current approach
  carries forward.

## 7. Open questions — need your call before/during build, not blocking this draft

1. **Hosting/backend choice for the real web app.** "JS" + "own backend" was
   confirmed, but not which stack (e.g. a lightweight Node/Postgres setup vs.
   a BaaS like Supabase/Firebase with local-first sync support). This choice
   is downstream of the privacy model in §6 (local-first + anonymized
   opt-in sync is easier with some backends than others) — recommend
   resolving this as the first Sprint 2 technical spike, informed by §6.
2. **Auth model.** Local-first + no email means "how does the user's data
   follow them to a new device" needs an answer (passphrase-based recovery?
   device-linked keys? accepting single-device-only for v1?). Not yet
   discussed.
3. **Profile user-type field**: can a user be more than one of
   menopause/TTC/pregnant over time (e.g. TTC → pregnant), and if so does
   switching preserve/re-screen prior entries, or just change what's asked
   going forward?
4. **History import mechanics (§4.6)**: what format is the ~5 months of
   prior history actually in today, and does "upload to profile" mean a
   file attachment the skill reads as unstructured reference material, or
   does it get parsed into the same structured per-day schema as new
   entries? These have very different build costs.
5. **In-app chat/analysis integration sequencing** (backlog: "direct skill
   integration," PROJECT_STATE Sprint 4): does this ship in the same phase
   as the rest of the real-app rebuild, or after, keeping the manual
   copy-paste bridge as-is in the meantime?
6. **Structured summary card final format** — draft shape exists in
   `sprint2-feedback.md`, not finalized.
7. **Section 5 (Liver/Spleen/Kidney) daily-cadence review** — whether slow,
   chronic items like hair loss/greying belong in a *daily* log at all.
8. **Tongue-photo capture** (backlog) — feasible via image-capable model
   calls; still waiting on the reference photo you mentioned attaching.

## 8. Phasing (proposed, not yet committed)

- **Sprint 2**: resolve §7.1-2 (hosting + auth), stand up the real app's
  skeleton with the 5-item nav and the P0 auto-save requirement (§3) proven
  out first — before porting any UI polish — since that's the requirement
  most directly motivated by real pain you've already hit.
- **Sprint 3**: daily log + analysis screens ported from the Artifact,
  profile (including history import once §7.4 is answered), completion
  calendar.
- **Sprint 4**: in-app chat/analysis integration, cabinet feature, special
  skill variants (§5).

## 9. Migration

Sprint 1 (`app/daily-log.html`, the Claude Artifact) stays live and in daily
use throughout Sprints 2-4 — it is not paused, frozen, or replaced until the
real app's daily-log flow is confirmed at parity. `personal_tcm_daily_log`
remains the durable data store for anything logged in the meantime.
