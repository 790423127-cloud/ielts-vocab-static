import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLocalChangeLog,
  detectPureDeletionChanges
} from "../local-change-log.mjs";
import {
  buildAtomicDeletionNavigation,
  resolveMissingQueuePosition
} from "../word-navigation-index.mjs";

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
