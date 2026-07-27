import test from "node:test";
import assert from "node:assert/strict";

import {
  createStoredZip,
  patchStaticAppJs,
  patchStaticCss,
  patchStaticExportZip,
  readStoredZipEntries,
  resolveStaticSwipeStep,
  STATIC_FILTER_FIX_MARKER,
  STATIC_RESPONSIVE_MARKER,
  STATIC_RESPONSIVE_VERSION,
  STATIC_SWIPE_ENGINE,
  STATIC_SWIPE_FIX_MARKER
} from "../../static-export-responsive.mjs";

const LOCKED_RULE =
  ".app{height:calc(100svh - var(--workspace-header));min-height:calc(100svh - var(--workspace-header));overflow:hidden}";

const LEGACY_TOUCH_SOURCE = `let sx=0,sy=0,st=0;
els.swipeArea.addEventListener("touchstart",function(e){
  const t=e.changedTouches[0];
  sx=t.clientX;
  sy=t.clientY;
  st=Date.now();
},{passive:true});
els.swipeArea.addEventListener("touchmove",function(e){
  const t=e.changedTouches[0];
  const dx=t.clientX-sx;
  const dy=t.clientY-sy;
},{passive:true});
els.swipeArea.addEventListener("touchend",function(e){
  const t=e.changedTouches[0];
  const dx=t.clientX-sx;
  const dy=t.clientY-sy;
  const dt=Date.now()-st;
  if(dt<700&&Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.4){
    dx<0?step(1):step(-1);
  }
},{passive:true});
els.swipeArea.addEventListener("touchcancel",stopHoldStep,{passive:true});`;

const STATIC_FILTER_SOURCE = `const APP_VERSION="old";
function topToolsViewportKey(){
  return window.matchMedia&&window.matchMedia("(max-width: 900px)").matches?"mobile":"desktop";
}
topToolsCollapsed=saved===null?viewport==="mobile":saved==="1";
function buildFilterOptions(){
  const ielts=uniq(words.flatMap(function(w){return arr(w.ieltsUse)}));
  const topics=uniq(words.flatMap(function(w){return arr(w.topics)}));
  const difficulty=uniq(words.map(function(w){return w.difficulty}));
  els.filterSelect.innerHTML=ielts.concat(topics,difficulty).join("");
}
function passFilterWith(activeFilter,w){
  if(restoreFocusWord&&norm(w.word)===norm(restoreFocusWord)) return true;
  if(activeFilter==="everything") return true;
  return w.status!=="熟悉";
}
function resolveIndexForFilter(activeFilter,options){
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
  return found;
}
function switchFilter(nextFilter){
  restoreFocusWord="";
  rememberPositionForCurrentFilter();
  filter=nextFilter||"all";
  progress.filter=filter;
  applyIndexForFilter(filter);
  render();
}
if(progress.currentWord) restoreFocusWord=progress.currentWord;
applyIndexForFilter(filter,{allowFirstFallback:false});
restoreFocusWord=remote.currentWord;
${LEGACY_TOUCH_SOURCE}`;

test("static CSS unlocks desktop height and adds compact laptop, mobile entry and 538-style swipe layouts", () => {
  const patched = patchStaticCss(`body{margin:0}@media(min-width:901px){${LOCKED_RULE}}`);

  assert.equal(patched.includes(LOCKED_RULE), false);
  assert.match(patched, /\.app\{height:auto;min-height:calc\(100svh - var\(--workspace-header\)\);overflow:visible\}/);
  assert.match(patched, /max-height:900px/);
  assert.match(patched, /\.example-card\{order:0/);
  assert.match(patched, /max-height:720px/);
  assert.match(patched, new RegExp(STATIC_FILTER_FIX_MARKER));
  assert.match(patched, /\.entry-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(patched, /\.static-study-card\{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;touch-action:pan-y;overscroll-behavior-x:contain\}/);
  assert.match(patched, /\.static-build-version\{/);
  assert.equal(patchStaticCss(patched), patched, "responsive CSS patch must be idempotent");
});

test("static app collapses tools by default on short laptop screens", () => {
  const patched = patchStaticAppJs(STATIC_FILTER_SOURCE);

  assert.match(patched, new RegExp(`APP_VERSION="${STATIC_RESPONSIVE_VERSION}"`));
  assert.match(patched, /max-height: 900px/);
  assert.match(patched, /compact-desktop/);
  assert.match(patched, /viewport==="mobile"\|\|viewport==="compact-desktop"/);
});

test("static filter switching never restores an out-of-filter word", () => {
  const patched = patchStaticAppJs(STATIC_FILTER_SOURCE);

  assert.doesNotMatch(patched, /if\(restoreFocusWord&&norm\(w\.word\)===norm\(restoreFocusWord\)\) return true/);
  assert.doesNotMatch(patched, /norm\(w\.word\)===saved\}\);/);
  assert.doesNotMatch(patched, /norm\(w\.word\)===currentKey\}\);/);
  assert.match(patched, /index=-1;\s*applyIndexForFilter\(filter\)/);
  assert.match(patched, /restoreFocusWord="";\s*applyIndexForFilter\(filter,\{allowFirstFallback:false\}\)/);
  assert.doesNotMatch(patched, /restoreFocusWord=remote\.currentWord/);
});

