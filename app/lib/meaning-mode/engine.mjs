// Meaning Mode engine v5 -- sense-relation-based question generation.
// Uses Phase 5 distractor-ranking with conceptAxis/conceptValue relations.

import { buildQuestionWithValidation, validateQuestion } from "./builder.mjs";
import { AntiMemorizationCache } from "./options.mjs";
import { selectNextWord, createSessionState as createSchedulerSession, recordQuestionInSession } from "./review-scheduler.mjs";
import {
  migrateFromV1, loadAdaptiveState,
  getWordState, updateWordState, getAdaptiveStats,
  transitionCorrect, transitionWrong
} from "./adaptive-state.mjs";
import { createQualityCache, recordDistractorsUsed, deferWord, getQualityStats } from "./distractor-quality.mjs";
import {
  ensureMeaningRuntimeIndexes,
  getDefaultDistractorPool,
  hydrateMeaningWordBank
} from "./runtime-indexes.mjs";

export { ensureMeaningRuntimeIndexes };

/**
 * Create meaning engine. Heavy generated indexes are loaded lazily on first call.
 */
export async function createEngine(wordBank, distractorBank) {
  if (!Array.isArray(wordBank) || wordBank.length === 0) {
    throw new Error("Meaning engine requires a non-empty word bank");
  }
  await ensureMeaningRuntimeIndexes();
  const hydrated = hydrateMeaningWordBank([...wordBank]);
  const distractorPool = distractorBank && distractorBank.length > 0
    ? hydrateMeaningWordBank([...distractorBank])
    : getDefaultDistractorPool();
  let adaptiveState = migrateFromV1();
  if (!adaptiveState) {
    adaptiveState = { version: 2, migratedFrom: null, migratedAt: null, words: {} };
  }
  const sessionState = createSchedulerSession();
  const antiCache = new AntiMemorizationCache();
  const qualityCache = createQualityCache();
  const allWordIds = hydrated.map(item => item.wordId);
  return {
    wordBank: hydrated, distractorPool, allWordIds,
    adaptiveState, sessionState, antiCache, qualityCache,
    currentQuestion: null, correctCount: 0, totalAnswered: 0
  };
}

export function nextQuestion(engine) {
  let skipsThisCall = 0;
  const MAX_SKIPS = 100;
  while (skipsThisCall < MAX_SKIPS) {
    const selected = selectNextWord(engine.allWordIds, engine.wordBank, engine.adaptiveState, engine.sessionState);
    if (!selected) { engine.currentQuestion = null; return null; }
    const { wordId, entry, selectedBecause } = selected;
    const bank = engine.distractorPool || engine.wordBank;
    const question = buildQuestionWithValidation(entry, bank, engine.sessionState.sessionId, engine.sessionState.questionOrdinal, engine.antiCache, engine.qualityCache, 10);
    if (question.qualityDeferred) {
      deferWord(engine.qualityCache, wordId);
      skipsThisCall++;
      continue;
    }
    if (!validateQuestion(question).valid) { skipsThisCall++; continue; }
    question._selectedBecause = selectedBecause || "unknown";
    const distractors = question.options.filter(o => !o.isCorrect);
    const semGroup = entry._semanticGroups ? entry._semanticGroups[0] : null;
    recordDistractorsUsed(engine.qualityCache, wordId, distractors, semGroup);
    engine.currentQuestion = question;
    return question;
  }
  engine.currentQuestion = null;
  return null;
}

export function submitAnswer(engine, selectedOption) {
  if (!engine.currentQuestion) return { correct: false, correctAnswer: "", wordId: "", error: "no active question" };
  const { correctAnswer, wordId, options, correctOptionIndex, optionHash } = engine.currentQuestion;
  const selectedMeaning = typeof selectedOption === "string" ? selectedOption : selectedOption.meaningZh;
  const correct = selectedMeaning === correctAnswer;
  engine.totalAnswered++;
  const oldState = getWordState(engine.adaptiveState, wordId);
  let newState;
  if (correct) { engine.correctCount++; newState = transitionCorrect(oldState); }
  else { newState = transitionWrong(oldState); }
  updateWordState(engine.adaptiveState, wordId, newState, engine.sessionState.questionOrdinal);
  recordQuestionInSession(engine.sessionState, wordId, correctOptionIndex, optionHash);
  engine.antiCache.record(options, correctOptionIndex);
  const previousStatus = oldState.status;
  let debugInfo = null;
  if (typeof window !== "undefined" && window.__MEANING_DEBUG__) {
    debugInfo = {
      wordId, previousStatus, nextStatus: newState.status,
      result: correct ? "correct" : "wrong",
      correctOptionIndex, optionHash,
      qualityStats: getQualityStats(engine.qualityCache)
    };
  }
  return { correct, correctAnswer, wordId, previousStatus, nextStatus: newState.status, selectedBecause: engine.currentQuestion._selectedBecause || "unknown", debug: debugInfo };
}

export function getSessionStats(engine) {
  const adaptiveStats = getAdaptiveStats(engine.adaptiveState);
  const qStats = getQualityStats(engine.qualityCache);
  return {
    correct: engine.correctCount, total: engine.totalAnswered,
    accuracy: engine.totalAnswered > 0 ? Math.round((engine.correctCount / engine.totalAnswered) * 100) : 0,
    totalWords: engine.wordBank.length,
    ...adaptiveStats,
    qualityDeferred: qStats.qualityDeferredCount
  };
}

export function getCombinedProgress() {
  const state = loadAdaptiveState();
  return getAdaptiveStats(state || { version: 2, words: {} });
}

export function getAntiMemDebug(engine) { return engine.antiCache.debug(); }
export function getQualityDebug(engine) { return getQualityStats(engine.qualityCache); }
export { validateQuestion };
