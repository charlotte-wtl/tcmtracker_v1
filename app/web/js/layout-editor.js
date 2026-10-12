// The reorder sheet: sections, then a section's questions, then a question's
// options, each moved with ↑ ↓. Every move is saved straight away.

import { T } from "./i18n.js";
import { SCHEMA, CONDITIONAL } from "./schema.js";
import { openSheet, esc } from "./ui.js";
import {
  ORDERABLE_SECTIONS, applyOrder, getLayout, saveLayout, orderedFields, orderedOptions, optionKey,
} from "./layout.js";

const CHOICE_TYPES = ["single", "multi", "yesno"];

// Moves item `index` of `visible` one step, keeping hidden items (retired
// questions) where they are in the full list.
function moveWithin(full, visible, index, dir) {
  const target = index + dir;
  if (target < 0 || target >= visible.length) return null;
  const nextVisible = [...visible];
  [nextVisible[index], nextVisible[target]] = [nextVisible[target], nextVisible[index]];
  const slots = full.map((x) => visible.includes(x));
  let k = 0;
  return full.map((x, i) => (slots[i] ? nextVisible[k++] : x));
}

export function openLayoutEditor() {
  let level = { kind: "sections" };

  openSheet((sheet, close) => {
    function rows(items, { label, hint, canOpen }) {
      return `<ol class="reorder-list">${items.map((id, i) => `
        <li>
          <span class="reorder-label">${label(id)}${hint && hint(id) ? `<span class="reorder-hint">${hint(id)}</span>` : ""}</span>
          <span class="reorder-actions">
            <button type="button" class="btn ghost" data-move="-1" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="${T("上移||Move up")}">↑</button>
            <button type="button" class="btn ghost" data-move="1" data-i="${i}" ${i === items.length - 1 ? "disabled" : ""} aria-label="${T("下移||Move down")}">↓</button>
            ${canOpen && canOpen(id) ? `<button type="button" class="btn ghost" data-open="${esc(id)}" aria-label="${T("調整內容順序||Reorder inside")}">›</button>` : ""}
          </span>
        </li>`).join("")}</ol>`;
    }

    function current() {
      const layout = getLayout();
      if (level.kind === "sections") {
        const items = applyOrder(ORDERABLE_SECTIONS, layout.sections);
        return { items, full: items };
      }
      if (level.kind === "fields") {
        const full = orderedFields(level.secId).map((f) => f.id);
        const items = orderedFields(level.secId).filter((f) => !f.retired).map((f) => f.id);
        return { items, full };
      }
      const field = SCHEMA[level.secId].fields.find((f) => f.id === level.fieldId);
      const items = orderedOptions(level.secId, field);
      return { items, full: items };
    }

    function render() {
      const { items } = current();
      let title, body, back = "";
      if (level.kind === "sections") {
        title = T("調整日誌順序||Reorder the log");
        body = `<p class="sheet-text">${T("排列段落；點 › 調整段落裡的問題。順序會同步到你的其他裝置。||Order the sections; tap › to order the questions inside. Your order syncs to your other devices.")}</p>` +
          rows(items, {
            label: (id) => esc(T(SCHEMA[id].title)),
            hint: (id) => (CONDITIONAL.includes(id) ? T("依週期狀態出現||Shown by cycle phase") : ""),
            canOpen: () => true,
          });
      } else if (level.kind === "fields") {
        title = T(SCHEMA[level.secId].title);
        back = `<button type="button" class="btn ghost" data-back="1">← ${T("段落||Sections")}</button>`;
        body = rows(items, {
          label: (id) => esc(T(SCHEMA[level.secId].fields.find((f) => f.id === id).label)),
          canOpen: (id) => CHOICE_TYPES.includes(SCHEMA[level.secId].fields.find((f) => f.id === id).type),
        });
      } else {
        const field = SCHEMA[level.secId].fields.find((f) => f.id === level.fieldId);
        title = T(field.label);
        back = `<button type="button" class="btn ghost" data-back="1">← ${esc(T(SCHEMA[level.secId].title))}</button>`;
        body = rows(items, { label: (opt) => esc(T(opt)) });
      }
      sheet.innerHTML = `${back}<h2>${esc(title)}</h2>${body}
        <div class="btnrow">
          <button type="button" class="btn accent" data-done="1">${T("完成||Done")}</button>
          <button type="button" class="btn ghost" data-reset="1">${T("這一層恢復預設||Reset this list")}</button>
        </div>`;
    }

    async function move(index, dir) {
      const layout = getLayout();
      const { items, full } = current();
      const next = moveWithin(full, items, index, dir);
      if (!next) return;
      if (level.kind === "sections") await saveLayout({ ...layout, sections: next });
      else if (level.kind === "fields") await saveLayout({ ...layout, fields: { ...layout.fields, [level.secId]: next } });
      else await saveLayout({ ...layout, options: { ...layout.options, [optionKey(level.secId, level.fieldId)]: next } });
      render();
    }

    async function reset() {
      const layout = getLayout();
      if (level.kind === "sections") await saveLayout({ ...layout, sections: [] });
      else if (level.kind === "fields") {
        const fields = { ...layout.fields };
        delete fields[level.secId];
        await saveLayout({ ...layout, fields });
      } else {
        const options = { ...layout.options };
        delete options[optionKey(level.secId, level.fieldId)];
        await saveLayout({ ...layout, options });
      }
      render();
    }

    sheet.addEventListener("click", (e) => {
      const mv = e.target.closest("[data-move]");
      if (mv) { move(Number(mv.dataset.i), Number(mv.dataset.move)); return; }
      const open = e.target.closest("[data-open]");
      if (open) {
        level = level.kind === "sections"
          ? { kind: "fields", secId: open.dataset.open }
          : { kind: "options", secId: level.secId, fieldId: open.dataset.open };
        render();
        sheet.scrollTop = 0;
        return;
      }
      if (e.target.closest("[data-back]")) {
        level = level.kind === "options" ? { kind: "fields", secId: level.secId } : { kind: "sections" };
        render();
        return;
      }
      if (e.target.closest("[data-reset]")) { reset(); return; }
      if (e.target.closest("[data-done]")) close();
    });

    render();
  });
}
