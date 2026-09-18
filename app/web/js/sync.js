// Sync between this device (IndexedDB, always saved first) and the private
// GitHub data repo, which holds the latest version for every device.
//
// Rules:
// - Download before showing: on open, and whenever the app comes back on
//   screen, fetch the folder listing, the last 14 days and cycle.json. Older
//   days download when opened.
// - Upload on every save, on top of the version last seen: each PUT carries
//   the file's GitHub sha. If another device saved in between, GitHub refuses
//   (409/422) instead of overwriting; we download, merge field by field
//   (merge.js), and upload again.
// - The token lives in sessionStorage only and is never written to disk.

import {
  getMeta, setMeta, deleteMeta, getEntry, putEntry, deleteEntry, getAllEntries, clearEntries,
} from "./db.js";
import { mergeEntries, mergeCycle, mergeCabinet, sameEntryContent } from "./merge.js";
import { todayStr, shiftDate } from "./dates.js";

const PERSISTED_KEYS = ["gh_owner", "gh_repo", "gh_branch", "gh_path_prefix"];
const DEFAULTS = {
  gh_owner: "charlotte-wtl",
  gh_repo: "personal_tcm_daily_log",
  gh_branch: "main",
  gh_path_prefix: "user-data/",
};
const TOKEN_SESSION_KEY = "tcm_gh_token";
const RECENT_DAYS = 14;
const CYCLE_FILE = "cycle.json";
const CABINET_FILE = "cabinet.json";
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/;

/* ---------------- Status + change events ---------------- */

let statusListener = () => {};
let lastState = "";
export function setStatusListener(fn) { statusListener = fn || (() => {}); }
function status(state, detail) { lastState = state; statusListener(state, detail); }

function announce(dates, cycle = false) {
  if (!dates.length && !cycle) return;
  window.dispatchEvent(new CustomEvent("tcm:data-changed", { detail: { dates, cycle } }));
}

/* ---------------- Config ---------------- */

export function getToken() {
  try { return sessionStorage.getItem(TOKEN_SESSION_KEY) || ""; } catch (e) { return ""; }
}

export function setToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_SESSION_KEY, token);
    else sessionStorage.removeItem(TOKEN_SESSION_KEY);
  } catch (e) { /* private mode — nothing persisted, which is the point */ }
}

// Clears any token persisted by an earlier version of this app.
export async function purgeStoredToken() {
  if ((await getMeta("gh_token")) !== undefined) await deleteMeta("gh_token");
}

export async function getConfig() {
  const values = await Promise.all(PERSISTED_KEYS.map((k) => getMeta(k)));
  const cfg = {};
  PERSISTED_KEYS.forEach((k, i) => { cfg[k] = values[i] || DEFAULTS[k]; });
  cfg.gh_token = getToken();
  return cfg;
}

export async function setConfig(partial) {
  if ("gh_token" in partial) setToken(partial.gh_token);
  await Promise.all(PERSISTED_KEYS.filter((k) => k in partial).map((k) => setMeta(k, partial[k] || DEFAULTS[k])));
}

export async function getUserId() { return await getMeta("user_id"); }
export async function setUserId(id) { return await setMeta("user_id", id); }

export async function configState() {
  const cfg = await getConfig();
  if (!cfg.gh_owner || !cfg.gh_repo) return "not-configured";
  if (!(await getUserId())) return "no-user-id";
  if (!cfg.gh_token) return "needs-token";
  return "ready";
}

