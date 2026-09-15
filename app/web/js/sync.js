// Background best-effort sync of saved entries to a private GitHub repo, via
// the Contents API. This is never a precondition for a save being "safe" —
// db.js (IndexedDB) already made the entry durable on-device before this
// module is ever called. If this fails (offline, bad token, repo unreachable)
// the entry stays exactly as saved locally and is retried later.

import { getMeta, setMeta, deleteMeta, putEntry, getUnsyncedEntries, getAllEntries } from "./db.js";
import { buildUserMarkdown } from "./markdown.js";
import { getLang } from "./i18n.js";

// Non-secret settings persist on the device. The access token deliberately
// does NOT: it lives in sessionStorage, so it is gone when the tab closes and
// is never written to disk. This app is served from a public origin, where a
// long-lived write-capable token sitting in durable storage is a standing
// liability — the cost is re-entering it per session.
const PERSISTED_KEYS = ["gh_owner", "gh_repo", "gh_branch", "gh_path_prefix"];
const TOKEN_SESSION_KEY = "tcm_gh_token";

export function getToken() {
  try { return sessionStorage.getItem(TOKEN_SESSION_KEY) || ""; } catch (e) { return ""; }
}

export function setToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_SESSION_KEY, token);
    else sessionStorage.removeItem(TOKEN_SESSION_KEY);
  } catch (e) { /* private mode — token simply stays in memory for this page */ }
}

// Clears any token persisted by an earlier version of this app.
export async function purgeStoredToken() {
  const legacy = await getMeta("gh_token");
  if (legacy !== undefined) {
    await deleteMeta("gh_token");
    return true;
  }
  return false;
}

export async function getConfig() {
  const entries = await Promise.all(PERSISTED_KEYS.map((k) => getMeta(k)));
  const cfg = {};
  PERSISTED_KEYS.forEach((k, i) => { cfg[k] = entries[i]; });
  cfg.gh_token = getToken();
  cfg.gh_branch = cfg.gh_branch || "main";
  cfg.gh_path_prefix = cfg.gh_path_prefix || "user-data/";
  return cfg;
}

export async function setConfig(partial) {
  if ("gh_token" in partial) setToken(partial.gh_token);
  const persisted = Object.keys(partial).filter((k) => PERSISTED_KEYS.includes(k));
  await Promise.all(persisted.map((k) => setMeta(k, partial[k])));
}

export async function isConfigured() {
  const cfg = await getConfig();
  return !!(cfg.gh_token && cfg.gh_owner && cfg.gh_repo);
}

// Distinguishes "never set up" from "set up, but this session needs the token
// re-entered" — otherwise the second case reads as a broken configuration.
export async function configState() {
  const cfg = await getConfig();
  if (!cfg.gh_owner || !cfg.gh_repo) return "not-configured";
  if (!cfg.gh_token) return "needs-token";
  return "ready";
}

/* ---------------- User identity ----------------
   A "user" here is whoever set this device up — there is no account system by
   design (PRD §6: no email, nothing tying an id to a real identity). The id is
   claimed once, then fixed for this device, and namespaces everything written
   to the repo so a second person using their own device never collides with
   or overwrites the first. */

export async function getUserId() {
  return await getMeta("user_id");
}

export async function setUserId(id) {
  return await setMeta("user_id", id);
}

