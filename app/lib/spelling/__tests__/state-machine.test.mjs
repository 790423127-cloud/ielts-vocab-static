import test from "node:test";
import assert from "node:assert/strict";

import {
  createSpellingRecord,
  enqueueSpellingPriorityReview,
  getSpellingHint,
  isRepairRevisitEligible,
  markSpellingFamiliar,
  migrateLegacySpellingRecord,
  rolloverSpellingRecordForSession,
  submitSpellingAnswer
} from "../index.mjs";
import { isSpellingAnswerCorrect } from "../state-machine.mjs";

const baseNow = Date.UTC(2026, 5, 18, 9, 0, 0);

test("legacy mastered errors leave the active error bank and receive an SRS date", () => {
  const record = createSpellingRecord("word_legacy", { now: baseNow });
  record.today.repairState = "mastered";
  record.today.completedToday = true;
  record.today.lastSeenAt = baseNow;
  record.errorBank.everWrong = true;
  record.errorBank.active = true;
  record.errorBank.totalWrongCount = 2;

  const migrated = migrateLegacySpellingRecord(record, { now: baseNow + 60_000 });
  assert.equal(migrated.changed, true);
  assert.equal(migrated.record.errorBank.active, true);
  assert.equal(migrated.record.srs.stage, 1);
  assert.equal(migrated.record.srs.nextReviewAt, baseNow + 24 * 60 * 60 * 1_000);
  assert.equal(migrated.record.dirty, true);
});

test("legacy unresolved errors are restored without premature SRS scheduling", () => {
  const record = createSpellingRecord("word_unresolved", { now: baseNow });
  record.today.repairState = "in_repair";
  record.today.completedToday = false;
  record.errorBank.everWrong = true;
  record.errorBank.active = false;
  record.errorBank.totalWrongCount = 1;

  const migrated = migrateLegacySpellingRecord(record, { now: baseNow + 60_000 });
  assert.equal(migrated.changed, true);
  assert.equal(migrated.record.errorBank.active, true);
  assert.equal(migrated.record.srs.stage, 0);
  assert.equal(migrated.record.srs.nextReviewAt, 0);
});

test("wrong answer enters in_repair immediately and cannot advance", () => {
  const record = createSpellingRecord("word_accommodation", {
    now: baseNow,
    sessionDate: "2026-06-18"
  });

  const result = submitSpellingAnswer(record, {
    answer: "acommodation",
    expectedAnswer: "accommodation",
    now: baseNow,
    sequence: 1
  });

  assert.equal(result.isCorrect, false);
  assert.equal(result.canAdvance, false);
  assert.equal(result.record.today.repairState, "in_repair");
  assert.equal(result.record.today.repairStreak, 0);
  assert.equal(result.record.today.repairLocked, true);
  assert.equal(result.record.errorBank.totalWrongCount, 1);
});

test("first correct in repair increments streak but does not master until required streak", () => {
  const first = submitSpellingAnswer(createSpellingRecord("word_accommodation"), {
    answer: "acommodation",
    expectedAnswer: "accommodation",
    now: baseNow,
    sequence: 1
  }).record;

  const result = submitSpellingAnswer(first, {
    answer: "accommodation",
    expectedAnswer: "accommodation",
    now: baseNow + 10_000,
    sequence: 2
  });

  assert.equal(result.isCorrect, true);
  assert.equal(result.canAdvance, true);
  assert.equal(result.record.today.repairState, "in_repair");
  assert.equal(result.record.today.repairStreak, 1);
  assert.equal(result.record.today.repairLocked, false);
  assert.equal(result.record.today.minOtherWordsBeforeNext, 5);
});

