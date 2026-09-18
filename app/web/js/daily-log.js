// Daily log screen: the sequential 11-section questionnaire, ported from the
// Sprint 1 Artifact onto IndexedDB (instant local autosave) + background
// GitHub sync. Logic is intentionally close to the original — same
// data-driven SCHEMA approach, same sequential-reveal UX — only the storage
// layer and visual system changed.

import { T, getLang } from "./i18n.js";
import {
  SCHEMA, CYCLE_FIELD, MOOD_WORDS, ALWAYS_ON, NONE_MARKERS, SECTION_COLORS,
} from "./schema.js";
import { getEntry, putEntry } from "./db.js";
import { queuePush, fetchDay, getCycle } from "./sync.js";
import { todayStr, shiftDate, parseDateStr } from "./dates.js";
import { sectionOrder, getActiveDetails, sectionLines } from "./summary.js";
import { mergeEntries, sameEntryContent } from "./merge.js";
import { cycleStatus, periodCovering } from "./cycle.js";
import { startPeriod, endPeriod, PERIOD_PHASE } from "./cycle-store.js";
import { listItems, addItem, KINDS, SCHEDULES } from "./cabinet-store.js";
import { openSheet, choose } from "./ui.js";

function clone(v) { return JSON.parse(JSON.stringify(v)); }

const TONE_VARS = {
  mauve: "var(--tone-mauve)", ochre: "var(--tone-ochre)", clay: "var(--tone-clay)",
  slate: "var(--tone-slate)", moss: "var(--tone-moss)", "stone-blue": "var(--tone-stone-blue)",
  rose: "var(--tone-rose)",
};

// `cabinet` is not a section any more — supplements are ticked inside 8. 飲食 —
// but it stays its own key so days recorded before the move still read back.
function blankAnswers() {
  const a = { meta: {}, cabinet: {} };
  Object.keys(SCHEMA).forEach((secId) => { a[secId] = {}; });
  return a;
}

// Entries saved before a section existed (e.g. the regular-day section) lack
// its key; fill the gaps so rendering never meets an undefined section.
function withAllSections(answers) {
  const a = answers || {};
  if (!a.meta) a.meta = {};
  if (!a.cabinet) a.cabinet = {};
  Object.keys(SCHEMA).forEach((secId) => { if (!a[secId]) a[secId] = {}; });
  return a;
}

