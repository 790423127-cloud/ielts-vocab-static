from pathlib import Path
import re

ROOT = Path.cwd()


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(source, old, new, label):
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return source.replace(old, new, 1)


def regex_once(source, pattern, replacement, label):
    next_source, count = re.subn(pattern, lambda _match: replacement, source, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return next_source


VERSION = "20260728_static_mobile_swipe_v3"

# Real export route: patch and validate the ZIP before returning it.
route_path = "app/api/export-static/route.js"
route = read(route_path)
route = replace_once(
    route,
    'import { requireLocalAdmin, requireLocalRead } from "../../lib/api/local-admin-guard.mjs";\n',
    'import { requireLocalAdmin, requireLocalRead } from "../../lib/api/local-admin-guard.mjs";\n'
    'import { patchStaticExportZip, STATIC_RESPONSIVE_VERSION } from "../../lib/static-export-responsive.mjs";\n',
    "route import",
)
helper = '''
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

'''
route = replace_once(route, "export async function POST(req) {", helper + "export async function POST(req) {", "route helper")
post_response = '''    return new Response(result.zip, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="static-site.zip"`,
        "X-Word-Count": String(result.count),
        "X-Audio-Count": String(result.audioCount)
      }
    });'''
route = replace_once(route, post_response, "    return createVerifiedStaticZipResponse(result);", "POST response")
get_response = '''    return new Response(result.zip, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="static-site.zip"`,
        "X-Word-Count": String(result.count),
        "X-Audio-Count": String(result.audioCount),
        "X-Export-Source": "server-cache"
      }
    });'''
route = replace_once(
    route,
    get_response,
    '    return createVerifiedStaticZipResponse(result, { "X-Export-Source": "server-cache" });',
    "GET response",
)
write(route_path, route)

# Final artifact transformer: strict matching, mobile pointer + touch fallback,
# visible build identity and fail-closed validation.
responsive_path = "app/lib/static-export-responsive.mjs"
responsive = read(responsive_path)
responsive = replace_once(responsive, 'export const STATIC_RESPONSIVE_VERSION = "20260728_static_mobile_swipe_v2";', f'export const STATIC_RESPONSIVE_VERSION = "{VERSION}";', "version")
responsive = replace_once(responsive, 'export const STATIC_SWIPE_FIX_MARKER = "D2.7 static pointer swipe hotfix";', 'export const STATIC_SWIPE_FIX_MARKER = "D2.8 verified static pointer and touch swipe";', "swipe marker")
responsive = replace_once(responsive, "export const STATIC_SWIPE_MIN_DISTANCE = 40;", "export const STATIC_SWIPE_MIN_DISTANCE = 36;", "distance")
responsive = replace_once(responsive, "export const STATIC_SWIPE_MAX_DURATION_MS = 1000;", "export const STATIC_SWIPE_MAX_DURATION_MS = 1400;", "duration")
responsive = replace_once(responsive, "export const STATIC_SWIPE_AXIS_RATIO = 1.15;", "export const STATIC_SWIPE_AXIS_RATIO = 1.08;", "axis ratio")
responsive = replace_once(
    responsive,
    ".hero{touch-action:pan-y;overscroll-behavior-x:contain}",
    ".hero{touch-action:pan-y pinch-zoom;overscroll-behavior-x:contain;-webkit-user-select:none;user-select:none}\n"
    ".static-build-version{position:fixed;right:8px;bottom:6px;z-index:2;padding:3px 7px;border-radius:999px;background:rgba(255,255,255,.72);color:rgba(22,53,47,.55);font-size:10px;line-height:1.2;pointer-events:none}",
    "mobile CSS",
)

controller = r'''const POINTER_SWIPE_CONTROLLER = `/* ${STATIC_SWIPE_FIX_MARKER} */
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
window.__STATIC_VOCAB_BUILD__={version:APP_VERSION,swipeEngine:"pointer-touch-v3"};`;

const LEGACY_TOUCH_SWIPE_RE = /let sx=0,sy=0,st=0;[\s\S]*?els\.swipeArea\.addEventListener\("touchcancel",stopHoldStep,\{passive:true\}\);/;'''
responsive = regex_once(
    responsive,
    r'const POINTER_SWIPE_CONTROLLER = `.*?const LEGACY_TOUCH_SWIPE_RE = /let sx=0,sy=0,st=0;\[\\s\\S\]\*\?els\\\.swipeArea\\\.addEventListener\\\("touchcancel",stopHoldStep,\\\{passive:true\\\}\\\);/;',
    controller,
    "controller block",
)
old_patch = '''  if (!next.includes(STATIC_SWIPE_FIX_MARKER)) {
    next = LEGACY_TOUCH_SWIPE_RE.test(next)
      ? next.replace(LEGACY_TOUCH_SWIPE_RE, POINTER_SWIPE_CONTROLLER)
      : `${next}\n${POINTER_SWIPE_CONTROLLER}\n`;
  }

  return next;'''
new_patch = '''  if (!next.includes(STATIC_SWIPE_FIX_MARKER)) {
    if (!LEGACY_TOUCH_SWIPE_RE.test(next)) {
      throw new Error("Static export swipe source signature changed; refusing to export an unverified ZIP");
    }
    next = next.replace(LEGACY_TOUCH_SWIPE_RE, POINTER_SWIPE_CONTROLLER);
  }

  next = next.replace(
    'navigator.serviceWorker.register("./sw.js?v="+APP_VERSION).catch(function(){});',
    'navigator.serviceWorker.register("./sw.js?v="+APP_VERSION,{updateViaCache:"none"}).then(function(registration){return registration.update()}).catch(function(){});'
  );

  if (!next.includes(STATIC_SWIPE_FIX_MARKER) || !next.includes('window.addEventListener("pointerup"') || !next.includes('window.addEventListener("touchend"')) {
    throw new Error("Static export swipe verification failed");
  }
  return next;'''
responsive = replace_once(responsive, old_patch, new_patch, "fail-closed patch")
responsive = replace_once(
    responsive,
    '''export function patchStaticHtml(html) {
  return replaceVersionQuery(html);
}''',
    '''export function patchStaticHtml(html) {
  let next = replaceVersionQuery(html);
  if (!next.includes('http-equiv="Cache-Control"')) {
    next = next.replace("</head>", '  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />\\n  <meta http-equiv="Pragma" content="no-cache" />\\n</head>');
  }
  if (!next.includes('id="staticBuildVersion"')) {
    next = next.replace("</body>", `<div id="staticBuildVersion" class="static-build-version" aria-label="静态网站版本">静态版本 ${STATIC_RESPONSIVE_VERSION}</div>\\n</body>`);
  }
  return next;
}''',
    "HTML version marker",
)
responsive = replace_once(
    responsive,
    '''export function patchStaticExportZip(input) {
  return createStoredZip(readStoredZipEntries(input).map(patchEntry));
}''',
    '''export function patchStaticExportZip(input) {
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
}''',
    "ZIP validation",
)
write(responsive_path, responsive)

# Remove indirect route/rewrite so no raw ZIP path can bypass validation.
next_path = "next.config.mjs"
next_config = read(next_path)
rewrite_block = ''',
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/api/export-static", destination: "/api/export-static-final" }
      ],
      afterFiles: [],
      fallback: []
    };
  }'''
next_config = replace_once(next_config, rewrite_block, "", "obsolete rewrite")
write(next_path, next_config)
(ROOT / "app/api/export-static-final/route.js").unlink(missing_ok=True)
(ROOT / "app/lib/static-export-response.mjs").unlink(missing_ok=True)

# Actual endpoint test, not a synthetic ZIP-only test.
write("app/lib/vocab/__tests__/static-export-final-route.test.mjs", r'''import test from "node:test";
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
    meaning: `${word} meaning`,
    definition: `${word} definition`,
    example: `This is ${word}.`,
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
    headers: { host: "127.0.0.1:3000", "content-type": "application/json" },
    body: JSON.stringify({ words: [fixtureWord("word-alpha", "alpha"), fixtureWord("word-beta", "beta")] })
  });
  const response = await POST(request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-static-export-version"), STATIC_RESPONSIVE_VERSION);
  const entries = new Map(readStoredZipEntries(Buffer.from(await response.arrayBuffer())).map((entry) => [entry.name, entry.data.toString("utf8")]));
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
''')

# Update transformer tests for the fallback and strict failure mode.
test_path = "app/lib/vocab/__tests__/static-export-responsive.test.mjs"
test_source = read(test_path)
test_source = replace_once(test_source, '  assert.doesNotMatch(patched, /addEventListener\\("touchstart"/);', '  assert.match(patched, /addEventListener\\("touchstart"/);', "touch fallback assertion")
test_source = replace_once(test_source, '  assert.doesNotMatch(entries.get("assets/app.js"), /touchstart/);', '  assert.match(entries.get("assets/app.js"), /touchstart/);\n  assert.match(entries.get("build-info.json"), /pointer-touch-v3/);', "ZIP fallback assertion")
test_source += r'''

test("static export refuses to append swipe code outside the verified app scope", () => {
  assert.throws(
    () => patchStaticAppJs('const APP_VERSION="old";const unrelated=true;'),
    /refusing to export an unverified ZIP/
  );
});
'''
write(test_path, test_source)

# Mobile browser test opens the real exported index.html and performs both directions.
write("tests/e2e/static-export-mobile-swipe.spec.mjs", r'''import { test, expect } from "@playwright/test";
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
''')

write("docs/static-cloud-deep-audit-2026-07-28.md", f'''# 静态云刷词页深度审计（2026-07-28）

## 审计对象

- 用户实际入口：腾讯云静态网站主刷词页。
- 最终文件：`index.html`、`assets/app.js`、`assets/style.css`、`sw.js`、`data/words.json`。
- 真实生成入口：`POST/GET /api/export-static`。
- 不包含 Next.js 正式刷词页、拼写页和阅读生词栏。

## 连续五次没有解决的原因

1. 最早的修改落在正式网站或拼写训练，不是静态主刷词页。
2. 后来的修复只存在于 ZIP 后处理器，真实生成器仍保留旧触摸代码。
3. 后处理器先前没有接入下载链路，之后又通过 rewrite 和第二个 Route Handler 间接接入，存在绕过原始响应的风险。
4. 后处理器匹配失败时会把控制器追加到文件末尾；追加位置不保证仍处于 `els` 和 `step` 的有效作用域，但导出不会失败。
5. 测试使用人工拼接 ZIP 和字符串断言，没有调用真实 `/api/export-static`，也没有打开最终 `index.html` 做手机手势测试。
6. 腾讯云页面没有可见版本号，无法区分代码未进入 ZIP、ZIP 未部署、CDN 或 Service Worker 仍缓存旧文件。

## 本次根因修复

- `/api/export-static` 直接修补并校验最终 ZIP，不再依赖 rewrite 或第二个导出路由。
- 找不到真实旧触摸代码时停止导出，不再静默生成未经验证的包。
- 同时支持 Pointer Events 和旧 WebView 的 Touch Events 回退。
- 在 `window` 上完成手势，手指滑出卡片后仍能结束切换。
- 保留上下滚动；按钮、链接和输入框不触发换词。
- 最终 ZIP 强制校验 JS、CSS、HTML、Service Worker 和版本文件。
- 页面右下角显示静态版本，并增加 `build-info.json`。

## 验证标准

1. 调用真实 `POST /api/export-static?audio=0`。
2. 解包真实返回的 ZIP。
3. 手机尺寸 Chromium 打开解包后的真实 `index.html`。
4. 左滑：alpha 变为 beta；右滑：beta 回到 alpha。
5. 浏览器无 JavaScript 页面错误。

## 腾讯云部署识别

部署后页面右下角必须显示：

`静态版本 {VERSION}`

同目录 `build-info.json` 应显示相同版本。没有该版本就说明腾讯云仍在提供旧目录或旧缓存。
''')

# One-time files must not remain in the product branch.
(ROOT / "scripts/apply-static-cloud-deep-fix.py").unlink(missing_ok=True)
(ROOT / ".github/workflows/apply-static-cloud-deep-fix.yml").unlink(missing_ok=True)
print("Applied verified static cloud swipe fix")
