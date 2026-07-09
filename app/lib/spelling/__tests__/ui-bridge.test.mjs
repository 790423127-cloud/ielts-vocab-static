import test from "node:test";
import assert from "node:assert/strict";

import { createSpellingUiBridge } from "../ui-bridge.mjs";
import { createSpellingRecord, submitSpellingAnswer } from "../state-machine.mjs";

const now = Date.UTC(2026, 5, 18, 18, 0, 0);

function createMemoryStore(initialRecords = []) {
  const records = new Map(initialRecords.map((record) => [record.wordId, JSON.parse(JSON.stringify(record))]));

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

test("UI bridge persists legacy error-bank migration during initialization", async () => {
  const legacy = {
    wordId: "word_a",
    updatedAt: now - 1_000,
    revision: 1,
    today: { repairState: "mastered", completedToday: true, lastSeenAt: now - 1_000 },
    errorBank: { everWrong: true, active: true, totalWrongCount: 2 },
    srs: { stage: 0, nextReviewAt: 0, lastReviewedAt: 0 },
    spelling: {}
  };
  const store = createMemoryStore([legacy]);
  const bridge = createSpellingUiBridge({
    words: [{ word: "alpha", wordId: "word_a", meaning: "第一个" }],
    flashcardState: { statuses: {} },
    store,
    now
  });

  await bridge.init();
  const persisted = (await store.getAllRecords())[0];
  assert.equal(persisted.errorBank.active, true);
  assert.equal(persisted.srs.stage, 1);
  assert.ok(persisted.srs.nextReviewAt > now);
});

test("UI bridge exposes current question, hint, progress, and locks wrong answers on the same word", async () => {
  const bridge = createSpellingUiBridge({
    words: [{ word: "abandon", meaning: "放弃" }],
    flashcardState: { statuses: {} },
    store: createMemoryStore(),
    now,
    sequence: 1,
    debugMode: true
  });
  await bridge.init();

  const question = bridge.getCurrentQuestion();
  assert.equal(question.uiState, "show_question");
  assert.equal(question.currentWord.expectedAnswer, "abandon");
  assert.equal(bridge.getHintLevel(), 0);
  assert.equal(bridge.getProgress().todaySpellingRemainingCount, 1);

  const wrong = await bridge.submitAnswer("abandno", { now: now + 1_000, sequence: 1 });
  assert.equal(wrong.uiState, "wrong_feedback");
  assert.equal(wrong.canAdvance, false);
  assert.equal(wrong.currentWord.expectedAnswer, "abandon");
  assert.equal(bridge.getCurrentQuestion().expectedInputState.repairState, "in_repair");
  assert.equal(bridge.getCurrentQuestion().expectedInputState.repairProgressLabel, "Repair Progress: 0/2");
  assert.ok(bridge.getSpellingHint());
});

test("category training never shows an empty question while repair items remain", async () => {
  let record = createSpellingRecord("word_a", { now });
  record = submitSpellingAnswer(record, {
    answer: "alhpa",
    expectedAnswer: "alpha",
    now,
    sequence: 1
  }).record;
  record = submitSpellingAnswer(record, {
    answer: "alpha",
    expectedAnswer: "alpha",
    now: now + 10_000,
    sequence: 2
  }).record;

  const bridge = createSpellingUiBridge({
    words: [{ word: "alpha", wordId: "word_a", meaning: "first" }],
    flashcardState: { statuses: {} },
    store: createMemoryStore([record]),
    source: "category",
    now: now + 20_000,
    sequence: 3,
    debugMode: true
  });
  await bridge.init();

  const question = bridge.getCurrentQuestion();
  assert.equal(question.currentWord.expectedAnswer, "alpha");
  assert.equal(question.uiState, "in_repair");
  assert.equal(question.debug.schedulerReason, "in_repair_only_remaining");
  assert.equal(question.sessionProgress.todayRepairPendingCount, 1);
});

test("UI bridge can restore navigator checkpoint after skip", async () => {
  const bridge = createSpellingUiBridge({
    words: [
      { word: "alpha", wordId: "word_a", meaning: "第一个" },
      { word: "beta", wordId: "word_b", meaning: "第二个" }
    ],
    flashcardState: { statuses: {} },
    store: createMemoryStore(),
    now,
    sequence: 1
  });
  await bridge.init();

  const before = bridge.getCurrentQuestion();
  const checkpoint = bridge.captureUndoCheckpoint();
  assert.equal(checkpoint.navigator.currentWordId, before.currentWord.wordId);

  const afterSkip = await bridge.skipQuestion({ now: now + 1_000 });
  assert.notEqual(afterSkip.currentWord?.wordId, before.currentWord.wordId);

  const restored = await bridge.restoreUndoCheckpoint(checkpoint);
  assert.equal(restored.currentWord?.wordId, before.currentWord.wordId);
  assert.equal(restored.uiState, "show_question");
});

test("UI bridge can advance to next question without skip side effects", async () => {
  const store = createMemoryStore();
  const bridge = createSpellingUiBridge({
    words: [
      { word: "alpha", wordId: "word_a", meaning: "第一个" },
      { word: "beta", wordId: "word_b", meaning: "第二个" }
    ],
    flashcardState: { statuses: {} },
    store,
    now,
    sequence: 1
  });
  await bridge.init();

  const before = bridge.getCurrentQuestion();
  const beforeRecord = (await store.getAllRecords()).find((item) => item.wordId === before.currentWord.wordId);
  const beforeRevision = Number(beforeRecord?.revision || 0);

  const next = await bridge.goToNextQuestion({ now: now + 1_000 });
  assert.notEqual(next.currentWord?.wordId, before.currentWord.wordId);
  assert.equal(next.uiState, "show_question");

  const afterRecord = (await store.getAllRecords()).find((item) => item.wordId === before.currentWord.wordId);
  assert.equal(Number(afterRecord?.revision || 0), beforeRevision);
});

test("UI bridge can navigate to a specific word in batch order", async () => {
  const bridge = createSpellingUiBridge({
    words: [
      { word: "alpha", wordId: "word_a", meaning: "第一个" },
      { word: "beta", wordId: "word_b", meaning: "第二个" },
      { word: "gamma", wordId: "word_c", meaning: "第三个" }
    ],
    flashcardState: { statuses: {} },
    store: createMemoryStore(),
    now,
    sequence: 1
  });
  await bridge.init();

  const sessionWordIds = bridge.getSessionWordIds();
  assert.deepEqual(sessionWordIds, ["word_a", "word_b", "word_c"]);

  const first = bridge.getCurrentQuestion();
  assert.equal(first.currentWord.wordId, "word_a");

  const second = await bridge.navigateToWord("word_b");
  assert.equal(second.currentWord.wordId, "word_b");
  assert.equal(second.currentWord.expectedAnswer, "beta");
  assert.equal(second.uiState, "show_question");

  const third = await bridge.navigateToWord("word_c");
  assert.equal(third.currentWord.wordId, "word_c");

  const backToFirst = await bridge.navigateToWord("word_a");
  assert.equal(backToFirst.currentWord.wordId, "word_a");
  assert.equal(backToFirst.sessionProgress.batchProgress.currentNumber, 1);

  const positionedThird = await bridge.navigateToWord("word_c");
  assert.equal(positionedThird.sessionProgress.batchProgress.currentNumber, 3);
});

test("UI bridge checkpoint falls back to displayed word when session navigator is empty", async () => {
  const bridge = createSpellingUiBridge({
    words: [{ word: "alpha", wordId: "word_a", meaning: "first" }],
    flashcardState: { statuses: {} },
    store: createMemoryStore(),
    now,
    sequence: 1
  });
  await bridge.init();

  const session = bridge.getRecords();
  assert.ok(session);

  const question = bridge.getCurrentQuestion();
  const checkpoint = bridge.captureUndoCheckpoint();
  assert.equal(checkpoint.navigator.currentWordId, question.currentWord.wordId);
  assert.ok(checkpoint.navigator.affectedRecord);
});
