// Meaning Mode adaptive state v2 — independent spaced-repetition state machine.
// Uses localStorage key: ielts_meaning_4500_adaptive_v2
// Read-only compat with: ielts_meaning_4500_progress_v1

const STORAGE_KEY = "ielts_meaning_4500_adaptive_v2";
const V1_KEY = "ielts_meaning_4500_progress_v1";
const VERSION = 2;
const MAX_HISTORY = 20;

// ─── Interval constants (ms) ───
const MIN_2 = 2 * 60 * 1000;
const MIN_15 = 15 * 60 * 1000;
const DAY_1 = 24 * 60 * 60 * 1000;
const DAY_3 = 3 * DAY_1;
const DAY_7 = 7 * DAY_1;
const DAY_15 = 15 * DAY_1;
const DAY_30 = 30 * DAY_1;
const DAY_60 = 60 * DAY_1;

const LEARNING_INTERVALS = [MIN_15, DAY_1, DAY_3, DAY_7];
const MASTERY_INTERVALS = [DAY_15, DAY_30, DAY_60];

/**
 * Create default state for a word not yet seen.
 */
export function createNewState() {
  return {
    status: "new",
    totalAttempts: 0,
    correctCount: 0,
    wrongCount: 0,
    consecutiveCorrect: 0,
    repairPasses: 0,
    learningStage: 0,
    masteryStage: 0,
    lastResult: null,
    lastAnsweredAt: 0,
    nextReviewAt: 0,
    lastShownQuestionOrdinal: -999,
    history: []
  };
}

/**
 * Transition after a correct answer.
 */
export function transitionCorrect(state) {
  const now = Date.now();
  const next = { ...state };

  next.totalAttempts++;
  next.correctCount++;
  next.consecutiveCorrect++;
  next.lastResult = "correct";
  next.lastAnsweredAt = now;

  pushHistory(next, "correct");

  switch (next.status) {
    case "new":
      next.status = "learning";
      next.learningStage = 0;
      next.nextReviewAt = now + MIN_15;
      break;

    case "weak":
      next.repairPasses++;
      if (next.repairPasses >= 2) {
        next.status = "learning";
        next.learningStage = 1;
        next.repairPasses = 0;
        next.nextReviewAt = now + DAY_1;
      } else {
        // stay weak, extend interval
        next.nextReviewAt = now + MIN_15;
      }
      break;

    case "learning":
      next.learningStage++;
      if (next.learningStage >= LEARNING_INTERVALS.length) {
        // learning complete → mastered
        next.status = "mastered";
        next.masteryStage = 0;
        next.learningStage = 0;
        next.nextReviewAt = now + MASTERY_INTERVALS[0];
      } else {
        next.nextReviewAt = now + LEARNING_INTERVALS[next.learningStage];
      }
      break;

    case "mastered":
      next.masteryStage = Math.min(next.masteryStage + 1, MASTERY_INTERVALS.length - 1);
      next.nextReviewAt = now + MASTERY_INTERVALS[next.masteryStage];
      break;

    default:
      next.nextReviewAt = now + DAY_1;
  }

  return next;
}

/**
 * Transition after a wrong answer.
 */
export function transitionWrong(state) {
  const now = Date.now();
  const next = { ...state };

  next.totalAttempts++;
  next.wrongCount++;
  next.consecutiveCorrect = 0;
  next.repairPasses = 0;
  next.lastResult = "wrong";
  next.lastAnsweredAt = now;

  pushHistory(next, "wrong");

  // Always reset to weak on wrong answer
  next.status = "weak";
  next.learningStage = 0;
  next.masteryStage = 0;
  next.nextReviewAt = now + MIN_2;

  return next;
}

/**
 * Check if word is ready for review (time has elapsed + spacing constraints).
 */
export function isReadyForReview(state, questionsSinceLastShown) {
  if (!state) return true; // new word, always ready

  const now = Date.now();

  switch (state.status) {
    case "new":
      return true;

    case "weak":
      return now >= state.nextReviewAt && questionsSinceLastShown >= 5;

    case "learning":
    case "mastered":
      return now >= state.nextReviewAt;

    default:
      return now >= (state.nextReviewAt || 0);
  }
}

/**
 * Determine the reason a word was selected.
 */
