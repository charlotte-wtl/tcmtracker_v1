// In-app analysis: runs the tcm-daily-tracker skill against a day through the
// Claude API, then keeps a follow-up conversation on that day.
//
// - The skill's own instructions (SKILL.md) are read at run time from the
//   private skill repo with the GitHub token, and cached on this device. They
//   never live in this public app repo.
// - The Anthropic API key, like the GitHub token, is kept for this browser
//   session only.
// - The conversation is stored with the day (answers.analysis) exactly as sent
//   and received, so a follow-up question resends the same history — what the
//   API needs to keep its reasoning — and other devices see it too.

import Anthropic from "../vendor/anthropic-sdk-0.129.0.mjs";
import { T, getLang } from "./i18n.js";
import { getMeta, setMeta, getEntry, putEntry, getAllEntries } from "./db.js";
import { readRepoText, queuePush, getCycle, getConfig } from "./sync.js";
import { summarizeEntry, entryHasData } from "./summary.js";
import { cycleStatus } from "./cycle.js";
import { listItems, KINDS, SCHEDULES } from "./cabinet-store.js";
import { shiftDate } from "./dates.js";

export const MODEL = "claude-opus-5-5";
const KEY_SESSION = "tcm_anthropic_key";
const HISTORY_DAYS = 7;

const DEFAULT_SETTINGS = {
  skillRepo: "charlotte-wtl/tcm_daily_tracker_skill",
  skillPath: "SKILL.md",
  profilePath: "",
};

/* ---------------- Settings and key ---------------- */

export function getApiKey() {
  try { return sessionStorage.getItem(KEY_SESSION) || ""; } catch (e) { return ""; }
}
export function setApiKey(key) {
  try {
    if (key) sessionStorage.setItem(KEY_SESSION, key);
    else sessionStorage.removeItem(KEY_SESSION);
  } catch (e) { /* private mode: nothing kept, which is the point */ }
}

export async function getAiSettings() {
  return { ...DEFAULT_SETTINGS, ...((await getMeta("ai_settings")) || {}) };
}
export async function setAiSettings(partial) {
  const next = { ...(await getAiSettings()), ...partial };
  await setMeta("ai_settings", next);
  return next;
}

/* ---------------- The skill ---------------- */

function stripFrontmatter(text) {
  return text.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
}

// The last good copy stays on the device, so a day can still be analysed if
// GitHub can't be reached right now.
export async function loadSkill({ refresh = false } = {}) {
  const settings = await getAiSettings();
  const cached = await getMeta("skill_cache");
  const sameSource = cached && cached.repo === settings.skillRepo && cached.path === settings.skillPath;
  if (sameSource && !refresh) return { ok: true, text: cached.text, fetchedAt: cached.fetchedAt, cached: true };
  const res = await readRepoText(settings.skillRepo, settings.skillPath);
  if (res.ok) {
    const entry = { repo: settings.skillRepo, path: settings.skillPath, text: stripFrontmatter(res.text), fetchedAt: Date.now() };
    await setMeta("skill_cache", entry);
    return { ok: true, text: entry.text, fetchedAt: entry.fetchedAt, cached: false };
  }
  if (sameSource) return { ok: true, text: cached.text, fetchedAt: cached.fetchedAt, cached: true, refreshError: res.error };
  return { ok: false, error: res.error };
}

async function loadProfile() {
  const settings = await getAiSettings();
  if (!settings.profilePath) return null;
  const cfg = await getConfig();
  const res = await readRepoText(`${cfg.gh_owner}/${cfg.gh_repo}`, settings.profilePath);
  if (res.ok) { await setMeta("profile_cache", res.text); return res.text; }
  return (await getMeta("profile_cache")) || null;
}

