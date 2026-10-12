// Analysis screen: the in-app TCM analysis of a day (summary card + follow-up
// conversation) and cycle insights for one symptom at a time, after Clue's.

import { T } from "./i18n.js";
import { getEntry, getAllEntries } from "./db.js";
import { getCycle, configState, downloadAllDays } from "./sync.js";
import { todayStr } from "./dates.js";
import { esc, fullDate, shortDate, choose } from "./ui.js";
import { renderMarkdown } from "./md.js";
import { send, getApiKey, conversationView, clearAnalysis, AI_ERRORS, MODEL } from "./ai.js";
import { SYMPTOMS, symptomInsights } from "./insights.js";

const LEVELS = ["輕||Mild", "中||Moderate", "重||Severe", "非常重||Very severe"];

export function mountAnalysis(root, { onOpenProfile }) {
  const state = {
    tab: "day",
    date: todayStr(),
    busy: false,
    streamText: "",
    pendingQuestion: "",
    error: "",
    symptom: SYMPTOMS[0].id,
    download: null, // { done, total } while fetching older days
    downloaded: false,
  };

  root.innerHTML = `
    <div class="profile-head"><h1 class="display" id="anTitle"></h1></div>
    <div class="connect-tabs an-tabs" role="tablist" id="anTabs"></div>
    <div id="anBody"></div>`;
  const $ = (sel) => root.querySelector(sel);

  function renderTabs() {
    $("#anTitle").textContent = T("分析||Analysis");
    $("#anTabs").innerHTML = [["day", "當日分析||Daily analysis"], ["insights", "週期洞察||Cycle insights"]]
      .map(([id, label]) => `<button type="button" role="tab" aria-selected="${state.tab === id}" data-tab="${id}">${T(label)}</button>`).join("");
  }

  async function render() {
    renderTabs();
    if (state.tab === "day") await renderDay();
    else await renderInsights();
  }

  /* ---------------- Daily analysis ---------------- */

  function cardHtml(card) {
    if (!card) return "";
    const row = (label, text) => (text ? `<div class="an-card-row"><span class="an-card-label">${T(label)}</span><p>${esc(text)}</p></div>` : "");
    return `<section class="card an-card">
      ${card.safety_flag ? `<div class="an-safety" role="alert"><span aria-hidden="true">⚠</span><div><strong>${T("請留意||Please note")}</strong><p>${esc(card.safety_flag)}</p></div></div>` : ""}
      ${row("主要證型||Main pattern", card.primary_pattern)}
      ${row("今日重點||Today's key signal", card.key_signal)}
      ${row("食療建議||Food suggestion", card.food_suggestion)}
      ${row("明天留意||Watch tomorrow", card.watch_tomorrow)}
    </section>`;
  }

  async function renderDay() {
    const entry = await getEntry(state.date);
    const analysis = entry?.answers?.analysis;
    const turns = conversationView(analysis);
    const hasKey = !!getApiKey();
    const started = turns.length > 0;

    let convo = turns.map((t) => {
      if (t.isContext) {
        return `<details class="an-context"><summary>${T("送出的資料：這一天的日誌、最近7天、週期與藥櫃||What was sent: this day's log, the last 7 days, cycle and cabinet")}</summary><pre>${esc(t.text)}</pre></details>`;
      }
      return t.role === "user"
        ? `<div class="an-msg an-user"><p>${esc(t.text).replace(/\n/g, "<br>")}</p></div>`
        : `<div class="an-msg an-assistant md">${renderMarkdown(t.text)}</div>`;
    }).join("");
    if (state.busy) {
      if (state.pendingQuestion) convo += `<div class="an-msg an-user"><p>${esc(state.pendingQuestion).replace(/\n/g, "<br>")}</p></div>`;
      convo += `<div class="an-msg an-assistant md an-live" aria-live="polite">${state.streamText ? renderMarkdown(state.streamText) : `<p class="an-thinking">${T("分析中…||Analysing…")}</p>`}</div>`;
    }

    const setup = !hasKey ? `<div class="settings-status show">${T(AI_ERRORS["no-key"])}
        <div class="btnrow"><button type="button" class="btn" data-act="profile">${T("前往個人頁||Go to Profile")}</button></div></div>` : "";

    $("#anBody").innerHTML = `
      <div class="an-date-row">
        <label for="anDate">${T("日期||Day")}</label>
        <input type="date" id="anDate" max="${todayStr()}" value="${esc(state.date)}">
      </div>
      ${setup}
      ${cardHtml(analysis?.card)}
      <div class="an-convo">${convo}</div>
      ${state.error ? `<div class="settings-status error show" role="alert">${esc(state.error)}</div>` : ""}
      ${!started && !state.busy ? `
        <div class="card an-start">
          <p class="settings-hint">${T("用你的中醫 skill 分析這一天：會送出這一天的日誌、最近7天的紀錄與分析建議、週期資訊和藥櫃。使用你的 Anthropic API 額度。||Analyses this day with your TCM skill. Sends this day's log, the last 7 days with their advice, your cycle and your cabinet. Uses your Anthropic API credit.")}</p>
          <div class="btnrow"><button type="button" class="btn accent" data-act="start" ${hasKey ? "" : "disabled"}>${T("分析這一天||Analyse this day")}</button></div>
        </div>` : ""}
      ${started ? `
        <form class="an-ask" id="anAsk">
          <label for="anQuestion" class="visually-hidden">${T("追問||Ask a follow-up")}</label>
          <textarea id="anQuestion" rows="2" placeholder="${T("追問，或補充分析問到的資料…||Ask a follow-up, or answer what it asked…")}" ${state.busy ? "disabled" : ""}>${esc(state.pendingDraft || "")}</textarea>
          <div class="btnrow">
            <button type="submit" class="btn accent" ${state.busy || !hasKey ? "disabled" : ""}>${T("送出||Send")}</button>
            <button type="button" class="btn ghost" data-act="restart" ${state.busy ? "disabled" : ""}>${T("重新分析||Start over")}</button>
          </div>
          <p class="settings-hint">${T("模型：||Model: ")}${esc(MODEL)}</p>
        </form>` : ""}`;
  }

  async function run(question) {
    if (state.busy) return;
    state.busy = true;
    state.error = "";
    state.streamText = "";
    state.pendingQuestion = question || "";
    state.pendingDraft = "";
    await render();
    const date = state.date;
    let frame = 0;
    const result = await send(date, question, {
      onText: (text) => {
        state.streamText = text;
        // Repaint at most once a frame; a long reply streams many deltas.
        if (!frame) frame = requestAnimationFrame(() => {
          frame = 0;
          const live = root.querySelector(".an-live");
          if (live && state.tab === "day" && state.date === date) live.innerHTML = renderMarkdown(state.streamText);
        });
      },
    });
    state.busy = false;
    state.streamText = "";
    state.pendingQuestion = "";
    if (!result.ok) {
      state.error = T(AI_ERRORS[result.error] || AI_ERRORS.other) + (result.error === "other" && result.detail ? `：${result.detail}` : "");
      if (question) state.pendingDraft = question;
    } else if (result.truncated) {
      state.error = T(AI_ERRORS["max-tokens"]);
    }
    await render();
  }

  /* ---------------- Cycle insights ---------------- */

  function barChart(ins) {
    const cycles = ins.cycles;
    const W = Math.max(300, Math.min(640, root.clientWidth || 360)), H = 180;
    const padL = 28, padR = 8, padT = 12, padB = 40;
    const max = Math.max(1, ...cycles.map((c) => c.withSymptom), Math.ceil(ins.average || 0));
    const step = max <= 5 ? 1 : max <= 10 ? 2 : 5;
    const top = Math.ceil(max / step) * step;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const band = plotW / cycles.length;
    const bw = Math.min(24, band * 0.6);
    const y = (v) => padT + plotH - (v / top) * plotH;
    let svg = "";
    for (let v = 0; v <= top; v += step) {
      svg += `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" class="viz-grid"/>`;
      svg += `<text x="${padL - 6}" y="${y(v) + 4}" class="viz-tick" text-anchor="end">${v}</text>`;
    }
    const labelEvery = Math.ceil(cycles.length / Math.max(1, Math.floor(plotW / 44)));
    cycles.forEach((c, i) => {
      const cx = padL + band * i + band / 2;
      const h = y(0) - y(c.withSymptom);
      const x = cx - bw / 2;
      if (c.withSymptom > 0) {
        const r = Math.min(4, h, bw / 2);
        svg += `<path class="viz-bar${c.current ? " viz-current" : ""}" d="M${x},${y(0)} V${y(0) - h + r} Q${x},${y(0) - h} ${x + r},${y(0) - h} H${x + bw - r} Q${x + bw},${y(0) - h} ${x + bw},${y(0) - h + r} V${y(0)} Z"/>`;
      }
      if (i % labelEvery === 0) {
        const [, m, d] = c.start.split("-").map(Number);
        svg += `<text x="${cx}" y="${H - padB + 16}" class="viz-tick" text-anchor="middle">${d}/${m}</text>`;
      }
      const tip = `${T("由||Cycle from ")}${shortDate(c.start)}${T("開始的週期||")}${c.current ? T("（進行中）|| (current)") : ""}${T("：||: ")}${c.withSymptom} ${T("天||days")}${T("（記錄了||, logged ")}${c.loggedDays}/${c.length} ${T("天）||days")}`;
      svg += `<rect class="viz-hit" x="${padL + band * i}" y="${padT}" width="${band}" height="${plotH}" data-tip="${esc(tip)}"><title>${esc(tip)}</title></rect>`;
    });
    if (ins.average !== null) {
      svg += `<line x1="${padL}" x2="${W - padR}" y1="${y(ins.average)}" y2="${y(ins.average)}" class="viz-avg"/>`;
      svg += `<text x="${W - padR}" y="${y(ins.average) - 5}" class="viz-tick" text-anchor="end">${T("平均||avg")} ${ins.average.toFixed(1)}</text>`;
    }
    svg += `<text x="${padL + plotW / 2}" y="${H - 6}" class="viz-tick" text-anchor="middle">${T("週期開始日（日/月）||Cycle start (day/month)")}</text>`;
    return `<div class="viz-wrap"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(T("每個週期出現的天數||Days per cycle with this symptom"))}">${svg}</svg><div class="viz-tip" hidden></div></div>`;
  }

  function cycleStrip(c) {
    const cell = 16, H = 46, base = 28;
    const W = c.length * cell + 4;
    let svg = `<rect x="2" y="${base}" width="${W - 4}" height="6" rx="3" class="viz-track"/>`;
    svg += `<rect x="2" y="${base}" width="${Math.min(c.periodDays, c.length) * cell - 2}" height="6" rx="3" class="viz-period"/>`;
    c.days.forEach((d, i) => {
      const cx = 2 + i * cell + cell / 2 - 1;
      if (d.level === null) { /* not logged: nothing drawn */ }
      else if (d.level === 0) svg += `<circle cx="${cx}" cy="${base - 6}" r="1.6" class="viz-none"/>`;
      else if (d.level === -1) svg += `<circle cx="${cx}" cy="${base - 7}" r="4" class="viz-mark"/>`;
      else {
        const h = 4 + d.level * 4.5;
        svg += `<rect x="${cx - 3}" y="${base - 3 - h}" width="6" height="${h}" rx="3" class="viz-mark"/>`;
      }
      if (c.ovulationDay === d.day) svg += `<circle cx="${cx}" cy="${base + 3}" r="5" class="viz-ovu"/>`;
      if (d.day % 2 === 1) svg += `<text x="${cx}" y="${H - 1}" class="viz-tick${d.day <= c.periodDays ? " viz-tick-period" : ""}" text-anchor="middle">${d.day}</text>`;
      const lvl = d.level === null ? T("沒有紀錄||not logged") : d.level === 0 ? T("沒有||none") : d.level === -1 ? T("有（未記錄程度）||yes (no intensity)") : T(LEVELS[d.level - 1]);
      svg += `<rect class="viz-hit" x="${2 + i * cell}" y="0" width="${cell}" height="${H}"><title>${esc(fullDate(d.date))} · ${T("第||day ")}${d.day}${T("天||")} · ${esc(lvl)}</title></rect>`;
    });
    return `<div class="viz-strip"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(shortDate(c.start) + " – " + shortDate(c.end))}">${svg}</svg></div>`;
  }

  function legend() {
    const lv = [1, 2, 3, 4].map((l) => `<span class="viz-key"><svg width="10" height="22" aria-hidden="true"><rect x="2" y="${22 - (4 + l * 4.5)}" width="6" height="${4 + l * 4.5}" rx="3" class="viz-mark"/></svg>${T(LEVELS[l - 1])}</span>`).join("");
    return `<div class="viz-legend">${lv}
      <span class="viz-key"><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4" class="viz-mark"/></svg>${T("有，未記錄程度||Yes, no intensity")}</span>
      <span class="viz-key"><svg width="8" height="8" aria-hidden="true"><circle cx="4" cy="4" r="1.6" class="viz-none"/></svg>${T("有紀錄但沒有||Logged, none")}</span>
      <span class="viz-key"><svg width="18" height="8" aria-hidden="true"><rect x="0" y="1" width="18" height="6" rx="3" class="viz-period"/></svg>${T("經期||Period")}</span>
      <span class="viz-key"><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" class="viz-ovu"/></svg>${T("事後推估排卵日||Estimated ovulation")}</span>
    </div>`;
  }

  async function renderInsights() {
    const [entries, cycle, state2] = await Promise.all([getAllEntries(), getCycle(), configState()]);
    const symptom = SYMPTOMS.find((s) => s.id === state.symptom);
    const ins = symptomInsights(symptom, entries, cycle.periods || [], todayStr());
    const name = T(symptom.label);

    const chips = `<div class="an-chips" role="tablist">${SYMPTOMS.map((s) =>
      `<button type="button" class="opt${s.id === state.symptom ? " on" : ""}" role="tab" aria-selected="${s.id === state.symptom}" data-symptom="${s.id}">${T(s.label)}</button>`).join("")}</div>`;

    const dl = state.download
      ? `<p class="settings-hint">${T("正在下載較早的紀錄||Downloading older days")} ${state.download.done}/${state.download.total}</p>`
      : state2 !== "ready" ? `<p class="settings-hint">${T("尚未連線 GitHub：只用這台裝置上的紀錄。||Not connected to GitHub — using the days on this device only.")}</p>` : "";

    let body;
    if (!ins.cycles.length) {
      body = `<p class="settings-hint">${T("還沒有可分析的週期：需要經期紀錄，以及經期之後有記錄的日子。||No cycle to show yet: this needs a recorded period and logged days after it.")}</p>`;
    } else {
      const avg = ins.average !== null
        ? `${T("平均每個週期有||On average, ")}<strong>${ins.average.toFixed(1)}</strong> ${T("天出現「||days per cycle with ")}${esc(name)}${T("」||")}`
        : T("還沒有完整的週期可算平均。||No finished cycle to average yet.");
      const last = ins.last ? `${T("上個週期：||Last cycle: ")}<strong>${ins.last.withSymptom}</strong> ${T("天||days")}` : "";
      const cur = ins.current ? `${T("這個週期到目前：||This cycle so far: ")}<strong>${ins.current.withSymptom}</strong> ${T("天||days")}` : "";
      const topDays = Object.entries(ins.dayCounts).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 3).map(([d]) => d);
      const when = topDays.length ? `${T("最常出現在週期第||Most often on cycle day ")}${topDays.join(T("、||, "))}${T("天||")}` : "";
      const table = `<details class="viz-table"><summary>${T("以表格檢視||View as a table")}</summary><table>
        <thead><tr><th>${T("週期||Cycle")}</th><th>${T("天數||Days")}</th><th>${T("已記錄||Logged")}</th><th>${T("出現||With symptom")}</th></tr></thead>
        <tbody>${[...ins.cycles].reverse().map((c) => `<tr><td>${esc(shortDate(c.start))} – ${esc(shortDate(c.end))}${c.current ? " *" : ""}</td><td>${c.length}</td><td>${c.loggedDays}</td><td>${c.withSymptom}</td></tr>`).join("")}</tbody>
      </table></details>`;
      body = `
        <section class="card">
          <h2 class="card-title">${esc(name)}${T("統計|| — statistics")}</h2>
          <p class="an-stat">${avg}</p>
          <p class="settings-hint">${[last, cur, when].filter(Boolean).join(" · ")}</p>
          <p class="settings-hint">${T("只計算有記錄的日子。||Only days you logged are counted.")} ${T("共||Based on ")}${ins.cycles.length}${T("個有紀錄的週期。|| cycles with logs.")}</p>
          ${barChart(ins)}
          ${ins.current ? `<p class="settings-hint">${T("淡色長條是進行中的週期，還沒結束。||The paler bar is the cycle still under way.")}</p>` : ""}
          ${table}
        </section>
        <section class="card">
          <h2 class="card-title">${esc(name)}${T("歷史|| — history")}</h2>
          ${legend()}
          <div class="viz-cycles">${[...ins.cycles].reverse().map((c) => `
            <div class="viz-cycle">
              <p class="viz-cycle-title">${esc(shortDate(c.start))} – ${esc(shortDate(c.end))}${c.current ? ` <span class="cab-tag">${T("進行中||current")}</span>` : ""}</p>
              ${cycleStrip(c)}
            </div>`).join("")}</div>
        </section>
        <div class="btnrow an-ask-insight"><button type="button" class="btn" data-act="ask-insight">${T("問問分析：這個規律代表什麼？||Ask the analysis what this pattern means")}</button></div>`;
    }
    $("#anBody").innerHTML = chips + dl + body;
    if (!state.downloaded && state2 === "ready" && !state.download) fetchHistory();
  }

  async function fetchHistory() {
    state.download = { done: 0, total: 0 };
    const result = await downloadAllDays((done, total) => {
      state.download = { done, total };
      const hint = root.querySelector(".an-chips + .settings-hint");
      if (hint) hint.textContent = `${T("正在下載較早的紀錄||Downloading older days")} ${done}/${total}`;
    });
    state.download = null;
    state.downloaded = result.ok;
    if (state.tab === "insights") render();
  }

  function insightQuestion() {
    const symptom = SYMPTOMS.find((s) => s.id === state.symptom);
    const lines = [...root.querySelectorAll(".viz-table tbody tr")].map((tr) => [...tr.children].map((td) => td.textContent).join(" | "));
    return T("請從中醫角度看看我這個規律：||From a TCM view, what do you make of this pattern? ") + T(symptom.label) + "\n"
      + root.querySelector(".an-stat")?.textContent + "\n" + (root.querySelector(".an-stat + .settings-hint")?.textContent || "") + "\n"
      + T("週期｜天數｜已記錄｜出現||Cycle | days | logged | with symptom") + "\n" + lines.join("\n");
  }

  /* ---------------- Events ---------------- */

  root.addEventListener("click", async (e) => {
    const tab = e.target.closest("[data-tab]");
    if (tab) { state.tab = tab.dataset.tab; render(); return; }
    const sym = e.target.closest("[data-symptom]");
    if (sym) { state.symptom = sym.dataset.symptom; render(); return; }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "profile") { onOpenProfile(); return; }
    if (act === "start") { run(""); return; }
    if (act === "restart") {
      const ok = await choose({
        title: T("重新分析這一天？||Start this day's analysis over?"),
        text: T("目前的對話會刪除；已存成「分析建議」的內容會保留。||The conversation is removed; anything saved as Analysis advice stays."),
        actions: [{ label: T("重新分析||Start over"), kind: "accent", value: true }, { label: T("取消||Cancel"), kind: "ghost", value: false }],
      });
      if (ok) { await clearAnalysis(state.date); render(); }
      return;
    }
    if (act === "ask-insight") {
      const q = insightQuestion();
      state.tab = "day";
      state.date = todayStr();
      state.error = "";
      const entry = await getEntry(state.date);
      // The question needs a conversation to go into: start today's first.
      if (!conversationView(entry?.answers?.analysis).length && getApiKey()) await run("");
      state.pendingDraft = q;
      render();
      return;
    }
  });

  // Tap or hover a bar for its numbers.
  root.addEventListener("pointerover", (e) => {
    const hit = e.target.closest(".viz-wrap .viz-hit");
    const tip = root.querySelector(".viz-tip");
    if (!tip) return;
    if (!hit) { tip.hidden = true; return; }
    tip.textContent = hit.dataset.tip;
    tip.hidden = false;
  });

  root.addEventListener("change", (e) => {
    if (e.target.id === "anDate" && e.target.value) { state.date = e.target.value; state.error = ""; render(); }
  });

  root.addEventListener("input", (e) => {
    if (e.target.id === "anQuestion") state.pendingDraft = e.target.value;
  });

  root.addEventListener("submit", (e) => {
    if (e.target.id !== "anAsk") return;
    e.preventDefault();
    const q = root.querySelector("#anQuestion").value.trim();
    if (q) run(q);
  });

  window.addEventListener("tcm:lang-change", () => { if (!state.busy) render(); });
  window.addEventListener("tcm:data-changed", (e) => {
    if (state.busy) return;
    if (state.tab === "insights" || (e.detail?.dates || []).includes(state.date)) render();
  });

  render();

  return {
    refresh: () => { if (!state.busy) render(); },
    // From the daily log: analyse this day now.
    openDay: async (date, { start = false } = {}) => {
      state.tab = "day";
      state.date = date;
      state.error = "";
      await render();
      const entry = await getEntry(date);
      if (start && getApiKey() && !conversationView(entry?.answers?.analysis).length) run("");
    },
  };
}
