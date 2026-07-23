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
  const initialRemaining = countRemaining(words, failedWordKeys);
  const effectiveMaxRounds = Math.max(1, Math.min(
    CONTINUOUS_AI_POLICY.maxRounds,
    Math.floor(Number(maxRounds) || CONTINUOUS_AI_POLICY.maxRounds)
  ));

  await onProgress?.({
    status: "running",
    rounds,
    processed,
    filled,
    failed,
    remaining: initialRemaining,
    initialRemaining,
    error: ""
  });

  while (rounds < effectiveMaxRounds) {
    if (signal?.aborted) {
      reason = "stopped";
      break;
    }

    const remaining = countRemaining(words, failedWordKeys);
    if (remaining <= 0) {
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
      await onProgress?.({
        status: "stopping",
        rounds,
        processed,
        filled,
        failed,
        remaining: countRemaining(words, failedWordKeys),
        initialRemaining,
        error: lastError
      });
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

    const nextRemaining = countRemaining(words, failedWordKeys);
    await onProgress?.({
      status: "running",
      rounds,
      processed,
      filled,
      failed,
      remaining: nextRemaining,
      initialRemaining,
      error: lastError
    });

    const total = Math.max(0, Number(result?.total) || 0);
    const roundFailed = Math.max(0, Number(result?.failed) || 0);
    const roundFilled = Math.max(0, Number(result?.filled) || 0);
    const failureRate = total ? roundFailed / total : 0;

    if (total <= 0 || roundFilled <= 0 || failureRate >= failureRateFuse) {
      reason = "fused";
      break;
    }

    if (nextRemaining <= 0) {
      reason = failedWordKeys.size ? "completed-with-failures" : "completed";
      break;
    }

    if (roundDelayMs > 0) await sleep(roundDelayMs);
  }

  if (rounds >= effectiveMaxRounds && countRemaining(words, failedWordKeys) > 0 && reason === "completed") {
    reason = "limit";
  }

  return {
    words,
    reason,
    rounds,
    processed,
    filled,
    failed,
    failedWordKeys: [...failedWordKeys],
    remaining: countRemaining(words, failedWordKeys),
    initialRemaining,
    error: lastError
  };
}
