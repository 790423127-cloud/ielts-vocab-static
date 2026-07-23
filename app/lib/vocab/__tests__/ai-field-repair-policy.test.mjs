import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeOptionalEnrichment,
  mergePreciseStructureRepair
} from "../ai-field-repair-policy.mjs";

function completeWord(overrides = {}) {
  return {
    id: "word-1",
    word: "example",
    phonetic: "/ɪɡˈzɑːmpəl/",
    pos: "noun",
    meaning: "例子",
    meaningDetailZh: "用于说明规则或观点的事物",
    definition: "something used to explain an idea",
    otherMeanings: [],
    example: "This is a clear example.",
    exampleCn: "这是一个清楚的例子。",
    forms: [{ word: "examples", type: "plural" }],
    wordFamily: [{ word: "exemplary", relation: "adjective-form", meaning: "典范的" }],
    collocations: [{ phrase: "clear example", chinese: "清楚的例子" }],
    phraseCollocations: [{ phrase: "for example", chinese: "例如" }],
    ieltsUse: ["Writing"],
    topics: ["教育"],
    difficulty: "中级核心",
    status: "不熟",
    favorite: true,
    reviewCount: 7,
    ...overrides
  };
}

function candidate(overrides = {}) {
  return {
    word: "example",
    phonetic: "/new/",
    pos: "verb",
    meaning: "新的释义",
    meaningDetailZh: "新的详细释义",
    definition: "a replacement definition",
    otherMeanings: [{
      pos: "noun",
      meaningZh: "榜样",
      definitionEn: "a person worthy of imitation",
      example: "She is an example to others.",
      exampleCn: "她是他人的榜样。"
    }],
    example: "A replacement example.",
    exampleCn: "替换例句。",
    forms: [{ word: "invented-form", type: "plural" }],
    wordFamily: [{ word: "invented-family", relation: "related-to", meaning: "错误候选" }],
    collocations: [
      { phrase: "good example", chinese: "好例子" },
      { phrase: "typical example", chinese: "典型例子" },
      { phrase: "classic example", chinese: "经典例子" },
      { phrase: "clear example", chinese: "清楚的例子" }
    ],
    phraseCollocations: [
      { phrase: "for example", chinese: "例如" },
      { phrase: "set an example", chinese: "树立榜样" },
      { phrase: "an example of", chinese: "……的例子" },
      { phrase: "follow the example of", chinese: "效仿" }
    ],
    ieltsUse: ["Speaking"],
    topics: ["社会"],
    difficulty: "高级加分",
    aiReplaceExisting: true,
    ...overrides
  };
}

test("precise structure repair fixes invalid senses without rewriting valid content or morphology", () => {
  const existing = completeWord({ otherMeanings: [{ meaningZh: "残缺义项" }] });
  const result = mergePreciseStructureRepair(existing, candidate());

  assert.equal(result.meaning, existing.meaning);
  assert.equal(result.definition, existing.definition);
  assert.equal(result.example, existing.example);
  assert.deepEqual(result.otherMeanings, candidate().otherMeanings);
  assert.deepEqual(result.forms, existing.forms);
  assert.deepEqual(result.wordFamily, existing.wordFamily);
  assert.equal(result.reviewCount, 7);
  assert.equal(result.favorite, true);
});

test("semantic anomaly repair replaces AI content but preserves identity, morphology and progress", () => {
  const existing = completeWord();
  const result = mergePreciseStructureRepair(existing, candidate());

  assert.equal(result.word, existing.word);
  assert.equal(result.id, existing.id);
  assert.equal(result.meaning, "新的释义");
  assert.equal(result.definition, "a replacement definition");
  assert.deepEqual(result.forms, existing.forms);
  assert.deepEqual(result.wordFamily, existing.wordFamily);
  assert.equal(result.status, "不熟");
  assert.equal(result.reviewCount, 7);
});

test("optional enrichment merges up to four translated collocations and changes no core fields", () => {
  const existing = completeWord();
  const result = mergeOptionalEnrichment(existing, candidate());

  assert.equal(result.collocations.length, 4);
  assert.equal(result.phraseCollocations.length, 4);
  assert.equal(result.meaning, existing.meaning);
  assert.equal(result.definition, existing.definition);
  assert.equal(result.example, existing.example);
  assert.deepEqual(result.otherMeanings, existing.otherMeanings);
  assert.deepEqual(result.forms, existing.forms);
  assert.deepEqual(result.wordFamily, existing.wordFamily);
  assert.deepEqual(result.ieltsUse, existing.ieltsUse);
  assert.deepEqual(result.topics, existing.topics);
  assert.equal(result.reviewCount, 7);
});
