import test from "node:test";
import assert from "node:assert/strict";

import { createSpellingUiBridge } from "../ui-bridge.mjs";

const now = Date.UTC(2026, 5, 19, 9, 0, 0);

function createMemoryStore() {
  const records = new Map();

  return {
    async open() {},
    async getAllRecords() {
      return Array.from(records.values()).map((record) => JSON.parse(JSON.stringify(record)));
    },
    async putRecord(record) {
      records.set(record.wordId, JSON.parse(JSON.stringify(record)));
    }
  };
}

test("UI bridge integration exposes debug details and preserves repair lock", async () => {
  const bridge = createSpellingUiBridge({
    words: [{ word: "abandon" }],
    flashcardState: { statuses: {} },
    store: createMemoryStore(),
    debugMode: true,
    now,
    sequence: 1
  });

  await bridge.init();
  const wrong = await bridge.submitAnswer("abandno", { now: now + 1_000, sequence: 1 });

  assert.equal(wrong.uiState, "wrong_feedback");
  assert.equal(wrong.canGoNext, false);
  assert.equal(wrong.lockedWordId, wrong.currentWord.wordId);
  assert.equal(wrong.debug.stateMachineState, "in_repair");
  assert.equal(wrong.debug.schedulerReason, "answer:wrong");
  assert.deepEqual(Object.keys(wrong.debug).sort(), [
    "candidates",
    "entry",
    "entryMode",
    "lexiconCounts",
    "lexiconHash",
    "lexiconVersion",
    "schedulerReason",
    "srs",
    "stateMachineState",
    "waitingSecondEligible",
    "waitingSecondForced",
    "wordId"
  ].sort());
});
