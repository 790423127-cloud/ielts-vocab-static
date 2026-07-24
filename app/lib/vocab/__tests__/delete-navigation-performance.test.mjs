import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLocalChangeLog,
  detectPureDeletionChanges
} from "../local-change-log.mjs";
import { resolveMissingQueuePosition } from "../word-navigation-index.mjs";

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
