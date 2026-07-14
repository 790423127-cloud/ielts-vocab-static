import { Buffer } from "node:buffer";

export const STATIC_RESPONSIVE_VERSION = "20260714_d28_laptop_responsive_v1";
export const STATIC_RESPONSIVE_MARKER = "D2.4 laptop-height responsive hotfix";

const LOCKED_DESKTOP_RULE =
  ".app{height:calc(100svh - var(--workspace-header));min-height:calc(100svh - var(--workspace-header));overflow:hidden}";
const UNLOCKED_DESKTOP_RULE =
  ".app{height:auto;min-height:calc(100svh - var(--workspace-header));overflow:visible}";

const LAPTOP_HEIGHT_CSS = `

/* ${STATIC_RESPONSIVE_MARKER}
 * Keep the word visible on common 1366×768 / 1440×900 laptops.
 * The desktop workspace may grow vertically and scroll instead of clipping.
 */
@media (min-width:901px) and (max-height:900px){
  html,body{min-height:100%;overflow-x:hidden}
  .app{height:auto;min-height:calc(100svh - var(--workspace-header));overflow:visible;padding-top:10px;padding-bottom:14px}
  .top{min-height:0;padding-bottom:8px}
  .hero{flex:0 0 auto;min-height:0;justify-content:flex-start;padding:12px 0 14px}
  .star{width:30px;height:30px;margin-bottom:2px}
  .sound-main{width:36px;height:36px;margin:2px 0 5px}
  .word{font-size:clamp(52px,5.4vw,74px);line-height:.98}
  .basic-line{margin-top:8px;font-size:clamp(18px,1.7vw,23px);line-height:1.3}
  .load-info{margin-top:4px}
  .swipe-hint{margin-top:4px}
  .example-card{order:0;width:min(820px,100%);margin:14px auto 0;padding:14px 0;border-top:1px solid var(--line);border-bottom:0}
  .example-en{font-size:clamp(19px,1.75vw,26px);line-height:1.3}
  .example-cn{margin-top:5px;font-size:14px;line-height:1.35}
  .forms-box{margin-top:10px;padding:12px 14px}
  .blocks{margin-bottom:8px}
  .bottom{min-height:70px;padding:9px 16px}
  .status{min-height:44px}
}
@media (min-width:901px) and (max-height:720px){
  .app{padding-top:8px}
  .hero{padding-top:8px}
  .load-info,.swipe-hint{display:none}
  .word{font-size:clamp(48px,5vw,64px)}
  .example-card{margin-top:10px;padding-top:10px}
  .bottom{min-height:64px}
}
`;

const LEGACY_LAPTOP_CSS = `

/* ${STATIC_RESPONSIVE_MARKER} — legacy root static page */
@media (min-width:761px) and (max-height:900px){
  html,body{min-height:100%;overflow-x:hidden}
  .app{height:auto;min-height:100svh;overflow:visible;padding:10px 18px 12px}
  .hero{flex:0 0 auto;justify-content:flex-start;padding:12px 0}
  .word{font-size:clamp(48px,7vw,72px);line-height:.98}
  .basic-line{margin-top:8px;font-size:clamp(16px,1.8vw,20px)}
  .example-card{margin-top:12px;padding:12px 16px}
  .forms-box{margin-top:10px;padding:12px 16px}
  .blocks{margin-bottom:8px}
}
`;

function replaceVersionQuery(text) {
  return String(text || "").replace(
    /([?&]v=)[A-Za-z0-9_.-]+/g,
    `$1${STATIC_RESPONSIVE_VERSION}`
  );
}

export function patchStaticCss(css) {
  let next = String(css || "");

  if (next.includes(LOCKED_DESKTOP_RULE)) {
    next = next.replace(LOCKED_DESKTOP_RULE, UNLOCKED_DESKTOP_RULE);
  }

  if (!next.includes(STATIC_RESPONSIVE_MARKER)) {
    next += LAPTOP_HEIGHT_CSS;
  }

  return next;
}

export function patchLegacyStaticCss(css) {
  let next = String(css || "");
  if (!next.includes(STATIC_RESPONSIVE_MARKER)) {
    next += LEGACY_LAPTOP_CSS;
  }
  return next;
}

