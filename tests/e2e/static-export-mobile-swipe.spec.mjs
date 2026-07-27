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

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
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
