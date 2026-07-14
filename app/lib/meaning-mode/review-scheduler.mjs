// Meaning Mode review scheduler — independent priority-based next-question selection.
// Never imports from spelling/SRS schedulers.

import { isReadyForReview, getSelectionReason, getWordState, createNewState } from "./adaptive-state.mjs";
import { getWordBankIndex } from "./runtime-indexes.mjs";

// ─── Constants ───
const MAX_CONSECUTIVE_REVIEWS = 3;

/**
 * Select the next wordId to show based on adaptive priority.
 *
 * Priority:
 * 1. Due-review words (weak/learning/mastered past nextReviewAt) — spaced apart
 * 2. Weak words needing reinforcement (answered wrong, 5+ questions passed, 2+ min elapsed)
 * 3. New words
 * 4. Fallback: not-yet-due learning/mastered words
 *
 * Constraints:
 * - Same wordId never appears consecutively
 * - After 3 consecutive review questions, insert 1 new word if available
 * - Never starve new words; never starve reviews
 */
export function selectNextWord(allWordIds, wordBank, adaptiveState, sessionState) {
  const now = Date.now();
  const recentWordIds = sessionState.recentWordIds || [];
  const lastWordId = recentWordIds.length > 0 ? recentWordIds[recentWordIds.length - 1] : null;
  const recentOldCount = sessionState.consecutiveReviewCount || 0;
  const wordById = getWordBankIndex(wordBank).byWordId;

  // Classify all words
  const dueReviews = [];
  const weakReinforcements = [];
  const newWords = [];
  const fallbackLearning = [];

  for (const wordId of allWordIds) {
    if (wordId === lastWordId) continue; // never consecutive

    const wordEntry = wordById.get(wordId);
    if (!wordEntry) continue;

    const state = getWordState(adaptiveState, wordId);
    const questionsSince = sessionState.questionOrdinal - (state.lastShownQuestionOrdinal || 0);

    if (state.status === "new" || !adaptiveState.words[wordId]) {
      newWords.push({ wordId, entry: wordEntry, state });
    } else if (state.status === "weak" && state.wrongCount >= 1) {
      const elapsed = now - state.lastAnsweredAt;
      if (elapsed >= 2 * 60 * 1000 && questionsSince >= 5) {
        weakReinforcements.push({ wordId, entry: wordEntry, state });
      } else if (isReadyForReview(state, questionsSince, sessionState.questionOrdinal)) {
        dueReviews.push({ wordId, entry: wordEntry, state });
      }
    } else if (isReadyForReview(state, questionsSince, sessionState.questionOrdinal)) {
      if (state.status === "weak") {
        dueReviews.push({ wordId, entry: wordEntry, state });
      } else {
        dueReviews.push({ wordId, entry: wordEntry, state });
      }
    } else if (state.status === "learning" || state.status === "mastered") {
      fallbackLearning.push({ wordId, entry: wordEntry, state });
    }
  }

  // Determine selectedBecause
  let selected = null;
  let selectedBecause = "new-word";

  // Rule: after MAX_CONSECUTIVE_REVIEWS, force a new word
  const forceNew = recentOldCount >= MAX_CONSECUTIVE_REVIEWS && newWords.length > 0;

  if (forceNew) {
    // Prefer new words
    if (newWords.length > 0) {
      selected = pickBest(newWords);
      selectedBecause = "new-word";
    }
  } else if (dueReviews.length > 0) {
    // Priority 1: due reviews
    // Pick weak first, then earliest nextReviewAt, without sorting the full list.
    selected = pickBestByComparator(dueReviews, (a, b) => {
      if (a.state.status === "weak" && b.state.status !== "weak") return -1;
      if (a.state.status !== "weak" && b.state.status === "weak") return 1;
      return a.state.nextReviewAt - b.state.nextReviewAt;
    });
    selectedBecause = getSelectionReason(selected.state, now);
  } else if (weakReinforcements.length > 0) {
    // Priority 2: weak reinforcements
    selected = pickBestByComparator(
      weakReinforcements,
      (a, b) => a.state.lastAnsweredAt - b.state.lastAnsweredAt
    );
    selectedBecause = "weak-reinforcement";
  } else if (newWords.length > 0) {
    // Priority 3: new words
    selected = pickBest(newWords);
    selectedBecause = "new-word";
  } else if (fallbackLearning.length > 0) {
    // Priority 4: not-yet-due learning
    selected = pickBestByComparator(
      fallbackLearning,
      (a, b) => a.state.nextReviewAt - b.state.nextReviewAt
    );
    selectedBecause = "fallback-learning";
  } else {
    // Truly no candidates (shouldn't happen with 6000 words)
    return null;
  }

  // Update session state
  if (selectedBecause === "new-word") {
    sessionState.consecutiveReviewCount = 0;
  } else {
    sessionState.consecutiveReviewCount = (sessionState.consecutiveReviewCount || 0) + 1;
  }

  return {
    wordId: selected.wordId,
    entry: selected.entry,
    state: selected.state,
    selectedBecause
  };
}

function pickBest(candidates) {
  // Simple: random selection from candidates for variety
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function pickBestByComparator(candidates, compare) {
  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    if (compare(candidates[i], best) < 0) best = candidates[i];
  }
  return best;
}

/**
 * Create initial session state.
 */
export function createSessionState() {
  return {
    questionOrdinal: 0,
    consecutiveReviewCount: 0,
    recentWordIds: [],
    recentCorrectIndices: [],
    usedOptionHashes: new Set(),
    recentDistractorsByWordId: new Map(),
    sessionId: "s_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8)
  };
}

/**
 * Record question in session state.
 */
export function recordQuestionInSession(sessionState, wordId, correctOptionIndex, optionHash) {
  sessionState.questionOrdinal++;
  sessionState.recentWordIds.push(wordId);
  if (sessionState.recentWordIds.length > 50) {
    sessionState.recentWordIds = sessionState.recentWordIds.slice(-50);
  }
  sessionState.recentCorrectIndices.push(correctOptionIndex);
  if (sessionState.recentCorrectIndices.length > 300) {
    sessionState.recentCorrectIndices = sessionState.recentCorrectIndices.slice(-300);
  }
  sessionState.usedOptionHashes.add(optionHash);
}

/**
 * Check if the correct answer position distribution is within bounds (18%-32%).
 */
export function checkPositionDistribution(recentCorrectIndices) {
  if (recentCorrectIndices.length < 50) return { valid: true }; // not enough data

  const counts = [0, 0, 0, 0];
  const window = recentCorrectIndices.slice(-300); // at most 300
  for (const idx of window) {
    if (idx >= 0 && idx < 4) counts[idx]++;
  }

  const total = window.length;
  const pcts = counts.map(c => c / total);

  const issues = [];
  for (let i = 0; i < 4; i++) {
    if (pcts[i] < 0.18) issues.push("pos" + i + " too low: " + (pcts[i] * 100).toFixed(1) + "%");
    if (pcts[i] > 0.32) issues.push("pos" + i + " too high: " + (pcts[i] * 100).toFixed(1) + "%");
  }

  return { valid: issues.length === 0, issues, pcts, counts, total };
}

/**
 * Check if the last 3 correct positions are all the same index.
 */
export function wouldRepeatThreeConsecutive(recentCorrectIndices, newIndex) {
  if (recentCorrectIndices.length < 2) return false;
  const last2 = recentCorrectIndices.slice(-2);
  return last2[0] === newIndex && last2[1] === newIndex;
}
