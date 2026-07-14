/**
 * Full manual-style system audit after recent updates (read-only).
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import http from "http";
import https from "https";
import { fileURLToPath } from "url";
import { getQuizEligibleGroups } from "../app/lib/reading-g-vocab/paraphrase-quiz.mjs";
import {
  auditParaphraseQueuePipeline,
  PARA_SESSION_SIZE,
  simulateCoverageRounds,
  takeNextParaphraseSession
} from "../app/lib/reading-g-vocab/paraphrase-cycle.mjs";
import {
  countPhraseStages,
  countStageUniques,
  itemMatchesPathStage
} from "../app/lib/reading-g-vocab/stages.mjs";
import { normalizeReadingGItem } from "../app/lib/reading-g-vocab/load-reading-g.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outPath = path.join(
  "C:/Users/Administrator/Desktop",
  "G类阅读_更新后全面人工审计报告.txt"
);

function sha(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function get(url) {
  const lib = url.startsWith("https") ? https : http;
  return new Promise((resolve) => {
    const req = lib.get(url, { headers: { "Cache-Control": "no-cache" } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode, bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex"), text: buf.toString("utf8") });
      });
    });
    req.on("error", (e) => resolve({ status: 0, error: e.message, bytes: 0 }));
    req.setTimeout(20000, () => {
      req.destroy();
      resolve({ status: 0, error: "timeout", bytes: 0 });
    });
  });
}

function grepFile(file, patterns) {
  if (!exists(file)) return { missing: true };
  const t = read(file);
  const out = {};
  for (const p of patterns) out[p] = t.includes(p);
  return out;
}

const report = {
  at: new Date().toISOString(),
  findings: [],
  pass: [],
  warn: [],
  fail: []
};

function pass(msg) {
  report.pass.push(msg);
}
function warn(msg) {
  report.warn.push(msg);
}
function fail(msg) {
  report.fail.push(msg);
}

// —— data ——
const vocab = JSON.parse(read("public/data/reading-g-vocab.json"));
const para = JSON.parse(read("public/data/reading-g-paraphrases.json"));
const master = JSON.parse(read("public/data/words.json"));
const meaning = JSON.parse(read("public/data/meaning-6000.json"));
const basic = JSON.parse(read("public/data/basic-words.json"));
const items = (vocab.items || []).map((e, i) => normalizeReadingGItem(e, i)).filter(Boolean);
const groups = para.groups || [];
const eligible = getQuizEligibleGroups(groups);
const disabled = groups.filter((g) => g.canAutoQuiz === false);
const pipe = auditParaphraseQueuePipeline(groups, { sessionSize: 10 });
const stages = countStageUniques(items);
const phrases = countPhraseStages(items);

const data = {
  total: items.length,
  active: items.filter((i) => i.studyMode !== "reference").length,
  ref: items.filter((i) => i.studyMode === "reference").length,
  words: items.filter((i) => i.entryType === "word").length,
  phrases: items.filter((i) => i.entryType === "phrase").length,
  multi: items.filter((i) => (i.senses || []).length > 1).length,
  phrases400: items.filter((i) => (i.layers || []).includes("phrases400")).length,
  phraseStage1: phrases.phraseStage1Count,
  phraseStage2: phrases.phraseStage2Count,
  paraGroups: groups.length,
  eligible: eligible.length,
  disabled: disabled.length,
  emptyCommonWhileAuto: groups.filter(
    (g) => g.confidence === "high" && g.canAutoQuiz === true && !String(g.commonMeaningZh || "").trim()
  ).length,
  stages,
  master: (master.words || []).length,
  meaning: (meaning.items || []).length,
  basic: (basic.words || basic.items || []).length,
  missWordPh: items.filter((i) => i.entryType === "word" && !String(i.phonetic || "").trim()).length,
  missPhrasePh: items.filter(
    (i) => (i.entryType === "phrase" || /\s/.test(i.word || "")) && !String(i.phonetic || "").trim()
  ).length
};

if (data.total === 4978) pass("词条总数 4978");
else fail(`词条总数异常 ${data.total}`);
if (data.active === 4348 && data.ref === 630) pass("active/reference 4348/630");
else fail(`active/ref ${data.active}/${data.ref}`);
if (data.words === 4310 && data.phrases === 668) pass("单词/词组 4310/668");
else fail(`word/phrase ${data.words}/${data.phrases}`);
if (data.paraGroups === 300) pass("同义关系 300 组");
else fail(`para ${data.paraGroups}`);
if (data.eligible === 233) pass("可自动出题 233");
else warn(`可自动出题 ${data.eligible}（期望 233）`);
if (data.disabled === 67) pass("关闭自动出题 67");
else warn(`disabled ${data.disabled}`);
if (data.emptyCommonWhileAuto === 0) pass("可出题组均有 commonMeaningZh");
else fail(`可出题却无 commonMeaning: ${data.emptyCommonWhileAuto}`);
if (data.phraseStage1 === 200 && data.phraseStage2 === 200) pass("短语前后 200/200");
else fail(`phrase stages ${data.phraseStage1}/${data.phraseStage2}`);
if (data.master === 13808 && data.meaning === 6000 && data.basic === 1500)
  pass("主库/meaning/basic 规模未变");
else fail("主库/meaning/basic 规模异常");

// stage pure ref
let pureRef = 0;
for (const it of items) {
  const layers = it.layers || [];
  if (layers.length && layers.every((l) => l === "reference701") && it.studyMode === "reference")
    pureRef += 1;
}
if (pureRef === 630) pass("纯 reference-only 630");
else warn(`纯 reference-only ${pureRef}`);

// —— feature parity ——
const nextPage = read("app/reading-g/page.jsx");
const staticJs = read("public/assets/reading-g.js");
const staticHtml = read("public/reading-g.html");
const exportRoute = read("app/api/export-static/route.js");

const features = {
  next: {
    arrowKeys: /ArrowLeft|ArrowRight/.test(nextPage),
    takeNext: nextPage.includes("takeNextParaphraseSession"),
    noHard80: !/Math\.min\(\s*80\s*,/.test(nextPage),
    threeStatus: nextPage.includes("meaningStatus") || nextPage.includes("RG_LEARN_MODE"),
    coverageKey: nextPage.includes("readRgParaCoverage") || nextPage.includes("writeRgParaCoverage"),
    quizModes: nextPage.includes("guided") && nextPage.includes("quick")
  },
  static: {
    arrowKeys: /ArrowLeft|ArrowRight/.test(staticJs) && staticJs.includes("keydown"),
    sessionSizes: staticJs.includes("guided: 10") || staticJs.includes("guided:10"),
    noHard60: !/quizQueue\.length\s*<\s*60/.test(staticJs),
    coverageKey: staticJs.includes("para_coverage") || staticJs.includes("COVERAGE_KEY"),
    portableLabel: staticHtml.includes("静态便携版"),
    jsVersion: (staticHtml.match(/reading-g\.js\?v=([^"']+)/) || [])[1] || ""
  },
  export: {
    paraphrases: exportRoute.includes("reading-g-paraphrases.json"),
    report: exportRoute.includes("reading-g-import-report.json"),
    version: (exportRoute.match(/STATIC_EXPORT_VERSION\s*=\s*"([^"]+)"/) || [])[1] || ""
  }
};

if (features.next.arrowKeys) pass("Next 左右键");
else fail("Next 缺少左右键");
if (features.static.arrowKeys) pass("静态 左右键");
else fail("静态 缺少左右键");
if (features.next.noHard80) pass("Next 无硬编码 Math.min(80)");
else fail("Next 仍有 Math.min(80)");
if (features.static.noHard60) pass("静态 无 hard 60 截断");
else fail("静态仍有 length<60");
if (features.next.takeNext) pass("Next 覆盖调度 takeNextParaphraseSession");
else warn("Next 未引用 takeNextParaphraseSession");
if (features.export.paraphrases && features.export.report) pass("export-static 含 paraphrases+report");
else fail("export-static 缺 paraphrases/report");

// session sizes
if (PARA_SESSION_SIZE.guided === 10 && PARA_SESSION_SIZE.quick === 20 && PARA_SESSION_SIZE.full === 80)
  pass("会话 10/20/80 常量");
else fail("会话常量异常");

// coverage sim
const sim = simulateCoverageRounds(groups, 40, 10, () => 0.37);
if (sim.coversAll && sim.finalUnique === eligible.length)
  pass(`覆盖模拟：${sim.roundsRun} 轮盖满 ${sim.finalUnique}`);
else warn(`覆盖模拟未盖满 unique=${sim.finalUnique}`);

// first batch size
const batch = takeNextParaphraseSession(groups, {}, null, {
  sessionMode: "guided",
  sessionSize: 10,
  rng: () => 0.5
});
if (batch.poolSize === eligible.length && batch.questions.length <= 10 && batch.questions.length > 0)
  pass(`引导批次数 ${batch.questions.length} / 池 ${batch.poolSize}`);
else warn(`引导批次异常 q=${batch.questions.length} pool=${batch.poolSize}`);

// shared component
const satelliteCallers = [];
for (const f of ["app/reading-g/page.jsx", "app/basic/page.jsx", "app/meaning/page.jsx", "app/meaning-en/page.jsx"]) {
  if (!exists(f)) continue;
  if (read(f).includes("SatelliteLexiconFlashcard")) satelliteCallers.push(f);
}
if (satelliteCallers.includes("app/reading-g/page.jsx") && satelliteCallers.includes("app/basic/page.jsx"))
  pass("Satellite 调用: reading-g + basic");
if (satelliteCallers.some((f) => f.includes("meaning")))
  warn("meaning 也用了 Satellite（需回归）");
else pass("meaning 未依赖 Satellite");

// libs present
const libs = [
  "app/lib/reading-g-vocab/paraphrase-quiz.mjs",
  "app/lib/reading-g-vocab/paraphrase-cycle.mjs",
  "app/lib/reading-g-vocab/storage.mjs",
  "app/lib/reading-g-vocab/migration.mjs",
  "app/lib/reading-g-vocab/stages.mjs"
];
for (const l of libs) {
  if (exists(l)) pass(`库文件存在 ${path.basename(l)}`);
  else fail(`缺库 ${l}`);
}

// optional advanced modules
const advanced = [
  "app/lib/reading-g-vocab/paraphrase-session.mjs",
  "app/lib/reading-g-vocab/paraphrase-review.mjs"
];
for (const l of advanced) {
  if (exists(l)) pass(`扩展模块存在 ${path.basename(l)}`);
  else warn(`扩展模块不存在 ${path.basename(l)}（可接受若未合入）`);
}

// local endpoints
const localHome = await get("http://127.0.0.1:3000/");
const localRg = await get("http://127.0.0.1:3000/reading-g");
const localBasic = await get("http://127.0.0.1:3000/basic");
const localMeaning = await get("http://127.0.0.1:3000/meaning");
const localVocab = await get("http://127.0.0.1:3000/data/reading-g-vocab.json");
const localPara = await get("http://127.0.0.1:3000/data/reading-g-paraphrases.json");

if (localHome.status === 200) pass("本地 / 200");
else fail(`本地 / ${localHome.status || localHome.error}`);
if (localRg.status === 200) pass("本地 /reading-g 200");
else fail(`本地 /reading-g ${localRg.status || localRg.error}`);
if (localBasic.status === 200) pass("本地 /basic 200");
else warn(`本地 /basic ${localBasic.status}`);
if (localMeaning.status === 200) pass("本地 /meaning 200");
else warn(`本地 /meaning ${localMeaning.status}`);
if (localVocab.status === 200 && localPara.status === 200) pass("本地 vocab+para JSON 200");
else fail("本地 data JSON 失败");

// cloud
const cloudBase =
  "https://ielts-vocab-d1gymoilc5746f67a-1441466606.tcloudbaseapp.com/beidanci";
const cloudFiles = [
  "/reading-g.html",
  "/assets/reading-g.js",
  "/data/reading-g-vocab.json",
  "/data/reading-g-paraphrases.json",
  "/data/reading-g-import-report.json",
  "/sw.js"
];
const cloud = {};
for (const f of cloudFiles) {
  cloud[f] = await get(cloudBase + f);
  if (cloud[f].status === 200) pass(`云端 ${f} 200 (${cloud[f].bytes} B)`);
  else fail(`云端 ${f} ${cloud[f].status || cloud[f].error}`);
}

const cloudHtml = cloud["/reading-g.html"]?.text || "";
const cloudJs = cloud["/assets/reading-g.js"]?.text || "";
const cloudScript = (cloudHtml.match(/reading-g\.js\?v=[^"']+/) || [])[0] || "";
if (cloudJs.includes("ArrowRight") && cloudJs.includes("keydown")) pass("云端 JS 含左右键");
else fail("云端 JS 缺少键盘导航");
if (cloudHtml.includes("静态便携版") || cloudJs.includes("静态便携版")) pass("云端便携版标识");
else warn("云端未见静态便携版字样");
if (cloudScript.includes("d20") || cloudScript.includes("keyboard"))
  pass(`云端 script 版本 ${cloudScript}`);
else warn(`云端 script 版本 ${cloudScript || "未知"}`);

// hash compare public vs cloud (note export minify may differ for vocab)
const localParaSha = sha(path.join(root, "public/data/reading-g-paraphrases.json"));
const localJsSha = sha(path.join(root, "public/assets/reading-g.js"));
const cloudParaSha = cloud["/data/reading-g-paraphrases.json"]?.sha256;
const cloudJsSha = cloud["/assets/reading-g.js"]?.sha256;

if (localJsSha === cloudJsSha) pass("本地 public reading-g.js hash = 云端");
else warn(`JS hash 不一致 local=${localJsSha.slice(0, 12)} cloud=${(cloudJsSha || "").slice(0, 12)}（CDN/未部署最新？）`);

if (localParaSha === cloudParaSha) pass("本地 public paraphrases hash = 云端");
else {
  // check canQuiz count from cloud body
  try {
    const cg = JSON.parse(cloud["/data/reading-g-paraphrases.json"].text);
    const ce = getQuizEligibleGroups(cg.groups || []);
    warn(
      `paraphrases hash 不一致；云端 groups=${(cg.groups || []).length} eligible=${ce.length} bytes=${cloud["/data/reading-g-paraphrases.json"].bytes}`
    );
    if (ce.length !== 233) fail(`云端可出题 ${ce.length} ≠ 233`);
    else pass("云端 eligible 仍为 233（内容可能仅序列化差异）");
  } catch {
    fail("云端 paraphrases 无法解析");
  }
}

// SW version
const swText = cloud["/sw.js"]?.text || "";
const swVer = (swText.match(/static_vocab_shell_([^\"]+)/) || [])[1] || "";
const swHasPara = swText.includes("reading-g-paraphrases.json");
const swHasReport = swText.includes("reading-g-import-report.json");
if (swHasPara) pass("SW SHELL 含 paraphrases");
else fail("SW 缺 paraphrases");
if (swHasReport) pass("SW SHELL 含 import-report");
else warn("SW 缺 import-report");
if (swVer) pass(`SW 版本 shell_${swVer}`);
else warn("未能解析 SW 版本");

// parity gaps static vs next
const parity = [];
if (nextPage.includes("paraphrase-session") || exists("app/lib/reading-g-vocab/paraphrase-session.mjs")) {
  if (!staticJs.includes("currentLearningStage") && !staticJs.includes("para-stage"))
    parity.push("Next 有 paraphrase-session 学习阶段，静态可能更简");
  else parity.push("静态亦有多阶段同义学习痕迹");
}
if (nextPage.includes("wrongReview") || staticJs.includes("wrongReview"))
  parity.push("存在错题复习相关逻辑");
// keyboard: both have
// coverage: both have

// layer stats
const layerIds = [
  "priority1500",
  "answerCore250",
  "logic120",
  "phrases400",
  "tierB1200",
  "paraCore600",
  "tierC800",
  "paraExt500",
  "reference701"
];
const layerCounts = {};
for (const id of layerIds) {
  layerCounts[id] = items.filter((i) => (i.layers || []).includes(id)).length;
}

// write report
const lines = [];
const L = (s = "") => lines.push(s);

L("G类阅读提升 · 更新后全面人工审计报告");
L("=".repeat(80));
L(`生成时间: ${report.at}`);
L("项目: Desktop/ielts-vocab-deepseek-edge-tts");
L("范围: 数据基线 / 同义训练 / 键盘 / 正式站 vs 静态 / 本地&云端 / 工程健康");
L("");
L("一、总评");
L("-".repeat(80));
L(`通过项: ${report.pass.length}`);
L(`警告项: ${report.warn.length}`);
L(`失败项: ${report.fail.length}`);
if (report.fail.length === 0) {
  L("结论: 核心数据与主路径健康；详见警告与部署一致性建议。");
} else {
  L("结论: 存在失败项，需优先处理。");
}
L("");
L("二、数据基线");
L("-".repeat(80));
L(JSON.stringify(data, null, 2));
L("");
L("层标签计数:");
L(JSON.stringify(layerCounts, null, 2));
L("");
L("三、功能矩阵（正式 Next vs 静态）");
L("-".repeat(80));
L(JSON.stringify(features, null, 2));
L("");
L("四、同义训练池与会话");
L("-".repeat(80));
L(`总关系 300 | 可训 ${eligible.length} | 关闭 ${disabled.length}`);
L(`会话常量: guided=${PARA_SESSION_SIZE.guided} quick=${PARA_SESSION_SIZE.quick} full=${PARA_SESSION_SIZE.full}`);
L(`截断前池: ${pipe.sessionPoolBeforeLimit}`);
L(`历史 Next 上限痕迹: ${pipe.historicalNextLimit} | 历史静态: ${pipe.historicalStaticLimit}`);
L(`覆盖模拟(每轮10): rounds=${sim.roundsRun} coversAll=${sim.coversAll} unique=${sim.finalUnique}`);
L(`样例引导批: questions=${batch.questions.length} pool=${batch.poolSize}`);
L("");
L("五、本地服务");
L("-".repeat(80));
L(`/: ${localHome.status}  /reading-g: ${localRg.status}  /basic: ${localBasic.status}  /meaning: ${localMeaning.status}`);
L(`data vocab: ${localVocab.status} (${localVocab.bytes})  para: ${localPara.status} (${localPara.bytes})`);
L("");
L("六、云端 /beidanci");
L("-".repeat(80));
for (const f of cloudFiles) {
  const c = cloud[f];
  L(`${f}: status=${c.status} bytes=${c.bytes} sha=${(c.sha256 || "").slice(0, 16)}…`);
}
L(`HTML script: ${cloudScript}`);
L(`local public js sha: ${localJsSha}`);
L(`cloud js sha:        ${cloudJsSha}`);
L(`local public para:   ${localParaSha}`);
L(`cloud para:          ${cloudParaSha}`);
L(`SW version: ${swVer}`);
L("");
L("七、共享组件与模块");
L("-".repeat(80));
L(`Satellite 调用页: ${satelliteCallers.join(", ") || "无"}`);
L(`parity notes: ${parity.join(" | ") || "无"}`);
L("");
L("八、通过列表");
L("-".repeat(80));
report.pass.forEach((m, i) => L(`  [P${i + 1}] ${m}`));
L("");
L("九、警告列表");
L("-".repeat(80));
if (!report.warn.length) L("  （无）");
report.warn.forEach((m, i) => L(`  [W${i + 1}] ${m}`));
L("");
L("十、失败列表");
L("-".repeat(80));
if (!report.fail.length) L("  （无）");
report.fail.forEach((m, i) => L(`  [F${i + 1}] ${m}`));
L("");
L("十一、风险与建议（人工）");
L("-".repeat(80));
L("1. 若云端 paraphrases/js hash 与本地 public 不一致，请全量 export-static 后 tcb 部署 /beidanci。");
L("2. 腾讯云测试域名有「风险提醒」，无痕访问需点「确定访问」。");
L("3. 静态同义为多阶段学习时，左右键在 quiz 的 feedback 阶段才前进（go 逻辑），词义/短语模式左右键正常。");
L("4. 缺音标单词约 " + data.missWordPh + " 个、词组 " + data.missPhrasePh + " 个：不伪造可接受。");
L("5. 本地若 3000 打不开，运行 IELTS-AutoStart/start-vocab.ps1 或 npm run start。");
L("6. SW 版本若仍为 d15/d16 旧壳，建议再导一次静态包覆盖 sw.js。");
L("");
L("十二、建议验收操作（人工 5 分钟）");
L("-".repeat(80));
L("本地 http://127.0.0.1:3000/reading-g");
L("  - 词义：左右键切换；熟悉后刷新仍在");
L("  - 同义：显示安全题库 233；本轮 10；做完下一批累计增加");
L("  - 阶段1～4 可进；阶段4 查阅");
L("云端 reading-g.html 无痕 + 强刷");
L("  - 确认 script v=d20_keyboard 或更新；左右键可用");
L("  - bankMeta 含 同义/安全题库 与 233");
L("");
L("=".repeat(80));
L(`审计结束 · fail=${report.fail.length} warn=${report.warn.length} pass=${report.pass.length}`);

fs.writeFileSync(outPath, lines.join("\n"), "utf8");
fs.writeFileSync(
  path.join(root, "backups/reading-g-v3-final-audit/full-manual-audit-latest.json"),
  JSON.stringify(
    {
      at: report.at,
      data,
      features,
      layerCounts,
      pipe,
      sim,
      local: { home: localHome.status, rg: localRg.status },
      cloud: Object.fromEntries(
        cloudFiles.map((f) => [f, { status: cloud[f].status, bytes: cloud[f].bytes, sha: cloud[f].sha256 }])
      ),
      pass: report.pass,
      warn: report.warn,
      fail: report.fail
    },
    null,
    2
  )
);

console.log(
  JSON.stringify(
    {
      outPath,
      pass: report.pass.length,
      warn: report.warn.length,
      fail: report.fail.length,
      eligible: data.eligible,
      disabled: data.disabled,
      localRg: localRg.status,
      cloudHtml: cloud["/reading-g.html"]?.status,
      jsHashMatch: localJsSha === cloudJsSha,
      paraHashMatch: localParaSha === cloudParaSha,
      swVer,
      htmlVer: features.static.jsVersion
    },
    null,
    2
  )
);
