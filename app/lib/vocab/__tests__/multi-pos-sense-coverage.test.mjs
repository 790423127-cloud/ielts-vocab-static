import test from "node:test";
import assert from "node:assert/strict";

import {
  describeMultiPosSenseCoverage,
  getMultiPosSenseCoverage,
  isAiProfileCompatibleWithDeclaredPos,
  needsMultiPosSenseRepair,
  normalizePartOfSpeechTokens
} from "../multi-pos-sense-coverage.mjs";

test("normalizes English abbreviations and Chinese POS labels", () => {
  assert.deepEqual(
    normalizePartOfSpeechTokens("noun 名词 / adj. 形容词"),
    ["noun", "adjective"]
  );
});

test("treats a bilingual phrase label as one POS category", () => {
  assert.deepEqual(normalizePartOfSpeechTokens("verb phrase 动词"), ["phrase"]);
  assert.deepEqual(normalizePartOfSpeechTokens("noun phrase 名词"), ["phrase"]);
});

test("rejects a multi-POS entry whose primary sense is not explicit", () => {
  const entry = {
    word: "forecast",
    pos: "noun / verb",
    meaning: "预测；预报",
    otherMeanings: []
  };
  const coverage = getMultiPosSenseCoverage(entry);
  assert.equal(coverage.primaryResolved, false);
  assert.equal(needsMultiPosSenseRepair(entry), true);
  assert.match(describeMultiPosSenseCoverage(entry), /主释义未明确/);
});

test("accepts explicit primary plus complete additional POS senses", () => {
  const entry = {
    word: "hope",
    primaryPos: "verb",
    pos: "verb / noun",
    meaning: "希望；期望",
    otherMeanings: [{
      pos: "noun",
      meaningZh: "希望；期望",
      definitionEn: "a feeling of expectation"
    }]
  };
  assert.equal(getMultiPosSenseCoverage(entry).complete, true);
});

test("uses an explicit first sense as the contextual primary for G-reading entries", () => {
  const entry = {
    word: "hand",
    primaryPos: "noun / verb",
    senses: [
      { pos: "verb", meaningZh: "递给", isPrimary: true },
      { pos: "noun", meaningZh: "手" }
    ]
  };
  assert.equal(getMultiPosSenseCoverage(entry).complete, true);
});

test("requires every declared POS instead of merely two different senses", () => {
  const entry = {
    word: "more",
    pos: "verb / noun / adjective / adverb / pronoun",
    senses: [
      { pos: "adverb", meaningZh: "更加", isPrimary: true },
      { pos: "adjective", meaningZh: "更多的" },
      { pos: "pronoun", meaningZh: "更多的人或物" }
    ]
  };
  assert.deepEqual(getMultiPosSenseCoverage(entry).missingPosTokens, ["verb", "noun"]);
  assert.equal(needsMultiPosSenseRepair(entry), true);
});

test("does not count one combined row as independently split POS senses", () => {
  const coverage = getMultiPosSenseCoverage({
    word: "either",
    pos: "determiner / pronoun",
    primaryPos: "determiner",
    meaning: "任一的",
    otherMeanings: [{ pos: "determiner / pronoun", meaningZh: "两者中的任意一个" }]
  });

  assert.equal(coverage.complete, false);
  assert.deepEqual(coverage.missingPosTokens, ["pronoun"]);
});

test("AI profile compatibility keeps same-gloss noun and verb as separate coverage", () => {
  const profile = {
    pos: "verb",
    meaning: "希望",
    otherMeanings: [{ pos: "noun", meaningZh: "希望", definitionEn: "a feeling of expectation" }]
  };
  assert.equal(isAiProfileCompatibleWithDeclaredPos(profile, "verb / noun"), true);
  assert.equal(isAiProfileCompatibleWithDeclaredPos({ ...profile, otherMeanings: [] }, "verb / noun"), false);
});
