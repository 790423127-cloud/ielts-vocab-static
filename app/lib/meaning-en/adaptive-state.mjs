const STORAGE_KEY = "ielts-meaning-zh-en-v1";
const VERSION = 1;
const MAX_HISTORY = 30;

const MIN_5 = 5 * 60 * 1000;
const MIN_20 = 20 * 60 * 1000;
const DAY_1 = 24 * 60 * 60 * 1000;
const DAY_3 = 3 * DAY_1;
const DAY_7 = 7 * DAY_1;
const DAY_21 = 21 * DAY_1;

const STAGE_INTERVALS = [MIN_20, DAY_1, DAY_3, DAY_7, DAY_21];

export function createEmptyState() {
  return {
    version: VERSION,
    namespace: STORAGE_KEY,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sessionSeed: makeSessionSeed(),
    senses: {},
    confusions: {}
  };
}

export function createNewSenseState() {
  return {
    targetSenseKey: null,
    status: "new",
    totalAttempts: 0,
    correctCount: 0,
    wrongCount: 0,
    consecutiveCorrect: 0,
    reviewStage: 0,
    lastAnsweredAt: 0,
    nextReviewAt: 0,
    lastShownQuestionOrdinal: -999,
    history: []
  };
}

export function loadRetrievalState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== VERSION || typeof parsed.senses !== "object") return null;
    if (!parsed.confusions) parsed.confusions = {};
    if (!parsed.sessionSeed) parsed.sessionSeed = makeSessionSeed();
    return parsed;
  } catch {
    return null;
  }
}

export function saveRetrievalState(state) {
  if (typeof window === "undefined" || !state) return;
  try {
    state.updatedAt = Date.now();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota errors; the active session can continue.
  }
}

export function getOrCreateState() {
  const loaded = loadRetrievalState();
  if (loaded) return loaded;
  const state = createEmptyState();
  saveRetrievalState(state);
  return state;
}

export function clearRetrievalState() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

export function getSenseState(state, senseKey) {
  if (!state.senses[senseKey]) {
    state.senses[senseKey] = {
      ...createNewSenseState(),
      targetSenseKey: senseKey
    };
  }
  return state.senses[senseKey];
}

export function isDue(senseState, questionsSinceShown) {
  if (!senseState || senseState.status === "new") return true;
  if (questionsSinceShown < 4) return false;
  return Date.now() >= (senseState.nextReviewAt || 0);
}

export function recordRetrievalAnswer(state, question, selectedOption, correct, responseTime) {
  const senseKey = question.targetSenseKey;
  const senseState = getSenseState(state, senseKey);
  const now = Date.now();
  const oldStage = senseState.reviewStage || 0;

  senseState.totalAttempts++;
  senseState.lastAnsweredAt = now;
  senseState.lastShownQuestionOrdinal = question.questionOrdinal || 0;

  if (correct) {
    senseState.correctCount++;
    senseState.consecutiveCorrect++;
    senseState.reviewStage = Math.min(oldStage + 1, STAGE_INTERVALS.length - 1);
    senseState.status = senseState.reviewStage >= 3 ? "mastered" : "learning";
    senseState.nextReviewAt = now + STAGE_INTERVALS[senseState.reviewStage];
  } else {
    senseState.wrongCount++;
    senseState.consecutiveCorrect = 0;
    senseState.reviewStage = 0;
    senseState.status = "weak";
    senseState.nextReviewAt = now + MIN_5;
    recordConfusion(state, question, selectedOption);
  }

  senseState.history.unshift({
    targetSenseKey: senseKey,
    answeredAt: now,
    selectedOptionId: selectedOption ? optionId(selectedOption) : null,
    correct,
    confusedWithWordId: selectedOption && !correct ? selectedOption.sourceWordId : null,
    confusedWithSenseKey: selectedOption && !correct ? selectedOption.senseKey : null,
    responseTime: responseTime || 0,
    reviewStage: senseState.reviewStage
  });
  senseState.history = senseState.history.slice(0, MAX_HISTORY);

  saveRetrievalState(state);
  return senseState;
}

export function getRetrievalStats(state) {
  const senses = Object.values(state && state.senses ? state.senses : {});
  const total = senses.reduce((sum, item) => sum + (item.totalAttempts || 0), 0);
  const correct = senses.reduce((sum, item) => sum + (item.correctCount || 0), 0);
  return {
    seen: senses.length,
    total,
    correct,
    accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
    weak: senses.filter(item => item.status === "weak").length,
    learning: senses.filter(item => item.status === "learning").length,
    mastered: senses.filter(item => item.status === "mastered").length,
    confusionPairs: Object.keys(state && state.confusions ? state.confusions : {}).length
  };
}

function recordConfusion(state, question, selectedOption) {
  if (!selectedOption || selectedOption.isCorrect) return;
  const key = question.targetWordId + "->" + selectedOption.sourceWordId;
  const existing = state.confusions[key] || {
    targetWordId: question.targetWordId,
    targetHeadword: question.canonicalAnswer,
    targetSenseKey: question.targetSenseKey,
    confusedWithWordId: selectedOption.sourceWordId,
    confusedWithHeadword: selectedOption.headword,
    confusedWithSenseKey: selectedOption.senseKey,
    count: 0,
    lastAt: 0
  };
  existing.count++;
  existing.lastAt = Date.now();
  state.confusions[key] = existing;
}

function optionId(option) {
  return [option.sourceWordId, option.senseKey, option.headword].filter(Boolean).join("::");
}

function makeSessionSeed() {
  return "zh-en-" + Date.now().toString(36);
}
