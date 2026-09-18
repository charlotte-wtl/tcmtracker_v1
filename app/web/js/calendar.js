// History screen: a month calendar over every saved day. A dot marks any day
// with something recorded (complete or not). Tapping a day shows a read-only
// preview; "Edit this day" hands the date to the daily log. Reviewing and
// logging stay separate modes on purpose.

import { T, getLang } from "./i18n.js";
import { SECTION_COLORS } from "./schema.js";
import { getAllEntries, getEntry } from "./db.js";
import { todayStr, parseDateStr, localDateStr } from "./dates.js";
import { entryHasData, summarizeEntry } from "./summary.js";
import { getCycle, getRemoteDates, fetchDay } from "./sync.js";
import { calendarCycleDays, periodCovering, activePeriods, daysBetween } from "./cycle.js";
import { PERIOD_PHASE } from "./cycle-store.js";

const EGG_WHITE = "蛋清狀透明拉絲||Egg-white";

function hasEggWhite(entry) {
  const a = entry?.answers || {};
  return [a.regularday?.discharge, a.preperiod?.discharge].some((v) => Array.isArray(v) && v.includes(EGG_WHITE));
}

function loggedSpotting(entry) {
  const a = entry?.answers || {};
  return [a.regularday?.spotting, a.preperiod?.spotting].includes("有||Yes");
}
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
    remoteDates: new Set(),
    periodDays: new Set(),
    estimatedPeriodDays: new Set(),
    predictedDays: new Set(),
    ovulationDays: new Set(),
    eggWhiteDays: new Set(),
    spottingDays: new Set(),
    periods: [],
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
        <span class="cal-legends" id="calLegends"></span>
        <button type="button" class="btn ghost" id="calTodayBtn"></button>
      </div>
    </div>
    <div id="dayPreview"></div>
  `;

  const $ = (sel) => root.querySelector(sel);

  // Future months are browsable (to see a predicted period) up to 3 ahead;
  // future days themselves can't be opened.
  const MONTHS_AHEAD = 3;
  function isFutureMonth(year, month) {
    return (year - t.getFullYear()) * 12 + (month - t.getMonth()) > MONTHS_AHEAD;
  }

  function renderGrid() {
    const { year, month } = state;
    $("#calTitle").textContent = monthTitle(year, month);
    $("#calLegends").innerHTML = [
      ["cal-dot", "有紀錄可回顧||Has an entry"],
      ["cal-swatch", "經期||Period"],
      ["cal-swatch is-predicted", "預測經期||Predicted period"],
      ["cal-mark ovu", "排卵日（事後推估）||Ovulation (estimated after)"],
      ["cal-mark egg", "蛋清狀分泌物||Egg-white discharge"],
      ["cal-mark spot", "點滴出血||Spotting"],
    ].map(([cls, label]) => `<span class="cal-legend"><span class="${cls}"></span><span>${T(label)}</span></span>`).join("");
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
      const has = state.withData.has(dateStr) || state.remoteDates.has(dateStr);
      const period = state.periodDays.has(dateStr);
      const estimated = state.estimatedPeriodDays.has(dateStr);
      const predicted = state.predictedDays.has(dateStr);
      const marks = [
        state.ovulationDays.has(dateStr) && "ovu",
        state.eggWhiteDays.has(dateStr) && "egg",
        state.spottingDays.has(dateStr) && "spot",
      ].filter(Boolean);
      const classes = ["cal-day"];
      if (dateStr === today) classes.push("is-today");
      if (dateStr === state.selected) classes.push("is-selected");
      if (has) classes.push("has-entry");
      if (period) classes.push("is-period");
      if (estimated) classes.push("is-period-estimate");
      if (predicted) classes.push("is-predicted");
      const label = longDate(dateStr)
        + (period ? "，" + T("經期||period") : "")
        + (estimated ? "，" + T("預計經期||expected period") : "")
        + (predicted ? "，" + T("預測經期||predicted period") : "")
        + (marks.includes("ovu") ? "，" + T("事後推估排卵日||estimated ovulation") : "")
        + (marks.includes("egg") ? "，" + T("蛋清狀分泌物||egg-white discharge") : "")
        + (marks.includes("spot") ? "，" + T("點滴出血||spotting") : "")
        + (has ? "，" + T("有紀錄||has an entry") : "");
      html += `<button type="button" class="${classes.join(" ")}" data-date="${dateStr}"
        aria-label="${esc(label)}" aria-pressed="${dateStr === state.selected}"${dateStr > today ? " disabled" : ""}>
        <span class="cal-num">${day}</span>
        <span class="cal-marks"><span class="cal-dot"></span>${marks.map((m) => `<span class="cal-mark ${m}"></span>`).join("")}</span>
      </button>`;
    }
    $("#calGrid").innerHTML = html;
  }

  function cycleNote(dateStr) {
    const notes = [];
    const covering = periodCovering(state.periods, dateStr);
    if (covering && dateStr <= today) notes.push(T("經期第||Period day ") + " " + (daysBetween(covering.start, dateStr) + 1) + " " + T("天||"));
    else if (state.estimatedPeriodDays.has(dateStr)) notes.push(T("預計經期||Expected period day"));
    if (state.predictedDays.has(dateStr)) notes.push(T("可能是下次經期||Possible next period"));
    if (state.ovulationDays.has(dateStr)) notes.push(T("排卵日（依下次經期事後推估）||Ovulation, estimated after the next period"));
    if (state.eggWhiteDays.has(dateStr)) notes.push(T("觀察到蛋清狀分泌物||Egg-white discharge observed"));
    if (state.spottingDays.has(dateStr)) notes.push(T("點滴出血||Spotting"));
    return notes.map((n) => n.replace(/\s+/g, " ").trim());
  }

  async function renderPreview() {
    const dateStr = state.selected;
    const el = $("#dayPreview");
    let entry = await getEntry(dateStr).catch(() => null);
    if (dateStr !== state.selected) return; // a newer tap won the race
    if (!entry && state.remoteDates.has(dateStr)) {
      el.innerHTML = `<div class="card day-preview"><h2 class="pv-date display">${esc(longDate(dateStr))}</h2>
        <p class="pv-meta">${T("正在從 GitHub 載入…||Loading from GitHub…")}</p></div>`;
      entry = await fetchDay(dateStr);
      if (dateStr !== state.selected) return;
    }
    const notes = cycleNote(dateStr);
    const notesHtml = notes.length ? `<p class="pv-cycle">${notes.map(esc).join(" · ")}</p>` : "";

    if (!entryHasData(entry)) {
      el.innerHTML = `<div class="card day-preview">
        <div class="pv-head">
          <div>
            <h2 class="pv-date display">${esc(longDate(dateStr))}</h2>
            ${notesHtml}
            <p class="pv-meta">${state.remoteDates.has(dateStr)
              ? T("無法載入這一天（離線或未連線 GitHub）||Couldn't load this day (offline or not connected)")
              : T("這一天沒有紀錄||Nothing logged this day")}</p>
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
          ${notesHtml}
          <p class="pv-meta">${meta}</p>
        </div>
        <button type="button" class="btn accent" data-edit="${dateStr}">${T("編輯這一天||Edit this day")}</button>
      </div>
      ${sections || (s.advice ? "" : `<p class="pv-meta">${T("只記錄了心情或週期狀態。||Only mood or cycle phase was recorded.")}</p>`)}
      ${s.advice ? `<section class="pv-sec pv-advice">
        <h3>${T("分析建議||Analysis advice")}</h3>
        <p class="pv-advice-text">${esc(s.advice)}</p>
      </section>` : ""}
    </div>`;
  }

  async function refresh() {
    today = todayStr();
    t = parseDateStr(today);
    const [entries, cycle, remoteDates] = await Promise.all([
      getAllEntries().catch(() => []), getCycle(), getRemoteDates().catch(() => new Set()),
    ]);
    state.withData = new Set(entries.filter(entryHasData).map((e) => e.date));
    state.remoteDates = remoteDates;
    state.periods = activePeriods(cycle.periods);
    const days = calendarCycleDays(state.periods, today);
    // A period day is a recorded period (cycle.json) or a day logged as 經期.
    state.periodDays = days.periodDays;
    entries.forEach((e) => { if (e.answers?.meta?.cyclePhase === PERIOD_PHASE) state.periodDays.add(e.date); });
    state.estimatedPeriodDays = new Set([...days.estimatedPeriodDays].filter((d) => !state.periodDays.has(d)));
    state.predictedDays = days.predictedDays;
    state.ovulationDays = days.ovulationEstimates;
    state.eggWhiteDays = new Set(entries.filter(hasEggWhite).map((e) => e.date));
    state.spottingDays = new Set([...(cycle.spotting || []), ...entries.filter(loggedSpotting).map((e) => e.date)]);
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
  window.addEventListener("tcm:data-changed", () => { if (!root.hidden) refresh(); });

  refresh();
  return { refresh };
}
