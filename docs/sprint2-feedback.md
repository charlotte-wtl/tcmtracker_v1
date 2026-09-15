# Sprint 2 feedback (from real first days of use, 2026-09-11/12) — design + schema

Captured from the user's actual first days of use. Schema/logic fixes below were shipped 2026-09-12 (ahead of the full brand/visual Sprint 2, at user's request, since she needed them before filling in the next day). Visual/animation/brand work is still fully deferred to the Sprint 2 design pass.

## ✅ Shipped 2026-09-15
- **Real continuous auto-save (bug fix, not a feature)**: previously, `saveCurrent()` — the function that actually writes to the database — only ran on the "Later" button, "Run analysis," and a section's "Done" button. Every option tap (single/multi/detail/scale — most fields in the app), every mood check-in tap, every cycle-phase tap, and every keystroke in a text field only updated in-memory state; none of it was persisted until the whole section was marked Done. This is exactly the bug the user hit: fill in half a section, close the tab or get interrupted, and it's gone. Fixed with a debounced auto-save (`scheduleAutoSave` — 1.2s after the last change, so rapid taps don't spam writes) wired into every input path, plus an immediate flush on `visibilitychange`/`pagehide` (more reliable than `beforeunload` for backgrounding a PWA on iOS). Reopening the app (same day or a previous day) now reloads whatever was last auto-saved, including inside a still-open, not-yet-Done section — this was already how `loadDate()` worked, it just never had fresh data to load.
- **Existing fallback for when the database is unreachable**: the app already shows a visible banner + forces manual "copy summary" backup when `db` is unavailable — this was not new, just confirmed still in place as the safety net for the auto-save gap the user asked about.

## ✅ Shipped 2026-09-14
- **Morning mood**: added 防禦性/Defensive.
- **Retroactive previous-day amendments (new mechanism)**: two new fields on today's form — "did you have a bowel movement yesterday?" (general, right under today's version, same branching) and "anything eaten after yesterday's last logged meal?" (diet). Answering either appends a clearly-marked, timestamped line ("［added from [today's date], added retroactively］...") to *yesterday's* stored notes field for that section — never overwrites yesterday's original answers, and creates yesterday's record from scratch if it didn't exist yet. Yesterday's document also gets `amended: true` at the top level for a future "which days were later completed" view. Triggered when the General/Diet section's "Done" button is pressed, not on every autosave, to avoid duplicate appends on repeated edits.
- **Diet section gained a `notes` field** (previously the only always-on section without one) — needed as the display target for the late-meal amendment when that day is reopened, and generally useful.

## ✅ Shipped 2026-09-13
- **Multi-select audit**: several fields that should allow more than one simultaneous answer were still `single`-type and have been converted to `multi`: 心智狀態/Mind (morning), 晨起口感/Morning mouth taste, 喉嚨狀況/Throat condition, 咳嗽／痰/Cough-Phlegm (morning), 汗/Sweating, 食慾/Appetite, 面色／皮膚/Complexion-Skin (general), 運動後身體反應/Post-exercise response (exercise), 皮膚變化/Skin changes, 分泌物型態/Discharge type (pre-period), 經期腹痛/Pain type (period), 是否有延續的不適/Lingering discomfort (post-period). Left as single where the options are genuinely mutually exclusive states (e.g. 寒熱/Cold-Heat, 脈位/Pulse position, 情緒波動型態/Mood swing pattern which already has a "both" option).
- **"Run analysis" button bug fix**: the button was disabled until every section was marked Done, so an incomplete day silently did nothing when tapped — no error, no summary, just looked broken. It's now always clickable and always shows the concatenated bilingual summary regardless of section-completion state.

