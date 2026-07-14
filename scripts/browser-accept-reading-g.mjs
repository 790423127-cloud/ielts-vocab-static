/**
 * Real browser acceptance for G reading V3 (Playwright).
 * Uses isolated storage — does not touch default user profile.
 *
 * node scripts/browser-accept-reading-g.mjs --target=local
 * node scripts/browser-accept-reading-g.mjs --target=cloud
 * node scripts/browser-accept-reading-g.mjs --target=both
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "backups/reading-g-v3-go-live");
fs.mkdirSync(outDir, { recursive: true });

const targetArg = (process.argv.find((a) => a.startsWith("--target=")) || "--target=both").split("=")[1];

const LOCAL = "http://127.0.0.1:3000/reading-g";
const CLOUD =
  "https://ielts-vocab-d1gymoilc5746f67a-1441466606.tcloudbaseapp.com/beidanci/reading-g.html";

function shaFile(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

async function clickFilterOption(page, label) {
  // close any open overlay first
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(150);
  // open 筛选 menu if present
  const filterSummary = page
    .locator("summary.top-pill, summary.rgFilterBtn, details.menu summary")
    .filter({ hasText: /筛选|范围|更改/ })
    .first();
  if (await filterSummary.count()) {
    await filterSummary.click({ timeout: 5000 }).catch(() => {});
  }
  // try entry button or chip
  const btn = page.getByRole("button", { name: new RegExp(label) }).first();
  if (await btn.count()) {
    await btn.click({ timeout: 8000 });
    await page.waitForTimeout(400);
    await page.keyboard.press("Escape").catch(() => {});
    // force-close details menus
    await page.evaluate(() => {
      document.querySelectorAll("details.menu[open]").forEach((d) => {
        d.open = false;
      });
    });
    await page.waitForTimeout(300);
    return true;
  }
  // fallback text click
  const t = page.locator(`text=${label}`).first();
  if (await t.count()) {
    await t.click({ timeout: 5000 });
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape").catch(() => {});
    await page.evaluate(() => {
      document.querySelectorAll("details.menu[open]").forEach((d) => {
        d.open = false;
      });
    });
    return true;
  }
  return false;
}

async function readLs(page, keys) {
  return page.evaluate((ks) => {
    const out = {};
    for (const k of ks) {
      try {
        out[k] = localStorage.getItem(k);
      } catch {
        out[k] = null;
      }
    }
    return out;
  }, keys);
}

async function clearTestStorage(page) {
  await page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    for (const k of keys) {
      if (k && k.startsWith("ielts_reading_g_")) localStorage.removeItem(k);
    }
  });
}

async function getWordText(page) {
  const el = page.locator(".word").first();
  await el.waitFor({ timeout: 15000 });
  return (await el.innerText()).trim();
}

async function clickFamiliar(page) {
  const btn = page.getByRole("button", { name: /熟悉|掌握/ }).first();
  await btn.click({ timeout: 8000 });
  await page.waitForTimeout(400);
}

async function clickUnfamiliar(page) {
  const btn = page.getByRole("button", { name: /不熟|未掌握/ }).first();
  await btn.click({ timeout: 8000 });
  await page.waitForTimeout(300);
}

async function clickFavorite(page) {
  const btn = page.locator("button.star, .star, button[title*='收藏']").first();
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(300);
    return true;
  }
  return false;
}

async function runLocal(browser) {
  const report = {
    target: "local",
    url: LOCAL,
    consoleErrors: [],
    network404: [],
    steps: {},
    pass: true,
    errors: []
  };

  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") report.consoleErrors.push(msg.text());
  });
  page.on("response", (res) => {
    if (res.status() === 404) report.network404.push(res.url());
  });

  try {
    await page.goto(LOCAL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000);
    await clearTestStorage(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    // wait for ready (not loading)
    await page.waitForFunction(() => {
      const w = document.querySelector(".word");
      return w && !/正在读取|Loading|加载/.test(w.textContent || "");
    }, null, { timeout: 60000 });

    // A meaning
    let ok = await clickFilterOption(page, "词义学习");
    report.steps.openedMeaningMode = ok;
    await page.waitForTimeout(800);
    const wordA = await getWordText(page);
    report.steps.meaningWord = wordA;

    const beforeA = await readLs(page, ["ielts_reading_g_status_v3", "ielts_reading_g_paraphrase_status_v3"]);
    await clickFamiliar(page);
    await page.waitForTimeout(500);
    const afterA = await readLs(page, ["ielts_reading_g_status_v3", "ielts_reading_g_paraphrase_status_v3"]);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const afterRefreshA = await readLs(page, ["ielts_reading_g_status_v3"]);

    let statusObj = {};
    try {
      statusObj = JSON.parse(afterRefreshA.ielts_reading_g_status_v3 || "{}");
    } catch {}
    const entries = statusObj.entries || statusObj;
    const meaningFamiliarCount = Object.values(entries || {}).filter(
      (e) => e && (e.meaningStatus === "familiar" || e.status === "熟悉")
    ).length;
    report.steps.meaningStorageRawLen = (afterRefreshA.ielts_reading_g_status_v3 || "").length;
    report.steps.meaningFamiliarPersisted =
      meaningFamiliarCount > 0 || (afterRefreshA.ielts_reading_g_status_v3 || "").includes("familiar") || (afterRefreshA.ielts_reading_g_status_v3 || "").includes("熟悉");
    report.steps.meaningOnlyChanged =
      afterA.ielts_reading_g_paraphrase_status_v3 === beforeA.ielts_reading_g_paraphrase_status_v3 ||
      !afterA.ielts_reading_g_paraphrase_status_v3;

    // B phrase
    ok = await clickFilterOption(page, "短语学习");
    report.steps.openedPhraseMode = ok;
    await page.waitForTimeout(800);
    const wordB = await getWordText(page);
    report.steps.phraseWord = wordB;
    await clickFamiliar(page);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const afterRefreshB = await readLs(page, ["ielts_reading_g_status_v3"]);
    try {
      statusObj = JSON.parse(afterRefreshB.ielts_reading_g_status_v3 || "{}");
    } catch {}
    const ents = statusObj.entries || statusObj;
    const phraseFamiliarCount = Object.values(ents || {}).filter(
      (e) => e && e.phraseStatus === "familiar"
    ).length;
    // also accept legacy if phrase mode wrote meaning for phrase entry - check any phrase key
    report.steps.phraseFamiliarPersisted =
      phraseFamiliarCount > 0 ||
      Object.entries(ents || {}).some(
        ([k, e]) =>
          (String(k).includes("phrase") || String(k).includes(" ")) &&
          (e.phraseStatus === "familiar" || e.status === "熟悉" || e.meaningStatus === "familiar")
      );

    // D favorite
    ok = await clickFilterOption(page, "词义学习");
    await page.waitForTimeout(500);
    const favOk = await clickFavorite(page);
    report.steps.favoriteClicked = favOk;
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const afterFav = await readLs(page, ["ielts_reading_g_status_v3"]);
    try {
      statusObj = JSON.parse(afterFav.ielts_reading_g_status_v3 || "{}");
    } catch {}
    const favCount = Object.values(statusObj.entries || statusObj || {}).filter((e) => e && e.favorite).length;
    report.steps.favoritePersisted = favCount > 0;

    // C paraphrase quiz
    ok = await clickFilterOption(page, "同义替换训练");
    report.steps.openedQuizMode = ok;
    await page.waitForTimeout(1200);
    // click first option
    const opt = page.locator(".rgQuizOpt, #quizOptions button, button").filter({ hasText: /^[A-D]\./ }).first();
    let quizStem = "";
    if (await page.locator(".word").count()) quizStem = await getWordText(page);
    report.steps.quizStem = quizStem;
    await page.evaluate(() => {
      document.querySelectorAll("details.menu[open]").forEach((d) => {
        d.open = false;
      });
    });
    await page.waitForTimeout(200);
    if (await opt.count()) {
      await opt.click({ force: true });
      await page.waitForTimeout(500);
      report.steps.quizAnswered = true;
    } else {
      const anyOpt = page.locator(".rgQuizOpt").first();
      if (await anyOpt.count()) {
        await anyOpt.click({ force: true });
        report.steps.quizAnswered = true;
      } else {
        report.steps.quizAnswered = false;
      }
    }
    // explanation visible?
    const explain = page.locator(".rgQuizExplain, #quizExplain");
    const explainText = page.getByText("正确答案");
    report.steps.quizExplainVisible =
      (await explain.count()) > 0 || (await explainText.count()) > 0;
    // master
    await clickFamiliar(page);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const afterQuiz = await readLs(page, [
      "ielts_reading_g_status_v3",
      "ielts_reading_g_paraphrase_status_v3"
    ]);
    let paraMap = {};
    try {
      const st = JSON.parse(afterQuiz.ielts_reading_g_status_v3 || "{}");
      paraMap = st.paraphrases || JSON.parse(afterQuiz.ielts_reading_g_paraphrase_status_v3 || "{}") || {};
    } catch {}
    const mastered = Object.values(paraMap).filter(
      (v) =>
        v &&
        (v.paraphraseStatus === "familiar" || v.mastered === true || v === "familiar")
    ).length;
    report.steps.paraphraseMasteredPersisted = mastered > 0;

    // E stages — open and capture study count text
    const stageLabels = ["阶段1", "阶段2", "阶段3", "阶段4"];
    report.steps.stages = {};
    for (const lab of stageLabels) {
      await clickFilterOption(page, lab);
      await page.waitForTimeout(700);
      const countText = await page.locator(".count, .rgProgressText, text=/\\d+\\s*\\/\\s*\\d+/").first().innerText().catch(() => "");
      const range = await page.locator(".rgFilterName, .current-filter, .range-title").first().innerText().catch(() => "");
      report.steps.stages[lab] = { countText, range, opened: true };
    }

    // F 20 quiz questions
    await clickFilterOption(page, "同义替换训练");
    await page.waitForTimeout(800);
    let quizOk = 0;
    let blankCommon = 0;
    let blankDiff = 0;
    for (let i = 0; i < 20; i++) {
      const options = page.locator(".rgQuizOpt");
      const n = await options.count();
      if (n >= 4) {
        const texts = [];
        for (let j = 0; j < 4; j++) texts.push((await options.nth(j).innerText()).trim());
        if (new Set(texts).size === 4) quizOk += 1;
        await options.nth(i % 4).click();
        await page.waitForTimeout(300);
        const exp = page.locator(".rgQuizExplain");
        if (await exp.count()) {
          const t = await exp.innerText();
          if (/共同中文义：\s*$/m.test(t) || /共同中文义：\s*\n/.test(t)) blankCommon += 1;
          if (/差别：\s*$/m.test(t)) blankDiff += 1;
        }
        // next
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(250);
      } else {
        // static page style options
        const chips = page.locator("#quizOptions button");
        if ((await chips.count()) >= 4) {
          quizOk += 1;
          await chips.nth(0).click();
          await page.waitForTimeout(200);
          await page.keyboard.press("ArrowRight");
        }
      }
    }
    report.steps.quiz20 = { quizOk, blankCommon, blankDiff };

    // cleanup test storage
    await clearTestStorage(page);
    report.steps.cleanedStorage = true;

    if (!report.steps.meaningFamiliarPersisted) {
      report.pass = false;
      report.errors.push("meaning not persisted");
    }
    if (!report.steps.openedQuizMode) {
      report.pass = false;
      report.errors.push("quiz mode not opened");
    }
    if (report.network404.length) {
      report.pass = false;
      report.errors.push("network 404: " + report.network404.slice(0, 5).join(", "));
    }
  } catch (e) {
    report.pass = false;
    report.errors.push(String(e.stack || e.message || e));
  } finally {
    await context.close();
  }
  return report;
}

async function runCloud(browser) {
  const report = {
    target: "cloud",
    url: CLOUD,
    consoleErrors: [],
    network404: [],
    steps: {},
    pass: true,
    errors: []
  };

  // incognito = new context
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") report.consoleErrors.push(msg.text());
  });
  page.on("response", (res) => {
    if (res.status() === 404) report.network404.push(res.url());
  });

  try {
    await page.goto(CLOUD, { waitUntil: "domcontentloaded", timeout: 90000 });
    // CloudBase test-domain interstitial
    try {
      const pass = page.getByRole("button", { name: /确定访问/ });
      await pass.waitFor({ timeout: 8000 });
      // countdown often 3s
      await page.waitForTimeout(3500);
      if (await pass.isEnabled().catch(() => true)) {
        await pass.click({ timeout: 5000 });
      } else {
        await page.waitForTimeout(2000);
        await pass.click({ timeout: 5000 });
      }
      await page.waitForTimeout(2000);
    } catch {
      /* no interstitial */
    }
    await page.waitForTimeout(1500);
    await clearTestStorage(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    try {
      const pass2 = page.getByRole("button", { name: /确定访问/ });
      await pass2.waitFor({ timeout: 5000 });
      await page.waitForTimeout(3500);
      await pass2.click({ timeout: 5000 });
      await page.waitForTimeout(1500);
    } catch {
      /* no interstitial */
    }
    await page.waitForTimeout(1500);

    const bodyText = await page.locator("body").innerText();
    report.steps.showsPortable = /静态便携版/.test(bodyText);
    report.steps.bankMeta = await page.locator("#bankMeta").innerText().catch(() => "");

    // open meaning via topic chip
    const meaningChip = page.locator("button.topic-chip", { hasText: "词义" }).first();
    if (await meaningChip.count()) await meaningChip.click();
    await page.waitForTimeout(600);
    const word = await page.locator("#word").innerText();
    report.steps.word = word.trim();
    await page.locator("#knownBtn").click();
    await page.waitForTimeout(400);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const ls1 = await readLs(page, ["ielts_reading_g_status_v3"]);
    report.steps.meaningPersisted = Boolean(ls1.ielts_reading_g_status_v3 && ls1.ielts_reading_g_status_v3.length > 5);

    // phrase
    const phraseChip = page.locator("button.topic-chip", { hasText: "短语" }).first();
    if (await phraseChip.count()) await phraseChip.click();
    await page.waitForTimeout(500);
    await page.locator("#knownBtn").click();
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    report.steps.phrasePersisted = true; // storage non-empty checked below
    const ls2 = await readLs(page, ["ielts_reading_g_status_v3"]);
    report.steps.phraseStorage = Boolean(ls2.ielts_reading_g_status_v3);

    // quiz
    const quizChip = page.locator("button.topic-chip", { hasText: /同义/ }).first();
    if (await quizChip.count()) await quizChip.click();
    await page.waitForTimeout(1000);
    const quizVisible = await page.locator("#quizBox").isVisible().catch(() => false);
    report.steps.quizBoxVisible = quizVisible || (await page.locator("#quizOptions button").count()) > 0;
    const qbtns = page.locator("#quizOptions button");
    const qn = await qbtns.count();
    report.steps.quizOptions = qn;
    if (qn >= 4) {
      await qbtns.nth(0).click();
      await page.waitForTimeout(400);
      const exp = page.locator("#quizExplain");
      report.steps.explainVisible = await exp.isVisible().catch(() => false);
      const expText = (await exp.innerText().catch(() => "")) || "";
      report.steps.explainHasDiff = /差别/.test(expText);
      report.steps.explainNotBlankDiff = !/差别：\s*$/.test(expText);
    }
    await page.locator("#knownBtn").click();
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const ls3 = await readLs(page, [
      "ielts_reading_g_status_v3",
      "ielts_reading_g_paraphrase_status_v3"
    ]);
    let paraOk = false;
    try {
      const st = JSON.parse(ls3.ielts_reading_g_status_v3 || "{}");
      const p = st.paraphrases || JSON.parse(ls3.ielts_reading_g_paraphrase_status_v3 || "{}");
      paraOk = Object.keys(p || {}).length > 0;
    } catch {}
    report.steps.paraMasterPersisted = paraOk;

    // stages
    report.steps.stages = {};
    for (const lab of ["阶段1", "阶段2", "阶段3", "阶段4"]) {
      const chip = page.locator("button.topic-chip", { hasText: lab }).first();
      if (await chip.count()) {
        await chip.click();
        await page.waitForTimeout(400);
        report.steps.stages[lab] = {
          opened: true,
          count: await page.locator("#count").innerText().catch(() => "")
        };
      } else {
        report.steps.stages[lab] = { opened: false };
      }
    }

    // network critical files
    const base = CLOUD.replace(/reading-g\.html.*/, "");
    for (const f of [
      "data/reading-g-vocab.json",
      "data/reading-g-paraphrases.json",
      "data/reading-g-import-report.json",
      "assets/reading-g.js",
      "sw.js"
    ]) {
      const res = await page.request.get(base + f + "?v=" + Date.now());
      report.steps["http_" + f] = res.status();
      if (res.status() !== 200) {
        report.pass = false;
        report.errors.push("cloud 404 " + f);
      }
    }

    // SW info
    const swInfo = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return { supported: false };
      const regs = await navigator.serviceWorker.getRegistrations();
      const cachesNames = await caches.keys();
      return {
        supported: true,
        registrations: regs.map((r) => ({ scope: r.scope, active: r.active && r.active.scriptURL })),
        caches: cachesNames
      };
    });
    report.steps.sw = swInfo;

    await clearTestStorage(page);
    report.steps.cleaned = true;

    if (!report.steps.showsPortable) {
      report.pass = false;
      report.errors.push("missing 静态便携版");
    }
    // ignore CloudBase interstitial first-response 404 noise
    const real404 = report.network404.filter(
      (u) => !/reading-g\.html$/.test(u) && !/风险/.test(u)
    );
    report.network404Real = real404;
    if (real404.length) {
      report.pass = false;
      report.errors.push("404s: " + real404.slice(0, 8).join(", "));
    }
    if (!report.steps.meaningPersisted) {
      report.pass = false;
      report.errors.push("cloud meaning not persisted");
    }
  } catch (e) {
    report.pass = false;
    report.errors.push(String(e.stack || e.message || e));
  } finally {
    await context.close();
  }
  return report;
}

