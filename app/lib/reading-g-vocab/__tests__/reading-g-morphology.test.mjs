import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  organizeReadingGEntryMorphology,
  organizeReadingGMorphology
} from "../morphology.mjs";
import {
  enrichReadingGRelationMeanings,
  sanitizeReadingGRelations
} from "../relation-meanings.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("master morphology reclassifies mixed G-reading relations and removes duplicates", () => {
  const entry = {
    id: "rg_word_play",
    entryType: "word",
    word: "play",
    forms: [{ word: "player", type: "form", note: "legacy wrong bucket" }],
    wordFamily: ["played", { word: "player", meaning: "运动员" }, "play"]
  };
  const master = {
    word: "play",
    forms: [{ word: "played", type: "past tense" }],
    wordFamily: [
      { word: "player", pos: "noun", meaning: "运动员" },
      { word: "playful", pos: "adjective", meaning: "爱玩的" }
    ]
  };

  const result = organizeReadingGEntryMorphology(entry, master);

  assert.deepEqual(result.entry.forms.map((row) => [row.word, row.type]), [["played", "past tense"]]);
  assert.deepEqual(result.entry.wordFamily.map((row) => row.word), ["player", "playful"]);
  assert.equal(result.entry.wordFamily.some((row) => row.word === "played"), false);
  assert.equal(result.entry.wordFamily.some((row) => row.word === "play"), false);
  assert.ok(result.entry.sourceFiles.includes("public/data/words.json"));
  assert.ok(result.entry.qualityFlags.includes("master_morphology_merged"));
  assert.equal(result.stats.familyRowsMovedToForms, 1);
  assert.equal(result.stats.formRowsMovedToFamily, 1);
});

test("G-reading morphology without a master match is normalized but not invented", () => {
  const entry = {
    id: "rg_word_unmatched",
    entryType: "word",
    word: "unmatched",
    forms: ["unmatched", "unmatcheds", "unmatcheds"],
    wordFamily: ["unmatchedness", "unmatchedness"]
  };

  const result = organizeReadingGMorphology([entry], new Map());

  assert.deepEqual(result.items[0].forms.map((row) => row.word), ["unmatcheds"]);
  assert.deepEqual(result.items[0].wordFamily.map((row) => row.word), ["unmatchedness"]);
  assert.equal(result.stats.exactMasterMatches, 0);
  assert.equal(result.stats.masterFormsAdded, 0);
  assert.equal(result.stats.masterFamilyAdded, 0);
  assert.ok(result.stats.selfLinksRemoved > 0);
  assert.ok(result.stats.duplicateRowsMerged > 0);
});

test("cross-column duplicates keep the form column authoritative", () => {
  const entry = {
    id: "rg_word_walk",
    entryType: "word",
    word: "walk",
    forms: [{ word: "walked", type: "past tense" }],
    wordFamily: [{ word: "walked", meaning: "legacy duplicate" }, { word: "walker" }]
  };

  const result = organizeReadingGEntryMorphology(entry, null);

  assert.deepEqual(result.entry.forms.map((row) => row.word), ["walked"]);
  assert.deepEqual(result.entry.wordFamily.map((row) => row.word), ["walker"]);
  assert.equal(result.stats.crossCategoryDuplicatesRemoved, 1);
});

