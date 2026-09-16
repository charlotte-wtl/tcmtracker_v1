// Calendar days are the user's local days, never UTC. toISOString() gives the
// UTC date, which east of Greenwich is the previous day until morning — a log
// written at 7:30am in UTC+8 was being filed under yesterday, and "yesterday"
// amendments landed two days back.

export function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayStr() {
  return localDateStr(new Date());
}

export function parseDateStr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function shiftDate(dateStr, delta) {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + delta);
  return localDateStr(d);
}
