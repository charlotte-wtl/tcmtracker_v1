// Merging edits from two devices. A day is stored as answers[section][field],
// so two devices that changed different fields (breakfast on the laptop, a
// bowel movement on the phone) never actually collide: each side's changes,
// measured against the version it started from, are applied on top of the
// other's. Only the same field edited on both sides is a real conflict.

function same(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function isEmpty(v) {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

// Free text (notes, meals) vs a choice ("有||Yes") or a number ("3").
function isFreeText(v) {
  return typeof v === "string" && !v.includes("||") && !/^-?\d+(\.\d+)?$/.test(v.trim());
}

function mergeValue(base, local, remote) {
  if (same(local, base)) return { value: remote, conflict: false };
  if (same(remote, base)) return { value: local, conflict: false };
  if (same(local, remote)) return { value: local, conflict: false };
  if (isEmpty(local)) return { value: remote, conflict: false };
  if (isEmpty(remote)) return { value: local, conflict: false };

  if (Array.isArray(local) && Array.isArray(remote)) {
    const b = Array.isArray(base) ? base : [];
    const removed = new Set([...b.filter((x) => !local.includes(x)), ...b.filter((x) => !remote.includes(x))]);
    const out = [];
    [...remote, ...local].forEach((x) => { if (!removed.has(x) && !out.includes(x)) out.push(x); });
    return { value: out, conflict: false };
  }
  if (isFreeText(local) && isFreeText(remote)) {
    if (local.includes(remote)) return { value: local, conflict: false };
    if (remote.includes(local)) return { value: remote, conflict: false };
    // Both devices wrote different text into the same box: keep both. A line
    // break reads well in notes, but a one-line field would run them together.
    const sep = remote.includes("\n") || local.includes("\n") ? "\n" : " / ";
    return { value: remote + sep + local, conflict: true };
  }
  // The same choice answered differently on two devices: the device saving now wins.
  return { value: local, conflict: true };
}

function mergeObjects(base = {}, local = {}, remote = {}) {
  const out = {};
  let conflicts = 0;
  new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(base)]).forEach((key) => {
    const b = base[key], l = local[key], r = remote[key];
    const nested = [b, l, r].some((x) => x && typeof x === "object" && !Array.isArray(x));
    if (nested) {
      const m = mergeObjects(b || {}, l || {}, r || {});
      out[key] = m.value;
      conflicts += m.conflicts;
    } else {
      const m = mergeValue(b, l, r);
      if (m.value !== undefined) out[key] = m.value;
      if (m.conflict) conflicts++;
    }
  });
  return { value: out, conflicts };
}

// entry-shaped objects: { answers, done, completedAt?, amended? }
export function mergeEntries(base, local, remote) {
  const answers = mergeObjects(base?.answers, local?.answers, remote?.answers);
  const done = mergeValue(base?.done || [], local?.done || [], remote?.done || []);
  return {
    answers: answers.value,
    done: done.value || [],
    completedAt: local?.completedAt || remote?.completedAt,
    amended: !!(local?.amended || remote?.amended) || undefined,
    conflicts: answers.conflicts,
  };
}

export function sameEntryContent(a, b) {
  return same(a?.answers, b?.answers) && same([...(a?.done || [])].sort(), [...(b?.done || [])].sort());
}

// Record lists (periods keyed by start, cabinet items keyed by id) each carry
// updatedAt, so a merge keeps the newer record per key. Deleting sets
// deleted:true rather than removing the record, so a deletion on one device
// beats an old copy on another instead of being resurrected by it.
function mergeRecords(localList = [], remoteList = [], key) {
  const byKey = new Map();
  [...remoteList, ...localList].forEach((r) => {
    const cur = byKey.get(r[key]);
    if (!cur || (r.updatedAt || 0) >= (cur.updatedAt || 0)) byKey.set(r[key], r);
  });
  return [...byKey.values()].sort((a, b) => (a[key] < b[key] ? -1 : 1));
}

export function mergeCycle(local, remote) {
  const spotting = new Set([...(remote?.spotting || []), ...(local?.spotting || [])]);
  return {
    periods: mergeRecords(local?.periods, remote?.periods, "start"),
    spotting: [...spotting].sort(),
  };
}

export function mergeCabinet(local, remote) {
  return { items: mergeRecords(local?.items, remote?.items, "id") };
}
