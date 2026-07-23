import test from "node:test";
import assert from "node:assert/strict";
import { runContinuousAiCompletion } from "../admin-ai-continuous-runner.mjs";

// Regression coverage for the UI contract: failed words remain unresolved.
test("continuous completion advances through bounded rounds until the queue is empty", async () => {
  const rounds = [];
  const result = await runContinuousAiCompletion({
    initialWords: 250,
    roundDelayMs: 0,
    countRemaining: (remaining) => remaining,
    async executeRound({ words, roundNumber }) {
      const filled = Math.min(100, words);
      rounds.push(roundNumber);
      return {
        words: words - filled,
        total: filled,
        filled,
        failed: 0,
        failedWordKeys: []
      };
    }
  });

  assert.deepEqual(rounds, [1, 2, 3]);
  assert.equal(result.reason, "completed");
  assert.equal(result.rounds, 3);
  assert.equal(result.filled, 250);
  assert.equal(result.remaining, 0);
  assert.equal(result.actionableRemaining, 0);
});

test("continuous completion fuses when a round fails at the configured rate", async () => {
  const result = await runContinuousAiCompletion({
    initialWords: 100,
    roundDelayMs: 0,
    countRemaining: (remaining) => remaining,
    async executeRound() {
      return {
        words: 60,
        total: 100,
        filled: 40,
        failed: 60,
        error: "upstream unavailable",
        failedWordKeys: Array.from({ length: 60 }, (_, index) => `failed-${index}`)
      };
    }
  });

  assert.equal(result.reason, "fused");
  assert.equal(result.rounds, 1);
  assert.equal(result.filled, 40);
  assert.equal(result.failed, 60);
  assert.equal(result.error, "upstream unavailable");
});

test("continuous completion stops without claiming another round after abort", async () => {
  const controller = new AbortController();
  let calls = 0;
  const result = await runContinuousAiCompletion({
    initialWords: 200,
    signal: controller.signal,
    roundDelayMs: 0,
    countRemaining: (remaining) => remaining,
    async executeRound() {
      calls += 1;
      controller.abort();
      return {
        words: 100,
        total: 100,
        filled: 100,
        failed: 0,
        failedWordKeys: [],
        aborted: true
      };
    }
  });

  assert.equal(calls, 1);
  assert.equal(result.reason, "stopped");
  assert.equal(result.rounds, 1);
  assert.equal(result.filled, 100);
  assert.equal(result.words, 100);
});

test("failed words are skipped for requests but remain visible as unresolved", async () => {
  const progress = [];
  const result = await runContinuousAiCompletion({
    initialWords: [
      { key: "done-1", completed: false },
      { key: "done-2", completed: false },
      { key: "failed", completed: false }
    ],
    roundDelayMs: 0,
    countRemaining: (words, failedWordKeys) => words.filter(
      (word) => !word.completed && !failedWordKeys.has(word.key)
    ).length,
    onProgress(state) {
      progress.push(state);
    },
    async executeRound({ words }) {
      return {
        words: words.map((word) => (
          word.key.startsWith("done-") ? { ...word, completed: true } : word
        )),
        total: 3,
        filled: 2,
        failed: 1,
        failedWordKeys: ["failed"]
      };
    }
  });

  assert.equal(result.reason, "completed-with-failures");
  assert.equal(result.rounds, 1);
  assert.deepEqual(result.failedWordKeys, ["failed"]);
  assert.equal(result.blocked, 1);
  assert.equal(result.remaining, 1);
  assert.equal(result.actionableRemaining, 0);
  assert.equal(progress.at(-1).remaining, 1);
  assert.equal(progress.at(-1).actionableRemaining, 0);
});
