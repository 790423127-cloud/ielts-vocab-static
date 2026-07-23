import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_CONTENT_PROFILE_VERSION,
  isAiContentProfileComplete,
  normalizeAiGeneratedEntry,
  normalizeAiForms,
  normalizeAiWordFamily,
  normalizeOtherMeanings
} from "../admin-ai-content-profile.mjs";

test("normalizes one main meaning, concise other meanings, and exactly one example pair", () => {
  const entry = normalizeAiGeneratedEntry({
    word: "charge",
    phonetic: "/tʃɑːdʒ/",
    part_of_speech: "verb",
    chinese_meaning: "收费；要价",
    main_meaning_detail_zh: "要求某人为商品或服务支付一定金额。",
    english_definition: "to ask someone to pay for a product or service",
    other_meanings: ["收费；要价", "指控；控告", "给电池充电", "指控；控告"],
    ielts_example: "The hotel charged us for breakfast.",
    example_chinese: "酒店向我们收取了早餐费。",
    forms: [
      { word: "charges", type: "third person singular" },
      { word: "charged", type: "past tense and past participle" },
      { word: "charging", type: "present participle" }
    ],
    word_family: [
      { word: "chargeable", pos: "adjective", meaningZh: "可收费的", relation: "adjective-form" },
      { word: "charge", pos: "verb", meaningZh: "收费", relation: "base-word" }
    ],
    common_collocations: [
      { phrase: "charge a fee", chinese: "收取费用" },
      { phrase: "charge a fee", chinese: "收费" },
      { phrase: "additional charge", chinese: "额外费用" }
    ],
    phrase_collocations: [
      { phrase: "charge for", chinese: "因……收费" },
      { phrase: "in charge of", chinese: "负责" }
    ],
    ielts_use: ["Reading", "生活高频"],
    topics: ["消费"],
    difficulty: "中级核心",
    category: "消费"
  });

  assert.equal(entry.meaning, "收费；要价");
  assert.equal(entry.meaningDetailZh, "要求某人为商品或服务支付一定金额。");
  assert.deepEqual(entry.otherMeanings, ["指控；控告", "给电池充电"]);
  assert.equal(entry.example, "The hotel charged us for breakfast.");
  assert.equal(entry.exampleCn, "酒店向我们收取了早餐费。");
  assert.deepEqual(entry.forms.map(({ word, type }) => ({ word, type })), [
    { word: "charges", type: "third-person singular" },
    { word: "charged", type: "past tense / past participle" },
    { word: "charging", type: "present participle / gerund" }
  ]);
  assert.deepEqual(entry.wordFamily.map(({ word }) => word), ["chargeable"]);
  assert.equal(entry.collocations.length, 2);
  assert.equal(entry.aiContentProfile, AI_CONTENT_PROFILE_VERSION);
  assert.equal(isAiContentProfileComplete(entry), true);
});

test("forms reject self links, unknown relation types, phrases, duplicates, and protected plural-like headwords", () => {
  assert.deepEqual(normalizeAiForms([
    { word: "news", type: "plural" },
    { word: "newses", type: "invented" },
    { word: "news items", type: "plural" },
    { word: "newss", type: "plural" },
    { word: "newss", type: "plural" }
  ], "news"), []);

  assert.deepEqual(normalizeAiForms([
    { word: "processes", type: "plural" },
    { word: "processes", type: "plural" },
    { word: "processing", type: "present participle" }
  ], "process").map(({ word, type }) => ({ word, type })), [
    { word: "processes", type: "plural" },
    { word: "processing", type: "present participle / gerund" }
  ]);
});

test("word family keeps only direct normalized unique members", () => {
  assert.deepEqual(normalizeAiWordFamily([
    { word: "excite", pos: "verb", meaningZh: "使兴奋", relation: "base-word" },
    { word: "excitement", pos: "noun", meaningZh: "兴奋", relation: "noun-form" },
    { word: "exciting", pos: "adjective", meaningZh: "令人兴奋的", relation: "related-to" },
    { word: "two words", relation: "related-to" },
    { word: "excitement", relation: "related-to" }
  ], "exciting").map(({ word, relation }) => ({ word, relation })), [
    { word: "excite", relation: "base-word" },
    { word: "excitement", relation: "noun-form" }
  ]);
});

test("other meanings remove the main meaning and repeated variants", () => {
  assert.deepEqual(
    normalizeOtherMeanings(["费用", "指控", "指控", { meaningZh: "充电" }], "费用"),
    ["指控", "充电"]
  );
});
