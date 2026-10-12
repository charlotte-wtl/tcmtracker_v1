// Cycle insights, after Clue's: for one symptom, how many days of each cycle
// had it, and where in the cycle those days fell. Pure — entries and periods
// in, numbers out — so it can be checked without a screen.
//
// A symptom's level on a day: 0 not present, 1–4 mild → very severe, -1
// present but no intensity recorded, null nothing logged that day. Only days
// with something logged count, so a gap in logging never reads as "no cramps".

import { activePeriods, addDays, daysBetween, periodEnd } from "./cycle.js";

const YES = "有||Yes";
const SEV3 = { "輕||Mild": 1, "中||Moderate": 2, "重||Severe": 3 };
const has = (v, x) => Array.isArray(v) && v.includes(x);

function sev3(v) { return SEV3[v] || -1; }
// The four-step per-item severity used in 肝脾腎 signs.
function itemSev(sec, fieldId, item) { return sev3(sec?.[fieldId + "__sev__" + encodeURIComponent(item)]); }
function painScore(score) {
  const n = Number(score);
  if (score === undefined || score === "" || Number.isNaN(n)) return -1;
  if (n <= 0) return 0;
  return n <= 3 ? 1 : n <= 5 ? 2 : n <= 7 ? 3 : 4;
}
// Several sources for one symptom: the strongest wins; "present, no
// intensity" only if nothing gave a level.
function strongest(levels) {
  const present = levels.filter((l) => l && l !== 0);
  if (!present.length) return 0;
  const graded = present.filter((l) => l > 0);
  return graded.length ? Math.max(...graded) : -1;
}

export const SYMPTOMS = [
  { id: "cramps", label: "經痛／小腹痛||Cramps", read: (a) => strongest([
    a.period?.painType?.length ? painScore(a.period.painType__score) : 0,
    a.preperiod?.bellyPain === YES ? sev3(a.preperiod.bellyPain__sev) : 0,
    a.preperiod?.abdomenPain === YES ? sev3(a.preperiod.abdomenPain__sev) : 0,
  ]) },
  { id: "lowerBack", label: "腰痠痛||Lower back", read: (a) => strongest([
    a.preperiod?.backPain === YES ? sev3(a.preperiod.backPain__sev) : 0,
    a.period?.backache === YES ? sev3(a.period.backache__sev) : 0,
    has(a.postperiod?.lingering, "腰痠||Back soreness") ? -1 : 0,
    has(a.organs?.kidneySigns, "腰膝酸軟||Sore back/knees") ? itemSev(a.organs, "kidneySigns", "腰膝酸軟||Sore back/knees") : 0,
  ]) },
  { id: "breast", label: "乳房脹痛||Breast tenderness", read: (a) => {
    const src = a.cyclesigns?.breastTenderness === YES ? a.cyclesigns : a.preperiod?.breastTenderness === YES ? a.preperiod : null;
    if (!src) return 0;
    return strongest((src.breastTenderness__sev || []).map(sev3).concat(-1));
  } },
  { id: "headache", label: "頭痛||Headache", read: (a) => strongest([
    a.preperiod?.headache === YES ? -1 : 0,
    has(a.period?.symptoms, "頭痛||Headache") ? -1 : 0,
    has(a.organs?.liverSigns, "頭部兩側或頭頂痛||Temple/vertex headache") ? itemSev(a.organs, "liverSigns", "頭部兩側或頭頂痛||Temple/vertex headache") : 0,
  ]) },
  { id: "breakouts", label: "長痘||Breakouts", read: (a) => strongest([
    a.skin?.breakouts === YES ? Math.min(4, Math.max(1, (a.skin.breakouts__location || []).length)) : 0,
    has(a.preperiod?.skinChange, "長痘||Breakouts") ? -1 : 0,
    has(a.general?.complexion, "新增痘痘||New breakouts") ? -1 : 0,
  ]) },
  { id: "mood", label: "情緒低落或煩躁||Low or irritable mood", read: (a) => {
    const low = ["煩躁易怒||Irritable", "焦慮不安||Anxious", "情緒低落||Low mood", "容易哭泣||Tearful"]
      .filter((x) => has(a.general?.emotions, x)).length;
    const swing = a.preperiod?.moodSwing && a.preperiod.moodSwing !== "無明顯||None" ? 2 : 0;
    return strongest([low ? Math.min(4, low) : 0, swing]);
  } },
  { id: "bloating", label: "腹脹||Bloating", read: (a) => strongest([
    has(a.general?.giSymptoms, "脹氣||Bloating") ? -1 : 0,
    has(a.general?.giSymptoms, "飯後腹脹嗜睡||Post-meal bloat & sleepy") ? -1 : 0,
    has(a.general?.appetite, "食後腹脹||Bloating after eating") ? -1 : 0,
    has(a.preperiod?.bellyPain__nature, "脹||Bloated") ? sev3(a.preperiod.bellyPain__sev) : 0,
  ]) },
  { id: "fatigue", label: "疲倦||Fatigue", read: (a) => {
    const energy = Number(a.general?.energyScore);
    return strongest([
      energy && energy <= 2 ? 4 - energy : 0,
      has(a.period?.symptoms, "疲憊嗜睡||Fatigue") ? -1 : 0,
      has(a.organs?.kidneySigns, "精神疲憊腿軟無力||Fatigue, weak legs") ? itemSev(a.organs, "kidneySigns", "精神疲憊腿軟無力||Fatigue, weak legs") : 0,
    ]);
  } },
  { id: "sleep", label: "睡不好||Poor sleep", read: (a) => {
    const q = Number(a.sleep?.sleepQuality);
    const onset = a.sleep?.onsetEase;
    return strongest([
      q && q <= 2 ? 4 - q : 0,
      onset === "輾轉難眠（超過30分）||Tossed and turned (30+ min)" ? 2 : 0,
      onset === "幾乎整夜難眠||Almost no sleep" ? 4 : 0,
    ]);
  } },
  { id: "spotting", label: "點滴出血||Spotting", read: (a) => (a.cyclesigns?.spotting === YES || a.regularday?.spotting === YES ? -1 : 0) },
  { id: "sidePain", label: "單側下腹痛||One-sided pain", read: (a) => (a.cyclesigns?.sidePain === YES ? -1 : 0) },
  { id: "dryness", label: "皮膚乾燥||Dry skin", read: (a) => {
    const d = Number(a.skin?.dryness);
    if (a.skin?.dryness === undefined || a.skin?.dryness === "") return 0;
    return d <= 1 ? 0 : Math.min(4, d - 1);
  } },
];

