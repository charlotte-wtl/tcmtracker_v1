// Reads period history out of an Apple Health export (export.zip, or the
// export.xml inside it) entirely in the browser. The file never leaves the
// device. A multi-year export.xml is hundreds of MB, so it is streamed and
// scanned line by line for the few record types we need — it is never held
// in memory whole, and no zip library is needed: the browser's own
// DecompressionStream inflates the one entry we read.

const FLOW = "HKCategoryTypeIdentifierMenstrualFlow";
const SPOTTING = "HKCategoryTypeIdentifierIntermenstrualBleeding";

/* ---------------- Zip: locate export.xml via the central directory ---------------- */

async function readBytes(file, start, end) {
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

async function findZipEntry(file, wanted) {
  // End-of-central-directory record: within the last 22 + 65535 bytes.
  const tailStart = Math.max(0, file.size - 65557);
  const tail = await readBytes(file, tailStart, file.size);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (u32(tail, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not-a-zip");
  let cdSize = u32(tail, eocd + 12);
  let cdOffset = u32(tail, eocd + 16);
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    // Zip64: the locator sits just before the EOCD record.
    const loc = eocd - 20;
    if (loc < 0 || u32(tail, loc) !== 0x07064b50) throw new Error("zip64-unsupported");
    const z64Offset = Number(new DataView(tail.buffer, tail.byteOffset + loc + 8, 8).getBigUint64(0, true));
    const z64 = await readBytes(file, z64Offset, z64Offset + 56);
    const dv = new DataView(z64.buffer, z64.byteOffset);
    cdSize = Number(dv.getBigUint64(40, true));
    cdOffset = Number(dv.getBigUint64(48, true));
  }

  const cd = await readBytes(file, cdOffset, cdOffset + cdSize);
  const decoder = new TextDecoder();
  let p = 0;
  while (p + 46 <= cd.length && u32(cd, p) === 0x02014b50) {
    const method = u16(cd, p + 10);
    let compSize = u32(cd, p + 20);
    let uncompSize = u32(cd, p + 24);
    const nameLen = u16(cd, p + 28);
    const extraLen = u16(cd, p + 30);
    const commentLen = u16(cd, p + 32);
    let localOffset = u32(cd, p + 42);
    const name = decoder.decode(cd.subarray(p + 46, p + 46 + nameLen));
    if (wanted(name)) {
      // Zip64 extra field carries the real sizes/offset when these are maxed out.
      let e = p + 46 + nameLen;
      const extraEnd = e + extraLen;
      while (e + 4 <= extraEnd) {
        const id = u16(cd, e), len = u16(cd, e + 2);
        if (id === 0x0001) {
          const dv = new DataView(cd.buffer, cd.byteOffset + e + 4, len);
          let q = 0;
          if (uncompSize === 0xffffffff) { uncompSize = Number(dv.getBigUint64(q, true)); q += 8; }
          if (compSize === 0xffffffff) { compSize = Number(dv.getBigUint64(q, true)); q += 8; }
          if (localOffset === 0xffffffff) { localOffset = Number(dv.getBigUint64(q, true)); }
        }
        e += 4 + len;
      }
      // Sizes come from the central directory: Apple's export sets the
      // data-descriptor flag, so the local header's size fields are zero.
      const local = await readBytes(file, localOffset, localOffset + 30);
      if (u32(local, 0) !== 0x04034b50) throw new Error("bad-local-header");
      const dataStart = localOffset + 30 + u16(local, 26) + u16(local, 28);
      return { name, method, compSize, uncompSize, dataStart };
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("export-xml-not-found");
}

async function openExportXml(file) {
  const isZip = /\.zip$/i.test(file.name) || (await readBytes(file, 0, 4)).every((b, i) => b === [0x50, 0x4b, 0x03, 0x04][i]);
  if (!isZip) return { stream: file.stream(), total: file.size };
  const entry = await findZipEntry(file, (n) => /(^|\/)export\.xml$/.test(n));
  const raw = file.slice(entry.dataStart, entry.dataStart + entry.compSize);
  if (entry.method === 0) return { stream: raw.stream(), total: entry.compSize };
  if (entry.method !== 8) throw new Error("unsupported-compression");
  if (typeof DecompressionStream === "undefined") throw new Error("browser-too-old");
  return { stream: raw.stream(), total: entry.compSize, inflate: true };
}

/* ---------------- Scan ---------------- */

function attrs(tag) {
  const out = {};
  const re = /(\w+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(tag))) out[m[1]] = m[2];
  return out;
}

// Returns { flowDays: Map(date -> flow), starts: Set(date), spotting: Set(date) }.
// onProgress(fraction) is called as bytes are read.
export async function scanHealthExport(file, onProgress = () => {}) {
  const { stream, total, inflate } = await openExportXml(file);

  let read = 0;
  const counted = stream.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      read += chunk.byteLength;
      onProgress(Math.min(1, read / total));
      controller.enqueue(chunk);
    },
  }));
  const text = (inflate ? counted.pipeThrough(new DecompressionStream("deflate-raw")) : counted)
    .pipeThrough(new TextDecoderStream());

  const flowDays = new Map();
  const starts = new Set();
  const spotting = new Set();
  let open = null; // a multi-line <Record> we are inside

  function finish(rec) {
    const day = (rec.startDate || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    if (rec.type === SPOTTING) { spotting.add(day); return; }
    const flow = (rec.value || "").replace(/^HKCategoryValue(VaginalBleeding|MenstrualFlow)/, "").toLowerCase();
    if (flow === "none") return;
    // A day can hold more than one record; keep the heaviest.
    const rank = { unspecified: 0, light: 1, medium: 2, heavy: 3 };
    const prev = flowDays.get(day);
    if (prev === undefined || (rank[flow] ?? 0) > (rank[prev] ?? 0)) flowDays.set(day, flow);
    if (rec.cycleStart) starts.add(day);
  }

  function handleLine(line) {
    if (open) {
      if (line.includes('key="HKMenstrualCycleStart"') && line.includes('value="1"')) open.cycleStart = true;
      if (line.includes("</Record>")) { finish(open); open = null; }
      return;
    }
    if (!line.includes("<Record ") || !(line.includes(FLOW) || line.includes(SPOTTING))) return;
    const rec = attrs(line);
    if (rec.type !== FLOW && rec.type !== SPOTTING) return;
    if (/\/>\s*$/.test(line)) finish(rec);
    else open = rec;
  }

  let carry = "";
  const reader = text.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const lines = (carry + value).split("\n");
    carry = lines.pop();
    lines.forEach(handleLine);
  }
  if (carry) handleLine(carry);
  onProgress(1);
  return { flowDays, starts, spotting };
}

/* ---------------- Periods ---------------- */

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10); // pure calendar arithmetic in UTC — no timezone involved
}

// Groups flow days into periods. Apple's own cycle-start flags are used when
// present; otherwise a start is a flow day with no flow in the previous 7 days.
export function periodsFromScan({ flowDays, starts }) {
  const days = [...flowDays.keys()].sort();
  const startList = starts.size
    ? [...starts].sort()
    : days.filter((d, i) => i === 0 || addDays(days[i - 1], 7) < d);
  return startList.map((start, i) => {
    const nextStart = startList[i + 1];
    let end = start;
    // Extend through consecutive flow days, tolerating a single missed day.
    for (;;) {
      const n1 = addDays(end, 1), n2 = addDays(end, 2);
      if (nextStart && n1 >= nextStart) break;
      if (flowDays.has(n1)) end = n1;
      else if (flowDays.has(n2) && !(nextStart && n2 >= nextStart)) end = n2;
      else break;
    }
    return { start, end };
  });
}
