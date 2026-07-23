import test from "node:test";
import assert from "node:assert/strict";
import { runAdminAiBatch } from "../admin-ai-batch-runner.mjs";

test("runAdminAiBatch respects concurrency and settles each chunk once", async () => {
  const chunks = [[1, 2], [3], [4, 5, 6], [7]];
  const processed = [];
  const settled = [];
  let active = 0;
  let peakActive = 0;

  const result = await runAdminAiBatch({
    chunks,
    workerCount: 2,
    async executeChunk({ chunk, chunkIndex, workerId, attempt }) {
      assert.equal(attempt, 0);
      active += 1;
      peakActive = Math.max(peakActive, active);
      await new Promise((resolve) => setTimeout(resolve, chunkIndex % 2 ? 2 : 5));
      processed.push({ chunkIndex, workerId, chunk });
      active -= 1;
    },
    onChunkSettled(progress) {
      settled.push(progress);
    }
  });

  assert.equal(peakActive, 2);
  assert.deepEqual(processed.map(({ chunkIndex }) => chunkIndex).sort(), [0, 1, 2, 3]);
  assert.equal(new Set(processed.map(({ workerId }) => workerId)).size, 2);
  assert.equal(settled.length, chunks.length);
  assert.deepEqual(result, {
    completedChunks: 4,
    completedItems: 7,
    workerCount: 2,
    retryCount: 0
  });
});

test("runAdminAiBatch does not retry paid failures by default", async () => {
  let attempts = 0;
  const errors = [];

  const result = await runAdminAiBatch({
    chunks: [["paid"]],
    workerCount: 1,
    maxRetries: 3,
    executeChunk() {
      attempts += 1;
      const error = new Error("paid request failed");
      error.retryable = true;
      throw error;
    },
    shouldRetry: ({ error }) => error.retryable,
    onChunkError: ({ error }) => errors.push(error.message)
  });

  assert.equal(attempts, 1);
  assert.equal(result.retryCount, 0);
  assert.deepEqual(errors, ["paid request failed"]);
});

test("runAdminAiBatch retries only with explicit opt-in", async () => {
  const attempts = [];
  const retries = [];
  const delays = [];
  const errors = [];

  const result = await runAdminAiBatch({
    chunks: [["retry"], ["stop"]],
    workerCount: 1,
    maxRetries: 2,
    allowAutomaticRetry: true,
    executeChunk({ chunk, attempt }) {
      attempts.push(`${chunk[0]}:${attempt}`);
      const error = new Error(chunk[0]);
      error.retryable = chunk[0] === "retry";
      if (chunk[0] === "retry" && attempt === 2) return;
      throw error;
    },
    shouldRetry: ({ error }) => error.retryable,
    retryDelayMs: ({ nextAttempt }) => nextAttempt * 100,
    sleep: async (delayMs) => {
      delays.push(delayMs);
    },
    onRetry({ chunk, nextAttempt, delayMs }) {
      retries.push(`${chunk[0]}:${nextAttempt}:${delayMs}`);
    },
    onChunkError({ chunk, error }) {
      errors.push(`${chunk[0]}:${error.message}`);
    }
  });

  assert.deepEqual(attempts, ["retry:0", "retry:1", "retry:2", "stop:0"]);
  assert.deepEqual(retries, ["retry:1:100", "retry:2:200"]);
  assert.deepEqual(delays, [100, 200]);
  assert.deepEqual(errors, ["stop:stop"]);
  assert.equal(result.retryCount, 2);
});

test("runAdminAiBatch reports claimed-queue progress after failures", async () => {
  const progress = [];

  const result = await runAdminAiBatch({
    chunks: [{ items: [1, 2] }, { items: [3] }],
    workerCount: 4,
    getChunkSize: (chunk) => chunk.items.length,
    executeChunk({ chunkIndex }) {
      if (chunkIndex === 0) throw new Error("failed");
    },
    onChunkSettled(state) {
      progress.push({
        failed: Boolean(state.error),
        completedItems: state.completedItems,
        remainingChunks: state.remainingChunks
      });
    }
  });

  assert.deepEqual(result, {
    completedChunks: 2,
    completedItems: 3,
    workerCount: 2,
    retryCount: 0
  });
  assert.equal(progress.length, 2);
  assert.equal(progress.filter(({ failed }) => failed).length, 1);
  assert.equal(progress.at(-1).completedItems, 3);
  assert.ok(progress.every(({ remainingChunks }) => remainingChunks === 0));
});

test("runAdminAiBatch validates execution and handles empty plans", async () => {
  await assert.rejects(() => runAdminAiBatch({ chunks: [] }), /requires executeChunk/);

  const result = await runAdminAiBatch({
    chunks: [],
    workerCount: 5,
    executeChunk() {
      assert.fail("empty plan must not execute");
    }
  });

  assert.deepEqual(result, {
    completedChunks: 0,
    completedItems: 0,
    workerCount: 0,
    retryCount: 0
  });
});

test("runAdminAiBatch stops claiming queued chunks after abort", async () => {
  const controller = new AbortController();
  const executed = [];

  const result = await runAdminAiBatch({
    chunks: [[1], [2], [3]],
    workerCount: 1,
    signal: controller.signal,
    executeChunk({ chunk }) {
      executed.push(chunk[0]);
      controller.abort();
    }
  });

  assert.deepEqual(executed, [1]);
  assert.equal(result.completedChunks, 1);
  assert.equal(result.completedItems, 1);
});
