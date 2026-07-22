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
