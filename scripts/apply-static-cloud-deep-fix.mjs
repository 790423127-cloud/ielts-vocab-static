import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, content) => {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
};

function replaceOnce(source, search, replacement, label) {
  const index = source.indexOf(search);
  if (index < 0) throw new Error(`Missing source block: ${label}`);
  if (source.indexOf(search, index + search.length) >= 0) throw new Error(`Duplicate source block: ${label}`);
  return source.slice(0, index) + replacement + source.slice(index + search.length);
}

function replaceRegexOnce(source, pattern, replacement, label) {
  const matches = source.match(pattern);
  if (!matches) throw new Error(`Missing source pattern: ${label}`);
  const next = source.replace(pattern, replacement);
  if (next === source) throw new Error(`Pattern did not change source: ${label}`);
  return next;
}

// 1. Make the real /api/export-static route return the verified ZIP directly.
{
  const file = "app/api/export-static/route.js";
  let source = read(file);
  source = replaceOnce(
    source,
    'import { requireLocalAdmin, requireLocalRead } from "../../lib/api/local-admin-guard.mjs";\n',
    'import { requireLocalAdmin, requireLocalRead } from "../../lib/api/local-admin-guard.mjs";\nimport { patchStaticExportZip, STATIC_RESPONSIVE_VERSION } from "../../lib/static-export-responsive.mjs";\n',
    "static export patch import"
  );

  const helper = String.raw`
function createVerifiedStaticZipResponse(result, extraHeaders = {}) {
  const zip = patchStaticExportZip(result.zip);
  return new Response(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="static-site.zip"',
      "Content-Length": String(zip.length),
      "X-Word-Count": String(result.count),
      "X-Audio-Count": String(result.audioCount),
      "X-Static-Export-Version": STATIC_RESPONSIVE_VERSION,
      ...extraHeaders
    }
  });
}

`;
  source = replaceOnce(source, "export async function POST(req) {", helper + "export async function POST(req) {", "verified response helper");

  source = replaceOnce(
    source,
    String.raw`    return new Response(result.zip, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="static-site.zip"`,
        "X-Word-Count": String(result.count),
        "X-Audio-Count": String(result.audioCount)
      }
    });`.replaceAll("\u001f", "`"),
    "    return createVerifiedStaticZipResponse(result);",
    "POST raw ZIP response"
  );

  source = replaceOnce(
    source,
    String.raw`    return new Response(result.zip, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="static-site.zip"`,
        "X-Word-Count": String(result.count),
        "X-Audio-Count": String(result.audioCount),
        "X-Export-Source": "server-cache"
      }
    });`.replaceAll("\u001f", "`"),
    '    return createVerifiedStaticZipResponse(result, { "X-Export-Source": "server-cache" });',
    "GET raw ZIP response"
  );

  write(file, source);
}

