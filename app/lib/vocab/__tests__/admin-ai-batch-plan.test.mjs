import test from "node:test";
import assert from "node:assert/strict";
import { AI_CONTENT_PROFILE_VERSION } from "../admin-ai-content-profile.mjs";
import {
  PAID_AI_LIMITS,
  buildAnomalyRepairPlan,
  buildBulkCompletionPlan,
  buildClassificationPlan,
  buildCleanWordsPlan,
  buildFastCompletionPlan,
  buildGenerateMissingPlan,
  buildOneByOneCompletionPlan,
  buildSlowCompletionPlan,
  buildWrongRepairPlan
} from "../admin-ai-batch-plan.mjs";

function completeWord(word, overrides = {}) {
  return {
    word,
    phonetic: `/${word}/`,
    pos: "noun",
    meaning: `${word} meaning`,
    meaningDetailZh: `${word} detailed meaning`,
    definition: `${word} definition`,
    otherMeanings: [],
    example: `${word} example`,
    exampleCn: `${word} example cn`,
    forms: [],
    wordFamily: [],
    collocations: [{ phrase: `${word} collocation`, chinese: "搭配" }],
    phraseCollocations: [{ phrase: `${word} phrase`, chinese: "短语" }],
    ieltsUse: ["Reading"],
    topics: ["工作"],
    difficulty: "中级核心",
    aiContentProfile: AI_CONTENT_PROFILE_VERSION,
    ...overrides
  };
}

test("buildGenerateMissingPlan prioritizes wrong words and forces only affected chunks", () => {
  const words = [
    completeWord("ready"),
    completeWord("missing", { meaningDetailZh: "", aiContentProfile: "" }),
    completeWord("wrong", { meaning: "undefined" }),
    completeWord("wrong-missing", { pos: "", meaning: "undefined" })
  ];

  const plan = buildGenerateMissingPlan(words);

  assert.deepEqual(plan.targets.map(({ i }) => i), [2, 3, 1]);
  assert.deepEqual(
    plan.targets.map(({ missing, wrong }) => ({ missing, wrong })),
    [
      { missing: false, wrong: true },
      { missing: true, wrong: true },
      { missing: true, wrong: false }
    ]
  );
  assert.equal(plan.chunks.length, 1);
  assert.equal(plan.chunks[0].force, true);
  assert.equal(plan.workerCount, 1);
});

test("buildGenerateMissingPlan preserves repair and only-wrong option semantics", () => {
  const words = [
    completeWord("wrong", { meaning: "undefined" }),
    completeWord("missing", { meaningDetailZh: "", aiContentProfile: "" })
  ];

  const missingOnly = buildGenerateMissingPlan(words, { repairWrong: false });
  assert.deepEqual(missingOnly.targets.map(({ i }) => i), [1]);
  assert.equal(missingOnly.chunks[0].force, false);

  const disabledWrongOnly = buildGenerateMissingPlan(words, {
    repairWrong: false,
    onlyWrong: true
  });
  assert.deepEqual(disabledWrongOnly, { targets: [], chunks: [], workerCount: 0 });

  const wrongOnly = buildGenerateMissingPlan(words, { onlyWrong: true });
  assert.deepEqual(wrongOnly.targets.map(({ i }) => i), [0]);
  assert.equal(wrongOnly.chunks[0].force, true);
});

test("completion plans keep their distinct target policies", () => {
  const words = [
    completeWord("ready"),
    completeWord("missing", { meaningDetailZh: "", aiContentProfile: "" }),
    completeWord("unclassified", { topics: [] }),
    completeWord("wrong", { meaning: "undefined" }),
    completeWord("injur")
  ];

  const oneByOne = buildOneByOneCompletionPlan(words);
  assert.deepEqual(oneByOne.targets.map(({ i }) => i), [1, 2, 3, 4]);

  assert.deepEqual(buildSlowCompletionPlan(words).targets.map(({ i }) => i), [3, 4]);
  assert.deepEqual(buildWrongRepairPlan(words).targets.map(({ i }) => i), [3, 4]);
  assert.deepEqual(buildAnomalyRepairPlan(words).targets.map(({ i }) => i), [3, 4]);
  assert.deepEqual(buildFastCompletionPlan(words).targets.map(({ i }) => i), [1]);
  assert.deepEqual(buildBulkCompletionPlan(words).targets.map(({ i }) => i), [1]);
  assert.deepEqual(buildClassificationPlan(words).targets.map(({ i }) => i), [2]);
});

test("paid plans exclude inflected references", () => {
  const reference = completeWord("questions", {
    meaningDetailZh: "",
    aiContentProfile: "",
    entryType: "inflected-form",
    studyMode: "reference",
    baseWord: "question",
    relationType: "plural"
  });
  const normal = completeWord("cashless", { meaningDetailZh: "", aiContentProfile: "" });
  const plan = buildFastCompletionPlan([reference, normal]);

  assert.deepEqual(plan.targets.map(({ w }) => w.word), ["cashless"]);
});

test("bulk completion scans all missing words but still sends ten-word single-worker chunks", () => {
  const words = Array.from({ length: 205 }, (_, i) => ({ word: `word-${i}` }));
  words[1] = { word: "  " };
  words[2] = { word: "" };

  const cleanPlan = buildCleanWordsPlan(words);
  assert.equal(cleanPlan.targets.length, PAID_AI_LIMITS.clean);
  assert.deepEqual(cleanPlan.chunks.map((chunk) => chunk.length), Array(10).fill(10));
  assert.equal(cleanPlan.workerCount, PAID_AI_LIMITS.concurrency);
  assert.deepEqual(cleanPlan.targets[1], { id: "3", text: "word-3", i: 3 });

  const fastPlan = buildFastCompletionPlan(words);
  assert.equal(fastPlan.targets.length, 203);
  assert.equal(fastPlan.chunks.length, 21);
  assert.equal(fastPlan.chunks.every((chunk) => chunk.length <= PAID_AI_LIMITS.batchSize), true);
  assert.equal(fastPlan.workerCount, PAID_AI_LIMITS.concurrency);
});

test("bulk and classification plans support an explicit optional cap", () => {
  const words = Array.from({ length: 35 }, (_, index) => ({ word: `entry-${index}` }));
  assert.equal(buildBulkCompletionPlan(words, { maxTargets: 12 }).targets.length, 12);
  assert.equal(buildClassificationPlan(words, { maxTargets: 7 }).targets.length, 7);
});

test("one-by-one paid mode remains bounded for manual review", () => {
  const words = Array.from({ length: 50 }, (_, index) => ({ word: `entry-${index}` }));
  const plan = buildOneByOneCompletionPlan(words);
  assert.equal(plan.targets.length, PAID_AI_LIMITS.oneByOne);
});

test("legacy complete-looking words are upgraded until the new profile marker exists", () => {
  const legacy = completeWord("legacy", {
    meaningDetailZh: "",
    otherMeanings: undefined,
    forms: undefined,
    wordFamily: undefined,
    aiContentProfile: undefined
  });
  assert.deepEqual(buildFastCompletionPlan([legacy]).targets.map(({ w }) => w.word), ["legacy"]);
});