// How the skill runs here, as opposed to in a chat with files and memory.
const APP_NOTES = `## 在日誌 App 內執行時的補充規則（優先於上文中與此衝突的流程細節）

- 你在使用者的每日日誌 App 裡執行。這裡沒有檔案系統、沒有記憶功能，也讀不到 references/ 文獻庫與 personal_tcm_daily_log 的 skill-logs。不要聲稱查閱過這些檔案；引用經典依第4層規則，記憶不確定就說明需查證。
- 第1層第5、6點的記錄無法由你寫入：若本次有參考醫案或做了多派比對，在回覆最後用一小段「建議記錄」列出要寫進哪個 log、內容為何，讓使用者自行保存。
- 回覆語言：使用者訊息開頭的【App 語言】即其偏好（除非體質檔案另有記錄），不要再詢問語言偏好。
- 使用者提供的資料只有訊息內的日誌、近幾天紀錄、週期資訊、藥櫃與（若有）體質檔案。藥櫃是使用者手邊有的東西，建議茶飲／食療時優先從中挑選，並照第5.2、5.3層檢查。
- 第一次回覆：先寫完整的當日分析（Markdown），寫完後呼叫 save_summary_card 一次，填好摘要卡。之後的追問直接回答，除非使用者要求更新摘要卡，否則不要再呼叫工具。
- 資料不足以下結論時，依第3層在分析中直接提出要補問的問題；使用者會在同一個對話裡回答。`;

const CARD_TOOL = {
  name: "save_summary_card",
  description: "Save the at-a-glance summary card shown at the top of the day's analysis in the app. Call once, after writing the full analysis. Write every field in the reply language, one or two short sentences each.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["safety_flag", "primary_pattern", "key_signal", "food_suggestion", "watch_tomorrow"],
    properties: {
      safety_flag: { type: "string", description: "第0層警示（需要就醫或驗孕等）；沒有則為空字串" },
      primary_pattern: { type: "string", description: "主要證型，一行" },
      key_signal: { type: "string", description: "今日重點訊號，1–2句" },
      food_suggestion: { type: "string", description: "一項食療或茶飲建議，含食療級份量，優先用藥櫃裡有的" },
      watch_tomorrow: { type: "string", description: "明天特別留意或回報的一件事" },
    },
  },
};

/* ---------------- Context for the first message ---------------- */

function entryBlock(entry) {
  const s = summarizeEntry(entry);
  const lines = [];
  if (s.phase) lines.push(T("週期狀態||Cycle phase") + "：" + s.phase);
  if (s.mood) lines.push(T("整體感覺||Overall mood") + "：" + s.mood);
  s.sections.forEach((sec) => {
    lines.push(`［${sec.title}］`);
    sec.lines.forEach((l) => lines.push(l.label + "：" + l.text));
  });
  return lines.join("\n");
}

function cabinetBlock(items) {
  if (!items.length) return T("（藥櫃是空的）||(The cabinet is empty)");
  return Object.keys(KINDS).map((kind) => {
    const list = items.filter((i) => i.kind === kind);
    if (!list.length) return null;
    return T(KINDS[kind]) + "：" + list.map((i) => i.name
      + (i.ingredients ? `（${i.ingredients}）` : "")
      + (i.schedule === "as-needed" && kind !== "tea" ? "［" + T(SCHEDULES["as-needed"]) + "］" : "")).join("、");
  }).filter(Boolean).join("\n");
}

function cycleBlock(periods, date) {
  const s = cycleStatus(periods, date);
  if (!s.hasData) return T("尚未記錄經期||No period recorded yet");
  const parts = [T("週期第||Cycle day ") + s.cycleDay + T("天||")];
  if (s.stats.count) parts.push(T("近||last ") + s.stats.count + T("次平均||-cycle average ") + s.stats.average + T("天||days") + `（${s.stats.shortest}–${s.stats.longest}）`);
  if (s.inPeriod) parts.push(T("經期中||on period"));
  if (s.nextPeriod) parts.push(T("下次經期預估||next period expected ") + s.nextPeriod.expected);
  return parts.join("，");
}

