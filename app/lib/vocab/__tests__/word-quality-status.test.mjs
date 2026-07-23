import test from "node:test";
import assert from "node:assert/strict";
import {
  getUnifiedQualityQueue,
  getWordQualityEvaluation,
  getWordQualityStatus,
  isMissingAiFields,
  summarizeWordQuality
} from "../word-quality-status.mjs";

function readyWord(overrides = {}) {
  return {
    word: "access",
    pos: "noun",
    meaning: "进入；使用权",
    definition: "the right or opportunity to use something",
    example: "Residents have access to the library.",
    exampleCn: "居民可以使用图书馆。",
    collocations: [{ phrase: "gain access", chinese: "获得使用权" }],
    phraseCollocations: [{ phrase: "access to services", chinese: "使用服务的机会" }],
    ieltsUse: ["Reading"],
    topics: ["公共服务"],
    difficulty: "中级核心",
    ...overrides
  };
}

test("optional enrichment fields do not create a paid completion backlog", () => {
  const word = readyWord({
    meaningDetailZh: "",
    otherMeanings: undefined,
    forms: undefined,
    wordFamily: undefined,
    aiContentProfile: undefined
  });
  assert.equal(isMissingAiFields(word), false);
  assert.equal(getUnifiedQualityQueue(word), "ready");
});

test("legitimate words named none, null, and unknown are valid headwords", () => {
  for (const word of ["none", "null", "unknown"]) {
    assert.equal(isMissingAiFields(readyWord({ word })), false, word);
  }
});

test("learning state does not affect the data-quality queue", () => {
  const missing = readyWord({ status: "熟悉", definition: "" });
  assert.equal(getWordQualityStatus(missing).contentMissing, true);
  assert.equal(getUnifiedQualityQueue(missing), "completion");
});

test("classification is a separate queue after content is complete", () => {
  const classificationOnly = readyWord({ topics: [] });
  assert.equal(getUnifiedQualityQueue(classificationOnly), "classification");
  assert.equal(getUnifiedQualityQueue(classificationOnly, { needsRepair: true }), "repair");
});

test("repair lane retains the missing-field diagnosis", () => {
  const evaluation = getWordQualityEvaluation(readyWord({ meaning: "undefined" }), {
    needsRepair: true
  });
  assert.equal(evaluation.lane, "repair");
  assert.equal(evaluation.contentMissing, true);
  assert.deepEqual(evaluation.missingContentFields, ["meaning"]);
});

test("quality summaries expose visible missing and actionable lanes separately", () => {
  const words = [
    readyWord(),
    readyWord({ word: "missing", definition: "" }),
    readyWord({ word: "repair", meaning: "undefined" }),
    readyWord({ word: "classify", topics: [] })
  ];
  const counts = summarizeWordQuality(words, {
    needsRepair: (word) => word.word === "repair"
  });
  assert.deepEqual(counts, {
    completion: 1,
    repair: 1,
    classification: 1,
    ready: 1,
    contentMissing: 2,
    classificationMissing: 1,
    total: 4
  });
});

test("placeholder text is missing content rather than a valid populated field", () => {
  assert.equal(isMissingAiFields(readyWord({ meaning: "待补全" })), true);
  assert.equal(isMissingAiFields(readyWord({ exampleCn: "translation here" })), true);
});
