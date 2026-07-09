import test from "node:test";
import assert from "node:assert/strict";

import { createSpellingUiBridge } from "../ui-bridge.mjs";

const now = Date.UTC(2026, 5, 19, 10, 0, 0);

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

test("production browser flow simulates load, wrong lock, reload restore, repair revisit, and mastered", async () => {
  const store = createMemoryStore();
  const words = [{ word: "abandon" }];
  const firstPage = createSpellingUiBridge({
    words,
    flashcardState: { statuses: {} },
    store,
    debugMode: true,
    now,
    sequence: 1
  });

  await firstPage.init();
  assert.equal(firstPage.getCurrentQuestion().uiState, "show_question");

  const wrong = await firstPage.submitAnswer("abandno", { now: now + 1_000, sequence: 1 });
  assert.equal(wrong.uiState, "wrong_feedback");
  assert.equal(wrong.canGoNext, false);
  assert.equal(firstPage.getCurrentQuestion().currentWord.wordId, wrong.currentWord.wordId);

  const partial = await firstPage.submitAnswer("abandon", { now: now + 10_000, sequence: 2 });
  assert.equal(partial.uiState, "in_repair");
  assert.equal(partial.currentWord.expectedAnswer, "abandon");
  assert.equal(partial.sessionProgress.batchProgress.completed, 0);

  const fallback = firstPage.getCurrentQuestion({ now: now + 120_000, sequence: 10 });
  assert.equal(fallback.uiState, "in_repair");
  assert.equal(fallback.currentWord.expectedAnswer, "abandon");
  assert.equal(fallback.debug.schedulerReason, "in_repair_only_remaining");

  const reloadedPage = createSpellingUiBridge({
    words,
    flashcardState: { statuses: {} },
    store,
    debugMode: true,
    now: now + 190_000,
    sequence: 11
  });
  await reloadedPage.init();

  const restored = reloadedPage.getCurrentQuestion({ now: now + 190_000, sequence: 11 });
  assert.equal(restored.uiState, "in_repair");
  assert.equal(restored.debug.waitingSecondEligible, true);

  const done = await reloadedPage.submitAnswer("abandon", { now: now + 191_000, sequence: 11 });
  assert.equal(done.uiState, "correct_feedback");
  assert.equal(done.sessionProgress.isCompletedToday, true);
  assert.equal(Object.values(reloadedPage.getRecords())[0].today.repairState, "mastered");
  assert.equal(Object.values(reloadedPage.getRecords())[0].srs.stage, 1);
});
