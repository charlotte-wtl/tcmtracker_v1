// The connect screen shown when this browser session has no GitHub token.
// "I have an ID" checks the id's folder exists; "I'm new" creates a random
// typo-safe id. The id sits in the username field and the token in the
// password field, so Apple Passwords / iCloud Keychain can save both together.

import { T } from "./i18n.js";
import {
  getConfig, setConfig, getUserId, testConnection, userFolderExists, createUserFolder, adoptUserId, setToken,
} from "./sync.js";
import { generateUserId, normalizeUserId, checkUserId } from "./ids.js";
import { esc } from "./ui.js";

const ERRORS = {
  "bad-token": "這個 token 無效或已過期。||That token isn't valid or has expired.",
  "repo-not-found-or-no-access": "找不到資料倉庫，或這個 token 沒有權限讀寫它。||Can't find the data repo, or this token has no access to it.",
  offline: "目前無法連上 GitHub，請檢查網路。||Can't reach GitHub right now — check your connection.",
  "no-such-id": "找不到這個編號的紀錄。請檢查拼寫，或選「我是新用戶」。||No log found for this ID. Check the spelling, or choose \"I'm new\".",
  "bad-id": "這個編號看起來不對，請再檢查一次。||That ID doesn't look right — please check it.",
  "unsynced-other-user": "這台裝置還有另一個編號尚未上傳的紀錄，請先連線原本的編號完成同步。||This device has unsynced entries for another ID. Connect with that ID first so they upload.",
  taken: "這個編號已被使用，已為你換一個新的。||That ID is already taken — a new one has been generated.",
};

function errorText(code) {
  return T(ERRORS[code] || "連線失敗：||Couldn't connect: ") + (ERRORS[code] ? "" : code);
}

const OFFLINE_KEY = "tcm_offline_session";
export function offlineThisSession() {
  try { return sessionStorage.getItem(OFFLINE_KEY) === "1"; } catch (e) { return false; }
}

