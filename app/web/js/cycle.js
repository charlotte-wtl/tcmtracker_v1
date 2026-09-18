// Cycle maths, kept pure (no storage, no DOM) so it can be tested directly.
//
// Method, agreed with the user and checked against published data:
// - cycle length = days between consecutive period starts; gaps over 90 days
//   are treated as missed logging, not cycles
// - next period = last start + mean of the last 6 cycles, shown as a range of
//   ± that variation (at least 2 days)
// - ovulation ≈ next period − 13 days (the luteal phase is the stable part of
//   the cycle; Bull et al. 2019), fertile window = 5 days before + that day
// - when the last cycles differ by more than 9 days (FIGO "irregular"), no
//   ovulation forecast is shown; instead each finished cycle gets an
//   after-the-fact estimate (its next start − 13)

const MAX_CYCLE = 90;
const RECENT = 6;
const LUTEAL = 13;
const IRREGULAR_RANGE = 9;
const DEFAULT_PERIOD_LENGTH = 5;

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); // calendar arithmetic only
}

export function daysBetween(a, b) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
}

function mean(xs) { return xs.reduce((s, x) => s + x, 0) / xs.length; }
function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function stdev(xs) {
  const mu = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - mu) ** 2)));
}

// periods: [{ start, end?, deleted? }] in any order.
export function activePeriods(periods) {
  return (periods || []).filter((p) => p && !p.deleted && p.start).sort((a, b) => (a.start < b.start ? -1 : 1));
}

export function typicalPeriodLength(periods) {
  const lens = activePeriods(periods)
    .filter((p) => p.end)
    .map((p) => daysBetween(p.start, p.end) + 1)
    .filter((n) => n >= 2 && n <= 12) // 1-day records are usually incomplete logging
    .slice(-RECENT);
  return lens.length ? Math.round(median(lens)) : DEFAULT_PERIOD_LENGTH;
}

// The last day of a period. An ongoing period with no end yet is assumed to
// last the user's typical length.
export function periodEnd(period, periods) {
  if (period.end) return period.end;
  return addDays(period.start, typicalPeriodLength(periods) - 1);
}

export function cycleLengths(periods) {
  const starts = activePeriods(periods).map((p) => p.start);
  const out = [];
  for (let i = 1; i < starts.length; i++) {
    const len = daysBetween(starts[i - 1], starts[i]);
    if (len > 0 && len <= MAX_CYCLE) out.push({ from: starts[i - 1], to: starts[i], length: len });
  }
  return out;
}

export function cycleStats(periods) {
  const recent = cycleLengths(periods).slice(-RECENT).map((c) => c.length);
  if (!recent.length) return { count: 0, recent };
  const avg = mean(recent);
  const range = Math.max(...recent) - Math.min(...recent);
  return {
    count: recent.length,
    recent,
    average: Math.round(avg),
    variation: Math.max(2, Math.round(stdev(recent))),
    range,
    shortest: Math.min(...recent),
    longest: Math.max(...recent),
    regular: recent.length >= 2 && range <= IRREGULAR_RANGE,
  };
}

// Everything the Home screen and the log's cycle line need for one day.
export function cycleStatus(periods, today) {
  const list = activePeriods(periods).filter((p) => p.start <= today);
  const stats = cycleStats(list);
  if (!list.length) return { hasData: false, stats };

  const last = list[list.length - 1];
  const cycleDay = daysBetween(last.start, today) + 1;
  const lastEnd = periodEnd(last, list);
  const inPeriod = today <= lastEnd && (!!last.end || cycleDay <= 15);

  const status = { hasData: true, stats, lastStart: last.start, cycleDay, inPeriod, periodEnd: lastEnd, periodEndIsEstimate: !last.end };
  if (!stats.count) return status; // one period recorded: no cycle length yet

  const expected = addDays(last.start, stats.average);
  status.nextPeriod = {
    expected,
    from: addDays(expected, -stats.variation),
    to: addDays(expected, stats.variation),
  };
  status.daysUntilPeriod = daysBetween(today, expected);
  status.late = today > status.nextPeriod.to;

  if (stats.regular) {
    const ovulation = addDays(expected, -LUTEAL);
    status.ovulation = { expected: ovulation, fertileFrom: addDays(ovulation, -5), fertileTo: ovulation };
    status.daysUntilOvulation = daysBetween(today, ovulation);
  }
  return status;
}

// Days of 經前 before a period starts, and of 經後 after one ends.
export const PHASE_WINDOW = 7;

// The phase a day most likely is, from the periods on record:
//   "period"  inside a recorded period;
//   "post"    within PHASE_WINDOW days after one ends;
//   "pre"     within PHASE_WINDOW days before the next start — the actual one
//             for a past day, the predicted one otherwise — and on until the
//             period starts if it is late;
//   "regular" any other day.
// null when there is nothing to go on. Recorded periods beat predictions,
// so 經後 wins where a short cycle makes the two windows meet.
export function likelyPhase(periods, date) {
  const list = activePeriods(periods);
  if (!list.length) return null;
  if (periodCovering(list, date)) return "period";
  const before = list.filter((p) => p.start <= date);
  const last = before[before.length - 1];
  if (last) {
    const sinceEnd = daysBetween(periodEnd(last, list), date);
    if (sinceEnd >= 1 && sinceEnd <= PHASE_WINDOW) return "post";
  }
  const next = list.find((p) => p.start > date);
  if (next) return daysBetween(date, next.start) <= PHASE_WINDOW ? "pre" : "regular";
  const status = cycleStatus(list, date);
  if (status.nextPeriod && status.daysUntilPeriod <= PHASE_WINDOW) return "pre";
  return "regular";
}

// After-the-fact ovulation estimates for every finished cycle.
export function pastOvulationEstimates(periods) {
  return cycleLengths(periods).map((c) => addDays(c.to, -LUTEAL));
}

// Calendar day sets: recorded period days, predicted next-period range.
export function calendarCycleDays(periods, today) {
  const list = activePeriods(periods);
  const periodDays = new Set();
  const estimatedPeriodDays = new Set();
  list.forEach((p) => {
    const end = periodEnd(p, list);
    for (let d = p.start; d <= end; d = addDays(d, 1)) {
      // Days of an ongoing period beyond today are only an estimate.
      if (!p.end && d > today) estimatedPeriodDays.add(d);
      else periodDays.add(d);
    }
  });
  const predictedDays = new Set();
  const status = cycleStatus(list, today);
  if (status.nextPeriod) {
    for (let d = status.nextPeriod.from; d <= status.nextPeriod.to; d = addDays(d, 1)) {
      if (d > today) predictedDays.add(d);
    }
  }
  return {
    periodDays,
    estimatedPeriodDays,
    predictedDays,
    ovulationEstimates: new Set(pastOvulationEstimates(list)),
  };
}

// The period (if any) whose range covers a date.
export function periodCovering(periods, date) {
  const list = activePeriods(periods);
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    if (p.start > date) continue;
    return date <= periodEnd(p, list) ? p : null;
  }
  return null;
}
