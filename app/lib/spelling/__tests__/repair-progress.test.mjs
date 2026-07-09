import test from "node:test";
import assert from "node:assert/strict";

import {
  computeRepairSessionStats,
  formatRepairProgressLabel,
  getRepairProgress,
  getRepairStreakRequired,
  isRepairRevisitEligible
} from "../repair-progress.mjs";
import { createSpellingRecord, submitSpellingAnswer } from "../state-machine.mjs";

const baseNow = Date.UTC(2026, 5, 18, 9, 0, 0);

test("getRepairStreakRequired always returns 2 after repeated historical errors", () => {
  const fresh = createSpellingRecord("alpha");
  assert.equal(getRepairStreakRequired(fresh), 2);

  const repeated = createSpellingRecord("alpha");
  repeated.errorBank.totalWrongCount = 2;
  assert.equal(getRepairStreakRequired(repeated), 2);
});

test("formatRepairProgressLabel renders repair progress for UI", () => {
  const record = createSpellingRecord("alpha");
  record.today.repairState = "in_repair";
  record.today.repairStreak = 1;

  assert.equal(formatRepairProgressLabel(record), "Repair Progress: 1/2");
  assert.deepEqual(getRepairProgress(record), {
    streak: 1,
    required: 2,
    label: "1/2",
    isComplete: false,
    inRepair: true
  });
});

test("computeRepairSessionStats separates new pass, repairing, repaired, and mastered", () => {
  const ids = ["a", "b", "c", "d"];
  const records = {
    a: {
      today: { repairState: "mastered", passedViaNew: true, completedToday: true },
      errorBank: { everWrong: false }
    },
    b: { today: { repairState: "in_repair", repairStreak: 1 }, errorBank: { everWrong: true } },
    c: {
      today: { repairState: "mastered", passedViaRepair: true, completedToday: true },
      errorBank: { everWrong: true }
    },
    d: { today: { repairState: "normal" }, errorBank: { everWrong: false } }
  };

  assert.deepEqual(computeRepairSessionStats(records, ids), {
    newWordsPassed: 1,
    repairingCount: 1,
    repairedCount: 1,
    masteredCount: 2
  });
});

test("isRepairRevisitEligible blocks locked repair items until spacing is satisfied", () => {
  const wrong = submitSpellingAnswer(createSpellingRecord("alpha"), {
    answer: "wrong",
    expectedAnswer: "alpha",
    now: baseNow,
    sequence: 1
  }).record;

  assert.equal(isRepairRevisitEligible(wrong, { now: baseNow + 1_000, sequence: 2 }), false);

  const partial = submitSpellingAnswer(wrong, {
    answer: "alpha",
    expectedAnswer: "alpha",
    now: baseNow + 10_000,
    sequence: 2
  }).record;

  assert.equal(isRepairRevisitEligible(partial, { now: baseNow + 190_000, sequence: 6 }), false);
  assert.equal(isRepairRevisitEligible(partial, { now: baseNow + 190_000, sequence: 7 }), true);
});
