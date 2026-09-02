import { test, expect } from "@playwright/test";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { POST } from "../../app/api/export-static/route.js";
import {
  readStoredZipEntries,
  STATIC_RESPONSIVE_VERSION,
  STATIC_SWIPE_ENGINE
} from "../../app/lib/static-export-responsive.mjs";
import { normalizeReadingGItem } from "../../app/lib/reading-g-vocab/load-reading-g.mjs";
import { buildRgStudyList } from "../../app/lib/reading-g-vocab/storage.mjs";
import { orderStudyWordIndices } from "../../app/lib/vocab/word-study-ordering.mjs";

function fixtureWord(id, word) {
  return {
    id,
    wordId: id,
    word,
    phonetic: "/test/",
    pos: "noun",
    meaning: `${word} meaning`,
    definition: `${word} definition`,
    example: `This is ${word}.`,
    exampleCn: "测试例句",
    ieltsUse: ["Reading"],
    topics: ["教育"],
    difficulty: "基础高频",
    forms: [], wordFamily: [], collocations: [], phraseCollocations: []
  };
}

function desktopFixtureWord() {
  return {
    ...fixtureWord("word-vacancy", "vacancy"),
    meaning: "空缺",
    example: "The company has a vacancy for a marketing manager.",
    exampleCn: "公司有一个市场经理的空缺。",
    forms: [
      { word: "vacancies", label: "复数形式", meaning: "空缺" }
    ],
    wordFamily: [
      { word: "vacant", pos: "adjective", meaning: "空缺的" },
      { word: "vacate", pos: "verb", meaning: "腾出" }
    ],
    collocations: [
      { phrase: "job vacancy", meaning: "职位空缺" },
      { phrase: "fill a vacancy", meaning: "填补空缺" },
      { phrase: "vacancy rate", meaning: "空置率" }
    ],
    phraseCollocations: [
      { phrase: "no vacancy", meaning: "无空位" },
      { phrase: "vacancy announcement", meaning: "招聘公告" }
    ]
  };
}

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js") || file.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".json") || file.endsWith(".webmanifest")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

