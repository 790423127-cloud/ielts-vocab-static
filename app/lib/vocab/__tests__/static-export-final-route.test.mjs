import test from "node:test";
import assert from "node:assert/strict";

import { POST } from "../../../api/export-static/route.js";
import {
  readStoredZipEntries,
  STATIC_RESPONSIVE_VERSION,
  STATIC_SWIPE_ENGINE,
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

test("the real export endpoint returns a verified 538-style mobile-swipe ZIP", async () => {
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
  assert.match(entries.get("assets/app.js"), new RegExp(STATIC_SWIPE_ENGINE));
  assert.match(entries.get("assets/app.js"), /window\.StaticCardSwipe\.bind\(staticStudyCard/);
  assert.match(entries.get("assets/static-navigation.js"), /card\.addEventListener\("touchstart"/);
  assert.match(entries.get("assets/static-navigation.js"), /card\.addEventListener\("touchend"/);
  assert.match(entries.get("assets/app.js"), /audio=new Audio\(url\)/);
  assert.match(entries.get("assets/app.js"), /audio\.playsInline=true/);
  assert.match(entries.get("assets/app.js"), /audio\.volume=1/);
  assert.doesNotMatch(entries.get("assets/app.js"), /createMediaElementSource/);
  assert.match(entries.get("assets/app.js"), /function previewWordForFilter/);
  assert.match(entries.get("assets/app.js"), /let mainDeleteConfirmedInSession=false/);
  assert.match(entries.get("assets/app.js"), /if\(!mainDeleteConfirmedInSession\)/);
  assert.match(entries.get("assets/app.js"), /function inlineStudyMeaning\(item\)/);
  assert.match(entries.get("assets/app.js"), /supplementalMeanings/);
  assert.match(entries.get("index.html"), /id="meaningDetailText"/);
  assert.match(entries.get("assets/app.js"), /function mainMeaningDetail\(item,meaning\)/);
  assert.match(entries.get("assets/app.js"), /meaningDetailText\.textContent=mainMeaningDetail/);
  assert.match(entries.get("assets/app.js"), /现有资料只确认了主释义，语义范围和实际用法仍待补充/);
  assert.doesNotMatch(entries.get("assets/app.js"), /在当前词条中作.*使用，主要表示/);
  assert.match(entries.get("reading-g.html"), /id="meaningDetailText"/);
  assert.match(entries.get("assets/reading-g.js"), /function mainMeaningDetail\(item, meaning\)/);
  assert.doesNotMatch(entries.get("assets/reading-g.js"), /在当前词条中作.*使用，主要表示/);
  assert.match(entries.get("reading-words.html"), /id="meaningDetailText"/);
  assert.match(entries.get("assets/reading-words.js"), /function mainMeaningDetail\(entry, meaning\)/);
  assert.doesNotMatch(entries.get("assets/reading-words.js"), /在当前词条中作.*使用，主要表示/);
  assert.doesNotMatch(entries.get("assets/app.js"), /其他释义|meaning-other/);
  assert.match(entries.get("assets/app.js"), /count<=0\)return ""/);
  assert.match(entries.get("assets/app.js"), /function seekProgressPosition/);
  assert.match(entries.get("assets/app.js"), /progressSeek\.oninput/);
  assert.match(entries.get("assets/app.js"), /progressJumpForm\.onsubmit/);
  assert.match(entries.get("assets/app.js"), /progressJumpInput\.blur\(\)/);
  assert.match(entries.get("assets/app.js"), /const WORD_ORDER_SNAPSHOT_VERSION=5/);
  assert.match(entries.get("assets/app.js"), /ORDERING_MODULE_ROOT="\.\/study-ordering-v64\/"/);
  assert.match(entries.get("assets/app.js"), /sharedWordStudyOrdering\.orderStudyWordIndices/);
  assert.match(entries.get("assets/app.js"), /let studyListCache=new Map\(\)/);
  assert.match(entries.get("assets/app.js"), /arr\(snapshot\.indices\)\.includes\(index\)/);
  assert.match(entries.get("assets/app.js"), /function changeWordOrderCombination[\s\S]*?persistNow\(\);[\s\S]*?const currentWord=currentRaw\(\)/);
  assert.match(entries.get("assets/app.js"), /\.skip\(offset\)[\s\S]*?\.limit\(CLOUD_PROGRESS_PAGE_SIZE\)/);
  assert.match(entries.get("assets/app.js"), /\.doc\(deviceDocId\)\.set\(payload\)/);
  assert.doesNotMatch(entries.get("assets/app.js"), /collection\("vocab_progress"\)\.add\(payload\)/);
  assert.doesNotMatch(entries.get("assets/app.js"), /saved\?words\.find/);
  assert.match(entries.get("assets/static-navigation.js"), /if \("PointerEvent" in window\)/);
  assert.match(entries.get("assets/static-navigation.js"), /data-static-swipe-handle/);
  assert.match(entries.get("assets/static-navigation.js"), /suppressClickUntil/);
  assert.doesNotMatch(entries.get("assets/app.js"), /pointer-touch-v3/);
  assert.match(entries.get("assets/style.css"), /static-study-card\{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;touch-action:pan-y/);
  assert.match(entries.get("assets/style.css"), /body\.reading-g-static \.reading-g-topbar/);
  assert.match(entries.get("assets/style.css"), /body\.reading-g-static \.reading-g-topbar\.is-tools-collapsed \.top-actions\{display:none\}/);
  assert.match(entries.get("assets/style.css"), /body\.reading-g-static \.hero\{flex:0 0 auto;min-height:0/);
  assert.match(entries.get("basic.html"), /id="statusSummary"/);
  assert.match(entries.get("basic.html"), /id="basicTopbar" class="top basic-topbar"/);
  assert.match(entries.get("basic.html"), /id="topToolsToggle"/);
  assert.match(entries.get("basic.html"), /id="basicFilterPanel" class="basic-filter-panel"/);
  assert.match(entries.get("assets/basic.js"), /学习状态：待学/);
  assert.match(entries.get("assets/basic.js"), /全部待学 " \+ summary\.pending/);
  assert.match(entries.get("assets/basic.js"), /buildTopics\(\);\s*render\(\);/);
  assert.match(entries.get("assets/basic.js"), /function setTopToolsCollapsed/);
  assert.match(entries.get("assets/style.css"), /body\.basic-static \.basic-topbar\{/);
  assert.match(entries.get("ielts-538.html"), /body class="basic-static ielts-538-static"/);
  assert.match(entries.get("ielts-538.html"), /main class="app" data-study-surface="ielts-538"/);
  assert.match(entries.get("ielts-538.html"), /id="basicTopbar" class="top basic-topbar"/);
  assert.match(entries.get("ielts-538.html"), /id="studyCard" class="hero" data-static-swipe-card/);
  assert.match(entries.get("ielts-538.html"), /footer class="bottom"/);
  assert.match(entries.get("ielts-538.html"), /id="paraphrase" class="forms-box study538-para/);
  assert.match(entries.get("assets/ielts-538.js"), /function setTopToolsCollapsed/);
  assert.match(entries.get("assets/ielts-538.js"), /学习状态：待学/);
  assert.match(entries.get("assets/static-navigation.js"), /(?:const|var) groups\s*=\s*\[/);
  assert.match(entries.get("assets/static-navigation.js"), /STATIC_SWIPE_VERSION = "touch-pointer-v5"/);
  assert.match(entries.get("assets/static-navigation.js"), /window\.StaticCardSwipe/);
  assert.match(entries.get("assets/static-navigation.js"), /if \("PointerEvent" in window\)/);
  assert.match(entries.get("assets/static-navigation.js"), /addEventListener\("pointerdown"/);
  assert.match(entries.get("assets/static-navigation.js"), /addEventListener\("touchstart"/);
  assert.match(entries.get("assets/static-navigation.js"), /button,a,input,textarea,select,option,label,summary,details/);
  assert.match(entries.get("assets/static-cloud-sync.js"), /window\.StaticCloudSync/);
  assert.match(entries.get("assets/static-cloud-sync.js"), /module_progress_/);
  assert.match(entries.get("assets/static-navigation.js"), /阅读同义替换/);
  assert.match(entries.get("assets/static-navigation.js"), /阅读生词本/);
  assert.match(entries.get("reading-g.html"), /body class="reading-g-static"/);
  assert.match(entries.get("reading-g.html"), /id="staticStudyCard" class="static-study-card" data-static-swipe-card/);
  assert.match(entries.get("reading-g.html"), /id="swipeArea" class="hero"[\s\S]*id="relationBlocks"[\s\S]*<\/div>[\s\S]*<footer class="bottom"/);
  assert.match(entries.get("reading-g.html"), /id="wordOrderSelect"/);
  assert.match(entries.get("reading-g.html"), /id="progressSeek"/);
  assert.match(entries.get("reading-g.html"), /id="progressJump"/);
  assert.match(entries.get("reading-g.html"), /id="difficultyOrderSelect"/);
  assert.match(entries.get("reading-g.html"), /id="entrySelect"/);
  assert.match(entries.get("reading-g.html"), /id="readingEntryBtn"/);
  assert.match(entries.get("assets/reading-g.js"), /function staticPosDisplay\(/);
  assert.match(entries.get("assets/reading-g.js"), /function orderStudyIndices\(/);
  assert.match(entries.get("assets/reading-g.js"), /sharedWordStudyOrdering\.orderStudyWordIndices/);
  assert.match(entries.get("assets/reading-g.js"), /function applyOrderPreference\(/);
  assert.match(entries.get("assets/reading-g.js"), /function seekStudyPosition\(/);
  assert.match(entries.get("assets/reading-g.js"), /function inlineStaticStudyMeaning\(/);
  assert.doesNotMatch(entries.get("assets/reading-g.js"), /renderStaticSenseHint|senseHint|其他义项/);
  assert.doesNotMatch(entries.get("reading-g.html"), /senseHint|sense-hint/);
  assert.match(entries.get("assets/reading-g.js"), /同义引导·10组/);
  assert.doesNotMatch(entries.get("assets/reading-g.js"), /filter\(function \(row\) \{ return row\.word; \}\)\.slice\(0, 6\)/);
  assert.match(entries.get("index.html"), new RegExp(STATIC_RESPONSIVE_VERSION));
  assert.match(entries.get("index.html"), /id="staticStudyCard"/);
  assert.match(entries.get("index.html"), /id="progressSeek"/);
  assert.match(entries.get("index.html"), /id="progressJumpInput"/);
  assert.match(entries.get("index.html"), /id="staticMobileInputZoomFix"/);
  assert.match(entries.get("index.html"), /input,textarea\{font-size:16px!important\}/);
  assert.match(entries.get("index.html"), /staticBuildVersion/);
  assert.match(entries.get("sw.js"), new RegExp(STATIC_RESPONSIVE_VERSION));
  assert.match(entries.get("sw.js"), /assets\/static-navigation\.js/);
  assert.match(entries.get("sw.js"), /assets\/static-font-scale\.js/);
  assert.ok(entries.has("assets/static-font-scale.js"));
  [
    "word-study-ordering.mjs",
    "word-internal-difficulty.mjs",
    "word-internal-difficulty.generated.mjs",
    "word-surface-morphology.mjs"
  ].forEach((name) => {
    assert.ok(entries.has(`assets/study-ordering-v64/${name}`), `${name} is packaged`);
    assert.match(entries.get("sw.js"), new RegExp(`assets/study-ordering-v64/${name.replace(".", "\\.")}`));
  });
  assert.match(entries.get("sw.js"), /url\.pathname\.endsWith\("\/reading-words\.html"\)/);
  assert.match(entries.get("reading-words.html"), /id="favoriteBtn"/);
  assert.match(entries.get("reading-words.html"), /id="deleteBtn"/);
  assert.match(entries.get("reading-words.html"), /id="progressSeek"/);
  assert.match(entries.get("reading-words.html"), /id="progressJumpForm"/);
  assert.match(entries.get("reading-words.html"), /id="staticMobileInputZoomFix"/);
  assert.match(entries.get("assets/reading-words.js"), /deleteCurrentReadingWord/);
  assert.match(entries.get("assets/reading-words.js"), /applyPublishedSnapshot/);
  assert.ok(entries.has("data/personal-reading-words.json"));
  assert.match(entries.get("assets/reading-words.js"), /shouldHandleDeleteShortcut/);
  assert.match(entries.get("assets/reading-words.js"), /synonymListHtml/);
  assert.match(entries.get("assets/reading-words.js"), /function seekStudyPosition/);
  assert.match(entries.get("assets/reading-words.js"), /function inlineStudyMeaningText\(/);
  assert.match(entries.get("assets/reading-words.js"), /meaningText\.textContent = inlineStudyMeaningText\(current\)/);
  assert.match(entries.get("assets/reading-words.js"), /READING_SESSION_KEY/);
  assert.match(entries.get("assets/reading-words.js"), /linked\?\.meaning/);
  assert.match(entries.get("assets/reading-words.css"), /\.synonym-row/);
  assert.ok(
    entries.get("assets/reading-words.js").indexOf("const SYNONYM_VARIANT_KEY") <
      entries.get("assets/reading-words.js").indexOf("words = readReadingWords()"),
    "stored reading words must load only after synonym variants are initialized"
  );
  assert.match(entries.get("assets/reading-words.css"), /repeat\(6,minmax\(0,1fr\)\)/);
  ["index.html", "spelling.html", "basic.html", "meaning.html", "reading-g.html", "reading-paraphrases.html", "reading-words.html", "ielts-538.html"].forEach((name) => {
    assert.match(entries.get(name), /data-static-primary-nav/, `${name} exposes shared primary navigation`);
    assert.match(entries.get(name), /data-static-sidebar/, `${name} exposes shared sidebar navigation`);
    assert.match(entries.get(name), /assets\/static-navigation\.js/, `${name} loads shared navigation source`);
  });
  ["basic.html", "reading-g.html", "reading-paraphrases.html", "reading-words.html", "ielts-538.html"].forEach((name) => {
    assert.match(entries.get(name), /data-static-swipe-card/, `${name} opts into shared pointer/touch swipe`);
  });
  ["spelling.html", "basic.html", "meaning.html", "reading-g.html", "ielts-538.html"].forEach((name) => {
    assert.match(entries.get(name), /assets\/static-cloud-sync\.js/, `${name} loads shared module cloud sync`);
  });
  assert.match(entries.get("assets/basic.js"), /StaticCloudSync\.register\("basic"/);
  assert.match(entries.get("assets/ielts-538.js"), /StaticCloudSync\.register\("ielts-538"/);
  assert.match(entries.get("assets/reading-g.js"), /StaticCloudSync\.register\("reading-g"/);
  assert.match(entries.get("assets/basic.js"), new RegExp(`DATA_VERSION = "${STATIC_RESPONSIVE_VERSION}"`));
  assert.match(entries.get("assets/spelling.js"), new RegExp(`STATIC_DATA_VERSION = "${STATIC_RESPONSIVE_VERSION}"`));
  assert.match(entries.get("assets/reading-g.js"), new RegExp(`DATA_VERSION = "${STATIC_RESPONSIVE_VERSION}"`));
  assert.match(entries.get("assets/meaning-static.js"), new RegExp(`DATA_VERSION = "${STATIC_RESPONSIVE_VERSION}"`));
  assert.match(entries.get("assets/reading-words.js"), new RegExp(`VERSION = "${STATIC_RESPONSIVE_VERSION}"`));
  const tidyAudit = JSON.parse(entries.get("data/lexicon-tidy-audit.json"));
  assert.equal(tidyAudit.version, 1);
  assert.ok(Object.keys(tidyAudit.records || {}).length > 0);
  assert.match(entries.get("build-info.json"), new RegExp(STATIC_SWIPE_ENGINE));
  assert.match(entries.get("build-info.json"), /ielts-538/);
});
