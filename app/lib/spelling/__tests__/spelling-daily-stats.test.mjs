import test from "node:test";
import assert from "node:assert/strict";

import {
  createSpellingDailyStats,
  createLearningActivity,
  finishLearningActivity,
  formatActiveLearningTime,
  recordSpellingDailyActiveTime,
  recordSpellingDailyAttempt,
  recordLearningActivity
} from "../spelling-daily-stats.mjs";

test("daily spelling stats count learned and wrong words uniquely", () => {
  let stats = createSpellingDailyStats({ date: "2026-06-23" });
  stats = recordSpellingDailyAttempt(stats, {
    wordId: "alpha",
    isCorrect: false,
    activeMs: 1_000
  }, { date: "2026-06-23" });
  stats = recordSpellingDailyAttempt(stats, {
    wordId: "alpha",
    isCorrect: true,
    activeMs: 500
  }, { date: "2026-06-23" });

  assert.deepEqual(stats.learnedWordIds, ["alpha"]);
  assert.deepEqual(stats.wrongWordIds, ["alpha"]);
  assert.equal(stats.totalAttempts, 2);
  assert.equal(stats.activeMs, 1_500);
});

test("active study time can be saved without counting a skipped word as learned", () => {
  const stats = recordSpellingDailyActiveTime(
    createSpellingDailyStats({ date: "2026-06-23" }),
    4_000,
    { date: "2026-06-23" }
  );

  assert.equal(stats.activeMs, 4_000);
  assert.deepEqual(stats.learnedWordIds, []);
  assert.equal(stats.totalAttempts, 0);
});

test("effective learning includes bounded reading, interaction, and completion time", () => {
  let activity = createLearningActivity({ now: 1_000 });
  activity = recordLearningActivity(activity, { now: 5_000 });
  activity = recordLearningActivity(activity, { now: 7_000 });
  const finished = finishLearningActivity(activity, { now: 9_000 });

  assert.equal(finished.activeMs, 8_000);
  assert.equal(finished.next.questionShownAt, 9_000);
  assert.equal(finished.next.engaged, false);
});

test("initial reading time is capped when the first action is delayed", () => {
  let activity = createLearningActivity({ now: 1_000 });
  activity = recordLearningActivity(activity, { now: 21_000 });
  const finished = finishLearningActivity(activity, { now: 22_000 });

  assert.equal(finished.activeMs, 9_000);
});

test("long idle periods are excluded and resuming counts only the renewed action", () => {
  let activity = createLearningActivity({ now: 1_000 });
  activity = recordLearningActivity(activity, { now: 3_000 });
  activity = recordLearningActivity(activity, { now: 63_000 });
  const finished = finishLearningActivity(activity, { now: 63_500 });

  assert.equal(finished.activeMs, 3_500);
});

test("non-meaningful events and an untouched page add no learning time", () => {
  let activity = createLearningActivity({ now: 1_000 });
  activity = recordLearningActivity(activity, { now: 5_000, meaningful: false });
  const finished = finishLearningActivity(activity, { now: 65_000 });

  assert.equal(finished.activeMs, 0);
});

test("daily stats reset on a new local day and format active duration", () => {
  const previous = {
    ...createSpellingDailyStats({ date: "2026-06-22" }),
    learnedWordIds: ["alpha"],
    activeMs: 65_000
  };
  const next = recordSpellingDailyAttempt(previous, {
    wordId: "beta",
    isCorrect: true,
    activeMs: 2_000
  }, { date: "2026-06-23" });

  assert.deepEqual(next.learnedWordIds, ["beta"]);
  assert.equal(next.activeMs, 2_000);
  assert.equal(formatActiveLearningTime(250), "1 秒");
  assert.equal(formatActiveLearningTime(65_000), "1 分 5 秒");
});
