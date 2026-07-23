import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_COLLOCATION_LIMIT,
  AI_CONTENT_PROFILE_VERSION,
  isAiContentProfileComplete,
  normalizeAiGeneratedEntry,
  normalizeAiForms,
  normalizeAiPhraseItems,
  normalizeAiWordFamily,
  normalizeOtherMeanings,
  sanitizeAiWordCollocations,
  withAiClientCollocationPayload
} from "../admin-ai-content-profile.mjs";

function buildChargeEntry() {
  return normalizeAiGeneratedEntry({
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
      { phrase: "additional charge", chinese: "额外费用" },
      { phrase: "charge a customer", chinese: "向顾客收费" },
      { phrase: "service charge", chinese: "服务费" },
      { phrase: "huh?", chinese: "啊？" }
    ],
    phrase_collocations: [
      { phrase: "charge for a service", chinese: "为服务收费" },
      { phrase: "be charged with a crime", chinese: "被控犯罪" },
      { phrase: "in charge of a team", chinese: "负责一个团队" },
      { phrase: "charge something to an account", chinese: "把费用记到账户上" },
      { phrase: "huh?", chinese: "啊？" }
    ],
    ielts_use: ["Reading", "生活高频"],
    topics: ["消费"],
    difficulty: "中级核心",
    category: "消费"
  });
}

test("normalizes one main meaning, concise other meanings, one example pair, and four collocations per section", () => {
  const entry = buildChargeEntry();

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
  assert.deepEqual(entry.collocations.map(({ phrase }) => phrase), [
    "charge a fee",
    "additional charge",
    "charge a customer",
    "service charge"
  ]);
  assert.equal(entry.collocations.length, AI_COLLOCATION_LIMIT);
  assert.equal(entry.phraseCollocations.length, AI_COLLOCATION_LIMIT);
  assert.equal(entry.aiContentProfile, AI_CONTENT_PROFILE_VERSION);
  assert.equal(isAiContentProfileComplete(entry), true);
});

test("collocation normalization removes interjections, questions, placeholders, one-word rows, duplicates, and overflow", () => {
  const normalized = normalizeAiPhraseItems([
    "huh?",
    "wow",
    "charge",
    "等待 AI 补充",
    { phrase: "charge a fee", chinese: "收取费用" },
    { phrase: "Charge a fee!", chinese: "收费" },
    { phrase: "additional charge", chinese: "额外费用" },
    { phrase: "charge a customer", chinese: "向顾客收费" },
    { phrase: "service charge", chinese: "服务费" },
    { phrase: "charge a card", chinese: "从卡中扣款" }
  ]);

  assert.deepEqual(normalized.map(({ phrase }) => phrase), [
    "charge a fee",
    "additional charge",
    "charge a customer",
    "service charge"
  ]);
});

test("client transport restores the fourth collocation after legacy three-item normalization", () => {
  const entry = buildChargeEntry();
  const transported = withAiClientCollocationPayload(entry);
  const legacyWritten = {
    ...transported,
    collocations: transported.collocations.slice(0, 3),
    phraseCollocations: transported.phraseCollocations.slice(0, 3)
  };
  const restored = sanitizeAiWordCollocations(legacyWritten);

  assert.equal(restored.collocations.length, 4);
  assert.equal(restored.phraseCollocations.length, 4);
  assert.equal(Object.hasOwn(restored, "aiCollocationsV2"), false);
  assert.equal(Object.hasOwn(restored, "aiPhraseCollocationsV2"), false);
});

test("profiles with fewer than four translated items are rejected from the paid cache", () => {
  const entry = buildChargeEntry();
  entry.collocations = entry.collocations.slice(0, 3);
  assert.equal(isAiContentProfileComplete(entry), false);
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
