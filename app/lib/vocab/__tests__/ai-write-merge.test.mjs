import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  AI_REPLACE_EXISTING_FIELD,
  applyAiResultByIdentity,
  captureWordWriteTarget,
  mergeAiSnapshotWithExisting,
  mergeAiWriteWithExisting
} from "../ai-write-merge.mjs";

test("non-force AI completion fills missing fields without overwriting populated content", () => {
  const existing = {
    word: "charge",
    meaning: "人工主释义",
    definition: "",
    example: "A manually reviewed example.",
    collocations: [
      { phrase: "manual charge", chinese: "人工收费" },
      { phrase: "service charge", chinese: "服务费" }
    ],
    phraseCollocations: []
  };
  const candidate = {
    ...existing,
    [AI_REPLACE_EXISTING_FIELD]: false,
    meaning: "AI释义",
    definition: "AI definition",
    example: "AI example.",
    collocations: [
      { phrase: "charge a fee", chinese: "收费" },
      { phrase: "additional charge", chinese: "额外费用" },
      { phrase: "charge a customer", chinese: "向顾客收费" },
      { phrase: "service charge", chinese: "服务费" }
    ],
    phraseCollocations: [
      { phrase: "charge for a service", chinese: "为服务收费" },
      { phrase: "be charged with a crime", chinese: "被控犯罪" },
      { phrase: "in charge of a team", chinese: "负责团队" },
      { phrase: "charge something to an account", chinese: "记到账户" }
    ]
  };

  const merged = mergeAiWriteWithExisting(existing, candidate);
  assert.equal(merged.meaning, "人工主释义");
  assert.equal(merged.example, "A manually reviewed example.");
  assert.equal(merged.definition, "AI definition");
  assert.deepEqual(merged.collocations, existing.collocations);
  assert.equal(merged.phraseCollocations.length, 4);
  assert.equal(Object.hasOwn(merged, AI_REPLACE_EXISTING_FIELD), false);
});

test("force AI completion may replace populated content", () => {
  const existing = {
    word: "injur",
    meaning: "旧释义",
    collocations: [{ phrase: "old injury", chinese: "旧伤" }]
  };
  const candidate = {
    ...existing,
    [AI_REPLACE_EXISTING_FIELD]: true,
    word: "injure",
    meaning: "使受伤",
    collocations: [
      { phrase: "injure a player", chinese: "使运动员受伤" },
      { phrase: "seriously injure someone", chinese: "使某人严重受伤" },
      { phrase: "injure the knee", chinese: "伤到膝盖" },
      { phrase: "injure workers at work", chinese: "使工人工作中受伤" }
    ]
  };

  const merged = mergeAiWriteWithExisting(existing, candidate);
  assert.equal(merged.word, "injure");
  assert.equal(merged.meaning, "使受伤");
  assert.equal(merged.collocations.length, 4);
  assert.equal(Object.hasOwn(merged, AI_REPLACE_EXISTING_FIELD), false);
});

test("AI result follows stable identity after the array is reordered", () => {
  const original = [
    { id: "word-a", word: "alpha", meaning: "" },
    { id: "word-b", word: "beta", meaning: "" }
  ];
  const target = captureWordWriteTarget(original[0]);
  const reordered = [original[1], original[0]];
  const result = applyAiResultByIdentity(
    reordered,
    target,
    { inputId: target.inputId, word: "alpha", meaning: "first" },
    (existing) => ({ ...existing, meaning: "first" })
  );

  assert.equal(result.index, 1);
  assert.equal(result.words[0].word, "beta");
  assert.equal(result.words[0].meaning, "");
  assert.equal(result.words[1].word, "alpha");
  assert.equal(result.words[1].meaning, "first");
});

test("AI result refuses a deleted target instead of writing to its former index", () => {
  const target = captureWordWriteTarget({ id: "word-a", word: "alpha" });
  assert.throws(
    () => applyAiResultByIdentity(
      [{ id: "word-b", word: "beta", meaning: "" }],
      target,
      { inputId: target.inputId, word: "alpha", meaning: "first" }
    ),
    { code: "WORD_TARGET_MISSING" }
  );
});

test("AI result refuses duplicate fallback identities", () => {
  const target = captureWordWriteTarget({ word: "duplicate" });
  assert.throws(
    () => applyAiResultByIdentity(
      [{ word: "duplicate" }, { word: "Duplicate" }],
      target,
      { inputId: target.inputId, word: "duplicate" }
    ),
    { code: "WORD_TARGET_CONFLICT" }
  );
});

test("AI result refuses a mismatched inputId", () => {
  const target = captureWordWriteTarget({ id: "word-a", word: "alpha" });
  assert.throws(
    () => applyAiResultByIdentity(
      [{ id: "word-a", word: "alpha" }],
      target,
      { inputId: "wrong-target", word: "alpha" }
    ),
    { code: "AI_INPUT_ID_MISMATCH" }
  );
});

test("AI snapshot merges content by identity instead of array position", () => {
  const previous = [
    { id: "a", word: "alpha", meaning: "A", status: "learning" },
    { id: "b", word: "beta", meaning: "B", status: "known" },
    { id: "c", word: "gamma", meaning: "C", status: "unknown" }
  ];
  const candidate = [
    { id: "c", word: "gamma", meaning: "C2", [AI_REPLACE_EXISTING_FIELD]: false },
    { id: "a", word: "alpha", meaning: "A2", [AI_REPLACE_EXISTING_FIELD]: false },
    { id: "b", word: "beta", meaning: "B2", [AI_REPLACE_EXISTING_FIELD]: false }
  ];

  const merged = mergeAiSnapshotWithExisting(previous, candidate);
  assert.deepEqual(merged.map((word) => [word.id, word.status]), [
    ["c", "unknown"],
    ["a", "learning"],
    ["b", "known"]
  ]);
});

test("AI snapshot preserves the latest learning state from React state", () => {
  const previous = [{
    id: "a",
    word: "alpha",
    definition: "",
    status: "熟悉",
    favorite: true
  }];
  const staleCandidate = [{
    id: "a",
    word: "alpha",
    definition: "AI definition",
    status: "不熟",
    favorite: false
  }];

  const merged = mergeAiSnapshotWithExisting(previous, staleCandidate);
  assert.equal(merged[0].definition, "AI definition");
  assert.equal(merged[0].status, "熟悉");
  assert.equal(merged[0].favorite, true);
});

test("AI snapshot identity merge stays linear for a full-size working set", () => {
  const words = Array.from({ length: 5000 }, (_, index) => ({
    id: `id-${index}`,
    word: `word-${index}`,
    meaning: `meaning-${index}`
  }));
  const startedAt = performance.now();
  const merged = mergeAiSnapshotWithExisting(words, words);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(merged, words);
  assert.ok(elapsedMs < 1000, `linear snapshot merge took ${Math.round(elapsedMs)}ms`);
});