test("static categories use curated learning labels instead of raw workbook labels", () => {
  const patched = patchStaticAppJs(STATIC_FILTER_SOURCE);

  assert.match(patched, /基础必会/);
  assert.match(patched, /核心高频/);
  assert.match(patched, /生活\/工作高频/);
  assert.match(patched, /爱听写听力/);
  assert.match(patched, /"教育","工作","住房","交通"/);
  assert.doesNotMatch(patched, /uniq\(words\.flatMap/);
});

test("static mobile swipe matches the 538 touch-first gesture and keeps pointer as fallback only", () => {
  const patched = patchStaticAppJs(STATIC_FILTER_SOURCE);

  assert.match(patched, new RegExp(STATIC_SWIPE_FIX_MARKER));
  assert.match(patched, /staticStudyCard\.addEventListener\("touchstart"/);
  assert.match(patched, /staticStudyCard\.addEventListener\("touchend"/);
  assert.match(patched, /\{passive:false\}/);
  assert.match(patched, /!\("ontouchstart" in window\)&&"PointerEvent" in window/);
  assert.match(patched, /STATIC_SWIPE_INTERACTIVE_SELECTOR/);
  assert.match(patched, new RegExp(STATIC_SWIPE_ENGINE));
  assert.doesNotMatch(patched, /pointer-touch-v3/);

  assert.equal(resolveStaticSwipeStep({ dx: -70, dy: 8, durationMs: 280 }), 1);
  assert.equal(resolveStaticSwipeStep({ dx: 72, dy: 9, durationMs: 300 }), -1);
  assert.equal(resolveStaticSwipeStep({ dx: -55, dy: 2, durationMs: 200 }), 0);
  assert.equal(resolveStaticSwipeStep({ dx: -70, dy: 55, durationMs: 240 }), 0);
  assert.equal(resolveStaticSwipeStep({ dx: -80, dy: 4, durationMs: 850 }), 1);
  assert.equal(resolveStaticSwipeStep({ dx: -80, dy: 4, durationMs: 950 }), 0);
});

test("ZIP transformer patches the real study card, CSS, app JS and service worker", () => {
  const originalZip = createStoredZip([
    {
      name: "assets/style.css",
      data: Buffer.from(`@media(min-width:901px){${LOCKED_RULE}}`)
    },
    {
      name: "assets/app.js",
      data: Buffer.from(STATIC_FILTER_SOURCE)
    },
    {
      name: "index.html",
      data: Buffer.from('<!doctype html><html><head><link rel="stylesheet" href="./assets/style.css?v=old" /></head><body><main><section id="swipeArea" class="hero"></section><section class="blocks"></section><footer class="bottom"></footer></main></body></html>')
    },
    {
      name: "sw.js",
      data: Buffer.from('const CACHE_NAME="static_vocab_shell_old";const A="./assets/style.css?v=old";')
    },
    {
      name: "data/words.json",
      data: Buffer.from('{"words":[]}')
    }
  ]);

  const patchedZip = patchStaticExportZip(originalZip);
  const entries = new Map(
    readStoredZipEntries(patchedZip).map((entry) => [entry.name, entry.data.toString("utf8")])
  );

  assert.match(entries.get("assets/style.css"), new RegExp(STATIC_RESPONSIVE_MARKER));
  assert.match(entries.get("assets/style.css"), new RegExp(STATIC_FILTER_FIX_MARKER));
  assert.match(entries.get("assets/style.css"), /static-study-card\{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;touch-action:pan-y/);
  assert.match(entries.get("assets/app.js"), /index=-1/);
  assert.match(entries.get("assets/app.js"), /基础必会/);
  assert.match(entries.get("assets/app.js"), new RegExp(STATIC_SWIPE_FIX_MARKER));
  assert.match(entries.get("assets/app.js"), /touchstart/);
  assert.match(entries.get("assets/app.js"), /touchend/);
  assert.match(entries.get("build-info.json"), new RegExp(STATIC_SWIPE_ENGINE));
  assert.match(entries.get("build-info.json"), /ielts-538/);
  assert.match(entries.get("index.html"), new RegExp(`v=${STATIC_RESPONSIVE_VERSION}`));
  assert.match(entries.get("index.html"), /id="staticStudyCard"/);
  assert.match(entries.get("index.html"), /staticBuildVersion/);
  assert.match(entries.get("sw.js"), new RegExp(`static_vocab_shell_${STATIC_RESPONSIVE_VERSION}`));
  assert.equal(entries.get("data/words.json"), '{"words":[]}');
});

test("static export refuses to append swipe code outside the verified app scope", () => {
  assert.throws(
    () => patchStaticAppJs('const APP_VERSION="old";const unrelated=true;'),
    /refusing to export an unverified ZIP/
  );
});