function logged(entry) {
  const a = entry?.answers;
  if (!a) return false;
  return Object.entries(a).some(([key, sec]) => key !== "meta" && key !== "analysis" && key !== "advice"
    && sec && typeof sec === "object" && Object.values(sec).some((v) => (Array.isArray(v) ? v.length : v !== undefined && v !== "" && v !== null)));
}

export function symptomLevel(symptom, entry) {
  if (!logged(entry)) return null;
  return symptom.read(entry.answers) || 0;
}

// Cycles from period starts: each runs to the day before the next start; the
// last runs to today. Gaps over 90 days are missed logging, not a cycle.
export function cyclesOf(periods, today) {
  const list = activePeriods(periods).filter((p) => p.start <= today);
  return list.map((p, i) => {
    const next = list[i + 1];
    const end = next ? addDays(next.start, -1) : today;
    const length = daysBetween(p.start, end) + 1;
    return {
      start: p.start, end, length, current: !next,
      periodDays: daysBetween(p.start, periodEnd(p, list)) + 1,
      // After-the-fact ovulation estimate for a finished cycle (next start − 13).
      ovulationDay: next ? length - 13 + 1 : null,
    };
  }).filter((c) => c.current || c.length <= 90);
}

export function symptomInsights(symptom, entries, periods, today) {
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const cycles = cyclesOf(periods, today).map((c) => {
    const days = [];
    for (let i = 0; i < c.length; i++) {
      const date = addDays(c.start, i);
      days.push({ date, day: i + 1, level: symptomLevel(symptom, byDate.get(date)) });
    }
    const loggedDays = days.filter((d) => d.level !== null).length;
    const withSymptom = days.filter((d) => d.level !== null && d.level !== 0).length;
    return { ...c, days, loggedDays, withSymptom };
  });
  const withLogs = cycles.filter((c) => c.loggedDays > 0);
  const finished = withLogs.filter((c) => !c.current);
  const average = finished.length ? finished.reduce((s, c) => s + c.withSymptom, 0) / finished.length : null;
  const last = finished[finished.length - 1] || null;
  const current = withLogs.find((c) => c.current) || null;
  // Which cycle days it tends to land on, across every logged cycle.
  const dayCounts = {};
  withLogs.forEach((c) => c.days.forEach((d) => { if (d.level) dayCounts[d.day] = (dayCounts[d.day] || 0) + 1; }));
  return { cycles: withLogs, finishedCount: finished.length, average, last, current, dayCounts };
}
