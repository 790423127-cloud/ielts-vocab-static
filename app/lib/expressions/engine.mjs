// Expressions Mode engine — 4-choice quiz with anti-memorization.
// Uses existing storage key; no adaptive review, no SRS.

import { buildQuestionWithValidation, validateQuestion } from "./builder.mjs";
import { AntiMemorizationCache } from "./options.mjs";
import { markPhrase, getLearnedCount, loadProgress } from "./storage.mjs";

export const EXPRESSIONS_SESSION_SIZE = 20;

export function buildExpressionSessionQueue(phraseBank, options = {}) {
  const sessionSize = Math.max(1, Number(options.sessionSize) || EXPRESSIONS_SESSION_SIZE);
  const progress = options.progress || loadProgress();
  const random = options.random || Math.random;
  const ids = phraseBank.map((item) => item.id).filter(Boolean);
  const unseen = shuffleArray(ids.filter((id) => !progress[id]), random);
  const unknown = shuffleArray(ids.filter((id) => progress[id] === "unknown"), random);
  const known = shuffleArray(ids.filter((id) => progress[id] === "known"), random);

  const reviewLimit = Math.min(unknown.length, Math.floor(sessionSize / 4));
  const selected = unknown.slice(0, reviewLimit);
  const selectedSet = new Set(selected);
  const fill = (pool) => {
    for (const id of pool) {
      if (selected.length >= sessionSize) break;
      if (selectedSet.has(id)) continue;
      selected.push(id);
      selectedSet.add(id);
    }
  };

  fill(unseen);
  fill(unknown);
  fill(known);
  return shuffleArray(selected, random);
}

export function createEngine(phraseBank, options = {}) {
  if (!Array.isArray(phraseBank) || phraseBank.length === 0) {
    throw new Error("Expressions engine requires a non-empty phrase bank");
  }

  const allIds = phraseBank.map(item => item.id);
  const queue = buildExpressionSessionQueue(phraseBank, options);
  const sessionId = "expr_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  const antiCache = new AntiMemorizationCache();

  return {
    phraseBank, allIds, queue, queueIndex: 0,
    sessionId, antiCache,
    currentQuestion: null,
    correctCount: 0, totalAnswered: 0
  };
}

export function nextQuestion(engine) {
  if (engine.queueIndex >= engine.queue.length) return null;

  for (let tryIndex = engine.queueIndex; tryIndex < engine.queue.length; tryIndex++) {
    const phraseId = engine.queue[tryIndex];
    const entry = engine.phraseBank.find(item => item.id === phraseId);
    if (!entry) continue;

    const question = buildQuestionWithValidation(
      entry, engine.phraseBank, engine.sessionId,
      tryIndex, engine.antiCache, 10
    );

    const validation = validateQuestion(question);
    if (!validation.valid) continue;

    engine.currentQuestion = question;
    engine.queueIndex = tryIndex + 1;
    return question;
  }

  engine.queueIndex = engine.queue.length;
  engine.currentQuestion = null;
  return null;
}

export function submitAnswer(engine, selectedOption) {
  if (!engine.currentQuestion) {
    return { correct: false, correctMeaning: "", phraseId: "", error: "no active question" };
  }

  const { correctMeaning, phraseId } = engine.currentQuestion;
  const selectedMeaning = typeof selectedOption === "string" ? selectedOption : selectedOption.meaningZh;
  const correct = selectedMeaning === correctMeaning;

  engine.totalAnswered++;
  if (correct) {
    engine.correctCount++;
    markPhrase(phraseId, "known");
  } else {
    markPhrase(phraseId, "unknown");
  }

  let debugInfo = null;
  if (typeof window !== "undefined" && window.__EXPRESSIONS_DEBUG__) {
    debugInfo = {
      phraseId,
      phrase: engine.currentQuestion.phrase,
      correctOptionIndex: engine.currentQuestion.correctOptionIndex,
      optionHash: engine.currentQuestion.optionHash,
      answerResult: correct ? "correct" : "wrong"
    };
  }

  return {
    correct, correctMeaning, phraseId,
    debug: debugInfo
  };
}

export function getSessionStats(engine) {
  const learned = getLearnedCount();
  return {
    correct: engine.correctCount,
    total: engine.totalAnswered,
    accuracy: engine.totalAnswered > 0 ? Math.round((engine.correctCount / engine.totalAnswered) * 100) : 0,
    totalPhrases: engine.phraseBank.length,
    sessionTotal: engine.queue.length,
    sessionPosition: Math.min(engine.queueIndex, engine.queue.length),
    sessionRemaining: Math.max(0, engine.queue.length - engine.queueIndex),
    learned
  };
}

function shuffleArray(arr, random = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
