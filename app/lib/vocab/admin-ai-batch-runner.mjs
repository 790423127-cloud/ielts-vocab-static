function defaultChunkSize(chunk) {
  return Array.isArray(chunk) ? chunk.length : 0;
}

function defaultSleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function runAdminAiBatch(options) {
  const {
    chunks = [],
    workerCount = 1,
    maxRetries = 0,
    executeChunk,
    shouldRetry = () => true,
    retryDelayMs = () => 0,
    sleep = defaultSleep,
    getChunkSize = defaultChunkSize,
    onChunkStart,
    onRetry,
    onChunkError,
    onChunkSettled
  } = options || {};

  if (typeof executeChunk !== "function") {
    throw new TypeError("runAdminAiBatch requires executeChunk");
  }

  let nextChunkIndex = 0;
  let completedChunks = 0;
  let completedItems = 0;

  async function runWithRetry(context) {
    let attempt = 0;

    while (true) {
      const attemptContext = {
        ...context,
        attempt,
        completedChunks,
        completedItems,
        remainingChunks: Math.max(0, chunks.length - nextChunkIndex)
      };
      await onChunkStart?.(attemptContext);

      try {
        return await executeChunk(attemptContext);
      } catch (error) {
        const canRetry = attempt < maxRetries && await shouldRetry({
          ...attemptContext,
          error
        });

        if (!canRetry) throw error;

        const nextAttempt = attempt + 1;
        const delayMs = Math.max(0, Number(retryDelayMs({
          ...attemptContext,
          error,
          nextAttempt
        })) || 0);

        await onRetry?.({
          ...attemptContext,
          error,
          nextAttempt,
          delayMs
        });

        if (delayMs > 0) await sleep(delayMs);
        attempt = nextAttempt;
      }
    }
  }

  async function worker(workerId) {
    while (nextChunkIndex < chunks.length) {
      const chunkIndex = nextChunkIndex;
      nextChunkIndex += 1;

      const chunk = chunks[chunkIndex];
      const context = { chunk, chunkIndex, workerId };
      let error = null;

      try {
        await runWithRetry(context);
      } catch (caughtError) {
        error = caughtError;
        await onChunkError?.({ ...context, error: caughtError });
      } finally {
        completedChunks += 1;
        completedItems += Math.max(0, Number(getChunkSize(chunk)) || 0);

        await onChunkSettled?.({
          ...context,
          error,
          completedChunks,
          completedItems,
          remainingChunks: Math.max(0, chunks.length - nextChunkIndex)
        });
      }
    }
  }

  const activeWorkerCount = Math.min(
    Math.max(0, Math.floor(Number(workerCount) || 0)),
    chunks.length
  );

  await Promise.all(
    Array.from({ length: activeWorkerCount }, (_, index) => worker(index + 1))
  );

  return {
    completedChunks,
    completedItems,
    workerCount: activeWorkerCount
  };
}