## ✅ Shipped 2026-09-12
- **Sleep**: sleep-quality 1–5 buttons → slider control; added a notes field; 睡眠深淺 gained a "woken by external environment" option; 夢境性質 gained a "vivid, memorable, non-negative dream" option.
- **Morning Signs**: 晨起心情 → multi-select, added 無力 (lacking energy).
- **Tongue Diagnosis**: added a notes field.
- **General/Systemic**: 情緒 gained 太專注於工作 (too focused on work) and 思緒混亂 (chaotic thoughts); 汗 gained a "heat response without perspiring, flushing instead" option (a real gap the 9/12 skill conversation surfaced); bowel movement restructured into "did you have a bowel movement today?" first, branching to stool shape/colour (yes) or a constipation-type follow-up — 有便意但無力氣／無便意 (no).
- **Liver/Spleen/Kidney + Stress**: all four multi-selects now show a per-item severity picker (輕/中/重) for each symptom selected, not just a bare multi-select.
- **Exercise**: bedtime-stretch option relabelled to explicitly mean the previous night; added 腿外側 (outer leg) to stretch area.
- **Pre-period**: discharge gained a yellow option; breast tenderness's detail became multi-select and gained 乳頭敏感 (sensitive nipples) alongside severity.
- **Data durability**: sections now auto-save to the database the moment you tap Done, not only on the explicit Save/Run buttons — a half-finished day surviving a closed tab.
- **"Other" free text**: every choice-based field now has an always-visible "other, type here" text slot beneath its buttons.

## Not done yet — needs more than a schema tweak
- **"Next"/Done button in Chinese**: already resolved by the language toggle built earlier (中文/EN switch controls this button too) — not a new fix, just confirming it's covered.
- **Cycle-phase automation** (compute "day 32 of an avg 35-day cycle" instead of asking): blocked on having enough logged period-start dates to compute an average cycle length from — there's only 1-2 days of data in the new system so far. Revisit once there's real period history to compute from.
- **"Other"-answer analytics pipeline** (promote frequent free-text answers into real options, hide rarely-used ones): needs real multi-user usage volume to be meaningful — not buildable from one person's data. Later-stage item.
- **Section 5 daily-cadence review**: still open whether items like 頭髮易脫落或早白 (hair loss/greying — a slow, chronic change) belong in a *daily* log at all, versus a less-frequent check-in. Not changed yet, needs a decision, not just a fix.
- **Structured summary card + in-app chat space** (user's idea, Claude agrees — see reasoning below): real design + build work for Sprint 2/4, not a quick add.
- **Historical data depth**: the real skill conversation draws on ~5 months of the user's own history; our new log only starts 2026-09-11. Needs a decision on backfilling or how the app feeds history to the skill, before Sprint 4 is scoped for real.

## Structured summary + follow-up chat space (user's proposal, Claude agrees)
User's idea: rather than trying to fit the skill's full free-flowing analysis into rigid app UI, (1) design a **structured, decided-in-advance summary format** for at-a-glance display in the app, and (2) route the user into a **chat space** where they can ask follow-up questions while looking at the verdict, rather than only ever getting a static one-shot card.

**Claude's take: agree, and two real analyses are direct evidence for why.** The 汗/flushing correction (above) only got caught because the user could follow up conversationally — a static structured-only display would have shipped the wrong first conclusion with no way to fix it. The richer, more useful second analysis (full constitution diagnosis + plan) only happened because she asked a follow-up question ("how would you call my condition, what's your plan"), not from the structured data alone. Structure alone is not enough; the conversational layer is where a lot of the real value and error-correction happens.

**Proposed shape for the structured card** (draft, needs real design decision, not final):
- Safety flag, if any — shown first, visually distinct (e.g. the green-discharge/see-a-doctor flag from 9/12)
- 主要證型 (primary pattern) — one short line
- 今日重點 (today's key signal) — 1–2 lines
- 一項食療建議 (one food-therapy suggestion) — short, actionable
- A "continue / ask a question" action that opens the chat space with the same context already loaded

**Technical note**: feasible with the Artifact `sample` capability, which supports multi-turn conversation arrays (`[{role, content}]`), not just single one-shot calls — so "a chat space in the app" isn't a stretch beyond what's already available, just unbuilt.

## Cross-cutting note from actual use
The skill's two-pass analysis (single-day vs. a month+ of history) makes a strong case that **the app should be able to hand the skill more than one day's data at once** eventually — worth keeping in mind for the in-app analysis integration sprint.
