// Bilingual helper shared across the whole app. Every user-facing string is
// authored as "中文||English"; T() picks the active half at render time.

const LANG_KEY = "tcm_lang";

export function getLang() {
  return localStorage.getItem(LANG_KEY) || "zh";
}

export function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
  window.dispatchEvent(new CustomEvent("tcm:lang-change", { detail: { lang } }));
}

export function T(pair) {
  if (pair === undefined || pair === null) return "";
  const parts = String(pair).split("||");
  return getLang() === "zh" ? (parts[0] || "") : (parts[1] !== undefined ? parts[1] : parts[0]);
}
