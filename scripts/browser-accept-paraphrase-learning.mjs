import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const outDir = path.join(root, "output", "playwright");
fs.mkdirSync(outDir, { recursive: true });
const base = process.env.READING_G_BASE || "http://127.0.0.1:3000";
const staticBase = process.env.READING_G_STATIC_BASE || base;
const paraData = JSON.parse(fs.readFileSync(path.join(root, "public/data/reading-g-paraphrases.json"), "utf8"));
const byId = new Map(paraData.groups.map((group) => [group.groupId, group]));
const errors = [];
const notFound = [];

function watch(page, scope) {
  page.on("console", (message) => {
    if (message.type() === "error") errors.push({ scope, text: message.text() });
  });
  page.on("response", (response) => {
    if (response.status() === 404) notFound.push({ scope, url: response.url() });
  });
  page.on("pageerror", (error) => errors.push({ scope, text: error.message }));
}

async function sessionInfo(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("ielts_reading_g_paraphrase_session_v1") || "null"));
}

async function chooseQuizOption(page, shouldBeCorrect) {
  const session = await sessionInfo(page);
  const groupId = session.currentSessionGroupIds[session.currentIndex];
  const group = byId.get(groupId);
  const own = new Set([group.anchor, ...(group.members || [])].map((value) => value.trim().toLowerCase()));
  const buttons = page.locator("button").filter({ hasText: /^[A-D]\./ });
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    const text = (await button.innerText()).replace(/^[A-D]\.\s*/, "").trim().toLowerCase();
    const isOwn = own.has(text);
    if (isOwn === shouldBeCorrect) {
      await button.click();
      return { groupId, selected: text };
    }
  }
  throw new Error(`No ${shouldBeCorrect ? "correct" : "wrong"} option for ${groupId}`);
}

async function finishCurrentSession(page) {
  for (let guard = 0; guard < 50; guard += 1) {
    if (await page.getByText("本轮总结", { exact: true }).count()) return guard;
    if (await page.getByText("阶段 1 · 关系预览", { exact: true }).count()) {
      await page.getByRole("button", { name: "开始回忆" }).click();
      continue;
    }
    if (await page.getByText("阶段 2 · 主动回忆", { exact: true }).count()) {
      if (await page.getByRole("button", { name: "显示答案" }).count()) await page.getByRole("button", { name: "显示答案" }).click();
      await page.getByRole("button", { name: "会", exact: true }).click();
      continue;
    }
    if (await page.getByText(/四选一验证/).count()) {
      await chooseQuizOption(page, true);
      continue;
    }
    if (await page.getByText(/验证反馈/).count()) {
      await page.getByRole("button", { name: "下一题" }).click();
      continue;
    }
    await page.waitForTimeout(50);
  }
  throw new Error("Session did not reach summary");
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
watch(page, "next-desktop");
await page.goto(`${base}/reading-g`, { waitUntil: "networkidle" });
await page.evaluate(() => {
  localStorage.clear();
  const sentinel = { legacy_sentinel: { paraphraseStatus: "unfamiliar", mastered: false, at: "before" } };
  localStorage.setItem("ielts_reading_g_paraphrase_status_v3", JSON.stringify(sentinel));
  localStorage.setItem("ielts_reading_g_status_v3", JSON.stringify({ progressSchemaVersion: 4, entries: {}, paraphrases: sentinel }));
});
await page.reload({ waitUntil: "networkidle" });

await page.locator("summary").filter({ hasText: "筛选" }).click();
await page.getByRole("button", { name: /引导学习·每轮10组/ }).first().click();
await page.getByText("同义替换训练 · 安全题库233组", { exact: false }).first().waitFor();
if (await page.locator("details.menu[open]").count()) throw new Error("Filter panel remained open");
await page.getByText("阶段 1 · 关系预览", { exact: true }).waitFor();
await page.getByRole("button", { name: "开始回忆" }).click();
await page.getByRole("button", { name: "显示答案" }).click();
await page.getByRole("button", { name: "不会", exact: true }).click();
let stored = await sessionInfo(page);
if (!stored.wrongReinsertQueue.length) throw new Error("dontKnow was not reinserted");

await page.getByRole("button", { name: "开始回忆" }).click();
await page.getByRole("button", { name: "显示答案" }).click();
await page.getByRole("button", { name: "模糊", exact: true }).click();
stored = await sessionInfo(page);
if (!stored.uncertainReinsertQueue.length) throw new Error("uncertain was not reinserted");

await page.getByRole("button", { name: "开始回忆" }).click();
await page.getByRole("button", { name: "显示答案" }).click();
await page.getByRole("button", { name: "会", exact: true }).click();
const wrong = await chooseQuizOption(page, false);
await page.getByText("阶段 3 · 验证反馈", { exact: true }).waitFor();
const wrongReview = await page.evaluate((groupId) => {
  const review = JSON.parse(localStorage.getItem("ielts_reading_g_paraphrase_review_v1") || "{}");
  const status = JSON.parse(localStorage.getItem("ielts_reading_g_paraphrase_status_v3") || "{}");
  return { review: review.groups?.[groupId], status: status[groupId] };
}, wrong.groupId);
if (wrongReview.review?.wrongCount !== 1 || wrongReview.status?.paraphraseStatus !== "unfamiliar") throw new Error("Wrong answer metadata/status missing");

const beforeReload = await sessionInfo(page);
await page.reload({ waitUntil: "networkidle" });
await page.getByText("继续上次同义学习", { exact: true }).waitFor();
const sentinelAfterReload = await page.evaluate(() => JSON.parse(localStorage.getItem("ielts_reading_g_paraphrase_status_v3") || "{}").legacy_sentinel);
if (sentinelAfterReload?.paraphraseStatus !== "unfamiliar") throw new Error("Legacy paraphraseStatus changed");
await page.getByRole("button", { name: "继续", exact: true }).click();
const afterReload = await sessionInfo(page);
if (afterReload.currentIndex !== beforeReload.currentIndex || afterReload.currentLearningStage !== beforeReload.currentLearningStage) throw new Error("Session did not resume exact stage");

await finishCurrentSession(page);
await page.getByText("累计覆盖", { exact: false }).first().waitFor();
await page.screenshot({ path: path.join(outDir, "paraphrase-d19-next-desktop-summary.png"), fullPage: true });

await page.locator("summary").filter({ hasText: "筛选" }).click();
await page.getByRole("button", { name: /快速测验·每轮20题/ }).first().click();
await page.getByText(/本轮 1 \/ 20/).waitFor();
const quickSession = await sessionInfo(page);
const quickId = quickSession.currentSessionGroupIds[0];
await chooseQuizOption(page, true);
const quickStatus = await page.evaluate((groupId) => JSON.parse(localStorage.getItem("ielts_reading_g_paraphrase_status_v3") || "{}")[groupId], quickId);
if (quickStatus?.paraphraseStatus === "familiar") throw new Error("One quick guess incorrectly mastered relation");

await page.locator("summary").filter({ hasText: "筛选" }).click();
await page.getByRole("button", { name: /完整测验·每轮80题/ }).first().click();
await page.getByText(/本轮 1 \/ 80/).waitFor();

const nextMetrics = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, coverage: JSON.parse(localStorage.getItem("ielts_reading_g_para_coverage_v1") || "{}"), review: JSON.parse(localStorage.getItem("ielts_reading_g_paraphrase_review_v1") || "{}") }));

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mobilePage = await mobile.newPage();
watch(mobilePage, "next-mobile");
await mobilePage.goto(`${base}/reading-g`, { waitUntil: "networkidle" });
await mobilePage.locator("summary").filter({ hasText: "筛选" }).click();
await mobilePage.getByRole("button", { name: /引导学习·每轮10组/ }).first().click();
await mobilePage.getByText("阶段 1 · 关系预览", { exact: true }).waitFor();
const mobileMetrics = await mobilePage.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
await mobilePage.screenshot({ path: path.join(outDir, "paraphrase-d19-next-mobile-preview.png"), fullPage: true });
await mobile.close();

const staticContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const staticPage = await staticContext.newPage();
watch(staticPage, "static-local");
await staticPage.goto(`${staticBase}/reading-g.html`, { waitUntil: "networkidle" });
await staticPage.evaluate(() => localStorage.clear());
await staticPage.reload({ waitUntil: "networkidle" });
await staticPage.getByRole("button", { name: "引导学习·10组" }).click();
await staticPage.getByText("阶段 1 · 关系预览", { exact: true }).waitFor();
await staticPage.getByRole("button", { name: "开始回忆" }).click();
await staticPage.getByRole("button", { name: "显示答案" }).click();
await staticPage.getByRole("button", { name: "会", exact: true }).click();
await staticPage.locator("button.para-option").first().click();
await staticPage.reload({ waitUntil: "networkidle" });
await staticPage.getByText("继续上次同义学习", { exact: true }).waitFor();
const staticMetrics = await staticPage.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, session: JSON.parse(localStorage.getItem("ielts_reading_g_paraphrase_session_v1") || "null") }));
await staticPage.screenshot({ path: path.join(outDir, "paraphrase-d19-static-mobile-resume.png"), fullPage: true });
await staticContext.close();

await context.close();
await browser.close();

const report = {
  ok: errors.length === 0 && notFound.length === 0 && nextMetrics.scrollWidth === nextMetrics.width && mobileMetrics.scrollWidth === mobileMetrics.width && staticMetrics.scrollWidth === staticMetrics.width,
  next: { guidedStages: ["preview", "recall", "quiz", "feedback", "summary"], wrongReinsert: true, uncertainReinsert: true, exactResume: true, quickSize: 20, fullSize: 80, oldStatusPreserved: true, oneQuickCorrectNotMastered: true, metrics: nextMetrics },
  mobile: mobileMetrics,
  static: { guidedStages: true, resumeOffer: true, metrics: staticMetrics },
  errors,
  notFound,
  screenshots: ["paraphrase-d19-next-desktop-summary.png", "paraphrase-d19-next-mobile-preview.png", "paraphrase-d19-static-mobile-resume.png"]
};
fs.mkdirSync(path.join(root, "reports"), { recursive: true });
fs.writeFileSync(path.join(root, "reports", "paraphrase-learning-browser-acceptance.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, errors: report.errors.length, notFound: report.notFound.length, nextOverflow: nextMetrics.scrollWidth - nextMetrics.width, mobileOverflow: mobileMetrics.scrollWidth - mobileMetrics.width, staticOverflow: staticMetrics.scrollWidth - staticMetrics.width, screenshots: report.screenshots }, null, 2));
if (!report.ok) process.exitCode = 1;
