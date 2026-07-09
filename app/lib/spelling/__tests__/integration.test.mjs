import test from "node:test";
import assert from "node:assert/strict";

import { createSpellingEngine } from "../index.mjs";

const now = Date.UTC(2026, 5, 18, 16, 0, 0);

test("engine runs a complete one-word repair cycle from wrong answer to mastered", () => {
  const engine = createSpellingEngine({ debugMode: true, createIndexedDBStore: false });
  const candidates = engine.buildCandidates([{ word: "abandon", translation: "放弃" }], { statuses: {} });
  const session = engine.sessionRunner.createSession({
    candidates,
    records: {},
    now,
    sequence: 1,
    debugMode: true
  });

  const first = session.getCurrent();
  assert.equal(first.currentWord.expectedAnswer, "abandon");

  const wrong = session.submitAnswer("abandno", { now: now + 1_000, sequence: 1 });
  assert.equal(wrong.canAdvance, false);
  assert.equal(wrong.expectedInputState.repairState, "in_repair");
  assert.equal(wrong.expectedInputState.repairProgressLabel, "Repair Progress: 0/2");

  const repaired = session.submitAnswer("abandon", { now: now + 10_000, sequence: 2 });
  assert.equal(repaired.canAdvance, true);
  assert.equal(repaired.expectedInputState.repairState, "in_repair");
  assert.equal(repaired.expectedInputState.repairStreak, 1);

  const ready = session.getCurrent({ now: now + 190_000, sequence: 11 });
  assert.equal(ready.currentWord.expectedAnswer, "abandon");

  const done = session.submitAnswer("abandon", { now: now + 191_000, sequence: 11 });
  assert.equal(done.expectedInputState.repairState, "mastered");
  assert.equal(done.sessionProgress.isCompletedToday, true);
  assert.equal(done.sessionProgress.repairedCount, 1);
  assert.equal(done.sessionProgress.masteredCount, 1);
  const completedRecord = session.getRecords()[done.expectedInputState.wordId];
  assert.equal(completedRecord.errorBank.active, true);
  assert.equal(completedRecord.srs.stage, 1);
  assert.equal(completedRecord.srs.nextReviewAt, now + 191_000 + 24 * 60 * 60 * 1_000);
});