// Resolves true once connected, false if the user chose to continue offline.
export function openConnect({ allowOffline = true } = {}) {
  return new Promise(async (resolve) => {
    const cfg = await getConfig();
    const storedId = await getUserId();
    let mode = "existing";
    let newId = generateUserId();

    const overlay = document.createElement("div");
    overlay.className = "connect-overlay";
    document.body.appendChild(overlay);
    document.body.classList.add("connect-open");

    function finish(result) {
      overlay.remove();
      document.body.classList.remove("connect-open");
      resolve(result);
    }

    function render(error = "") {
      overlay.innerHTML = `
        <div class="connect-card card" role="dialog" aria-modal="true" aria-labelledby="connectTitle">
          <h1 class="display" id="connectTitle">${T("連線到你的日誌||Connect to your log")}</h1>
          <p class="settings-hint">${T("紀錄會存在這台裝置，並同步到你的私人 GitHub 倉庫，讓每台裝置都看到最新內容。||Entries save on this device and sync to your private GitHub repo, so every device sees the latest.")}</p>

          <div class="connect-tabs" role="tablist">
            <button type="button" role="tab" aria-selected="${mode === "existing"}" data-mode="existing">${T("我有編號||I have an ID")}</button>
            <button type="button" role="tab" aria-selected="${mode === "new"}" data-mode="new">${T("我是新用戶||I'm new")}</button>
          </div>

          <form id="connectForm" autocomplete="on">
            ${mode === "existing" ? `
              <label for="connectId">${T("使用者編號||User ID")}</label>
              <input type="text" id="connectId" name="username" autocomplete="username" autocapitalize="characters"
                autocorrect="off" spellcheck="false" placeholder="K7M3-9QXD" value="${esc(storedId || "")}" required>
            ` : `
              <label for="connectId">${T("你的新編號||Your new ID")}</label>
              <div class="connect-newid">
                <input type="text" id="connectId" name="username" autocomplete="username" readonly value="${esc(newId)}">
                <button type="button" class="btn ghost" data-act="regen">${T("換一個||New one")}</button>
              </div>
              <p class="settings-hint">${T("請記下這個編號。在其他裝置輸入它，就能看到同一份紀錄。||Keep this ID — enter it on another device to see the same log.")}</p>
            `}
            <label for="connectToken">${T("GitHub token||GitHub token")}</label>
            <input type="password" id="connectToken" name="password" autocomplete="current-password" required>
            <p class="settings-hint">${T("token 只保存在這次瀏覽，不會寫入裝置。讓 Apple 密碼儲存「編號＋token」，下次一鍵填入。||The token is kept for this session only, never written to the device. Let Apple Passwords save the ID + token to fill them in next time.")}</p>

            <details class="connect-advanced">
              <summary>${T("進階設定||Advanced")}</summary>
              <label for="connectOwner">${T("GitHub 帳號||GitHub owner")}</label>
              <input type="text" id="connectOwner" value="${esc(cfg.gh_owner)}" autocapitalize="off" autocorrect="off" spellcheck="false">
              <label for="connectRepo">${T("資料倉庫||Data repository")}</label>
              <input type="text" id="connectRepo" value="${esc(cfg.gh_repo)}" autocapitalize="off" autocorrect="off" spellcheck="false">
              <label for="connectBranch">${T("分支||Branch")}</label>
              <input type="text" id="connectBranch" value="${esc(cfg.gh_branch)}" autocapitalize="off" autocorrect="off" spellcheck="false">
              <label for="connectPrefix">${T("路徑前綴||Path prefix")}</label>
              <input type="text" id="connectPrefix" value="${esc(cfg.gh_path_prefix)}" autocapitalize="off" autocorrect="off" spellcheck="false">
            </details>

            <div class="settings-status error${error ? " show" : ""}" role="alert">${esc(error)}</div>
            <div class="btnrow">
              <button type="submit" class="btn accent" id="connectSubmit">${mode === "existing" ? T("連線||Connect") : T("建立並連線||Create and connect")}</button>
              ${allowOffline ? `<button type="button" class="btn ghost" data-act="offline">${T("先離線使用||Continue offline")}</button>` : `<button type="button" class="btn ghost" data-act="cancel">${T("取消||Cancel")}</button>`}
            </div>
          </form>
        </div>`;
    }

    overlay.addEventListener("click", (e) => {
      const tab = e.target.closest("[data-mode]");
      if (tab) { mode = tab.dataset.mode; render(); return; }
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "regen") { newId = generateUserId(); overlay.querySelector("#connectId").value = newId; }
      if (act === "offline") {
        try { sessionStorage.setItem(OFFLINE_KEY, "1"); } catch (err) { /* ignore */ }
        finish(false);
      }
      if (act === "cancel") finish(false);
    });

    overlay.addEventListener("submit", async (e) => {
      e.preventDefault();
      const $ = (sel) => overlay.querySelector(sel);
      const submit = $("#connectSubmit");
      const status = $(".settings-status");
      const show = (msg) => { status.textContent = msg; status.classList.toggle("show", !!msg); };
      const id = normalizeUserId($("#connectId").value);
      if (!id || !checkUserId(id)) { show(errorText("bad-id")); return; }

      const values = {
        gh_owner: $("#connectOwner").value.trim(),
        gh_repo: $("#connectRepo").value.trim(),
        gh_branch: $("#connectBranch").value.trim(),
        gh_path_prefix: $("#connectPrefix").value.trim(),
        gh_token: $("#connectToken").value.trim(),
      };
      submit.disabled = true;
      show("");
      submit.textContent = T("連線中…||Connecting…");
      try {
        await setConfig(values);
        const cfg2 = await getConfig();
        const test = await testConnection(cfg2);
        if (!test.ok) throw new Error(test.error);

        if (mode === "existing") {
          if (!(await userFolderExists(cfg2, id))) throw new Error("no-such-id");
        } else {
          const created = await createUserFolder(cfg2, id);
          if (!created.ok) {
            if (created.error === "taken") { newId = generateUserId(); $("#connectId").value = newId; }
            throw new Error(created.error);
          }
        }
        const adopted = await adoptUserId(id);
        if (!adopted.ok) throw new Error(adopted.error);
        try { sessionStorage.removeItem(OFFLINE_KEY); } catch (err) { /* ignore */ }
        finish(true);
      } catch (err) {
        setToken("");
        const code = String(err.message || err);
        submit.disabled = false;
        submit.textContent = mode === "existing" ? T("連線||Connect") : T("建立並連線||Create and connect");
        show(errorText(code === "Failed to fetch" ? "offline" : code));
      }
    });

    render();
    const first = overlay.querySelector(storedId || mode === "new" ? "#connectToken" : "#connectId");
    if (first) first.focus({ preventScroll: true });
  });
}
