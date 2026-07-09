// Meaning Mode question builder v7 -- sense-relation distractor selection + audit snapshot.
// Every question carries a questionAuditSnapshot for traceability and feedback.

import { hashOptionSet } from "./options.mjs";
import { generateDistractorCombinations, selectBestCombination } from "./distractor-ranking.mjs";
import { getQuizMeaning, getPosLabel } from "./collision-check.mjs";
import { getTargetQuizMeaning, getTargetMeaningDetailed, getTargetGlossEntry } from "./meaning-target-gloss.mjs";

function splitGlossParts(value) {
  return String(value || "")
    .trim()
    .split(/[;锛涖€?锛?]+/g)
    .map(p => p.trim())
    .filter(Boolean);
}

function isMixedTargetSense(wordEntry) {
  const quiz = getTargetQuizMeaning(wordEntry);
  return splitGlossParts(quiz).length >= 4;
}

function shortHash(value) {
  return Math.abs(hashString(String(value || ""))).toString(36);
}

function isGeneratedSenseId(wordId, senseId) {
  const id = String(senseId || "");
  return !id
    || id === wordId + "-sense-1"
    || id === wordId + "-quiz-1"
    || id.startsWith(wordId + "-sense-")
    || id.startsWith(wordId + "-quiz-");
}

function deriveSenseKey(wordId, quizMeaningZh, meaningDetailedZh) {
  return wordId + "::derived::" + shortHash((quizMeaningZh || "") + "|" + (meaningDetailedZh || ""));
}

function getSenseMeta(wordId, quizMeaningZh, meaningDetailedZh, nativeSenseId) {
  if (nativeSenseId && !isGeneratedSenseId(wordId, nativeSenseId)) {
    return { senseKey: nativeSenseId, senseKeySource: "native" };
  }
  return {
    senseKey: deriveSenseKey(wordId, quizMeaningZh, meaningDetailedZh),
    senseKeySource: "derived"
  };
}

function getTargetSenseMeta(wordEntry) {
  const gloss = getTargetGlossEntry(wordEntry.wordId);
  const sense = gloss && Array.isArray(gloss.quizSenses) ? gloss.quizSenses[0] : null;
  return getSenseMeta(
    wordEntry.wordId,
    getTargetQuizMeaning(wordEntry),
    getTargetMeaningDetailed(wordEntry),
    sense ? sense.senseId : null
  );
}

function buildCorrectDistinction(wordEntry) {
  return (wordEntry.word || "target") + " 本题义项为「" + getTargetQuizMeaning(wordEntry) + "」。";
}

