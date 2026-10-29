// Tongue photo: a guided capture (outline + checklist) and an on-device
// colour reading. Nothing leaves the phone except to your own private data
// repo; no paid service is involved.
//
// Flow: checklist → camera with an outline to line the tongue up with (or the
// phone's own camera / a saved photo) → place four markers (tip, centre,
// side, white paper) → measure → save.

import { T } from "./i18n.js";
import { esc } from "./ui.js";
import { getAllEntries, getPhoto, putPhoto, deletePhoto, photoKey } from "./db.js";
import { queuePhotoPush, photoPath } from "./sync.js";
import { sampleDisc, measure, baselineFrom, describe } from "./tongue-colour.js";

const MAX_SIDE = 1200;

// Where the outline asks you to put things, as fractions of the frame
// (portrait 3:4). The markers start here and can be moved.
const MARKERS = [
  { id: "tip", label: "舌尖||Tip", x: 0.5, y: 0.74 },
  { id: "centre", label: "舌中||Centre", x: 0.5, y: 0.58 },
  { id: "side", label: "舌邊||Side", x: 0.37, y: 0.6 },
  { id: "white", label: "白紙||White paper", x: 0.83, y: 0.86 },
];

const CHECKS = [
  { id: "fasting", label: "起床後未刷牙、未飲食||On waking, before brushing, eating or drinking" },
  { id: "nostain", label: "昨晚至今早沒有吃會染色的食物||No staining food since last night" },
  { id: "daylight", label: "自然光，靠近窗邊，不開燈||Daylight near a window, room lights off" },
  { id: "white", label: "一張白紙放在下巴旁邊入鏡||A white paper beside your chin, in the frame" },
  { id: "relaxed", label: "舌頭放鬆自然伸出，10秒內拍好||Tongue out and relaxed, photo taken within 10 seconds" },
];

/* ---------------- Field on the daily log ---------------- */

const urls = new Map(); // photo key → object URL, reused across re-renders

export function renderPhotoField(secId, field, value, date) {
  const has = value && value.takenAt;
  const key = photoKey(date);
  const words = has && value.words ? `<p class="tphoto-words">${esc(T(value.words))}</p>` : "";
  const note = has && !value.reliable
    ? `<p class="settings-hint">${T("這張照片的拍攝條件不齊全，不會計入你的基準。||This photo didn't meet all the conditions, so it isn't counted in your baseline.")}</p>` : "";
  return `<div class="tphoto">
    ${has ? `<img class="tphoto-thumb" alt="${T("舌照||Tongue photo")}" data-photo-key="${key}">` : ""}
    <p class="settings-hint">${T("照片只存在你的手機和你的私人資料庫。顏色讀數是跟你自己以往的照片比較，用來輔助你自己判斷，不是診斷。||The photo stays on your phone and your private data repo. The colour reading compares this photo with your own earlier ones; it helps your own reading and is not a diagnosis.")}</p>
    ${words}${note}
    <div class="opts">
      <button type="button" class="opt" data-photo-act="take" data-sec="${secId}" data-field="${field.id}">${has ? T("重拍||Retake") : T("拍舌照||Take a tongue photo")}</button>
      ${has ? `<button type="button" class="opt ghost" data-photo-act="delete" data-sec="${secId}" data-field="${field.id}">${T("刪除照片||Delete photo")}</button>` : ""}
    </div>
  </div>`;
}

// Fills in thumbnails after a render. A photo taken on another device isn't
// downloaded; the reading still shows.
export async function hydratePhotos(root) {
  const imgs = root.querySelectorAll("img[data-photo-key]");
  for (const img of imgs) {
    const key = img.dataset.photoKey;
    let url = urls.get(key);
    if (!url) {
      const rec = await getPhoto(key).catch(() => null);
      if (!rec) { img.replaceWith(Object.assign(document.createElement("p"), { className: "settings-hint", textContent: T("照片在另一部裝置拍攝，這裡只顯示讀數。||Taken on another device; only the reading shows here.") })); continue; }
      url = URL.createObjectURL(rec.blob);
      urls.set(key, url);
    }
    img.src = url;
  }
}

export async function removePhoto(date) {
  const key = photoKey(date);
  await deletePhoto(key);
  const url = urls.get(key);
  if (url) { URL.revokeObjectURL(url); urls.delete(key); }
}

/* ---------------- Capture flow ---------------- */

