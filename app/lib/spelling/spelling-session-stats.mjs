export function createSpellingSessionStats(options = {}) {
  const now = Number(options.now || Date.now());

  return {
    startedAt: now,
    questionStartedAt: now,
    totalAttempts: 0,
    correctAttempts: 0,
    wrongAttempts: 0,
    skippedCount: 0,
    consecutiveCorrect: 0,
    maxConsecutiveCorrect: 0,
    familiarMarkedCount: 0,
    totalActiveMs: 0
  };
}

export function beginQuestion(stats, now = Date.now()) {
  const next = { ...stats, questionStartedAt: now };
  return next;
}

export function recordAttempt(stats, result = {}, now = Date.now()) {
  const elapsed = Math.max(0, now - Number(stats.questionStartedAt || now));
  const activeMs = Number.isFinite(Number(result.activeMs))
    ? Math.max(0, Number(result.activeMs))
    : elapsed;
  const next = {
    ...stats,
    totalAttempts: stats.totalAttempts + 1,
    totalActiveMs: stats.totalActiveMs + activeMs
  };

  if (result.skipped) {
    next.skippedCount += 1;
    next.consecutiveCorrect = 0;
    return beginQuestion(next, now);
  }

  if (result.isCorrect) {
    next.correctAttempts += 1;
    next.consecutiveCorrect += 1;
    next.maxConsecutiveCorrect = Math.max(next.maxConsecutiveCorrect, next.consecutiveCorrect);
  } else {
    next.wrongAttempts += 1;
    next.consecutiveCorrect = 0;
  }

  return beginQuestion(next, now);
}

export function markFamiliar(stats) {
  return {
    ...stats,
    familiarMarkedCount: stats.familiarMarkedCount + 1
  };
}

export function computeSpellingSessionMetrics(stats = {}, options = {}) {
  const remaining = Math.max(0, Number(options.remaining || 0));
  const attempts = Math.max(0, Number(stats.totalAttempts || 0));
  const correct = Math.max(0, Number(stats.correctAttempts || 0));
  const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : 0;
  const activeMinutes = Math.max(0.1, (Number(stats.totalActiveMs || 0) / 60000));
  const wordsPerMinute = attempts > 0 ? Number((attempts / activeMinutes).toFixed(1)) : 0;
  const avgSecondsPerWord = attempts > 0
    ? Number((stats.totalActiveMs / attempts / 1000).toFixed(1))
    : 0;
  const etaMinutes = wordsPerMinute > 0
    ? Math.max(1, Math.round(remaining / wordsPerMinute))
    : null;

  return {
    consecutiveCorrect: stats.consecutiveCorrect || 0,
    maxConsecutiveCorrect: stats.maxConsecutiveCorrect || 0,
    totalAttempts: attempts,
    correctAttempts: correct,
    wrongAttempts: stats.wrongAttempts || 0,
    skippedCount: stats.skippedCount || 0,
    familiarMarkedCount: stats.familiarMarkedCount || 0,
    accuracy,
    wordsPerMinute,
    avgSecondsPerWord,
    etaMinutes,
    activeMinutes: Number(activeMinutes.toFixed(1))
  };
}
