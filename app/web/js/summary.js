// Turns a stored entry into readable "label：value" lines. Shared by the
// daily log's Run analysis summary and the calendar's read-only preview, so
// what you review is exactly what gets analysed.

import { T } from "./i18n.js";
import { SCHEMA, ALWAYS_ON, CONDITIONAL, RETIRED, NONE_MARKERS, MOOD_WORDS } from "./schema.js";

// Supplements are stored under their own key (they used to be their own
// section) but read out inside the diet section, where they are now ticked.
// The names taken are stored, so a day still reads correctly after an item is
// renamed or removed from the cabinet.
function cabinetLines(cabinet = {}, label) {
  const lines = [];
  if (Array.isArray(cabinet.taken) && cabinet.taken.length) {
    lines.push({ label, text: cabinet.taken.join("、") });
  }
  if (cabinet.notes) lines.push({ label: T("藥櫃備註||Cabinet notes"), text: cabinet.notes });
  return lines;
}

export function sectionOrder(phase) {
  return ALWAYS_ON.concat(CONDITIONAL.filter((id) => SCHEMA[id].condition(phase)));
}

// What gets read out: the sections asked today, plus retired ones, which only
// show when a day logged before they were retired has answers in them.
export function readOrder(phase) {
  return sectionOrder(phase).concat(RETIRED);
}

function detailVisible(field, value) {
  if (!field.details) return false;
  const t = field.detailsTrigger;
  if (t === "always") return value !== null && value !== undefined && value !== "";
  if (t === "any") {
    const excl = field.excludeValues || [];
    if (Array.isArray(value)) return value.some((v) => !excl.includes(v));
    return !!value && !excl.includes(value);
  }
  if (Array.isArray(value)) return value.includes(t);
  return value === t;
}

export function getActiveDetails(field, value) {
  if (field.detailsByValue) {
    if (Array.isArray(value)) {
      for (const key of Object.keys(field.detailsByValue)) {
        if (value.includes(key)) return field.detailsByValue[key];
      }
      return null;
    }
    return field.detailsByValue[value] || null;
  }
  if (field.details && detailVisible(field, value)) return field.details;
  return null;
}

function isFilled(v) {
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && v !== "";
}

function summarizeDetailValue(dv) {
  if (!isFilled(dv)) return null;
  return Array.isArray(dv) ? dv.map(T).join("、") : T(dv);
}

// One section's answered fields as [{ label, text }].
export function sectionLines(secId, ans = {}, all = {}) {
  const lines = [];
  SCHEMA[secId].fields.forEach((f) => {
    if (f.type === "cabinet") { cabinetLines(all.cabinet, T(f.label)).forEach((l) => lines.push(l)); return; }
    const v = ans[f.id];
    const other = ans[f.id + "__other"];
    const hasValue = isFilled(v);
    if (!hasValue && !other) return;
    let text = hasValue ? (Array.isArray(v) ? v.map(T).join("、") : T(v)) : "";
    const activeDetails = getActiveDetails(f, v);
    if (activeDetails) {
      const dparts = activeDetails.map((d) => {
        const s = summarizeDetailValue(ans[f.id + "__" + d.id]);
        return s ? (T(d.label) + "：" + s) : null;
      }).filter(Boolean);
      if (dparts.length) text += "（" + dparts.join("；") + "）";
    }
    if (f.type === "multi" && f.perItemSeverity) {
      const sevParts = (v || []).filter((x) => !NONE_MARKERS.includes(x)).map((x) => {
        const s = summarizeDetailValue(ans[f.id + "__sev__" + encodeURIComponent(x)]);
        return s ? (T(x) + "程度：" + s) : null;
      }).filter(Boolean);
      if (sevParts.length) text += "（" + sevParts.join("；") + "）";
    }
    if (other) text += (hasValue ? "；" : "") + "其他：" + other;
    lines.push({ label: T(f.label), text });
  });
  return lines;
}

// A day counts as reviewable as soon as anything at all was recorded — it does
// not need to be complete.
export function entryHasData(entry) {
  if (!entry || !entry.answers) return false;
  const { meta = {}, ...sections } = entry.answers;  // `cabinet` counts as a section here
  if (meta.moodRating || meta.cyclePhase) return true;
  return Object.values(sections).some((sec) => sec && Object.values(sec).some(isFilled));
}

export function summarizeEntry(entry) {
  const answers = (entry && entry.answers) || {};
  const meta = answers.meta || {};
  const order = sectionOrder(meta.cyclePhase);
  return {
    mood: meta.moodRating ? T(MOOD_WORDS[meta.moodRating - 1]) : "",
    phase: meta.cyclePhase ? T(meta.cyclePhase) : "",
    advice: answers.advice?.text || "",
    doneCount: order.filter((id) => (entry.done || []).includes(id)).length,
    totalCount: order.length,
    sections: readOrder(meta.cyclePhase)
      .map((secId) => ({ secId, title: T(SCHEMA[secId].title), lines: sectionLines(secId, answers[secId], answers) }))
      .filter((s) => s.lines.length),
  };
}
