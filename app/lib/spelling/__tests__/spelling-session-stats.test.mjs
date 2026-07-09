import test from "node:test";
import assert from "node:assert/strict";

import {
  computeSpellingSessionMetrics,
  createSpellingSessionStats,
  recordAttempt
} from "../spelling-session-stats.mjs";

test("recordAttempt tracks consecutive correct streak", () => {
  let stats = createSpellingSessionStats({ now: 1000 });
  stats = recordAttempt(stats, { isCorrect: true }, 2000);
  stats = recordAttempt(stats, { isCorrect: true }, 3000);
  stats = recordAttempt(stats, { isCorrect: false }, 4000);
  stats = recordAttempt(stats, { isCorrect: true }, 5000);

  assert.equal(stats.consecutiveCorrect, 1);
  assert.equal(stats.maxConsecutiveCorrect, 2);
  assert.equal(stats.correctAttempts, 3);
  assert.equal(stats.wrongAttempts, 1);
});

test("recordAttempt uses measured typing time instead of page-open elapsed time", () => {
  const initial = createSpellingSessionStats({ now: 1_000 });
  const stats = recordAttempt(initial, { isCorrect: true, activeMs: 800 }, 61_000);

  assert.equal(stats.totalActiveMs, 800);
});

test("computeSpellingSessionMetrics calculates accuracy speed and eta", () => {
  const stats = {
    totalAttempts: 10,
    correctAttempts: 8,
    wrongAttempts: 2,
    consecutiveCorrect: 3,
    maxConsecutiveCorrect: 5,
    totalActiveMs: 120000,
    skippedCount: 1,
    familiarMarkedCount: 0
  };

  const metrics = computeSpellingSessionMetrics(stats, { remaining: 20 });
  assert.equal(metrics.accuracy, 80);
  assert.equal(metrics.wordsPerMinute, 5);
  assert.equal(metrics.etaMinutes, 4);
  assert.equal(metrics.consecutiveCorrect, 3);
});