export async function buildContext(date) {
  const [all, cycle, cabinet, profile] = await Promise.all([getAllEntries(), getCycle(), listItems(), loadProfile()]);
  const byDate = new Map(all.map((e) => [e.date, e]));
  const out = [];
  out.push(`【App 語言】${getLang() === "zh" ? "繁體中文" : "English"}`);
  out.push(`【日期】${date}`);
  if (profile) out.push(`【體質檔案】\n${profile.trim()}`);
  out.push(`【週期】${cycleBlock(cycle.periods || [], date)}`);
  out.push(`【藥櫃（手邊有的）】\n${cabinetBlock(cabinet)}`);
  const recent = [];
  for (let i = HISTORY_DAYS; i >= 1; i--) {
    const d = shiftDate(date, -i);
    const e = byDate.get(d);
    if (!e || !entryHasData(e)) continue;
    let block = `── ${d} ──\n${entryBlock(e)}`;
    if (e.answers?.advice?.text) block += `\n［當天的分析建議］\n${e.answers.advice.text.trim()}`;
    recent.push(block);
  }
  if (recent.length) out.push(`【最近${HISTORY_DAYS}天紀錄（舊→新）】\n${recent.join("\n\n")}`);
  const today = byDate.get(date);
  out.push(`【${date} 的日誌】\n${today && entryHasData(today) ? entryBlock(today) : T("（這一天還沒有紀錄）||(Nothing logged for this day yet)")}`);
  out.push(T("請依你的規則分析這一天。||Please analyse this day following your rules."));
  return out.join("\n\n");
}

/* ---------------- The conversation, stored with the day ---------------- */

function turnKey() {
  return Date.now().toString(36).padStart(9, "0") + "-" + Math.random().toString(36).slice(2, 6);
}

export function turnsOf(analysis) {
  return Object.entries(analysis?.turns || {})
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, t]) => ({ key, ...t, content: JSON.parse(t.content) }));
}

function textOf(content) {
  return (Array.isArray(content) ? content : [{ type: "text", text: String(content) }])
    .filter((b) => b.type === "text").map((b) => b.text).join("\n\n").trim();
}

// Rebuilds the API message list. An assistant turn that ended in a tool call
// needs a tool result at the start of the next user turn.
function apiMessages(turns) {
  const out = [];
  turns.forEach((t, i) => {
    if (t.role === "user") {
      const prev = turns[i - 1];
      const pending = prev && prev.role === "assistant"
        ? prev.content.filter((b) => b.type === "tool_use").map((b) => ({ type: "tool_result", tool_use_id: b.id, content: "saved" }))
        : [];
      out.push({ role: "user", content: [...pending, ...(Array.isArray(t.content) ? t.content : [{ type: "text", text: t.content }])] });
    } else {
      out.push({ role: "assistant", content: t.content });
    }
  });
  return out;
}

async function saveTurns(date, mutate) {
  const existing = await getEntry(date);
  const answers = existing?.answers || { meta: {} };
  if (!answers.meta) answers.meta = {};
  const analysis = answers.analysis || { model: MODEL, turns: {} };
  if (!analysis.turns) analysis.turns = {};
  mutate(analysis, answers);
  answers.analysis = analysis;
  await putEntry({ ...(existing || { date, done: [] }), date, answers, updatedAt: Date.now() });
  queuePush(date);
  window.dispatchEvent(new CustomEvent("tcm:data-changed", { detail: { dates: [date], cycle: false } }));
}

