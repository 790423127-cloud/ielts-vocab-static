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
  assert.match(entries.get("assets/app.js"), /!\("ontouchstart" in window\)&&"PointerEvent" in window/);
  assert.doesNotMatch(entries.get("assets/app.js"), /pointer-touch-v3/);
  assert.match(entries.get("assets/style.css"), /static-study-card\{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;touch-action:pan-y/);
  assert.match(entries.get("index.html"), new RegExp(STATIC_RESPONSIVE_VERSION));
  assert.match(entries.get("index.html"), /id="staticStudyCard"/);
  assert.match(entries.get("index.html"), /staticBuildVersion/);
  assert.match(entries.get("sw.js"), new RegExp(STATIC_RESPONSIVE_VERSION));
  assert.match(entries.get("build-info.json"), new RegExp(STATIC_SWIPE_ENGINE));
  assert.match(entries.get("build-info.json"), /ielts-538/);
});
