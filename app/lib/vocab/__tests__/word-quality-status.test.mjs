import test from "node:test";
import assert from "node:assert/strict";
import {
  getUnifiedQualityQueue,
  getWordEnrichmentStatus,
  getWordFamilyStatus,
  getWordQualityEvaluation,
  getWordQualityStatus,
  isMissingAiFields,
  needsOptionalWordEnrichment,
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

test("optional enrichment does not create a paid completion backlog", () => {
  const word = readyWord({
    meaningDetailZh: "",
    otherMeanings: undefined,
    forms: undefined,
    wordFamily: undefined,
    aiContentProfile: undefined
  });
  assert.equal(isMissingAiFields(word), false);
  assert.equal(getUnifiedQualityQueue(word), "ready");
  assert.equal(needsOptionalWordEnrichment(word), true);
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

test("invalid other meanings enter repair without becoming missing content", () => {
  const evaluation = getWordQualityEvaluation(readyWord({
    otherMeanings: [{ meaningZh: "进入" }]
  }));
  assert.equal(evaluation.lane, "repair");
  assert.equal(evaluation.contentMissing, false);
  assert.equal(evaluation.contentInvalid, true);
  assert.deepEqual(evaluation.invalidContentFields, ["otherMeanings"]);
});

test("repair lane retains the missing-field diagnosis", () => {
  const evaluation = getWordQualityEvaluation(readyWord({ meaning: "undefined" }), {
    needsRepair: true
  });
  assert.equal(evaluation.lane, "repair");
  assert.equal(evaluation.contentMissing, true);
  assert.deepEqual(evaluation.missingContentFields, ["meaning"]);
});

test("difficulty and part of speech control enrichment without forcing four plus four", () => {
  const lowFrequency = readyWord({
    difficulty: "低频认识即可",
    phraseCollocations: []
  });
  assert.equal(isMissingAiFields(lowFrequency), false);
  assert.equal(getWordEnrichmentStatus(lowFrequency).enrichmentStatus, "standard");

  const functionWord = readyWord({
    word: "than",
    pos: "conjunction; preposition",
    collocations: [],
    phraseCollocations: [
      { phrase: "more than expected", chinese: "超过预期" },
      { phrase: "rather than wait", chinese: "而不是等待" }
    ]
  });
  assert.equal(isMissingAiFields(functionWord), false);
  assert.equal(getWordEnrichmentStatus(functionWord).enrichmentStatus, "standard");
});

test("family promotion candidates are reported separately from repair queues", () => {
  const result = getWordFamilyStatus(readyWord({
    wordFamily: [{ word: "accessibility", relation: "noun-form", meaning: "可访问性" }]
  }), { knownHeadwords: new Set(["access"]) });
  assert.equal(result.familyStatus, "promotion-candidate");
  assert.equal(result.hasFamilyPromotionCandidate, true);
});

test("quality summaries expose required, optional, and family counts separately", () => {
  const words = [
    readyWord(),
    readyWord({ word: "missing", definition: "" }),
    readyWord({ word: "repair", meaning: "undefined" }),
    readyWord({ word: "classify", topics: [] }),
    readyWord({
      word: "family-owner",
      wordFamily: [{ word: "familymember", relation: "noun-form", meaning: "词族成员" }]
    })
  ];
  const counts = summarizeWordQuality(words, {
    needsRepair: (word) => word.word === "repair"
  });
  assert.deepEqual(counts, {
    completion: 1,
    repair: 1,
    classification: 1,
    ready: 2,
    contentMissing: 2,
    contentInvalid: 0,
    classificationMissing: 1,
    enrichmentThin: 5,
    enrichmentStandard: 0,
    enrichmentRich: 0,
    familyReview: 0,
    familyPromotion: 1,
    total: 5
  });
});

test("placeholder text is missing content rather than a valid populated field", () => {
  assert.equal(isMissingAiFields(readyWord({ meaning: "待补全" })), true);
  assert.equal(isMissingAiFields(readyWord({ exampleCn: "translation here" })), true);
});