export const AI_ERRORS = {
  "no-key": "請先在「個人」頁輸入 Anthropic API key。||Add your Anthropic API key in Profile first.",
  "no-skill": "讀不到你的中醫 skill（SKILL.md）。請在「個人」頁確認 GitHub token 可以讀取 skill 倉庫。||Couldn't read your TCM skill (SKILL.md). In Profile, check that your GitHub token can read the skill repo.",
  auth: "Anthropic API key 無效。||The Anthropic API key was rejected.",
  rate: "請求太頻繁，請稍後再試。||Too many requests — try again in a minute.",
  offline: "連不上 Anthropic，請檢查網路。||Can't reach Anthropic — check your connection.",
  refusal: "這次的請求被安全機制拒絕了。可以換個說法再試。||This request was declined by a safety check. Try rephrasing.",
  "max-tokens": "回覆太長被截斷了，可以請它繼續。||The reply was cut off for length — ask it to continue.",
  other: "分析失敗||The analysis failed",
};

function errorCode(err) {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return "auth";
  if (err instanceof Anthropic.RateLimitError) return "rate";
  if (err instanceof Anthropic.APIConnectionError) return "offline";
  return "other";
}

// Sends one user turn (the day's context on the first run, a question after)
// and streams the reply. onText gets the reply text so far.
export async function send(date, userText, { onText = () => {} } = {}) {
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, error: "no-key" };
  const skill = await loadSkill();
  if (!skill.ok) return { ok: false, error: "no-skill", detail: skill.error };

  const entry = await getEntry(date);
  const prior = turnsOf(entry?.answers?.analysis);
  const first = !prior.length;
  const content = first ? await buildContext(date) : userText;
  const userTurn = { key: turnKey(), role: "user", at: new Date().toISOString(), content: [{ type: "text", text: content }] };

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  let message;
  try {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high" },
      // Follow-ups resend the whole conversation; this caches it as it grows.
      cache_control: { type: "ephemeral" },
      system: [
        { type: "text", text: skill.text },
        { type: "text", text: APP_NOTES, cache_control: { type: "ephemeral" } },
      ],
      tools: [CARD_TOOL],
      tool_choice: { type: "auto" },
      messages: apiMessages([...prior, userTurn]),
    });
    let sofar = "";
    stream.on("text", (delta) => { sofar += delta; onText(sofar); });
    message = await stream.finalMessage();
  } catch (err) {
    return { ok: false, error: errorCode(err), detail: String(err?.message || err) };
  }

  if (message.stop_reason === "refusal") return { ok: false, error: "refusal" };

  const card = message.content.find((b) => b.type === "tool_use" && b.name === CARD_TOOL.name)?.input || null;
  const replyText = textOf(message.content);
  await saveTurns(date, (analysis, answers) => {
    const at = new Date().toISOString();
    analysis.turns[userTurn.key] = { role: "user", at: userTurn.at, content: JSON.stringify(userTurn.content) };
    analysis.turns[turnKey()] = { role: "assistant", at, model: message.model, content: JSON.stringify(message.content) };
    if (card) analysis.card = card;
    if (first) {
      analysis.startedAt = at;
      answers.meta.analysisRuns = [...(answers.meta.analysisRuns || []), at];
      // The first analysis is the day's advice: the calendar shows it and the
      // next day's analysis follows up on it. Pasted advice is never replaced.
      if (!answers.advice?.text && replyText) answers.advice = { text: replyText, savedAt: Date.now(), source: "app" };
    }
  });
  return { ok: true, text: replyText, card, truncated: message.stop_reason === "max_tokens" };
}

// What the screen shows: the card and the readable turns. The first user turn
// is the day's data, shown folded.
export function conversationView(analysis) {
  return turnsOf(analysis).map((t, i) => ({
    key: t.key, role: t.role, at: t.at, isContext: i === 0 && t.role === "user", text: textOf(t.content),
  }));
}

// Starts the day's analysis over. The advice it wrote stays unless removed by hand.
export async function clearAnalysis(date) {
  const existing = await getEntry(date);
  if (!existing?.answers?.analysis) return;
  const answers = { ...existing.answers };
  delete answers.analysis;
  await putEntry({ ...existing, answers, updatedAt: Date.now() });
  queuePush(date);
  window.dispatchEvent(new CustomEvent("tcm:data-changed", { detail: { dates: [date], cycle: false } }));
}