export function patchStaticAppJs(js) {
  let next = String(js || "");

  next = next.replace(
    /const APP_VERSION="[^"]+";/,
    `const APP_VERSION="${STATIC_RESPONSIVE_VERSION}";`
  );

  const oldViewportFunction = `function topToolsViewportKey(){
  return window.matchMedia&&window.matchMedia("(max-width: 900px)").matches?"mobile":"desktop";
}`;
  const newViewportFunction = `function topToolsViewportKey(){
  const compactDesktop=!!(window.matchMedia&&window.matchMedia("(min-width: 901px) and (max-height: 900px)").matches);
  if(compactDesktop)return"compact-desktop";
  return window.matchMedia&&window.matchMedia("(max-width: 900px)").matches?"mobile":"desktop";
}`;

  if (next.includes(oldViewportFunction)) {
    next = next.replace(oldViewportFunction, newViewportFunction);
  }

  next = next.replace(
    `topToolsCollapsed=saved===null?viewport==="mobile":saved==="1";`,
    `topToolsCollapsed=saved===null?(viewport==="mobile"||viewport==="compact-desktop"):saved==="1";`
  );

  return next;
}

export function patchLegacyStaticAppJs(js) {
  return String(js || "")
    .replace(
      /const APP_VERSION="[^"]+";/,
      `const APP_VERSION="${STATIC_RESPONSIVE_VERSION}";`
    )
    .replace(/\.replace\(\/s\+\/g," "\)/, `.replace(/\\s+/g," ")`);
}

export function patchStaticHtml(html) {
  return replaceVersionQuery(html);
}

export function patchStaticServiceWorker(sw) {
  return replaceVersionQuery(sw)
    .replace(
      /(static_vocab_(?:shell|audio)_)[A-Za-z0-9_.-]+/g,
      `$1${STATIC_RESPONSIVE_VERSION}`
    );
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    dosTime: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    dosDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

export function readStoredZipEntries(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const entries = [];
  let offset = 0;

  while (offset + 4 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;
    if (offset + 30 > buffer.length) throw new Error("Invalid ZIP local header");

    const flags = buffer.readUInt16LE(offset + 6);
    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const filenameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);

    if (flags & 0x0008) throw new Error("ZIP data descriptors are not supported");
    if (compression !== 0) throw new Error("Only stored ZIP entries are supported");

    const filenameStart = offset + 30;
    const filenameEnd = filenameStart + filenameLength;
    const dataStart = filenameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) throw new Error("Invalid ZIP entry size");

    entries.push({
      name: buffer.subarray(filenameStart, filenameEnd).toString("utf8"),
      data: buffer.subarray(dataStart, dataEnd)
    });
    offset = dataEnd;
  }

  if (!entries.length) throw new Error("No files found in static export ZIP");
  return entries;
}

export function createStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  const stamp = dosDateTime();
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(String(entry.name || "").replace(/\\/g, "/"), "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data || "");
    const checksum = crc32(data);

    const localHeader = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0),
      u16(stamp.dosTime), u16(stamp.dosDate), u32(checksum),
      u32(data.length), u32(data.length), u16(nameBuffer.length), u16(0), nameBuffer
    ]);
    localParts.push(localHeader, data);

    centralParts.push(Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0),
      u16(stamp.dosTime), u16(stamp.dosDate), u32(checksum),
      u32(data.length), u32(data.length), u16(nameBuffer.length),
      u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBuffer
    ]));

    offset += localHeader.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(centralDirectory.length), u32(offset), u16(0)
  ]);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

function patchEntry(entry) {
  const name = entry.name;

  if (name === "assets/style.css") {
    const text = entry.data.toString("utf8");
    return { ...entry, data: Buffer.from(patchStaticCss(text), "utf8") };
  }
  if (name === "assets/app.js") {
    const text = entry.data.toString("utf8");
    return { ...entry, data: Buffer.from(patchStaticAppJs(text), "utf8") };
  }
  if (name === "sw.js") {
    const text = entry.data.toString("utf8");
    return { ...entry, data: Buffer.from(patchStaticServiceWorker(text), "utf8") };
  }
  if (/\.html$/i.test(name)) {
    const text = entry.data.toString("utf8");
    return { ...entry, data: Buffer.from(patchStaticHtml(text), "utf8") };
  }

  return entry;
}

export function patchStaticExportZip(input) {
  const entries = readStoredZipEntries(input).map(patchEntry);
  return createStoredZip(entries);
}
