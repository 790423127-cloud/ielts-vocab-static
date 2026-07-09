import test from "node:test";
import assert from "node:assert/strict";

import {
  createSpellingRecord,
  createSpellingSessionRunner,
  getWordId
} from "../index.mjs";

const now = Date.UTC(2026, 5, 18, 14, 0, 0);

function candidate(word) {
  return {
    wordId: getWordId({ word }),
    word,
    expectedAnswer: word,
    acceptedAnswers: []
  };
}

test("session runner selects a word and keeps wrong answers on the current repair item", () => {
  const candidates = [candidate("abandon")];
  const runner = createSpellingSessionRunner({
    candidates,
    records: {},
    now,
    sequence: 1,
    debugMode: true
  });

  const first = runner.getCurrent();
  assert.equal(first.currentWord.expectedAnswer, "abandon");
  assert.equal(first.expectedInputState.repairState, "normal");
  assert.equal(first.expectedInputState.repairProgressLabel, "");
  assert.equal(first.canAdvance, true);
  assert.equal(first.debug.schedulerHit.source, "ordinary");

  const wrong = runner.submitAnswer("abandno", { now: now + 1_000, sequence: 1 });
  assert.equal(wrong.canAdvance, false);
  assert.equal(wrong.currentWord.expectedAnswer, "abandon");
  assert.equal(wrong.expectedInputState.repairState, "in_repair");
  assert.equal(wrong.expectedInputState.repairProgressLabel, "Repair Progress: 0/2");
  assert.equal(wrong.sessionProgress.todayRepairPendingCount, 1);
});

test("session runner offers yesterday's repaired error again without deleting its history", () => {
  const item = candidate("abandon");
  const record = createSpellingRecord(item.wordId, {
    now: now - 24 * 60 * 60 * 1_000,
    sessionDate: "2026-06-17"
  });
  record.today.repairState = "mastered";
  record.today.completedToday = true;
  record.today.activeInTodayList = false;
  record.errorBank.everWrong = true;
  record.errorBank.active = true;
  record.errorBank.totalWrongCount = 1;

  const runner = createSpellingSessionRunner({
    candidates: [item],
    records: { [item.wordId]: record },
    now,
    sequence: 1,
    debugMode: true
  });
  const current = runner.getCurrent();

  assert.equal(current.currentWord.expectedAnswer, "abandon");
  assert.equal(current.debug.schedulerHit.source, "ordinary");
  assert.equal(runner.getRecords()[item.wordId].errorBank.totalWrongCount, 1);
});

test("session runner keeps partial repair items queued until spacing is satisfied", () => {
  const candidates = [candidate("abandon")];
  const runner = createSpellingSessionRunner({
    candidates,
    records: {},
    now,
    sequence: 1,
    debugMode: true
  });

  runner.getCurrent();
  runner.submitAnswer("wrong", { now, sequence: 1 });
  const repaired = runner.submitAnswer("abandon", { now: now + 10_000, sequence: 2 });

  assert.equal(repaired.expectedInputState.repairState, "in_repair");
  assert.equal(repaired.expectedInputState.repairStreak, 1);
  assert.equal(repaired.canAdvance, true);

  const tooSoon = runner.getCurrent({ now: now + 120_000, sequence: 10 });
  assert.equal(tooSoon.currentWord, null);
  assert.equal(tooSoon.debug.schedulerHit.source, "empty");

  const ready = runner.getCurrent({ now: now + 190_000, sequence: 11 });
  assert.equal(ready.currentWord.expectedAnswer, "abandon");
  assert.equal(ready.expectedInputState.repairState, "in_repair");
});

test("session runner markFamiliarCurrent completes the current word and advances", () => {
  const candidates = [candidate("alpha"), candidate("beta")];
  const runner = createSpellingSessionRunner({
    candidates,
    records: {},
    now,
    sequence: 1,
    debugMode: true
  });

  runner.getCurrent();
  const familiar = runner.markFamiliarCurrent({ now: now + 1_000, sequence: 1 });

  assert.equal(familiar.answerMeta.familiar, true);
  assert.equal(familiar.answerMeta.wordId, getWordId({ word: "alpha" }));
  assert.notEqual(familiar.currentWord?.expectedAnswer, "alpha");
});

test("session runner enqueuePriorityReviewCurrent adds repair queue entry and advances", () => {
  const candidates = [candidate("alpha"), candidate("beta")];
  const runner = createSpellingSessionRunner({
    candidates,
    records: {},
    now,
    sequence: 1,
    debugMode: true
  });

  runner.getCurrent();
  const queued = runner.enqueuePriorityReviewCurrent({ now: now + 1_000, sequence: 1 });

  assert.equal(queued.answerMeta.priorityReview, true);
  assert.equal(queued.answerMeta.wordId, getWordId({ word: "alpha" }));
  assert.notEqual(queued.currentWord?.expectedAnswer, "alpha");
  assert.equal(queued.sessionProgress.todayRepairPendingCount, 1);
});

test("session runner skipCurrent advances to the next word without recording an answer", () => {
  const candidates = [candidate("alpha"), candidate("beta")];
  const runner = createSpellingSessionRunner({
    candidates,
    records: {},
    now,
    sequence: 1,
    debugMode: true
  });

  const first = runner.getCurrent();
  assert.equal(first.currentWord.expectedAnswer, "alpha");

  const skipped = runner.skipCurrent({ now: now + 1_000, sequence: 1 });
  assert.equal(skipped.answerMeta.skipped, true);
  assert.equal(skipped.answerMeta.wordId, getWordId({ word: "alpha" }));
  assert.notEqual(skipped.currentWord?.expectedAnswer, "alpha");
});
