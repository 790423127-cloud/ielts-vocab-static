import test from "node:test";
import assert from "node:assert/strict";
import { buildLearningEntryCounts } from "../learning-entry-counts.mjs";

function filterKey(filter) {
  if (!filter || typeof filter !== "object") return "all";
  if (filter.type === "all") return "all";
  if (filter.type === "everything") return "everything";
  return `${filter.type}:${filter.value || ""}`;
}

const learningEntries = [
  {
    group: "今天优先",
    items: [
      { title: "今日任务", filter: { type: "all", value: "" } },
      { title: "不熟词", filter: { type: "status", value: "不熟" } },
      { title: "收藏词", filter: { type: "status", value: "收藏" } }
    ]
  },
  {
    group: "IELTS",
    items: [
      { title: "Speaking", filter: { type: "ielts", value: "Speaking" } },
      { title: "全部单词", filter: { type: "everything", value: "" } }
    ]
  }
];

test("buildLearningEntryCounts tallies filters in one pass", () => {
  const words = [
    { word: "a", status: "", favorite: false, ieltsUse: ["Speaking"], topics: ["工作"], difficulty: "基础高频", meaning: "1", pos: "n", example: "e", collocations: ["c"], phraseCollocations: ["p"] },
    { word: "b", status: "不熟", favorite: true, ieltsUse: ["Reading"], topics: ["教育"], difficulty: "中级核心", meaning: "2", pos: "n", example: "e", collocations: ["c"], phraseCollocations: ["p"] },
    { word: "c", status: "熟悉", favorite: true, ieltsUse: ["Speaking"], topics: ["科技"], difficulty: "高级加分", meaning: "3", pos: "n", example: "e", collocations: ["c"], phraseCollocations: ["p"] }
  ];

  const counts = buildLearningEntryCounts(words, learningEntries, {
    filterKey,
    isIdictationFlashFilter: () => false,
    getIdictationSource: () => null
  });

  assert.equal(counts.get("all"), 2);
  assert.equal(counts.get("status:不熟"), 1);
  assert.equal(counts.get("status:收藏"), 1);
  assert.equal(counts.get("ielts:Speaking"), 1);
  assert.equal(counts.get("everything"), 3);
});