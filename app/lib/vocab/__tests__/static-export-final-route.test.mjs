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
  assert.match(entries.get("assets/app.js"), /staticStudyCard\.addEventListener\("touchstart"/);
  assert.match(entries.get("assets/app.js"), /staticStudyCard\.addEventListener\("touchend"/);
  assert.match(entries.get("assets/app.js"), /audio=new Audio\(url\)/);
  assert.match(entries.get("assets/app.js"), /audio\.playsInline=true/);
  assert.match(entries.get("assets/app.js"), /audio\.volume=1/);
  assert.doesNotMatch(entries.get("assets/app.js"), /createMediaElementSource/);
  assert.match(entries.get("assets/app.js"), /function previewWordForFilter/);
  assert.match(entries.get("assets/app.js"), /count<=0\)return ""/);
  assert.match(entries.get("assets/app.js"), /function seekProgressPosition/);
  assert.match(entries.get("assets/app.js"), /progressSeek\.oninput/);
  assert.match(entries.get("assets/app.js"), /progressJumpForm\.onsubmit/);
  assert.match(entries.get("assets/app.js"), /progressJumpInput\.blur\(\)/);
  assert.match(entries.get("assets/app.js"), /const WORD_ORDER_SNAPSHOT_VERSION=4/);
  assert.match(entries.get("assets/app.js"), /function difficultySortKey/);
  assert.match(entries.get("assets/app.js"), /function familyConnectedGroups/);
  assert.match(entries.get("assets/app.js"), /function filterDifficultyTier/);
  assert.match(entries.get("assets/app.js"), /sceneBonus=current\.scene/);
  assert.match(entries.get("assets/app.js"), /let studyListCache=new Map\(\)/);
  assert.match(entries.get("assets/app.js"), /arr\(snapshot\.indices\)\.includes\(index\)/);
  assert.match(entries.get("assets/app.js"), /function changeWordOrderCombination[\s\S]*?persistNow\(\);[\s\S]*?const currentWord=currentRaw\(\)/);
  assert.match(entries.get("assets/app.js"), /\.skip\(offset\)[\s\S]*?\.limit\(CLOUD_PROGRESS_PAGE_SIZE\)/);
  assert.match(entries.get("assets/app.js"), /\.doc\(deviceDocId\)\.set\(payload\)/);
  assert.doesNotMatch(entries.get("assets/app.js"), /collection\("vocab_progress"\)\.add\(payload\)/);
  assert.doesNotMatch(entries.get("assets/app.js"), /saved\?words\.find/);
  assert.match(entries.get("assets/app.js"), /!\("ontouchstart" in window\)&&"PointerEvent" in window/);
  assert.doesNotMatch(entries.get("assets/app.js"), /pointer-touch-v3/);
  assert.match(entries.get("assets/style.css"), /static-study-card\{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;touch-action:pan-y/);
  assert.match(entries.get("index.html"), new RegExp(STATIC_RESPONSIVE_VERSION));
  assert.match(entries.get("index.html"), /id="staticStudyCard"/);
  assert.match(entries.get("index.html"), /id="progressSeek"/);
  assert.match(entries.get("index.html"), /id="progressJumpInput"/);
  assert.match(entries.get("index.html"), /id="staticMobileInputZoomFix"/);
  assert.match(entries.get("index.html"), /input,textarea\{font-size:16px!important\}/);
  assert.match(entries.get("index.html"), /staticBuildVersion/);
  assert.match(entries.get("sw.js"), new RegExp(STATIC_RESPONSIVE_VERSION));
  assert.match(entries.get("sw.js"), /url\.pathname\.endsWith\("\/reading-words\.html"\)/);
  assert.match(entries.get("reading-words.html"), /id="favoriteBtn"/);
  assert.match(entries.get("reading-words.html"), /id="deleteBtn"/);
  assert.match(entries.get("reading-words.html"), /id="staticMobileInputZoomFix"/);
  assert.match(entries.get("assets/reading-words.js"), /deleteCurrentReadingWord/);
  assert.match(entries.get("assets/reading-words.js"), /shouldHandleDeleteShortcut/);
  assert.match(entries.get("assets/reading-words.js"), /synonymListHtml/);
  assert.match(entries.get("assets/reading-words.js"), /linked\?\.meaning/);
  assert.match(entries.get("assets/reading-words.css"), /\.synonym-row/);
  assert.ok(
    entries.get("assets/reading-words.js").indexOf("const SYNONYM_VARIANT_KEY") <
      entries.get("assets/reading-words.js").indexOf("words = readReadingWords()"),
    "stored reading words must load only after synonym variants are initialized"
  );
  assert.match(entries.get("assets/reading-words.css"), /repeat\(6,minmax\(0,1fr\)\)/);
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
