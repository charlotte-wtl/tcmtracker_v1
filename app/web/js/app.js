import { T, getLang, setLang } from "./i18n.js";
import { mountDailyLog } from "./daily-log.js";
import { mountCalendar } from "./calendar.js";
import { mountHome } from "./home.js";
import { mountProfile } from "./profile.js";
import { openConnect, offlineThisSession } from "./connect.js";
import { purgeStoredToken, configState, pullRecent, setStatusListener } from "./sync.js";

const NAV_ITEMS = [
  { id: "history", label: "紀錄||History", icon: iconHistory },
  { id: "chat", label: "聊天||Chat", icon: iconChat },
  { id: "home", label: "首頁||Home", icon: iconHome },
  { id: "log", label: "日誌||Daily log", icon: iconLog },
  { id: "profile", label: "個人||Profile", icon: iconProfile },
];

function iconHome() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9h12v-9"/></svg>`; }
function iconLog() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/></svg>`; }
function iconChat() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5h16v11H9l-4 3.5v-3.5H4z"/></svg>`; }
function iconProfile() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.3" r="3.3"/><path d="M5 20c1-4 4.5-6 7-6s6 2 7 6"/></svg>`; }
function iconHistory() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 9.5h16M8 3v3.5M16 3v3.5"/><circle cx="12" cy="14.5" r="2.4"/></svg>`; }

const appEl = document.getElementById("app");

appEl.innerHTML = `
  <header class="app-topbar">
    <p class="app-brand display" id="brandText"></p>
    <div class="topbar-actions">
      <div class="langtoggle" id="langToggle">
        <button type="button" data-lang="zh">中文</button>
        <button type="button" data-lang="en">EN</button>
      </div>
    </div>
  </header>

  <div class="status-strip" id="statusStrip" data-state="saved">
    <div class="status-strip-inner">
      <span class="save-dot"></span>
      <span class="save-label" id="saveLabel"></span>
      <span class="status-sync" id="syncLabel"></span>
    </div>
  </div>

  <main>
    <section class="app-screen" id="screen-chat" hidden></section>
    <section class="app-screen" id="screen-log"></section>
    <section class="app-screen" id="screen-home" hidden></section>
    <section class="app-screen" id="screen-profile" hidden></section>
    <section class="app-screen" id="screen-history" hidden></section>
  </main>

  <nav class="app-nav">
    <div class="app-nav-inner" id="navInner"></div>
  </nav>
`;

const screens = {
  chat: document.getElementById("screen-chat"),
  log: document.getElementById("screen-log"),
  home: document.getElementById("screen-home"),
  profile: document.getElementById("screen-profile"),
  history: document.getElementById("screen-history"),
};
const navInner = document.getElementById("navInner");
const statusStrip = document.getElementById("statusStrip");
const saveLabel = document.getElementById("saveLabel");
const syncLabel = document.getElementById("syncLabel");

let activeScreen = "log";

function renderNav() {
  navInner.innerHTML = NAV_ITEMS.map((item) => `
    <button type="button" class="nav-item${item.id === activeScreen ? " active" : ""}" data-screen="${item.id}">
      ${item.icon()}
      <span>${T(item.label)}</span>
    </button>
  `).join("");
}

let dailyLog = null;
let calendar = null;
let home = null;

function showScreen(id) {
  activeScreen = id;
  Object.keys(screens).forEach((key) => { screens[key].hidden = key !== id; });
  renderNav();
  window.location.hash = `#/${id}`;
  window.scrollTo(0, 0);
  // Re-read on every visit so days logged or edited since show their dots.
  if (id === "history" && calendar) calendar.refresh();
  if (id === "home" && home) home.refresh();
}

navInner.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-screen]");
  if (!btn) return;
  showScreen(btn.dataset.screen);
});

document.getElementById("langToggle").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-lang]");
  if (!btn) return;
  setLang(btn.dataset.lang);
});