/* ---------------- GitHub API ---------------- */

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function base64ToUtf8(b64) {
  const binary = atob(b64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

function networkError(e) {
  return e && /Failed to fetch|NetworkError|Load failed/i.test(String(e.message || e)) ? "offline" : String(e.message || e);
}

async function gh(cfg, path, options = {}) {
  return fetch(`https://api.github.com/repos/${cfg.gh_owner}/${cfg.gh_repo}/${path}`, {
    // GitHub marks API responses cacheable for 60s; a stale folder listing
    // would hide another device's save, so listings are never served from cache.
    cache: "no-store",
    ...options,
    headers: {
      Authorization: `Bearer ${cfg.gh_token}`,
      Accept: "application/vnd.github+json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
}

function prefixDir(cfg) { return cfg.gh_path_prefix.replace(/\/+$/, ""); }
function userPath(cfg, userId, name) { return `${prefixDir(cfg)}/${userId}/${name}`; }

export async function testConnection(cfg) {
  try {
    const res = await fetch(`https://api.github.com/repos/${cfg.gh_owner}/${cfg.gh_repo}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${cfg.gh_token}`, Accept: "application/vnd.github+json" },
    });
    if (res.status === 200) return { ok: true };
    if (res.status === 401) return { ok: false, error: "bad-token" };
    if (res.status === 404 || res.status === 403) return { ok: false, error: "repo-not-found-or-no-access" };
    return { ok: false, error: `github-${res.status}` };
  } catch (e) {
    return { ok: false, error: networkError(e) };
  }
}

// { exists, files: { "2026-09-16.json": sha, "cycle.json": sha } }
async function listUserFolder(cfg, userId) {
  const res = await gh(cfg, `contents/${prefixDir(cfg)}?ref=${encodeURIComponent(cfg.gh_branch)}`);
  if (res.status === 404) return { exists: false, files: {} };
  if (!res.ok) throw new Error(`github-${res.status}`);
  const folder = (await res.json()).find((f) => f.type === "dir" && f.name === userId);
  if (!folder) return { exists: false, files: {} };
  const treeRes = await gh(cfg, `git/trees/${folder.sha}`);
  if (!treeRes.ok) throw new Error(`github-${treeRes.status}`);
  const files = {};
  (await treeRes.json()).tree.forEach((t) => { if (t.type === "blob") files[t.path] = t.sha; });
  return { exists: true, files };
}

export async function userFolderExists(cfg, userId) {
  return (await listUserFolder(cfg, userId)).exists;
}

async function readBlob(cfg, sha) {
  // A blob never changes for a given sha, so this one may use the HTTP cache.
  const res = await gh(cfg, `git/blobs/${sha}`, { cache: "default" });
  if (!res.ok) throw new Error(`github-${res.status}`);
  return JSON.parse(base64ToUtf8((await res.json()).content));
}

async function readFile(cfg, path) {
  const res = await gh(cfg, `contents/${path}?ref=${encodeURIComponent(cfg.gh_branch)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`github-${res.status}`);
  const body = await res.json();
  return { sha: body.sha, data: JSON.parse(base64ToUtf8(body.content)) };
}

// Writes only on top of `sha` (or only if the file doesn't exist yet).
// Returns { ok, sha } or { ok:false, conflict:true } when someone else wrote first.
async function writeFile(cfg, path, data, sha, message) {
  const res = await gh(cfg, `contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: utf8ToBase64(JSON.stringify(data, null, 2)),
      branch: cfg.gh_branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (res.status === 200 || res.status === 201) return { ok: true, sha: (await res.json()).content.sha };
  if (res.status === 409 || res.status === 422) return { ok: false, conflict: true };
  const body = await res.json().catch(() => ({}));
  return { ok: false, error: body.message || `github-${res.status}` };
}

/* ---------------- Remote index (what exists on GitHub) ---------------- */

let remoteIndex = null; // { userId, files, fetchedAt }

async function loadIndex() {
  if (!remoteIndex) remoteIndex = (await getMeta("remote_index")) || null;
  return remoteIndex;
}

export async function getRemoteDates() {
  const index = await loadIndex();
  const userId = await getUserId();
  if (!index || index.userId !== userId) return new Set();
  return new Set(Object.keys(index.files).map((n) => (DAY_FILE.exec(n) || [])[1]).filter(Boolean));
}

async function saveIndex(index) {
  remoteIndex = index;
  await setMeta("remote_index", index);
}

async function noteRemoteFile(name, sha, userId) {
  const index = await loadIndex();
  if (!index || index.userId !== userId) return;
  index.files[name] = sha;
  await setMeta("remote_index", index);
}

/* ---------------- Entries ---------------- */

export function isDirty(record) {
  return !!record && (record.updatedAt || 0) > (record.syncedAt || 0);
}

function remoteShape(entry, userId) {
  const out = { userId, date: entry.date, answers: entry.answers, done: entry.done || [], updatedAt: entry.updatedAt };
  if (entry.completedAt) out.completedAt = entry.completedAt;
  if (entry.amended) out.amended = true;
  return out;
}

// Brings one downloaded day into IndexedDB. Returns true if what the user sees changed.
async function applyRemoteEntry(date, sha, remote, userId) {
  const local = await getEntry(date);
  if (local && local.remoteSha === sha && local.remoteUserId === userId) return false;
  const base = { answers: remote.answers || {}, done: remote.done || [] };
  const syncMeta = { remoteSha: sha, remoteUserId: userId, base };

  if (!local || !isDirty(local)) {
    const stamp = Math.max(remote.updatedAt || 0, local?.updatedAt || 0, 1);
    await putEntry({
      date,
      answers: base.answers,
      done: base.done,
      completedAt: remote.completedAt,
      amended: remote.amended,
      updatedAt: stamp,
      syncedAt: stamp,
      ...syncMeta,
    });
    return !local || !sameEntryContent(local, remote);
  }

  // Unsynced local edits AND a newer remote version: merge, keep it dirty so
  // the merged result gets uploaded.
  const merged = mergeEntries(local.base || { answers: {}, done: [] }, local, remote);
  await putEntry({
    ...local,
    answers: merged.answers,
    done: merged.done,
    completedAt: merged.completedAt,
    amended: merged.amended,
    updatedAt: Math.max(Date.now(), (local.syncedAt || 0) + 1),
    ...syncMeta,
  });
  if (merged.conflicts) status("merged");
  return !sameEntryContent(local, merged);
}

// Upload queue: one upload per file at a time, so rapid saves don't race each
// other with the same sha.
const queues = new Map();
function enqueue(key, job) {
  const prev = queues.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(job);
  queues.set(key, next);
  next.finally(() => {
    if (queues.get(key) === next) queues.delete(key);
    // The last upload finished and nothing reported a problem: all caught up.
    if (!queues.size && lastState === "syncing") status("synced");
  }).catch(() => {});
  return next;
}
async function uploadsIdle() {
  await Promise.all([...queues.values()].map((p) => p.catch(() => {})));
}

export function queuePush(date) {
  return enqueue(`day:${date}`, () => pushDay(date));
}

async function pushDay(date) {
  if ((await configState()) !== "ready") return { ok: false, error: "not-ready" };
  const cfg = await getConfig();
  const userId = await getUserId();

  for (let attempt = 0; attempt < 3; attempt++) {
    const entry = await getEntry(date);
    if (!entry || !isDirty(entry)) return { ok: true };
    status("syncing");
    const sha = entry.remoteUserId === userId ? entry.remoteSha : undefined;
    let result;
    try {
      result = await writeFile(cfg, userPath(cfg, userId, `${date}.json`), remoteShape(entry, userId), sha, `${userId}: update ${date}`);
    } catch (e) {
      result = { ok: false, error: networkError(e) };
    }

    if (result.ok) {
      // Mark synced only up to what was uploaded; edits made during the upload stay dirty.
      const now = await getEntry(date);
      await putEntry({
        ...now,
        remoteSha: result.sha,
        remoteUserId: userId,
        base: { answers: entry.answers, done: entry.done || [] },
        syncedAt: entry.updatedAt,
        syncError: null,
      });
      await noteRemoteFile(`${date}.json`, result.sha, userId);
      status(isDirty(now) ? "syncing" : "synced");
      return { ok: true };
    }
    if (!result.conflict) {
      await putEntry({ ...entry, syncError: result.error });
      status("error", result.error);
      return result;
    }
    // Another device saved first: take its version, merge, try again.
    try {
      const remote = await readFile(cfg, userPath(cfg, userId, `${date}.json`));
      if (remote) {
        if (await applyRemoteEntry(date, remote.sha, remote.data, userId)) announce([date]);
      } else {
        const cur = await getEntry(date);
        await putEntry({ ...cur, remoteSha: undefined });
      }
    } catch (e) {
      status("error", networkError(e));
      return { ok: false, error: networkError(e) };
    }
  }
  status("error", "conflict-retries");
  return { ok: false, error: "conflict-retries" };
}

// Makes sure a day is on this device, downloading it if it only exists remotely.
export async function fetchDay(date) {
  const local = await getEntry(date);
  if (local) return local;
  if ((await configState()) !== "ready") return null;
  const cfg = await getConfig();
  const userId = await getUserId();
  const index = await loadIndex();
  if (!index || index.userId !== userId) return null;
  const sha = index.files[`${date}.json`];
  if (!sha) return null;
  try {
    await applyRemoteEntry(date, sha, await readBlob(cfg, sha), userId);
    return await getEntry(date);
  } catch (e) {
    return null;
  }
}

/* ---------------- Whole-file documents (cycle.json, cabinet.json) ----------------
   Unlike days, these are single small files each device edits in place, so
   they follow the same sha-checked write + merge path as a day. */

const DOCS = {
  cycle: { file: CYCLE_FILE, metaKey: "cycle", empty: { periods: [], spotting: [] }, merge: mergeCycle, fields: ["periods", "spotting"] },
  cabinet: { file: CABINET_FILE, metaKey: "cabinet", empty: { items: [] }, merge: mergeCabinet, fields: ["items"] },
};

async function getDoc(kind) {
  const def = DOCS[kind];
  return (await getMeta(def.metaKey)) || { ...def.empty, updatedAt: 0, syncedAt: 0 };
}

async function saveDoc(kind, data) {
  const def = DOCS[kind];
  const cur = await getDoc(kind);
  const next = { ...cur };
  def.fields.forEach((f) => { next[f] = data[f] !== undefined ? data[f] : (cur[f] || def.empty[f]); });
  next.updatedAt = Date.now();
  await setMeta(def.metaKey, next);
  announce([], true);
  queueDocPush(kind);
  return next;
}

export const getCycle = () => getDoc("cycle");
export const saveCycle = (data) => saveDoc("cycle", data);
export const getCabinet = () => getDoc("cabinet");
export const saveCabinet = (data) => saveDoc("cabinet", data);

export function queueDocPush(kind) {
  return enqueue(kind, () => pushDoc(kind));
}

async function pushDoc(kind) {
  if ((await configState()) !== "ready") return { ok: false, error: "not-ready" };
  const def = DOCS[kind];
  const cfg = await getConfig();
  const userId = await getUserId();
  for (let attempt = 0; attempt < 3; attempt++) {
    const doc = await getDoc(kind);
    if (!isDirty(doc)) return { ok: true };
    status("syncing");
    const sha = doc.remoteUserId === userId ? doc.remoteSha : undefined;
    const body = { userId };
    def.fields.forEach((f) => { body[f] = doc[f] || def.empty[f]; });
    let result;
    try {
      result = await writeFile(cfg, userPath(cfg, userId, def.file), body, sha, `${userId}: update ${kind}`);
    } catch (e) {
      result = { ok: false, error: networkError(e) };
    }
    if (result.ok) {
      const now = await getDoc(kind);
      await setMeta(def.metaKey, { ...now, remoteSha: result.sha, remoteUserId: userId, syncedAt: doc.updatedAt });
      await noteRemoteFile(def.file, result.sha, userId);
      status(isDirty(now) ? "syncing" : "synced");
      return { ok: true };
    }
    if (!result.conflict) { status("error", result.error); return result; }
    try {
      const remote = await readFile(cfg, userPath(cfg, userId, def.file));
      await applyRemoteDoc(kind, remote ? remote.sha : undefined, remote ? remote.data : def.empty, userId);
    } catch (e) {
      status("error", networkError(e));
      return { ok: false, error: networkError(e) };
    }
  }
  return { ok: false, error: "conflict-retries" };
}

async function applyRemoteDoc(kind, sha, remote, userId) {
  const def = DOCS[kind];
  const local = await getDoc(kind);
  if (sha && local.remoteSha === sha && local.remoteUserId === userId) return false;
  const stamp = Date.now();
  if (!isDirty(local)) {
    const next = { updatedAt: stamp, syncedAt: stamp, remoteSha: sha, remoteUserId: userId };
    def.fields.forEach((f) => { next[f] = remote[f] || def.empty[f]; });
    await setMeta(def.metaKey, next);
  } else {
    const merged = def.merge(local, remote);
    await setMeta(def.metaKey, { ...local, ...merged, remoteSha: sha, remoteUserId: userId, updatedAt: Math.max(stamp, (local.syncedAt || 0) + 1) });
  }
  announce([], true);
  return true;
}

/* ---------------- Pull ---------------- */

let pullInFlight = null;

export function pullRecent() {
  if (!pullInFlight) pullInFlight = doPull().finally(() => { pullInFlight = null; });
  return pullInFlight;
}

async function doPull() {
  if ((await configState()) !== "ready") return { ok: false, error: await configState() };
  const cfg = await getConfig();
  const userId = await getUserId();
  await uploadsIdle();
  status("pulling");
  const startedAt = Date.now();
  try {
    const { files } = await listUserFolder(cfg, userId);
    await saveIndex({ userId, files, fetchedAt: startedAt });

    const changed = [];
    const since = shiftDate(todayStr(), -(RECENT_DAYS - 1));
    const locals = new Map((await getAllEntries()).map((e) => [e.date, e]));

    for (const [name, sha] of Object.entries(files)) {
      const m = DAY_FILE.exec(name);
      if (!m) continue;
      const date = m[1];
      const local = locals.get(date);
      // Recent days always come down; older ones only if this device already
      // holds a copy that has fallen behind.
      if (date < since && !local) continue;
      if (local && local.remoteSha === sha && local.remoteUserId === userId) continue;
      if (await applyRemoteEntry(date, sha, await readBlob(cfg, sha), userId)) changed.push(date);
    }

    // A day that was synced before but is gone from GitHub was deleted or
    // moved on another device. Unsynced local edits are never removed.
    for (const [date, local] of locals) {
      if (files[`${date}.json`] || isDirty(local)) continue;
      const wasSynced = local.remoteSha || local.syncedAt;
      const sameUser = !local.remoteUserId || local.remoteUserId === userId;
      if (wasSynced && sameUser && (local.syncedAt || 0) < startedAt) {
        await deleteEntry(date);
        changed.push(date);
      }
    }

    for (const kind of Object.keys(DOCS)) {
      const sha = files[DOCS[kind].file];
      if (sha) await applyRemoteDoc(kind, sha, await readBlob(cfg, sha), userId);
    }

    announce(changed);
    await syncAllPending();
    status("synced");
    return { ok: true, changed };
  } catch (e) {
    status("error", networkError(e));
    return { ok: false, error: networkError(e) };
  }
}

export async function syncAllPending() {
  if ((await configState()) !== "ready") return;
  const all = await getAllEntries();
  const docs = await Promise.all(Object.keys(DOCS).map(async (kind) => (isDirty(await getDoc(kind)) ? queueDocPush(kind) : null)));
  await Promise.all([...all.filter(isDirty).map((e) => queuePush(e.date)), ...docs.filter(Boolean)]);
}

/* ---------------- Account ---------------- */

export async function hasUnsyncedData() {
  const all = await getAllEntries();
  const docs = await Promise.all(Object.keys(DOCS).map((kind) => getDoc(kind)));
  return all.some(isDirty) || docs.some(isDirty);
}

// Points this device at a user id. Switching to a different id clears the
// previous user's copies from this device (refused if any are unsynced).
export async function adoptUserId(id) {
  const current = await getUserId();
  if (current && current !== id) {
    if (await hasUnsyncedData()) return { ok: false, error: "unsynced-other-user" };
    await clearEntries();
    await Promise.all(Object.values(DOCS).map((d) => deleteMeta(d.metaKey)));
    await deleteMeta("remote_index");
    remoteIndex = null;
  }
  await setUserId(id);
  return { ok: true };
}

// Claims a new user's folder by writing an empty cycle.json. Fails with
// "taken" if the id already exists (vanishingly unlikely for a random id).
export async function createUserFolder(cfg, id) {
  try {
    if (await userFolderExists(cfg, id)) return { ok: false, error: "taken" };
    const res = await writeFile(cfg, userPath(cfg, id, CYCLE_FILE), { userId: id, periods: [], spotting: [] }, undefined, `${id}: new user`);
    return res.ok ? { ok: true } : { ok: false, error: res.conflict ? "taken" : res.error };
  } catch (e) {
    return { ok: false, error: networkError(e) };
  }
}
