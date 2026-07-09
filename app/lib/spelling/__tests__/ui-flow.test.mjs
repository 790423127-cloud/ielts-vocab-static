import test from "node:test";
import assert from "node:assert/strict";

import { createSpellingUiBridge } from "../ui-bridge.mjs";

const now = Date.UTC(2026, 5, 18, 20, 0, 0);

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

test("full UI flow completes wrong -> repair streak -> mastered and restores after reload", async () => {
  const store = createMemoryStore();
  const options = {
    words: [{ word: "abandon" }],
    flashcardState: { statuses: {} },
    store,
    debugMode: true
  };
  const bridge = createSpellingUiBridge({ ...options, now, sequence: 1 });
  await bridge.init();

  assert.equal(bridge.getCurrentQuestion().uiState, "show_question");

  const wrong = await bridge.submitAnswer("abandno", { now: now + 1_000, sequence: 1 });
  assert.equal(wrong.uiState, "wrong_feedback");
  assert.equal(wrong.canAdvance, false);

  const partial = await bridge.submitAnswer("abandon", { now: now + 10_000, sequence: 2 });
  assert.equal(partial.uiState, "in_repair");
  assert.equal(partial.currentWord.expectedAnswer, "abandon");
  assert.equal(partial.sessionProgress.batchProgress.completed, 0);
  assert.equal(partial.sessionProgress.repairingCount, 1);

  const fallback = bridge.getCurrentQuestion({ now: now + 120_000, sequence: 10 });
  assert.equal(fallback.uiState, "in_repair");
  assert.equal(fallback.currentWord.expectedAnswer, "abandon");
  assert.equal(fallback.debug.schedulerReason, "in_repair_only_remaining");

  const reloaded = createSpellingUiBridge({ ...options, now: now + 190_000, sequence: 11 });
  await reloaded.init();
  const ready = reloaded.getCurrentQuestion({ now: now + 190_000, sequence: 11 });
  assert.equal(ready.uiState, "in_repair");
  assert.equal(ready.currentWord.expectedAnswer, "abandon");
  assert.equal(ready.expectedInputState.repairProgressLabel, "Repair Progress: 1/2");

  const done = await reloaded.submitAnswer("abandon", { now: now + 191_000, sequence: 11 });
  assert.equal(done.uiState, "correct_feedback");
  assert.equal(done.sessionProgress.isCompletedToday, true);
  assert.equal(done.sessionProgress.batchProgress.completed, 1);
  assert.equal(done.sessionProgress.repairedCount, 1);
  assert.equal(reloaded.getTodayStats().isCompletedToday, true);
});
