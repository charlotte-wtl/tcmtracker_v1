// Changes to the user's period records (cycle.json), and the two-way link
// with the daily log: marking a period start sets that day's log to 經期.

import { getCycle, saveCycle, queuePush } from "./sync.js";
import { getEntry, putEntry } from "./db.js";
import { SCHEMA } from "./schema.js";
import { activePeriods, periodEnd, addDays, daysBetween } from "./cycle.js";
import { todayStr } from "./dates.js";

export const PERIOD_PHASE = "經期||Period";

function blankAnswers() {
  const a = { meta: {} };
  Object.keys(SCHEMA).forEach((secId) => { a[secId] = {}; });
  return a;
}

function stamp(p) { return { ...p, updatedAt: Date.now() }; }

// Marking a period start is the stronger signal, so it sets that day's log to
// 經期 even if another phase (e.g. 經前) was picked earlier.
async function setLogPhaseToPeriod(date) {
  const entry = await getEntry(date);
  const answers = entry?.answers || blankAnswers();
  if (!answers.meta) answers.meta = {};
  if (answers.meta.cyclePhase === PERIOD_PHASE) return;
  answers.meta.cyclePhase = PERIOD_PHASE;
  await putEntry({ ...(entry || { date, done: [] }), date, answers, updatedAt: Date.now() });
  queuePush(date);
  window.dispatchEvent(new CustomEvent("tcm:data-changed", { detail: { dates: [date], cycle: false } }));
}

// The period whose range (start to actual or expected end, plus a few days'
// grace) a date falls into. Used to avoid recording one period twice.
function nearbyPeriod(periods, date, graceDays = 3) {
  const list = activePeriods(periods);
  return list.find((p) => date >= addDays(p.start, -graceDays) && date <= addDays(periodEnd(p, list), graceDays)) || null;
}

export async function startPeriod(date, source = "app") {
  const cycle = await getCycle();
  const existing = cycle.periods.find((p) => p.start === date);
  const periods = existing
    ? cycle.periods.map((p) => (p.start === date ? stamp({ start: date, source }) : p))
    : [...cycle.periods, stamp({ start: date, source })];
  // A start just after one that was never ended replaces the earlier guess:
  // two starts a few days apart are one period recorded twice.
  const list = activePeriods(periods);
  const idx = list.findIndex((p) => p.start === date);
  const prev = list[idx - 1];
  const merged = prev && !prev.end && daysBetween(prev.start, date) <= 7
    ? periods.map((p) => (p.start === prev.start ? stamp({ ...p, deleted: true }) : p))
    : periods;
  await saveCycle({ ...cycle, periods: merged });
  await setLogPhaseToPeriod(date);
}

export async function endPeriod(date) {
  const cycle = await getCycle();
  const current = activePeriods(cycle.periods).filter((p) => p.start <= date).pop();
  if (!current) return { ok: false, error: "no-period" };
  const periods = cycle.periods.map((p) => (p.start === current.start ? stamp({ ...p, end: date }) : p));
  await saveCycle({ ...cycle, periods });
  return { ok: true };
}

export async function addPastPeriod(start, end) {
  const cycle = await getCycle();
  if (start > todayStr()) return { ok: false, error: "future" };
  if (end && end < start) return { ok: false, error: "end-before-start" };
  const clash = nearbyPeriod(cycle.periods, start, 0) || (end && nearbyPeriod(cycle.periods, end, 0));
  if (clash) return { ok: false, error: "overlaps", with: clash.start };
  const record = stamp({ start, source: "manual", ...(end ? { end } : {}) });
  await saveCycle({ ...cycle, periods: [...cycle.periods.filter((p) => p.start !== start), record] });
  return { ok: true };
}

export async function deletePeriod(start) {
  const cycle = await getCycle();
  const periods = cycle.periods.map((p) => (p.start === start ? stamp({ ...p, deleted: true }) : p));
  await saveCycle({ ...cycle, periods });
}

// Imported periods are added only where nothing is recorded yet, so a
// re-import (or an import after marking periods in the app) never duplicates.
export async function importPeriods(imported, spottingDays) {
  const cycle = await getCycle();
  const today = todayStr();
  const periods = [...cycle.periods];
  let added = 0, skipped = 0;
  imported.forEach(({ start, end }) => {
    if (start > today) return;
    if (nearbyPeriod(periods, start)) { skipped++; return; }
    // A period still running at export time has no real end yet.
    const record = { start, source: "apple-health" };
    if (end && end < addDays(today, -1)) record.end = end;
    periods.push(stamp(record));
    added++;
  });
  const spotting = [...new Set([...(cycle.spotting || []), ...spottingDays])].sort();
  await saveCycle({ ...cycle, periods, spotting });
  return { added, skipped, spotting: spottingDays.length };
}