test("wrong answer during repair resets consecutive streak to zero", () => {
  const partial = submitSpellingAnswer(
    submitSpellingAnswer(createSpellingRecord("word_accommodation"), {
      answer: "acommodation",
      expectedAnswer: "accommodation",
      now: baseNow,
      sequence: 1
    }).record,
    {
      answer: "accommodation",
      expectedAnswer: "accommodation",
      now: baseNow + 10_000,
      sequence: 2
    }
  ).record;

  const result = submitSpellingAnswer(partial, {
    answer: "accomodation",
    expectedAnswer: "accommodation",
    now: baseNow + 300_000,
    sequence: 11
  });

  assert.equal(result.isCorrect, false);
  assert.equal(result.canAdvance, false);
  assert.equal(result.record.today.repairState, "in_repair");
  assert.equal(result.record.today.repairStreak, 0);
  assert.equal(result.record.errorBank.totalWrongCount, 2);
});

test("repair passes after two consecutive correct answers and then masters", () => {
  const partial = submitSpellingAnswer(
    submitSpellingAnswer(createSpellingRecord("word_accommodation"), {
      answer: "acommodation",
      expectedAnswer: "accommodation",
      now: baseNow,
      sequence: 1
    }).record,
    {
      answer: "accommodation",
      expectedAnswer: "accommodation",
      now: baseNow + 10_000,
      sequence: 2
    }
  ).record;

  const result = submitSpellingAnswer(partial, {
    answer: "accommodation",
    expectedAnswer: "accommodation",
    now: baseNow + 300_000,
    sequence: 11
  });

  assert.equal(result.isCorrect, true);
  assert.equal(result.record.today.repairState, "mastered");
  assert.equal(result.record.today.repairStreak, 2);
  assert.equal(result.record.today.passedViaRepair, true);
  assert.equal(result.record.today.completedToday, true);
  assert.equal(result.record.errorBank.active, true);
  assert.equal(result.record.errorBank.totalWrongCount, 1);
  assert.equal(result.record.srs.stage, 1);
  assert.equal(result.record.srs.nextReviewAt, baseNow + 300_000 + 24 * 60 * 60 * 1_000);
});

test("completed repair is hidden only for its session date and returns the next day", () => {
  let record = createSpellingRecord("word_accommodation", {
    now: baseNow,
    sessionDate: "2026-06-18"
  });
  record = submitSpellingAnswer(record, {
    answer: "acommodation",
    expectedAnswer: "accommodation",
    now: baseNow,
    sequence: 1,
    sessionDate: "2026-06-18"
  }).record;
  record = submitSpellingAnswer(record, {
    answer: "accommodation",
    expectedAnswer: "accommodation",
    now: baseNow + 10_000,
    sequence: 2,
    sessionDate: "2026-06-18"
  }).record;
  record = submitSpellingAnswer(record, {
    answer: "accommodation",
    expectedAnswer: "accommodation",
    now: baseNow + 300_000,
    sequence: 11,
    sessionDate: "2026-06-18"
  }).record;

  const sameDay = rolloverSpellingRecordForSession(record, {
    now: baseNow + 600_000,
    sessionDate: "2026-06-18"
  });
  assert.equal(sameDay.changed, false);
  assert.equal(sameDay.record.today.completedToday, true);

  const nextDay = rolloverSpellingRecordForSession(record, {
    now: baseNow + 24 * 60 * 60 * 1_000,
    sessionDate: "2026-06-19"
  });
  assert.equal(nextDay.changed, true);
  assert.equal(nextDay.record.today.repairState, "normal");
  assert.equal(nextDay.record.today.completedToday, false);
  assert.equal(nextDay.record.today.activeInTodayList, true);
  assert.equal(nextDay.record.errorBank.everWrong, true);
  assert.equal(nextDay.record.errorBank.active, true);
  assert.equal(nextDay.record.errorBank.totalWrongCount, 1);
  assert.equal(nextDay.record.srs.stage, 1);
});

