import test from "node:test";
import assert from "node:assert/strict";
import {
  getUnifiedQualityQueue,
  getWordQualityStatus,
  isMissingAiFields
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

test("placeholder text is missing content rather than a valid populated field", () => {
  assert.equal(isMissingAiFields(readyWord({ meaning: "待补全" })), true);
  assert.equal(isMissingAiFields(readyWord({ exampleCn: "translation here" })), true);
});
