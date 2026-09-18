// Profile: account/connection, period history (add or delete past periods),
// and the Apple Health import.

import { T } from "./i18n.js";
import { getUserId, configState, getCycle, setToken, pullRecent } from "./sync.js";
import { activePeriods, daysBetween, periodEnd } from "./cycle.js";
import { addPastPeriod, deletePeriod, importPeriods } from "./cycle-store.js";
import { listItems, addItem, updateItem, deleteItem, KINDS, SCHEDULES } from "./cabinet-store.js";
import { scanHealthExport, periodsFromScan } from "./health-import.js";
import { todayStr } from "./dates.js";
import { esc, fullDate, choose, openSheet } from "./ui.js";

const SOURCES = {
  app: "App||App",
  manual: "手動新增||Added by hand",
  "apple-health": "Apple 健康||Apple Health",
};

const ADD_ERRORS = {
  future: "開始日不能在未來。||The start can't be in the future.",
  "end-before-start": "結束日不能早於開始日。||The end can't be before the start.",
  overlaps: "和已記錄的經期重疊。||That overlaps a period already recorded.",
};

export function mountProfile(root, { onConnect }) {
  let showAll = false;
  let pendingImport = null;
  let importMessage = ""; // survives re-renders triggered by the import itself

  async function render() {
    const [userId, state, cycle, cabinet] = await Promise.all([getUserId(), configState(), getCycle(), listItems()]);
    const periods = activePeriods(cycle.periods).reverse();
    const shown = showAll ? periods : periods.slice(0, 8);
    const connected = state === "ready";

    root.innerHTML = `
      <div class="profile-head">
        <h1 class="display">${T("個人||Profile")}</h1>
      </div>

      <section class="card settings-form">
        <h2 class="card-title">${T("帳號與同步||Account & sync")}</h2>
        <p class="profile-id">${userId
          ? `${T("使用者編號||User ID")} <strong>${esc(userId)}</strong>`
          : T("這台裝置尚未連線到任何編號。||This device isn't linked to an ID yet.")}</p>
        <p class="settings-hint">${connected
          ? T("已連線 GitHub，每次儲存都會同步。||Connected to GitHub — every save syncs.")
          : T("這次瀏覽尚未連線 GitHub：紀錄只存在這台裝置。||Not connected this session — entries stay on this device.")}</p>
        <div class="btnrow">
          ${connected
            ? `<button type="button" class="btn" data-act="pull">${T("立即更新||Update now")}</button>
               <button type="button" class="btn ghost" data-act="disconnect">${T("中斷這次連線||Disconnect this session")}</button>`
            : `<button type="button" class="btn accent" data-act="connect">${T("連線 GitHub||Connect GitHub")}</button>`}
          ${userId ? `<button type="button" class="btn ghost" data-act="switch">${T("切換使用者||Switch user")}</button>` : ""}
        </div>
      </section>

      <section class="card settings-form">
        <h2 class="card-title">${T("藥櫃||Cabinet")}</h2>
        <p class="settings-hint">${T("你手邊有的茶飲和保健品。保健品在日誌「8. 飲食」的早餐前勾選，茶飲在飲品欄下方搜尋；分析時會附上整個藥櫃，好從你已經有的東西給建議。||The teas and supplements you have. Supplements are ticked in 8. Diet, just before breakfast; teas are searched under the Beverage field. The whole cabinet is attached to the analysis so suggestions come from what you already own.")}</p>
        ${cabinet.length ? `<ul class="period-list cabinet-list">${cabinet.map((i) => `
          <li>
            <span class="period-dates">${esc(i.name)}</span>
            <span class="period-meta">${T(KINDS[i.kind] || KINDS.other)} · ${T(SCHEDULES[i.schedule] || SCHEDULES.daily)}${
              i.ingredients ? " · " + esc(i.ingredients) : ""}</span>
            <button type="button" class="btn ghost period-del" data-cab-edit="${esc(i.id)}">${T("編輯||Edit")}</button>
          </li>`).join("")}</ul>` : ""}
        <div class="btnrow"><button type="button" class="btn" data-act="cab-add">${T("新增品項||Add an item")}</button></div>
      </section>

      <section class="card settings-form">
        <h2 class="card-title">${T("經期紀錄||Period history")}</h2>
        <p class="settings-hint">${periods.length
          ? T("共||") + " " + periods.length + " " + T("次經期紀錄。||periods recorded.")
          : T("尚無紀錄。可在下方新增，或從 Apple 健康匯入。||Nothing yet — add past periods below or import from Apple Health.")}</p>
        ${shown.length ? `<ul class="period-list">${shown.map((p) => {
          const end = periodEnd(p, cycle.periods);
          const len = daysBetween(p.start, end) + 1;
          return `<li>
            <span class="period-dates">${esc(fullDate(p.start))}${p.end ? " – " + esc(fullDate(p.end)) : ""}</span>
            <span class="period-meta">${p.end ? len + " " + T("天||days") : T("未記錄結束||no end recorded")} · ${T(SOURCES[p.source] || SOURCES.manual)}</span>
            <button type="button" class="btn ghost period-del" data-del="${esc(p.start)}" aria-label="${esc(T("刪除||Delete") + " " + fullDate(p.start))}">${T("刪除||Delete")}</button>
          </li>`;
        }).join("")}</ul>` : ""}
        ${periods.length > 8 ? `<button type="button" class="btn ghost" data-act="toggle-all">${showAll ? T("只顯示最近||Show recent only") : T("顯示全部||Show all")}</button>` : ""}

        <form class="period-add" id="periodAddForm">
          <h3>${T("新增過去的經期||Add a past period")}</h3>
          <div class="period-add-row">
            <label>${T("開始||Start")}<input type="date" id="periodStart" max="${todayStr()}" required></label>
            <label>${T("結束（可選）||End (optional)")}<input type="date" id="periodEnd" max="${todayStr()}"></label>
          </div>
          <div class="settings-status" id="periodAddStatus" role="status"></div>
          <div class="btnrow"><button type="submit" class="btn">${T("新增||Add")}</button></div>
        </form>
      </section>

      <section class="card settings-form">
        <h2 class="card-title">${T("從 Apple 健康匯入||Import from Apple Health")}</h2>
        <ol class="import-steps">
          <li>${T("在 iPhone 打開「健康」App，點右上角的頭像。||On iPhone, open the Health app and tap your picture (top right).")}</li>
          <li>${T("選「輸出所有健康資料」，並儲存到「檔案」。||Choose \"Export All Health Data\" and save it to Files.")}</li>
          <li>${T("在下方選擇 export.zip。檔案只在這台裝置上讀取，不會上傳；只有經期日期會存入你的紀錄。||Choose export.zip below. It's read on this device only and never uploaded — only period dates are saved.")}</li>
        </ol>
        <label class="btn import-pick">
          <input type="file" id="healthFile" accept=".zip,.xml,application/zip,text/xml" hidden>
          ${T("選擇 export.zip||Choose export.zip")}
        </label>
        <div class="import-progress" id="importProgress" hidden>
          <div class="import-bar"><span id="importBar"></span></div>
          <p class="settings-hint" id="importProgressText"></p>
        </div>
        <div id="importReview">${importMessage ? `<div class="settings-status ok show">${esc(importMessage)}</div>` : ""}</div>
      </section>`;
  }

  function setStatus(el, ok, text) {
    el.classList.add("show");
    el.classList.toggle("ok", ok);
    el.classList.toggle("error", !ok);
    el.textContent = text;
  }

  root.addEventListener("click", async (e) => {
    const del = e.target.closest("[data-del]");
    if (del) {
      const start = del.dataset.del;
      const ok = await choose({
        title: T("刪除這次經期紀錄？||Delete this period?"),
        text: fullDate(start),
        actions: [
          { label: T("刪除||Delete"), kind: "accent", value: true },
          { label: T("取消||Cancel"), kind: "ghost", value: false },
        ],
      });
      if (ok) await deletePeriod(start);
      return;
    }
    const edit = e.target.closest("[data-cab-edit]");
    if (edit) { openCabinetSheet((await listItems()).find((i) => i.id === edit.dataset.cabEdit)); return; }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    if (act === "cab-add") { openCabinetSheet(null); return; }
    if (act === "connect") onConnect({ allowOffline: true });
    if (act === "switch") onConnect({ allowOffline: false });
    if (act === "pull") pullRecent();
    if (act === "disconnect") { setToken(""); render(); window.dispatchEvent(new CustomEvent("tcm:connection-changed")); }
    if (act === "toggle-all") { showAll = !showAll; render(); }
    if (act === "import-confirm" && pendingImport) {
      const { periods, spotting } = pendingImport;
      pendingImport = null;
      const result = await importPeriods(periods, spotting);
      importMessage = T("已匯入||Imported ") + " " + result.added + " " + T("次經期||periods") +
        (result.skipped ? "；" + T("略過已記錄的||skipped (already recorded): ") + " " + result.skipped : "") +
        (result.spotting ? "；" + T("點滴出血||spotting days:") + " " + result.spotting + T("天||") : "");
      render();
    }
    if (act === "import-cancel") { pendingImport = null; root.querySelector("#importReview").innerHTML = ""; }
  });

  root.addEventListener("submit", async (e) => {
    if (e.target.id !== "periodAddForm") return;
    e.preventDefault();
    const start = root.querySelector("#periodStart").value;
    const end = root.querySelector("#periodEnd").value || undefined;
    const status = root.querySelector("#periodAddStatus");
    const result = await addPastPeriod(start, end);
    if (!result.ok) {
      setStatus(status, false, T(ADD_ERRORS[result.error] || result.error) + (result.with ? " (" + fullDate(result.with) + ")" : ""));
    }
    // On success the list re-renders through tcm:data-changed.
  });

  root.addEventListener("change", async (e) => {
    if (e.target.id !== "healthFile" || !e.target.files[0]) return;
    const file = e.target.files[0];
    const progress = root.querySelector("#importProgress");
    const bar = root.querySelector("#importBar");
    const text = root.querySelector("#importProgressText");
    const review = root.querySelector("#importReview");
    review.innerHTML = "";
    importMessage = "";
    progress.hidden = false;
    let lastPaint = 0;
    try {
      const scan = await scanHealthExport(file, (f) => {
        const now = performance.now();
        if (now - lastPaint < 80 && f < 1) return;
        lastPaint = now;
        bar.style.width = Math.round(f * 100) + "%";
        text.textContent = T("讀取中||Reading") + " " + Math.round(f * 100) + "%";
      });
      const periods = periodsFromScan(scan);
      progress.hidden = true;
      if (!periods.length) {
        review.innerHTML = `<div class="settings-status error show">${T("這個檔案裡沒有找到經期紀錄。||No period records were found in this file.")}</div>`;
        return;
      }
      pendingImport = { periods, spotting: [...scan.spotting] };
      review.innerHTML = `<div class="import-review">
        <p>${esc(T("找到||Found ") + " " + periods.length + " " + T("次經期||periods") + "（" +
          fullDate(periods[0].start) + " – " + fullDate(periods[periods.length - 1].start) + "）" +
          (scan.spotting.size ? "，" + T("點滴出血||spotting days") + " " + scan.spotting.size + " " + T("天||") : ""))}</p>
        <p class="settings-hint">${T("已經記錄過的經期會自動略過，不會重複。||Periods already recorded are skipped, never duplicated.")}</p>
        <div class="btnrow">
          <button type="button" class="btn accent" data-act="import-confirm">${T("匯入||Import")}</button>
          <button type="button" class="btn ghost" data-act="import-cancel">${T("取消||Cancel")}</button>
        </div>
      </div>`;
    } catch (err) {
      progress.hidden = true;
      const messages = {
        "not-a-zip": "無法讀取這個檔案，請選擇 export.zip。||Couldn't read this file — choose export.zip.",
        "export-xml-not-found": "壓縮檔裡沒有 export.xml。||export.xml wasn't found inside the zip.",
        "browser-too-old": "這個瀏覽器太舊，無法解壓縮。請更新 iOS 或改用電腦。||This browser can't unzip files — update iOS or use a computer.",
      };
      review.innerHTML = `<div class="settings-status error show">${esc(T(messages[err.message] || "匯入失敗：||Import failed: ") + (messages[err.message] ? "" : err.message))}</div>`;
    } finally {
      e.target.value = "";
    }
  });

  // Add or edit one cabinet item. Passing an item switches to edit mode,
  // which also offers removal.
  function openCabinetSheet(item) {
    openSheet((sheet, close) => {
      sheet.innerHTML = `<h2>${item ? T("編輯品項||Edit item") : T("新增到藥櫃||Add to your cabinet")}</h2>
        <form id="cabForm">
          <label for="cabName">${T("名稱||Name")}</label>
          <input type="text" id="cabName" required value="${esc(item?.name || "")}" placeholder="${T("例如：紅棗枸杞茶||e.g. red date & goji tea")}">
          <label>${T("類型||Type")}</label>
          <div class="opts" id="cabKind">${Object.entries(KINDS).map(([k, label]) =>
            `<button type="button" class="opt${(item?.kind || "tea") === k ? " on" : ""}" data-kind="${k}">${T(label)}</button>`).join("")}</div>
          <label>${T("頻率||How often")}</label>
          <div class="opts" id="cabSchedule">${Object.entries(SCHEDULES).map(([k, label]) =>
            `<button type="button" class="opt${(item?.schedule || "daily") === k ? " on" : ""}" data-schedule="${k}">${T(label)}</button>`).join("")}</div>
          <label for="cabIngredients">${T("成分（名稱看不出來時才需要）||Ingredients (only if the name doesn't say)")}</label>
          <input type="text" id="cabIngredients" value="${esc(item?.ingredients || "")}" placeholder="${T("例如：黃耆、當歸、紅棗||e.g. astragalus, angelica, red dates")}">
          <div class="settings-status error" id="cabStatus"></div>
          <div class="btnrow">
            <button type="submit" class="btn accent">${item ? T("儲存||Save") : T("加入||Add")}</button>
            ${item ? `<button type="button" class="btn ghost" data-cab-remove="1">${T("移除||Remove")}</button>` : ""}
            <button type="button" class="btn ghost" data-close="1">${T("取消||Cancel")}</button>
          </div>
        </form>`;
      sheet.addEventListener("click", async (e) => {
        const kind = e.target.closest("[data-kind]");
        if (kind) { sheet.querySelectorAll("[data-kind]").forEach((b) => b.classList.toggle("on", b === kind)); return; }
        const sch = e.target.closest("[data-schedule]");
        if (sch) { sheet.querySelectorAll("[data-schedule]").forEach((b) => b.classList.toggle("on", b === sch)); return; }
        if (e.target.closest("[data-close]")) close();
        if (e.target.closest("[data-cab-remove]")) {
          close();
          const ok = await choose({
            title: T("從藥櫃移除？||Remove from your cabinet?"),
            text: item.name + " — " + T("已經記錄過的日子不受影響。||days that already recorded it are unaffected."),
            actions: [
              { label: T("移除||Remove"), kind: "accent", value: true },
              { label: T("取消||Cancel"), kind: "ghost", value: false },
            ],
          });
          if (ok) { await deleteItem(item.id); render(); }
        }
      });
      sheet.querySelector("#cabForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const values = {
          name: sheet.querySelector("#cabName").value,
          kind: sheet.querySelector("#cabKind .on")?.dataset.kind,
          schedule: sheet.querySelector("#cabSchedule .on")?.dataset.schedule,
          ingredients: sheet.querySelector("#cabIngredients").value,
        };
        const result = item
          ? await updateItem(item.id, { ...values, name: values.name.trim() })
          : await addItem(values);
        if (!result.ok) {
          const status = sheet.querySelector("#cabStatus");
          status.classList.add("show");
          status.textContent = result.error === "duplicate"
            ? T("藥櫃裡已經有同名的品項。||An item with that name is already in your cabinet.")
            : T("請輸入名稱。||Please enter a name.");
          return;
        }
        close();
        render();
      });
      sheet.querySelector("#cabName").focus({ preventScroll: true });
    });
  }

  window.addEventListener("tcm:data-changed", (e) => { if (e.detail?.cycle && !pendingImport) render(); });
  window.addEventListener("tcm:connection-changed", render);
  window.addEventListener("tcm:lang-change", render);
  render();
  return { refresh: render };
}