test("the core importer preserves source forms and word families in separate columns", () => {
  const importer = fs.readFileSync(path.join(root, "scripts/import-reading-core-layers.mjs"), "utf8");
  const satellite = fs.readFileSync(path.join(root, "app/components/SatelliteLexiconFlashcard.jsx"), "utf8");

  assert.match(importer, /const forms = asArray\(raw\.forms\)/);
  assert.match(importer, /mergeList\(entry\.forms, forms/);
  assert.match(importer, /const family = asArray\(raw\.wordFamily\)/);
  assert.doesNotMatch(importer, /raw\.wordFamily \|\| raw\.forms/);
  assert.match(satellite, /<div className="block-title">变形<\/div>/);
  assert.match(satellite, /<div className="block-title">词族<\/div>/);
  assert.match(satellite, /!isReadingG \? <div className="block">\s*<div className="block-title">常见搭配<\/div>/);
  assert.match(satellite, /!isReadingG \? <div className="block">\s*<div className="block-title">短语 \/ 介词搭配<\/div>/);
  assert.match(satellite, /form\.meaning \|\| form\.note \|\| getFormChineseType/);
});

test("every displayed form and family word receives a Chinese meaning", () => {
  const entry = {
    id: "rg_word_prepare",
    entryType: "word",
    word: "prepare",
    primaryMeaningZh: "准备",
    forms: [
      {
        word: "prepared",
        type: "past tense / past participle",
        meaning: "全题库阅读词汇（总词库待补）"
      },
      { word: "preparing", type: "form" }
    ],
    wordFamily: [
      { word: "preparation", pos: "noun" },
      { word: "prepar", relation: "related-to" }
    ]
  };
  const masterByKey = new Map([["preparation", { word: "preparation", meaning: "准备；筹备" }]]);
  const result = enrichReadingGRelationMeanings([entry], masterByKey);
  const enriched = result.items[0];

  assert.match(enriched.forms.find((row) => row.word === "prepared").meaning, /准备.*过去式或过去分词/);
  assert.match(enriched.forms.find((row) => row.word === "preparing").meaning, /准备.*现在分词或动名词/);
  assert.equal(enriched.wordFamily.find((row) => row.word === "preparation").meaning, "准备；筹备");
  assert.equal(enriched.wordFamily.some((row) => row.word === "prepar"), false);
  assert.equal(result.stats.invalidFamilyStemsRemoved, 1);
  assert.equal(enriched.forms.every((row) => row.meaning), true);
  assert.equal(enriched.wordFamily.every((row) => row.meaning), true);
});

test("relation audit removes spelling-prefix false positives but keeps real morphology", () => {
  const items = [
    {
      id: "rg_word_care",
      entryType: "word",
      word: "care",
      primaryPos: "noun / verb",
      primaryMeaningZh: "关心；照顾",
      forms: [
        { word: "career", type: "corpus-observed-form" },
        { word: "cares", type: "third-person singular" },
        { word: "cared", type: "past tense / past participle" }
      ],
      wordFamily: [{ word: "careful", pos: "adjective", meaning: "小心的；仔细的" }]
    },
    {
      id: "rg_word_career",
      entryType: "word",
      word: "career",
      primaryPos: "noun",
      primaryMeaningZh: "职业；生涯",
      forms: [],
      wordFamily: []
    }
  ];

  const result = sanitizeReadingGRelations(items, new Map());
  const care = result.items[0];

  assert.deepEqual(care.forms.map((row) => row.word), ["cares", "cared"]);
  assert.deepEqual(care.wordFamily.map((row) => row.word), ["careful"]);
  assert.equal(result.stats.unsafeFormRowsRemoved, 1);
});

test("relation audit removes known false pairs and preserves compacted aliases", () => {
  const items = [
    {
      id: "rg_word_fee",
      entryType: "word",
      word: "fee",
      primaryPos: "noun",
      primaryMeaningZh: "费用",
      forms: [{ word: "feed", type: "corpus-observed-form" }],
      wordFamily: []
    },
    {
      id: "rg_word_find",
      entryType: "word",
      word: "find",
      primaryPos: "verb",
      primaryMeaningZh: "找到；发现",
      forms: [],
      wordFamily: [{ word: "foundation", pos: "noun", meaning: "基础；基金会" }]
    },
    {
      id: "rg_word_feed",
      entryType: "word",
      word: "feed",
      primaryPos: "verb",
      primaryMeaningZh: "喂养；饲料",
      forms: [],
      wordFamily: []
    },
    {
      id: "rg_word_access",
      entryType: "word",
      word: "access",
      primaryPos: "noun / verb",
      primaryMeaningZh: "进入；使用权",
      forms: [{
        word: "accessible",
        pos: "adjective",
        meaning: "可进入的；可使用的",
        relation: "merged-independent-entry"
      }],
      wordFamily: []
    }
  ];

  const result = sanitizeReadingGRelations(items, new Map());
  const byWord = new Map(result.items.map((entry) => [entry.word, entry]));

  assert.equal(byWord.get("fee").forms.length, 0);
  assert.equal(byWord.get("find").wordFamily.length, 0);
  assert.equal(byWord.get("access").forms[0].word, "accessible");
  assert.equal(byWord.get("access").forms[0].relation, "merged-independent-entry");
});