// 2. Harden the transformer: strict source matching, pointer events + touch fallback,
// deployment diagnostics, build-info.json and final artifact validation.
{
  const file = "app/lib/static-export-responsive.mjs";
  let source = read(file);
  source = source.replace(
    'export const STATIC_RESPONSIVE_VERSION = "20260728_static_mobile_swipe_v2";',
    'export const STATIC_RESPONSIVE_VERSION = "20260728_static_mobile_swipe_v3";'
  );
  source = source.replace(
    'export const STATIC_SWIPE_FIX_MARKER = "D2.7 static pointer swipe hotfix";',
    'export const STATIC_SWIPE_FIX_MARKER = "D2.8 verified static pointer and touch swipe";'
  );
  source = source.replace('export const STATIC_SWIPE_MIN_DISTANCE = 40;', 'export const STATIC_SWIPE_MIN_DISTANCE = 36;');
  source = source.replace('export const STATIC_SWIPE_MAX_DURATION_MS = 1000;', 'export const STATIC_SWIPE_MAX_DURATION_MS = 1400;');
  source = source.replace('export const STATIC_SWIPE_AXIS_RATIO = 1.15;', 'export const STATIC_SWIPE_AXIS_RATIO = 1.08;');

  source = source.replace(
    '.hero{touch-action:pan-y;overscroll-behavior-x:contain}',
    '.hero{touch-action:pan-y pinch-zoom;overscroll-behavior-x:contain;-webkit-user-select:none;user-select:none}\n.static-build-version{position:fixed;right:8px;bottom:6px;z-index:2;padding:3px 7px;border-radius:999px;background:rgba(255,255,255,.72);color:rgba(22,53,47,.55);font-size:10px;line-height:1.2;pointer-events:none}'
  );

  const controller = String.raw`const POINTER_SWIPE_CONTROLLER = `/* ${STATIC_SWIPE_FIX_MARKER} */
const STATIC_SWIPE_INTERACTIVE_SELECTOR="button,a,input,textarea,select,option,label,[contenteditable=true],[role=button]";
let staticSwipeId=null;
let staticSwipeStartX=0;
let staticSwipeStartY=0;
let staticSwipeStartedAt=0;
let staticSwipeCancelled=false;
function resetStaticSwipe(){
  staticSwipeId=null;
  staticSwipeStartX=0;
  staticSwipeStartY=0;
  staticSwipeStartedAt=0;
  staticSwipeCancelled=false;
}
function isStaticSwipeInteractiveTarget(target){
  return !!(target&&typeof target.closest==="function"&&target.closest(STATIC_SWIPE_INTERACTIVE_SELECTOR));
}
function beginStaticSwipe(id,x,y,target){
  if(isStaticSwipeInteractiveTarget(target))return false;
  staticSwipeId=id;
  staticSwipeStartX=x;
  staticSwipeStartY=y;
  staticSwipeStartedAt=Date.now();
  staticSwipeCancelled=false;
  return true;
}
function moveStaticSwipe(id,x,y){
  if(id!==staticSwipeId)return;
  const dx=x-staticSwipeStartX;
  const dy=y-staticSwipeStartY;
  if(Math.abs(dy)>16&&Math.abs(dy)>Math.abs(dx)*1.18)staticSwipeCancelled=true;
}
function finishStaticSwipe(id,x,y){
  if(id!==staticSwipeId)return;
  const dx=x-staticSwipeStartX;
  const dy=y-staticSwipeStartY;
  const duration=Date.now()-staticSwipeStartedAt;
  const cancelled=staticSwipeCancelled;
  resetStaticSwipe();
  if(cancelled)return;
  if(duration<=${STATIC_SWIPE_MAX_DURATION_MS}&&Math.abs(dx)>=${STATIC_SWIPE_MIN_DISTANCE}&&Math.abs(dx)>Math.abs(dy)*${STATIC_SWIPE_AXIS_RATIO}){
    dx<0?step(1):step(-1);
  }
}
if("PointerEvent" in window){
  els.swipeArea.addEventListener("pointerdown",function(e){
    if(!e.isPrimary)return;
    if(e.pointerType==="mouse"&&e.button!==0)return;
    beginStaticSwipe(e.pointerId,e.clientX,e.clientY,e.target);
  },{passive:true});
  window.addEventListener("pointermove",function(e){moveStaticSwipe(e.pointerId,e.clientX,e.clientY)},{passive:true});
  window.addEventListener("pointerup",function(e){finishStaticSwipe(e.pointerId,e.clientX,e.clientY)},{passive:true});
  window.addEventListener("pointercancel",resetStaticSwipe,{passive:true});
}else{
  els.swipeArea.addEventListener("touchstart",function(e){
    if(e.touches.length!==1)return;
    const t=e.touches[0];
    beginStaticSwipe("touch",t.clientX,t.clientY,e.target);
  },{passive:true});
  window.addEventListener("touchmove",function(e){
    if(!e.touches.length)return;
    const t=e.touches[0];
    moveStaticSwipe("touch",t.clientX,t.clientY);
  },{passive:true});
  window.addEventListener("touchend",function(e){
    if(!e.changedTouches.length)return;
    const t=e.changedTouches[0];
    finishStaticSwipe("touch",t.clientX,t.clientY);
  },{passive:true});
  window.addEventListener("touchcancel",resetStaticSwipe,{passive:true});
}
window.__STATIC_VOCAB_BUILD__={version:APP_VERSION,swipeEngine:"pointer-touch-v3"};`;

const LEGACY_TOUCH_SWIPE_RE = /let sx=0,sy=0,st=0;[\s\S]*?els\.swipeArea\.addEventListener\("touchcancel",stopHoldStep,\{passive:true\}\);/;`.replaceAll("\u001f", "`");

  source = replaceRegexOnce(
    source,
    /const POINTER_SWIPE_CONTROLLER = `[\s\S]*?const LEGACY_TOUCH_SWIPE_RE = \/let sx=0,sy=0,st=0;\[\\s\\S\]\*\?els\\\.swipeArea\\\.addEventListener\\\("touchcancel",stopHoldStep,\\\{passive:true\\\}\\\);\/;/,
    controller,
    "swipe controller"
  );

  source = source.replace(
    '  if (!next.includes(STATIC_SWIPE_FIX_MARKER)) {\n    next = LEGACY_TOUCH_SWIPE_RE.test(next)\n      ? next.replace(LEGACY_TOUCH_SWIPE_RE, POINTER_SWIPE_CONTROLLER)\n      : `${next}\\n${POINTER_SWIPE_CONTROLLER}\\n`;\n  }\n\n  return next;',
    '  if (!next.includes(STATIC_SWIPE_FIX_MARKER)) {\n    if (!LEGACY_TOUCH_SWIPE_RE.test(next)) {\n      throw new Error("Static export swipe source signature changed; refusing to export an unverified ZIP");\n    }\n    next = next.replace(LEGACY_TOUCH_SWIPE_RE, POINTER_SWIPE_CONTROLLER);\n  }\n\n  next = next.replace(\n    \'navigator.serviceWorker.register("./sw.js?v="+APP_VERSION).catch(function(){});\',\n    \'navigator.serviceWorker.register("./sw.js?v="+APP_VERSION,{updateViaCache:"none"}).then(function(registration){return registration.update()}).catch(function(){});\'\n  );\n\n  if (!next.includes(STATIC_SWIPE_FIX_MARKER) || !next.includes(\'window.addEventListener("pointerup"\') || !next.includes(\'window.addEventListener("touchend"\')) {\n    throw new Error("Static export swipe verification failed");\n  }\n  return next;'
  );

  source = source.replace(
    'export function patchStaticHtml(html) {\n  return replaceVersionQuery(html);\n}',
    String.raw`export function patchStaticHtml(html) {
  let next = replaceVersionQuery(html);
  if (!next.includes('http-equiv="Cache-Control"')) {
    next = next.replace("</head>", '  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />\n  <meta http-equiv="Pragma" content="no-cache" />\n</head>');
  }
  if (!next.includes('id="staticBuildVersion"')) {
    next = next.replace("</body>", '<div id="staticBuildVersion" class="static-build-version" aria-label="静态网站版本">静态版本 ${STATIC_RESPONSIVE_VERSION}</div>\n</body>');
  }
  return next;
}`
  );

  source = source.replace(
    'export function patchStaticExportZip(input) {\n  return createStoredZip(readStoredZipEntries(input).map(patchEntry));\n}',
    String.raw`export function patchStaticExportZip(input) {
  const entries = readStoredZipEntries(input)
    .filter((entry) => entry.name !== "build-info.json")
    .map(patchEntry);
  entries.push({
    name: "build-info.json",
    data: Buffer.from(JSON.stringify({
      version: STATIC_RESPONSIVE_VERSION,
      swipeEngine: "pointer-touch-v3",
      generatedAt: new Date().toISOString()
    }, null, 2), "utf8")
  });

  const byName = new Map(entries.map((entry) => [entry.name, entry.data.toString("utf8")]));
  const appJs = byName.get("assets/app.js") || "";
  const css = byName.get("assets/style.css") || "";
  const html = byName.get("index.html") || "";
  const sw = byName.get("sw.js") || "";
  if (!appJs.includes(STATIC_SWIPE_FIX_MARKER) || !appJs.includes("pointer-touch-v3")) {
    throw new Error("Final static ZIP does not contain the verified swipe controller");
  }
  if (!css.includes("touch-action:pan-y pinch-zoom")) {
    throw new Error("Final static ZIP does not contain the mobile touch-action rule");
  }
  if (!html.includes(STATIC_RESPONSIVE_VERSION) || !html.includes("staticBuildVersion")) {
    throw new Error("Final static ZIP does not expose its deployment version");
  }
  if (!sw.includes(STATIC_RESPONSIVE_VERSION)) {
    throw new Error("Final static ZIP service worker version is stale");
  }
  return createStoredZip(entries);
}`
  );

  write(file, source);
}

// 3. Remove the rewrite/final-route indirection that allowed raw ZIPs to bypass fixes.
{
  const file = "next.config.mjs";
  let source = read(file);
  source = replaceRegexOnce(
    source,
    /,\n  async rewrites\(\) \{[\s\S]*?\n  \}\n/,
    "\n",
    "obsolete export rewrite"
  );
  write(file, source);
  fs.rmSync(path.join(root, "app/api/export-static-final/route.js"), { force: true });
  fs.rmSync(path.join(root, "app/lib/static-export-response.mjs"), { force: true });
}

// 4. Replace synthetic tests with actual endpoint/final-artifact verification.
write("app/lib/vocab/__tests__/static-export-final-route.test.mjs", String.raw`import test from "node:test";
import assert from "node:assert/strict";

import { POST } from "../../../api/export-static/route.js";
import {
  readStoredZipEntries,
  STATIC_RESPONSIVE_VERSION,
  STATIC_SWIPE_FIX_MARKER
} from "../../static-export-responsive.mjs";

function fixtureWord(id, word) {
  return {
    id,
    wordId: id,
    word,
    phonetic: "/test/",
    pos: "noun",
    meaning: word + " meaning",
    definition: word + " definition",
    example: "This is " + word + ".",
    exampleCn: "测试例句",
    ieltsUse: ["Reading"],
    topics: ["教育"],
    difficulty: "基础高频",
    forms: [],
    wordFamily: [],
    collocations: [],
    phraseCollocations: []
  };
}

test("the real export endpoint returns a verified mobile-swipe ZIP", async () => {
  const request = new Request("http://127.0.0.1:3000/api/export-static?audio=0", {
    method: "POST",
    headers: {
      host: "127.0.0.1:3000",
      "content-type": "application/json"
    },
    body: JSON.stringify({ words: [fixtureWord("word-alpha", "alpha"), fixtureWord("word-beta", "beta")] })
  });

  const response = await POST(request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-static-export-version"), STATIC_RESPONSIVE_VERSION);

  const entries = new Map(
    readStoredZipEntries(Buffer.from(await response.arrayBuffer()))
      .map((entry) => [entry.name, entry.data.toString("utf8")])
  );

  assert.match(entries.get("assets/app.js"), new RegExp(STATIC_SWIPE_FIX_MARKER));
  assert.match(entries.get("assets/app.js"), /pointer-touch-v3/);
  assert.match(entries.get("assets/app.js"), /window\.addEventListener\("pointerup"/);
  assert.match(entries.get("assets/app.js"), /window\.addEventListener\("touchend"/);
  assert.doesNotMatch(entries.get("assets/app.js"), /Math\.abs\(dx\)>55/);
  assert.match(entries.get("assets/style.css"), /touch-action:pan-y pinch-zoom/);
  assert.match(entries.get("index.html"), new RegExp(STATIC_RESPONSIVE_VERSION));
  assert.match(entries.get("index.html"), /staticBuildVersion/);
  assert.match(entries.get("sw.js"), new RegExp(STATIC_RESPONSIVE_VERSION));
  assert.match(entries.get("build-info.json"), /pointer-touch-v3/);
});
`);

// Add stricter unit coverage without relying only on source strings.
{
  const file = "app/lib/vocab/__tests__/static-export-responsive.test.mjs";
  let source = read(file);
  source = source.replace(
    '  assert.doesNotMatch(patched, /addEventListener\\("touchstart"/);',
    '  assert.match(patched, /addEventListener\\("touchstart"/);'
  );
  source = source.replace(
    '  assert.doesNotMatch(entries.get("assets/app.js"), /touchstart/);',
    '  assert.match(entries.get("assets/app.js"), /touchstart/);\n  assert.match(entries.get("build-info.json"), /pointer-touch-v3/);'
  );
  source += String.raw`

test("static export refuses to silently append swipe code outside the app scope", () => {
  assert.throws(
    () => patchStaticAppJs('const APP_VERSION="old";const unrelated=true;'),
    /refusing to export an unverified ZIP/
  );
});
`;
  write(file, source);
}

// Browser test: call the real endpoint, serve the generated ZIP and dispatch real touch-pointer gestures.
write("tests/e2e/static-export-mobile-swipe.spec.mjs", String.raw`import { test, expect } from "@playwright/test";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { readStoredZipEntries, STATIC_RESPONSIVE_VERSION } from "../../app/lib/static-export-responsive.mjs";

function fixtureWord(id, word) {
  return {
    id,
    wordId: id,
    word,
    phonetic: "/test/",
    pos: "noun",
    meaning: word + " meaning",
    definition: word + " definition",
    example: "This is " + word + ".",
    exampleCn: "测试例句",
    ieltsUse: ["Reading"],
    topics: ["教育"],
    difficulty: "基础高频",
    forms: [],
    wordFamily: [],
    collocations: [],
    phraseCollocations: []
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
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const file = path.resolve(root, relative);
    if (!file.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "content-type": contentType(file), "cache-control": "no-store" });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    url: "http://127.0.0.1:" + address.port,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function swipe(page, fromX, toX, y, pointerId) {
  await page.evaluate(({ fromX, toX, y, pointerId }) => {
    const target = document.getElementById("word");
    target.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      pointerType: "touch",
      pointerId,
      isPrimary: true,
      clientX: fromX,
      clientY: y
    }));
    window.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      pointerType: "touch",
      pointerId,
      isPrimary: true,
      clientX: (fromX + toX) / 2,
      clientY: y + 2
    }));
    window.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      pointerType: "touch",
      pointerId,
      isPrimary: true,
      clientX: toX,
      clientY: y + 2
    }));
  }, { fromX, toX, y, pointerId });
}

