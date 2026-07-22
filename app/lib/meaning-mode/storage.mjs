// Local storage for Meaning Mode v3 — adaptive state persistence.
// Read-only compat with: ielts_meaning_4500_progress_v1
// New key: ielts_meaning_4500_adaptive_v2

import { loadAdaptiveState, saveAdaptiveState, migrateFromV1, getAdaptiveStats } from "./adaptive-state.mjs";

const V1_KEY = "ielts_meaning_4500_progress_v1";

/**
 * Load progress (compat wrapper — prefers adaptive v2).
 */
export function loadProgress() {
  if (typeof window === "undefined") return {};

  // Try adaptive v2 first
  const adaptive = loadAdaptiveState();
  if (adaptive && adaptive.words) {
    // Convert to legacy format for backward compat
    const legacy = {};
    for (const [wordId, state] of Object.entries(adaptive.words)) {
      legacy[wordId] = state.status === "mastered" || state.status === "learning" ? "known" : "unknown";
    }
    return legacy;
  }

  // Fallback: read v1
  try {
    const raw = window.localStorage.getItem(V1_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && parsed._v === 1 && typeof parsed.data === "object") {
      return parsed.data;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Save progress — now a no-op; adaptive state saves on each word update.
 * Kept for backward compat with any external callers.
 */
/**
 * Mark a word with a status. Updates adaptive state.
 */
export function markWord(wordId, status) {
  if (typeof window === "undefined") return {};

  // Ensure adaptive state exists
  let state = loadAdaptiveState();
  if (!state) {
    state = migrateFromV1();
  }
  if (!state) {
    state = { version: 2, migratedFrom: null, migratedAt: null, words: {} };
  }

  // Update word
  if (!state.words[wordId]) {
    state.words[wordId] = {
      status: status === "known" ? "learning" : "weak",
      totalAttempts: 1,
      correctCount: status === "known" ? 1 : 0,
      wrongCount: status === "known" ? 0 : 1,
      consecutiveCorrect: status === "known" ? 1 : 0,
      repairPasses: 0,
      learningStage: 0,
      masteryStage: 0,
      lastResult: status === "known" ? "correct" : "wrong",
      lastAnsweredAt: Date.now(),
      nextReviewAt: Date.now() + (status === "known" ? 24 * 60 * 60 * 1000 : 2 * 60 * 1000),
      lastShownQuestionOrdinal: -999,
      history: [{ result: status === "known" ? "correct" : "wrong", time: Date.now() }]
    };
  } else {
    const w = state.words[wordId];
    w.totalAttempts++;
    if (status === "known") {
      w.correctCount++;
      w.consecutiveCorrect++;
      w.lastResult = "correct";
    } else {
      w.wrongCount++;
      w.consecutiveCorrect = 0;
      w.lastResult = "wrong";
    }
    w.lastAnsweredAt = Date.now();
  }

  saveAdaptiveState(state);

  // Return legacy format
  return loadProgress();
}

/**
 * Get a single word's status.
 */
export function getWordStatus(wordId) {
  const progress = loadProgress();
  return progress[wordId] || null;
}

/**
 * Get progress statistics.
 */
export function getProgressStats() {
  const state = loadAdaptiveState();
  if (!state) return { known: 0, unknown: 0, total: 0 };

  const stats = getAdaptiveStats(state);
  const known = stats.masteredCount + stats.learningCount;
  const unknown = stats.weakCount + stats.newCount;

  return { known, unknown, total: stats.total };
}

/**
 * Clear all progress (v2 + legacy v1).
 * Must remove v1 as well: createEngine() calls migrateFromV1(), which would
 * otherwise rebuild v2 from leftover v1 data and make "重置" a no-op.
 */
export function clearProgress() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem("ielts_meaning_4500_adaptive_v2");
    window.localStorage.removeItem(V1_KEY);
    window.localStorage.setItem(
      "ielts_meaning_4500_cleared_at",
      String(Date.now())
    );
  } catch { /* ignore */ }
}

// Re-export for convenience
export { loadAdaptiveState, saveAdaptiveState, migrateFromV1, getAdaptiveStats };