function renderChrome() {
  document.documentElement.setAttribute("data-lang", getLang());
  document.querySelectorAll("#langToggle button").forEach((b) => b.classList.toggle("on", b.dataset.lang === getLang()));
  document.getElementById("brandText").textContent = T("每日中醫日記||Daily TCM Log");
  renderNav();
  renderSaveStatus(lastSaveState);
  renderSyncStatus(lastSyncState);
}

const SAVE_LABELS = {
  saving: "儲存中...||Saving...",
  saved: "已儲存||Saved",
  offline: "尚未儲存 — 離線||Unsaved — offline",
};
const SYNC_LABELS = {
  syncing: "雲端同步中||Syncing",
  synced: "已同步||Synced",
  error: "尚未同步至雲端||Not synced to cloud",
  "not-configured": "未設定 GitHub||GitHub not set up",
  "needs-token": "需要重新輸入 token||Token needed this session",
  "no-user-id": "尚未連線編號||No user ID connected",
  ready: "已連線||Connected",
  pulling: "正在更新||Updating",
  merged: "已合併其他裝置的更新||Merged changes from another device",
  offline: "離線中，連上網路後同步||Offline — will sync when back online",
};

let lastSaveState = "saved";
let lastSyncState = "not-configured";

function renderSaveStatus(state) {
  lastSaveState = state;
  statusStrip.dataset.state = state;
  saveLabel.textContent = T(SAVE_LABELS[state] || SAVE_LABELS.saved);
}
function renderSyncStatus(state) {
  lastSyncState = state;
  syncLabel.textContent = "☁ " + T(SYNC_LABELS[state] || SYNC_LABELS["not-configured"]);
}

window.addEventListener("tcm:lang-change", renderChrome);

/* ---------------- Placeholder screens ---------------- */

function renderPlaceholder(el, titlePair, bodyPair) {
  el.innerHTML = `<div class="placeholder-screen">
    <h1 class="display">${T(titlePair)}</h1>
    <p>${T(bodyPair)}</p>
  </div>`;
}

function renderChat() {
  renderPlaceholder(screens.chat, "聊天||Chat",
    "之後會在這裡與分析結果延伸對話。目前請繼續使用你原本的分析對話。||In-app chat with your analysis results lands in a later phase. For now, keep using your existing analysis conversation.");
}
/* ---------------- Boot ---------------- */

function initFromHash() {
  const id = (window.location.hash || "").replace("#/", "");
  if (screens[id]) activeScreen = id;
}

initFromHash();
renderChrome();
renderChat();
Object.keys(screens).forEach((key) => { screens[key].hidden = key !== activeScreen; });

setStatusListener((state, detail) => {
  renderSyncStatus(state === "error" && detail === "offline" ? "offline" : state);
});

dailyLog = mountDailyLog(screens.log, { onSaveStatus: renderSaveStatus });

calendar = mountCalendar(screens.history, {
  onEditDay: (dateStr) => {
    dailyLog.openDate(dateStr);
    showScreen("log");
  },
});

home = mountHome(screens.home, { onOpenProfile: () => showScreen("profile") });

async function connectAndSync(options) {
  const connected = await openConnect(options);
  window.dispatchEvent(new CustomEvent("tcm:connection-changed"));
  renderSyncStatus(await configState());
  if (connected) sync();
}

mountProfile(screens.profile, { onConnect: connectAndSync });

// Download what other devices saved, then upload anything waiting here.
let lastPull = 0;
async function sync({ force = true } = {}) {
  if (!force && Date.now() - lastPull < 20000) return;
  if ((await configState()) !== "ready") { renderSyncStatus(await configState()); return; }
  lastPull = Date.now();
  await pullRecent();
}

// Coming back to the app (e.g. the phone tab left open since the morning)
// must show the latest before you add to it.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") sync({ force: false });
});
window.addEventListener("online", () => sync());

// Earlier versions persisted the token to IndexedDB. Remove any such token on
// every startup so upgrading the app is enough to clear it.
purgeStoredToken().then(async () => {
  const state = await configState();
  renderSyncStatus(state);
  if (state === "ready") sync();
  else if (!offlineThisSession()) connectAndSync({ allowOffline: true });
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
