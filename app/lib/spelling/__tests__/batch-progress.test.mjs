import test from "node:test";
import assert from "node:assert/strict";

import {
  computeBatchProgress,
  createSpellingSessionRunner,
  createSpellingUiBridge,
  getWordId,
  resolveSpellingProgressBarPercent,
  resolveSpellingStudyPosition
} from "../index.mjs";

const now = Date.UTC(2026, 5, 18, 22, 0, 0);

function candidate(word) {
  return {
    wordId: getWordId({ word }),
    word,
    expectedAnswer: word,
    acceptedAnswers: []
  };
}

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

test("resolveSpellingProgressBarPercent advances smoothly on large batches", () => {
  assert.equal(resolveSpellingProgressBarPercent(400, 0, 1), 0.5);
  assert.equal(resolveSpellingProgressBarPercent(400, 0, 4), 1);
  assert.equal(resolveSpellingProgressBarPercent(400, 0, 40), 10);
  assert.equal(resolveSpellingProgressBarPercent(400, 5, 6), 1.5);
  assert.equal(resolveSpellingProgressBarPercent(10, 3, 4), 40);
});

test("displayed study position follows completed work instead of shuffled source index", () => {
  assert.equal(resolveSpellingStudyPosition(398, 3, true), 4);
  assert.equal(resolveSpellingStudyPosition(398, 3, false), 3);
  assert.equal(resolveSpellingStudyPosition(398, 398, false), 398);
  assert.equal(resolveSpellingStudyPosition(0, 0, true), 0);
  assert.ok(resolveSpellingProgressBarPercent(398, 3, 4) < 2);
});

test("computeBatchProgress counts only mastered words", () => {
  const ids = [candidate("about").wordId, candidate("above").wordId].map(String);

  const progress = computeBatchProgress({
    [ids[0]]: { today: { repairStreak: 0, repairState: "in_repair" } },
    [ids[1]]: { today: { repairStreak: 2, repairState: "mastered", completedToday: true } }
  }, ids);

  assert.equal(progress.completedCount, 1);
  assert.equal(progress.sessionTotal, 2);
  assert.equal(progress.completed, 1);
  assert.equal(progress.total, 2);
  assert.equal(progress.currentNumber, 2);
  assert.equal(progress.masteryPercent, 50);
  assert.equal(progress.percent, 100);

  const positioned = computeBatchProgress({
    [ids[0]]: { today: { repairStreak: 0, repairState: "in_repair" } },
    [ids[1]]: { today: { repairStreak: 2, repairState: "mastered", completedToday: true } }
  }, ids, null, ids[0]);

  assert.equal(positioned.currentNumber, 1);
  assert.equal(positioned.positionPercent, 50);
  assert.equal(positioned.percent, 50);
});

test("submit wrong answer does not advance current question or increment batch progress", () => {
  const candidates = [candidate("about"), candidate("above")];
  const runner = createSpellingSessionRunner({
    candidates,
    records: {},
    now,
    sequence: 1
  });

  runner.getCurrent();
  const wrong = runner.submitAnswer("abaut", { now: now + 1_000, sequence: 1 });

  assert.equal(wrong.canAdvance, false);
  assert.equal(wrong.currentWord.expectedAnswer, "about");
  assert.equal(wrong.sessionProgress.batchProgress.completedCount, 0);
  assert.equal(wrong.sessionProgress.batchProgress.currentNumber, 1);
});

test("repair correct answer does not master until required consecutive streak is met", async () => {
  const store = createMemoryStore();
  const bridge = createSpellingUiBridge({
    words: [{ word: "about" }, { word: "above" }],
    flashcardState: { statuses: {} },
    store,
    now,
    sequence: 1
  });

  await bridge.init();
  assert.equal(bridge.getCurrentQuestion().currentWord.expectedAnswer, "about");
  assert.equal(bridge.getCurrentQuestion().sessionProgress.batchProgress.completedCount, 0);

  const wrong = await bridge.submitAnswer("abaut", { now: now + 1_000, sequence: 1 });
  assert.equal(wrong.uiState, "wrong_feedback");
  assert.equal(wrong.currentWord.expectedAnswer, "about");
  assert.equal(wrong.sessionProgress.batchProgress.completedCount, 0);

  const partial = await bridge.submitAnswer("about", { now: now + 10_000, sequence: 2 });
  assert.equal(partial.uiState, "show_question");
  assert.equal(partial.currentWord.expectedAnswer, "above");
  assert.equal(partial.sessionProgress.batchProgress.completedCount, 0);
  assert.equal(partial.sessionProgress.repairingCount, 1);

  const ready = bridge.getCurrentQuestion({ now: now + 190_000, sequence: 11 });
  assert.equal(ready.currentWord.expectedAnswer, "about");

  const mastered = await bridge.submitAnswer("about", { now: now + 191_000, sequence: 11 });
  assert.equal(mastered.sessionProgress.batchProgress.completedCount, 1);
  assert.equal(mastered.sessionProgress.repairedCount, 1);
  assert.equal(mastered.sessionProgress.masteredCount, 1);
});

test("repeated wrong attempts do not increment batch progress", async () => {
  const store = createMemoryStore();
  const bridge = createSpellingUiBridge({
    words: [{ word: "about" }],
    flashcardState: { statuses: {} },
    store,
    now,
    sequence: 1
  });

  await bridge.init();

  const firstWrong = await bridge.submitAnswer("abaut", { now: now + 1_000, sequence: 1 });
  const secondWrong = await bridge.submitAnswer("abotu", { now: now + 2_000, sequence: 1 });

  assert.equal(firstWrong.sessionProgress.batchProgress.completedCount, 0);
  assert.equal(secondWrong.sessionProgress.batchProgress.completedCount, 0);
  assert.equal(secondWrong.currentWord.expectedAnswer, "about");
});

test("phrase wrong answer stays on current phrase without progress increment", async () => {
  const store = createMemoryStore();
  const bridge = createSpellingUiBridge({
    words: [{ word: "be due to", entryType: "phrase", isPhrase: true }],
    flashcardState: { statuses: {} },
    candidateOptions: { entryMode: "phrases" },
    store,
    now,
    sequence: 1
  });

  await bridge.init();
  const wrong = await bridge.submitAnswer("be due too", { now: now + 1_000, sequence: 1 });

  assert.equal(wrong.uiState, "wrong_feedback");
  assert.equal(wrong.currentWord.expectedAnswer, "be due to");
  assert.equal(wrong.sessionProgress.batchProgress.completedCount, 0);
});
