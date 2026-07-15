export const runtime = "nodejs";

import { requireLocalAdmin, requireLocalRead } from "../../lib/api/local-admin-guard.mjs";

import { existsSync, readFileSync } from "fs";
import path from "path";
import { createHash } from "crypto";
import {
  IDICTATION_FREQUENCY_BATCH_SIZE,
  IDICTATION_FREQUENCY_META,
  IDICTATION_FREQUENCY_SOURCES
} from "../../lib/spelling/idictation-frequency.generated.mjs";

function normalizeWord(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "")
    .replace(/\s+/g, " ");
}

function readJson(file, fallback = {}) {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, "utf-8") || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function audioCacheDir() {
  return path.join(process.cwd(), ".audio-cache");
}

function audioIndexPath() {
  return path.join(audioCacheDir(), "audio-index.json");
}


function exportCachePath() {
  return path.join(process.cwd(), ".static-export-cache", "words.json");
}

function publicAssetPath(...parts) {
  return path.join(process.cwd(), "public", ...parts);
}

function safeFilePart(value) {
  return String(value || "audio")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42) || "audio";
}

function shortHash(value) {
  return createHash("sha1").update(String(value || "")).digest("hex").slice(0, 10);
}

function edgeTtsHash(text, voice = "en-US-AriaNeural", rate = "-12%") {
  return createHash("sha256")
    .update(`${voice}|${rate}|${String(text || "").replace(/\s+/g, " ").trim().slice(0, 160)}`)
    .digest("hex")
    .slice(0, 32);
}

function findExistingEdgeTtsFile(text) {
  const cleanText = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);

  if (!cleanText) return null;

  const candidates = [
    `${edgeTtsHash(cleanText, "en-US-AriaNeural", "-8%")}.mp3`,
    `${edgeTtsHash(cleanText, "en-US-AriaNeural", "-12%")}.mp3`,
    `${edgeTtsHash(cleanText, "en-US-AriaNeural", "0%")}.mp3`,
    `${edgeTtsHash(cleanText, "en-US-GuyNeural", "-12%")}.mp3`,
    `${edgeTtsHash(cleanText, "en-GB-SoniaNeural", "-12%")}.mp3`
  ];

  for (const filename of candidates) {
    const filepath = path.join(audioCacheDir(), filename);

    if (existsSync(filepath)) {
      return {
        filename,
        filepath,
        source: "edge-hash-scan"
      };
    }
  }

  return null;
}

function normalizePhraseItems(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "string") {
        return {
          phrase: item,
          chinese: ""
        };
      }

      return {
        ...item,
        phrase: String(item?.phrase || item?.word || item?.text || "").trim(),
        chinese: String(item?.chinese || item?.meaning || item?.zh || "").trim()
      };
    })
    .filter((item) => item.phrase);
}

function sanitizeWordItem(item) {
  return {
    word: String(item?.word || "").trim(),
    phonetic: String(item?.phonetic || "").trim(),
    pos: String(item?.pos || "").trim(),
    meaning: String(item?.meaning || "").trim(),
    definition: String(item?.definition || "").trim(),
    example: String(item?.example || "").trim(),
    exampleCn: String(item?.exampleCn || "").trim(),
    collocations: normalizePhraseItems(item?.collocations),
    phraseCollocations: normalizePhraseItems(item?.phraseCollocations),
    ieltsUse: Array.isArray(item?.ieltsUse) ? item.ieltsUse : [],
    topics: Array.isArray(item?.topics) ? item.topics : [],
    difficulty: String(item?.difficulty || "").trim(),
    category: String(item?.category || "IELTS G类").trim(),
    status: String(item?.status || "").trim(),
    favorite: Boolean(item?.favorite),
    forms: Array.isArray(item?.forms) ? item.forms : [],
    wordFamily: Array.isArray(item?.wordFamily) ? item.wordFamily : []
  };
}

/* Minimal ZIP writer, no external dependency. */
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

  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

  return {
    dosTime,
    dosDate
  };
}

function u16(value) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(value);
  return b;
}

function u32(value) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(value >>> 0);
  return b;
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const stamp = dosDateTime(new Date());

  files.forEach((file) => {
    const nameBuffer = Buffer.from(file.name.replace(/\\/g, "/"), "utf-8");
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.data || ""), "utf-8");
    const crc = crc32(data);

    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(stamp.dosTime),
      u16(stamp.dosDate),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBuffer.length),
      u16(0),
      nameBuffer
    ]);

    localParts.push(localHeader, data);

    const centralHeader = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(stamp.dosTime),
      u16(stamp.dosDate),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBuffer.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuffer
    ]);

    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  });

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0)
  ]);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

const STATIC_EXPORT_VERSION = "20260715_d30_laptop_height_v1";

const STATIC_INDEX_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <meta name="theme-color" content="#f4f6f5" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-title" content="IELTS Vocab" />
  <meta name="mobile-web-app-capable" content="yes" />
  <title>IELTS Vocab 静态学习版</title>
  <link rel="manifest" href="./manifest.webmanifest?v=${STATIC_EXPORT_VERSION}" />
  <link rel="stylesheet" href="./assets/style.css?v=${STATIC_EXPORT_VERSION}" />
</head>
<body>
  <header class="static-brand-bar">
    <a class="static-brand" href="./index.html"><span aria-hidden="true"></span>IELTS VOCAB</a>
    <div class="static-session-context"><strong>主词库刷词</strong><span>专注学习</span></div>
    <nav class="static-brand-nav" aria-label="主要学习模式">
      <a href="./meaning.html">选义</a><a href="./spelling.html">拼写</a><a href="./reading-g.html">G类阅读提升</a>
    </nav>
  </header>
  <aside class="static-shell-sidebar" aria-label="学习导航">
    <nav><a class="active" href="./index.html">刷词</a><a href="./spelling.html">拼写</a><a href="./meaning.html">选义</a></nav>
    <div class="static-shell-divider"></div>
    <span class="static-shell-label">专项学习</span>
    <nav><a href="./basic.html">零基础词库</a><a href="./reading-g.html">G类阅读提升</a><a href="./spelling.html?source=error_bank">错词本</a><a href="./spelling.html?source=srs_review">SRS 复习</a></nav>
    <nav class="static-shell-bottom"><a href="./index.html">设置</a></nav>
  </aside>
  <main class="app">
    <header class="top">
      <button id="prevBtn" class="top-btn">上一个</button>
      <button id="topToolsToggle" class="top-tools-toggle" type="button" aria-expanded="true" aria-controls="topActions">工具与词库</button>
      <div id="topActions" class="top-actions">
        <button id="shuffleBtn" class="top-btn">随机</button>
        <button id="entryBtn" class="top-btn">入口</button>
        <button id="editWordBtn" class="top-btn">修改</button>
        <button id="deleteWordBtn" class="top-btn danger-top">删除</button>
        <button id="syncBtn" class="top-btn sync-top">云同步</button>
        <a href="./basic.html" class="top-btn">零基础单词</a>
        <a href="./reading-g.html" class="top-btn">G类阅读提升</a>
        <a href="./meaning.html" class="top-btn">看词选意思·6000</a>
        <a href="./spelling.html" class="top-btn">拼写训练</a>
        <select id="filterSelect" class="top-select" title="词库"></select>
      </div>
    </header>

    <section id="swipeArea" class="hero">
      <button id="favoriteBtn" class="star" title="收藏">☆</button>
      <div id="unfamiliarAlert" class="unfamiliar-alert hidden">你特意标记了不熟，优先复习这个词</div>
      <button id="wordSoundBtn" class="sound-main" title="播放单词">🔊</button>
      <div id="word" class="word">Loading</div>
      <div id="basic" class="basic-line">正在准备学习内容</div>
      <div id="loadInfo" class="load-info">第一次打开会稍慢，之后会自动缓存。</div>
      <div class="swipe-hint">← 右滑上一个 · 左滑下一个 →　Tab 发音单词 · 空格发音英文例句 · 按住 ←/→ 连续切词</div>

      <div id="formsBox" class="forms-box hidden">
        <div class="box-title">听力形式 / 重要变形</div>
        <div id="formsList" class="cards"></div>
      </div>

      <div id="familyBox" class="forms-box hidden">
        <div class="box-title">词族 / 派生词</div>
        <div id="familyList" class="cards"></div>
      </div>

      <div class="example-card">
        <div class="example-head">
          <button id="exampleSoundBtn" class="mini-sound example-sound" title="播放例句">🔊</button>
          <div id="example" class="example-en">读取主词库并恢复学习位置</div>
        </div>
        <div id="exampleCn" class="example-cn"></div>
      </div>
    </section>

    <section class="blocks">
      <div class="block">
        <div class="block-title">常见搭配</div>
        <div id="collocations" class="list"></div>
      </div>
      <div class="block">
        <div class="block-title">短语 / 介词搭配</div>
        <div id="phraseCollocations" class="list"></div>
      </div>
    </section>

    <footer class="bottom">
      <div class="actions">
        <button id="knownBtn" class="status known">熟悉 <span>0</span></button>
        <button id="unknownBtn" class="status unknown">不熟 <span>0</span></button>
      </div>
      <div class="progress-row">
        <div class="progress"><div id="progressFill" class="progress-fill"></div></div>
        <div id="count" class="count">0 / 0</div>
      </div>
    </footer>




    <div id="editPanel" class="edit-panel hidden">
      <div class="edit-card">
        <div class="sync-head">
          <div>
            <div class="sync-title">修改当前单词</div>
            <div class="sync-status">保存后当前设备立即生效；电脑端重新导出静态站会带上正式修改。</div>
          </div>
          <button id="editCloseBtn" class="sync-close">×</button>
        </div>

        <div class="edit-grid">
          <label>英文<input id="editWord" /></label>
          <label>音标<input id="editPhonetic" /></label>
          <label>词性<input id="editPos" /></label>
          <label>难度<input id="editDifficulty" /></label>
          <label class="wide-field">中文释义<textarea id="editMeaning"></textarea></label>
          <label class="wide-field">例句<textarea id="editExample"></textarea></label>
          <label class="wide-field">例句中文<textarea id="editExampleCn"></textarea></label>
          <label class="wide-field">常见搭配（一行一个，格式：public transport = 公共交通）<textarea id="editCollocations"></textarea></label>
          <label class="wide-field">短语 / 介词搭配（一行一个，格式：in public = 公开地）<textarea id="editPhraseCollocations"></textarea></label>
          <label class="wide-field">听力形式 / 重要变形（一行一个，格式：experienced | 过去式 / 过去分词 | 规则过去式）<textarea id="editForms"></textarea></label>
          <label class="wide-field">词族 / 派生词（一行一个，格式：experience | noun 名词 | 经验）<textarea id="editWordFamily"></textarea></label>
          <label>IELTS 用途（逗号分隔）<input id="editIeltsUse" /></label>
          <label>主题（逗号分隔）<input id="editTopics" /></label>
        </div>

        <div class="sync-actions">
          <button id="editCancelBtn" class="sync-light">取消</button>
          <button id="editSaveBtn" class="sync-primary">保存修改</button>
        </div>
      </div>
    </div>

    <div id="entryPanel" class="entry-panel hidden">
      <div class="entry-card">
        <div class="sync-head">
          <div>
            <div class="sync-title">学习入口</div>
            <div id="entryStatus" class="sync-status">每个入口单独记当前位置</div>
          </div>
          <button id="entryCloseBtn" class="sync-close">×</button>
        </div>
        <div class="entry-help">总词库不拆开；入口只是筛选队列。熟悉词默认隐藏，“全部单词”除外。</div>
        <div id="entryList" class="entry-list"></div>
      </div>
    </div>

    <div id="syncPanel" class="sync-panel hidden">
      <div class="sync-card">
        <div class="sync-head">
          <div>
            <div class="sync-title">云同步</div>
            <div id="syncStatus" class="sync-status">未连接</div>
          </div>
          <button id="syncCloseBtn" class="sync-close">×</button>
        </div>

        <div class="sync-section">
          <div class="sync-label">同步码</div>
          <input id="syncCodeInput" class="sync-input" type="text" autocomplete="off" placeholder="例如 wenyao-vocab-2026" />
          <div class="sync-help">电脑和手机输入同一个同步码，就同步同一份学习进度。同步码不要太简单。</div>
        </div>

        <div class="sync-section">
          <div class="sync-grid">
            <button id="syncConnectBtn" class="sync-action">连接云端</button>
            <button id="syncPullBtn" class="sync-action secondary">从云端恢复</button>
          </div>
          <div class="sync-grid">
            <button id="syncPushBtn" class="sync-action secondary">上传本机进度</button>
            <button id="syncDisconnectBtn" class="sync-action danger">断开同步</button>
          </div>
          <div class="sync-help">第一次用：先在旧设备点“上传本机进度”，新设备点“从云端恢复”。之后会自动同步。</div>
        </div>
      </div>
    </div>

    <div id="toast" class="toast"></div>
  </main>
  <script src="./sync-config.js?v=${STATIC_EXPORT_VERSION}"></script>
  <script src="./assets/app.js?v=${STATIC_EXPORT_VERSION}"></script>