export function mountDailyLog(root, { onSaveStatus }) {
  const state = {
    date: todayStr(),
    answers: blankAnswers(),
    done: new Set(),
    expanded: new Set([ALWAYS_ON[0]]),
    enteredIds: new Set([ALWAYS_ON[0]]),
    dirty: false,
    // What this screen's copy was based on — the reference point for merging
    // in changes that arrive from another device while the day is open.
    snapshot: null,
    editSeq: 0,
    periods: [],
    cabinet: [],
  };
  let loadSeq = 0;

  root.innerHTML = `
    <div id="storageBanner" class="banner"></div>
    <div class="ticket">
      <div class="ticket-inner">
        <div>
          <div class="ticket-date" id="ticketDate"></div>
          <div class="ticket-sub" id="ticketSub"></div>
        </div>
      </div>
      <div class="ticket-perf"></div>
      <div class="ticket-inner">
        <div class="ticket-progress" id="progressText"></div>
      </div>
      <input type="date" id="dateInput">
    </div>
    <div class="pastday-bar" id="pastDayBar" hidden>
      <span id="pastDayText"></span>
      <button type="button" class="btn ghost" id="backToTodayBtn"></button>
    </div>
    <div class="mood-card">
      <p class="mood-prompt" id="moodPrompt"></p>
      <p class="mood-hint" id="moodHint"></p>
      <div class="mood-row" id="moodBlobs"></div>
    </div>
    <div id="cycleField"></div>
    <div id="sections"></div>
    <div class="actionbar">
      <button class="btn ghost" id="resetBtn"></button>
      <div class="spacer"></div>
      <button class="btn" id="laterBtn"></button>
      <button class="btn accent" id="analyzeBtn"></button>
    </div>
  `;

  const $ = (sel) => root.querySelector(sel);

  function currentOrder() {
    return sectionOrder(state.answers.meta.cyclePhase);
  }
  function flowOrder() { return currentOrder(); }
  function firstIncompleteId(order) { return order.find((id) => !state.done.has(id)); }

  function markDirty() { state.dirty = true; state.editSeq++; }
  function fieldValue(secId, fieldId) { return state.answers[secId][fieldId]; }
  function setFieldValue(secId, fieldId, value) { state.answers[secId][fieldId] = value; markDirty(); }
  function detailValue(secId, fieldId, detailId) { return state.answers[secId][fieldId + "__" + detailId]; }
  function setDetailValue(secId, fieldId, detailId, value) { state.answers[secId][fieldId + "__" + detailId] = value; markDirty(); }

  // What separates one drink from the next in the beverage field.
  const SEP_RE = /[、,，]/;

  function escHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
  function escAttr(s) { return escHtml(s).replace(/"/g, "&quot;"); }

  function renderOptions(secId, field, value) {
    const isMulti = field.type === "multi";
    let html = `<div class="opts">` + field.options.map((opt) => {
      const on = isMulti ? (Array.isArray(value) && value.includes(opt)) : (value === opt);
      return `<button type="button" class="opt${on ? " on" : ""}" data-sec="${secId}" data-field="${field.id}" data-type="${field.type}" data-value="${escAttr(opt)}">${T(opt)}</button>`;
    }).join("") + `</div>`;
    if (field.allowOther !== false) {
      const otherVal = fieldValue(secId, field.id + "__other");
      html += `<input type="text" class="other-input" placeholder="${T("其他（可輸入）||Other (type here)")}" data-sec="${secId}" data-field="${field.id}__other" data-type="text" value="${escAttr(otherVal || "")}">`;
    }
    return html;
  }
  function renderScale(secId, field, value) {
    let out = `<div class="scale">`;
    for (let i = field.min; i <= field.max; i++) {
      const on = String(value) === String(i);
      let label = String(i);
      if (i === field.min && field.minLabel) label += " " + T(field.minLabel);
      if (i === field.max && field.maxLabel) label += " " + T(field.maxLabel);
      out += `<button type="button" class="opt${on ? " on" : ""}" data-sec="${secId}" data-field="${field.id}" data-type="scale" data-value="${i}">${label}</button>`;
    }
    return out + `</div>`;
  }
  function renderSlider(secId, field, value) {
    const touched = value !== undefined && value !== "" && value !== null;
    const cur = touched ? Number(value) : Math.round((field.min + field.max) / 2);
    return `<div class="slider-wrap">
      <input type="range" min="${field.min}" max="${field.max}" step="1" value="${cur}" data-sec="${secId}" data-field="${field.id}" data-type="slider">
      <div class="slider-labels"><span>${T(field.minLabel || "")}</span><span class="slider-val">${touched ? cur : "—"}</span><span>${T(field.maxLabel || "")}</span></div>
    </div>`;
  }
  function renderDetailGroup(secId, field, d) {
    const dv = detailValue(secId, field.id, d.id);
    let body;
    if (d.type === "single") {
      body = `<div class="opts">` + d.options.map((opt) => {
        const on = dv === opt;
        return `<button type="button" class="opt${on ? " on" : ""}" data-sec="${secId}" data-field="${field.id}" data-detail="${d.id}" data-type="detail" data-value="${escAttr(opt)}">${T(opt)}</button>`;
      }).join("") + `</div>`;
    } else if (d.type === "multi") {
      body = `<div class="opts">` + d.options.map((opt) => {
        const on = Array.isArray(dv) && dv.includes(opt);
        return `<button type="button" class="opt${on ? " on" : ""}" data-sec="${secId}" data-field="${field.id}" data-detail="${d.id}" data-type="detailmulti" data-value="${escAttr(opt)}">${T(opt)}</button>`;
      }).join("") + `</div>`;
    } else {
      body = `<input type="${d.type === "number" ? "number" : "text"}" data-sec="${secId}" data-field="${field.id}" data-detail="${d.id}" data-type="detailtext" value="${escAttr(dv || "")}">`;
    }
    return `<div class="detail"><div class="q">${T(d.label)}</div>${body}</div>`;
  }
  function renderDetails(secId, field, value) {
    const active = getActiveDetails(field, value);
    if (!active) return "";
    return active.map((d) => renderDetailGroup(secId, field, d)).join("");
  }
  function renderPerItemSeverity(secId, field, value) {
    const selected = (Array.isArray(value) ? value : []).filter((v) => !NONE_MARKERS.includes(v));
    if (!selected.length) return "";
    return `<div class="detail">` + selected.map((v) => {
      const detId = "sev__" + encodeURIComponent(v);
      const dv = detailValue(secId, field.id, detId);
      return `<div class="q" style="margin-top:8px;">${T(v)} — ${T("程度||Severity")}</div><div class="opts">` +
        ["輕||Mild", "中||Moderate", "重||Severe"].map((opt) => {
          const on = dv === opt;
          return `<button type="button" class="opt${on ? " on" : ""}" data-sec="${secId}" data-field="${field.id}" data-detail="${detId}" data-type="detail" data-value="${escAttr(opt)}">${T(opt)}</button>`;
        }).join("") + `</div>`;
    }).join("") + `</div>`;
  }
  function renderField(secId, field) {
    const value = fieldValue(secId, field.id);
    let control;
    if (field.type === "scale") control = renderScale(secId, field, value);
    else if (field.type === "slider") control = renderSlider(secId, field, value);
    else if (field.type === "single" || field.type === "multi" || field.type === "yesno") control = renderOptions(secId, field, value);
    else if (field.type === "text") control = field.multiline
      ? `<textarea data-sec="${secId}" data-field="${field.id}" data-type="text">${escHtml(value || "")}</textarea>`
      : `<input type="text" data-sec="${secId}" data-field="${field.id}" data-type="text"${field.suggest ? ` data-suggest="${field.suggest}"` : ""} value="${escAttr(value || "")}">`;
    else if (field.type === "number") control = `<input type="number" data-sec="${secId}" data-field="${field.id}" data-type="number" value="${escAttr(value || "")}">`;
    else if (field.type === "cabinet") control = renderSupplementTicks();
    if (field.type === "multi" && field.perItemSeverity) control += renderPerItemSeverity(secId, field, value);
    if (field.suggest === "tea") control += renderTeaSearch();
    return `<div class="field"><label class="q">${T(field.label)}</label>${control}${renderDetails(secId, field, value)}</div>`;
  }

  function renderSection(secId) {
    const sec = SCHEMA[secId];
    const isDone = state.done.has(secId);
    const isExpanded = state.expanded.has(secId);
    const filledCount = Object.keys(state.answers[secId]).filter((k) => {
      const v = state.answers[secId][k];
      return Array.isArray(v) ? v.length > 0 : (v !== undefined && v !== "" && v !== null);
    }).length;
    const tag = isDone ? (filledCount > 0 ? T("已完成||Done") : T("已略過||Skipped")) : "";
    let body = "";
    if (isExpanded) {
      body = `<div class="sec-body">` + sec.fields.map((f) => renderField(secId, f)).join("") +
        `<div class="btnrow"><button class="btn accent" data-action="done" data-sec="${secId}">${T("完成本節，繼續下一節||Done, next section")}</button></div></div>`;
    }
    const justEntered = state.enteredIds.has(secId);
    const toneVar = TONE_VARS[SECTION_COLORS[secId]] || "var(--line-strong)";
    return `<section class="sec${justEntered ? " enter" : ""}" data-sec="${secId}">
      <div class="sec-header" data-action="toggle" data-sec="${secId}" style="--sec-tone:${toneVar}">
        <h2>${T(sec.title)}</h2><span class="tag">${tag}</span>
      </div>
      ${body}
    </section>`;
  }

  function cycleLineText() {
    const s = cycleStatus(state.periods, state.date);
    if (!s.hasData) return T("尚未記錄經期||No period recorded yet");
    let text = T("週期第||Cycle day ") + " " + s.cycleDay + " " + T("天||");
    if (s.stats.count) text += " · " + T("平均週期||Average cycle ") + " " + s.stats.average + " " + T("天||days");
    if (s.inPeriod) text += " · " + T("經期中||On period");
    return text.replace(/\s+/g, " ").trim();
  }

  /* ------------- Cabinet: supplements ticked, teas searched ------------- */

  // 中藥 is deliberately left out of the daily log; teas are picked under 飲品.
  function supplementItems() {
    return state.cabinet.filter((i) => i.kind === "supplement" || i.kind === "other");
  }

  function takenChip(name, on) {
    return `<button type="button" class="opt${on ? " on" : ""}" data-cab-take="${escAttr(name)}">${escHtml(name)}</button>`;
  }

  function renderSupplementTicks() {
    const taken = state.answers.cabinet.taken || [];
    const items = supplementItems();
    // "All" means the routine ones. Something you only take when needed is
    // never swept in by one tap; it stays a deliberate choice.
    const daily = items.filter((i) => i.schedule !== "as-needed");
    const allOn = daily.length > 0 && daily.every((i) => taken.includes(i.name));
    const chips = daily.length > 1
      ? [`<button type="button" class="opt${allOn ? " on" : ""}" data-cab-all="1">${T("全部||All")}</button>`]
      : [];
    items.forEach((i) => {
      const note = i.schedule === "as-needed" ? ` <span class="cab-tag">${T(SCHEDULES["as-needed"])}</span>` : "";
      chips.push(`<button type="button" class="opt${taken.includes(i.name) ? " on" : ""}" data-cab-take="${escAttr(i.name)}"
        title="${escAttr(i.ingredients || "")}">${escHtml(i.name)}${note}</button>`);
    });
    // Anything recorded on this day that isn't offered above — a tea ticked
    // before teas moved to 飲品, or an item since removed — stays editable.
    taken.filter((n) => !items.some((i) => i.name === n)).forEach((n) => chips.push(takenChip(n, true)));
    chips.push(`<button type="button" class="opt ghost" data-cab-add="1">＋${T("新增||Add")}</button>`);
    return `<div class="opts">${chips.join("")}</div>`;
  }

  // The beverage box is yours to type in; this searches the cabinet's teas
  // separately, so typing "黑咖啡" there is never treated as a failed search.
  let teaQuery = "";

  function renderTeaChips() {
    const teas = state.cabinet.filter((i) => i.kind === "tea");
    const typed = teaQuery.trim();
    const q = typed.toLowerCase();
    const inText = () => String(fieldValue("diet", "beverage") || "").split(SEP_RE).map((x) => x.trim());
    const already = inText();
    let matches = teas.filter((i) => !q || i.name.toLowerCase().includes(q));
    // A search with no hits shouldn't hide the shelf.
    const noMatch = !!q && !matches.length;
    if (noMatch) matches = teas;
    const chips = matches.map((i) => `<button type="button" class="opt${already.includes(i.name) ? " on" : ""}"
      data-tea-pick="${escAttr(i.name)}" title="${escAttr(i.ingredients || "")}">${escHtml(i.name)}</button>`);
    if (typed && !teas.some((i) => i.name.toLowerCase() === q)) {
      // Offer it first only when nothing matched: otherwise the matches lead.
      const add = `<button type="button" class="opt ghost" data-tea-add="${escAttr(typed)}">＋${T("加入藥櫃||Add to cabinet")}「${escHtml(typed)}」</button>`;
      if (noMatch) chips.unshift(add); else chips.push(add);
    }
    return `<div class="suggest">${chips.length ? `<div class="opts">${chips.join("")}</div>` : ""}</div>`;
  }

  function renderTeaSearch() {
    return `<div class="tea-search">
      <input type="search" class="tea-q" data-tea-search="1" autocomplete="off"
        placeholder="${T("搜尋藥櫃裡的茶飲||Search your cabinet teas")}" value="${escAttr(teaQuery)}">
      ${renderTeaChips()}
    </div>`;
  }

  // Picking a tea adds it to what you already wrote; picking it again takes it
  // back out. `keep` is used when the name was just added to the cabinet from
  // this field, where it is already typed and must not be toggled away.
  function applyTeaPick(name, keep = false) {
    const raw = String(fieldValue("diet", "beverage") || "");
    let parts = raw.split(SEP_RE).map((x) => x.trim()).filter(Boolean);
    if (parts.includes(name)) {
      if (keep) { renderApp(); return; }
      parts = parts.filter((x) => x !== name);
    } else parts.push(name);
    setFieldValue("diet", "beverage", parts.join("、"));
    markDirty();
    renderApp();
    scheduleAutoSave();
  }

  function openCabinetSheet(prefill = {}) {
    const startKind = prefill.kind || "supplement";
    openSheet((sheet, close) => {
      sheet.innerHTML = `<h2>${T("新增到藥櫃||Add to your cabinet")}</h2>
        <form id="cabForm">
          <label for="cabName">${T("名稱||Name")}</label>
          <input type="text" id="cabName" required value="${escAttr(prefill.name || "")}" placeholder="${T("例如：維他命D||e.g. vitamin D")}">
          <label for="cabKind">${T("類型||Type")}</label>
          <div class="opts" id="cabKind">${Object.entries(KINDS).map(([k, label]) =>
            `<button type="button" class="opt${k === startKind ? " on" : ""}" data-kind="${k}">${T(label)}</button>`).join("")}</div>
          <p class="settings-hint">${T("茶飲會出現在「飲品」欄的搜尋，不會出現在藥櫃的勾選清單。||Teas appear in the Beverage search, not in the cabinet's tick list.")}</p>
          <label for="cabSchedule">${T("頻率||How often")}</label>
          <div class="opts" id="cabSchedule">${Object.entries(SCHEDULES).map(([k, label], i) =>
            `<button type="button" class="opt${i === 0 ? " on" : ""}" data-schedule="${k}">${T(label)}</button>`).join("")}</div>
          <label for="cabIngredients">${T("成分（名稱看不出來時才需要）||Ingredients (only if the name doesn't say)")}</label>
          <input type="text" id="cabIngredients" placeholder="${T("例如：黃耆、當歸、紅棗||e.g. astragalus, angelica, red dates")}">
          <div class="settings-status error" id="cabStatus"></div>
          <div class="btnrow">
            <button type="submit" class="btn accent">${T("加入||Add")}</button>
            <button type="button" class="btn ghost" data-close="1">${T("取消||Cancel")}</button>
          </div>
        </form>`;
      sheet.addEventListener("click", (e) => {
        const kind = e.target.closest("[data-kind]");
        if (kind) { sheet.querySelectorAll("[data-kind]").forEach((b) => b.classList.toggle("on", b === kind)); return; }
        const sch = e.target.closest("[data-schedule]");
        if (sch) { sheet.querySelectorAll("[data-schedule]").forEach((b) => b.classList.toggle("on", b === sch)); return; }
        if (e.target.closest("[data-close]")) close();
      });
      sheet.querySelector("#cabForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const result = await addItem({
          name: sheet.querySelector("#cabName").value,
          kind: sheet.querySelector("#cabKind .on")?.dataset.kind,
          schedule: sheet.querySelector("#cabSchedule .on")?.dataset.schedule,
          ingredients: sheet.querySelector("#cabIngredients").value,
        });
        if (!result.ok) {
          const status = sheet.querySelector("#cabStatus");
          status.classList.add("show");
          status.textContent = result.error === "duplicate"
            ? T("藥櫃裡已經有同名的品項。||An item with that name is already in your cabinet.")
            : T("請輸入名稱。||Please enter a name.");
          return;
        }
        close();
        await refreshCabinet();
        // A newly added item is almost always one being taken today — a tea
        // lands in the beverage field, everything else gets ticked.
        if (result.item.kind === "tea") applyTeaPick(result.item.name, true);
        else toggleCabinetItem(result.item.name);
      });
      sheet.querySelector("#cabName").focus({ preventScroll: true });
    });
  }

  // One tap for the routine set; as-needed items stay individual.
  function toggleAllSupplements() {
    const daily = supplementItems().filter((i) => i.schedule !== "as-needed");
    const taken = (state.answers.cabinet.taken || []).slice();
    const allOn = daily.every((i) => taken.includes(i.name));
    const names = daily.map((i) => i.name);
    state.answers.cabinet.taken = allOn
      ? taken.filter((n) => !names.includes(n))
      : taken.concat(names.filter((n) => !taken.includes(n)));
    markDirty();
    renderApp();
    scheduleAutoSave();
  }

  function toggleCabinetItem(name) {
    const taken = (state.answers.cabinet.taken || []).slice();
    const idx = taken.indexOf(name);
    if (idx > -1) taken.splice(idx, 1); else taken.push(name);
    state.answers.cabinet.taken = taken;
    markDirty();
    renderApp();
    scheduleAutoSave();
  }

  function renderCycleField() {
    const value = state.answers.meta.cyclePhase;
    const html = `<div class="mood-card cycle-field"><label class="q" style="display:block;margin-bottom:8px;">${T(CYCLE_FIELD.label)}</label>` +
      `<div class="opts">` + CYCLE_FIELD.options.map((opt) => {
        const on = value === opt;
        return `<button type="button" class="opt${on ? " on" : ""}" data-cycle="1" data-value="${escAttr(opt)}">${T(opt)}</button>`;
      }).join("") + `</div>
      <div class="cycle-line">
        <span>${escHtml(cycleLineText())}</span>
        <button type="button" class="btn ghost" data-cycle-modify="1">${T("修改||Adjust")}</button>
      </div></div>`;
    $("#cycleField").innerHTML = html;
  }

  function buddySvg(index, filled) {
    // A single organic hand-drawn-feel blob, tinted per mood index — no cartoon two-tone
    // stacked characters, just one imperfect shape (wabi-sabi restraint).
    const tones = ["var(--tone-slate)", "var(--tone-stone-blue)", "var(--tone-ochre)", "var(--tone-moss)", "var(--accent)"];
    const tone = tones[index] || "var(--accent)";
    return `<svg viewBox="0 0 60 60" fill="none">
      <path d="M30 4C40 3 53 11 55 25C57 40 46 55 30 56C15 57 4 46 4 30C4 15 18 5 30 4Z"
        fill="${tone}" opacity="${filled ? 1 : 0.55}"/>
      <circle cx="23" cy="29" r="2.4" fill="var(--surface)"/>
      <circle cx="37" cy="29" r="2.4" fill="var(--surface)"/>
    </svg>`;
  }

  function renderMood() {
    const value = state.answers.meta.moodRating;
    $("#moodPrompt").textContent = T("今天感覺如何？||How are you feeling today?");
    $("#moodHint").textContent = T("點選一個角色來記錄心情||Tap a shape to log your mood");
    $("#moodBlobs").innerHTML = MOOD_WORDS.map((word, i) => {
      const on = String(value) === String(i + 1);
      return `<button type="button" class="buddy-wrap" data-mood="${i + 1}" aria-pressed="${on}">
        <span class="buddy">${buddySvg(i, on)}</span>
        <span class="buddy-label">${T(word)}</span>
      </button>`;
    }).join("");
  }

  function formatTicketDate(dateStr) {
    const d = parseDateStr(dateStr);
    if (getLang() === "zh") return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }

  function renderApp() {
    const isToday = state.date === todayStr();
    $("#ticketDate").textContent = formatTicketDate(state.date);
    $("#ticketSub").textContent = isToday ? T("今日紀錄||Today's entry") : T("過去的紀錄||Past entry");
    $("#resetBtn").textContent = isToday ? T("清空今日||Reset today") : T("清空這一天||Reset this day");
    $("#pastDayBar").hidden = isToday;
    $("#pastDayText").textContent = T("正在編輯過去的日子||Editing a past day");
    $("#backToTodayBtn").textContent = T("回到今天||Back to today");
    $("#laterBtn").textContent = T("稍後再分析||Save, analyze later");
    $("#analyzeBtn").textContent = T("執行分析||Run analysis");

    renderCycleField();
    renderMood();

    const order = currentOrder();
    $("#sections").innerHTML = order.map(renderSection).join("");
    state.enteredIds.clear();
    $("#dateInput").value = state.date;
    $("#dateInput").max = todayStr();
    const flow = flowOrder();
    const doneCount = flow.filter((id) => state.done.has(id)).length;
    $("#progressText").textContent = `${T("已完成的段落||Sections done")} ${doneCount} / ${flow.length}`;

    onSaveStatus(state.dirty ? "saving" : "saved");
  }

  /* ---------------- Events ---------------- */

  $("#cycleField").addEventListener("click", (e) => {
    if (e.target.closest("[data-cycle-modify]")) { openCycleSheet(); return; }
    const btn = e.target.closest("button[data-cycle]");
    if (!btn) return;
    const cur = state.answers.meta.cyclePhase;
    state.answers.meta.cyclePhase = cur === btn.dataset.value ? "" : btn.dataset.value;
    markDirty();
    renderApp();
    scheduleAutoSave();
    if (state.answers.meta.cyclePhase === PERIOD_PHASE && !periodCovering(state.periods, state.date)) askPeriodStart();
  });

  function dayWord(date) {
    return date === todayStr() ? T("今天||today") : formatTicketDate(date);
  }

  // Picking 經期 on a day no recorded period covers: is this a new period?
  async function askPeriodStart() {
    const date = state.date;
    const s = cycleStatus(state.periods, date);
    const actions = [
      { label: T("是，經期從這天開始||Yes, it started this day"), kind: "accent", value: "start" },
    ];
    if (s.hasData && s.cycleDay <= 15) {
      actions.push({ label: T("延長上次經期到這一天||Extend my last period to this day"), value: "extend" });
    }
    actions.push({ label: T("不是，只記錄這一天||No, just log this day"), kind: "ghost", value: null });
    const choice = await choose({
      title: T("經期是在||Did your period start ") + dayWord(date) + T("開始的嗎？||?"),
      text: T("記錄經期開始，日曆和首頁就能計算週期與預測。||Marking the start lets the calendar and Home work out your cycle.")
    , actions });
    if (!choice) return;
    await flushAutoSaveNow();
    if (choice === "start") await startPeriod(date);
    else if (choice === "extend") await endPeriod(date);
  }

  function openCycleSheet() {
    const date = state.date;
    const covering = periodCovering(state.periods, date);
    openSheet((sheet, close) => {
      sheet.innerHTML = `<h2>${T("修改週期||Adjust cycle")}</h2>
        <p class="sheet-text">${escHtml(cycleLineText())}</p>
        <div class="sheet-actions">
          <button type="button" class="btn accent" data-act="start">${
            date === todayStr() ? T("經期今天開始（第 1 天）||My period started today (day 1)")
              : escHtml(T("經期從這天開始：||Period started on ") + formatTicketDate(date))}</button>
          ${covering ? `<button type="button" class="btn" data-act="end">${
            date === todayStr() ? T("經期今天結束||My period ended today")
              : escHtml(T("經期在這天結束：||Period ended on ") + formatTicketDate(date))}</button>` : ""}
        </div>
        <form class="sheet-date" data-act-form="1">
          <label for="cycleOtherDate">${T("經期從其他日期開始||It started on a different day")}</label>
          <div class="sheet-date-row">
            <input type="date" id="cycleOtherDate" max="${todayStr()}" required>
            <button type="submit" class="btn">${T("儲存||Save")}</button>
          </div>
        </form>
        <div class="btnrow"><button type="button" class="btn ghost" data-act="close">${T("取消||Cancel")}</button></div>`;
      sheet.addEventListener("click", async (e) => {
        const act = e.target.closest("[data-act]")?.dataset.act;
        if (!act) return;
        close();
        if (act === "close") return;
        await flushAutoSaveNow();
        if (act === "start") await startPeriod(date);
        if (act === "end") await endPeriod(date);
      });
      sheet.querySelector("form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const other = sheet.querySelector("#cycleOtherDate").value;
        if (!other) return;
        close();
        await flushAutoSaveNow();
        await startPeriod(other);
      });
    });
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function scrollToSection(secId) {
    requestAnimationFrame(() => {
      const el = root.querySelector('section.sec[data-sec="' + secId + '"]');
      if (el) el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    });
  }

  $("#moodBlobs").addEventListener("click", (e) => {
    const btn = e.target.closest(".buddy-wrap");
    if (!btn) return;
    const val = btn.dataset.mood;
    const cur = state.answers.meta.moodRating;
    const wasEmpty = !cur;
    state.answers.meta.moodRating = String(cur) === val ? "" : val;
    markDirty();
    renderApp();
    scheduleAutoSave();
    if (wasEmpty && state.answers.meta.moodRating) {
      const first = firstIncompleteId(currentOrder());
      if (first) scrollToSection(first);
    }
  });

  $("#sections").addEventListener("click", (e) => {
    const header = e.target.closest('[data-action="toggle"]');
    if (header) {
      const id = header.getAttribute("data-sec");
      if (state.expanded.has(id)) state.expanded.delete(id); else state.expanded.add(id);
      renderApp();
      return;
    }
    const doneBtn = e.target.closest('[data-action="done"]');
    if (doneBtn) {
      const id = doneBtn.getAttribute("data-sec");
      state.done.add(id);
      state.expanded.delete(id);
      markDirty();
      if (id === "general" || id === "diet") amendPreviousDay(id);
      const next = firstIncompleteId(currentOrder());
      if (next) { state.expanded.add(next); state.enteredIds.add(next); }
      renderApp();
      if (next) scrollToSection(next);
      saveCurrent();
      return;
    }
    const take = e.target.closest("[data-cab-take]");
    if (take) { toggleCabinetItem(take.dataset.cabTake); return; }
    if (e.target.closest("[data-cab-all]")) { toggleAllSupplements(); return; }
    if (e.target.closest("[data-cab-add]")) { openCabinetSheet(); return; }
    const teaPick = e.target.closest("[data-tea-pick]");
    if (teaPick) { applyTeaPick(teaPick.dataset.teaPick); return; }
    const teaAdd = e.target.closest("[data-tea-add]");
    if (teaAdd) { openCabinetSheet({ name: teaAdd.dataset.teaAdd, kind: "tea" }); return; }
    const collapse = e.target.closest('[data-action="collapse"]');
    if (collapse) { state.expanded.delete(collapse.dataset.sec); renderApp(); return; }
    const opt = e.target.closest(".opt");
    if (opt && opt.dataset.type) {
      const secId = opt.dataset.sec, fieldId = opt.dataset.field, val = opt.dataset.value, type = opt.dataset.type;
      if (type === "detail") {
        const detId = opt.dataset.detail;
        const cur = detailValue(secId, fieldId, detId);
        setDetailValue(secId, fieldId, detId, cur === val ? "" : val);
      } else if (type === "detailmulti") {
        const detId = opt.dataset.detail;
        const cur = detailValue(secId, fieldId, detId) || [];
        const idx = cur.indexOf(val);
        const next = cur.slice();
        if (idx > -1) next.splice(idx, 1); else next.push(val);
        setDetailValue(secId, fieldId, detId, next);
      } else if (type === "multi") {
        const cur = fieldValue(secId, fieldId) || [];
        const idx = cur.indexOf(val);
        const next = cur.slice();
        if (idx > -1) next.splice(idx, 1); else next.push(val);
        setFieldValue(secId, fieldId, next);
      } else if (type === "scale") {
        const cur = fieldValue(secId, fieldId);
        setFieldValue(secId, fieldId, String(cur) === val ? "" : val);
      } else {
        const cur = fieldValue(secId, fieldId);
        setFieldValue(secId, fieldId, cur === val ? "" : val);
      }
      renderApp();
      scheduleAutoSave();
    }
  });

  $("#sections").addEventListener("input", (e) => {
    const el = e.target;
    if (el.dataset.teaSearch) {
      teaQuery = el.value;
      const box = el.parentElement.querySelector(".suggest");
      // Re-filter in place: a full re-render would take the keyboard away.
      if (box) box.outerHTML = renderTeaChips();
      return;
    }
    if (!el.dataset.type) return;
    const secId = el.dataset.sec, fieldId = el.dataset.field;
    if (el.dataset.type === "detailtext") {
      setDetailValue(secId, fieldId, el.dataset.detail, el.value);
    } else if (el.dataset.type === "slider") {
      setFieldValue(secId, fieldId, el.value);
      const label = el.parentElement.querySelector(".slider-val");
      if (label) label.textContent = el.value;
    } else {
      setFieldValue(secId, fieldId, el.value);
    }
    // What you type as a drink can change which cabinet teas are already listed.
    if (el.dataset.suggest === "tea") {
      const box = el.parentElement.querySelector(".suggest");
      if (box) box.outerHTML = renderTeaChips();
    }
    scheduleAutoSave();
  });

  $("#dateInput").addEventListener("change", (e) => { if (e.target.value) loadDate(e.target.value); });
  $("#backToTodayBtn").addEventListener("click", () => { loadDate(todayStr()); window.scrollTo(0, 0); });

  $("#resetBtn").addEventListener("click", () => {
    const phase = state.answers.meta.cyclePhase;
    state.answers = blankAnswers();
    state.answers.meta.cyclePhase = phase;
    state.done = new Set();
    settleExpanded();
    markDirty();
    renderApp();
    scheduleAutoSave();
  });

  /* ---------------- Summary ---------------- */

  function buildSummary() {
    const order = currentOrder();
    let out = `【${T("每日中醫日記||Daily TCM Log")}】${formatTicketDate(state.date)}\n`;
    // The cycle day used to be typed by hand; it is computed now, so the
    // analysis still gets it.
    const cyc = cycleStatus(state.periods, state.date);
    if (cyc.hasData) {
      out += T("週期||Cycle") + "：" + T("第||day ") + cyc.cycleDay + T("天||")
        + (cyc.stats.count ? `（${T("平均||average ")}${cyc.stats.average}${T("天||days")}）` : "")
        + (cyc.inPeriod ? "，" + T("經期中||on period") : "") + "\n";
    }
    out += T("整體感覺||Overall mood") + "：" + (state.answers.meta.moodRating ? T(MOOD_WORDS[state.answers.meta.moodRating - 1]) : "") + "\n\n";
    order.forEach((secId) => {
      const lines = sectionLines(secId, state.answers[secId], state.answers);
      if (lines.length) {
        out += T(SCHEMA[secId].title) + "\n" + lines.map((l) => l.label + "：" + l.text).join("\n") + "\n\n";
      }
    });
    // What's in the cabinet, so the analysis can suggest from what you have.
    if (state.cabinet.length) {
      out += T("藥櫃（手邊有的）||Cabinet (what I have)") + "\n";
      out += Object.keys(KINDS).map((kind) => {
        const list = state.cabinet.filter((i) => i.kind === kind);
        if (!list.length) return null;
        return T(KINDS[kind]) + "：" + list.map((i) => i.name
          + (i.ingredients ? `（${i.ingredients}）` : "")
          + (i.schedule === "as-needed" ? "［" + T(SCHEDULES["as-needed"]) + "］" : "")).join("、");
      }).filter(Boolean).join("\n") + "\n";
    }
    return out.trim() + "\n";
  }

  /* ---------------- Storage ---------------- */

  function summarizePrevDayBowel(g) {
    const v = g.prevDayBowelMovement;
    if (!v) return null;
    let line = T("解便狀況||Bowel movement") + "：" + T(v);
    if (v === "有||Yes") {
      const parts = [];
      if (g.prevDayBowelMovement__shape) parts.push(T("大便性狀||Stool shape") + "：" + T(g.prevDayBowelMovement__shape));
      if (g.prevDayBowelMovement__colour) parts.push(T("大便顏色||Stool colour") + "：" + T(g.prevDayBowelMovement__colour));
      if (parts.length) line += "（" + parts.join("；") + "）";
    } else if (v === "無||No") {
      if (g.prevDayBowelMovement__status) line += "（" + T("排便狀況||Bowel status") + "：" + T(g.prevDayBowelMovement__status) + "）";
    }
    return line;
  }
  function summarizePrevDayMeal(d) {
    const v = d.prevDayLateMeal;
    if (!v) return null;
    return T("宵夜／補充飲食||Late snack / extra food") + "：" + v;
  }

  async function amendPreviousDay(sourceSecId) {
    const targetDate = shiftDate(state.date, -1);
    let line = null;
    if (sourceSecId === "general") line = summarizePrevDayBowel(state.answers.general);
    else if (sourceSecId === "diet") line = summarizePrevDayMeal(state.answers.diet);
    if (!line) return;
    const stamp = T("［由||［added from ") + formatTicketDate(state.date) + T("補記］||on, added retroactively］");
    try {
      const existing = await getEntry(targetDate);
      const data = existing || { date: targetDate, answers: blankAnswers(), done: [] };
      if (!data.answers) data.answers = blankAnswers();
      if (!data.answers[sourceSecId]) data.answers[sourceSecId] = {};
      const existingNotes = data.answers[sourceSecId].notes;
      data.answers[sourceSecId].notes = (existingNotes ? existingNotes + "\n" : "") + stamp + " " + line;
      data.amended = true;
      data.updatedAt = Date.now();
      await putEntry(data);
      queuePush(targetDate);
      window.dispatchEvent(new CustomEvent("tcm:data-changed", { detail: { dates: [targetDate], cycle: false } }));
    } catch (e) { /* best-effort — never blocks today's own save */ }
  }

  function settleExpanded() {
    const next = firstIncompleteId(currentOrder());
    state.expanded = next ? new Set([next]) : new Set();
  }

  // Shows a stored day. keepLayout leaves open sections as they are (used when
  // another device's changes arrive for the day already on screen).
  function applyLoaded(data, { keepLayout = false } = {}) {
    state.answers = withAllSections(data ? clone(data.answers || {}) : null);
    state.done = new Set(data?.done || []);
    state.snapshot = { answers: clone(state.answers), done: Array.from(state.done) };
    // Two-way link: a day inside a recorded period opens with 經期 selected.
    // It is only saved if the day is edited.
    if (!state.answers.meta.cyclePhase && periodCovering(state.periods, state.date)) {
      state.answers.meta.cyclePhase = PERIOD_PHASE;
    }
    if (!keepLayout) settleExpanded();
    state.dirty = false;
    renderApp();
  }

  async function loadDate(dateStr) {
    // Save the day being left first. A pending autosave fires against whatever
    // state.date is when its timer runs, so switching days mid-debounce would
    // otherwise drop the last edits of the previous day.
    flushAutoSave();
    const seq = ++loadSeq;
    state.date = dateStr;
    const local = await getEntry(dateStr).catch(() => null);
    if (seq !== loadSeq) return;
    applyLoaded(local);
    if (local) return;
    // Not on this device: it may exist on GitHub (older than the recent days
    // downloaded at startup).
    const remote = await fetchDay(dateStr);
    if (remote && seq === loadSeq && !state.dirty) applyLoaded(remote);
  }

  let lastSave = Promise.resolve();
  // This screen's own most recent write per day, so a queued save doesn't
  // mistake the previous save for a change from elsewhere.
  const ownWrites = new Map();

  // What to save is captured now, synchronously — by the time a queued save
  // runs, the screen may already show a different day.
  function saveCurrent(extra = {}) {
    const job = {
      date: state.date,
      editSeq: state.editSeq,
      mine: { answers: clone(state.answers), done: Array.from(state.done) },
      snapshot: state.snapshot,
      extra,
    };
    onSaveStatus("saving");
    lastSave = lastSave.catch(() => {}).then(() => saveNow(job));
    return lastSave;
  }

  async function saveNow({ date, editSeq, mine, snapshot, extra }) {
    try {
      const stored = await getEntry(date);
      let next = mine;
      let changedUnderUs = false;
      // If the stored day changed since this screen loaded it (another device,
      // an amendment, a period marked on Home), apply only this screen's own
      // edits on top rather than overwriting.
      const ownWrite = ownWrites.get(date);
      if (stored && snapshot && !sameEntryContent(stored, snapshot) && !(ownWrite && sameEntryContent(stored, ownWrite))) {
        const merged = mergeEntries(snapshot, mine, stored);
        next = { answers: merged.answers, done: merged.done };
        changedUnderUs = true;
      }
      await putEntry({ ...(stored || {}), date, answers: next.answers, done: next.done, updatedAt: Date.now(), ...extra });
      ownWrites.set(date, clone(next));
      if (state.date === date) {
        if (state.editSeq === editSeq) {
          state.snapshot = clone(next);
          state.dirty = false;
          if (changedUnderUs) {
            state.answers = withAllSections(clone(next.answers));
            state.done = new Set(next.done);
            renderApp();
          }
        } else {
          // More edits arrived while saving: they were made on top of `mine`.
          state.snapshot = mine;
        }
      }
      onSaveStatus(state.dirty ? "saving" : "saved");
      queuePush(date);
    } catch (e) {
      // IndexedDB write failed — the one case that must be surfaced loudly,
      // never silently. state.dirty stays true so the pill keeps saying so.
      onSaveStatus("offline");
    }
  }

  let autoSaveTimer = null;
  function scheduleAutoSave() {
    onSaveStatus("saving");
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => { autoSaveTimer = null; saveCurrent(); }, 1200);
  }
  function flushAutoSave() {
    if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
    if (state.dirty) saveCurrent();
  }
  async function flushAutoSaveNow() {
    flushAutoSave();
    await lastSave.catch(() => {});
  }
  // An app left open overnight must not keep logging into yesterday: when it
  // comes back on screen after midnight, today's page follows the new day.
  // A past day opened on purpose stays put.
  let lastSeenToday = todayStr();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { flushAutoSave(); return; }
    const today = todayStr();
    if (today !== lastSeenToday) {
      if (state.date === lastSeenToday) loadDate(today);
      lastSeenToday = today;
    }
  });
  window.addEventListener("pagehide", flushAutoSave);

  $("#laterBtn").addEventListener("click", () => { saveCurrent(); });

  $("#analyzeBtn").addEventListener("click", () => {
    const summary = buildSummary();
    saveCurrent({ completedAt: new Date().toISOString() });
    showSummaryModal(summary);
  });

  function showSummaryModal(text) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `<div class="modal">
      <h2>${T("今日摘要 — 複製後貼到你的中醫回饋對話||Today's summary — copy this into your TCM feedback chat")}</h2>
      <textarea readonly id="summaryText"></textarea>
      <div class="btnrow">
        <button class="btn accent" id="copySummaryBtn">${T("複製||Copy")}</button>
        <button class="btn ghost" id="closeSummaryBtn">${T("關閉||Close")}</button>
      </div>
    </div>`;
    document.body.appendChild(backdrop);
    const ta = backdrop.querySelector("#summaryText");
    ta.value = text;
    const copyLabel = T("複製||Copy"), copiedLabel = T("已複製 ✓||Copied ✓");
    backdrop.querySelector("#copySummaryBtn").addEventListener("click", function () {
      ta.select();
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
      else document.execCommand("copy");
      this.textContent = copiedLabel;
      setTimeout(() => { this.textContent = copyLabel; }, 1800);
    });
    backdrop.querySelector("#closeSummaryBtn").addEventListener("click", () => backdrop.remove());
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });
  }

  window.addEventListener("tcm:lang-change", () => renderApp());

  async function refreshPeriods() {
    state.periods = (await getCycle()).periods || [];
  }

  async function refreshCabinet() {
    state.cabinet = await listItems();
    renderApp();
  }

  // Changes from sync, Home, the calendar or an amendment.
  window.addEventListener("tcm:data-changed", async (e) => {
    const { dates = [], cycle } = e.detail || {};
    if (cycle) {
      await refreshPeriods();
      state.cabinet = await listItems();
      renderApp();
    }
    if (!dates.includes(state.date)) return;
    // Unsaved edits on screen: the next save merges the new version in.
    if (state.dirty || autoSaveTimer) return;
    const stored = await getEntry(state.date).catch(() => null);
    if (state.dirty || autoSaveTimer) return;
    if (!stored || !state.snapshot || !sameEntryContent(stored, state.snapshot)) applyLoaded(stored, { keepLayout: true });
  });

  renderApp();
  Promise.all([refreshPeriods(), listItems().then((items) => { state.cabinet = items; })])
    .then(() => loadDate(state.date));

  return {
    refreshLang: () => renderApp(),
    openDate: (dateStr) => loadDate(dateStr),
  };
}