export function getSelectionReason(state, now) {
  if (!state || state.status === "new") return "new-word";

  if (state.status === "weak") {
    if (now >= state.nextReviewAt && state.wrongCount >= 1) return "weak-reinforcement";
    return "weak-reinforcement";
  }

  if (state.status === "learning" || state.status === "mastered") {
    if (now >= state.nextReviewAt) return "due-review";
    return "fallback-learning";
  }

  return "new-word";
}

// ─── Load / Save ───

export function loadAdaptiveState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === VERSION && typeof parsed.words === "object") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveAdaptiveState(state) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* quota exceeded, silently ignore */ }
}

/**
 * Migrate from v1 progress to adaptive v2.
 * Only reads v1; never deletes or modifies the old key.
 */
export function migrateFromV1() {
  if (typeof window === "undefined") return null;

  // Check if v2 already exists
  const existing = loadAdaptiveState();
  if (existing) return existing;

  // User explicitly cleared progress — do not resurrect from v1 leftovers.
  try {
    if (window.localStorage.getItem("ielts_meaning_4500_cleared_at")) {
      return { version: VERSION, migratedFrom: null, migratedAt: null, words: {} };
    }
  } catch { /* ignore */ }

  // Try to read v1
  let v1Data = null;
  try {
    const raw = window.localStorage.getItem(V1_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.data === "object") {
        v1Data = parsed.data;
      } else if (typeof parsed === "object" && !parsed._v) {
        v1Data = parsed; // legacy format
      }
    }
  } catch { /* ignore */ }

  const now = Date.now();
  const words = {};

  if (v1Data) {
    for (const [wordId, oldStatus] of Object.entries(v1Data)) {
      const base = createNewState();
      if (oldStatus === "known") {
        words[wordId] = {
          ...base,
          status: "learning",
          consecutiveCorrect: 1,
          learningStage: 1,
          lastResult: "correct",
          lastAnsweredAt: now - DAY_1,
          nextReviewAt: now + DAY_1
        };
      } else {
        words[wordId] = {
          ...base,
          status: "weak",
          wrongCount: 1,
          lastResult: "wrong",
          lastAnsweredAt: now - MIN_2,
          nextReviewAt: now
        };
      }
    }
  }

  const state = {
    version: VERSION,
    migratedFrom: v1Data ? V1_KEY : null,
    migratedAt: v1Data ? now : null,
    words
  };

  saveAdaptiveState(state);
  return state;
}

/**
 * Get or create word state.
 */
export function getWordState(adaptiveState, wordId) {
  if (!adaptiveState || !adaptiveState.words) return createNewState();
  return adaptiveState.words[wordId] || createNewState();
}

/**
 * Update a single word's state and persist.
 */
export function updateWordState(adaptiveState, wordId, newWordState, questionOrdinal) {
  if (!adaptiveState || !adaptiveState.words) return adaptiveState;

  const updated = { ...newWordState, lastShownQuestionOrdinal: questionOrdinal };
  adaptiveState.words[wordId] = updated;
  saveAdaptiveState(adaptiveState);
  return adaptiveState;
}

/**
 * Get compact statistics for display.
 */
export function getAdaptiveStats(adaptiveState) {
  if (!adaptiveState || !adaptiveState.words) {
    return { newCount: 0, weakCount: 0, learningCount: 0, masteredCount: 0, total: 0, dueReview: 0 };
  }

  const now = Date.now();
  let newCount = 0, weakCount = 0, learningCount = 0, masteredCount = 0, dueReview = 0;

  for (const [, w] of Object.entries(adaptiveState.words)) {
    switch (w.status) {
      case "new": newCount++; break;
      case "weak": weakCount++; break;
      case "learning": learningCount++; break;
      case "mastered": masteredCount++; break;
    }
    if (w.status !== "new" && now >= w.nextReviewAt) dueReview++;
  }

  return {
    newCount, weakCount, learningCount, masteredCount,
    total: newCount + weakCount + learningCount + masteredCount,
    dueReview
  };
}

// ─── Helpers ───

function pushHistory(state, result) {
  if (!state.history) state.history = [];
  state.history.push({ result, time: Date.now() });
  if (state.history.length > MAX_HISTORY) {
    state.history = state.history.slice(-MAX_HISTORY);
  }
}

export {
  STORAGE_KEY, V1_KEY, VERSION,
  MIN_2, MIN_15, DAY_1, DAY_3, DAY_7, DAY_15, DAY_30, DAY_60,
  LEARNING_INTERVALS, MASTERY_INTERVALS
};
