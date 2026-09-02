import test from "node:test";
import assert from "node:assert/strict";

import { buildReadingGMasterReusePlan } from "../master-content-reuse.mjs";

function payload(entry) {
  return { count: 1, items: [entry] };
}

function master(entry) {
  return { count: 1, words: [entry] };
}

test("master reuse fills missing G fields without replacing existing teaching content or state", () => {
  const plan = buildReadingGMasterReusePlan(payload({
    id: "rg_alpha",
    entryType: "word",
    studyMode: "active",
    word: "alpha",
    meaning: "G 类原释义",
    example: "Existing G example.",
    exampleCn: "G 类原例句。",
    favorite: true,
    status: "learning",
    forms: [],
    wordFamily: [],
    collocations: []
  }), master({
    id: "word_alpha",
    word: "alpha",
    phonetic: "/alpha/",
    meaning: "主词库释义",
    example: "Master example.",
    exampleCn: "主词库例句。",
    forms: [{ word: "alphas", type: "plural" }],
    wordFamily: [{ word: "alphabet", pos: "noun", meaning: "字母表" }],
    collocations: [{ phrase: "alpha version", chinese: "测试初版" }]
  }));
  const entry = plan.payload.items[0];

  assert.equal(entry.meaning, "G 类原释义");
  assert.equal(entry.example, "Existing G example.");
  assert.equal(entry.exampleCn, "G 类原例句。");
  assert.equal(entry.favorite, true);
  assert.equal(entry.status, "learning");
  assert.equal(entry.phonetic, "/alpha/");
  assert.equal(entry.forms[0].word, "alphas");
  assert.equal(entry.wordFamily[0].word, "alphabet");
  assert.equal(entry.collocations[0].phrase, "alpha version");
  assert.equal(plan.report.stableIdsChanged, 0);
  assert.equal(plan.report.userStateChanged, 0);
});

test("master reuse repairs an unsplit multi-POS G sense from reviewed master senses", () => {
  const plan = buildReadingGMasterReusePlan(payload({
    id: "rg_ban",
    entryType: "word",
    word: "ban",
    pos: "verb/noun",
    primaryPos: "verb/noun",
    meaning: "禁止；禁令",
    definition: "禁止；禁令",
    meaningDetailZh: "作动词表示禁止，作名词表示禁令。",
    example: "Smoking is banned.",
    exampleCn: "禁止吸烟。",
    senses: [{ pos: "verb/noun", meaningZh: "禁止；禁令" }]
  }), master({
    id: "word_ban",
    word: "ban",
    pos: "verb/noun",
    senses: [
      { pos: "verb", meaningZh: "禁止", definition: "正式禁止" },
      { pos: "noun", meaningZh: "禁令", definition: "禁止某事的规定" }
    ]
  }));
  const entry = plan.payload.items[0];

  assert.deepEqual(entry.senses.map((sense) => sense.pos), ["verb", "noun"]);
  assert.ok(plan.report.fieldCounts.senses === 1);
});

test("master reuse is idempotent", () => {
  const g = payload({ id: "rg_alpha", entryType: "word", word: "alpha", forms: [] });
  const source = master({ id: "word_alpha", word: "alpha", forms: [{ word: "alphas", type: "plural" }] });
  const first = buildReadingGMasterReusePlan(g, source);
  const second = buildReadingGMasterReusePlan(first.payload, source);

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
});

test("master reuse preserves a reviewed empty morphology result", () => {
  const plan = buildReadingGMasterReusePlan(payload({
    id: "rg_able",
    entryType: "word",
    word: "able",
    forms: [],
    wordFamily: []
  }), master({
    id: "word_able",
    word: "able",
    forms: [],
    formsReviewed: true,
    wordFamily: [],
    wordFamilyReviewed: true
  }));
  const entry = plan.payload.items[0];

  assert.equal(entry.formsReviewed, true);
  assert.equal(entry.wordFamilyReviewed, true);
  assert.equal(entry.formsReviewSource, "master-lexicon");
  assert.equal(entry.wordFamilyReviewSource, "master-lexicon");
});

test("master reuse never expands non-empty G morphology lists", () => {
  const plan = buildReadingGMasterReusePlan(payload({
    id: "rg_alpha",
    entryType: "word",
    word: "alpha",
    forms: [{ word: "alphas", type: "plural", note: "G note" }],
    wordFamily: [{ word: "alphabet", pos: "noun", meaning: "G family" }]
  }), master({
    id: "word_alpha",
    word: "alpha",
    forms: [
      { word: "alphas", type: "plural", note: "master note" },
      { word: "alphaed", type: "past tense" }
    ],
    wordFamily: [
      { word: "alphabet", pos: "noun", meaning: "master family" },
      { word: "alphabetic", pos: "adjective", meaning: "按字母顺序的" }
    ]
  }));
  const entry = plan.payload.items[0];

  assert.deepEqual(entry.forms, [{ word: "alphas", type: "plural", note: "G note" }]);
  assert.deepEqual(entry.wordFamily, [{ word: "alphabet", pos: "noun", meaning: "G family" }]);
});
