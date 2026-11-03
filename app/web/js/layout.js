// Your own order for the daily log — sections, the questions inside them, and
// the answer options — kept in layout.json and synced like the cabinet. It is
// laid over SCHEMA rather than written into it: SCHEMA stays the shared
// question set, and a question added to it later still appears, next to where
// it sits by default, without anyone re-ordering it in.

import { SCHEMA, ALWAYS_ON, CONDITIONAL } from "./schema.js";
import { getLayoutDoc, saveLayoutDoc } from "./sync.js";

// Every section a day can show, in the default order.
export const ORDERABLE_SECTIONS = ALWAYS_ON.concat(CONDITIONAL);

const EMPTY = { sections: [], fields: {}, options: {} };
let current = EMPTY;

function normalize(layout) {
  return {
    sections: Array.isArray(layout?.sections) ? layout.sections : [],
    fields: layout?.fields && typeof layout.fields === "object" ? layout.fields : {},
    options: layout?.options && typeof layout.options === "object" ? layout.options : {},
    editedAt: layout?.editedAt || 0,
  };
}

// `saved` is the order the user chose; anything in `defaults` it doesn't know
// (a question added since) goes right after its default predecessor.
export function applyOrder(defaults, saved) {
  const known = new Set(defaults);
  const out = [];
  (saved || []).forEach((x) => { if (known.has(x) && !out.includes(x)) out.push(x); });
  defaults.forEach((x, i) => {
    if (out.includes(x)) return;
    let pos = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = out.indexOf(defaults[j]);
      if (k > -1) { pos = k + 1; break; }
    }
    out.splice(pos, 0, x);
  });
  return out;
}

export function getLayout() { return current; }

export function sortSections(ids) {
  const order = applyOrder(ORDERABLE_SECTIONS, current.sections);
  const rank = (id) => { const i = order.indexOf(id); return i === -1 ? order.length : i; };
  return [...ids].sort((a, b) => rank(a) - rank(b));
}

export function orderedFields(secId) {
  const fields = SCHEMA[secId].fields;
  const ids = applyOrder(fields.map((f) => f.id), current.fields[secId]);
  return ids.map((id) => fields.find((f) => f.id === id));
}

export function optionKey(secId, fieldId) { return secId + "." + fieldId; }

export function orderedOptions(secId, field) {
  if (!Array.isArray(field.options)) return [];
  return applyOrder(field.options, current.options[optionKey(secId, field.id)]);
}

export function hasCustomLayout() {
  return current.sections.length > 0 || Object.keys(current.fields).length > 0 || Object.keys(current.options).length > 0;
}

function announce() {
  window.dispatchEvent(new CustomEvent("tcm:layout-changed"));
}

export async function loadLayout() {
  const next = normalize((await getLayoutDoc()).layout);
  const changed = JSON.stringify(next) !== JSON.stringify(current);
  current = next;
  if (changed) announce();
  return current;
}

export async function saveLayout(next) {
  current = normalize({ ...next, editedAt: Date.now() });
  announce();
  await saveLayoutDoc({ layout: current });
}

export function resetLayout() {
  return saveLayout(EMPTY);
}

// Another device's order arrives with the cycle and cabinet documents.
window.addEventListener("tcm:data-changed", (e) => { if (e.detail?.cycle) loadLayout(); });
loadLayout();
