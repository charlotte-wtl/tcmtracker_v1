# Clue screenshot analysis (2026-09-11)

5 screenshots saved in `clue-reference/`. Covers the "Track" (daily log) flow and the "Cycle" home screen.

## What Clue actually does
- **Cycle home screen**: circular cycle-progress ring, day count, status message ("Your period may start today"), an entry banner "How do you feel today?" that leads INTO the Track flow — it's a link/prompt, not an inline rating on the home screen itself.
- **Track screen is ONE continuous scroll**, not sequential/collapsible sections. Every category (Period, Spotting, Feelings, Pain, Sleep quality, Sleep, Energy, Mind, Social life, Cravings, Discharge, ...) is visible at once, stacked vertically, each with its own colored border (red/orange/blue by theme) and a "Learn more >" link.
- Each category is a **horizontally-scrollable row of square icon tiles** — icon + label underneath (e.g. a droplet icon for "Medium" flow, a cloud-with-question-mark for "Forgetful"). Not text chips.
- A **single "Save" button stays sticky** near the bottom of the screen as you scroll through the whole list — not one Save per section.
- Numeric entries (Sleep) use a large "00 hour 00 min" tappable field, not a plain number input.
- **One free-text "Daily note" field near the very end** of the whole list (0/3000 chars) — not one note per category.
- A "My tags" feature lets the user create custom tags — not in our current schema, just noting it exists.

## Two direct conflicts with what you asked me to build — need your call

1. **Sequential/collapsible vs. one continuous scroll.** You asked for sections that open one at a time (Done → collapse → next section opens). Clue does the opposite: everything is open in one long scroll, all the time, with a single sticky Save. These are genuinely different interaction models, not a styling detail. I'll build what YOU described (sequential reveal) since that was your explicit request and it also directly supports your stated goal of not feeling overwhelmed by ~79 questions at once — but flagging that this diverges from Clue's actual pattern in case you want to reconsider now that you've seen it side by side.
2. **Notes: one at the end vs. one per topic.** You asked for a notes field per topic (feeding the concatenated summary). Clue has exactly one note field at the very end, not per-section. Recommend keeping YOUR version (per-topic notes) since it maps better to a TCM log where the useful detail is often specific to one body system — but flagging the conflict.

## Design element worth adopting regardless of the above
- Icon tiles instead of plain chips would make the log noticeably faster to scan than my earlier text-chip mockup-in-words. Honest tradeoff: true custom icons for ~79 questions is a real illustration workload, not a quick add. For Sprint 1 I'd suggest text/emoji-labeled tiles with the same visual structure (square, bordered, label underneath) — same scan-ability, no illustration bottleneck — and treat hand-drawn icon sets as a backlog polish item.
