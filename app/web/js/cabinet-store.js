// The cabinet: what you actually have at home — teas, supplements, herbs.
// Managed in Profile, ticked off in the daily log, and listed in the analysis
// summary so the TCM chat can suggest something you already own.

import { getCabinet, saveCabinet, getUserId } from "./sync.js";

export const KINDS = {
  tea: "茶飲||Tea",
  supplement: "保健品||Supplement",
  herb: "中藥||Chinese herb",
  skincare: "護膚品||Skincare",
  other: "其他||Other",
};

export const SCHEDULES = {
  daily: "每天||Daily",
  "as-needed": "需要時||As needed",
};

function newId() {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function activeItems(cabinet) {
  return (cabinet?.items || []).filter((i) => i && !i.deleted && i.name)
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : (a.kind < b.kind ? -1 : 1)));
}

// Charlotte's skincare shelf, put in once so the 9. 皮膚 search has
// something to offer from day one. Fixed ids keep two devices seeding at the
// same time from doubling up, and updatedAt 1 loses to any real edit, so an
// item removed on one device is never brought back by another's seed.
const STARTER_OWNER = "TL6-668";
const STARTER_SKINCARE = [
  ["skin-hyaluronic", "Hyaluronic acid", "daily"],
  ["skin-mask", "Mask", "as-needed"],
  ["skin-azelaic", "Azelaic acid", "daily"],
  ["skin-vitc", "Vitamin C", "daily"],
  ["skin-tretinoin", "Tretinoin", "daily"],
  ["skin-physical-exfoliant", "Physical exfoliant", "as-needed"],
  ["skin-aha-bha", "AHA + BHA mask", "as-needed"],
  ["skin-peptides", "Multi-peptide + copper peptide", "daily"],
];

async function seedStarterSkincare(cabinet) {
  if ((await getUserId()) !== STARTER_OWNER) return cabinet;
  const items = cabinet.items || [];
  const missing = STARTER_SKINCARE.filter(([id]) => !items.some((i) => i.id === id));
  if (!missing.length) return cabinet;
  const added = missing.map(([id, name, schedule]) => ({ id, name, kind: "skincare", schedule, ingredients: "", updatedAt: 1 }));
  return saveCabinet({ items: [...items, ...added] });
}

export async function listItems() {
  return activeItems(await seedStarterSkincare(await getCabinet()));
}

export async function addItem({ name, kind = "other", schedule = "daily", ingredients = "" }) {
  const clean = String(name || "").trim();
  if (!clean) return { ok: false, error: "no-name" };
  const cabinet = await getCabinet();
  if (activeItems(cabinet).some((i) => i.name.toLowerCase() === clean.toLowerCase())) {
    return { ok: false, error: "duplicate" };
  }
  const item = { id: newId(), name: clean, kind, schedule, ingredients: ingredients.trim(), updatedAt: Date.now() };
  await saveCabinet({ items: [...(cabinet.items || []), item] });
  return { ok: true, item };
}

export async function updateItem(id, changes) {
  const cabinet = await getCabinet();
  const items = (cabinet.items || []).map((i) => (i.id === id ? { ...i, ...changes, updatedAt: Date.now() } : i));
  await saveCabinet({ items });
  return { ok: true };
}

// Removing an item leaves days that recorded it untouched: the daily log
// stores the names taken, not references into the cabinet.
export async function deleteItem(id) {
  return updateItem(id, { deleted: true });
}
