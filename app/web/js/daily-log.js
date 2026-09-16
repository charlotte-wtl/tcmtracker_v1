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
import { syncEntry, isConfigured } from "./sync.js";
import { todayStr, shiftDate, parseDateStr } from "./dates.js";
import { sectionOrder, getActiveDetails, sectionLines } from "./summary.js";

const TONE_VARS = {
  mauve: "var(--tone-mauve)", ochre: "var(--tone-ochre)", clay: "var(--tone-clay)",
  slate: "var(--tone-slate)", moss: "var(--tone-moss)", "stone-blue": "var(--tone-stone-blue)",
  rose: "var(--tone-rose)",
};

function blankAnswers() {
  const a = { meta: {} };
  Object.keys(SCHEMA).forEach((secId) => { a[secId] = {}; });
  return a;
}

// Entries saved before a section existed (e.g. the regular-day section) lack
// its key; fill the gaps so rendering never meets an undefined section.
function withAllSections(answers) {
  const a = answers || {};
  if (!a.meta) a.meta = {};
  Object.keys(SCHEMA).forEach((secId) => { if (!a[secId]) a[secId] = {}; });
  return a;
}

export function mountDailyLog(root, { onSaveStatus, onSyncStatus }) {
  const state = {
    date: todayStr(),
    answers: blankAnswers(),
    done: new Set(),
    expanded: new Set([ALWAYS_ON[0]]),
    enteredIds: new Set([ALWAYS_ON[0]]),
    dirty: false,
  };

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
  function firstIncompleteId(order) { return order.find((id) => !state.done.has(id)); }

  function fieldValue(secId, fieldId) { return state.answers[secId][fieldId]; }
  function setFieldValue(secId, fieldId, value) { state.answers[secId][fieldId] = value; state.dirty = true; }
  function detailValue(secId, fieldId, detailId) { return state.answers[secId][fieldId + "__" + detailId]; }
  function setDetailValue(secId, fieldId, detailId, value) { state.answers[secId][fieldId + "__" + detailId] = value; state.dirty = true; }

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
      : `<input type="text" data-sec="${secId}" data-field="${field.id}" data-type="text" value="${escAttr(value || "")}">`;
    else if (field.type === "number") control = `<input type="number" data-sec="${secId}" data-field="${field.id}" data-type="number" value="${escAttr(value || "")}">`;
    if (field.type === "multi" && field.perItemSeverity) control += renderPerItemSeverity(secId, field, value);
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

  function renderCycleField() {
    const value = state.answers.meta.cyclePhase;
    const html = `<div class="mood-card cycle-field"><label class="q" style="display:block;margin-bottom:8px;">${T(CYCLE_FIELD.label)}</label>` +
      `<div class="opts">` + CYCLE_FIELD.options.map((opt) => {
        const on = value === opt;
        return `<button type="button" class="opt${on ? " on" : ""}" data-cycle="1" data-value="${escAttr(opt)}">${T(opt)}</button>`;
      }).join("") + `</div></div>`;
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
    const doneCount = order.filter((id) => state.done.has(id)).length;
    $("#progressText").textContent = `${T("已完成的段落||Sections done")} ${doneCount} / ${order.length}`;

    onSaveStatus(state.dirty ? "saving" : "saved");
  }

  /* ---------------- Events ---------------- */

  $("#cycleField").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-cycle]");
    if (!btn) return;
    const cur = state.answers.meta.cyclePhase;
    state.answers.meta.cyclePhase = cur === btn.dataset.value ? "" : btn.dataset.value;
    state.dirty = true;
    renderApp();
    scheduleAutoSave();
  });

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
    state.dirty = true;
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
      state.dirty = true;
      if (id === "general" || id === "diet") amendPreviousDay(id);
      const next = firstIncompleteId(currentOrder());
      if (next) { state.expanded.add(next); state.enteredIds.add(next); }
      renderApp();
      if (next) scrollToSection(next);
      saveCurrent();
      return;
    }
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
    state.dirty = true;
    renderApp();
    scheduleAutoSave();
  });

  /* ---------------- Summary ---------------- */

  function buildSummary() {
    const order = currentOrder();
    let out = `【${T("每日中醫日記||Daily TCM Log")}】${formatTicketDate(state.date)}\n`;
    out += T("整體感覺||Overall mood") + "：" + (state.answers.meta.moodRating ? T(MOOD_WORDS[state.answers.meta.moodRating - 1]) : "") + "\n\n";
    order.forEach((secId) => {
      const lines = sectionLines(secId, state.answers[secId]);
      if (lines.length) {
        out += T(SCHEMA[secId].title) + "\n" + lines.map((l) => l.label + "：" + l.text).join("\n") + "\n\n";
      }
    });
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
      backgroundSync(data);
    } catch (e) { /* best-effort — never blocks today's own save */ }
  }

  function settleExpanded() {
    const next = firstIncompleteId(currentOrder());
    state.expanded = next ? new Set([next]) : new Set();
  }

  async function loadDate(dateStr) {
    // Save the day being left first. A pending autosave fires against whatever
    // state.date is when its timer runs, so switching days mid-debounce would
    // otherwise drop the last edits of the previous day.
    flushAutoSave();
    state.date = dateStr;
    state.done = new Set();
    try {
      const data = await getEntry(dateStr);
      if (data) {
        state.answers = withAllSections(data.answers);
        state.done = new Set(data.done || []);
      } else {
        state.answers = blankAnswers();
      }
    } catch (e) {
      state.answers = blankAnswers();
    }
    settleExpanded();
    state.dirty = false;
    renderApp();
  }

  async function backgroundSync(entry) {
    const configured = await isConfigured();
    if (!configured) { onSyncStatus("not-configured"); return; }
    syncEntry(entry, onSyncStatus);
  }

  async function saveCurrent(extra) {
    onSaveStatus("saving");
    const payload = Object.assign({
      date: state.date,
      answers: state.answers,
      done: Array.from(state.done),
      updatedAt: Date.now(),
    }, extra || {});
    try {
      await putEntry(payload);
      state.dirty = false;
      onSaveStatus("saved");
      backgroundSync(payload);
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

  renderApp();
  loadDate(state.date);

  return {
    refreshLang: () => renderApp(),
    openDate: (dateStr) => loadDate(dateStr),
  };
}
