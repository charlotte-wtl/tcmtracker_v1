// Small shared UI helpers: escaping and a bottom-sheet dialog.

import { T, getLang } from "./i18n.js";
import { parseDateStr } from "./dates.js";

export function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export function shortDate(dateStr) {
  const d = parseDateStr(dateStr);
  if (getLang() === "zh") return `${d.getMonth() + 1}月${d.getDate()}日`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fullDate(dateStr) {
  const d = parseDateStr(dateStr);
  if (getLang() === "zh") return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Opens a bottom sheet. `build(sheet, close)` fills it and wires events;
// `onDismiss` runs if the user closes it by tapping outside.
export function openSheet(build, onDismiss = () => {}) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true"></div>`;
  const sheet = backdrop.firstElementChild;
  const close = () => backdrop.remove();
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) { close(); onDismiss(); } });
  document.body.appendChild(backdrop);
  build(sheet, close);
  return close;
}

// A question with a few buttons; resolves with the chosen value, or null if dismissed.
export function choose({ title, text = "", actions }) {
  return new Promise((resolve) => {
    openSheet((sheet, close) => {
      sheet.innerHTML = `<h2>${esc(title)}</h2>
        ${text ? `<p class="sheet-text">${esc(text)}</p>` : ""}
        <div class="sheet-actions">${actions.map((a, i) =>
          `<button type="button" class="btn ${a.kind || ""}" data-i="${i}">${esc(a.label)}</button>`).join("")}</div>`;
      sheet.addEventListener("click", (e) => {
        const b = e.target.closest("[data-i]");
        if (!b) return;
        close();
        resolve(actions[Number(b.dataset.i)].value);
      });
    }, () => resolve(null));
  });
}

export const NOT_FOR_CONTRACEPTION = "預測僅供參考，不能用於避孕。||Estimates only — not for contraception.";
export { T };