test("unfinished repair survives day rollover without losing its streak or error history", () => {
  let record = createSpellingRecord("word_accommodation", {
    now: baseNow,
    sessionDate: "2026-06-18"
  });
  record = submitSpellingAnswer(record, {
    answer: "wrong",
    expectedAnswer: "accommodation",
    now: baseNow,
    sequence: 1,
    sessionDate: "2026-06-18"
  }).record;
  record = submitSpellingAnswer(record, {
    answer: "accommodation",
    expectedAnswer: "accommodation",
    now: baseNow + 10_000,
    sequence: 2,
    sessionDate: "2026-06-18"
  }).record;

  const nextDay = rolloverSpellingRecordForSession(record, {
    now: baseNow + 24 * 60 * 60 * 1_000,
    sessionDate: "2026-06-19"
  }).record;
  assert.equal(nextDay.today.repairState, "in_repair");
  assert.equal(nextDay.today.repairStreak, 1);
  assert.equal(nextDay.today.completedToday, false);
  assert.equal(nextDay.errorBank.totalWrongCount, 1);
});

test("historical wrong count at or above 2 still requires only two consecutive correct answers", () => {
  let record = createSpellingRecord("word_alpha");
  record.errorBank.totalWrongCount = 2;
  record.errorBank.everWrong = true;

  record = submitSpellingAnswer(record, {
    answer: "wrong",
    expectedAnswer: "alpha",
    now: baseNow,
    sequence: 1
  }).record;

  record = submitSpellingAnswer(record, {
    answer: "alpha",
    expectedAnswer: "alpha",
    now: baseNow + 10_000,
    sequence: 2
  }).record;
  assert.equal(record.today.repairStreak, 1);

  record = submitSpellingAnswer(record, {
    answer: "alpha",
    expectedAnswer: "alpha",
    now: baseNow + 300_000,
    sequence: 11
  }).record;
  assert.equal(record.today.repairState, "mastered");
  assert.equal(record.today.repairStreak, 2);
});

test("new word correct answer masters without entering repair", () => {
  const result = submitSpellingAnswer(createSpellingRecord("alpha"), {
    answer: "alpha",
    expectedAnswer: "alpha",
    now: baseNow,
    sequence: 1
  });

  assert.equal(result.record.today.repairState, "mastered");
  assert.equal(result.record.today.passedViaNew, true);
  assert.equal(result.record.today.passedViaRepair, false);
});

test("markSpellingFamiliar masters only normal words", () => {
  const familiar = markSpellingFamiliar(createSpellingRecord("alpha"), { now: baseNow + 1_000, sequence: 3 });
  assert.equal(familiar.canAdvance, true);
  assert.equal(familiar.record.today.repairState, "mastered");
  assert.equal(familiar.record.today.passedViaNew, true);

  const blocked = markSpellingFamiliar(
    submitSpellingAnswer(createSpellingRecord("beta"), {
      answer: "wrong",
      expectedAnswer: "beta",
      now: baseNow,
      sequence: 1
    }).record,
    { now: baseNow + 2_000, sequence: 2 }
  );
  assert.equal(blocked.canAdvance, false);
});

test("enqueueSpellingPriorityReview enrolls word in repair queue and error bank", () => {
  const result = enqueueSpellingPriorityReview(createSpellingRecord("alpha"), { now: baseNow + 1_000, sequence: 3 });

  assert.equal(result.canAdvance, true);
  assert.equal(result.record.today.repairState, "in_repair");
  assert.equal(result.record.today.repairStreak, 0);
  assert.equal(result.record.today.minOtherWordsBeforeNext, 5);
  assert.equal(result.record.errorBank.everWrong, true);
  assert.equal(isRepairRevisitEligible(result.record, { now: baseNow + 1_000, sequence: 3 }), false);
});

test("hint uses manual spellingHint before generated chunks", () => {
  assert.equal(
    getSpellingHint({ word: "accommodation", spellingHint: "ac · com · mo · da · tion" }, 2),
    "ac · com · mo · da · tion"
  );

  assert.equal(getSpellingHint({ word: "reliable" }, 2), "rel · iab · le");
  assert.equal(getSpellingHint({ word: "reliable" }, 3), "reliable");
});

test("isSpellingAnswerCorrect normalizes case, spaces, and accepted variants", () => {
  assert.equal(isSpellingAnswerCorrect("  Abandon  ", "abandon"), true);
  assert.equal(isSpellingAnswerCorrect("colour", "color", ["colour"]), true);
  assert.equal(isSpellingAnswerCorrect("aban", "abandon"), false);
});
