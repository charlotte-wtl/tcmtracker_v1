# Backlog (post-Sprint-1)

## From the 2026-09-13 user-journey draft (see `user-journey-draft-2026-09-13.md` for full context)
- **Cabinet feature**: tea-variation + supplement tracker. Daily supplements logged each day; non-daily ones flagged "as-needed" so they don't nag the user every day they're skipped.
- **Retention/completion calendar**: a calendar view of which days the daily log was completed — open question whether this is framed as a streak/retention mechanic, a "go back and fill in missed days" utility, or both.
- **Mid-day cycle-phase change**: if the user fills the log expecting pre-period and her period actually starts partway through the same day, both the pre-period AND period sections should be shown/fillable for that day, not just one.
- **Profile must capture user type up front**: menopause, trying to conceive, pregnant — changes which questions are asked and how advice is screened.
- **Special skill variants required**: pregnancy, menopause, and birth-control users each need extra safety double-checking / question-screening logic beyond the general skill — not just the general skill applied uniformly.
- **Re-run analysis with diff emphasis**: when a completed day's log is amended, "re-run analysis" should highlight what changed since the last run, not just regenerate the full analysis from scratch.
- **Chat history policy**: raw chat transcripts are not meant to be retained long-term — only aggregated observations/preferences distilled from them (constitution-file style), which is a different retention model than saving full conversations.
- **Privacy-first data model (stated as the app's top priority)**: local-storage-by-default, no email stored, userID not traceable to identity; remote sync + a more tailored skill experience are opt-in "perks" for research participants only. This is a different model from the current Sprint-1 Artifact `db` + personal GitHub repo approach — needs a deliberate decision once the real app's stack is chosen, not an assumption that the current approach just carries forward.


## Tongue photo analysis (from user's 康一康 reference app)
- Confirmed technically feasible via the Artifact `sample` capability (`claude.use('sample')`, image input supported when `sample.limits().images` is true) — page can call Claude directly with a tongue photo, no separate backend.
- User will attach a reference photo showing the overlay/instruction guide she wants shown during photo capture (e.g. how to position the tongue, lighting guidance) — attach it here once received, to brief the capture-UI design.
- Would likely replace the manual 舌診 (Tongue Diagnosis) question category once validated — do not remove those manual questions until this ships and is confirmed reliable.
- Not Sprint 1. Target: once core daily log is live and stable.

## In-app "Run Analysis" — direct skill integration
- User wants "Run Analysis" to run her existing daily-TCM-tracker Claude skill directly in the app, not just concatenate text for manual copy-paste.
- Important nuance to flag to user: a Claude Code "skill" (as configured in her CLI/desktop setup) is not something a published Artifact page can invoke directly — Artifacts run standalone and don't have access to her local skills registry.
- What IS achievable: read her skill's actual instructions/prompt content, embed that logic into a `sample` capability call from within the artifact, so the page gets an equivalent one-click in-app analysis experience without truly "calling the skill" by reference.
- Requires reading her actual skill file to embed correctly — do not guess its contents.
- Recommended sequencing: ship Sprint 1 with manual copy-paste fallback (already agreed as acceptable), evaluate in-app `sample` integration as a fast-follow once the skill's content is confirmed.

## CSV/analysis row on "Run Analysis"
- Every "Run Analysis" (or "Run Later") click should append one row to the stored data (CSV/db) with a completion timestamp, for later trend analysis — this is Sprint 1 in scope, not backlog, but noting here so it isn't lost among the above.