export function buildQuestion(wordEntry, wordBank, sessionId, questionIndex, qualityCache, antiMemCache) {
  if (isMixedTargetSense(wordEntry)) {
    return {
      qualityDeferred: true,
      semanticQualityDeferred: true,
      wordId: wordEntry.wordId,
      word: wordEntry.word,
      reason: "semanticQualityDeferred:mixed-target-sense"
    };
  }

  const seed = hashString(wordEntry.wordId + (sessionId || "") + String(questionIndex || 0));
  const { combinations, totalAvailable, reason } = generateDistractorCombinations(
    wordBank, wordEntry.wordId, wordEntry.meaningZh, 7, qualityCache
  );
  if (!combinations || combinations.length === 0) {
    return { qualityDeferred: true, wordId: wordEntry.wordId, word: wordEntry.word, reason: reason || "insufficient-candidates", totalAvailable };
  }
  const { combination: bestCombo, status, fallbackReason } = selectBestCombination(combinations, antiMemCache);
  if (!bestCombo) return { qualityDeferred: true, wordId: wordEntry.wordId, word: wordEntry.word, reason: "selection-failed" };

  const optionPool = [
    {
      meaningZh: getTargetQuizMeaning(wordEntry),
      quizMeaningZh: getTargetQuizMeaning(wordEntry),
      meaningDetailedZh: getTargetMeaningDetailed(wordEntry),
      sourceWordId: wordEntry.wordId,
      sourceHeadword: wordEntry.word,
      displayEnglish: wordEntry.word,
      posFamily: wordEntry._posFamily || "unknown",
      isCorrect: true,
      relationType: "correct-answer",
      relationToTarget: "correct-answer",
      relationReason: "correct target sense from meaning-target-gloss",
      learnerDistinctionZh: buildCorrectDistinction(wordEntry),
      relationEvidence: {
        kind: "definition-derived",
        sourceFields: ["target.wordId", "target.quizMeaningZh", "target.meaningDetailedZh"]
      },
      relationConfidence: "high",
      qualityClass: "P1",
      qualityTier: "A",
      ...getTargetSenseMeta(wordEntry)
    },
    ...bestCombo.distractors.map(d => ({
      meaningZh: getQuizMeaning({ meaningZh: d.quizMeaningZh || d.meaningZh }),
      quizMeaningZh: d.quizMeaningZh || d.meaningZh,
      meaningDetailedZh: d.meaningDetailedZh || d.quizMeaningZh || d.meaningZh,
      sourceWordId: d.sourceWordId,
      sourceHeadword: d.sourceHeadword || d.displayEnglish,
      displayEnglish: d.displayEnglish,
      posFamily: d.posFamily,
      isCorrect: false,
      relationType: d.relationType || d.relation || "unknown",
      relationToTarget: d.relation || "unknown",
      relationReason: d.relationReason || null,
      learnerDistinctionZh: d.learnerDistinctionZh || null,
      relationEvidence: d.relationEvidence || null,
      relationConfidence: d.relationConfidence || null,
      candidateAxis: d.candidateAxis || null,
      qualityClass: d.qualityClass || null,
      qualityTier: d.qualityTier || null,
      ...getSenseMeta(d.sourceWordId, d.quizMeaningZh || d.meaningZh, d.meaningDetailedZh || d.meaningZh, d.senseKey)
    }))
  ];

  const correctIdx = bestCombo.recommendedCorrectPosition;
  const shuffled = seedShuffleWithFixedPosition(optionPool, seed, correctIdx);
  const finalCorrectIdx = shuffled.findIndex(o => o.isCorrect);
  const optionHash = hashOptionSet(shuffled);

  // 鈹€鈹€ Build audit snapshot 鈹€鈹€
  const auditSnapshot = {
    generatedAt: new Date().toISOString(),
    target: {
      wordId: wordEntry.wordId,
      word: wordEntry.word,
      posFamily: wordEntry._posFamily || "unknown",
      senseKey: getTargetSenseMeta(wordEntry).senseKey,
      senseKeySource: getTargetSenseMeta(wordEntry).senseKeySource,
      quizMeaningZh: getTargetQuizMeaning(wordEntry),
      meaningDetailedZh: getTargetMeaningDetailed(wordEntry)
    },
    options: shuffled.map((opt, i) => ({
      index: i,
      isCorrect: opt.isCorrect,
      sourceWordId: opt.sourceWordId,
      sourceHeadword: opt.sourceHeadword,
      displayEnglish: opt.displayEnglish,
      posFamily: opt.posFamily,
      senseKey: opt.senseKey,
      senseKeySource: opt.senseKeySource,
      quizMeaningZh: opt.meaningZh,
      meaningDetailedZh: opt.meaningDetailedZh,
      relationType: opt.relationType,
      relationToTarget: opt.relationToTarget,
      relationReason: opt.relationReason,
      learnerDistinctionZh: opt.learnerDistinctionZh,
      relationEvidence: opt.relationEvidence,
      candidateAxis: opt.candidateAxis || null,
      relationConfidence: opt.relationConfidence || (opt.qualityTier === "A" ? "high" : opt.qualityTier === "B" ? "medium" : "low"),
      qualityClass: opt.qualityClass,
      qualityTier: opt.qualityTier
    })),
    optionHash,
    correctOptionIndex: finalCorrectIdx,
    antiMemoryStatus: status || "unknown"
  };

  return {
    wordId: wordEntry.wordId,
    word: wordEntry.word,
    correctAnswer: getTargetQuizMeaning(wordEntry),
    options: shuffled,
    optionStrings: shuffled.map(o => o.meaningZh),
    correctOptionIndex: finalCorrectIdx,
    optionHash,
    combinationHash: bestCombo.hash,
    combinationScore: bestCombo.score,
    combinationStrategy: bestCombo.strategy,
    collisionStatus: status === "best_match" ? null : status,
    collisionReason: fallbackReason,
    distractorQuality: {
      qualitySufficient: true,
      distractorCount: bestCombo.distractors.length,
      totalCombinations: combinations.length,
      totalAvailable
    },
    meaningDetailedZh: getTargetMeaningDetailed(wordEntry),
    posFamily: getPosLabel(wordEntry),
    displayEnglish: wordEntry.word,
    questionAuditSnapshot: auditSnapshot
  };
}

