// Meaning Mode session state — in-memory session tracking.
// Never writes to localStorage; never touches any other system's storage.

/**
 * Create fresh session state.
 */
export function createSessionState() {
  return {
    questionOrdinal: 0,
    consecutiveReviewCount: 0,
    recentWordIds: [],
    recentCorrectIndices: [],
    usedOptionHashes: new Set(),
    recentDistractorsByWordId: new Map(),
    sessionId: "s_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    todayAnswerCount: 0
  };
}

/**
 * Record a completed question in the session.
 */
export function recordQuestion(sessionState, { wordId, correctOptionIndex, optionHash }) {
  sessionState.questionOrdinal++;
  sessionState.todayAnswerCount++;

  // Track recent word IDs for anti-consecutive checks
  sessionState.recentWordIds.push(wordId);
  if (sessionState.recentWordIds.length > 50) {
    sessionState.recentWordIds = sessionState.recentWordIds.slice(-50);
  }

  // Track correct answer positions for distribution
  if (correctOptionIndex !== undefined && correctOptionIndex !== null) {
    sessionState.recentCorrectIndices.push(correctOptionIndex);
    if (sessionState.recentCorrectIndices.length > 300) {
      sessionState.recentCorrectIndices = sessionState.recentCorrectIndices.slice(-300);
    }
  }

  // Track used option hashes for dedup
  if (optionHash) {
    sessionState.usedOptionHashes.add(optionHash);
  }
}

/**
 * Check if the last 3 correct positions would repeat with a new one.
 */
export function wouldRepeatThreeConsecutive(sessionState, newIndex) {
  const history = sessionState.recentCorrectIndices;
  if (history.length < 2) return false;
  const last2 = history.slice(-2);
  return last2[0] === newIndex && last2[1] === newIndex;
}

/**
 * Check 300-question position distribution (18%-32% each).
 */
export function checkPositionDistribution(sessionState) {
  const history = sessionState.recentCorrectIndices;
  if (history.length < 50) return { valid: true, message: "insufficient data" };

  const window = history.slice(-300);
  const counts = [0, 0, 0, 0];
  for (const idx of window) {
    if (idx >= 0 && idx < 4) counts[idx]++;
  }

  const total = window.length;
  const pcts = counts.map(c => c / total);

  const issues = [];
  for (let i = 0; i < 4; i++) {
    if (pcts[i] < 0.18) issues.push("position_" + i + "_low:" + (pcts[i] * 100).toFixed(1) + "%");
    if (pcts[i] > 0.32) issues.push("position_" + i + "_high:" + (pcts[i] * 100).toFixed(1) + "%");
  }

  return { valid: issues.length === 0, issues, counts, pcts, total };
}

/**
 * Check if an option hash is already used.
 */
export function isOptionHashUsed(sessionState, hash) {
  return sessionState.usedOptionHashes.has(hash);
}

/**
 * Export session debug info.
 */
export function getSessionDebug(sessionState) {
  return {
    questionOrdinal: sessionState.questionOrdinal,
    consecutiveReviewCount: sessionState.consecutiveReviewCount,
    recentWordIdsCount: sessionState.recentWordIds.length,
    recentCorrectIndicesCount: sessionState.recentCorrectIndices.length,
    usedOptionHashesCount: sessionState.usedOptionHashes.size,
    sessionId: sessionState.sessionId
  };
}