export function openPhotoCapture({ date, onSaved }) {
  const overlay = document.createElement("div");
  overlay.className = "tcap";
  document.body.appendChild(overlay);
  let stream = null;
  const stop = () => { if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; };
  const close = () => { stop(); overlay.remove(); };
  const checks = new Set();

  function stepChecklist() {
    overlay.innerHTML = `<div class="tcap-panel">
      <h2>${T("拍舌照之前||Before the photo")}</h2>
      <p class="sheet-text">${T("全部符合的照片才會計入你的基準，之後的比較才準確。||Only photos that meet all of these count towards your baseline, which is what makes later comparisons fair.")}</p>
      <div class="tcap-checks">${CHECKS.map((c) => `<button type="button" class="opt${checks.has(c.id) ? " on" : ""}" data-check="${c.id}">${T(c.label)}</button>`).join("")}</div>
      <div class="btnrow">
        <button type="button" class="btn accent" data-go="camera">${T("開始||Start")}</button>
        <button type="button" class="btn ghost" data-go="close">${T("取消||Cancel")}</button>
      </div>
    </div>`;
  }

  function outlineSvg() {
    return `<svg class="tcap-outline" viewBox="0 0 300 400" preserveAspectRatio="none" aria-hidden="true">
      <path d="M95 175 C95 150 120 140 150 140 C180 140 205 150 205 175 L205 250 C205 300 182 325 150 325 C118 325 95 300 95 250 Z"
        fill="none" stroke="#fff" stroke-width="2.5" stroke-dasharray="7 6" opacity="0.9"/>
      <rect x="226" y="320" width="46" height="46" rx="6" fill="none" stroke="#fff" stroke-width="2.5" stroke-dasharray="5 5" opacity="0.9"/>
      <text x="249" y="314" text-anchor="middle" fill="#fff" font-size="12">${T("白紙||paper")}</text>
      <text x="150" y="128" text-anchor="middle" fill="#fff" font-size="13">${T("舌頭放在框內||tongue inside the outline")}</text>
    </svg>`;
  }

  async function stepCamera() {
    overlay.innerHTML = `<div class="tcap-panel">
      <div class="tcap-frame"><video playsinline muted autoplay></video>${outlineSvg()}</div>
      <p class="sheet-text tcap-msg">${T("把舌頭放在虛線框內，白紙放在右下角的小框。||Line your tongue up with the dashed outline and the paper with the small box at the bottom right.")}</p>
      <div class="btnrow">
        <button type="button" class="btn accent" data-go="snap" disabled>${T("拍照||Take photo")}</button>
        <label class="btn">${T("用相機App或選相片||Use the Camera app or a saved photo")}
          <input type="file" accept="image/*" capture="user" hidden data-file="1"></label>
      </div>
      <div class="btnrow"><button type="button" class="btn ghost" data-go="close">${T("取消||Cancel")}</button></div>
    </div>`;
    const video = overlay.querySelector("video");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("no-camera");
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
      video.srcObject = stream;
      await video.play().catch(() => {});
      overlay.querySelector('[data-go="snap"]').disabled = false;
    } catch (e) {
      overlay.querySelector(".tcap-frame").remove();
      overlay.querySelector('[data-go="snap"]').remove();
      overlay.querySelector(".tcap-msg").textContent = T("這裡開不到鏡頭。請用相機App拍，或者選一張相片。拍的時候舌頭放在畫面中間，白紙放在右下角。||The camera can't open here. Use the Camera app or pick a saved photo. Keep your tongue in the middle of the frame and the paper at the bottom right.");
    }
  }

  // The frame shows the video cropped to 3:4 (object-fit: cover) and
  // mirrored; the photo keeps exactly what was on screen.
  function snapFromVideo() {
    const video = overlay.querySelector("video");
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    const target = 3 / 4;
    let sw = vw, sh = vh;
    if (vw / vh > target) sw = vh * target; else sh = vw / target;
    const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
    const scale = Math.min(1, MAX_SIDE / sh);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * scale); canvas.height = Math.round(sh * scale);
    const ctx = canvas.getContext("2d");
    ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  async function canvasFromFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas;
    } finally { URL.revokeObjectURL(url); }
  }

  function stepMark(canvas) {
    stop();
    const pos = {};
    MARKERS.forEach((m) => { pos[m.id] = { x: m.x, y: m.y }; });
    let active = 0;
    let noWhite = !checks.has("white");
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

    function draw() {
      const shown = MARKERS.filter((m) => !(noWhite && m.id === "white"));
      overlay.innerHTML = `<div class="tcap-panel">
        <h2>${T("標出四個位置||Mark four spots")}</h2>
        <p class="sheet-text">${T("先選一個標記，再在相片上點它的位置。舌邊要點在沒有舌苔、顏色最清楚的地方。||Pick a marker, then tap where it belongs on the photo. Put Side where the edge is uncoated and the colour is clearest.")}</p>
        <div class="opts tcap-chips">${shown.map((m) => `<button type="button" class="opt${MARKERS[active].id === m.id ? " on" : ""}" data-marker="${m.id}">${T(m.label)}</button>`).join("")}</div>
        <div class="tcap-still" style="aspect-ratio:${canvas.width}/${canvas.height}">
          <img src="${dataUrl}" alt="">
          ${shown.map((m) => `<span class="tcap-dot${MARKERS[active].id === m.id ? " on" : ""}" style="left:${pos[m.id].x * 100}%;top:${pos[m.id].y * 100}%">${esc(T(m.label))}</span>`).join("")}
        </div>
        <button type="button" class="opt${noWhite ? " on" : ""}" data-nowhite="1">${T("相片裡沒有白紙||No white paper in the photo")}</button>
        <div class="btnrow">
          <button type="button" class="btn accent" data-go="save">${T("量度並儲存||Measure and save")}</button>
          <button type="button" class="btn" data-go="camera">${T("重拍||Retake")}</button>
          <button type="button" class="btn ghost" data-go="close">${T("取消||Cancel")}</button>
        </div>
      </div>`;
    }
    draw();

    overlay.onclick = async (e) => {
      const chip = e.target.closest("[data-marker]");
      if (chip) { active = MARKERS.findIndex((m) => m.id === chip.dataset.marker); draw(); return; }
      if (e.target.closest("[data-nowhite]")) {
        noWhite = !noWhite;
        if (noWhite && MARKERS[active].id === "white") active = 0;
        draw(); return;
      }
      const still = e.target.closest(".tcap-still");
      if (still) {
        const r = still.getBoundingClientRect();
        pos[MARKERS[active].id] = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
        // Move on to the next marker, so four taps place all four.
        const next = MARKERS.findIndex((m, i) => i > active && !(noWhite && m.id === "white"));
        if (next > -1) active = next;
        draw(); return;
      }
      const go = e.target.closest("[data-go]")?.dataset.go;
      if (go === "close") close();
      else if (go === "camera") { overlay.onclick = null; stepCamera(); }
      else if (go === "save") {
        e.target.disabled = true;
        await save(canvas, pos, noWhite);
      }
    };
  }

  async function save(canvas, pos, noWhite) {
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    const radius = Math.max(4, Math.round(Math.min(width, height) * 0.025));
    const at = (id) => sampleDisc(data, width, height, pos[id].x * width, pos[id].y * height, radius);
    const regions = { tip: at("tip"), centre: at("centre"), side: at("side"), white: noWhite ? null : at("white") };
    const metrics = measure(regions);
    const reliable = !noWhite && CHECKS.every((c) => checks.has(c.id));

    const history = (await getAllEntries())
      .filter((en) => en.date < date && en.answers?.tongue?.photo?.metrics)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((en) => en.answers.tongue.photo);
    const words = describe(metrics, baselineFrom(history), { reliable });

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    const key = photoKey(date);
    await putPhoto({ key, date, kind: "tongue", blob, updatedAt: Date.now(), syncedAt: 0 });
    const old = urls.get(key);
    if (old) { URL.revokeObjectURL(old); urls.delete(key); }
    queuePhotoPush(key);

    const round3 = (n) => Math.round(n * 1000) / 1000;
    const markers = {};
    Object.keys(pos).forEach((k) => { if (!(noWhite && k === "white")) markers[k] = [round3(pos[k].x), round3(pos[k].y)]; });
    close();
    onSaved({
      takenAt: new Date().toISOString(),
      file: photoPath(date),
      reliable,
      conditions: CHECKS.filter((c) => checks.has(c.id)).map((c) => c.id),
      whitePaper: !noWhite,
      metrics,
      markers,
      words,
    });
  }

  overlay.addEventListener("click", async (e) => {
    if (overlay.onclick) return; // the marking step handles its own clicks
    const check = e.target.closest("[data-check]");
    if (check) {
      const id = check.dataset.check;
      if (checks.has(id)) checks.delete(id); else checks.add(id);
      check.classList.toggle("on", checks.has(id));
      return;
    }
    const go = e.target.closest("[data-go]")?.dataset.go;
    if (go === "close") close();
    else if (go === "camera") stepCamera();
    else if (go === "snap") { const c = snapFromVideo(); if (c) stepMark(c); }
  });
  overlay.addEventListener("change", async (e) => {
    if (!e.target.dataset.file || !e.target.files?.[0]) return;
    try { stepMark(await canvasFromFile(e.target.files[0])); }
    catch (err) { overlay.querySelector(".tcap-msg").textContent = T("讀不到這張相片，請再試一次。||Couldn't read that photo; please try again."); }
  });

  stepChecklist();
}
