// History screen: a month calendar over every saved day. A dot marks any day
// with something recorded (complete or not). Tapping a day shows a read-only
// preview; "Edit this day" hands the date to the daily log. Reviewing and
// logging stay separate modes on purpose.

import { T, getLang } from "./i18n.js";
import { SECTION_COLORS } from "./schema.js";

const PERIOD_PHASE = "經期||Period";
import { getAllEntries, getEntry } from "./db.js";
import { todayStr, parseDateStr, localDateStr } from "./dates.js";
import { entryHasData, summarizeEntry } from "./summary.js";

const WEEKDAYS = ["日||S", "一||M", "二||T", "三||W", "四||T", "五||F", "六||S"];

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function monthTitle(year, month) {
  if (getLang() === "zh") return `${year}年${month + 1}月`;
  return new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function longDate(dateStr) {
  const d = parseDateStr(dateStr);
  if (getLang() === "zh") {
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${T(WEEKDAYS[d.getDay()])}`;
  }
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function mountCalendar(root, { onEditDay }) {
  // Recomputed on every refresh so an app left open past midnight moves on.
  let today = todayStr();
  let t = parseDateStr(today);
  const state = {
    year: t.getFullYear(),
    month: t.getMonth(),
    selected: today,
    withData: new Set(),
    periodDays: new Set(),
  };

  root.innerHTML = `
    <div class="cal card">
      <div class="cal-head">
        <button type="button" class="cal-nav" data-step="-1"></button>
        <h1 class="display cal-title" id="calTitle" aria-live="polite"></h1>
        <button type="button" class="cal-nav" data-step="1"></button>
      </div>
      <div class="cal-grid" id="calGrid"></div>
      <div class="cal-foot">
        <span class="cal-legends">
          <span class="cal-legend"><span class="cal-dot"></span><span id="calLegend"></span></span>
          <span class="cal-legend"><span class="cal-swatch"></span><span id="calPeriodLegend"></span></span>
        </span>
        <button type="button" class="btn ghost" id="calTodayBtn"></button>
      </div>
    </div>
    <div id="dayPreview"></div>
  `;

  const $ = (sel) => root.querySelector(sel);

  function isFutureMonth(year, month) {
    return year > t.getFullYear() || (year === t.getFullYear() && month > t.getMonth());
  }

  function renderGrid() {
    const { year, month } = state;
    $("#calTitle").textContent = monthTitle(year, month);
    $("#calLegend").textContent = T("有紀錄可回顧||Has an entry to review");
    $("#calPeriodLegend").textContent = T("經期||Period");
    $("#calTodayBtn").textContent = T("今天||Today");

    const [prevBtn, nextBtn] = root.querySelectorAll(".cal-nav");
    prevBtn.setAttribute("aria-label", T("上個月||Previous month"));
    nextBtn.setAttribute("aria-label", T("下個月||Next month"));
    prevBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 6 8.5 12l6 6"/></svg>`;
    nextBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 6l6 6-6 6"/></svg>`;
    nextBtn.disabled = isFutureMonth(month === 11 ? year + 1 : year, (month + 1) % 12);

    const lead = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let html = WEEKDAYS.map((w) => `<div class="cal-wd" aria-hidden="true">${T(w)}</div>`).join("");
    for (let i = 0; i < lead; i++) html += `<div class="cal-blank"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = localDateStr(new Date(year, month, day));
      const has = state.withData.has(dateStr);
      const period = state.periodDays.has(dateStr);
      const classes = ["cal-day"];
      if (dateStr === today) classes.push("is-today");
      if (dateStr === state.selected) classes.push("is-selected");
      if (has) classes.push("has-entry");
      if (period) classes.push("is-period");
      const label = longDate(dateStr)
        + (period ? "，" + T("經期||period") : "")
        + (has ? "，" + T("有紀錄||has an entry") : "");
      html += `<button type="button" class="${classes.join(" ")}" data-date="${dateStr}"
        aria-label="${esc(label)}" aria-pressed="${dateStr === state.selected}"${dateStr > today ? " disabled" : ""}>
        <span class="cal-num">${day}</span><span class="cal-dot"></span>
      </button>`;
    }
    $("#calGrid").innerHTML = html;
  }

  async function renderPreview() {
    const dateStr = state.selected;
    const entry = await getEntry(dateStr).catch(() => null);
    if (dateStr !== state.selected) return; // a newer tap won the race
    const el = $("#dayPreview");

    if (!entryHasData(entry)) {
      el.innerHTML = `<div class="card day-preview">
        <div class="pv-head">
          <div>
            <h2 class="pv-date display">${esc(longDate(dateStr))}</h2>
            <p class="pv-meta">${T("這一天沒有紀錄||Nothing logged this day")}</p>
          </div>
        </div>
        <div class="btnrow"><button type="button" class="btn" data-edit="${dateStr}">${T("記錄這一天||Log this day")}</button></div>
      </div>`;
      return;
    }

    const s = summarizeEntry(entry);
    const meta = [
      s.mood && `${T("心情||Mood")}：${esc(s.mood)}`,
      s.phase && `${T("週期||Cycle")}：${esc(s.phase)}`,
      `${T("已完成||Done")} ${s.doneCount} / ${s.totalCount}`,
    ].filter(Boolean).join(" · ");

    const sections = s.sections.map((sec) => `
      <section class="pv-sec" style="--sec-tone:var(--tone-${SECTION_COLORS[sec.secId] || "slate"})">
        <h3>${esc(sec.title)}</h3>
        <dl>${sec.lines.map((l) => `<div class="pv-line"><dt>${esc(l.label)}</dt><dd>${esc(l.text)}</dd></div>`).join("")}</dl>
      </section>`).join("");

    el.innerHTML = `<div class="card day-preview">
      <div class="pv-head">
        <div>
          <h2 class="pv-date display">${esc(longDate(dateStr))}</h2>
          <p class="pv-meta">${meta}</p>
        </div>
        <button type="button" class="btn accent" data-edit="${dateStr}">${T("編輯這一天||Edit this day")}</button>
      </div>
      ${sections || `<p class="pv-meta">${T("只記錄了心情或週期狀態。||Only mood or cycle phase was recorded.")}</p>`}
    </div>`;
  }

  async function refresh() {
    today = todayStr();
    t = parseDateStr(today);
    const entries = await getAllEntries().catch(() => []);
    state.withData = new Set(entries.filter(entryHasData).map((e) => e.date));
    // For now a period day is a day whose log says 經期. Imported and one-tap
    // period records (cycle.json) will be added to this set in the cycle step.
    state.periodDays = new Set(entries
      .filter((e) => e.answers && e.answers.meta && e.answers.meta.cyclePhase === PERIOD_PHASE)
      .map((e) => e.date));
    renderGrid();
    renderPreview();
  }

  root.addEventListener("click", (e) => {
    const nav = e.target.closest(".cal-nav");
    if (nav && !nav.disabled) {
      const d = new Date(state.year, state.month + Number(nav.dataset.step), 1);
      state.year = d.getFullYear();
      state.month = d.getMonth();
      renderGrid();
      return;
    }
    const day = e.target.closest(".cal-day");
    if (day && !day.disabled) {
      state.selected = day.dataset.date;
      renderGrid();
      renderPreview();
      return;
    }
    if (e.target.closest("#calTodayBtn")) {
      state.year = t.getFullYear();
      state.month = t.getMonth();
      state.selected = today;
      renderGrid();
      renderPreview();
      return;
    }
    const edit = e.target.closest("[data-edit]");
    if (edit) onEditDay(edit.dataset.edit);
  });

  window.addEventListener("tcm:lang-change", () => { renderGrid(); renderPreview(); });

  refresh();
  return { refresh };
}
