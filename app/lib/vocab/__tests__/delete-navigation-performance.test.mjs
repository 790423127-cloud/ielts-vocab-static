import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildLocalChangeLog,
  detectPureDeletionChanges
} from "../local-change-log.mjs";
import {
  buildAtomicDeletionNavigation,
  resolveMissingQueuePosition
} from "../word-navigation-index.mjs";
import {
  buildStudyWordIndices,
  sortWordIndicesForFilter
} from "../word-flashcard-study-pool.mjs";
import {
  LEXICON_TIDY_FILTERS,
  buildLexiconTidyReview,
  createEmptyLexiconTidyAudit,
  findTidyCandidate,
  matchesTidyScope
} from "../lexicon-tidy-review.mjs";

const normalizeWord = (value) => String(value || "").trim().toLowerCase();
const wordMatchesFilter = (word, filter) => filter?.type === "all" || word.group === filter?.value;

test("删除单词只记录真实删除项，不把后续词误判为修改", () => {
  const before = ["a", "business", "c", "d"].map((word) => ({
    word,
    meaning: `${word}-meaning`,
    collocations: [{ phrase: `${word} phrase`, chinese: `${word} 中文` }]
  }));
  const after = before.filter((word) => word.word !== "business");

  const detected = detectPureDeletionChanges(before, after);
  assert.equal(detected.length, 1);
  assert.equal(detected[0].word, "business");
  assert.equal(detected[0].beforeIndex, 1);

  const log = buildLocalChangeLog("删除当前单词", before, after);
  assert.equal(log.changedCount, 1);
  assert.deepEqual(log.changes.map((change) => change.type), ["删除"]);
});

test("非同对象或非纯删除操作继续使用原完整差异逻辑", () => {
  const before = [{ word: "a", meaning: "old" }, { word: "b", meaning: "same" }];
  const after = [{ ...before[0], meaning: "new" }, before[1]];

  assert.equal(detectPureDeletionChanges(before, after), null);
  const log = buildLocalChangeLog("修改", before, after);
  assert.equal(log.changes.length, 1);
  assert.equal(log.changes[0].type, "修改");
});

test("删除后当前索引不在筛选队列时跳到邻近词而不是首词", () => {
  const queue = [2, 6, 9, 15];

  assert.equal(resolveMissingQueuePosition(queue, 7, "next"), 2);
  assert.equal(queue[resolveMissingQueuePosition(queue, 7, "next")], 9);
  assert.equal(resolveMissingQueuePosition(queue, 7, "prev"), 1);
  assert.equal(queue[resolveMissingQueuePosition(queue, 7, "prev")], 6);
});

test("邻近词不存在时才正常首尾循环", () => {
  const queue = [2, 6, 9, 15];

  assert.equal(resolveMissingQueuePosition(queue, 20, "next"), 0);
  assert.equal(resolveMissingQueuePosition(queue, 1, "prev"), queue.length - 1);
  assert.equal(resolveMissingQueuePosition([], 7, "next"), -1);
});

test("整理候选按简单到较难生成显示和翻页队列", () => {
  const words = [
    { word: "fabrication", category: "IELTS Reading", topics: ["社会"] },
    { word: "Paris", category: "地名专名", topics: ["地点"] },
    { word: "apple", category: "基础词", topics: ["食物"] },
    { word: "go", category: "基础词", topics: ["动词"] }
  ];
  const indices = buildStudyWordIndices(words, { type: "tidy", value: "review" }, {
    matchesWord: () => true
  });

  assert.deepEqual(indices.map((index) => words[index].word), ["go", "apple", "Paris", "fabrication"]);
});

test("删除与后继索引在同一状态中生成，不经过筛选队列首词", () => {
  const words = [
    { word: "a", group: "basic" },
    { word: "off-1", group: "other" },
    { word: "business", group: "basic" },
    { word: "off-2", group: "other" },
    { word: "c", group: "basic" }
  ];

  const result = buildAtomicDeletionNavigation({
    words,
    currentIndex: 2,
    filter: { type: "group", value: "basic" },
    wordMatchesFilter,
    normalizeWord
  });

  assert.deepEqual(result.words.map((word) => word.word), ["a", "off-1", "off-2", "c"]);
  assert.equal(result.index, 3);
  assert.equal(result.words[result.index].word, "c");
  assert.equal(result.queueLength, 2);
});