</body>
</html>`;

const STATIC_STYLE_CSS = `:root{--bg:#f7f2e8;--card:rgba(255,255,255,.76);--ink:#16352f;--muted:rgba(22,53,47,.62);--green:#237567;--soft:#e7f7f2;--orange:#c2410c}*{box-sizing:border-box}html,body{overscroll-behavior-x:none}body{margin:0;background:radial-gradient(circle at top,#fff8ed 0,#f7f2e8 48%,#efe7d8 100%);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink)}button,select{font:inherit}.app{min-height:100svh;display:flex;flex-direction:column;padding:20px 22px 14px}.top{display:flex;align-items:center;justify-content:space-between;gap:12px;position:relative;z-index:5}.top-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.top-btn,.top-select{border:0;border-radius:999px;background:rgba(255,255,255,.72);color:var(--green);font-weight:900;padding:10px 14px;box-shadow:inset 0 0 0 1px rgba(35,117,103,.10);cursor:pointer}.top-select{max-width:min(58vw,360px)}.hero{text-align:center;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:18px 0;touch-action:pan-y;user-select:none}.star{border:0;background:transparent;color:#d29422;font-size:34px;line-height:1;cursor:pointer;margin-bottom:6px}.sound-main{border:0;width:42px;height:42px;border-radius:999px;background:rgba(231,247,242,.95);color:var(--green);font-size:18px;cursor:pointer;margin:4px 0 8px}.word{font-size:clamp(54px,9vw,112px);font-weight:950;letter-spacing:-.06em;line-height:.95;cursor:pointer;word-break:break-word;max-width:min(980px,96vw)}.basic-line{margin-top:14px;color:#1c3344;font-weight:900;font-size:clamp(20px,2.8vw,28px);line-height:1.4}.load-info{margin-top:7px;color:rgba(35,117,103,.45);font-size:12px;font-weight:850}.swipe-hint{margin-top:8px;font-size:12px;font-weight:850;color:rgba(35,117,103,.42)}.example-card{margin:20px auto 0;width:min(760px,calc(100vw - 48px));padding:18px 22px;border-radius:26px;background:var(--card);box-shadow:inset 0 0 0 1px rgba(35,117,103,.07)}.example-head{display:grid;grid-template-columns:34px 1fr;align-items:start;gap:10px;text-align:left}.example-sound{margin-top:1px}.example-en{font-size:clamp(18px,2.4vw,24px);font-weight:850}.example-cn{margin-top:8px;color:var(--muted);font-weight:700;text-align:left;padding-left:44px}.blocks{display:grid;grid-template-columns:1fr 1fr;gap:14px;width:min(900px,calc(100vw - 44px));margin:0 auto 12px}.block{background:rgba(255,255,255,.62);border-radius:22px;padding:14px 16px;box-shadow:inset 0 0 0 1px rgba(35,117,103,.07)}.block-title{font-size:13px;font-weight:950;color:var(--muted);margin-bottom:8px}.list{display:grid;gap:8px}.item{display:grid;grid-template-columns:30px 1fr;gap:8px;align-items:center;text-align:left}.mini-sound{width:28px;height:28px;border:0;border-radius:999px;background:rgba(231,247,242,.95);color:var(--green);font-size:13px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(35,117,103,.12)}.en{font-weight:850}.zh{font-size:12px;color:var(--muted);font-weight:700;margin-top:2px}.forms-box{width:min(820px,calc(100vw - 48px));margin:14px auto 0;padding:18px 22px;border-radius:24px;background:rgba(255,255,255,.72);box-shadow:inset 0 0 0 1px rgba(33,94,81,.08)}.box-title{text-align:left;font-size:13px;font-weight:950;color:rgba(33,94,81,.72);margin-bottom:12px}.cards{display:flex;justify-content:center;flex-wrap:wrap;gap:12px}.form-card{display:inline-flex;flex-direction:column;align-items:flex-start;gap:6px;width:min(100%,560px);min-width:min(390px,100%);padding:16px 18px;border-radius:22px;background:rgba(231,247,242,.92);color:#215e51;font-size:14px;line-height:1.42;box-shadow:inset 0 0 0 1px rgba(33,94,81,.10)}.card-head{display:flex;align-items:center;flex-wrap:wrap;gap:10px}.form-card b{font-size:17px;font-weight:1000}.form-card em{font-style:normal;font-size:12px;font-weight:950;color:rgba(33,94,81,.82);padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.78)}.form-desc{font-size:14px;font-weight:760;color:rgba(33,94,81,.90);word-break:break-word}.form-card small{font-size:12px;font-weight:820;color:rgba(33,94,81,.66);word-break:break-word}.unfamiliar-alert{margin:6px auto 10px;padding:10px 14px;border-radius:999px;background:rgba(255,244,230,.96);color:#9a3412;font-weight:900;font-size:15px;box-shadow:inset 0 0 0 1px rgba(234,88,12,.12)}.hidden{display:none!important}.bottom{width:min(900px,calc(100vw - 44px));margin:0 auto}.actions{display:grid;grid-template-columns:1fr 1fr;gap:12px}.status{border:0;border-radius:999px;padding:15px 18px;font-weight:950;font-size:17px;cursor:pointer}.status span{opacity:.55;font-size:12px;margin-left:5px}.known{background:#e7f7f2;color:#237567}.unknown{background:#fff4e6;color:#c2410c}.active-unknown{box-shadow:inset 0 0 0 2px rgba(194,65,12,.24)}.progress-row{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;margin-top:12px}.progress{height:10px;border-radius:999px;background:rgba(35,117,103,.12);overflow:hidden}.progress-fill{height:100%;border-radius:999px;background:#237567;transition:width .2s}.count{font-size:13px;font-weight:900;color:var(--muted)}.toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%) translateY(20px);opacity:0;background:rgba(22,53,47,.92);color:#fff;border-radius:999px;padding:10px 16px;font-weight:900;transition:.2s;pointer-events:none;z-index:20}.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}.sync-top{background:rgba(231,247,242,.92)}.sync-top.on{background:#237567;color:#fff}.sync-panel{position:fixed;inset:0;background:rgba(22,53,47,.28);z-index:30;display:flex;align-items:center;justify-content:center;padding:18px}.sync-card{width:min(520px,100%);max-height:calc(100svh - 36px);overflow:auto;border-radius:28px;background:#fffaf1;box-shadow:0 22px 70px rgba(22,53,47,.22);padding:20px;display:grid;gap:14px}.sync-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.sync-title{font-size:22px;font-weight:1000;color:var(--ink)}.sync-status{margin-top:4px;font-size:13px;font-weight:850;color:var(--muted)}.sync-close{border:0;background:rgba(35,117,103,.10);color:var(--green);font-size:24px;border-radius:999px;width:36px;height:36px;cursor:pointer}.sync-section{display:grid;gap:8px;padding:14px;border-radius:20px;background:rgba(255,255,255,.64);box-shadow:inset 0 0 0 1px rgba(35,117,103,.08)}.sync-label{font-size:13px;font-weight:950;color:var(--green)}.sync-input{width:100%;border:0;border-radius:15px;padding:12px 13px;background:#fff;color:var(--ink);box-shadow:inset 0 0 0 1px rgba(35,117,103,.12);outline:none}.sync-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.sync-action{border:0;border-radius:15px;padding:12px 13px;background:#237567;color:#fff;font-weight:950;cursor:pointer}.sync-action.secondary{background:#e7f7f2;color:#237567}.sync-action.danger{background:#fff4e6;color:#c2410c}.sync-help{font-size:12px;line-height:1.45;color:var(--muted);font-weight:760}@media(max-width:760px){.sync-panel{padding:10px;align-items:flex-end}.sync-card{border-radius:24px;padding:16px}.sync-grid{grid-template-columns:1fr}}body.mobile-mode .app{padding:12px 12px 10px}body.mobile-mode .top{gap:8px;align-items:flex-start}body.mobile-mode .top-btn,body.mobile-mode .top-select{font-size:12px;padding:8px 10px}body.mobile-mode .hero{justify-content:flex-start;padding-top:10px}body.mobile-mode .word{font-size:clamp(48px,18vw,82px);letter-spacing:-.055em}body.mobile-mode .example-card,body.mobile-mode .forms-box,body.mobile-mode .bottom{width:100%}body.mobile-mode .blocks{grid-template-columns:1fr;width:100%;gap:10px}body.mobile-mode .bottom{position:sticky;bottom:0;padding:10px 0 4px;background:linear-gradient(to top,rgba(247,242,232,.98),rgba(247,242,232,.72),transparent);z-index:6}body.mobile-mode .form-card{width:100%;min-width:100%;padding:14px 15px;border-radius:18px}@media(max-width:760px){.app{padding:12px 12px 10px}.top{align-items:flex-start}.top-actions{gap:6px}.top-btn,.top-select{padding:8px 9px;font-size:12px}.top-select{max-width:58vw}.hero{justify-content:flex-start;padding-top:10px}.word{font-size:clamp(48px,18vw,82px);letter-spacing:-.055em}.basic-line{font-size:15px}.swipe-hint{display:block}.example-head{grid-template-columns:32px 1fr}.example-cn{padding-left:42px}.blocks{grid-template-columns:1fr;width:100%;gap:10px}.example-card,.forms-box,.bottom{width:100%}.form-card{width:100%;min-width:100%;padding:14px 15px;border-radius:18px}.bottom{position:sticky;bottom:0;padding:10px 0 4px;background:linear-gradient(to top,rgba(247,242,232,.98),rgba(247,242,232,.72),transparent);z-index:6}.actions{gap:9px}.status{padding:13px 14px}}

.entry-panel{position:fixed;inset:0;background:rgba(22,53,47,.28);z-index:28;display:flex;align-items:center;justify-content:center;padding:18px}
.entry-panel.hidden{display:none}
.entry-card{width:min(760px,96vw);max-height:86vh;overflow:auto;background:#fffaf1;border:1px solid #eadfcc;border-radius:24px;box-shadow:0 24px 80px rgba(24,55,49,.18);padding:18px}
.entry-help{font-size:12px;color:#8b7f70;background:#fff3e1;border:1px solid #eadfcc;border-radius:14px;padding:9px 11px;margin:10px 0 12px}
.entry-section{margin-top:13px}
.entry-section.highlight .entry-section-title{color:#237567;font-size:13px}
.entry-section.highlight .entry-btn{border-color:rgba(35,117,103,.28);background:#f3fbf7}
.entry-section-title{font-size:12px;font-weight:900;color:#8b7f70;margin:0 0 7px}
.entry-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.entry-btn{border:1px solid #eadfcc;background:#fffdf8;border-radius:16px;text-align:left;padding:11px;min-height:84px;display:grid;gap:4px;color:#173a35}
.entry-btn.active{background:#e7f4ed;border-color:rgba(47,107,93,.25)}
.entry-title{font-size:13px;font-weight:900;color:#2f6b5d}
.entry-desc{font-size:11px;line-height:1.35;color:#7d8a84}
.entry-meta{font-size:11px;color:#9a6a20;font-weight:800}
@media(max-width:680px){.entry-card{padding:14px}.entry-grid{grid-template-columns:1fr}.entry-btn{min-height:72px}}


.edit-panel{position:fixed;inset:0;background:rgba(22,53,47,.28);z-index:30;display:flex;align-items:center;justify-content:center;padding:18px}
.edit-panel.hidden{display:none}
.edit-card{width:min(860px,96vw);max-height:88vh;overflow:auto;background:#fffaf1;border:1px solid #eadfcc;border-radius:24px;box-shadow:0 24px 80px rgba(24,55,49,.18);padding:18px}
.edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.edit-grid label{display:grid;gap:5px;font-size:12px;font-weight:850;color:#7d8a84}
.edit-grid input,.edit-grid textarea{width:100%;border:1px solid #eadfcc;border-radius:14px;background:#fffdf8;color:#173a35;padding:10px 11px;font:inherit;outline:none}
.edit-grid textarea{min-height:72px;resize:vertical}
.wide-field{grid-column:1/-1}
@media(max-width:680px){.edit-grid{grid-template-columns:1fr}.edit-card{padding:14px}}


.danger-top{color:#b23b18!important;background:#fff0e8!important;border-color:#f2c7b7!important}

.status.has-count span{font-weight:950;opacity:1}

.swipe-hint{max-width:min(92vw,760px);line-height:1.45}

/* 2026-07-10: keep the standalone UI aligned with the maintained study pages. */
.app{width:min(1440px,100%);margin-inline:auto}
.top{width:min(1200px,100%);margin-inline:auto}
.hero{min-height:0}
.word{letter-spacing:0}
.example-card{width:min(820px,calc(100vw - 48px));border-radius:18px}
.forms-box,.blocks,.bottom{width:min(1080px,calc(100vw - 44px))}
.forms-box,.block{border-radius:18px}

@media(min-width:1200px) and (min-height:760px){
  .app{height:100svh;overflow:hidden;padding:20px 28px 14px}
  .hero{justify-content:flex-start;overflow-y:auto;overscroll-behavior:contain;padding:clamp(20px,4vh,44px) 0 18px}
  .blocks{flex:0 0 auto}
  .bottom{flex:0 0 auto}
}

@media(max-width:760px){
  .app{width:100%}
  .top{flex-direction:column;align-items:stretch}
  .top-actions{width:100%;flex-wrap:nowrap;justify-content:flex-start;overflow-x:auto;overscroll-behavior-inline:contain;padding-bottom:4px;scrollbar-width:thin}
  .top-btn,.top-select{flex:0 0 auto;white-space:nowrap}
  .top-select{width:auto;max-width:190px}
  .hero{overflow:visible}
  .word{letter-spacing:0;overflow-wrap:anywhere}
}

/* C2 Mature Immersive system */
:root{--bg:#f4f6f5;--card:#fff;--ink:#213a4d;--muted:#75827d;--green:#225f52;--soft:#e5f2ed;--orange:#d76538;--line:#dce3df}
html{background:var(--bg)}
body{background:var(--bg)}
.static-brand-bar{height:76px;display:grid;grid-template-columns:minmax(180px,1fr) auto minmax(180px,1fr);align-items:center;padding:0 40px;border-bottom:1px solid var(--line);background:#fff}
.static-brand{display:inline-flex;align-items:center;gap:12px;color:#1d322c;font-size:15px;font-weight:800;text-decoration:none;white-space:nowrap}
.static-brand>span{width:4px;height:28px;border-radius:2px;background:var(--orange)}
.static-brand-nav{grid-column:2;display:flex;height:100%;align-items:stretch;gap:32px}
.static-brand-nav a{position:relative;display:inline-flex;align-items:center;color:#5f6e68;font-size:14px;font-weight:700;text-decoration:none;white-space:nowrap}
.static-brand-nav a.active,.static-brand-nav a:hover{color:var(--green)}
.static-brand-nav a.active:after{content:"";position:absolute;right:0;bottom:0;left:0;height:3px;background:var(--orange)}
.app{min-height:calc(100svh - 76px);padding:16px 40px 14px}
.top{width:min(1360px,100%);padding-bottom:12px;border-bottom:1px solid var(--line)}
.top-btn,.top-select{border:1px solid var(--line);border-radius:6px;background:#fff;box-shadow:none;color:#4f615b;font-weight:700;padding:9px 12px}
.top-btn:hover{border-color:#9db2aa;color:var(--green)}
.hero{padding-top:24px}
.star{width:34px;height:34px;border:1px solid var(--line);border-radius:50%;background:#fff;font-size:20px}
.sound-main,.mini-sound{border:1px solid #bed8d0;border-radius:6px;background:#edf7f3;box-shadow:none}
.word{color:#213a4d;font-weight:820;letter-spacing:0}
.example-card,.forms-box,.block,.form-card{border:1px solid var(--line);border-radius:7px;background:rgba(255,255,255,.82);box-shadow:none}
.status{border-radius:6px}
.known{background:var(--green);color:#fff}
.unknown{border:1px solid #e9bda8;background:#fff3ec;color:#a94420}
.progress{height:5px;border-radius:3px;background:#dfe6e2}
.progress-fill{border-radius:3px;background:var(--green)}
.sync-card,.sync-section,.entry-card,.entry-btn,.edit-card,.edit-grid input,.edit-grid textarea{border-radius:7px;background:#fff}
@media(max-width:700px){.static-brand-bar{height:112px;grid-template-columns:1fr;grid-template-rows:52px 60px;padding:0 14px}.static-brand-nav{grid-column:1;grid-row:2;width:calc(100% + 28px);margin-left:-14px;padding:0 14px;gap:24px;overflow-x:auto;border-top:1px solid #edf0ee}.app{min-height:calc(100svh - 112px);padding:12px}.top{flex-direction:column}.top-actions{width:100%;flex-wrap:nowrap;overflow-x:auto}.blocks{grid-template-columns:1fr}.bottom{background:rgba(244,246,245,.96)}}

/* D1.5 Focus Workspace */
:root{--workspace-header:64px;--workspace-sidebar:184px;--bg:#eef2f0;--ink:#16362e;--muted:#697a75;--green:#126653;--soft:#e8f2ee;--orange:#d65d39;--line:#d8e0dc}
.static-brand-bar{position:sticky;top:0;z-index:30;height:var(--workspace-header);display:grid;grid-template-columns:var(--workspace-sidebar) minmax(0,1fr) auto;padding:0;border-bottom:1px solid var(--line);background:#fff}
.static-brand{height:100%;padding:0 20px;border-right:1px solid var(--line)}
.static-session-context{min-width:0;display:flex;align-items:baseline;gap:10px;padding:0 28px}
.static-session-context strong{color:var(--ink);font-size:14px}.static-session-context span{color:var(--muted);font-size:11px}
.static-brand-nav{grid-column:3;height:100%;padding:0 18px;border-left:1px solid var(--line);gap:6px}
.static-brand-nav a{padding:0 10px;border:0!important}.static-brand-nav a:after{display:none!important}
.static-shell-sidebar{position:fixed;top:var(--workspace-header);bottom:0;left:0;z-index:25;width:var(--workspace-sidebar);display:flex;flex-direction:column;padding:16px 12px 14px;border-right:1px solid var(--line);background:#fff}
.static-shell-sidebar nav{display:grid;gap:3px}.static-shell-sidebar a{position:relative;min-height:42px;display:flex;align-items:center;padding:0 12px;border-radius:5px;color:#556761;font-size:13px;font-weight:700;text-decoration:none}
.static-shell-sidebar a:hover{background:#f7f9f8;color:var(--green)}.static-shell-sidebar a.active{background:var(--soft);color:#0b5142}.static-shell-sidebar a.active:before{content:"";position:absolute;top:8px;bottom:8px;left:-12px;width:3px;background:var(--orange)}
.static-shell-divider{height:1px;margin:13px 10px;background:var(--line)}.static-shell-label{padding:0 12px 7px;color:#8b9994;font-size:10px;font-weight:800}.static-shell-bottom{margin-top:auto}
.app{width:calc(100% - var(--workspace-sidebar));min-height:calc(100svh - var(--workspace-header));margin-left:var(--workspace-sidebar);padding:14px 22px}
.top{width:100%;min-height:48px;padding-bottom:10px;border-bottom:1px solid var(--line)}
.hero{justify-content:flex-start;padding:clamp(24px,5vh,54px) 0 20px}.word{color:var(--ink);font-family:Georgia,"Times New Roman",serif;font-size:clamp(64px,6.2vw,86px);font-weight:600;line-height:1;letter-spacing:0}
.basic-line{color:#203a35;font-size:clamp(23px,2vw,28px)}.example-card{order:-1;width:min(820px,100%);margin:0 auto 24px;padding:0 0 22px;border:0;border-bottom:1px solid var(--line);border-radius:0;background:transparent}.example-en{font-family:Georgia,"Times New Roman",serif;font-size:clamp(24px,2.3vw,34px);font-weight:500;text-align:center}.example-cn{text-align:center;padding-left:0}
.forms-box,.blocks{width:min(940px,100%);border:1px solid var(--line);border-radius:6px;background:#fff;box-shadow:none}.blocks{gap:0}.block{border:0;border-radius:0;background:#fff}.block+.block{border-left:1px solid var(--line)}.bottom{width:100%;padding:10px 0}.status,.top-btn,.top-select{border-radius:5px}.known{background:var(--green);color:#fff}.progress{height:5px}
@media(max-width:900px){:root{--workspace-header:112px;--workspace-sidebar:0px}.static-brand-bar{height:var(--workspace-header);grid-template-columns:1fr auto;grid-template-rows:58px 54px;padding:0}.static-brand{grid-column:1;grid-row:1;width:auto;min-width:0;padding:0 14px;border-right:0}.static-session-context{grid-column:1/-1;grid-row:2;justify-content:space-between;padding:0 14px;border-top:1px solid var(--line)}.static-brand-nav{grid-column:2;grid-row:1;width:auto;min-width:0;margin:0;padding:0 8px;gap:0;border-left:0}.static-shell-sidebar{display:none}.app{width:100%;margin-left:0;padding:12px 12px 76px}.top{flex-direction:column;align-items:stretch}.hero{padding-top:18px}.example-card{width:100%}.word{font-size:clamp(52px,17vw,66px)}.blocks{grid-template-columns:1fr}.block+.block{border-top:1px solid var(--line);border-left:0}.bottom{position:sticky;bottom:0;background:#eef2f0}}

/* D2.1 responsive system: all mobile commands remain visible without horizontal drag. */
@media(max-width:900px){
  .app{padding-bottom:calc(18px + env(safe-area-inset-bottom))}
  .top{gap:8px}
  .top>.top-btn{width:100%}
  .top-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;width:100%;padding-bottom:0;overflow:visible}
  .top-actions .top-btn,.top-actions .top-select{width:100%;min-width:0;max-width:none;padding:8px 5px;white-space:normal;line-height:1.25;overflow-wrap:anywhere;text-align:center}
  .bottom,body.mobile-mode .bottom{position:static;padding:10px 0 4px;background:transparent}
}
@media(max-width:380px){
  .top-actions{grid-template-columns:repeat(2,minmax(0,1fr))}
}
.top-tools-toggle{border:1px solid rgba(35,117,103,.18);border-radius:6px;background:#fff;color:var(--green);font-weight:900;padding:9px 12px;cursor:pointer;white-space:nowrap}
.top-tools-toggle::after{content:"收起";margin-left:7px;color:var(--muted);font-size:11px}
.top.is-tools-collapsed .top-actions{display:none}
.top.is-tools-collapsed .top-tools-toggle::after{content:"展开"}

/* D2.2 responsive density: tablet collapse + readable wide desktop. */
@media(min-width:901px){
  .app{height:auto;min-height:calc(100svh - var(--workspace-header));overflow:visible}
  .top,.bottom{width:min(1480px,100%);margin-inline:auto}
  .hero{width:min(1280px,100%);margin-inline:auto}
}
@media(min-width:1600px){
  :root{--workspace-header:72px;--workspace-sidebar:220px}
  .static-brand{padding-inline:24px;font-size:17px}.static-session-context{padding-inline:34px}.static-session-context strong{font-size:16px}.static-session-context span{font-size:13px}
  .static-shell-sidebar{padding:20px 15px}.static-shell-sidebar a{min-height:48px;padding-inline:15px;font-size:15px}.static-shell-label{font-size:11px}
  .app{padding:18px 32px 16px}.top{min-height:58px}.top-btn,.top-select{padding:11px 15px;font-size:14px}
  .hero{padding-top:clamp(30px,4.5vh,56px)}.example-card{width:min(1040px,100%);margin-bottom:30px}.example-en{font-size:clamp(32px,2vw,42px)}.example-cn{font-size:18px}
  .word{font-size:clamp(96px,5.5vw,118px)}.basic-line{font-size:clamp(28px,1.8vw,34px)}.load-info{font-size:14px}
  .star{width:42px;height:42px;font-size:24px}.sound-main{width:48px;height:48px;font-size:20px}
  .bottom{padding-block:14px}.status{min-height:50px;font-size:18px}.count{font-size:15px}
}
@media(min-width:2400px){
  :root{--workspace-sidebar:260px}
  .top,.bottom{width:min(1760px,100%)}.hero{width:min(1500px,100%)}
  .word{font-size:128px}.example-en{font-size:46px}.basic-line{font-size:36px}
}

/* D2.4 laptop-height responsive hotfix.
 * A desktop workspace may grow and scroll; the action dock must never cover the word.
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

/* D2.3 high-visibility study action dock. */
.bottom{min-height:82px;display:grid;grid-template-columns:auto minmax(280px,1fr);align-items:center;gap:16px;padding:12px 20px;border-top:1px solid var(--line);background:#fff}
.actions{display:flex;gap:12px}
.status{min-width:112px;min-height:50px;padding:0 22px;border-radius:7px;font-size:16px;font-weight:800;line-height:1.2}
.known{box-shadow:0 2px 8px rgba(18,102,83,.16)}
.unknown{border-color:#df9f82;background:#fff0e8;color:#a83d1c}
.progress-row{width:100%;min-width:0;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px;margin:0}
.progress{height:9px;border-radius:5px;background:#d3ded9;box-shadow:inset 0 1px 2px rgba(22,54,46,.08)}
.progress-fill{border-radius:5px}
.count{min-width:88px;color:#52645e;font-size:15px;font-weight:750;text-align:right}
@media(max-width:900px){
  .bottom,body.mobile-mode .bottom{min-height:0;grid-template-columns:1fr;gap:10px;padding:10px 0 calc(10px + env(safe-area-inset-bottom));border-top:1px solid var(--line);background:#fff}
  .actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .status{width:100%;min-width:0;min-height:52px;padding-inline:12px;font-size:16px}
  .progress-row{grid-row:1}.progress{height:8px}.count{min-width:72px;font-size:14px}
}
@media(min-width:1600px){
  .bottom{min-height:90px;padding:14px 28px}.status{min-width:128px;min-height:54px;font-size:17px}.progress{height:10px}.count{font-size:16px}
}
`;

const STATIC_APP_JS = `const APP_VERSION="${STATIC_EXPORT_VERSION}";
const IDICTATION_ENTRY_COUNTS={listening:${IDICTATION_FREQUENCY_META.sources.listening.uniqueWords},reading:${IDICTATION_FREQUENCY_META.sources.reading.uniqueWords}};
const PROGRESS_KEY="static_vocab_progress_v15_entry_edgetts_cache_fallback";
const OLD_WORDS_KEY="static_vocab_words_v1";
const OLD_SESSION_KEY="static_vocab_session_v1";
const AUDIO_CACHE_NAME="static_vocab_audio_"+APP_VERSION;
const CLOUDBASE_SYNC_CODE_KEY="static_vocab_cloudbase_sync_code_v1";
const TOP_TOOLS_PREF_PREFIX="static_vocab_top_tools_collapsed_v1_";
const CLOUDBASE_SDK_URLS=[
  // CloudBase JS SDK 2.x：旧版 1.x 会触发 ACCESS_TOKEN_DISABLED。
  "https://static.cloudbase.net/cloudbase-js-sdk/2.12.1/cloudbase.full.js",
  "https://static.cloudbase.net/cloudbase-js-sdk/2.8.1/cloudbase.full.js",
  "https://static.cloudbase.net/cloudbase-js-sdk/2.0.0/cloudbase.full.js",
  "https://cdn.jsdelivr.net/npm/@cloudbase/js-sdk@2.12.1/dist/index.umd.js",
  "https://unpkg.com/@cloudbase/js-sdk@2.12.1/dist/index.umd.js"
];

let words=[];
let idictationPayload=null;
let filter="all";
let index=0;
let audio=null;
let mobileMode=false;
let saveTimer=null;
let audioUrlCache=new Map();
let progress={statuses:{},currentWord:"",filter:"all",mobileMode:false,updatedAt:0,deviceId:"",positions:{}};
let cloudbaseApp=null;
let cloudbaseDb=null;
let cloudbaseAuth=null;
let cloudbaseReady=false;
let cloudbaseSyncCode="";
let cloudbaseDocId="";
let vocabId="";
let cloudSyncTimer=null;
let cloudPullTimer=null;
let lastAutoCloudPullAt=0;
let restoreFocusWord="";
let holdStepTimer=null;
let holdStepDelayTimer=null;
let holdStepDir=0;
let holdTouchActive=false;
let suppressNextSwipe=false;

const els={
  top:document.querySelector(".top"),
  topActions:document.getElementById("topActions"),
  topToolsToggle:document.getElementById("topToolsToggle"),
  word:document.getElementById("word"),
  basic:document.getElementById("basic"),
  loadInfo:document.getElementById("loadInfo"),
  example:document.getElementById("example"),
  exampleCn:document.getElementById("exampleCn"),
  exampleSoundBtn:document.getElementById("exampleSoundBtn"),
  formsBox:document.getElementById("formsBox"),
  formsList:document.getElementById("formsList"),
  familyBox:document.getElementById("familyBox"),
  familyList:document.getElementById("familyList"),
  collocations:document.getElementById("collocations"),
  phraseCollocations:document.getElementById("phraseCollocations"),
  count:document.getElementById("count"),
  progressFill:document.getElementById("progressFill"),
  favoriteBtn:document.getElementById("favoriteBtn"),
  unknownBtn:document.getElementById("unknownBtn"),
  unfamiliarAlert:document.getElementById("unfamiliarAlert"),
  toast:document.getElementById("toast"),
  filterSelect:document.getElementById("filterSelect"),
  mobileModeBtn:document.getElementById("mobileModeBtn"),
  swipeArea:document.getElementById("swipeArea"),
  syncBtn:document.getElementById("syncBtn"),
  syncPanel:document.getElementById("syncPanel"),
  syncCloseBtn:document.getElementById("syncCloseBtn"),
  syncStatus:document.getElementById("syncStatus"),
  syncCodeInput:document.getElementById("syncCodeInput"),
  syncConnectBtn:document.getElementById("syncConnectBtn"),
  syncPullBtn:document.getElementById("syncPullBtn"),
  syncPushBtn:document.getElementById("syncPushBtn"),
  syncDisconnectBtn:document.getElementById("syncDisconnectBtn"),
  entryBtn:document.getElementById("entryBtn"),
  entryPanel:document.getElementById("entryPanel"),
  entryCloseBtn:document.getElementById("entryCloseBtn"),
  entryStatus:document.getElementById("entryStatus"),
  entryList:document.getElementById("entryList"),
  editWordBtn:document.getElementById("editWordBtn"),
  deleteWordBtn:document.getElementById("deleteWordBtn"),
  editPanel:document.getElementById("editPanel"),
  editCloseBtn:document.getElementById("editCloseBtn"),
  editCancelBtn:document.getElementById("editCancelBtn"),
  editSaveBtn:document.getElementById("editSaveBtn"),
  editWord:document.getElementById("editWord"),
  editPhonetic:document.getElementById("editPhonetic"),
  editPos:document.getElementById("editPos"),
  editDifficulty:document.getElementById("editDifficulty"),
  editMeaning:document.getElementById("editMeaning"),
  editExample:document.getElementById("editExample"),
  editExampleCn:document.getElementById("editExampleCn"),
  editCollocations:document.getElementById("editCollocations"),
  editPhraseCollocations:document.getElementById("editPhraseCollocations"),
  editForms:document.getElementById("editForms"),
  editWordFamily:document.getElementById("editWordFamily"),
  editIeltsUse:document.getElementById("editIeltsUse"),
  editTopics:document.getElementById("editTopics")
};

function norm(v){return String(v||"").trim().toLowerCase().replace(/\\s+/g," ")}
function arr(v){return Array.isArray(v)?v:[]}
function uniq(values){return Array.from(new Set(values.map(x=>String(x||"").trim()).filter(Boolean)))}
function escapeHtml(v){return String(v||"").replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}


function filterLabel(value){
  if(value==="all")return "今日任务 / 全部待学";
  if(value==="everything")return "全部单词";
  if(value==="unfamiliar")return "不熟词库";
  if(value==="familiar")return "熟悉词库";
  if(value==="favorite")return "收藏词";
  if(value==="life-work")return "生活/工作高频";
  if(value==="idictation:listening")return "爱听写听力";
  if(value==="idictation:reading")return "爱听写阅读";
  if(value.indexOf("ielts:")===0)return value.slice(6);
  if(value.indexOf("topic:")===0)return value.slice(6);
  if(value.indexOf("difficulty:")===0)return value.slice(11);
  return "全部待学";
}

function isLifeWorkWord(w){
  const uses=arr(w.ieltsUse);
  const topics=arr(w.topics);
  return uses.includes("生活高频")||uses.includes("工作高频")||topics.some(function(x){return ["工作","住房","交通","健康","消费","旅行","社区","公共服务"].includes(x)});
}

function isIdictationFilter(value){
  return value==="idictation:listening"||value==="idictation:reading";
}

function getIdictationSource(key){
  return idictationPayload&&idictationPayload.sources?idictationPayload.sources[key]||null:null;
}

function buildLibraryWordMap(){
  const map=new Map();
  words.forEach(function(w){
    const key=norm(w.word);
    if(key&&!map.has(key)) map.set(key,w);
  });
  return map;
}

function findIdictationLibraryWord(entry,lookup){
  const candidates=[entry.word,entry.expectedAnswer].concat(arr(entry.acceptedAnswers)).map(norm).filter(Boolean);
  for(let i=0;i<candidates.length;i++){
    const matched=lookup.get(candidates[i]);
    if(matched) return matched;
  }
  return null;
}

function buildIdictationFlashWords(sourceKey){
  const source=getIdictationSource(sourceKey);
  if(!source||!source.entries||!source.entries.length) return [];
  const lookup=buildLibraryWordMap();
  return source.entries.map(function(entry,sourceIndex){
    const libraryWord=findIdictationLibraryWord(entry,lookup);
    const answerText=arr(entry.acceptedAnswers).length?entry.acceptedAnswers.join(" / "):(entry.expectedAnswer||"");
    const frequencyLabel=entry.frequencyGroupLabel||((entry.frequency||0)+"次");
    const statusKey=norm(entry.word);
    const saved=(progress.statuses||{})[statusKey]||{};
    return {
      id:entry.id,
      word:entry.word,
      phonetic:entry.phonetic||libraryWord?.phonetic||"",
      pos:libraryWord?.pos||"word",
      meaning:entry.meaning||libraryWord?.meaning||answerText||frequencyLabel,
      definition:libraryWord?.definition||answerText||entry.meaning||"",
      example:entry.example||libraryWord?.example||"",
      exampleCn:entry.exampleCn||libraryWord?.exampleCn||"",
      collocations:arr(libraryWord?.collocations),
      phraseCollocations:arr(libraryWord?.phraseCollocations),
      ieltsUse:arr(libraryWord?.ieltsUse).length?libraryWord.ieltsUse:[entry.sourceLabel].filter(Boolean),
      topics:arr(libraryWord?.topics).length?libraryWord.topics:[frequencyLabel].filter(Boolean),
      difficulty:libraryWord?.difficulty||frequencyLabel,
      category:libraryWord?.category||entry.sourceLabel||"爱听写",
      status:saved.status||"",
      favorite:!!saved.favorite,
      forms:arr(libraryWord?.forms),
      wordFamily:arr(libraryWord?.wordFamily),
      audio:libraryWord?.audio||"",
      exampleAudio:libraryWord?.exampleAudio||"",
      originalIndex:sourceIndex,
      __idictationFlash:true
    };
  });
}

function activePool(){
  if(isIdictationFilter(filter)) return buildIdictationFlashWords(filter.slice(11));
  return words;
}

function countForFilter(activeFilter){
  if(isIdictationFilter(activeFilter)){
    const key=activeFilter.slice(11);
    const pool=buildIdictationFlashWords(key);
    if(pool.length) return pool.filter(function(w){return passFilterWith(activeFilter,w)}).length;
    return IDICTATION_ENTRY_COUNTS[key]||0;
  }
  return words.filter(function(w){return passFilterWith(activeFilter,w)}).length;
}

async function ensureIdictationPayload(){
  if(idictationPayload&&idictationPayload.sources) return idictationPayload;
  try{
    const res=await fetch("./data/idictation-frequency.json?v="+APP_VERSION,{cache:"no-store"});
    if(res.ok) idictationPayload=await res.json();
  }catch(e){}
  return idictationPayload;
}

const ENTRY_GROUPS=[
  {title:"爱听写独立入口",highlight:true,items:[
    {title:"爱听写听力",desc:"按听力答案词和出现频率整理的独立刷词入口。",filter:"idictation:listening"},
    {title:"爱听写阅读",desc:"按阅读高频答案词和出现频率整理的独立刷词入口。",filter:"idictation:reading"}
  ]},
  {title:"今天优先",items:[
    {title:"今日任务",desc:"快速扫待学词 + 复习不熟词。",filter:"all"},
    {title:"不熟词",desc:"所有标记不熟的词，优先复习。",filter:"unfamiliar"},
    {title:"收藏词",desc:"写作、口语、书信可直接用的重点词。",filter:"favorite"}
  ]},
  {title:"IELTS G 类用途",items:[
    {title:"G类书信",desc:"投诉、申请、预约、感谢、道歉、解释。",filter:"ielts:G类书信"},
    {title:"Listening",desc:"听力生活场景词，优先听音频反应。",filter:"ielts:Listening"},
    {title:"Speaking",desc:"口语可用表达，适合造句。",filter:"ielts:Speaking"},
    {title:"Reading",desc:"阅读识别为主，不要求全会写。",filter:"ielts:Reading"},
    {title:"Task 2",desc:"社会、教育、环境、科技观点词。",filter:"ielts:Task 2"},
    {title:"生活/工作高频",desc:"住房、交通、健康、消费、工作。",filter:"life-work"}
  ]},
  {title:"难度层级",items:[
    {title:"基础必会",desc:"必须快速认出，适合每天扫。",filter:"difficulty:基础高频"},
    {title:"核心高频",desc:"雅思主力词，优先变熟悉。",filter:"difficulty:中级核心"},
    {title:"高级认识",desc:"认识即可，不要花太久。",filter:"difficulty:高级加分"},
    {title:"全部单词",desc:"总仓库，包含熟悉词。",filter:"everything"}
  ]}
];

function rememberPositionForCurrentFilter(){
  const w=currentRaw();
  if(!w||!w.word)return;
  progress.positions=progress.positions||{};
  progress.positions[filter]=norm(w.word);
}

function poolForFilter(activeFilter){
  if(isIdictationFilter(activeFilter)) return buildIdictationFlashWords(activeFilter.slice(11));
  return words;
}

function list(activeFilter){
  const f=activeFilter||filter;
  const pool=poolForFilter(f);
  return pool.map(function(w,i){return Object.assign({},w,{originalIndex:i})}).filter(function(w){return passFilterWith(f,w)});
}

function resolveIndexForFilter(activeFilter,options){
  const opts=options||{};
  const allowFirstFallback=opts.allowFirstFallback!==false;
  const f=activeFilter||filter||"all";
  const pool=poolForFilter(f);
  const saved=(progress.positions||{})[f]||"";
  let found=-1;

  if(saved){
    found=pool.findIndex(function(w){return norm(w.word)===saved&&passFilterWith(f,w)});
    if(found<0){
      found=pool.findIndex(function(w){return norm(w.word)===saved});
    }
  }

  if(found<0&&progress.currentWord){
    const currentKey=norm(progress.currentWord);
    found=pool.findIndex(function(w){return norm(w.word)===currentKey&&passFilterWith(f,w)});
    if(found<0){
      found=pool.findIndex(function(w){return norm(w.word)===currentKey});
    }
  }

  if(found<0&&allowFirstFallback){
    const l=list(f);
    found=l.length?l[0].originalIndex:-1;
  }

  return found;
}

function applyIndexForFilter(activeFilter,options){
  const found=resolveIndexForFilter(activeFilter,options);
  if(found>=0) index=found;
}

function switchFilter(nextFilter){
  restoreFocusWord="";
  rememberPositionForCurrentFilter();
  filter=nextFilter||"all";
  progress.filter=filter;
  applyIndexForFilter(filter);
  render();
  persistNow();
  scheduleCloudSync();
}





function simpleHashText(text){
  const s=String(text||"");
  let h1=2166136261;
  let h2=16777619;
  for(let i=0;i<s.length;i++){
    const c=s.charCodeAt(i);
    h1^=c;
    h1=Math.imul(h1,16777619);
    h2=(Math.imul(h2,31)+c)>>>0;
  }
  return ((h1>>>0).toString(16).padStart(8,"0")+(h2>>>0).toString(16).padStart(8,"0"));
}

function computeVocabId(list){
  const arr=Array.isArray(list)?list:[];
  const sample=[];
  sample.push("count:"+arr.length);
  for(let i=0;i<arr.length;i++){
    const w=arr[i]||{};
    if(i<80||i>=arr.length-80||i%97===0){
      sample.push([
        i,
        norm(w.word||""),
        String(w.pos||"").trim(),
        String(w.meaning||w.definition||"").trim().slice(0,80)
      ].join("|"));
    }
  }
  return "vocab_"+arr.length+"_"+simpleHashText(sample.join("\\n"));
}

function getVocabId(){
  if(!vocabId) vocabId=computeVocabId(words);
  return vocabId;
}

function safeLsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
function safeLsSet(k,v){try{localStorage.setItem(k,v);return true}catch(e){console.warn("localStorage full",k,e);return false}}
function safeLsRemove(k){try{localStorage.removeItem(k)}catch(e){}}

function splitListText(v){
  return String(v||"").split(/[\\n,，;；]+/).map(function(x){return x.trim()}).filter(Boolean);
}
function phraseItemsToText(items){
  if(!Array.isArray(items))return "";
  return items.map(function(item){
    if(typeof item==="string")return item;
    const phrase=item.phrase||item.word||"";
    const meaning=item.meaning||item.chinese||item.cn||"";
    return meaning?phrase+" = "+meaning:phrase;
  }).filter(Boolean).join("\\n");
}
function formsToText(items){
  if(!Array.isArray(items))return "";
  return items.map(function(item){
    const word=item.word||"";
    const type=item.type||item.label||"";
    const note=item.note||item.meaning||item.chinese||item.cn||"";
    return [word,type,note].filter(Boolean).join(" | ");
  }).filter(Boolean).join("\\n");
}
function parsePhraseItems(v){
  return String(v||"").split(/\\n+/).map(function(line){return line.trim()}).filter(Boolean).map(function(line){
    const parts=line.split(/\\s*=\\s*/);
    return {phrase:(parts[0]||"").trim(),meaning:(parts[1]||"").trim(),chinese:(parts[1]||"").trim()};
  }).filter(function(x){return x.phrase});
}
function parseFormItems(v){
  return String(v||"").split(/\\n+/).map(function(line){return line.trim()}).filter(Boolean).map(function(line){
    const parts=line.split(/\\s*\\|\\s*/);
    return {word:(parts[0]||"").trim(),type:(parts[1]||"").trim(),note:(parts[2]||"").trim(),meaning:(parts[2]||"").trim(),chinese:(parts[2]||"").trim()};
  }).filter(function(x){return x.word});
}
function loadWordEdits(){
  try{
    const data=JSON.parse(safeLsGet("static_vocab_word_edits_v1")||"{}");
    return data&&typeof data==="object"?data:{};
  }catch(e){
    safeLsRemove("static_vocab_word_edits_v1");
    return {};
  }
}
function saveWordEdit(baseKey,word){
  const edits=loadWordEdits();
  const key=baseKey||norm(word.word);
  edits[key]=word;
  safeLsSet("static_vocab_word_edits_v1",JSON.stringify(edits));
}
function applyWordEdits(list){
  const edits=loadWordEdits();
  return list.map(function(w){
    const key=norm(w.word);
    const edited=edits[key];
    return edited?Object.assign({},w,edited,{editBaseKey:key}):w;
  });
}
function saveWordsToLocal(){
  const w=words[index];
  if(!w)return;
  saveWordEdit(w.editBaseKey||norm(w.word),w);
  // 旧版本保存过完整 10000 词，太大，清掉避免 quota。
  safeLsRemove("static_vocab_words_v1");
}
function loadDeletedWords(){
  try{
    const data=JSON.parse(safeLsGet("static_vocab_deleted_words_v1")||"{}");
    return data&&typeof data==="object"?data:{};
  }catch(e){
    safeLsRemove("static_vocab_deleted_words_v1");
    return {};
  }
}
function saveDeletedWord(baseKey){
  if(!baseKey)return;
  const deleted=loadDeletedWords();
  deleted[baseKey]=Date.now();
  safeLsSet("static_vocab_deleted_words_v1",JSON.stringify(deleted));
}
function applyDeletedWords(list){
  const deleted=loadDeletedWords();
  return list.filter(function(w){return !deleted[norm(w.word)]});
}
function deleteCurrentWord(){
  const w=currentRaw();
  if(!w){toast("没有当前单词");return}
  const baseKey=w.editBaseKey||norm(w.word);
  if(!baseKey){toast("当前单词无效，无法删除");return}
  const sameCount=words.filter(function(item){return norm(item.word)===baseKey}).length;
  if(!confirm("确定删除这个单词？\\n\\n"+w.word+"\\n\\n将从本机词库隐藏/删除 "+sameCount+" 条同名单词记录。电脑端正式删除后重新发布，会彻底移除。"))return;
  saveDeletedWord(baseKey);
  words=words.filter(function(item){return norm(item.word)!==baseKey});
  index=Math.min(index,Math.max(0,words.length-1));
  persistNow();
  render();
  toast("已删除："+w.word+"（"+sameCount+" 条记录）");
}
function openEditCurrentWord(){
  const w=currentRaw();
  if(!w){toast("没有当前单词");return}
  els.editWord.value=w.word||"";
  els.editPhonetic.value=w.phonetic||"";
  els.editPos.value=w.pos||"";
  els.editDifficulty.value=w.difficulty||"";
  els.editMeaning.value=w.meaning||"";
  els.editExample.value=w.example||"";
  els.editExampleCn.value=w.exampleCn||"";
  els.editCollocations.value=phraseItemsToText(w.collocations);
  els.editPhraseCollocations.value=phraseItemsToText(w.phraseCollocations);
  els.editForms.value=formsToText(w.forms);
  els.editWordFamily.value=formsToText(w.wordFamily);
  els.editIeltsUse.value=arr(w.ieltsUse).join("，");
  els.editTopics.value=arr(w.topics).join("，");
  els.editPanel.classList.remove("hidden");
}
function saveEditCurrentWord(){
  const old=words[index];
  if(!old)return;
  const baseKey=old.editBaseKey||norm(old.word);
  const next=Object.assign({},old,{
    word:String(els.editWord.value||"").trim()||old.word,
    phonetic:String(els.editPhonetic.value||"").trim(),
    pos:String(els.editPos.value||"").trim(),
    difficulty:String(els.editDifficulty.value||"").trim(),
    meaning:String(els.editMeaning.value||"").trim(),
    example:String(els.editExample.value||"").trim(),
    exampleCn:String(els.editExampleCn.value||"").trim(),
    collocations:parsePhraseItems(els.editCollocations.value),
    phraseCollocations:parsePhraseItems(els.editPhraseCollocations.value),
    forms:parseFormItems(els.editForms.value),
    wordFamily:parseFormItems(els.editWordFamily.value),
    ieltsUse:splitListText(els.editIeltsUse.value),
    topics:splitListText(els.editTopics.value),
    editBaseKey:baseKey,
    editedAt:Date.now()
  });
  words[index]=next;
  rememberPositionForCurrentFilter();
  saveWordsToLocal();
  persistNow();
  render();
  els.editPanel.classList.add("hidden");
  toast("已修改当前单词");
}


function getDeviceId(){
  try{
    let id=localStorage.getItem("static_vocab_device_id_v1");
    if(!id){
      id="device_"+Math.random().toString(36).slice(2)+"_"+Date.now();
      localStorage.setItem("static_vocab_device_id_v1",id);
    }
    return id;
  }catch(e){
    return "device_fallback_"+Math.random().toString(36).slice(2)+"_"+Date.now();
  }
}


function posAtomCn(atom){const t=String(atom||"").trim().toLowerCase();if(!t)return"";if(/^(proper\\s*noun)$/.test(t))return"专有名词";if(/^(modal\\s*verb|modal)$/.test(t))return"情态动词";if(/^(noun|n\\.?)$/.test(t)||t.indexOf("noun")>=0)return"名词";if(/^(verb|v\\.?)$/.test(t)||t.indexOf("verb")>=0)return"动词";if(/^(adjective|adj\\.?)$/.test(t)||t.indexOf("adj")>=0)return"形容词";if(/^(adverb|adv\\.?)$/.test(t)||t.indexOf("adv")>=0)return"副词";if(/phrase|短语/.test(t))return"短语";if(/preposition|^prep/.test(t))return"介词";if(/conjunction|^conj/.test(t))return"连词";if(/pronoun|^pron/.test(t))return"代词";if(/number|numeral/.test(t))return"数词";return""}
function posCn(pos=""){const raw=String(pos||"").trim();if(!raw)return"";const parts=raw.split(/\\s*[\\/,|&;·／、]\\s*/);const out=[];const seen={};for(let i=0;i<parts.length;i++){const c=posAtomCn(parts[i]);if(c&&!seen[c]){seen[c]=1;out.push(c)}}return out.join("/")||posAtomCn(raw)}
function posDisplay(pos){if(!pos)return"词性";const c=posCn(pos);return c&&String(pos).indexOf(c)<0?pos+" "+c:pos}
function formTypeCn(type=""){const t=String(type).toLowerCase();if(t.includes("irregular plural"))return"不规则复数";if(t.includes("plural"))return"复数形式";if(t.includes("past tense / past participle"))return"过去式 / 过去分词";if(t.includes("past tense"))return"过去式";if(t.includes("past participle"))return"过去分词";if(t.includes("present participle"))return"-ing 形式";return type||"变形"}
function formHint(form){const cn=formTypeCn(form.type);if(cn==="复数形式")return"注意复数形式";if(cn==="不规则复数")return"注意不规则复数";if(cn==="过去式")return"注意过去式";if(cn==="过去分词")return"注意过去分词";if(cn==="过去式 / 过去分词")return"注意过去式 / 过去分词";if(cn==="-ing 形式")return"注意 -ing 形式";return form.note||""}

function toast(msg){els.toast.textContent=msg;els.toast.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(function(){els.toast.classList.remove("show")},1500)}

function cloudErrText(err){
  try{
    if(!err) return "unknown";
    if(typeof err==="string") return err;
    const parts=[];
    const keys=["code","errCode","errorCode","message","errMsg","msg","requestId","requestID"];
    keys.forEach(function(k){
      if(err[k]!==undefined&&err[k]!==null) parts.push(k+": "+String(err[k]));
    });
    if(err.error&&typeof err.error==="object"){
      ["code","message","errMsg"].forEach(function(k){
        if(err.error[k]!==undefined&&err.error[k]!==null) parts.push("error."+k+": "+String(err.error[k]));
      });
    }
    if(parts.length) return parts.join(" | ");
    const json=JSON.stringify(err);
    if(json&&json!=="{}") return json.slice(0,500);
    return Object.prototype.toString.call(err);
  }catch(e){
    return String(err);
  }
}

function setCloudError(prefix,err){
  const text=cloudErrText(err);
  if(text.indexOf("ACCESS_TOKEN_DISABLED")>=0){
    setSyncStatus(prefix+"：匿名登录未生效或 SDK 缓存过旧。请确认匿名登录已开启，然后清缓存刷新。",false);
  }else if(text.indexOf("INVALID_PARAM")>=0){
    setSyncStatus(prefix+"：参数错误，可能 envId / 地域 / 集合名不对。"+text,false);
  }else if(text.indexOf("unauthenticated")>=0||text.indexOf("credentials not found")>=0){
    setSyncStatus(prefix+"：匿名登录没有成功拿到凭证。手机请清缓存/无痕打开最新版，确认匿名登录已开启。原始错误："+text,false);
  }else if(text.indexOf("DATABASE")>=0||text.indexOf("permission")>=0||text.indexOf("PERMISSION")>=0){
    setSyncStatus(prefix+"：数据库权限或集合设置问题。"+text,false);
  }else{
    setSyncStatus(prefix+"："+text+"。手机如果失败，请清缓存或无痕打开最新版。",false);
  }
}


function currentRaw(){return activePool()[index]||null}

function persistNow(){
  try{
    const w=currentRaw();
    if(w){
      progress.currentWord=w.word||progress.currentWord||"";
      progress.currentWordUpdatedAt=Date.now();
      rememberPositionForCurrentFilter();
    }
    progress.filter=filter;
    progress.mobileMode=mobileMode;
    progress.updatedAt=Date.now();
    progress.deviceId=progress.deviceId||getDeviceId();
    safeLsSet(PROGRESS_KEY,JSON.stringify(progress));
  }catch(e){}
}

function persistSoon(){clearTimeout(saveTimer);saveTimer=setTimeout(persistNow,120)}

function rememberWord(w){
  if(!w||!w.word)return;
  const now=Date.now();
  const key=norm(w.word);
  const old=(progress.statuses||{})[key]||{};
  progress.statuses=progress.statuses||{};
  progress.statuses[key]={
    status:w.status||"",
    favorite:!!w.favorite,
    updatedAt:now,
    deviceId:progress.deviceId||getDeviceId()
  };
  progress.updatedAt=now;
}

function loadProgress(){
  try{
    const saved=JSON.parse(localStorage.getItem(PROGRESS_KEY)||"null");
    if(saved&&typeof saved==="object"){
      progress={statuses:saved.statuses||{},currentWord:saved.currentWord||"",currentWordUpdatedAt:saved.currentWordUpdatedAt||0,filter:saved.filter||"all",mobileMode:!!saved.mobileMode,updatedAt:saved.updatedAt||0,deviceId:saved.deviceId||"",positions:saved.positions||{}};
    }
  }catch(e){}

  try{
    const old=JSON.parse(localStorage.getItem(OLD_WORDS_KEY)||"[]");
    if(Array.isArray(old)){
      old.forEach(function(x){
        if(x&&x.word&&!progress.statuses[norm(x.word)]) progress.statuses[norm(x.word)]={status:x.status||"",favorite:!!x.favorite};
      });
    }
  }catch(e){}

  try{
    const s=JSON.parse(localStorage.getItem(OLD_SESSION_KEY)||"{}");
    if((!progress.currentWord)&&Number.isInteger(s.index)&&words[s.index]) progress.currentWord=words[s.index].word;
    if((!progress.filter||progress.filter==="all")&&s.filter) progress.filter=s.filter;
    if(typeof s.mobileMode==="boolean") progress.mobileMode=s.mobileMode;
  }catch(e){}

  words=words.map(function(w){
    const x=progress.statuses[norm(w.word)];
    return x?Object.assign({},w,{status:x.status||"",favorite:!!x.favorite}):w;
  });

  filter=progress.filter||"all";
  mobileMode=!!progress.mobileMode;
  if(progress.currentWord) restoreFocusWord=progress.currentWord;
  applyIndexForFilter(filter,{allowFirstFallback:false});
}

function buildFilterOptions(){
  const ielts=uniq(words.flatMap(function(w){return arr(w.ieltsUse)}));
  const topics=uniq(words.flatMap(function(w){return arr(w.topics)}));
  const difficulty=uniq(words.map(function(w){return w.difficulty}));

  let html="";
  html+='<option value="all">全部待学</option>';
  html+='<option value="everything">全部单词</option>';
  html+='<option value="life-work">生活/工作高频</option>';
  html+='<option value="unfamiliar">不熟词库</option>';
  html+='<option value="familiar">熟悉词库</option>';
  html+='<option value="favorite">收藏</option>';
  html+='<optgroup label="爱听写独立入口"><option value="idictation:listening">爱听写听力</option><option value="idictation:reading">爱听写阅读</option></optgroup>';
  if(ielts.length) html+='<optgroup label="IELTS 用途">'+ielts.map(function(x){return '<option value="ielts:'+escapeHtml(x)+'">'+escapeHtml(x)+'</option>'}).join("")+'</optgroup>';
  if(topics.length) html+='<optgroup label="主题分类">'+topics.map(function(x){return '<option value="topic:'+escapeHtml(x)+'">'+escapeHtml(x)+'</option>'}).join("")+'</optgroup>';
  if(difficulty.length) html+='<optgroup label="难度分类">'+difficulty.map(function(x){return '<option value="difficulty:'+escapeHtml(x)+'">'+escapeHtml(x)+'</option>'}).join("")+'</optgroup>';

  els.filterSelect.innerHTML=html;
  if(!Array.from(els.filterSelect.options).some(function(o){return o.value===filter})) filter="all";
  els.filterSelect.value=filter;
}

function passFilterWith(activeFilter,w){
  if(restoreFocusWord&&norm(w.word)===norm(restoreFocusWord)) return true;
  if(isIdictationFilter(activeFilter)) return !!w.__idictationFlash;
  if(activeFilter==="everything") return true;
  if(activeFilter==="familiar") return w.status==="熟悉";
  if(activeFilter==="unfamiliar") return w.status==="不熟";
  if(activeFilter==="favorite") return w.status!=="熟悉"&&!!w.favorite;
  if(activeFilter==="life-work") return w.status!=="熟悉"&&isLifeWorkWord(w);
  if(activeFilter.indexOf("ielts:")===0) return w.status!=="熟悉"&&arr(w.ieltsUse).includes(activeFilter.slice(6));
  if(activeFilter.indexOf("topic:")===0) return w.status!=="熟悉"&&arr(w.topics).includes(activeFilter.slice(6));
  if(activeFilter.indexOf("difficulty:")===0) return w.status!=="熟悉"&&String(w.difficulty||"")===activeFilter.slice(11);
  return w.status!=="熟悉";
}

function passFilter(w){return passFilterWith(filter,w)}

function current(){
  const l=list();
  if(!l.length)return null;
  if(!l.some(function(w){return w.originalIndex===index})&&!restoreFocusWord) applyIndexForFilter(filter);
  return activePool()[index]||null;
}

function syncResponsiveMode(){
  const narrow=!!(window.matchMedia&&window.matchMedia("(max-width: 900px)").matches);
  document.body.classList.toggle("mobile-mode",narrow&&mobileMode);
}

let topToolsViewport="";
let topToolsCollapsed=false;
function topToolsViewportKey(){
  const compactDesktop=!!(window.matchMedia&&window.matchMedia("(min-width: 901px) and (max-height: 900px)").matches);
  if(compactDesktop)return"compact-desktop";
  return window.matchMedia&&window.matchMedia("(max-width: 900px)").matches?"mobile":"desktop";
}
function applyTopToolsState(){
  if(!els.top||!els.topToolsToggle)return;
  els.top.classList.toggle("is-tools-collapsed",topToolsCollapsed);
  els.topToolsToggle.setAttribute("aria-expanded",topToolsCollapsed?"false":"true");
}
function syncTopToolsMode(force){
  const viewport=topToolsViewportKey();
  if(!force&&viewport===topToolsViewport)return;
  topToolsViewport=viewport;
  const saved=localStorage.getItem(TOP_TOOLS_PREF_PREFIX+viewport);
  topToolsCollapsed=saved===null?(viewport==="mobile"||viewport==="compact-desktop"):saved==="1";
  applyTopToolsState();
}

function applyMobileMode(){
  syncResponsiveMode();
  if(els.mobileModeBtn) els.mobileModeBtn.textContent=mobileMode?"普通模式":"手机模式";
  persistSoon();
}

function browserSpeak(text,label){
  const value=String(text||"").trim();
  if(!value||!("speechSynthesis" in window)){toast("没有可播放音频");return}
  try{
    window.speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(value);
    u.lang="en-US";
    u.rate=.88;
    u.pitch=1;
    u.onstart=function(){toast("浏览器发音："+(label||"音频"))};
    u.onerror=function(){toast("浏览器发音失败")};
    window.speechSynthesis.speak(u);
  }catch(e){toast("浏览器发音失败")}
}



function containsCjk(text){
  return /[\u3400-\u9fff]/.test(String(text||""));
}

function getEnglishExampleText(w){
  const candidates=[
    w&&w.example,
    w&&w.exampleEn,
    w&&w.englishExample,
    w&&w.sentence,
    w&&w.sentenceEn
  ];

  for(let i=0;i<candidates.length;i++){
    const text=String(candidates[i]||"").trim();
    if(text&&text!=="等待例句"&&!containsCjk(text)) return text;
  }

  return "";
}

function playCurrentWordAudio(source){
  const w=current();
  if(!w||!w.word){
    toast("当前没有单词");
    return;
  }
  const text=w.word||"";
  toast("发音单词："+text);
  play(w.audio,text,text);
}

function playCurrentExampleAudio(){
  const w=current();
  if(!w){
    toast("当前没有英文例句");
    return;
  }

  const text=getEnglishExampleText(w);
  if(!text){
    toast("当前单词没有英文例句");
    return;
  }

  const audioPath=w.exampleAudio||w.example_audio||w.sentenceAudio||w.sentence_audio||"";
  toast("发音英文例句");

  // play(path,label,fallbackText)
  // 第三个参数才是真正给浏览器朗读的文字。
  // 这里必须传英文例句 text，不能传“例句”这个中文标签。
  play(audioPath,"英文例句",text);
}

function timeoutSignal(ms){
  if(!("AbortController" in window)) return {signal:null,cancel:function(){}};
  const controller=new AbortController();
  const timer=setTimeout(function(){try{controller.abort()}catch(e){}},ms);
  return {signal:controller.signal,cancel:function(){clearTimeout(timer)}};
}

async function cachedAudioUrl(path,timeoutMs){
  if(!path) throw new Error("no audio");
  if(audioUrlCache.has(path)) return audioUrlCache.get(path);
  let cache=null;
  let response=null;

  if("caches" in window){
    try{
      cache=await caches.open(AUDIO_CACHE_NAME);
      response=await cache.match(path);
    }catch(e){}
  }

  if(!response){
    const t=timeoutSignal(timeoutMs||1200);
    try{
      response=await fetch(path,{cache:"force-cache",signal:t.signal});
      t.cancel();
      if(!response.ok) throw new Error("audio fetch failed");
      if(cache){try{await cache.put(path,response.clone())}catch(e){}}
    }catch(e){
      t.cancel();
      throw e;
    }
  }

  const blob=await response.blob();
  const url=URL.createObjectURL(blob);
  audioUrlCache.set(path,url);
  return url;
}

async function play(path,label,fallbackText){
  const text=fallbackText||label||"";
  if(!path){browserSpeak(text,label);return}
  try{
    toast("正在加载 Edge TTS 音频");
    if(audio){audio.pause();audio.currentTime=0}
    if("speechSynthesis" in window) window.speechSynthesis.cancel();
    const url=await cachedAudioUrl(path,1200);
    audio=new Audio(url);
    await audio.play();
    toast("Edge TTS 音频："+(label||"音频"));
  }catch(e){
    browserSpeak(text,label);
  }
}

function prewarm(path){
  if(!path||!("caches" in window))return;
  const run=function(){cachedAudioUrl(path,2500).catch(function(){})};
  if("requestIdleCallback" in window) requestIdleCallback(run,{timeout:2500});
  else setTimeout(run,700);
}

function renderList(el,items){
  el.innerHTML="";
  arr(items).slice(0,3).forEach(function(x){
    const text=x.phrase||x.word||"";
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML='<button class="mini-sound">🔊</button><div><div class="en"></div><div class="zh"></div></div>';
    div.querySelector(".en").textContent=text;
    div.querySelector(".zh").textContent=x.chinese||x.meaning||"";
    div.querySelector("button").onclick=function(){play(x.audio,text,text)};
    el.appendChild(div);
  });
}

function renderCards(box,listEl,items,kind,w){
  listEl.innerHTML="";
  if(!items||!items.length){box.classList.add("hidden");return}
  box.classList.remove("hidden");
  items.slice(0,8).forEach(function(x){
    const word=x.word||"";
    const div=document.createElement("div");
    div.className="form-card";
    const type=kind==="form"?formTypeCn(x.type):posDisplay(x.pos||"词族");
    const desc=kind==="form"?word+" 是 "+(w.word||"")+(w.meaning?"（"+w.meaning+"）":"")+" 的"+formTypeCn(x.type):(x.meaning||"待补全释义");
    const hint=kind==="form"?formHint(x):"";
    div.innerHTML='<div class="card-head"><button class="mini-sound">🔊</button><b></b><em></em></div><div class="form-desc"></div><small></small>';
    div.querySelector("b").textContent=word;
    div.querySelector("em").textContent=type;
    div.querySelector(".form-desc").textContent=desc;
    div.querySelector("small").textContent=hint;
    div.querySelector("button").onclick=function(){play(x.audio,word,word)};
    listEl.appendChild(div);
  });
}


function renderEntryList(){
  if(!els.entryList)return;
  els.entryList.innerHTML="";
  ENTRY_GROUPS.forEach(function(group){
    const section=document.createElement("div");
    section.className="entry-section"+(group.highlight?" highlight":"");
    const title=document.createElement("div");
    title.className="entry-section-title";
    title.textContent=group.title;
    const grid=document.createElement("div");
    grid.className="entry-grid";

    group.items.forEach(function(item){
      const count=countForFilter(item.filter);
      const saved=(progress.positions||{})[item.filter]||"";
      const savedWord=saved?words.find(function(w){return norm(w.word)===saved}):null;
      const btn=document.createElement("button");
      btn.className="entry-btn"+(filter===item.filter?" active":"");
      btn.innerHTML='<span class="entry-title"></span><span class="entry-desc"></span><span class="entry-meta"></span>';
      btn.querySelector(".entry-title").textContent=item.title;
      btn.querySelector(".entry-desc").textContent=item.desc;
      btn.querySelector(".entry-meta").textContent=count+" 个"+(savedWord?" · "+savedWord.word:"");
      btn.onclick=function(){
        switchFilter(item.filter);
        if(els.entryPanel) els.entryPanel.classList.add("hidden");
      };
      grid.appendChild(btn);
    });

    section.appendChild(title);
    section.appendChild(grid);
    els.entryList.appendChild(section);
  });
}


function updateStatusCounts(){
  const familiarCount=words.filter(function(w){return w.status==="熟悉"}).length;
  const unfamiliarCount=words.filter(function(w){return w.status==="不熟"}).length;
  const knownBtn=document.getElementById("knownBtn");
  const unknownBtn=document.getElementById("unknownBtn");

  if(knownBtn){
    const span=knownBtn.querySelector("span");
    if(span) span.textContent=String(familiarCount);
    knownBtn.classList.toggle("has-count",familiarCount>0);
  }

  if(unknownBtn){
    const span=unknownBtn.querySelector("span");
    if(span) span.textContent=String(unfamiliarCount);
    unknownBtn.classList.toggle("has-count",unfamiliarCount>0);
  }
}

function render(){
  updateStatusCounts();
  renderEntryList();
  const l=list();
  const w=current();
  if(!w){
    els.word.textContent="完成";
    els.basic.textContent="当前范围没有待学习单词";
    els.loadInfo.textContent="可以切换分类或查看熟悉词库。";
    els.count.textContent="0 / 0";
    els.progressFill.style.width="0%";
    persistSoon();
    return;
  }

  els.word.textContent=w.word||"empty";
  els.basic.textContent=(w.phonetic||"等待音标")+" · "+posDisplay(w.pos)+" · "+(w.meaning||"等待释义");
  els.loadInfo.textContent=cloudbaseReady?"本地已保存，云端会自动同步。":"本地已保存；连接云同步后电脑手机可同步。";
  if(els.entryStatus) els.entryStatus.textContent="当前入口："+filterLabel(filter)+" · "+l.length+" 个词";
  els.example.textContent=w.example||"等待例句";
  els.exampleCn.textContent=w.exampleCn||"";
  els.favoriteBtn.textContent=w.favorite?"★":"☆";
  els.unknownBtn.classList.toggle("active-unknown",w.status==="不熟");
  els.unknownBtn.childNodes[0].nodeValue=w.status==="不熟"?"取消不熟 ":"不熟 ";
  els.unfamiliarAlert.classList.toggle("hidden",w.status!=="不熟");

  renderCards(els.formsBox,els.formsList,w.forms,"form",w);
  renderCards(els.familyBox,els.familyList,w.wordFamily,"family",w);
  renderList(els.collocations,w.collocations);
  renderList(els.phraseCollocations,w.phraseCollocations);

  const pos=Math.max(0,l.findIndex(function(x){return x.originalIndex===index}));
  els.count.textContent=(pos+1)+" / "+l.length;
  els.progressFill.style.width=(l.length?((pos+1)/l.length*100):0)+"%";
  prewarm(w.audio);
  persistSoon();
}

function step(n){
  restoreFocusWord="";
  const l=list();
  if(!l.length)return;
  const pos=Math.max(0,l.findIndex(function(x){return x.originalIndex===index}));
  index=l[(pos+n+l.length)%l.length].originalIndex;
  render();
  scheduleCloudSync();
}


function stopHoldStep(){
  holdStepDir=0;
  holdTouchActive=false;
  if(holdStepDelayTimer){
    clearTimeout(holdStepDelayTimer);
    holdStepDelayTimer=null;
  }
  if(holdStepTimer){
    clearInterval(holdStepTimer);
    holdStepTimer=null;
  }
}

function startHoldStep(dir){
  if(!dir)return;
  if(holdStepDir===dir&&holdStepTimer)return;
  stopHoldStep();
  holdStepDir=dir;
  step(dir);
  holdStepDelayTimer=setTimeout(function(){
    if(holdStepDir!==dir)return;
    holdStepTimer=setInterval(function(){
      if(holdStepDir!==dir){stopHoldStep();return}
      step(dir);
    },130);
  },380);
}

function mark(status){
  restoreFocusWord="";
  const beforeIndex=index;
  const w=current();
  if(!w)return;
  w.status=(status==="不熟"&&w.status==="不熟")?"":status;
  rememberWord(w);
  if(status==="熟悉"){
    // 修复：即使当前入口是“全部单词”，熟悉词仍然可见，也要强制跳过当前词。
    const l=list().filter(function(x){return x.originalIndex!==beforeIndex});
    const next=l.find(function(x){return x.originalIndex>beforeIndex})||l[0];
    if(next) index=next.originalIndex;
  }
  render();
  persistNow();
  scheduleCloudSync();
}


function setSyncStatus(text,on){
  if(els.syncStatus) els.syncStatus.textContent=text;
  if(els.syncBtn){
    els.syncBtn.classList.toggle("on",!!on);
    els.syncBtn.textContent=on?"已同步":"云同步";
  }
}

async function sha256Text(text){
  const value=String(text||"");
  if(window.crypto&&crypto.subtle){
    const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
    return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,"0")}).join("");
  }
  let h=0;
  for(let i=0;i<value.length;i++) h=((h<<5)-h+value.charCodeAt(i))|0;
  return "fallback_"+Math.abs(h);
}

function loadScriptOnce(url){
  return new Promise(function(resolve,reject){
    if(window.cloudbase||window.tcb) return resolve();
    const s=document.createElement("script");
    s.src=url+(url.indexOf("?")>=0?"&":"?")+"v="+APP_VERSION;
    s.async=true;
    s.onload=function(){resolve()};
    s.onerror=function(){
      try{s.remove()}catch(e){}
      reject(new Error("load failed: "+url));
    };
    document.head.appendChild(s);
  });
}

async function loadCloudBaseSdk(){
  if(window.cloudbase||window.tcb) return window.cloudbase||window.tcb;
  for(const url of CLOUDBASE_SDK_URLS){
    try{
      await loadScriptOnce(url);
      if(window.cloudbase||window.tcb) return window.cloudbase||window.tcb;
    }catch(e){}
  }
  throw new Error("CloudBase SDK 加载失败");
}

async function wait(ms){
  return new Promise(function(resolve){setTimeout(resolve,ms)});
}

async function getLoginStateSafe(auth){
  try{
    if(!auth||!auth.getLoginState) return null;
    return await auth.getLoginState();
  }catch(e){
    return null;
  }
}

async function cloudbaseLoginIfNeeded(app){
  const auth=app.auth({persistence:"local"});
  cloudbaseAuth=auth;

  async function hasLoginState(){
    const state=await getLoginStateSafe(auth);
    if(state&&state.credential) return true;
    if(state&&state.user) return true;
    if(state&&state.uid) return true;
    if(state&&state.loginType) return true;
    return false;
  }

  if(await hasLoginState()) return true;

  // 兼容不同 CloudBase Web SDK 的匿名登录方法。
  // 手机端有时加载到的 SDK 只有部分方法，所以这里逐个尝试，不再只依赖 signInWithAnonymous。
  const errors=[];
  const attempts=[
    {
      name:"auth.signInAnonymously",
      run:async function(){
        if(typeof auth.signInAnonymously==="function"){
          return await auth.signInAnonymously();
        }
        throw new Error("auth.signInAnonymously not found");
      }
    },
    {
      name:"auth.signInWithAnonymous",
      run:async function(){
        if(typeof auth.signInWithAnonymous==="function"){
          return await auth.signInWithAnonymous();
        }
        throw new Error("auth.signInWithAnonymous not found");
      }
    },
    {
      name:"auth.anonymousAuthProvider().signIn",
      run:async function(){
        if(typeof auth.anonymousAuthProvider==="function"){
          const provider=auth.anonymousAuthProvider();
          if(provider&&typeof provider.signIn==="function") return await provider.signIn();
        }
        throw new Error("auth.anonymousAuthProvider().signIn not found");
      }
    },
    {
      name:"auth.signInWithAuthProvider(auth.anonymousAuthProvider())",
      run:async function(){
        if(typeof auth.signInWithAuthProvider==="function"&&typeof auth.anonymousAuthProvider==="function"){
          const provider=auth.anonymousAuthProvider();
          return await auth.signInWithAuthProvider(provider);
        }
        throw new Error("auth.signInWithAuthProvider / anonymousAuthProvider not found");
      }
    },
    {
      name:"auth.signInWithAuthProvider(new AnonymousAuthProvider)",
      run:async function(){
        if(typeof auth.signInWithAuthProvider!=="function") throw new Error("auth.signInWithAuthProvider not found");
        const AuthProvider=(auth.AnonymousAuthProvider)||(app.AnonymousAuthProvider)||(window.cloudbase&&window.cloudbase.auth&&window.cloudbase.auth.AnonymousAuthProvider)||(window.tcb&&window.tcb.auth&&window.tcb.auth.AnonymousAuthProvider);
        if(typeof AuthProvider!=="function") throw new Error("AnonymousAuthProvider class not found");
        return await auth.signInWithAuthProvider(new AuthProvider());
      }
    }
  ];

  for(const item of attempts){
    try{
      await item.run();
      await wait(800);
      if(await hasLoginState()) return true;
      await wait(1200);
      if(await hasLoginState()) return true;

      // 有些 SDK 匿名登录成功但 getLoginState 返回空，尝试一次数据库读写时再判断。
      errors.push(item.name+": called but no loginState");
    }catch(e){
      errors.push(item.name+": "+(e&&e.message?e.message:String(e)));
    }
  }

  throw new Error("匿名登录失败。已尝试 "+attempts.map(function(x){return x.name}).join(" / ")+"。详细："+errors.join("；"));
}

async function initCloudBase(){
  if(cloudbaseReady&&cloudbaseDb)return true;
  try{
    const sdk=await loadCloudBaseSdk();
    const initFn=sdk.init?sdk.init.bind(sdk):null;
    if(!initFn) throw new Error("没有找到 CloudBase init");
    cloudbaseApp=initFn({env:window.VOCAB_CLOUDBASE_ENV_ID||"ielts-vocab-d1gymoilc5746f67a",region:window.VOCAB_CLOUDBASE_REGION||"ap-shanghai"});
    await cloudbaseLoginIfNeeded(cloudbaseApp);
    cloudbaseDb=cloudbaseApp.database();
    const finalState=await getLoginStateSafe(cloudbaseAuth);
    if(!finalState){
      throw new Error("匿名登录后仍没有登录态 credentials not found");
    }
    cloudbaseReady=true;
    return true;
  }catch(e){
    console.error("CloudBase init error",e);
    setCloudError("CloudBase 连接失败",e);
    return false;
  }
}

function progressForCloud(){
  persistNow();

  const deviceId=progress.deviceId||getDeviceId();
  const cleanedStatuses={};
  const src=progress.statuses||{};

  Object.keys(src).forEach(function(k){
    const item=src[k]||{};
    if(!k)return;

    cleanedStatuses[k]={
      status:item.status||"",
      favorite:!!item.favorite,
      // 旧本地状态没有单词级时间戳时，不强行写成“现在”，避免覆盖其他设备的新状态。
      updatedAt:typeof item.updatedAt==="number"?item.updatedAt:0,
      deviceId:item.deviceId||deviceId
    };
  });

  return {
    version:9,
    appVersion:APP_VERSION,
    envId:window.VOCAB_CLOUDBASE_ENV_ID||"ielts-vocab-d1gymoilc5746f67a",
    vocabId:getVocabId(),
    syncKey:cloudbaseDocId+"__"+getVocabId(),
    statuses:cleanedStatuses,
    currentWord:(currentRaw()?.word||progress.currentWord||""),
    currentWordUpdatedAt:progress.currentWordUpdatedAt||progress.updatedAt||Date.now(),
    filter:progress.filter||"all",
    positions:progress.positions||{},
    mobileMode:!!progress.mobileMode,
    updatedAt:Date.now(),
    deviceId:deviceId
  };
}


function mergeCloudRows(rows){
  const docs=(Array.isArray(rows)?rows:[])
    .filter(function(x){return x&&x.syncCodeHash===cloudbaseDocId&&((x.vocabId||"")===getVocabId())})
    .sort(function(a,b){return (a.updatedAt||a.createdAt||0)-(b.updatedAt||b.createdAt||0)});

  if(!docs.length)return null;

  const merged={
    version:9,
    appVersion:APP_VERSION,
    vocabId:getVocabId(),
    syncKey:cloudbaseDocId+"__"+getVocabId(),
    statuses:{},
    positions:{},
    currentWord:"",
    currentWordUpdatedAt:0,
    filter:"all",
    mobileMode:false,
    updatedAt:0,
    deviceId:"merged"
  };

  docs.forEach(function(row){
    const rowTime=Number(row.updatedAt||row.createdAt||0);
    const remoteStatuses=row.statuses||{};

    Object.keys(remoteStatuses).forEach(function(k){
      const raw=remoteStatuses[k];
      const item=(raw&&typeof raw==="object")?raw:{status:String(raw||""),favorite:false};
      const itemTime=typeof item.updatedAt==="number"?item.updatedAt:rowTime;
      const old=merged.statuses[k]||{};

      if(!old.updatedAt||itemTime>=(old.updatedAt||0)){
        merged.statuses[k]={
          status:item.status||"",
          favorite:!!item.favorite,
          updatedAt:itemTime||rowTime||0,
          deviceId:item.deviceId||row.deviceId||""
        };
      }
    });

    if(row.positions&&typeof row.positions==="object"){
      Object.keys(row.positions).forEach(function(k){
        if(row.positions[k]) merged.positions[k]=row.positions[k];
      });
    }

    const rowPositionTime=Number(row.currentWordUpdatedAt||row.updatedAt||row.createdAt||0);
    if(rowPositionTime>=merged.currentWordUpdatedAt){
      merged.currentWordUpdatedAt=rowPositionTime;
      if(row.currentWord) merged.currentWord=row.currentWord;
    }

    if(rowTime>=merged.updatedAt){
      merged.updatedAt=rowTime;
      if(row.filter) merged.filter=row.filter;
      if(typeof row.mobileMode==="boolean") merged.mobileMode=row.mobileMode;
      merged.deviceId=row.deviceId||merged.deviceId;
    }
  });

  return merged;
}

async function getCloudDoc(){
  if(!cloudbaseDb||!cloudbaseDocId) throw new Error("未连接同步码");

  const loginStateBeforeRead=await getLoginStateSafe(cloudbaseAuth);
  if(!loginStateBeforeRead) throw new Error("读取前没有登录态 credentials not found");

  const result=await cloudbaseDb
    .collection("vocab_progress")
    .where({syncCodeHash:cloudbaseDocId,vocabId:getVocabId()})
    .limit(1000)
    .get();

  const rows=(result&&Array.isArray(result.data)?result.data:[])
    .filter(function(x){return x&&x.syncCodeHash===cloudbaseDocId&&((x.vocabId||"")===getVocabId())});

  // 关键修复：同一个同步码下，读取全部设备记录并合并，不再只取最新一条。
  return mergeCloudRows(rows);
}

async function setCloudDoc(data){
  if(!cloudbaseDb||!cloudbaseDocId) throw new Error("未连接同步码");

  // 兼容 [READONLY]：
  // 每台设备只新增自己创建的进度记录，不去修改别的设备创建的记录。
  // 手机 / 电脑恢复时读取同一同步码下 updatedAt 最新的一条。
  const payload=Object.assign({
    syncCodeHash:cloudbaseDocId,
    vocabId:getVocabId(),
    syncKey:cloudbaseDocId+"__"+getVocabId(),
    deviceId:progress.deviceId||getDeviceId(),
    createdAt:Date.now()
  },data);

  const loginStateBeforeWrite=await getLoginStateSafe(cloudbaseAuth);
  if(!loginStateBeforeWrite) throw new Error("写入前没有登录态 credentials not found");
  await cloudbaseDb.collection("vocab_progress").add(payload);
}

function mergeCloudProgress(remote,forcePosition){
  if(!remote||typeof remote!=="object")return;

  const now=Date.now();
  const remoteUpdated=remote.updatedAt||0;
  const localUpdated=progress.updatedAt||0;
  const localStatuses=progress.statuses||{};
  const remoteStatuses=remote.statuses||{};

  Object.keys(remoteStatuses).forEach(function(k){
    const r=remoteStatuses[k]||{};
    const l=localStatuses[k]||{};
    const rTime=typeof r.updatedAt==="number"?r.updatedAt:remoteUpdated;
    const lTime=typeof l.updatedAt==="number"?l.updatedAt:0;

    if(rTime>=lTime){
      localStatuses[k]={
        status:r.status||"",
        favorite:!!r.favorite,
        updatedAt:rTime||remoteUpdated||now,
        deviceId:r.deviceId||"cloud"
      };
    }
  });

  progress.statuses=localStatuses;
  progress.positions=Object.assign({},remote.positions||{},progress.positions||{});

  const remotePositionTime=remote.currentWordUpdatedAt||remoteUpdated||0;
  const localPositionTime=progress.currentWordUpdatedAt||localUpdated||0;

  if((forcePosition||remotePositionTime>localPositionTime)&&remote.currentWord){
    progress.currentWord=remote.currentWord;
    progress.currentWordUpdatedAt=remotePositionTime||now;
    restoreFocusWord=remote.currentWord;
  }

  if(forcePosition||remoteUpdated>=localUpdated){
    if(remote.filter) progress.filter=remote.filter;
    if(typeof remote.mobileMode==="boolean") progress.mobileMode=remote.mobileMode;
    progress.updatedAt=Math.max(remoteUpdated||0,localUpdated||0,now);
  }else{
    progress.updatedAt=localUpdated||now;
  }

  progress.deviceId=progress.deviceId||getDeviceId();

  // 关键修复：
  // 这里不能调用 persistNow()，因为 persistNow 会读取 currentRaw()，
  // 又把本机当前屏幕正在显示的词覆盖回 progress.currentWord。
  // 云端恢复时应该直接保存合并后的 progress。
  try{
    safeLsSet(PROGRESS_KEY,JSON.stringify(progress));
  }catch(e){}

  applyProgressToWords();
}

function applyProgressToWords(){
  words=words.map(function(w){
    const x=progress.statuses[norm(w.word)];
    return Object.assign({},w,{status:x?.status||"",favorite:!!x?.favorite});
  });
  filter=progress.filter||filter||"all";
  mobileMode=!!progress.mobileMode;
  applyIndexForFilter(filter);
  buildFilterOptions();
  applyMobileMode();
  render();
}

async function connectCloudBase(){
  const code=(els.syncCodeInput.value||"").trim();
  if(code.length<6){toast("同步码至少 6 位");return false}
  localStorage.setItem(CLOUDBASE_SYNC_CODE_KEY,code);
  cloudbaseSyncCode=code;
  cloudbaseDocId="vocab_"+(await sha256Text("ielts-vocab:"+code)).slice(0,48);
  console.log("CloudBase env",window.VOCAB_CLOUDBASE_ENV_ID,window.VOCAB_CLOUDBASE_REGION); setSyncStatus("正在连接 CloudBase...",false);
  const ok=await initCloudBase();
  if(!ok)return false;
  setSyncStatus("已连接，可上传或恢复",true);
  startCloudAutoPull();
  return true;
}


function startCloudAutoPull(){
  if(!cloudbaseReady||!cloudbaseDocId)return;
  if(cloudPullTimer) clearInterval(cloudPullTimer);
  cloudPullTimer=setInterval(function(){
    if(!cloudbaseReady||!cloudbaseDocId)return;
    if(document.hidden)return;
    const now=Date.now();
    if(now-lastAutoCloudPullAt<25000)return;
    lastAutoCloudPullAt=now;
    cloudPull(true).catch(function(e){console.warn("auto cloud pull failed",e)});
  },30000);
}

function stopCloudAutoPull(){
  if(cloudPullTimer){
    clearInterval(cloudPullTimer);
    cloudPullTimer=null;
  }
}

async function cloudPull(silent){
  if(!cloudbaseDocId){
    const ok=await connectCloudBase();
    if(!ok)return;
  }
  try{
    const data=await getCloudDoc();
    if(data){
      mergeCloudProgress(data,!silent);
      setSyncStatus((silent?"已静默合并云端进度：":"已恢复云端当前进度：")+(progress.currentWord||"")+" ｜ "+new Date().toLocaleTimeString(),true);
      if(!silent) toast("已恢复云端当前进度");
    }else{
      setSyncStatus("当前词库云端暂无进度，可上传本机进度 ｜ 词库ID："+getVocabId(),true);
      if(!silent) toast("云端暂无进度");
    }
  }catch(e){
    console.error("CloudBase pull error",e); setCloudError("读取失败",e);
  }
}

async function cloudPush(){
  if(!cloudbaseDocId){
    const ok=await connectCloudBase();
    if(!ok)return;
  }
  try{
    await setCloudDoc(progressForCloud());
    setSyncStatus("已上传："+new Date().toLocaleTimeString(),true);
  }catch(e){
    console.error("CloudBase push error",e); setCloudError("上传失败",e);
  }
}

function scheduleCloudSync(){
  if(!cloudbaseReady||!cloudbaseDocId)return;
  clearTimeout(cloudSyncTimer);
  setSyncStatus("本地已更新，约 5 秒后自动上传...",true);
  cloudSyncTimer=setTimeout(cloudPush,5000);
}


if(els.editWordBtn){
  els.editWordBtn.onclick=openEditCurrentWord;
}
if(els.deleteWordBtn){
  els.deleteWordBtn.onclick=deleteCurrentWord;
}
if(els.editCloseBtn){
  els.editCloseBtn.onclick=function(){els.editPanel.classList.add("hidden")};
}
if(els.editCancelBtn){
  els.editCancelBtn.onclick=function(){els.editPanel.classList.add("hidden")};
}
if(els.editSaveBtn){
  els.editSaveBtn.onclick=saveEditCurrentWord;
}

if(els.entryBtn){
  els.entryBtn.onclick=function(){
    ensureIdictationPayload().finally(function(){
      renderEntryList();
      els.entryPanel.classList.remove("hidden");
    });
  };
}
if(els.entryCloseBtn){
  els.entryCloseBtn.onclick=function(){els.entryPanel.classList.add("hidden")};
}

els.syncBtn.onclick=function(){
  els.syncPanel.classList.remove("hidden");
  if(cloudbaseReady&&cloudbaseDocId){
    setSyncStatus("正在合并云端进度...",true);
    cloudPull(true).catch(function(e){console.warn("open panel cloud pull failed",e)});
  }
};
els.syncCloseBtn.onclick=function(){
  els.syncPanel.classList.add("hidden");
};
els.syncConnectBtn.onclick=function(){
  connectCloudBase().then(function(ok){
    if(ok){
      setSyncStatus("已连接，正在合并云端进度...",true);
      cloudPull(false).catch(function(e){console.warn("connect cloud pull failed",e)});
    }
  });
};
els.syncPullBtn.onclick=function(){
  cloudPull(false);
};
els.syncPushBtn.onclick=function(){
  cloudPush();
};
els.syncDisconnectBtn.onclick=function(){
  stopCloudAutoPull();
  cloudbaseReady=false;
  cloudbaseDocId="";
  cloudbaseSyncCode="";
  localStorage.removeItem(CLOUDBASE_SYNC_CODE_KEY);
  setSyncStatus("已断开",false);
  toast("已断开云同步");
};

document.getElementById("prevBtn").onclick=function(){step(-1)};
if(els.topToolsToggle) els.topToolsToggle.onclick=function(){
  topToolsCollapsed=!topToolsCollapsed;
  localStorage.setItem(TOP_TOOLS_PREF_PREFIX+topToolsViewportKey(),topToolsCollapsed?"1":"0");
  applyTopToolsState();
};
document.getElementById("shuffleBtn").onclick=function(){
  restoreFocusWord="";
  words=[...words].sort(function(){return Math.random()-.5});
  index=0;
  toast("已随机");
  render();
  scheduleCloudSync();
};
document.getElementById("knownBtn").onclick=function(){mark("熟悉")};
document.getElementById("unknownBtn").onclick=function(){mark("不熟")};
els.favoriteBtn.onclick=function(){
  const w=current();
  if(w){w.favorite=!w.favorite;rememberWord(w);render();persistNow();scheduleCloudSync()}
};
document.getElementById("wordSoundBtn").onclick=function(){const w=current();if(w)play(w.audio,w.word,w.word)};
els.word.onclick=function(){const w=current();if(w)play(w.audio,w.word,w.word)};
els.exampleSoundBtn.onclick=function(){const w=current();if(w)play(w.exampleAudio,w.example||"例句",w.example||w.word)};
els.filterSelect.onchange=function(e){
  switchFilter(e.target.value);
};
if(els.mobileModeBtn) els.mobileModeBtn.onclick=function(){
  mobileMode=!mobileMode;
  applyMobileMode();
  toast(mobileMode?"已进入手机模式":"已进入普通模式");
  scheduleCloudSync();
};
window.addEventListener("resize",function(){syncResponsiveMode();syncTopToolsMode(false)},{passive:true});

let sx=0,sy=0,st=0;
els.swipeArea.addEventListener("touchstart",function(e){
  const t=e.changedTouches[0];
  sx=t.clientX;
  sy=t.clientY;
  st=Date.now();
  suppressNextSwipe=false;

  const rect=els.swipeArea.getBoundingClientRect();
  const relX=t.clientX-rect.left;
  const dir=relX<rect.width/2?-1:1;

  if(holdStepDelayTimer) clearTimeout(holdStepDelayTimer);
  holdStepDelayTimer=setTimeout(function(){
    const w=current();
    if(!w)return;
    holdTouchActive=true;
    suppressNextSwipe=true;
    startHoldStep(dir);
    toast(dir>0?"长按连续下一个":"长按连续上一个");
  },520);
},{passive:true});

els.swipeArea.addEventListener("touchmove",function(e){
  const t=e.changedTouches[0];
  const dx=t.clientX-sx;
  const dy=t.clientY-sy;
  if(Math.abs(dx)>18||Math.abs(dy)>18){
    if(!holdTouchActive&&holdStepDelayTimer){
      clearTimeout(holdStepDelayTimer);
      holdStepDelayTimer=null;
    }
  }
},{passive:true});

els.swipeArea.addEventListener("touchend",function(e){
  const t=e.changedTouches[0];
  const dx=t.clientX-sx;
  const dy=t.clientY-sy;
  const dt=Date.now()-st;
  const wasHolding=holdTouchActive||suppressNextSwipe;
  stopHoldStep();

  if(wasHolding)return;

  if(dt<700&&Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.4){
    dx<0?step(1):step(-1);
  }
},{passive:true});

els.swipeArea.addEventListener("touchcancel",stopHoldStep,{passive:true});

window.addEventListener("keydown",function(e){
  const tag=e.target&&e.target.tagName?e.target.tagName.toLowerCase():"";
  const isTyping=tag==="input"||tag==="textarea"||tag==="select"||(e.target&&e.target.isContentEditable);
  if(isTyping||e.ctrlKey||e.metaKey||e.altKey)return;

  const key=e.key||"";
  const code=e.code||"";
  const isDelete=key==="Delete"||code==="Delete"||e.keyCode===46||e.which===46;
  const isZero=key==="0"||code==="Digit0"||code==="Numpad0";
  const isOne=key==="1"||code==="Digit1"||code==="Numpad1";
  const isTab=key==="Tab"||code==="Tab"||e.keyCode===9||e.which===9;
  const isSpace=key===" "||key==="Spacebar"||code==="Space"||e.keyCode===32||e.which===32;

  if(isTab&&!e.repeat){
    e.preventDefault();
    e.stopPropagation();
    playCurrentWordAudio("tab");
    return;
  }

  if(isSpace&&!e.repeat){
    e.preventDefault();
    e.stopPropagation();
    playCurrentExampleAudio();
    return;
  }

  if(isDelete&&!e.repeat){e.preventDefault();e.stopPropagation();deleteCurrentWord();return}
  if(isZero&&!e.repeat){e.preventDefault();e.stopPropagation();mark("熟悉");return}
  if(isOne&&!e.repeat){e.preventDefault();e.stopPropagation();mark("不熟");return}

  if(key==="ArrowLeft"||code==="ArrowLeft"){
    e.preventDefault();
    e.stopPropagation();
    startHoldStep(-1);
    return;
  }

  if(key==="ArrowRight"||code==="ArrowRight"){
    e.preventDefault();
    e.stopPropagation();
    startHoldStep(1);
    return;
  }
},true);

window.addEventListener("keyup",function(e){
  const key=e.key||"";
  const code=e.code||"";
  if(key==="ArrowLeft"||code==="ArrowLeft"||key==="ArrowRight"||code==="ArrowRight"){
    stopHoldStep();
  }
},true);

window.addEventListener("blur",stopHoldStep);

document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden"){persistNow();if(cloudbaseReady&&cloudbaseDocId)cloudPush()}});
window.addEventListener("pagehide",function(){persistNow();if(cloudbaseReady&&cloudbaseDocId)cloudPush()});
window.addEventListener("beforeunload",persistNow);

function registerSW(){
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js?v="+APP_VERSION).catch(function(){});
  }
}

async function boot(){
  const slowTimer=setTimeout(function(){
    els.basic.textContent="词库仍在加载，手机第一次打开会比较慢。";
    els.loadInfo.textContent="如果长时间停在 Loading，请刷新一次页面。";
  },5000);

  try{
    const savedCode=localStorage.getItem(CLOUDBASE_SYNC_CODE_KEY)||"";
    if(savedCode) els.syncCodeInput.value=savedCode;

    const [res,idictationRes]=await Promise.all([
      fetch("./data/words.json?v="+APP_VERSION,{cache:"force-cache"}),
      fetch("./data/idictation-frequency.json?v="+APP_VERSION,{cache:"force-cache"}).catch(function(){return null})
    ]);
    if(!res.ok) throw new Error("words json failed");
    const data=await res.json();
    words=Array.isArray(data.words)?data.words:data;
    if(idictationRes&&idictationRes.ok) idictationPayload=await idictationRes.json();
    else await ensureIdictationPayload();
    // 静态版不再保存完整 10000 词，只合并“修改过的单词”。
    safeLsRemove("static_vocab_words_v1");
    words=applyDeletedWords(applyWordEdits(words));
    vocabId=computeVocabId(words);
    loadProgress();
    buildFilterOptions();
    if(window.matchMedia&&window.matchMedia("(max-width: 900px)").matches&&!(progress.updatedAt>0)) mobileMode=true;
    applyMobileMode();
    syncTopToolsMode(true);
    render();
    registerSW();
    clearTimeout(slowTimer);
    if(savedCode){
      connectCloudBase().then(function(ok){ if(ok){ cloudPull(); startCloudAutoPull(); } }).catch(function(){});
    }else{
      setSyncStatus("未连接",false);
    }
  }catch(e){
    clearTimeout(slowTimer);
    els.word.textContent="加载失败";
    els.basic.textContent="没有成功读取 data/words.json";
    els.loadInfo.textContent="请确认 GitHub Pages 已上传 data/words.json，并在手机上刷新页面。";
  }
}

boot();
`;

const STATIC_SW_JS = `const CACHE_NAME="static_vocab_shell_${STATIC_EXPORT_VERSION}";
const AUDIO_CACHE_NAME="static_vocab_audio_${STATIC_EXPORT_VERSION}";
const SHELL=[
  "./",
  "./index.html",
  "./spelling.html",
  "./basic.html",
  "./meaning.html",
  "./reading-g.html",
  "./assets/style.css?v=${STATIC_EXPORT_VERSION}",
  "./assets/app.js?v=${STATIC_EXPORT_VERSION}",
  "./assets/spelling.css?v=${STATIC_EXPORT_VERSION}",
  "./assets/spelling.js?v=${STATIC_EXPORT_VERSION}",
  "./assets/basic.js?v=${STATIC_EXPORT_VERSION}",
  "./assets/meaning-static.js?v=${STATIC_EXPORT_VERSION}",
  "./assets/reading-g.js?v=${STATIC_EXPORT_VERSION}",
  "./sync-config.js?v=${STATIC_EXPORT_VERSION}",
  "./data/words.json",
  "./data/phrases.json",
  "./data/idictation-frequency.json",
  "./data/basic-words.json",
  "./data/reading-g-vocab.json",
  "./data/reading-g-paraphrases.json",
  "./data/reading-g-import-report.json",
  "./manifest.webmanifest?v=${STATIC_EXPORT_VERSION}"
];

self.addEventListener("install",function(event){
  event.waitUntil(caches.open(CACHE_NAME).then(function(cache){return cache.addAll(SHELL)}).catch(function(){}));
  self.skipWaiting();
});

self.addEventListener("activate",function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(key){return key.indexOf("static_vocab_shell_")===0&&key!==CACHE_NAME}).map(function(key){return caches.delete(key)}));
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch",function(event){
  const req=event.request;
  const url=new URL(req.url);

  if(req.method!=="GET") return;
  if(url.hostname.indexOf("qq.com")>=0||url.hostname.indexOf("cloudbase")>=0||url.hostname.indexOf("tencent")>=0||url.hostname.indexOf("static.cloudbase.net")>=0||url.hostname.indexOf("jsdelivr")>=0||url.hostname.indexOf("unpkg")>=0) return;

  if(url.pathname.indexOf("/audio/")>=0){
    event.respondWith(
      caches.open(AUDIO_CACHE_NAME).then(function(cache){
        return cache.match(req).then(function(cached){
          if(cached) return cached;
          return fetch(req).then(function(res){
            if(res&&res.ok) cache.put(req,res.clone()).catch(function(){});
            return res;
          });
        });
      })
    );
    return;
  }

  if(url.pathname.endsWith("/index.html")||url.pathname.endsWith("/")||url.pathname.indexOf("/assets/")>=0||url.pathname.indexOf("/data/words.json")>=0||url.pathname.indexOf("/data/phrases.json")>=0||url.pathname.indexOf("/data/idictation-frequency.json")>=0||url.pathname.indexOf("/data/basic-words.json")>=0||url.pathname.indexOf("/data/meaning-6000.json")>=0||url.pathname.indexOf("/data/reading-g-vocab.json")>=0||url.pathname.indexOf("/data/reading-g-paraphrases.json")>=0||url.pathname.indexOf("/data/reading-g-import-report.json")>=0||url.pathname.endsWith("/spelling.html")||url.pathname.endsWith("/basic.html")||url.pathname.endsWith("/meaning.html")||url.pathname.endsWith("/reading-g.html")||url.pathname.endsWith("/manifest.webmanifest")||url.pathname.endsWith("/sync-config.js")){
    event.respondWith(
      fetch(req).then(function(res){
        if(res&&res.ok) caches.open(CACHE_NAME).then(function(cache){cache.put(req,res.clone()).catch(function(){})});
        return res;
      }).catch(function(){
        return caches.match(req);
      })
    );
  }
});
`;

const STATIC_MANIFEST_JSON = `{
  "name": "IELTS Vocab 静态学习版",
  "short_name": "IELTS Vocab",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#f7f2e8",
  "theme_color": "#f7f2e8",
  "orientation": "portrait"
}`;

const STATIC_SYNC_CONFIG_JS = `// 腾讯云 CloudBase 云同步配置
// 已按你的环境填写。
// envId: ielts-vocab-d1gymoilc5746f67a
// region: ap-shanghai

window.VOCAB_CLOUDBASE_ENV_ID = "ielts-vocab-d1gymoilc5746f67a";
window.VOCAB_CLOUDBASE_REGION = "ap-shanghai";
`;

function buildExport(words, audioIndex, options = {}) {
  const includeAudioFiles = options.includeAudioFiles !== false;
  const scanAudioFallback = options.scanAudioFallback !== false;
  const audioFiles = new Map();

  function audioFor(text) {
    if (!includeAudioFiles) return "";

    const key = normalizeWord(text);
    const item = audioIndex[key];

    let filename = item?.filename || "";
    let sourcePath = filename ? path.join(audioCacheDir(), filename) : "";

    // 第一优先：audio-index.json 里有记录，并且文件真实存在。
    if ((!filename || !existsSync(sourcePath)) && scanAudioFallback) {
      // 第二优先：根据 Edge TTS 的文件名规则，直接扫描 .audio-cache 里的真实 mp3。
      // 这样即使 audio-index.json 漏记，也能把硬盘里已有的音频导出来。
      const found = findExistingEdgeTtsFile(text);

      if (found) {
        filename = found.filename;
        sourcePath = found.filepath;
      }
    }

    if (!filename || !sourcePath || !existsSync(sourcePath)) return "";

    const ext = path.extname(filename) || ".mp3";
    const target = `audio/${safeFilePart(text)}-${shortHash(filename)}${ext}`;

    if (includeAudioFiles && !audioFiles.has(target)) {
      audioFiles.set(target, readFileSync(sourcePath));
    }

    return target;
  }

  const exportWords = words
    .map(sanitizeWordItem)
    .filter((word) => word.word)
    .map((word) => {
      const forms = (Array.isArray(word.forms) ? word.forms : [])
        .map((form) => ({
          ...form,
          word: String(form?.word || "").trim(),
          audio: audioFor(form?.word)
        }))
        .filter((form) => form.word);

      const wordFamily = (Array.isArray(word.wordFamily) ? word.wordFamily : [])
        .map((family) => ({
          ...family,
          word: String(family?.word || "").trim(),
          audio: audioFor(family?.word)
        }))
        .filter((family) => family.word);

      const collocations = normalizePhraseItems(word.collocations).map((item) => ({
        ...item,
        audio: audioFor(item.phrase)
      }));

      const phraseCollocations = normalizePhraseItems(word.phraseCollocations).map((item) => ({
        ...item,
        audio: audioFor(item.phrase)
      }));

      return {
        ...word,
        audio: audioFor(word.word),
        exampleAudio: audioFor(word.example),
        forms,
        wordFamily,
        collocations,
        phraseCollocations
      };
    });

  const manifest = {
    title: "IELTS Vocab 主词库",
    exportedAt: new Date().toISOString(),
    count: exportWords.length,
    words: exportWords
  };

  // Phrase layer is intentionally separate from the main headword count.
  // It is exported for spelling.html and never merged into words.json statistics.
  const phraseManifest = readJson(publicAssetPath("data", "phrases.json"), {
    version: "phrase-layer-v1",
    count: 0,
    phrases: []
  });

  const basicManifest = readJson(publicAssetPath("data", "basic-words.json"), {
    version: "basic-zero-v1",
    count: 0,
    words: []
  });
  const meaningManifest = readJson(publicAssetPath("data", "meaning-6000.json"), {
    version: "meaning-6000",
    count: 0,
    items: []
  });

  const files = [
    {
      name: "index.html",
      data: STATIC_INDEX_HTML
    },
    {
      name: "spelling.html",
      data: readFileSync(publicAssetPath("spelling.html"), "utf-8")
    },
    {
      name: "basic.html",
      data: readFileSync(publicAssetPath("basic.html"), "utf-8")
    },
    {
      name: "meaning.html",
      data: readFileSync(publicAssetPath("meaning.html"), "utf-8")
    },
    {
      name: "reading-g.html",
      data: readFileSync(publicAssetPath("reading-g.html"), "utf-8")
    },
    {
      name: "assets/spelling.css",
      data: readFileSync(publicAssetPath("assets", "spelling.css"), "utf-8")
    },
    {
      name: "assets/spelling.js",
      data: readFileSync(publicAssetPath("assets", "spelling.js"), "utf-8")
    },
    {
      name: "assets/basic.js",
      data: readFileSync(publicAssetPath("assets", "basic.js"), "utf-8")
    },
    {
      name: "assets/meaning-static.js",
      data: readFileSync(publicAssetPath("assets", "meaning-static.js"), "utf-8")
    },
    {
      name: "assets/reading-g.js",
      data: readFileSync(publicAssetPath("assets", "reading-g.js"), "utf-8")
    },
    {
      name: "assets/style.css",
      data: STATIC_STYLE_CSS
    },
    {
      name: "assets/app.js",
      data: STATIC_APP_JS
    },
    {
      name: "sw.js",
      data: STATIC_SW_JS
    },
    {
      name: "manifest.webmanifest",
      data: STATIC_MANIFEST_JSON
    },
    {
      name: "sync-config.js",
      data: STATIC_SYNC_CONFIG_JS
    },
    {
      name: "data/words.json",
      data: JSON.stringify(manifest)
    },
    {
      name: "data/phrases.json",
      data: JSON.stringify(phraseManifest)
    },
    {
      name: "data/basic-words.json",
      data: JSON.stringify(basicManifest)
    },
    {
      name: "data/meaning-6000.json",
      data: JSON.stringify(meaningManifest)
    },
    {
      name: "data/reading-g-vocab.json",
      data: JSON.stringify(
        readJson(publicAssetPath("data", "reading-g-vocab.json"), {
          version: "reading-g-core-v3",
          count: 0,
          items: []
        })
      )
    },
    {
      name: "data/reading-g-paraphrases.json",
      data: JSON.stringify(
        readJson(publicAssetPath("data", "reading-g-paraphrases.json"), {
          version: "reading-g-core-v3-paraphrases",
          count: 0,
          groups: []
        })
      )
    },
    {
      name: "data/reading-g-import-report.json",
      data: JSON.stringify(
        readJson(publicAssetPath("data", "reading-g-import-report.json"), {
          datasetVersion: "reading-g-core-v3",
          summary: {}
        })
      )
    },
    {
      name: "data/idictation-frequency.json",
      data: JSON.stringify({
        batchSize: IDICTATION_FREQUENCY_BATCH_SIZE,
        meta: IDICTATION_FREQUENCY_META,
        sources: IDICTATION_FREQUENCY_SOURCES
      })
    },
    {
      name: "README.txt",
      data: `静态网站使用说明

1. 解压 static-site.zip。
2. 把里面所有文件上传到 GitHub Pages / 腾讯云静态托管。
3. 打开 index.html 即可使用主词库刷词。
4. 这个静态版不接 DeepSeek、不需要 .env.local；发音优先本地 audio 缓存，否则浏览器朗读。
5. 云同步使用腾讯云 CloudBase，只同步学习进度，不上传音频和词库。
6. 如果要更新词库：回到本地工作台补全内容和音频，再重新导出静态网站。

文件说明：
index.html          主词库刷单词入口
basic.html          零基础单词（独立词库）
reading-g.html      G类阅读提升（静态便携版：词义/短语/同义MCQ）
meaning.html        看词选意思 · 核心6000
spelling.html       独立拼写训练入口
assets/style.css    刷单词样式
assets/app.js       刷单词逻辑
assets/basic.js     零基础刷词逻辑
assets/reading-g.js G类阅读提升（含同义MCQ）
assets/meaning-static.js  选义训练逻辑
assets/spelling.css 拼写训练样式
assets/spelling.js  拼写训练逻辑
sw.js               离线缓存和音频缓存
manifest.webmanifest 主屏幕 App 配置
sync-config.js      CloudBase 云同步配置
data/words.json     主词库数据
data/phrases.json   独立短语层
data/basic-words.json  零基础词库
data/reading-g-vocab.json  G类阅读提升词库
data/reading-g-paraphrases.json  高可信同义关系
data/reading-g-import-report.json  导入审计报告
data/meaning-6000.json 选义训练词库
data/idictation-frequency.json  爱听写频率词表
audio/*.mp3         本地音频缓存
`
    }
  ];

  for (const [name, data] of audioFiles.entries()) {
    files.push({
      name,
      data
    });
  }

  return {
    zip: createZip(files),
    count: exportWords.length,
    audioCount: audioFiles.size
  };
}

export async function POST(req) {
  const guard = requireLocalAdmin(req);
  if (guard) return guard;

  try {
    const body = await req.json();
    const words = Array.isArray(body.words) ? body.words : [];

    if (!words.length) {
      return Response.json(
        {
          error: "没有可导出的词库"
        },
        { status: 400 }
      );
    }

    const audioIndex = readJson(audioIndexPath(), {});
    const url = new URL(req.url);
    const fastWithoutAudio = url.searchParams.get("audio") === "0";
    const result = buildExport(words, audioIndex, {
      includeAudioFiles: !fastWithoutAudio,
      scanAudioFallback: !fastWithoutAudio
    });

    return new Response(result.zip, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="static-site.zip"`,
        "X-Word-Count": String(result.count),
        "X-Audio-Count": String(result.audioCount)
      }
    });
  } catch (error) {
    return Response.json(
      {
        error: "导出静态网站失败",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}


export async function GET(req) {
  const guard = requireLocalRead(req);
  if (guard) return guard;

  try {
    const cached = readJson(exportCachePath(), {});
    const words = Array.isArray(cached.words) ? cached.words : [];

    if (!words.length) {
      return Response.json(
        {
          error: "没有可导出的发布缓存",
          detail: "请先打开 http://localhost:3000 一次，让网页自动把当前词库保存到发布缓存。"
        },
        { status: 400 }
      );
    }

    const audioIndex = readJson(audioIndexPath(), {});
    const url = new URL(req.url);
    const fastWithoutAudio = url.searchParams.get("audio") === "0";
    const result = buildExport(words, audioIndex, {
      includeAudioFiles: !fastWithoutAudio,
      scanAudioFallback: !fastWithoutAudio
    });

    return new Response(result.zip, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="static-site.zip"`,
        "X-Word-Count": String(result.count),
        "X-Audio-Count": String(result.audioCount),
        "X-Export-Source": "server-cache"
      }
    });
  } catch (error) {
    return Response.json(
      {
        error: "从发布缓存导出静态网站失败",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
