export const CONTINUOUS_AI_POLICY = Object.freeze({
  maxRounds: 100,
  roundDelayMs: 600,
  failureRateFuse: 0.5
});

function defaultSleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function runContinuousAiCompletion(options = {}) {
  const {
    initialWords = [],
    countRemaining,
    executeRound,
    signal,
    maxRounds = CONTINUOUS_AI_POLICY.maxRounds,
    roundDelayMs = CONTINUOUS_AI_POLICY.roundDelayMs,
    failureRateFuse = CONTINUOUS_AI_POLICY.failureRateFuse,
    sleep = defaultSleep,
    onProgress
  } = options;

  if (typeof countRemaining !== "function") {
    throw new TypeError("runContinuousAiCompletion requires countRemaining");
  }
  if (typeof executeRound !== "function") {
    throw new TypeError("runContinuousAiCompletion requires executeRound");
  }

  let words = initialWords;
  let rounds = 0;
  let processed = 0;
  let filled = 0;
  let failed = 0;
  let lastError = "";
  let reason = "completed";
  const failedWordKeys = new Set();
  const trueRemaining = () => countRemaining(words, new Set());
  const actionableRemaining = () => countRemaining(words, failedWordKeys);
  const initialRemaining = trueRemaining();
  const effectiveMaxRounds = Math.max(1, Math.min(
    CONTINUOUS_AI_POLICY.maxRounds,
    Math.floor(Number(maxRounds) || CONTINUOUS_AI_POLICY.maxRounds)
  ));

  async function publishProgress(status) {
    await onProgress?.({
      status,
      rounds,
      processed,
      filled,
      failed,
      blocked: failedWordKeys.size,
      remaining: trueRemaining(),
      actionableRemaining: actionableRemaining(),
      initialRemaining,
      error: lastError
    });
  }

  await publishProgress("running");

  while (rounds < effectiveMaxRounds) {
    if (signal?.aborted) {
      reason = "stopped";
      break;
    }

    if (actionableRemaining() <= 0) {
      reason = failedWordKeys.size ? "completed-with-failures" : "completed";
      break;
    }

    const roundNumber = rounds + 1;
    const result = await executeRound({
      words,
      roundNumber,
      failedWordKeys: new Set(failedWordKeys),
      signal
    });

    if (signal?.aborted || result?.aborted) {
      words = result?.words ?? words;
      const partialTotal = Math.max(0, Number(result?.total) || 0);
      const partialFilled = Math.max(0, Number(result?.filled) || 0);
      const partialFailed = Math.max(0, Number(result?.failed) || 0);
      if (partialTotal > 0 || partialFilled > 0) rounds = roundNumber;
      processed += partialTotal;
      filled += partialFilled;
      failed += partialFailed;
      lastError = String(result?.error || lastError);
      for (const key of result?.failedWordKeys || []) {
        if (key) failedWordKeys.add(String(key));
      }
      await publishProgress("stopping");
      reason = "stopped";
      break;
    }

    words = result?.words ?? words;
    rounds = roundNumber;
    processed += Math.max(0, Number(result?.total) || 0);
    filled += Math.max(0, Number(result?.filled) || 0);
    failed += Math.max(0, Number(result?.failed) || 0);
    lastError = String(result?.error || lastError);
    for (const key of result?.failedWordKeys || []) {
      if (key) failedWordKeys.add(String(key));
    }

    await publishProgress("running");

    const total = Math.max(0, Number(result?.total) || 0);
    const roundFailed = Math.max(0, Number(result?.failed) || 0);
    const roundFilled = Math.max(0, Number(result?.filled) || 0);
    const failureRate = total ? roundFailed / total : 0;

    if (total <= 0 || roundFilled <= 0 || failureRate >= failureRateFuse) {
      reason = "fused";
      break;
    }

    if (actionableRemaining() <= 0) {
      reason = failedWordKeys.size ? "completed-with-failures" : "completed";
      break;
    }

    if (roundDelayMs > 0) await sleep(roundDelayMs);
  }

  if (rounds >= effectiveMaxRounds && actionableRemaining() > 0 && reason === "completed") {
    reason = "limit";
  }

  return {
    words,
    reason,
    rounds,
    processed,
    filled,
    failed,
    blocked: failedWordKeys.size,
    failedWordKeys: [...failedWordKeys],
    remaining: trueRemaining(),
    actionableRemaining: actionableRemaining(),
    initialRemaining,
    error: lastError
  };
}