test("删除当前范围最后一个词时自然停在前一个词", () => {
  const words = [
    { word: "a", group: "basic" },
    { word: "off", group: "other" },
    { word: "c", group: "basic" }
  ];

  const result = buildAtomicDeletionNavigation({
    words,
    currentIndex: 2,
    filter: { type: "group", value: "basic" },
    wordMatchesFilter,
    normalizeWord
  });

  assert.equal(result.index, 0);
  assert.equal(result.words[result.index].word, "a");
});

test("整理页删除后继续进入排序中的下一词", () => {
  const words = [
    { word: "fabrication", category: "IELTS Reading", topics: ["社会"] },
    { word: "go", category: "基础词", topics: ["动词"] },
    { word: "apple", category: "基础词", topics: ["食物"] }
  ];
  const result = buildAtomicDeletionNavigation({
    words,
    currentIndex: 2,
    filter: { type: "tidy", value: "review" },
    wordMatchesFilter: () => true,
    normalizeWord,
    sortQueue: sortWordIndicesForFilter
  });

  assert.equal(result.words[result.index].word, "fabrication");
});

test("自定义整理筛选器会收到删除后的真实索引", () => {
  const words = [{ word: "a" }, { word: "b" }, { word: "c" }];
  const result = buildAtomicDeletionNavigation({
    words,
    currentIndex: 1,
    filter: { type: "tidy", value: "review" },
    wordMatchesFilter: (_word, _filter, sourceIndex) => sourceIndex >= 1,
    normalizeWord: (value) => String(value || "").toLowerCase()
  });

  assert.equal(result.queueLength, 1);
  assert.equal(result.index, 1);
  assert.equal(result.words[result.index].word, "c");
});

test("真实整理候选按稳定ID匹配，删除后索引移动仍进入下一个简单词", () => {
  const words = [
    { id: "first", word: "good", pos: "adjective", meaning: "好" },
    { id: "middle", word: "accommodation", pos: "noun", meaning: "住宿" },
    { id: "next", word: "school", pos: "noun", meaning: "学校" }
  ];
  const review = buildLexiconTidyReview(words, {
    audit: createEmptyLexiconTidyAudit(),
    removableKeys: new Set(["good", "school"])
  });
  const matcher = (word, filter, sourceIndex) => (
    matchesTidyScope(
      findTidyCandidate(review, word, sourceIndex),
      filter?.value || LEXICON_TIDY_FILTERS.REVIEW
    )
  );

  const result = buildAtomicDeletionNavigation({
    words,
    currentIndex: 0,
    filter: { type: "tidy", value: "basic" },
    wordMatchesFilter: matcher,
    normalizeWord
  });

  assert.equal(result.queueLength, 1);
  assert.equal(result.index, 1);
  assert.equal(result.words[result.index].word, "school");
});

test("整理页删除按钮复用 Delete 快捷键的原子导航流程", () => {
  const source = readFileSync(
    new URL("../../../components/WordStudyActions.jsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /function requestCurrentWordDeletion\(\)/);
  assert.match(source, /key:\s*"Delete"/);
  assert.match(source, /onClick=\{requestCurrentWordDeletion\}/);
  assert.doesNotMatch(source, /onClick=\{tidyReview\.onDelete\}/);
});

test("删除状态和筛选后继使用 flushSync 一次提交，避免绘制范围外单词", () => {
  const source = readFileSync(
    new URL("../../../hooks/useWordFlashNavigation.js", import.meta.url),
    "utf8"
  );

  assert.match(source, /import \{ flushSync \} from "react-dom"/);
  assert.match(source, /flushSync\(\(\) => \{/);
  assert.match(source, /latest\.words = deletionNavigation\.words/);
  assert.match(source, /setIndex\(deletionNavigation\.index\)/);
});
