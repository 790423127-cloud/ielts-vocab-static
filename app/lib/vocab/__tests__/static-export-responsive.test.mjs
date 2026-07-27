import test from "node:test";
import assert from "node:assert/strict";

import {
  createStoredZip,
  patchStaticAppJs,
  patchStaticCss,
  patchStaticExportZip,
  readStoredZipEntries,
  STATIC_FILTER_FIX_MARKER,
  STATIC_RESPONSIVE_MARKER,
  STATIC_RESPONSIVE_VERSION
} from "../../static-export-responsive.mjs";

const LOCKED_RULE =
  ".app{height:calc(100svh - var(--workspace-header));min-height:calc(100svh - var(--workspace-header));overflow:hidden}";

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
restoreFocusWord=remote.currentWord;`;

test("static CSS unlocks desktop height and adds compact laptop and mobile entry layouts", () => {
  const patched = patchStaticCss(`body{margin:0}@media(min-width:901px){${LOCKED_RULE}}`);

  assert.equal(patched.includes(LOCKED_RULE), false);
  assert.match(patched, /\.app\{height:auto;min-height:calc\(100svh - var\(--workspace-header\)\);overflow:visible\}/);
  assert.match(patched, /max-height:900px/);
  assert.match(patched, /\.example-card\{order:0/);
  assert.match(patched, /max-height:720px/);
  assert.match(patched, new RegExp(STATIC_FILTER_FIX_MARKER));
  assert.match(patched, /\.entry-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
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

test("ZIP transformer patches CSS, app JS, HTML and service worker", () => {
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
      data: Buffer.from('<link rel="stylesheet" href="./assets/style.css?v=old" />')
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
  assert.match(entries.get("assets/app.js"), /index=-1/);
  assert.match(entries.get("assets/app.js"), /基础必会/);
  assert.match(entries.get("index.html"), new RegExp(`v=${STATIC_RESPONSIVE_VERSION}`));
  assert.match(entries.get("sw.js"), new RegExp(`static_vocab_shell_${STATIC_RESPONSIVE_VERSION}`));
  assert.equal(entries.get("data/words.json"), '{"words":[]}');
});
