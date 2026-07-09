// Expressions Mode engine — 4-choice quiz with anti-memorization.
// Uses existing storage key; no adaptive review, no SRS.

import { buildQuestionWithValidation, validateQuestion } from "./builder.mjs";
import { AntiMemorizationCache } from "./options.mjs";
import { markPhrase, getLearnedCount } from "./storage.mjs";

export function createEngine(phraseBank) {
  if (!Array.isArray(phraseBank) || phraseBank.length === 0) {
    throw new Error("Expressions engine requires a non-empty phrase bank");
  }

  const allIds = phraseBank.map(item => item.id);
  const queue = shuffleArray([...allIds]);
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
  if (engine.queueIndex >= engine.queue.length) {
    // Reshuffle when all have been shown
    engine.queue = shuffleArray([...engine.allIds]);
    engine.queueIndex = 0;
  }

  for (let i = 0; i < engine.queue.length; i++) {
    const tryIndex = (engine.queueIndex + i) % engine.queue.length;
    const phraseId = engine.queue[tryIndex];
    const entry = engine.phraseBank.find(item => item.id === phraseId);
    if (!entry) continue;

    const question = buildQuestionWithValidation(
      entry, engine.phraseBank, engine.sessionId,
      engine.queueIndex + i, engine.antiCache, 10
    );

    const validation = validateQuestion(question);
    if (!validation.valid) continue;

    engine.currentQuestion = question;
    engine.queueIndex = (tryIndex + 1) % engine.queue.length;
    return question;
  }

  // Should never reach here with 700 valid phrases
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
    learned
  };
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}