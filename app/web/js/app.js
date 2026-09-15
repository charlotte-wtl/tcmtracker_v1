import { T, getLang, setLang } from "./i18n.js";
import { mountDailyLog } from "./daily-log.js";
import {
  getConfig, setConfig, testConnection, syncAllPending, getUserId, setUserId, claimUserId,
  setToken, purgeStoredToken, configState,
} from "./sync.js";

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

function showScreen(id) {
  activeScreen = id;
  Object.keys(screens).forEach((key) => { screens[key].hidden = key !== id; });
  renderNav();
  window.location.hash = `#/${id}`;
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
function renderHome() {
  renderPlaceholder(screens.home, "首頁||Home",
    "首頁（週期日、下次經期預估、目前體質）將在下一階段建置。目前請從下方導覽列前往「日誌」開始記錄。||Home (cycle day, next-period estimate, current condition) is built in a later phase. Use \"Daily log\" below to start today's entry.");
}
function renderHistory() {
  renderPlaceholder(screens.history, "紀錄||History",
    "日曆檢視（可回顧、編輯任何過去日子）將在下一階段建置。||The calendar view — jump to and edit any past day — is built in a later phase.");
}

/* ---------------- Profile / GitHub settings ---------------- */

async function renderProfile() {
  const cfg = await getConfig();
  const userId = await getUserId();
  screens.profile.innerHTML = `
    <div class="placeholder-screen" style="padding-top:36px;">
      <h1 class="display">${T("個人||Profile")}</h1>
      <p>${T("使用者類型、病歷匯入等功能將在下一階段建置。以下為雲端同步設定。||User type and history import land in a later phase. GitHub sync setup is below.")}</p>
    </div>
    <div class="card settings-form">
      <h2 style="font-size:1rem;margin-bottom:4px;">${T("GitHub 雲端同步||GitHub sync")}</h2>
      <p class="settings-hint">${T("需要一個有 repo 權限的 GitHub personal access token，僅用於寫入你自己指定的私人倉庫。||Needs a GitHub personal access token with repo access, used only to write to a private repo you specify.")}</p>

      <label for="ghToken">${T("Personal access token||Personal access token")}</label>
      <input type="password" id="ghToken" autocomplete="off" spellcheck="false" placeholder="github_pat_..." value="${cfg.gh_token || ""}">
      <p class="settings-hint">${T("此 token 只保留在這個分頁，關閉分頁就會清除，不會存到裝置上。每次開啟需重新貼上。||This token is kept only in this browser tab. It is cleared when the tab closes and is never written to the device — you will paste it again next session.")}</p>
      <div class="btnrow" style="padding-top:8px;">
        <button class="btn ghost" id="ghForgetBtn">${T("立即清除 token||Forget token now")}</button>
      </div>

      <label for="ghOwner">${T("GitHub 帳號||GitHub owner")}</label>
      <input type="text" id="ghOwner" value="${cfg.gh_owner || "charlotte-wtl"}">

      <label for="ghRepo">${T("倉庫名稱||Repository name")}</label>
      <input type="text" id="ghRepo" value="${cfg.gh_repo || "personal_tcm_daily_log"}">

      <label for="ghBranch">${T("分支||Branch")}</label>
      <input type="text" id="ghBranch" value="${cfg.gh_branch || "main"}">

      <label for="ghPrefix">${T("路徑前綴||Path prefix")}</label>
      <input type="text" id="ghPrefix" value="${cfg.gh_path_prefix || "user-data/"}">

      <div class="btnrow">
        <button class="btn accent" id="ghSaveBtn">${T("儲存||Save")}</button>
        <button class="btn" id="ghTestBtn">${T("測試連線||Test connection")}</button>
      </div>
      <div class="settings-status" id="ghStatus"></div>
    </div>

    <div class="card settings-form">
      <h2 style="font-size:1rem;margin-bottom:4px;">${T("使用者編號||User ID")}</h2>
      <p class="settings-hint">${T("這台裝置的紀錄會存到 user-data/&lt;編號&gt;/ 並產生 &lt;編號&gt;_daily_log.md。若你已有既有紀錄（例如 u001），請直接填入該編號；留空則第一次同步時自動取用下一個未使用的編號。||This device's entries are written to user-data/&lt;id&gt;/ and rendered into &lt;id&gt;_daily_log.md. If you already have a log (e.g. u001), enter that id. Leave blank and the next unused id is claimed automatically on first sync.")}</p>

      <label for="userIdInput">${T("編號||ID")}</label>
      <input type="text" id="userIdInput" placeholder="u001" value="${userId || ""}">

      <div class="btnrow">
        <button class="btn accent" id="userIdSaveBtn">${T("儲存編號||Save ID")}</button>
        <button class="btn" id="userIdClaimBtn">${T("自動取號||Auto-assign")}</button>
      </div>
      <div class="settings-status" id="userIdStatus"></div>
    </div>
  `;

  const statusEl = screens.profile.querySelector("#ghStatus");
  function showStatus(ok, text) {
    statusEl.classList.add("show");
    statusEl.classList.toggle("ok", ok);
    statusEl.classList.toggle("error", !ok);
    statusEl.textContent = text;
  }

  // Both buttons persist what is currently typed in the form first. Testing
  // against a stale saved config (rather than what the user is looking at)
  // reports "not-configured" for a form that looks complete.
  async function saveFormValues() {
    const values = {
      gh_token: screens.profile.querySelector("#ghToken").value.trim(),
      gh_owner: screens.profile.querySelector("#ghOwner").value.trim(),
      gh_repo: screens.profile.querySelector("#ghRepo").value.trim(),
      gh_branch: screens.profile.querySelector("#ghBranch").value.trim() || "main",
      gh_path_prefix: screens.profile.querySelector("#ghPrefix").value.trim() || "entries/",
    };
    await setConfig(values);
    return values;
  }

  function missingFields(values) {
    const missing = [];
    if (!values.gh_token) missing.push(T("token||token"));
    if (!values.gh_owner) missing.push(T("帳號||owner"));
    if (!values.gh_repo) missing.push(T("倉庫名稱||repository name"));
    return missing;
  }

  screens.profile.querySelector("#ghSaveBtn").addEventListener("click", async () => {
    const values = await saveFormValues();
    const missing = missingFields(values);
    if (missing.length) {
      showStatus(false, T("已儲存，但還缺少：||Saved, but still missing: ") + missing.join(", "));
    } else {
      showStatus(true, T("已儲存。||Saved."));
    }
    syncAllPending(renderSyncStatus);
  });

  screens.profile.querySelector("#ghTestBtn").addEventListener("click", async () => {
    const values = await saveFormValues();
    const missing = missingFields(values);
    if (missing.length) {
      showStatus(false, T("尚未填寫：||Not filled in yet: ") + missing.join(", "));
      return;
    }
    showStatus(true, T("測試中...||Testing..."));
    const result = await testConnection();
    if (result.ok) {
      showStatus(true, T("連線成功。||Connected successfully."));
      syncAllPending(renderSyncStatus);
    } else if (result.error === "offline") {
      showStatus(false, T("無法連線到 GitHub。如果這是發布的 Artifact，Artifact 不允許連外部網路 — 請改用 GitHub Pages。||Could not reach GitHub. If this is the published Artifact, Artifacts cannot call external networks — use GitHub Pages instead."));
    } else {
      showStatus(false, T("連線失敗：||Connection failed: ") + result.error);
    }
  });

  screens.profile.querySelector("#ghForgetBtn").addEventListener("click", async () => {
    setToken("");
    await purgeStoredToken();
    screens.profile.querySelector("#ghToken").value = "";
    showStatus(true, T("已清除此分頁的 token。||Token cleared from this tab."));
    renderSyncStatus(await configState());
  });

  const userIdStatusEl = screens.profile.querySelector("#userIdStatus");
  function showUserIdStatus(ok, text) {
    userIdStatusEl.classList.add("show");
    userIdStatusEl.classList.toggle("ok", ok);
    userIdStatusEl.classList.toggle("error", !ok);
    userIdStatusEl.textContent = text;
  }

  screens.profile.querySelector("#userIdSaveBtn").addEventListener("click", async () => {
    const raw = screens.profile.querySelector("#userIdInput").value.trim();
    if (!/^u\d{3,}$/.test(raw)) {
      showUserIdStatus(false, T("編號格式需為 u 加三位數字，例如 u001。||ID must be u followed by at least three digits, e.g. u001."));
      return;
    }
    await setUserId(raw);
    showUserIdStatus(true, T("已儲存編號：||Saved ID: ") + raw);
  });

  screens.profile.querySelector("#userIdClaimBtn").addEventListener("click", async () => {
    await saveFormValues();
    const result = await claimUserId();
    if (!result.ok) {
      showUserIdStatus(false, T("無法取號：||Could not assign: ") + result.error);
      return;
    }
    screens.profile.querySelector("#userIdInput").value = result.userId;
    showUserIdStatus(true, result.claimed
      ? T("已取得新編號：||Claimed new ID: ") + result.userId
      : T("這台裝置已有編號：||This device already has an ID: ") + result.userId);
  });
}

/* ---------------- Boot ---------------- */

function initFromHash() {
  const id = (window.location.hash || "").replace("#/", "");
  if (screens[id]) activeScreen = id;
}

initFromHash();
renderChrome();
renderChat();
renderHome();
renderHistory();
renderProfile();
Object.keys(screens).forEach((key) => { screens[key].hidden = key !== activeScreen; });

mountDailyLog(screens.log, {
  onSaveStatus: renderSaveStatus,
  onSyncStatus: renderSyncStatus,
});

// Earlier versions persisted the token to IndexedDB. Remove any such token on
// every startup so upgrading the app is enough to clear it.
purgeStoredToken()
  .then(() => configState())
  .then(renderSyncStatus)
  .then(() => syncAllPending(renderSyncStatus));

window.addEventListener("online", () => syncAllPending(renderSyncStatus));

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
