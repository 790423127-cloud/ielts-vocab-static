import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildReadingGAiMasterSyncPlan,
  buildReadingGMasterDeletionPlan
} from "../master-content-sync.mjs";

function completedGEntry(overrides = {}) {
  return {
    id: "rg_word_alpha",
    entryType: "word",
    word: "alpha",
    sourceWordId: "word_alpha",
    qualityFlags: ["reading_g_ai_completed"],
    phonetic: "/ˈælfə/",
    pos: "noun",
    difficulty: "中级核心",
    meaning: "阿尔法；开端",
    definition: "the first letter of the Greek alphabet",
    meaningDetailZh: "指希腊字母表的第一个字母，也可指开端。",
    example: "Alpha is the first letter of the Greek alphabet.",
    exampleCn: "alpha 是希腊字母表的第一个字母。",
    forms: [{ word: "alphas", type: "plural" }],
    wordFamily: [{ word: "alphabet", pos: "noun", meaning: "字母表" }],
    synonyms: ["first"],
    synonymDetails: [{ word: "first", pos: "adjective", meaningZh: "第一的" }],
    collocations: [{ phrase: "alpha version", chinese: "测试初版" }],
    phraseCollocations: [{ phrase: "the alpha and omega", chinese: "始终；全部" }],
    otherMeanings: [{
      pos: "noun",
      meaningZh: "领先者",
      definitionEn: "the most dominant member of a group",
      example: "The alpha led the group.",
      exampleCn: "领先者带领着这个群体。"
    }],
    ...overrides
  };
}

test("G AI master sync fills only missing fields and preserves master learning content", () => {
  const master = {
    count: 2,
    words: [
      {
        id: "word_alpha",
        wordId: "word_alpha",
        word: "alpha",
        meaning: "原有释义",
        example: "Existing example.",
        exampleCn: "现有例句。",
        status: "不熟",
        favorite: true,
        forms: []
      },
      { id: "word_beta", wordId: "word_beta", word: "beta", meaning: "测试版" }
    ]
  };
  const plan = buildReadingGAiMasterSyncPlan(master, [
    completedGEntry(),
    completedGEntry({ id: "rg_word_missing", word: "missing", sourceWordId: "", qualityFlags: ["reading_g_ai_completed"] })
  ]);
  const alpha = plan.nextWords[0];

  assert.equal(plan.report.updatedCount, 1);
  assert.equal(plan.report.addedCount, 1);
  assert.equal(plan.report.matchedBySourceWordId, 1);
  assert.deepEqual(plan.report.unmatched, []);
  assert.equal(alpha.meaning, "原有释义");
  assert.equal(alpha.example, "Existing example.");
  assert.equal(alpha.exampleCn, "现有例句。");
  assert.equal(alpha.status, "不熟");
  assert.equal(alpha.favorite, true);
  assert.equal(alpha.phonetic, "/ˈælfə/");
  assert.equal(alpha.definition, "the first letter of the Greek alphabet");
  assert.equal(alpha.difficulty, "中级核心");
  assert.equal(alpha.forms.length, 1);
  assert.equal(alpha.wordFamily.length, 1);
  assert.deepEqual(alpha.synonyms, ["first"]);
  assert.equal(alpha.synonymDetails.length, 1);
  assert.equal(plan.nextWords[2].word, "missing");
  assert.equal(plan.nextWords[2].addedFromReadingG, true);
  assert.equal(plan.nextWords[2].source, "reading-g-ai");
  assert.equal(plan.nextWords[2].difficulty, "中级核心");
});

test("G AI master sync normalizes Reading G logic difficulty for the master lexicon", () => {
  const plan = buildReadingGAiMasterSyncPlan({
    count: 1,
    words: [{ id: "word_alpha", wordId: "word_alpha", word: "alpha" }]
  }, [completedGEntry({
    id: "rg_word_logic",
    word: "logicword",
    sourceWordId: "",
    difficulty: "阅读逻辑核心"
  })]);

  assert.equal(plan.nextWords[1].difficulty, "阅读扩展");
});

test("G AI master sync accepts definition-only additional common senses", () => {
  const source = completedGEntry({
    otherMeanings: [{
      pos: "noun",
      meaningZh: "领先者",
      definitionEn: "the most dominant member of a group"
    }]
  });
  const plan = buildReadingGAiMasterSyncPlan({
    count: 1,
    words: [{ id: "word_alpha", wordId: "word_alpha", word: "alpha" }]
  }, [source]);

  assert.equal(plan.nextWords[0].otherMeanings.length, 1);
  assert.equal(plan.nextWords[0].otherMeanings[0].example, undefined);
});

test("G AI master sync keeps an example pair atomic", () => {
  const source = completedGEntry({ example: "Correct pair.", exampleCn: "正确配对。" });
  const mismatched = buildReadingGAiMasterSyncPlan({
    count: 1,
    words: [{ id: "word_alpha", wordId: "word_alpha", word: "alpha", example: "Existing example." }]
  }, [source]);
  assert.equal(mismatched.nextWords[0].example, "Existing example.");
  assert.equal(mismatched.nextWords[0].exampleCn, undefined);

  const empty = buildReadingGAiMasterSyncPlan({
    count: 1,
    words: [{ id: "word_alpha", wordId: "word_alpha", word: "alpha" }]
  }, [source]);
  assert.equal(empty.nextWords[0].example, "Correct pair.");
  assert.equal(empty.nextWords[0].exampleCn, "正确配对。");
});

