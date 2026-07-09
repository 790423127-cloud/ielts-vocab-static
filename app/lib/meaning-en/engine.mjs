import { buildRetrievalQuestion, createBuilderCaches, validateRetrievalQuestion } from "./builder.mjs";
import {
  getOrCreateState,
  getSenseState,
  isDue,
  recordRetrievalAnswer,
  getRetrievalStats
} from "./adaptive-state.mjs";
import {
  ensureMeaningRuntimeIndexes,
  hydrateMeaningWordBank
} from "../meaning-mode/runtime-indexes.mjs";

export async function createEngine(wordBank) {
  if (!Array.isArray(wordBank) || wordBank.length === 0) {
    throw new Error("English Retrieval Mode requires a non-empty word bank");
  }

  await ensureMeaningRuntimeIndexes();
  const hydrated = hydrateMeaningWordBank([...wordBank]);
  const state = getOrCreateState();
  return {
    wordBank: hydrated,
    state,
    sessionId: state.sessionSeed || ("zh-en-" + Date.now().toString(36)),
    questionOrdinal: 0,
    currentQuestion: null,
    correctCount: 0,
    totalAnswered: 0,
    caches: createBuilderCaches(),
    deferred: new Set(),
    recentTargetIds: []
  };
}

export function nextQuestion(engine) {
  const maxAttempts = Math.min(engine.wordBank.length, 450);
  const offset = stableIndex(engine.sessionId + ":" + engine.questionOrdinal, engine.wordBank.length);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const entry = engine.wordBank[(offset + attempt) % engine.wordBank.length];
    if (!entry || engine.deferred.has(entry.wordId)) continue;
    if (engine.recentTargetIds.includes(entry.wordId)) continue;

    const question = buildRetrievalQuestion(
      entry,
      engine.wordBank,
      engine.sessionId,
      engine.questionOrdinal,
      engine.caches
    );

    if (!question || question.qualityDeferred) {
      engine.deferred.add(entry.wordId);
      continue;
    }

    const validation = validateRetrievalQuestion(question);
    if (!validation.valid) {
      engine.deferred.add(entry.wordId);
      continue;
    }

    const senseState = getSenseState(engine.state, question.targetSenseKey);
    const questionsSinceShown = engine.questionOrdinal - (senseState.lastShownQuestionOrdinal || -999);
    if (!isDue(senseState, questionsSinceShown)) continue;

    question._selectedBecause = selectionReason(senseState);
    question.questionOrdinal = engine.questionOrdinal;
    engine.currentQuestion = question;
    engine.questionOrdinal++;
    engine.recentTargetIds.unshift(question.targetWordId);
    engine.recentTargetIds = engine.recentTargetIds.slice(0, 8);
    senseState.lastShownQuestionOrdinal = question.questionOrdinal;
    return question;
  }

  engine.currentQuestion = null;
  return null;
}

export function submitAnswer(engine, selectedOption, responseTime) {
  if (!engine.currentQuestion) {
    return { correct: false, error: "no active question" };
  }

  const question = engine.currentQuestion;
  const correct = !!(selectedOption && selectedOption.isCorrect);
  engine.totalAnswered++;
  if (correct) engine.correctCount++;

  const senseState = recordRetrievalAnswer(
    engine.state,
    question,
    selectedOption,
    correct,
    responseTime || 0
  );

  return {
    correct,
    correctAnswer: question.canonicalAnswer,
    targetWordId: question.targetWordId,
    targetSenseKey: question.targetSenseKey,
    selectedOptionId: selectedOption ? selectedOption.sourceWordId : null,
    confusedWithWordId: selectedOption && !correct ? selectedOption.sourceWordId : null,
    confusedWithSenseKey: selectedOption && !correct ? selectedOption.senseKey : null,
    reviewStage: senseState.reviewStage,
    nextStatus: senseState.status
  };
}

export function getSessionStats(engine) {
  const persisted = getRetrievalStats(engine.state);
  return {
    correct: engine.correctCount,
    total: engine.totalAnswered,
    accuracy: engine.totalAnswered > 0 ? Math.round((engine.correctCount / engine.totalAnswered) * 100) : 0,
    totalWords: engine.wordBank.length,
    deferred: engine.deferred.size,
    ...persisted
  };
}

export function getCombinedProgress() {
  return getRetrievalStats(getOrCreateState());
}

export { validateRetrievalQuestion };

function selectionReason(senseState) {
  if (!senseState || senseState.status === "new" || senseState.totalAttempts === 0) return "new-sense";
  if (senseState.status === "weak") return "confusion-repair";
  if (senseState.status === "mastered") return "spaced-review";
  return "learning-review";
}

function stableIndex(value, modulo) {
  if (!modulo) return 0;
  let hash = 2166136261;
  const str = String(value || "");
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % modulo;
}
