// Home: where you are in your cycle, what comes next, and a one-tap button to
// mark a period starting or ending.

import { T } from "./i18n.js";
import { getCycle } from "./sync.js";
import { cycleStatus } from "./cycle.js";
import { startPeriod, endPeriod } from "./cycle-store.js";
import { todayStr } from "./dates.js";
import { esc, shortDate, NOT_FOR_CONTRACEPTION } from "./ui.js";

function inDays(n) {
  if (n === 0) return T("今天||today");
  if (n === 1) return T("明天||tomorrow");
  return T("還有||in ") + " " + n + " " + T("天||days");
}

export function mountHome(root, { onOpenProfile }) {
  let periods = [];

  function render() {
    const today = todayStr();
    const s = cycleStatus(periods, today);
    let body;

    if (!s.hasData) {
      body = `
        <p class="home-kicker">${T("週期||Cycle")}</p>
        <h1 class="home-big display">${T("尚未記錄經期||No period recorded yet")}</h1>
        <p class="home-sub">${T("經期來時按下方按鈕；也可以在「個人」頁新增過去的經期或從 Apple 健康匯入。||Tap the button when your period starts, or add past periods or import from Apple Health in Profile.")}</p>`;
    } else {
      let next = "";
      if (s.inPeriod) {
        next = `<p class="home-next">${T("經期中||On your period")} · ${
          s.periodEndIsEstimate
            ? T("預計||expected to end ") + " " + esc(shortDate(s.periodEnd)) + " " + T("結束||")
            : T("已記錄結束於||ended ") + " " + esc(shortDate(s.periodEnd))}</p>`;
      } else if (s.nextPeriod) {
        const ovuFirst = s.ovulation && s.daysUntilOvulation >= 0 && s.daysUntilOvulation < s.daysUntilPeriod;
        if (ovuFirst) {
          next = `<p class="home-next">${T("排卵日預估||Estimated ovulation")} ${esc(shortDate(s.ovulation.expected))}（${inDays(s.daysUntilOvulation)}）</p>
            <p class="home-sub">${T("易孕期||Fertile window")} ${esc(shortDate(s.ovulation.fertileFrom))} – ${esc(shortDate(s.ovulation.fertileTo))}</p>`;
        } else if (s.late) {
          next = `<p class="home-next">${T("經期比預估晚了||Period is ")} ${-s.daysUntilPeriod} ${T("天||days later than expected")}</p>
            <p class="home-sub">${T("預估範圍||Expected range")} ${esc(shortDate(s.nextPeriod.from))} – ${esc(shortDate(s.nextPeriod.to))}</p>`;
        } else {
          next = `<p class="home-next">${T("下次經期預估||Next period around")} ${esc(shortDate(s.nextPeriod.expected))}（${inDays(Math.max(0, s.daysUntilPeriod))}）</p>
            <p class="home-sub">${T("可能在||Likely between")} ${esc(shortDate(s.nextPeriod.from))} – ${esc(shortDate(s.nextPeriod.to))}</p>`;
        }
      } else {
        next = `<p class="home-sub">${T("再記錄一次經期開始，就能開始預測下次經期。||Record one more period start to begin predicting the next one.")}</p>`;
      }

      const st = s.stats;
      const irregularNote = st.count >= 2 && !st.regular
        ? `<p class="home-note">${T("你的週期長度差異較大（||Your cycles vary quite a lot (")}${st.shortest}–${st.longest} ${T("天），所以不預測排卵日；經期來後，日曆會標出事後推估的排卵日。||days), so ovulation isn't forecast. Once a period arrives, the calendar marks an after-the-fact estimate.")}</p>`
        : "";
      const statsLine = st.count
        ? `<p class="home-stats">${T("平均週期||Average cycle")} ${st.average} ${T("天||days")} · ${T("近||last")} ${st.count} ${T("次||cycles")} ${st.shortest}–${st.longest} ${T("天||days")}</p>`
        : "";

      body = `
        <p class="home-kicker">${T("週期||Cycle")}</p>
        <h1 class="home-big display">${T("第||Day ")} ${s.cycleDay} ${T("天||")}</h1>
        ${next}
        ${statsLine}
        ${irregularNote}`;
    }

    const inPeriod = s.hasData && s.inPeriod;
    root.innerHTML = `
      <div class="card home-card">
        ${body}
        <div class="btnrow home-actions">
          ${inPeriod
            ? `<button type="button" class="btn" data-act="end">${T("經期今天結束||Period ended today")}</button>`
            : `<button type="button" class="btn accent" data-act="start">${T("經期今天開始||Period started today")}</button>`}
          <button type="button" class="btn ghost" data-act="other">${T("其他日期||Another day")}</button>
        </div>
        <form class="home-other" hidden>
          <label for="homeOtherDate">${inPeriod ? T("經期結束日||Day it ended") : T("經期開始日||Day it started")}</label>
          <div class="sheet-date-row">
            <input type="date" id="homeOtherDate" max="${today}" required>
            <button type="submit" class="btn">${T("儲存||Save")}</button>
          </div>
        </form>
        <p class="home-foot">${T(NOT_FOR_CONTRACEPTION)}</p>
      </div>
      <button type="button" class="btn ghost home-link" data-act="profile">${T("新增過去的經期或從 Apple 健康匯入 →||Add past periods or import from Apple Health →")}</button>`;
    root.dataset.inPeriod = inPeriod ? "1" : "";
  }

  async function refresh() {
    periods = (await getCycle()).periods || [];
    render();
  }

  root.addEventListener("click", async (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    if (act === "profile") { onOpenProfile(); return; }
    if (act === "other") { root.querySelector(".home-other").hidden = false; root.querySelector("#homeOtherDate").focus(); return; }
    if (act === "start") await startPeriod(todayStr());
    if (act === "end") await endPeriod(todayStr());
  });

  root.addEventListener("submit", async (e) => {
    e.preventDefault();
    const date = root.querySelector("#homeOtherDate").value;
    if (!date) return;
    if (root.dataset.inPeriod) await endPeriod(date);
    else await startPeriod(date);
  });

  window.addEventListener("tcm:data-changed", (e) => { if (e.detail?.cycle) refresh(); });
  window.addEventListener("tcm:lang-change", render);
  refresh();
  return { refresh };
}
