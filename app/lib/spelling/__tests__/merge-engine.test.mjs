import test from "node:test";
import assert from "node:assert/strict";

import { mergeBatch, mergeWordState, resolveConflict } from "../sync/merge-engine.mjs";

function record(wordId, patch = {}) {
  return {
    wordId,
    updatedAt: 100,
    revision: 1,
    deviceId: "device-a",
    version: 1,
    spelling: {
      totalAttempts: 1,
      correctAttempts: 1,
      wrongAttempts: 0,
      lastAnswer: "alpha",
      lastAttemptAt: 100,
      hintLevel: 0
    },
    today: {
      repairState: "normal",
      completedToday: false,
      lastSeenAt: 100,
      lastSeenSequence: 1
    },
    errorBank: {
      everWrong: false,
      totalWrongCount: 0,
      totalCorrectCount: 1,
      latestWrongAt: 0,
      lastWrongAnswer: "",
      active: false,
      severity: "low"
    },
    srs: {
      stage: 0,
      nextReviewAt: 0,
      lastReviewedAt: 0
    },
    ...patch
  };
}

test("mergeWordState keeps the latest repair transition and error history", () => {
  const local = record("alpha", {
    updatedAt: 200,
    revision: 2,
    today: { repairState: "done_today", completedToday: true, lastSeenAt: 200, lastSeenSequence: 4 },
    errorBank: { everWrong: true, totalWrongCount: 1, totalCorrectCount: 3, latestWrongAt: 120, lastWrongAnswer: "alhpa", active: false, severity: "low" },
    srs: { stage: 1, nextReviewAt: 1_000, lastReviewedAt: 200 }
  });
  const remote = record("alpha", {
    updatedAt: 150,
    revision: 5,
    deviceId: "device-b",
    today: { repairState: "must_repair", completedToday: false, lastSeenAt: 150, lastSeenSequence: 5 },
    errorBank: { everWrong: true, totalWrongCount: 3, totalCorrectCount: 1, latestWrongAt: 150, lastWrongAnswer: "alpah", active: true, severity: "high" },
    srs: { stage: 2, nextReviewAt: 2_000, lastReviewedAt: 140 }
  });

  const merged = mergeWordState(local, remote);

  assert.equal(merged.wordId, "alpha");
  assert.equal(merged.today.repairState, "done_today");
  assert.equal(merged.errorBank.totalWrongCount, 3);
  assert.equal(merged.errorBank.latestWrongAt, 150);
  assert.equal(merged.errorBank.active, true);
  assert.equal(merged.srs.stage, 1);
  assert.equal(merged.srs.nextReviewAt, 1_000);
  assert.equal(merged.revision, 7);
});

test("mergeBatch groups by wordId and merges all device records", () => {
  const result = mergeBatch([
    record("alpha", { revision: 1 }),
    record("beta", { revision: 2 }),
    record("alpha", { revision: 3, updatedAt: 300, today: { repairState: "waiting_second" } })
  ]);

  assert.equal(result.length, 2);
  assert.equal(result.find((item) => item.wordId === "alpha").revision, 4);
  assert.equal(result.find((item) => item.wordId === "alpha").today.repairState, "waiting_second");
});

test("resolveConflict returns merged record with conflict metadata", () => {
  const resolved = resolveConflict(
    record("alpha", { today: { repairState: "done_today" } }),
    record("alpha", { today: { repairState: "waiting_second" } })
  );

  assert.equal(resolved.record.today.repairState, "waiting_second");
  assert.equal(resolved.conflict.wordId, "alpha");
  assert.ok(resolved.conflict.rules.includes("strictest_repair_state_on_tie"));
});

test("newer wrong answer reset is not overwritten by an older repair streak", () => {
  const newerWrong = record("alpha", {
    updatedAt: 300,
    today: {
      repairState: "in_repair",
      repairStreak: 0,
      repairCorrectCount: 0,
      repairLocked: true,
      currentErrorCount: 2,
      lastSeenAt: 300,
      lastSeenSequence: 8
    },
    srs: { stage: 0, nextReviewAt: 0, lastReviewedAt: 200 }
  });
  const olderPartialRepair = record("alpha", {
    updatedAt: 200,
    today: {
      repairState: "in_repair",
      repairStreak: 2,
      repairCorrectCount: 2,
      repairLocked: false,
      currentErrorCount: 0,
      lastSeenAt: 200,
      lastSeenSequence: 7
    },
    srs: { stage: 2, nextReviewAt: 2_000, lastReviewedAt: 200 }
  });

  const merged = mergeWordState(newerWrong, olderPartialRepair);
  assert.equal(merged.today.repairStreak, 0);
  assert.equal(merged.today.repairLocked, true);
  assert.equal(merged.today.currentErrorCount, 2);
  assert.equal(merged.srs.stage, 0);
  assert.equal(merged.srs.nextReviewAt, 0);
});

test("everWrong entries stay in the error bank after repair sync merges", () => {
  const repaired = record("alpha", {
    updatedAt: 500,
    today: { repairState: "mastered", completedToday: true, passedViaRepair: true, lastSeenAt: 500 },
    errorBank: { everWrong: true, totalWrongCount: 1, latestWrongAt: 100, active: true, severity: "low" }
  });
  const staleWrong = record("alpha", {
    updatedAt: 200,
    deviceId: "device-b",
    today: { repairState: "in_repair", completedToday: false, lastSeenAt: 200 },
    errorBank: { everWrong: true, totalWrongCount: 1, latestWrongAt: 100, active: true, severity: "low" }
  });

  const merged = mergeWordState(repaired, staleWrong);
  assert.equal(merged.today.repairState, "mastered");
  assert.equal(merged.errorBank.active, true);
});
