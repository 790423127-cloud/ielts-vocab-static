import test from "node:test";
import assert from "node:assert/strict";
import {
  getIdictationSource,
  primeIdictationFrequencyData
} from "../../spelling/idictation-frequency.mjs";
import { buildLearningEntryCounts } from "../learning-entry-counts.mjs";
import {
  buildIdictationFlashWords,
  buildLibraryWordMap
} from "../word-flashcard-study-pool.mjs";

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
      { title: "全部可刷词", filter: { type: "everything", value: "" } }
    ]
  }
];

test("buildLearningEntryCounts tallies filters in one pass", () => {
  const words = [
    { word: "a", status: "", favorite: false, ieltsUse: ["Speaking"], topics: ["工作"], difficulty: "基础高频", meaning: "1", pos: "n", example: "e", collocations: ["c"], phraseCollocations: ["p"] },
    { word: "b", status: "不熟", favorite: true, ieltsUse: ["Reading"], topics: ["教育"], difficulty: "中级核心", meaning: "2", pos: "n", example: "e", collocations: ["c"], phraseCollocations: ["p"] },
    { word: "c", status: "熟悉", favorite: true, ieltsUse: ["Speaking"], topics: ["科技"], difficulty: "高级加分", meaning: "3", pos: "n", example: "e", collocations: ["c"], phraseCollocations: ["p"] },
    {
      word: "conducted",
      status: "",
      favorite: false,
      entryType: "inflected-form",
      studyMode: "reference",
      baseWord: "conduct",
      relationType: "past_or_participle",
      ieltsUse: ["Speaking"],
      topics: ["工作"],
      difficulty: "中级核心",
      meaning: "conduct 的过去式",
      pos: "verb",
      example: "e",
      collocations: ["c"],
      phraseCollocations: ["p"]
    }
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

test("buildLearningEntryCounts keeps non-inflection reference entries only in supported ranges", () => {
  const entries = [
    {
      group: "reference",
      items: [
        { title: "全部可刷词", filter: { type: "everything", value: "" } },
        { title: "今日任务", filter: { type: "all", value: "" } },
        { title: "阶段4", filter: { type: "topic", value: "G类完整学习计划·阶段4" } }
      ]
    }
  ];
  const words = [{
    word: "specialist-name",
    status: "",
    studyMode: "reference",
    entryType: "headword",
    topics: ["G类完整学习计划·阶段4"],
    ieltsUse: ["Reading"],
    difficulty: "低频认识即可",
    meaning: "专名",
    pos: "noun",
    example: "e",
    collocations: ["c"],
    phraseCollocations: ["p"]
  }];

  const counts = buildLearningEntryCounts(words, entries, {
    filterKey,
    isIdictationFlashFilter: () => false,
    getIdictationSource: () => null
  });

  assert.equal(counts.get("everything"), 1);
  assert.equal(counts.get("all"), 0);
  assert.equal(counts.get("topic:G类完整学习计划·阶段4"), 1);
});

test("buildLearningEntryCounts uses idictation metadata before the lazy payload loads", () => {
  const entries = [
    {
      group: "爱听写独立入口",
      items: [
        { title: "爱听写听力", filter: { type: "idictation", value: "listening" } },
        { title: "爱听写阅读", filter: { type: "idictation", value: "reading" } }
      ]
    }
  ];

  const counts = buildLearningEntryCounts([], entries, {
    filterKey,
    isIdictationFlashFilter: (filter) => filter?.type === "idictation",
    getIdictationSource: () => null
  });

  assert.equal(counts.get("idictation:listening"), 3906);
  assert.equal(counts.get("idictation:reading"), 3396);
});

test("idictation browsing keeps independent answer words that overlap main inflection references", () => {
  primeIdictationFrequencyData({
    sources: {
      listening: {
        label: "爱听写听力",
        uniqueWords: 1,
        entries: [{
          id: "listening-activities",
          word: "activities",
          expectedAnswer: "activities",
          acceptedAnswers: ["activities", "activity"],
          meaning: "活动",
          example: "Children enjoy outdoor activities.",
          exampleCn: "孩子们喜欢户外活动。"
        }]
      }
    }
  });

  const words = [{
    word: "activities",
    entryType: "inflected-form",
    studyMode: "reference",
    baseWord: "activity",
    relationType: "plural"
  }];
  const pool = buildIdictationFlashWords("listening", words, buildLibraryWordMap(words));
  const counts = buildLearningEntryCounts(words, [{
    group: "爱听写",
    items: [{ title: "爱听写听力", filter: { type: "idictation", value: "listening" } }]
  }], {
    filterKey,
    isIdictationFlashFilter: (filter) => filter?.type === "idictation",
    getIdictationSource
  });

  assert.equal(pool.length, 1);
  assert.equal(pool[0].word, "activities");
  assert.equal(counts.get("idictation:listening"), 1);
});
