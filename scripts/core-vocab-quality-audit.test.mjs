import test from "node:test";
import assert from "node:assert/strict";

import { runQualityGate } from "./core-vocab-quality-audit.mjs";

function activeWord(overrides = {}) {
  return {
    id: "word_active",
    word: "active",
    meaning: "活跃的",
    example: "The account is active.",
    difficulty: "基础高频",
    ...overrides
  };
}

test("core gate ignores reference-only rows that are not study cards", () => {
  const payload = {
    count: 2,
    version: "test-v1",
    savedAt: "2026-09-02T00:00:00.000Z",
    lexiconHash: "test",
    words: [
      activeWord(),
      {
        id: "ref_1",
        word: "broken phrase",
        entryType: "word-reference",
        studyMode: "reference",
        baseWord: "active",
        baseWordId: "word_active",
        relationType: "malformed import",
        difficulty: "不进入学习"
      }
    ]
  };

  assert.deepEqual(runQualityGate(payload), { ok: true, errors: [] });
});

test("core gate still rejects invalid active study-card difficulty", () => {
  const payload = {
    count: 1,
    version: "test-v1",
    savedAt: "2026-09-02T00:00:00.000Z",
    lexiconHash: "test",
    words: [activeWord({ difficulty: "" })]
  };
  const result = runQualityGate(payload);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" | "), /invalid difficulty: 1/);
});
