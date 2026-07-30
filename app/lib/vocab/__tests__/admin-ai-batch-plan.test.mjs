import test from "node:test";
import assert from "node:assert/strict";
import { AI_CONTENT_PROFILE_VERSION } from "../admin-ai-content-profile.mjs";
import {
  PAID_AI_LIMITS,
  buildAnomalyRepairPlan,
  buildBulkCompletionPlan,
  buildClassificationPlan,
  buildCleanWordsPlan,
  buildEnrichmentPlan,
  buildFastCompletionPlan,
  buildGenerateMissingPlan,
  buildOneByOneCompletionPlan,
  buildQualityLaneSummary,
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

test("buildGenerateMissingPlan prioritizes wrong words and preserves missing metadata", () => {
  const words = [
    completeWord("ready"),
    completeWord("missing", { definition: "", aiContentProfile: "" }),
    completeWord("wrong", { meaning: "undefined" }),
    completeWord("wrong-missing", { pos: "", meaning: "undefined" })
  ];

  const plan = buildGenerateMissingPlan(words);

  assert.deepEqual(plan.targets.map(({ i }) => i), [2, 3, 1]);
  assert.deepEqual(
    plan.targets.map(({ missing, wrong }) => ({ missing, wrong })),
    [
      { missing: true, wrong: true },
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
    completeWord("missing", { definition: "", aiContentProfile: "" })
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
    completeWord("missing", { definition: "", aiContentProfile: "" }),
    completeWord("unclassified", { topics: [] }),
    completeWord("wrong", { meaning: "undefined" }),
    completeWord("injur")
  ];

  const oneByOne = buildOneByOneCompletionPlan(words);
  assert.deepEqual(oneByOne.targets.map(({ i }) => i), [1, 2, 3, 4]);

  assert.deepEqual(buildSlowCompletionPlan(words).targets.map(({ i }) => i), [3]);
  const wrongRepair = buildWrongRepairPlan(words);
  assert.deepEqual(wrongRepair.targets.map(({ i }) => i), [3]);
  assert.equal(wrongRepair.workerCount, 1);
  assert.deepEqual(buildAnomalyRepairPlan(words).targets.map(({ i }) => i), [3]);
  assert.deepEqual(buildFastCompletionPlan(words).targets.map(({ i }) => i), [1]);
  assert.deepEqual(buildBulkCompletionPlan(words).targets.map(({ i }) => i), [1]);
  assert.deepEqual(buildClassificationPlan(words).targets.map(({ i }) => i), [2]);
});

test("structurally invalid other meanings enter the repair queue", () => {
  const words = [
    completeWord("valid"),
    completeWord("invalid-sense", { otherMeanings: [{ meaningZh: "另一含义" }] })
  ];
  assert.deepEqual(buildWrongRepairPlan(words).targets.map(({ i }) => i), [1]);
  assert.deepEqual(buildFastCompletionPlan(words).targets.map(({ i }) => i), []);
});

test("quality lane summary explains required work separately from enrichment", () => {
  const words = [
    completeWord("ready"),
    completeWord("missing", { definition: "" }),
    completeWord("wrong", { meaning: "undefined" }),
    completeWord("classification", { topics: [] })
  ];

  assert.deepEqual(buildQualityLaneSummary(words), {
    completion: 1,
    repair: 1,
    classification: 1,
    ready: 1,
    contentMissing: 2,
    contentInvalid: 0,
    classificationMissing: 1,
    enrichmentThin: 0,
    enrichmentStandard: 4,
    enrichmentRich: 0,
    familyReview: 0,
    familyPromotion: 0,
    total: 4
  });
});

test("paid plans exclude inflected references", () => {
  const reference = completeWord("questions", {
    definition: "",
    aiContentProfile: "",
    entryType: "inflected-form",
    studyMode: "reference",
    baseWord: "question",
    relationType: "plural"
  });
  const normal = completeWord("cashless", { definition: "", aiContentProfile: "" });
  const plan = buildFastCompletionPlan([reference, normal]);

  assert.deepEqual(plan.targets.map(({ w }) => w.word), ["cashless"]);
});

test("bulk completion runs a bounded 100-word round in five-word, three-worker chunks", () => {
  const words = Array.from({ length: 205 }, (_, i) => ({ word: `word-${i}` }));
  words[1] = { word: "  " };
  words[2] = { word: "" };

  const cleanPlan = buildCleanWordsPlan(words);
  assert.equal(cleanPlan.targets.length, PAID_AI_LIMITS.clean);
  assert.deepEqual(cleanPlan.chunks.map((chunk) => chunk.length), Array(20).fill(5));
  assert.equal(cleanPlan.workerCount, PAID_AI_LIMITS.concurrency);
  assert.deepEqual(cleanPlan.targets[1], { id: "3", text: "word-3", i: 3 });

  const fastPlan = buildFastCompletionPlan(words);
  assert.equal(fastPlan.targets.length, 100);
  assert.equal(fastPlan.chunks.length, 20);
  assert.equal(fastPlan.chunks.every((chunk) => chunk.length <= PAID_AI_LIMITS.batchSize), true);
  assert.equal(fastPlan.workerCount, PAID_AI_LIMITS.concurrency);
});

test("bulk completion excludes failures already attempted by a continuous run", () => {
  const words = [{ word: "alpha" }, { word: "beta" }];
  const plan = buildBulkCompletionPlan(words, {
    maxTargets: Infinity,
    excludeWordKeys: new Set(["alpha"])
  });

  assert.deepEqual(plan.targets.map(({ w }) => w.word), ["beta"]);
});

test("bulk and classification plans support an explicit optional cap", () => {
  const words = Array.from({ length: 35 }, (_, index) => ({ word: `entry-${index}` }));
  assert.equal(buildBulkCompletionPlan(words, { maxTargets: 12 }).targets.length, 12);
  const classificationWords = Array.from({ length: 35 }, (_, index) => (
    completeWord(`classified-${index}`, { topics: [] })
  ));
  assert.equal(buildClassificationPlan(classificationWords, { maxTargets: 7 }).targets.length, 7);
});

test("one-by-one paid mode remains bounded for manual review", () => {
  const words = Array.from({ length: 50 }, (_, index) => ({ word: `entry-${index}` }));
  const plan = buildOneByOneCompletionPlan(words);
  assert.equal(plan.targets.length, PAID_AI_LIMITS.oneByOne);
});

test("enrichment plan selects ready thin words, prioritizes favorites and excludes invalid queues", () => {
  const thin = completeWord("thin", { phraseCollocations: [] });
  const favorite = completeWord("favorite", { favorite: true, phraseCollocations: [] });
  const rich = completeWord("rich", {
    collocations: Array.from({ length: 4 }, (_, index) => ({ phrase: `rich common ${index}`, chinese: `常见${index}` })),
    phraseCollocations: Array.from({ length: 4 }, (_, index) => ({ phrase: `rich phrase ${index}`, chinese: `短语${index}` }))
  });
  const invalid = completeWord("invalid", { otherMeanings: [{ meaningZh: "残缺" }] });
  const unclassified = completeWord("unclassified-enrichment", { topics: [] });

  const plan = buildEnrichmentPlan([thin, favorite, rich, invalid, unclassified]);
  assert.deepEqual(plan.targets.map(({ w }) => w.word), ["favorite", "thin"]);
  assert.equal(plan.chunks.length, 1);
  assert.equal(plan.workerCount, 1);

  const capped = buildEnrichmentPlan([thin, favorite], { maxTargets: 1 });
  assert.deepEqual(capped.targets.map(({ w }) => w.word), ["favorite"]);
});

test("optional enrichment fields and a legacy profile marker do not create a paid backlog", () => {
  const legacy = completeWord("legacy", {
    meaningDetailZh: "",
    otherMeanings: undefined,
    forms: undefined,
    wordFamily: undefined,
    aiContentProfile: undefined
  });
  assert.deepEqual(buildFastCompletionPlan([legacy]).targets.map(({ w }) => w.word), []);
});