async function serveDirectory(root) {
  const rootPath = path.resolve(root);
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const file = path.resolve(rootPath, relative);
    if (!file.startsWith(`${rootPath}${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "content-type": contentType(file), "cache-control": "no-store" });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

async function touchSwipe(page, { selector = "#word", fromX, fromY, toX, toY, identifier = 1 }) {
  await page.evaluate(({ selector, fromX, fromY, toX, toY, identifier }) => {
    const target = document.querySelector(selector);
    const startTouch = new Touch({
      identifier,
      target,
      clientX: fromX,
      clientY: fromY,
      screenX: fromX,
      screenY: fromY,
      pageX: fromX,
      pageY: fromY
    });
    target.dispatchEvent(new TouchEvent("touchstart", {
      bubbles: true,
      cancelable: true,
      touches: [startTouch],
      targetTouches: [startTouch],
      changedTouches: [startTouch]
    }));

    const endTouch = new Touch({
      identifier,
      target,
      clientX: toX,
      clientY: toY,
      screenX: toX,
      screenY: toY,
      pageX: toX,
      pageY: toY
    });
    target.dispatchEvent(new TouchEvent("touchend", {
      bubbles: true,
      cancelable: true,
      touches: [],
      targetTouches: [],
      changedTouches: [endTouch]
    }));
  }, { selector, fromX, fromY, toX, toY, identifier });
}

async function pointerSwipe(page, { selector = "#word", fromX, fromY, toX, toY, pointerId = 1 }) {
  await page.evaluate(({ selector, fromX, fromY, toX, toY, pointerId }) => {
    const target = document.querySelector(selector);
    target.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: "touch",
      isPrimary: true,
      clientX: fromX,
      clientY: fromY
    }));
    target.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: "touch",
      isPrimary: true,
      clientX: toX,
      clientY: toY
    }));
  }, { selector, fromX, fromY, toX, toY, pointerId });
}

test("actual exported mobile page uses the 538 touch gesture for reliable left and right navigation", async ({ browser }) => {
  const request = new Request("http://127.0.0.1:3000/api/export-static?audio=0", {
    method: "POST",
    headers: { host: "127.0.0.1:3000", "content-type": "application/json" },
    body: JSON.stringify({ words: [fixtureWord("word-alpha", "alpha"), fixtureWord("word-beta", "beta")] })
  });
  const response = await POST(request);
  expect(response.status).toBe(200);
  expect(response.headers.get("x-static-export-version")).toBe(STATIC_RESPONSIVE_VERSION);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "static-vocab-swipe-"));
  for (const entry of readStoredZipEntries(Buffer.from(await response.arrayBuffer()))) {
    const target = path.join(directory, entry.name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.data);
  }
  const server = await serveDirectory(directory);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    await page.goto(`${server.url}/index.html`, { waitUntil: "networkidle" });
    await expect(page.locator("#word")).toHaveText("alpha");
    await expect(page.locator("#staticBuildVersion")).toContainText(STATIC_RESPONSIVE_VERSION);
    await expect(page.locator("#staticStudyCard")).toHaveCSS("touch-action", "pan-y");
    expect(await page.evaluate(() => window.__STATIC_VOCAB_BUILD__?.swipeEngine)).toBe(STATIC_SWIPE_ENGINE);

    await touchSwipe(page, { fromX: 330, fromY: 330, toX: 80, toY: 334, identifier: 41 });
    await expect(page.locator("#word")).toHaveText("beta");

    await touchSwipe(page, { fromX: 70, fromY: 330, toX: 330, toY: 333, identifier: 42 });
    await expect(page.locator("#word")).toHaveText("alpha");

    await touchSwipe(page, { fromX: 210, fromY: 250, toX: 225, toY: 520, identifier: 43 });
    await expect(page.locator("#word")).toHaveText("alpha");

    await touchSwipe(page, { selector: "#favoriteBtn", fromX: 330, fromY: 220, toX: 70, toY: 224, identifier: 44 });
    await expect(page.locator("#word")).toHaveText("alpha");
    expect(pageErrors).toEqual([]);
  } finally {
    await context.close();
    await server.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("actual exported 538 page swipes from the word and related-word card while nested buttons stay clickable", async ({ browser }) => {
  const request = new Request("http://127.0.0.1:3000/api/export-static?audio=0", {
    method: "POST",
    headers: { host: "127.0.0.1:3000", "content-type": "application/json" },
    body: JSON.stringify({ words: [fixtureWord("word-alpha", "alpha")] })
  });
  const response = await POST(request);
  expect(response.status).toBe(200);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "static-538-swipe-"));
  for (const entry of readStoredZipEntries(Buffer.from(await response.arrayBuffer()))) {
    const target = path.join(directory, entry.name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.data);
  }
  const server = await serveDirectory(directory);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    await page.goto(`${server.url}/ielts-538.html`, { waitUntil: "networkidle" });
    await expect(page.locator("#word")).toHaveText("resemble");
    await expect(page.locator(".study538-synonym").first()).toHaveAttribute("data-static-swipe-handle", "");

    await touchSwipe(page, { selector: "#word", fromX: 330, fromY: 300, toX: 70, toY: 304, identifier: 51 });
    await expect(page.locator("#word")).toHaveText("recognize");

    await touchSwipe(page, { selector: ".study538-synonym", fromX: 330, fromY: 450, toX: 70, toY: 454, identifier: 52 });
    await expect(page.locator("#word")).toHaveText("adjust");

    await touchSwipe(page, { selector: ".study538-synonym .study538-sound", fromX: 70, fromY: 450, toX: 330, toY: 454, identifier: 53 });
    await expect(page.locator("#word")).toHaveText("adjust");

    await pointerSwipe(page, { selector: "#word", fromX: 70, fromY: 300, toX: 330, toY: 304, pointerId: 61 });
    await expect(page.locator("#word")).toHaveText("recognize");
    expect(pageErrors).toEqual([]);
  } finally {
    await context.close();
    await server.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("exported G-reading family and difficulty order matches the desktop ordering core", async ({ browser }) => {
  test.setTimeout(120_000);
  const rawData = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/reading-g-vocab.json"), "utf8"));
  const items = (rawData.items || rawData.words || [])
    .map((entry, index) => normalizeReadingGItem(entry, index))
    .filter(Boolean);
  const rows = buildRgStudyList(items, { type: "learnMode", value: "meaning" }, {}, "meaning");
  const expectedWords = orderStudyWordIndices(
    rows.map((row) => row.originalIndex),
    items,
    { mode: "family", difficultyMode: "easy-to-hard" }
  ).slice(0, 12).map((index) => items[index].word);

  const request = new Request("http://127.0.0.1:3000/api/export-static?audio=0", {
    method: "POST",
    headers: { host: "127.0.0.1:3000", "content-type": "application/json" },
    body: JSON.stringify({ words: [fixtureWord("word-alpha", "alpha")] })
  });
  const response = await POST(request);
  expect(response.status).toBe(200);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "static-reading-g-order-"));
  for (const entry of readStoredZipEntries(Buffer.from(await response.arrayBuffer()))) {
    const target = path.join(directory, entry.name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.data);
  }
  const server = await serveDirectory(directory);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    await page.goto(`${server.url}/reading-g.html`, { waitUntil: "networkidle" });
    await page.locator("#entrySelect").selectOption("learnMode:meaning", { force: true });
    await page.locator("#wordOrderSelect").selectOption("family", { force: true });
    await page.locator("#difficultyOrderSelect").selectOption("easy-to-hard", { force: true });

    const actualWords = [];
    for (let index = 0; index < expectedWords.length; index += 1) {
      actualWords.push(String(await page.locator("#word").textContent()).trim());
      if (index < expectedWords.length - 1) await page.locator("#nextBtn").click();
    }
    expect(actualWords).toEqual(expectedWords);
    expect(pageErrors).toEqual([]);
  } finally {
    await context.close();
    await server.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("exported desktop home keeps the action dock visible without page-level vertical overflow", async ({ browser }) => {
  const request = new Request("http://127.0.0.1:3000/api/export-static?audio=0", {
    method: "POST",
    headers: { host: "127.0.0.1:3000", "content-type": "application/json" },
    body: JSON.stringify({ words: [desktopFixtureWord()] })
  });
  const response = await POST(request);
  expect(response.status).toBe(200);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "static-vocab-desktop-"));
  for (const entry of readStoredZipEntries(Buffer.from(await response.arrayBuffer()))) {
    const target = path.join(directory, entry.name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.data);
  }
  const server = await serveDirectory(directory);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    await page.goto(`${server.url}/index.html`, { waitUntil: "networkidle" });
    await expect(page.locator("#word")).toHaveText("vacancy");

    const layout = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      dockBottom: document.querySelector(".bottom")?.getBoundingClientRect().bottom ?? 0,
      viewportHeight: window.innerHeight
    }));

    expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight);
    expect(layout.dockBottom).toBeLessThanOrEqual(layout.viewportHeight);
  } finally {
    await context.close();
    await server.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("exported zero-foundation page refreshes its status counts from saved progress", async ({ browser }) => {
  const request = new Request("http://127.0.0.1:3000/api/export-static?audio=0", {
    method: "POST",
    headers: { host: "127.0.0.1:3000", "content-type": "application/json" },
    body: JSON.stringify({ words: [fixtureWord("word-alpha", "alpha")] })
  });
  const response = await POST(request);
  expect(response.status).toBe(200);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "static-vocab-basic-status-"));
  for (const entry of readStoredZipEntries(Buffer.from(await response.arrayBuffer()))) {
    const target = path.join(directory, entry.name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.data);
  }
  const server = await serveDirectory(directory);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    await page.goto(`${server.url}/basic.html`, { waitUntil: "networkidle" });
    const firstWord = String(await page.locator("#word").textContent()).trim().toLowerCase();
    expect(firstWord).not.toBe("");
    await page.evaluate((word) => {
      localStorage.setItem("ielts_basic_flash_status_v1", JSON.stringify({
        [word]: { status: "熟悉", favorite: false }
      }));
    }, firstWord);
    await page.reload({ waitUntil: "networkidle" });

    await expect(page.locator("#basicTopbar")).toHaveClass(/is-tools-collapsed/);
    await page.locator("#topToolsToggle").click();
    await expect(page.locator("#basicFilterPanel")).toBeVisible();
    await expect(page.locator("#statusSummary")).toContainText("熟悉 1");
    await expect(page.getByRole("button", { name: "熟悉 1" })).toBeVisible();
  } finally {
    await context.close();
    await server.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
