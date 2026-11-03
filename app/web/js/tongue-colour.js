// Colour maths for the tongue photo. Pure functions, no DOM, so they can be
// tested on their own.
//
// A phone photo's colours shift with the light, so absolute numbers mean
// little. Two things make the reading usable:
// 1. A white paper in the frame: every colour is scaled so the paper reads
//    as the same neutral white, which cancels most of the light's tint.
// 2. Your own baseline: each reading is compared with the median of your
//    earlier good-condition photos, so the words say "redder than usual",
//    not "red", until there is enough history to know what usual is.

export const BASELINE_MIN = 5;
const BASELINE_MAX = 30;
const WHITE_TARGET = 235;

export function median(nums) {
  const v = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// Median colour of a disc in RGBA pixel data. Medians ignore glints of
// saliva and stray dark pixels better than averages do.
export function sampleDisc(data, width, height, cx, cy, radius) {
  const rs = [], gs = [], bs = [];
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(width - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(height - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const i = (y * width + x) * 4;
      rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]);
    }
  }
  return { r: median(rs), g: median(gs), b: median(bs) };
}

// Per-channel gains that turn the white paper neutral. Clamped so a badly
// placed marker (on skin, on a shadow) can't wreck the reading.
export function whiteGains(white) {
  if (!white) return { r: 1, g: 1, b: 1 };
  const g = (c) => Math.min(2.5, Math.max(0.5, WHITE_TARGET / Math.max(1, c)));
  return { r: g(white.r), g: g(white.g), b: g(white.b) };
}

export function applyGains(rgb, gains) {
  const c = (v) => Math.min(255, v);
  return { r: c(rgb.r * gains.r), g: c(rgb.g * gains.g), b: c(rgb.b * gains.b) };
}

// sRGB (0–255) → CIELAB, D65.
export function rgbToLab({ r, g, b }) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / 1.0;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function hue(lab) { return Math.atan2(lab.b, lab.a) * 180 / Math.PI; }
const round1 = (n) => Math.round(n * 10) / 10;

// regions: { tip, centre, side, white? } each an RGB median.
// Body colour is read where the tongue is least covered by coating: the tip
// and the side. The centre is where coating sits, so it gives the coating's
// lightness and yellowness relative to the body.
export function measure(regions) {
  const gains = whiteGains(regions.white);
  const lab = (k) => rgbToLab(applyGains(regions[k], gains));
  const tip = lab("tip"), side = lab("side"), centre = lab("centre");
  const body = { L: (tip.L + side.L) / 2, a: (tip.a + side.a) / 2, b: (tip.b + side.b) / 2 };
  return {
    bodyL: round1(body.L),
    bodyRed: round1(body.a),
    bodyHue: round1(hue(body)),
    centreHue: round1(hue(centre)),
    coatLift: round1(centre.L - body.L),
    coatYellow: round1(centre.b - body.b),
  };
}

// Which earlier photos count towards "usual": good conditions only, newest
// first, at most BASELINE_MAX.
export function baselineFrom(history) {
  const good = history.filter((h) => h && h.metrics && h.reliable).slice(0, BASELINE_MAX);
  if (good.length < BASELINE_MIN) return { ready: false, count: good.length };
  const keys = Object.keys(good[0].metrics);
  const base = {};
  keys.forEach((k) => { base[k] = round1(median(good.map((h) => h.metrics[k]))); });
  return { ready: true, count: good.length, base };
}

// Differences big enough to see by eye in Lab units (about 3–5), in degrees
// of hue for the purple shift.
const RULES = [
  { key: "bodyRed", up: 4, zhUp: "舌質比平常紅", enUp: "tongue body redder than usual", zhDown: "舌質比平常淡", enDown: "tongue body paler than usual" },
  { key: "bodyL", up: 5, zhUp: "舌色比平常淺", enUp: "tongue lighter than usual", zhDown: "舌色比平常暗", enDown: "tongue darker than usual" },
  { key: "centreHue", up: 6, zhUp: null, enUp: null, zhDown: "舌中比平常偏紫", enDown: "centre more purplish than usual" },
  { key: "bodyHue", up: 6, zhUp: null, enUp: null, zhDown: "舌邊和舌尖比平常偏紫", enDown: "sides and tip more purplish than usual" },
  { key: "coatLift", up: 5, zhUp: "舌苔比平常白、厚", enUp: "coating whiter or thicker than usual", zhDown: "舌苔比平常薄", enDown: "coating thinner than usual" },
  { key: "coatYellow", up: 4, zhUp: "舌苔比平常黃", enUp: "coating more yellow than usual", zhDown: null, enDown: null },
];

// Returns a bilingual "中文||English" sentence.
export function describe(metrics, baseline, { reliable }) {
  const caveat = reliable ? "" : "（拍攝條件不足，只供參考，不計入基準）||(conditions not met: for reference only, not counted in your baseline)";
  const withCaveat = (zh, en) => {
    if (!caveat) return `${zh}||${en}`;
    const [cz, ce] = caveat.split("||");
    return `${zh}${cz}||${en} ${ce}`;
  };
  if (!baseline.ready) {
    const n = baseline.count + (reliable ? 1 : 0);
    return withCaveat(
      `建立基準中（${Math.min(n, BASELINE_MIN)}/${BASELINE_MIN}張合格照片），暫時未有比較`,
      `Building your baseline (${Math.min(n, BASELINE_MIN)}/${BASELINE_MIN} good photos); no comparison yet`);
  }
  const zh = [], en = [];
  RULES.forEach((r) => {
    const d = metrics[r.key] - baseline.base[r.key];
    if (d >= r.up && r.zhUp) { zh.push(r.zhUp); en.push(r.enUp); }
    if (d <= -r.up && r.zhDown) { zh.push(r.zhDown); en.push(r.enDown); }
  });
  if (!zh.length) return withCaveat("跟你平常差不多", "about the same as your usual");
  return withCaveat(zh.join("，"), en.join(", "));
}