test("G AI master sync never copies retired pending senses into the master lexicon", () => {
  const source = completedGEntry({
    word: "boar",
    sourceWordId: "",
    senses: [
      { senseId: "pending", meaningZh: "全题库阅读词汇（总词库待补）" },
      { senseId: "real", pos: "noun", meaningZh: "野猪", definition: "a wild pig" }
    ]
  });
  const addition = buildReadingGAiMasterSyncPlan({
    count: 1,
    words: [{ id: "word_alpha", wordId: "word_alpha", word: "alpha" }]
  }, [source]);
  assert.deepEqual(addition.nextWords[1].senses.map((sense) => sense.senseId), ["real"]);

  const cleanup = buildReadingGAiMasterSyncPlan({
    count: 1,
    words: [{
      id: "word_boar",
      wordId: "word_boar",
      word: "boar",
      senses: source.senses
    }]
  }, [source]);
  assert.deepEqual(cleanup.nextWords[0].senses.map((sense) => sense.senseId), ["real"]);
  assert.equal(cleanup.report.updatedEntries[0].fields.includes("senses"), true);
});

test("G AI master sync does not resurrect a retired missing headword", () => {
  const plan = buildReadingGAiMasterSyncPlan({
    count: 1,
    words: [{ id: "word_alpha", wordId: "word_alpha", word: "alpha" }]
  }, [completedGEntry({ word: "retired", sourceWordId: "word_retired" })], {
    retiredEntries: [{ id: "word_retired", word: "retired" }]
  });

  assert.equal(plan.changed, false);
  assert.equal(plan.report.addedCount, 0);
  assert.equal(plan.report.retiredCount, 1);
});

test("G AI master sync never promotes a grammatical reference row", () => {
  const plan = buildReadingGAiMasterSyncPlan({
    count: 1,
    words: [{ id: "word_alpha", wordId: "word_alpha", word: "alpha" }]
  }, [completedGEntry({ word: "alphas", sourceWordId: "", studyMode: "reference" })]);

  assert.equal(plan.changed, false);
  assert.equal(plan.report.candidates, 0);
  assert.equal(plan.report.addedCount, 0);
});

test("G deletion removes the exact matching master headword", () => {
  const master = {
    count: 2,
    words: [
      { id: "word_alpha", wordId: "word_alpha", word: "alpha" },
      { id: "word_beta", wordId: "word_beta", word: "beta" }
    ]
  };
  const plan = buildReadingGMasterDeletionPlan(master, [{
    id: "rg_word_alpha",
    entryType: "word",
    word: "alpha",
    sourceWordId: "word_alpha"
  }]);

  assert.equal(plan.report.deletedCount, 1);
  assert.deepEqual(plan.report.deletedEntries, [{
    id: "word_alpha",
    word: "alpha",
    sourceReadingGId: "rg_word_alpha"
  }]);
  assert.deepEqual(plan.nextWords.map((entry) => entry.word), ["beta"]);
});

test("G deletion does not cascade a reference form to a different master lemma", () => {
  const plan = buildReadingGMasterDeletionPlan({
    count: 1,
    words: [{ id: "word_alpha", wordId: "word_alpha", word: "alpha" }]
  }, [{
    id: "rg_reference_alphas",
    entryType: "word",
    studyMode: "reference",
    word: "alphas",
    sourceWordId: "word_alpha"
  }]);

  assert.equal(plan.changed, false);
  assert.equal(plan.report.referenceConflictCount, 1);
  assert.equal(plan.nextWords.length, 1);
});

test("G deletion never removes a master word for a phrase row", () => {
  const plan = buildReadingGMasterDeletionPlan({
    count: 1,
    words: [{ id: "word_alpha", wordId: "word_alpha", word: "alpha" }]
  }, [{ id: "rg_phrase_alpha", entryType: "phrase", word: "alpha version" }]);

  assert.equal(plan.changed, false);
  assert.equal(plan.report.phraseSkippedCount, 1);
  assert.equal(plan.nextWords.length, 1);
});

test("G page routes wire deletion and completed-word additions into the master lexicon", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const page = fs.readFileSync(path.join(root, "app/reading-g/page.jsx"), "utf8");
  const deleteRoute = fs.readFileSync(
    path.join(root, "app/api/reading-g/delete-entry/route.js"),
    "utf8"
  );
  const completionRoute = fs.readFileSync(
    path.join(root, "app/api/reading-g/complete-pending/route.js"),
    "utf8"
  );

  assert.match(page, /window\.confirm/);
  assert.match(page, /masterAddedTotal/);
  assert.match(deleteRoute, /syncReadingGDeletedEntriesToMaster/);
  assert.match(deleteRoute, /masterDelete/);
  assert.match(completionRoute, /syncReadingGAiCompletedEntriesToMaster/);
  assert.match(completionRoute, /addedCount: 0/);
});
