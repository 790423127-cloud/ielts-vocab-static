import { test, expect } from "@playwright/test";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { POST } from "../../app/api/export-static/route.js";
import { readStoredZipEntries, STATIC_RESPONSIVE_VERSION } from "../../app/lib/static-export-responsive.mjs";

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

async function swipe(page, fromX, toX, y, pointerId) {
  await page.evaluate(({ fromX, toX, y, pointerId }) => {
    const target = document.getElementById("word");
    target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", pointerId, isPrimary: true, clientX: fromX, clientY: y }));
    window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "touch", pointerId, isPrimary: true, clientX: (fromX + toX) / 2, clientY: y + 2 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", pointerId, isPrimary: true, clientX: toX, clientY: y + 2 }));
  }, { fromX, toX, y, pointerId });
}

test("actual exported mobile page changes words on left and right swipe", async ({ browser }) => {
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
    await swipe(page, 330, 80, 330, 41);
    await expect(page.locator("#word")).toHaveText("beta");
    await swipe(page, 70, 330, 330, 42);
    await expect(page.locator("#word")).toHaveText("alpha");
    expect(pageErrors).toEqual([]);
  } finally {
    await context.close();
    await server.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