test("the actual exported mobile page changes words on left and right swipe", async ({ request, browser }) => {
  const response = await request.post("/api/export-static?audio=0", {
    data: { words: [fixtureWord("word-alpha", "alpha"), fixtureWord("word-beta", "beta")] }
  });
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["x-static-export-version"]).toBe(STATIC_RESPONSIVE_VERSION);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "static-vocab-swipe-"));
  for (const entry of readStoredZipEntries(Buffer.from(await response.body()))) {
    const target = path.join(directory, entry.name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.data);
  }

  const server = await serveDirectory(directory);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await page.goto(server.url + "/index.html", { waitUntil: "networkidle" });
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
`);

// 5. Store the deep audit in the repository.
write("docs/static-cloud-deep-audit-2026-07-28.md", `# 静态云刷词页深度审计（2026-07-28）

## 审计对象

- 用户实际使用入口：腾讯云静态网站主刷词页（最终文件为 \`index.html + assets/app.js + assets/style.css + sw.js + data/words.json\`）。
- 真实生成入口：\`POST/GET /api/export-static\`。
- 不包含：Next.js 正式主刷词页、拼写页、阅读生词栏。

## 为什么连续五次仍未解决

1. 早期两次修改的是 Next.js 正式网站或拼写训练，并非静态主刷词页。
2. 后续修复放在 \`static-export-responsive.mjs\` 后处理器中，真实生成器 \`app/api/export-static/route.js\` 仍保留旧触摸代码。
3. 后处理器一度没有接入下载链路；之后通过 Next.js rewrite 和第二个 Route Handler 间接接入，存在绕过原始响应的路径。
4. 后处理器匹配失败时会把代码追加到文件末尾；若追加位置离开原脚本作用域，\`els\` 或 \`step\` 可能不可用，但导出仍会成功。
5. 测试使用的是人工拼接的假 ZIP 和字符串断言，没有调用真实 \`/api/export-static\`，也没有打开最终 \`index.html\` 模拟手机滑动。
6. 腾讯云线上版本没有可见版本号，无法区分“代码未进入 ZIP”“ZIP 未部署”“CDN/Service Worker 仍旧缓存”。

## 本次根因修复

- \`/api/export-static\` 自己直接执行 ZIP 校验和修补，不再依赖 rewrite 或第二个导出路由。
- 匹配不到真实旧触摸代码时直接停止导出并报错，不再静默输出未经验证的 ZIP。
- 手机手势同时支持 Pointer Events 和旧 WebView 的 Touch Events 回退。
- 手势监听在 window 上结束，手指离开单词区域也能完成切换。
- 保留上下滚动，按钮、链接和输入框不会触发换词。
- 最终 ZIP 必须同时通过 app.js、CSS、HTML、Service Worker 和版本文件校验。
- 页面右下角显示静态版本号，并包含 \`build-info.json\`，用于确认腾讯云真正部署了哪个包。

## 验证标准

1. 直接调用真实 \`POST /api/export-static?audio=0\`。
2. 解包真实返回 ZIP，确认包含经过验证的滑动控制器和版本号。
3. 用手机尺寸 Chromium 打开解包后的真实 \`index.html\`。
4. 左滑后单词从 alpha 变为 beta；右滑后从 beta 回到 alpha。
5. 浏览器无 JavaScript 页面错误。

## 部署检查

腾讯云部署后，页面右下角必须显示：

\`静态版本 20260728_static_mobile_swipe_v3\`

同时访问同目录的 \`build-info.json\` 应看到相同版本。若没有看到，说明腾讯云仍在提供旧目录或旧缓存，而不是本次 ZIP。
`);

// Remove obsolete synthetic patch route tests from the package list only by keeping the same filename.
// The filename now tests the real endpoint, so no package.json change is needed.

// Remove this one-time applicator and workflow from the final diff.
fs.rmSync(path.join(root, "scripts/apply-static-cloud-deep-fix.mjs"), { force: true });
fs.rmSync(path.join(root, ".github/workflows/apply-static-cloud-deep-fix.yml"), { force: true });

console.log("Applied verified static cloud swipe fix.");