function seedShuffleWithFixedPosition(pool, seed, correctPos) {
  const correctEntry = pool.find(o => o.isCorrect);
  const distractors = pool.filter(o => !o.isCorrect);
  const shuffledDistractors = seededShuffle(distractors, seed);
  const result = [...shuffledDistractors];
  result.splice(Math.min(correctPos, result.length), 0, correctEntry);
  return result;
}

function seededShuffle(arr, seed) {
  let s = seed;
  const rng = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function buildQuestionWithValidation(wordEntry, wordBank, sessionId, questionIndex, cache, qualityCache, maxRetries) {
  maxRetries = maxRetries || 3;
  let question = buildQuestion(wordEntry, wordBank, sessionId, questionIndex, qualityCache, cache);
  if (question.qualityDeferred) return question;
  const { valid, reason: valReason } = validateQuestion(question);
  if (!valid) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      question = buildQuestion(wordEntry, wordBank, sessionId, (questionIndex || 0) + attempt * 10000, qualityCache, cache);
      if (question.qualityDeferred) return question;
      if (validateQuestion(question).valid) {
        if (cache) cache.record(question.options, question.correctOptionIndex);
        return question;
      }
    }
    question._validationFailure = valReason;
    return question;
  }
  if (cache) cache.record(question.options, question.correctOptionIndex);
  return question;
}

export function validateQuestion(question) {
  if (question.qualityDeferred) return { valid: true };
  if (!question.word) return { valid: false, reason: "missing word" };
  if (!Array.isArray(question.options)) return { valid: false, reason: "missing options" };
  if (question.options.length !== 4) return { valid: false, reason: "options count " + question.options.length };
  if (!question.correctAnswer) return { valid: false, reason: "missing correctAnswer" };
  const meanings = question.options.map(o => o.meaningZh);
  if (!meanings.includes(question.correctAnswer)) return { valid: false, reason: "answer not in options" };
  if (new Set(meanings).size !== meanings.length) return { valid: false, reason: "duplicate meaningZh" };
  if (question.options.filter(o => o.isCorrect).length !== 1) return { valid: false, reason: "wrong correct count" };
  if (question.options.filter(o => !o.sourceWordId).length > 0) return { valid: false, reason: "missing sourceWordId" };
  for (const opt of question.options) {
    if (!opt.sourceHeadword) return { valid: false, reason: "missing sourceHeadword" };
    if (!opt.posFamily) return { valid: false, reason: "missing posFamily" };
    if (!opt.senseKey) return { valid: false, reason: "missing senseKey" };
    if (opt.senseKeySource !== "native" && opt.senseKeySource !== "derived") return { valid: false, reason: "invalid senseKeySource" };
    if (!opt.quizMeaningZh) return { valid: false, reason: "missing quizMeaningZh" };
    if (!opt.meaningDetailedZh) return { valid: false, reason: "missing meaningDetailedZh" };
    if (!opt.relationType) return { valid: false, reason: "missing relationType" };
    if (!opt.relationReason || opt.relationReason === opt.relationType) return { valid: false, reason: "bad relationReason" };
    if (!opt.learnerDistinctionZh) return { valid: false, reason: "missing learnerDistinctionZh" };
    if (!opt.relationEvidence || !opt.relationEvidence.kind || !Array.isArray(opt.relationEvidence.sourceFields) || opt.relationEvidence.sourceFields.length === 0) {
      return { valid: false, reason: "missing relationEvidence" };
    }
    if (opt.qualityClass !== "P1" && opt.qualityClass !== "P2") return { valid: false, reason: "bad qualityClass" };
    if (opt.qualityTier !== "A" && opt.qualityTier !== "B") return { valid: false, reason: "bad qualityTier" };
  }
  const correctOpt = question.options.find(o => o.isCorrect);
  const targetPos = question.posFamily || (correctOpt && correctOpt.posFamily);
  for (const opt of question.options.filter(o => !o.isCorrect)) {
    if (opt.posFamily !== targetPos) return { valid: false, reason: "distractor posFamily mismatch" };
  }
  if (correctOpt && correctOpt.displayEnglish !== question.word) return { valid: false, reason: "displayEnglish mismatch" };
  return { valid: true };
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
  return Math.abs(hash);
}

export { hashString };

