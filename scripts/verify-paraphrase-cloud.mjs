import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const exportRoot = path.join(root, ".deploy", "vocab-static-export");
const reportPath = path.join(root, "reports", "paraphrase-cloud-acceptance.json");
const base = process.env.READING_G_CLOUD_BASE ||
  "https://ielts-vocab-d1gymoilc5746f67a-1441466606.tcloudbaseapp.com/beidanci";
const version = "20260712_d19_paraphrase_learning_v1";
const files = [
  "reading-g.html",
  "assets/reading-g.js",
  "data/reading-g-paraphrases.json",
  "data/reading-g-import-report.json",
  "sw.js"
];

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function fetchUncached(relativePath) {
  const separator = relativePath.includes("?") ? "&" : "?";
  const response = await fetch(`${base}/${relativePath}${separator}v=${version}&t=${Date.now()}`, {
    headers: { "cache-control": "no-cache", pragma: "no-cache" }
  });
  return { response, buffer: Buffer.from(await response.arrayBuffer()) };
}

const hashes = [];
for (const relativePath of files) {
  const local = fs.readFileSync(path.join(exportRoot, relativePath));
  let remote;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    remote = await fetchUncached(relativePath);
    if (remote.response.ok && sha256(remote.buffer) === sha256(local)) break;
    if (attempt < 12) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  hashes.push({
    file: relativePath,
    status: remote.response.status,
    localSha256: sha256(local),
    cloudSha256: sha256(remote.buffer),
    match: sha256(remote.buffer) === sha256(local)
  });
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const consoleErrors = [];
const notFound = [];
await page.goto(`${base}/reading-g.html?v=${version}&t=${Date.now()}`, { waitUntil: "networkidle" });
if ((await page.title()) === "风险提醒") {
  const proceed = page.getByRole("button", { name: /确定访问/ });
  await proceed.waitFor();
  await proceed.click({ timeout: 10000 });
  await page.waitForLoadState("networkidle");
}
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("response", (response) => {
  if (response.status() === 404) notFound.push(response.url());
});
await page.evaluate(() => localStorage.clear());
await page.evaluate(() => {
  localStorage.setItem("ielts_reading_g_paraphrase_status_v3", JSON.stringify({
    legacy_cloud_sentinel: { paraphraseStatus: "unfamiliar", mastered: false, at: "before" }
  }));
});
await page.reload({ waitUntil: "networkidle" });
await page.getByText(/同义训练仅使用安全题库233组/).waitFor();
const modeLabelsVisible = await page.getByRole("button", { name: "快速测验·20题" }).isVisible() &&
  await page.getByRole("button", { name: "完整测验·80题" }).isVisible();
const expressionLabelsVisible = await page.getByRole("button", { name: "表达识别核心·1006个表达" }).isVisible() &&
  await page.getByRole("button", { name: "表达识别扩展·500个表达" }).isVisible();
await page.getByRole("button", { name: "引导学习·10组" }).click();
await page.getByText("阶段 1 · 关系预览", { exact: true }).waitFor();
await page.getByRole("button", { name: "开始回忆" }).click();
await page.getByRole("button", { name: "显示答案" }).click();
await page.getByRole("button", { name: "不会", exact: true }).click();
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("ielts_reading_g_paraphrase_session_v1") || "null"));
await page.reload({ waitUntil: "networkidle" });
await page.locator("#paraResume").click();
let reachedSummary = false;
for (let guard = 0; guard < 100; guard += 1) {
  if (await page.locator("#paraContinue").count()) {
    reachedSummary = true;
    break;
  }
  if (await page.locator("#paraStartRecall").count()) await page.locator("#paraStartRecall").click();
  else if (await page.locator("#paraReveal").count()) await page.locator("#paraReveal").click();
  else if (await page.locator('[data-rating="know"]').count()) await page.locator('[data-rating="know"]').click();
  else if (await page.locator("button.para-option:not([disabled])").count()) await page.locator("button.para-option:not([disabled])").first().click();
  else if (await page.locator("#paraNext").count()) await page.locator("#paraNext").click();
  else await page.waitForTimeout(50);
}
const completedSession = await page.evaluate(() => JSON.parse(localStorage.getItem("ielts_reading_g_paraphrase_session_v1") || "null"));
const summaryVisible = reachedSummary && await page.getByText("本轮总结", { exact: true }).isVisible();
const summaryButtons = reachedSummary ? await page.locator("#quizBox button").allInnerTexts() : [];
const summaryActionsVisible = summaryButtons.includes("返回词义学习");
await page.locator("#paraContinue").click();
const nextSession = await page.evaluate(() => JSON.parse(localStorage.getItem("ielts_reading_g_paraphrase_session_v1") || "null"));
const legacyStatusPreserved = await page.evaluate(() => {
  const status = JSON.parse(localStorage.getItem("ielts_reading_g_paraphrase_status_v3") || "{}");
  return status.legacy_cloud_sentinel?.at === "before";
});
const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
const screenshot = path.join(root, "output", "playwright", "paraphrase-d19-cloud-mobile-summary.png");
await page.screenshot({ path: screenshot, fullPage: true });
await browser.close();

const report = {
  generatedAt: new Date().toISOString(),
  base,
  version,
  hashes,
  browser: {
    safePoolVisible: true,
    modeLabelsVisible,
    expressionLabelsVisible,
    guidedSessionSize: stored?.baseGroupCount || 0,
    scheduledTasksAfterReinsert: stored?.currentSessionGroupIds?.length || 0,
    wrongReinserted: Boolean(stored?.wrongReinsertQueue?.length),
    refreshResume: true,
    reachedSummary: summaryVisible,
    summaryActionsVisible,
    summaryButtons,
    continuedToNextBatch: Boolean(nextSession?.sessionId && nextSession.sessionId !== completedSession?.sessionId),
    legacyStatusPreserved,
    overflow,
    consoleErrors,
    notFound,
    screenshot: path.relative(root, screenshot).replaceAll("\\", "/")
  }
};
report.ok = hashes.every((item) => item.status === 200 && item.match) &&
  report.browser.guidedSessionSize === 10 && report.browser.wrongReinserted &&
  report.browser.modeLabelsVisible && report.browser.expressionLabelsVisible &&
  report.browser.refreshResume && report.browser.reachedSummary && report.browser.summaryActionsVisible &&
  report.browser.continuedToNextBatch && report.browser.legacyStatusPreserved &&
  overflow === 0 && consoleErrors.length === 0 && notFound.length === 0;
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  ok: report.ok,
  hashMatches: hashes.filter((item) => item.match).length,
  hashTotal: hashes.length,
  browser: report.browser
}, null, 2));
if (!report.ok) process.exitCode = 1;
