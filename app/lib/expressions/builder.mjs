// Expressions Mode — question builder.
// Output: { phraseId, phrase, correctMeaning, skillTags, example, options: [{...}], ... }

import { pickDistractors, seededShuffle, hashOptionSet, AntiMemorizationCache } from "./options.mjs";

export function buildQuestion(phraseEntry, phraseBank, sessionId = "", questionIndex = 0) {
  const seed = hashString(phraseEntry.id + sessionId + String(questionIndex));
  const distractors = pickDistractors(phraseBank, phraseEntry.id, phraseEntry.meaningZh, 3);

  const optionPool = [
    {
      sourcePhraseId: phraseEntry.id,
      meaningZh: phraseEntry.meaningZh,
      displayPhrase: phraseEntry.phrase,
      isCorrect: true
    },
    ...distractors.map(d => ({
      sourcePhraseId: d.sourcePhraseId,
      meaningZh: d.meaningZh,
      displayPhrase: d.displayPhrase,
      isCorrect: false
    }))
  ];

  const shuffled = seededShuffle(optionPool, seed);
  const correctOptionIndex = shuffled.findIndex(o => o.isCorrect);
  const optionHash = hashOptionSet(shuffled);

  return {
    phraseId: phraseEntry.id,
    phrase: phraseEntry.phrase,
    correctMeaning: phraseEntry.meaningZh,
    skillTags: phraseEntry.skillTags || [],
    usageTags: phraseEntry.usageTags || [],
    example: phraseEntry.example || null,
    options: shuffled,
    optionStrings: shuffled.map(o => o.meaningZh),
    correctOptionIndex,
    optionHash
  };
}

export function buildQuestionWithValidation(phraseEntry, phraseBank, sessionId = "", questionIndex = 0, cache = null, maxRetries = 10) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const adjustedIndex = questionIndex + attempt * 10000;
    const question = buildQuestion(phraseEntry, phraseBank, sessionId, adjustedIndex);
    const { valid, issues } = validateQuestion(question);
    if (!valid) continue;

    if (cache) {
      const memCheck = cache.checkRules(question.options, question.correctOptionIndex);
      if (!memCheck.valid) {
        if (attempt < 3) {
          // Try reshuffling
          for (let rs = 0; rs < 5; rs++) {
            const reshuffled = seededShuffle(question.options, adjustedIndex + rs * 777 + 999);
            const reshuffledIdx = reshuffled.findIndex(o => o.isCorrect);
            const reshuffledHash = hashOptionSet(reshuffled);
            const reshuffledMem = cache.checkRules(reshuffled, reshuffledIdx);
            if (reshuffledMem.valid) {
              const reshuffledQ = { ...question, options: reshuffled, optionStrings: reshuffled.map(o => o.meaningZh), correctOptionIndex: reshuffledIdx, optionHash: reshuffledHash };
              cache.record(reshuffledQ.options, reshuffledQ.correctOptionIndex);
              attachDebug(reshuffledQ, sessionId, attempt + 1);
              return reshuffledQ;
            }
          }
        }
        continue;
      }
      cache.record(question.options, question.correctOptionIndex);
      attachDebug(question, sessionId, attempt + 1);
      return question;
    }
    attachDebug(question, sessionId, attempt + 1);
    return question;
  }

  // Ultimate fallback
  const fallback = buildFallbackQuestion(phraseEntry, phraseBank, sessionId, questionIndex);
  if (cache) cache.record(fallback.options, fallback.correctOptionIndex);
  return fallback;
}

function buildFallbackQuestion(phraseEntry, phraseBank, sessionId, questionIndex) {
  const seed = hashString(phraseEntry.id + sessionId + String(questionIndex) + "fallback");
  const others = phraseBank.filter(w => w.id !== phraseEntry.id && w.meaningZh && w.meaningZh !== phraseEntry.meaningZh);
  const rng = mulberry32(seed);
  const pool = [...others];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const distractors = pool.slice(0, 3).map(item => ({
    sourcePhraseId: item.id, meaningZh: item.meaningZh, displayPhrase: item.phrase, isCorrect: false
  }));
  const correctOption = { sourcePhraseId: phraseEntry.id, meaningZh: phraseEntry.meaningZh, displayPhrase: phraseEntry.phrase, isCorrect: true };
  const allOptions = [correctOption, ...distractors];
  for (let i = allOptions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [allOptions[i], allOptions[j]] = [allOptions[j], allOptions[i]];
  }
  const correctOptionIndex = allOptions.findIndex(o => o.isCorrect);
  return {
    phraseId: phraseEntry.id, phrase: phraseEntry.phrase,
    correctMeaning: phraseEntry.meaningZh,
    skillTags: phraseEntry.skillTags || [], usageTags: phraseEntry.usageTags || [],
    example: phraseEntry.example || null,
    options: allOptions,
    optionStrings: allOptions.map(o => o.meaningZh),
    correctOptionIndex,
    optionHash: hashOptionSet(allOptions)
  };
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function attachDebug(question, sessionId, attempts) {
  if (typeof window !== "undefined" && window.__EXPRESSIONS_DEBUG__) {
    question._debug = {
      phraseId: question.phraseId, phrase: question.phrase,
      correctOptionIndex: question.correctOptionIndex, optionHash: question.optionHash,
      attempts, sessionId
    };
  }
}

export function validateQuestion(question) {
  if (!question.phrase) return { valid: false, reason: "missing phrase" };
  if (!Array.isArray(question.options)) return { valid: false, reason: "missing options" };
  if (question.options.length !== 4) return { valid: false, reason: "options count " + question.options.length + ", expected 4" };
  if (!question.correctMeaning) return { valid: false, reason: "missing correctMeaning" };

  const meanings = question.options.map(o => o.meaningZh);
  if (!meanings.includes(question.correctMeaning)) return { valid: false, reason: "answer not in options" };

  const uniqueMeanings = new Set(meanings);
  if (uniqueMeanings.size !== meanings.length) return { valid: false, reason: "duplicate meaningZh in options" };

  const uniqueIds = new Set(question.options.map(o => o.sourcePhraseId));
  if (uniqueIds.size !== question.options.length) return { valid: false, reason: "duplicate sourcePhraseId" };

  const correctCount = question.options.filter(o => o.isCorrect).length;
  if (correctCount !== 1) return { valid: false, reason: "expected 1 correct, got " + correctCount };

  const untraceable = question.options.filter(o => !o.sourcePhraseId);
  if (untraceable.length > 0) return { valid: false, reason: untraceable.length + " options missing sourcePhraseId" };

  const correctOpt = question.options.find(o => o.isCorrect);
  if (correctOpt && correctOpt.displayPhrase !== question.phrase) {
    return { valid: false, reason: "displayPhrase mismatch: " + correctOpt.displayPhrase + " vs " + question.phrase };
  }

  return { valid: true };
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export { hashString };