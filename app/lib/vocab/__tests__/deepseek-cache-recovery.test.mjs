import test from "node:test";
import assert from "node:assert/strict";
import { buildDeepseekCacheRecoveryPlan } from "../deepseek-cache-recovery.mjs";

test("fills only missing fields and preserves protected state", () => {
  const words = [{
    id: "1",
    word: "cashless",
    meaning: "",
    definition: "Existing",
    status: "不熟",
    favorite: true,
    collocations: []
  }];
  const cache = {
    cashless: {
      word: "cashless",
      meaning: "无现金的",
      definition: "AI definition",
      common_collocations: [{ phrase: "cashless payment", chinese: "无现金支付" }],
      aiGenerated: true
    }
  };

  const plan = buildDeepseekCacheRecoveryPlan(words, cache);
  assert.equal(plan.changedWords, 1);
  assert.equal(plan.words[0].meaning, "无现金的");
  assert.equal(plan.words[0].definition, "Existing");
  assert.equal(plan.words[0].status, "不熟");
  assert.equal(plan.words[0].favorite, true);
  assert.deepEqual(plan.words[0].collocations, [{ phrase: "cashless payment", chinese: "无现金支付" }]);
});

test("recovery removes huh rows, duplicates, and keeps at most four reliable collocations", () => {
  const words = [{ id: "1", word: "charge", collocations: [] }];
  const cache = {
    charge: {
      word: "charge",
      common_collocations: [
        { phrase: "huh?", chinese: "啊？" },
        { phrase: "charge a fee", chinese: "收取费用" },
        { phrase: "charge a fee", chinese: "收费" },
        { phrase: "additional charge", chinese: "额外费用" },
        { phrase: "charge a customer", chinese: "向顾客收费" },
        { phrase: "service charge", chinese: "服务费" },
        { phrase: "charge a card", chinese: "从卡中扣款" }
      ]
    }
  };

  const plan = buildDeepseekCacheRecoveryPlan(words, cache);
  assert.deepEqual(plan.words[0].collocations.map(({ phrase }) => phrase), [
    "charge a fee",
    "additional charge",
    "charge a customer",
    "service charge"
  ]);
});

test("recovers main detail, other meanings, forms, and word family without touching IDs", () => {
  const words = [{
    id: "charge-id",
    word: "charge",
    meaning: "收费",
    meaningDetailZh: "",
    otherMeanings: [],
    forms: [],
    wordFamily: [],
    status: "模糊"
  }];
  const cache = {
    charge: {
      word: "charge",
      main_meaning_detail_zh: "要求某人为商品或服务支付费用。",
      other_meanings: ["指控", "充电"],
      forms: [{ word: "charged", type: "past tense and past participle" }],
      word_family: [{ word: "chargeable", pos: "adjective", meaningZh: "可收费的", relation: "adjective-form" }]
    }
  };

  const plan = buildDeepseekCacheRecoveryPlan(words, cache);
  assert.equal(plan.changedWords, 1);
  assert.equal(plan.words[0].id, "charge-id");
  assert.equal(plan.words[0].status, "模糊");
  assert.equal(plan.words[0].meaningDetailZh, "要求某人为商品或服务支付费用。");
  assert.deepEqual(plan.words[0].otherMeanings.map(({ meaningZh }) => meaningZh), ["指控", "充电"]);
  assert.equal(plan.words[0].forms[0].word, "charged");
  assert.equal(plan.words[0].wordFamily[0].word, "chargeable");
});

test("skips inflected references", () => {
  const words = [{
    id: "2",
    word: "questions",
    entryType: "inflected-form",
    studyMode: "reference",
    baseWord: "question",
    relationType: "plural"
  }];

  const plan = buildDeepseekCacheRecoveryPlan(words, {
    questions: { word: "questions", meaning: "问题" }
  });

  assert.equal(plan.changedWords, 0);
  assert.equal(plan.counts.SKIP_INFLECTED_REFERENCE, 1);
});

test("recovery is idempotent", () => {
  const words = [{ id: "1", word: "cashless", meaning: "" }];
  const cache = { cashless: { word: "cashless", meaning: "无现金的" } };
  const first = buildDeepseekCacheRecoveryPlan(words, cache);
  const second = buildDeepseekCacheRecoveryPlan(first.words, cache);

  assert.equal(first.changedWords, 1);
  assert.equal(second.changedWords, 0);
  assert.equal(second.counts.MATCHED_NO_CHANGE, 1);
});

test("since filter excludes cache rows without a matching generatedAt date", () => {
  const words = [{ id: "1", word: "cashless", meaning: "" }];
  const cache = {
    cashless: { word: "cashless", meaning: "无现金的" },
    another: { word: "another", meaning: "另一个", generatedAt: "2026-07-22T10:00:00.000Z" }
  };
  const plan = buildDeepseekCacheRecoveryPlan(words, cache, { since: "2026-07-22" });
  assert.equal(plan.results.length, 1);
  assert.equal(plan.results[0].status, "NOT_FOUND");
});
