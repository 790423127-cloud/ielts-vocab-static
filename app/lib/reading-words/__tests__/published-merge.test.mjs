import test from "node:test";
import assert from "node:assert/strict";
import { mergePublishedReadingWordsWithLocal } from "../published-merge.mjs";

test("a corrected legacy fragment is merged into one canonical published card", () => {
  const [word] = mergePublishedReadingWordsWithLocal(
    [{
      id: "reading-cam",
      wordId: "reading-cam",
      word: "campus",
      correctedFrom: "cam",
      meaning: "校园",
      meaningDetailZh: "大学或学校的场地与建筑物。",
      readingMeaning: "校园",
      readingNote: "已根据原句校正。",
      readingSources: [{ sentence: "Students live on campus." }]
    }],
    [{
      id: "reading-cam",
      wordId: "reading-cam",
      word: "cam",
      meaning: "凸轮",
      readingMeaning: "凸轮",
      readingNote: "旧的错误释义",
      readingSources: [{ sentence: "The engine uses a cam." }],
      favorite: true,
      status: "不熟",
      lastReviewedAt: "2026-08-12T00:00:00.000Z"
    }]
  );

  assert.equal(word.word, "campus");
  assert.equal(word.meaning, "校园");
  assert.equal(word.readingMeaning, "校园");
  assert.equal(word.readingNote, "已根据原句校正。");
  assert.deepEqual(word.readingSources, [{ sentence: "Students live on campus." }]);
  assert.equal(word.favorite, true);
  assert.equal(word.status, "不熟");
  assert.equal(word.lastReviewedAt, "2026-08-12T00:00:00.000Z");
});

test("an exact local card keeps its learner-specific passage context", () => {
  const [word] = mergePublishedReadingWordsWithLocal(
    [{
      id: "reading-stroke",
      word: "stroke",
      meaning: "中风；抚摸",
      readingMeaning: "",
      readingSources: []
    }],
    [{
      id: "reading-stroke",
      word: "stroke",
      meaning: "中风；抚摸",
      readingMeaning: "在本文中指轻抚动物。",
      readingNote: "来自剑雅阅读。",
      readingSources: [{ sentence: "Visitors can stroke the sheep." }],
      favorite: true
    }]
  );

  assert.equal(word.word, "stroke");
  assert.equal(word.readingMeaning, "在本文中指轻抚动物。");
  assert.equal(word.readingNote, "来自剑雅阅读。");
  assert.deepEqual(word.readingSources, [{ sentence: "Visitors can stroke the sheep." }]);
  assert.equal(word.favorite, true);
});

test("a canonical local duplicate and its legacy alias collapse to one card", () => {
  const merged = mergePublishedReadingWordsWithLocal(
    [{
      id: "reading-pport",
      word: "opportunity",
      correctedFrom: "pport",
      meaning: "机会",
      readingMeaning: "机会"
    }],
    [
      {
        id: "reading-pport",
        word: "pport",
        meaning: "港口",
        readingMeaning: "港口",
        favorite: true
      },
      {
        id: "reading-pport",
        word: "opportunity",
        meaning: "机会",
        readingMeaning: "机会",
        status: "熟悉"
      }
    ]
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].word, "opportunity");
  assert.equal(merged[0].meaning, "机会");
  assert.equal(merged[0].readingMeaning, "机会");
  assert.equal(merged[0].status, "熟悉");
});