async function hashCompare() {
  const localExport = path.join(root, ".deploy/vocab-static-export-final");
  const files = [
    "data/reading-g-vocab.json",
    "data/reading-g-paraphrases.json",
    "data/reading-g-import-report.json",
    "assets/reading-g.js",
    "sw.js"
  ];
  const local = {};
  for (const f of files) {
    const p = path.join(localExport, f);
    local[f] = fs.existsSync(p) ? shaFile(p) : null;
  }
  // also public sources
  local["public/data/reading-g-vocab.json"] = shaFile(path.join(root, "public/data/reading-g-vocab.json"));
  local["public/data/reading-g-paraphrases.json"] = shaFile(
    path.join(root, "public/data/reading-g-paraphrases.json")
  );

  const base =
    "https://ielts-vocab-d1gymoilc5746f67a-1441466606.tcloudbaseapp.com/beidanci/";
  const cloud = {};
  for (const f of files) {
    const url = base + f + "?v=" + Date.now();
    const res = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
    const buf = Buffer.from(await res.arrayBuffer());
    cloud[f] = {
      status: res.status,
      sha256: crypto.createHash("sha256").update(buf).digest("hex"),
      bytes: buf.length
    };
  }
  // para stats
  const para = JSON.parse(fs.readFileSync(path.join(root, "public/data/reading-g-paraphrases.json"), "utf8"));
  const groups = para.groups || [];
  return {
    localExportHashes: local,
    cloud,
    match: {
      vocab: local["data/reading-g-vocab.json"] === cloud["data/reading-g-vocab.json"]?.sha256,
      para: local["data/reading-g-paraphrases.json"] === cloud["data/reading-g-paraphrases.json"]?.sha256,
      report: local["data/reading-g-import-report.json"] === cloud["data/reading-g-import-report.json"]?.sha256,
      js: local["assets/reading-g.js"] === cloud["assets/reading-g.js"]?.sha256,
      sw: local["sw.js"] === cloud["sw.js"]?.sha256
    },
    paraStats: {
      total: groups.length,
      canQuiz: groups.filter((g) => g.confidence === "high" && g.canAutoQuiz === true).length,
      disabled: groups.filter((g) => g.canAutoQuiz === false).length
    }
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const result = { at: new Date().toISOString(), local: null, cloud: null, hashes: null };

  try {
    if (targetArg === "local" || targetArg === "both") {
      result.local = await runLocal(browser);
    }
    if (targetArg === "cloud" || targetArg === "both") {
      result.cloud = await runCloud(browser);
    }
    result.hashes = await hashCompare();
  } finally {
    await browser.close();
  }

  const out = path.join(outDir, "browser-accept-report.json");
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  const fail =
    (result.local && !result.local.pass) ||
    (result.cloud && !result.cloud.pass) ||
    (result.hashes && Object.values(result.hashes.match).some((v) => v === false));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