function nextUserId(existingNames) {
  let max = 0;
  existingNames.forEach((name) => {
    const m = /^u(\d+)/.exec(name);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return "u" + String(max + 1).padStart(3, "0");
}

// Reads what user folders/files already exist in the repo and claims the next
// free uNNN. Never renumbers an id this device already holds.
export async function claimUserId() {
  const existing = await getUserId();
  if (existing) return { ok: true, userId: existing, claimed: false };

  const cfg = await getConfig();
  if (!cfg.gh_token || !cfg.gh_owner || !cfg.gh_repo) {
    return { ok: false, error: "not-configured" };
  }
  try {
    const dir = cfg.gh_path_prefix.replace(/\/$/, "");
    const res = await githubRequest(cfg, dir);
    let names = [];
    if (res.status === 200) {
      const body = await res.json();
      if (Array.isArray(body)) names = body.map((f) => f.name);
    } else if (res.status !== 404) {
      return { ok: false, error: `github-${res.status}` };
    }
    const userId = nextUserId(names);
    await setUserId(userId);
    return { ok: true, userId, claimed: true, sawExisting: names };
  } catch (e) {
    return { ok: false, error: e && e.message === "Failed to fetch" ? "offline" : String(e) };
  }
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function apiUrl(cfg, path) {
  return `https://api.github.com/repos/${cfg.gh_owner}/${cfg.gh_repo}/contents/${path}`;
}

async function githubRequest(cfg, path, options = {}) {
  const res = await fetch(apiUrl(cfg, path), {
    ...options,
    headers: {
      Authorization: `Bearer ${cfg.gh_token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  return res;
}

async function putFile(cfg, path, text, message) {
  try {
    let sha;
    const getRes = await githubRequest(cfg, path);
    if (getRes.status === 200) {
      const body = await getRes.json();
      sha = body.sha;
    } else if (getRes.status !== 404) {
      return { ok: false, error: `github-get-${getRes.status}` };
    }

    const putRes = await githubRequest(cfg, path, {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: utf8ToBase64(text),
        branch: cfg.gh_branch,
        ...(sha ? { sha } : {}),
      }),
    });
    if (putRes.status === 200 || putRes.status === 201) return { ok: true };
    const errBody = await putRes.json().catch(() => ({}));
    return { ok: false, error: errBody.message || `github-put-${putRes.status}` };
  } catch (e) {
    return { ok: false, error: e && e.message === "Failed to fetch" ? "offline" : String(e) };
  }
}

// Structured per-day record: <prefix><userId>/<date>.json. This is the app's
// own source of truth for reloading and editing a past day — the markdown
// below is a rendering of it, not the other way round.
export async function pushEntry(entry) {
  const cfg = await getConfig();
  if (!cfg.gh_token || !cfg.gh_owner || !cfg.gh_repo) {
    return { ok: false, error: "not-configured" };
  }
  const claim = await claimUserId();
  if (!claim.ok) return { ok: false, error: claim.error };
  const userId = claim.userId;
  return putFile(
    cfg,
    `${cfg.gh_path_prefix}${userId}/${entry.date}.json`,
    JSON.stringify({ userId, ...entry }, null, 2),
    `${userId}: update ${entry.date}`
  );
}

// Human/skill-readable rolling log: <prefix><userId>_daily_log.md, rebuilt
// from every entry this device holds.
export async function pushUserMarkdown() {
  const cfg = await getConfig();
  if (!cfg.gh_token || !cfg.gh_owner || !cfg.gh_repo) {
    return { ok: false, error: "not-configured" };
  }
  const userId = await getUserId();
  if (!userId) return { ok: false, error: "no-user-id" };
  const entries = await getAllEntries();
  if (!entries.length) return { ok: true };
  return putFile(
    cfg,
    `${cfg.gh_path_prefix}${userId}_daily_log.md`,
    buildUserMarkdown(entries, userId, getLang()),
    `${userId}: rebuild daily log`
  );
}

// Tests the configured token/repo without writing anything.
export async function testConnection() {
  const cfg = await getConfig();
  if (!cfg.gh_token || !cfg.gh_owner || !cfg.gh_repo) {
    return { ok: false, error: "not-configured" };
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${cfg.gh_owner}/${cfg.gh_repo}`, {
      headers: { Authorization: `Bearer ${cfg.gh_token}`, Accept: "application/vnd.github+json" },
    });
    if (res.status === 200) return { ok: true };
    if (res.status === 404) return { ok: false, error: "repo-not-found-or-no-access" };
    if (res.status === 401) return { ok: false, error: "bad-token" };
    return { ok: false, error: `github-${res.status}` };
  } catch (e) {
    return { ok: false, error: e && e.message === "Failed to fetch" ? "offline" : String(e) };
  }
}

// The markdown is a full rebuild of every entry, so it is pushed on a longer
// leash than the per-day JSON — otherwise a minute of typing would rewrite the
// whole log file dozens of times.
let markdownTimer = null;
function scheduleMarkdownPush(onStatus) {
  if (markdownTimer) clearTimeout(markdownTimer);
  markdownTimer = setTimeout(async () => {
    markdownTimer = null;
    const result = await pushUserMarkdown();
    if (!result.ok && onStatus && result.error !== "not-configured" && result.error !== "no-user-id") {
      onStatus("error", result.error);
    }
  }, 8000);
}

// Syncs one entry and records the result back into IndexedDB, then reports
// status via onStatus (used by the UI's sync indicator).
export async function syncEntry(entry, onStatus) {
  if (onStatus) onStatus("syncing");
  const result = await pushEntry(entry);
  const updated = {
    ...entry,
    syncedAt: result.ok ? Date.now() : entry.syncedAt || 0,
    syncError: result.ok ? null : result.error,
  };
  await putEntry(updated);
  if (onStatus) onStatus(result.ok ? "synced" : "error", result.error);
  if (result.ok) scheduleMarkdownPush(onStatus);
  return result;
}

// Retries every entry whose local edits are newer than its last successful sync.
export async function syncAllPending(onStatus) {
  const state = await configState();
  if (state !== "ready") {
    if (onStatus) onStatus(state);
    return;
  }
  const pending = await getUnsyncedEntries();
  for (const entry of pending) {
    await syncEntry(entry, onStatus);
  }
}
