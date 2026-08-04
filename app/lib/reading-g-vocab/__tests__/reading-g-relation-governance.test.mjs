import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeReadingGRelations } from "../relation-meanings.mjs";
import { isIndependentStandaloneRelation } from "../../../../scripts/govern-forms-wordfamily.mjs";

function word(word, patch = {}) {
  return {
    id: `word-${word}`,
    word,
    entryType: "word",
    primaryMeaningZh: `${word}释义`,
    forms: [],
    wordFamily: [],
    ...patch
  };
}

test("G 类关系治理会移除明确错链、截断词干和待补占位关系", () => {
  const result = sanitizeReadingGRelations([
    word("care", {
      forms: [{ word: "career", type: "form", meaning: "职业" }],
      wordFamily: [
        { word: "career", meaning: "职业" },
        { word: "continu", meaning: "截断词干" },
        { word: "cares", meaning: "全题库阅读词汇（总词库待补）" }
      ]
    })
  ]);

  assert.deepEqual(result.items[0].forms, []);
  assert.deepEqual(result.items[0].wordFamily, []);
  assert.equal(result.stats.unsafeFormRowsRemoved, 1);
  assert.equal(result.stats.unsafeFamilyRowsRemoved, 1);
  assert.equal(result.stats.fragmentFamilyRowsRemoved, 1);
  assert.equal(result.stats.placeholderRowsRemoved, 1);
});

test("G 类关系治理会清空短语被拆出的单词关系", () => {
  const phrase = {
    id: "phrase-as-a-result",
    word: "as a result",
    entryType: "phrase",
    forms: [{ word: "resulted" }],
    wordFamily: [{ word: "as" }, { word: "result" }]
  };
  const result = sanitizeReadingGRelations([phrase]);

  assert.deepEqual(result.items[0].forms, []);
  assert.deepEqual(result.items[0].wordFamily, []);
  assert.equal(result.stats.phraseEntriesCleared, 1);
  assert.equal(result.stats.phraseRelationRowsRemoved, 3);
});

test("G 类关系治理会在词形与词族栏之间保守归类", () => {
  const result = sanitizeReadingGRelations([
    word("play", {
      pos: "verb",
      forms: [{ word: "playful", pos: "adjective", meaning: "爱玩的" }],
      wordFamily: [{ word: "played", pos: "verb", meaning: "玩（过去式）" }]
    }),
    word("mouse", {
      pos: "noun",
      wordFamily: [{ word: "mice", pos: "noun", meaning: "老鼠（复数）" }]
    }),
    word("enormous", {
      pos: "adjective",
      wordFamily: [{ word: "enormously", pos: "adverb", meaning: "极其" }]
    })
  ]);

  assert.deepEqual(result.items[0].forms.map((row) => row.word), ["played"]);
  assert.deepEqual(result.items[0].wordFamily.map((row) => row.word), ["playful"]);
  assert.deepEqual(result.items[1].forms.map((row) => row.word), ["mice"]);
  assert.deepEqual(result.items[2].forms.map((row) => row.word), ["enormously"]);
  assert.equal(result.stats.formsMovedToFamily, 1);
  assert.equal(result.stats.familyRowsMovedToForms, 3);
});

test("只有具备独立词义的关系成员才恢复为单独可刷词", () => {
  const owner = word("cool", { pos: "adjective", primaryMeaningZh: "凉爽的" });
  assert.equal(isIndependentStandaloneRelation(
    owner,
    "wordFamily",
    { word: "cooler", pos: "noun", meaning: "冷藏箱" },
    { word: "cooler", entryType: "headword", pos: "noun", meaning: "冷藏箱" },
    false
  ), true);
  assert.equal(isIndependentStandaloneRelation(
    word("come", { pos: "verb", primaryMeaningZh: "来" }),
    "forms",
    { word: "came", pos: "verb" },
    { word: "came", entryType: "headword", pos: "verb", meaning: "come 的过去式" },
    false
  ), false);
  assert.equal(isIndependentStandaloneRelation(
    word("annual", { pos: "adjective" }),
    "forms",
    { word: "annually", pos: "adverb" },
    { word: "annually", entryType: "headword", pos: "adverb", meaning: "每年地" },
    false
  ), false);
  assert.equal(isIndependentStandaloneRelation(
    word("accept", { pos: "verb" }),
    "forms",
    { word: "accepted", pos: "adjective" },
    { word: "accepted", entryType: "headword", pos: "adjective", meaning: "公认的" },
    false
  ), true);
  assert.equal(isIndependentStandaloneRelation(
    word("close", { pos: "adjective" }),
    "forms",
    { word: "closer", pos: "adjective" },
    {
      word: "closer",
      entryType: "inflected-form",
      studyMode: "reference",
      baseWord: "close",
      relationType: "comparative",
      pos: "adjective",
      meaning: "更近的"
    },
    false
  ), false);
});
