import { buildQuestionWithValidation as buildMeaningQuestion } from "../meaning-mode/builder.mjs";
import { createQualityCache } from "../meaning-mode/distractor-quality.mjs";
import { AntiMemorizationCache, hashOptionSet } from "../meaning-mode/options.mjs";

export function createBuilderCaches() {
  return {
    antiCache: new AntiMemorizationCache(),
    qualityCache: createQualityCache()
  };
}

export function buildRetrievalQuestion(wordEntry, wordBank, sessionId, questionOrdinal, caches) {
  const cacheBag = caches || createBuilderCaches();
  const base = buildMeaningQuestion(
    wordEntry,
    wordBank,
    sessionId,
    questionOrdinal,
    cacheBag.antiCache,
    cacheBag.qualityCache,
    10
  );

  if (!base || base.qualityDeferred) {
    return {
      qualityDeferred: true,
      semanticQualityDeferred: true,
      targetWordId: wordEntry.wordId,
      targetHeadword: wordEntry.word,
      reason: base ? base.reason : "builder-returned-empty"
    };
  }

  const correctBase = base.options.find(option => option.isCorrect);
  if (!correctBase) {
    return {
      qualityDeferred: true,
      semanticQualityDeferred: true,
      targetWordId: wordEntry.wordId,
      targetHeadword: wordEntry.word,
      reason: "missing-correct-option"
    };
  }

  const options = base.options.map((option, index) => ({
    optionIndex: index,
    sourceWordId: option.sourceWordId,
    headword: option.displayEnglish || option.sourceHeadword,
    posFamily: option.posFamily,
    senseKey: option.senseKey,
    senseKeySource: option.senseKeySource,
    quizMeaningZh: option.quizMeaningZh || option.meaningZh,
    meaningDetailedZh: option.meaningDetailedZh || option.quizMeaningZh || option.meaningZh,
    distractorType: option.isCorrect ? "correct-answer" : classifyDistractor(option),
    relationType: option.relationType || option.relationToTarget,
    relationToTarget: option.relationToTarget || option.relationType,
    contrastDimension: option.candidateAxis || option.relationToTarget || option.relationType,
    notAnswerReasonZh: option.isCorrect
      ? (option.learnerDistinctionZh || (option.displayEnglish || option.sourceHeadword) + " 是本题规范答案。")
      : buildNotAnswerReason(option),
    learnerDistinctionZh: option.learnerDistinctionZh,
    relationEvidence: option.relationEvidence,
    qualityClass: option.qualityClass,
    qualityTier: option.qualityTier,
    isCorrect: !!option.isCorrect
  }));

  const correctOptionIndex = options.findIndex(option => option.isCorrect);
  const optionHash = hashOptionSet(options.map(option => ({
    meaningZh: option.headword,
    sourceWordId: option.sourceWordId
  })));

  return {
    targetWordId: base.wordId,
    targetHeadword: base.word,
    targetSenseKey: correctBase.senseKey,
    senseKeySource: correctBase.senseKeySource,
    chinesePromptZh: base.correctAnswer,
    chinesePromptShortZh: compactChinesePrompt(base.correctAnswer),
    posFamily: base.posFamily || correctBase.posFamily,
    canonicalAnswer: base.word,
    answerAliases: [],
    acceptableAliases: [],
    excludedSynonymIds: [],
    meaningDetailedZh: base.meaningDetailedZh,
    example: null,
    exampleCn: null,
    answerAudioWord: base.word,
    answerAudioExample: null,
    options,
    correctOptionIndex,
    optionHash,
    combinationHash: base.combinationHash,
    combinationScore: base.combinationScore,
    combinationStrategy: base.combinationStrategy,
    questionOrdinal,
    questionAuditSnapshot: buildAuditSnapshot(base, options, correctOptionIndex, optionHash)
  };
}

export function validateRetrievalQuestion(question) {
  if (!question || question.qualityDeferred) return { valid: true };
  if (!question.targetWordId) return { valid: false, reason: "missing targetWordId" };
  if (!question.targetSenseKey) return { valid: false, reason: "missing targetSenseKey" };
  if (!question.chinesePromptZh) return { valid: false, reason: "missing chinesePromptZh" };
  if (!question.canonicalAnswer) return { valid: false, reason: "missing canonicalAnswer" };
  if (!Array.isArray(question.options) || question.options.length !== 4) return { valid: false, reason: "bad options count" };
  if (question.options.filter(option => option.isCorrect).length !== 1) return { valid: false, reason: "wrong correct count" };

  const labels = question.options.map(option => normalize(option.headword));
  if (new Set(labels).size !== labels.length) return { valid: false, reason: "duplicate english option" };

  for (const option of question.options) {
    if (!option.sourceWordId) return { valid: false, reason: "missing sourceWordId" };
    if (!option.headword) return { valid: false, reason: "missing headword" };
    if (!option.posFamily) return { valid: false, reason: "missing posFamily" };
    if (!option.senseKey) return { valid: false, reason: "missing senseKey" };
    if (!option.quizMeaningZh) return { valid: false, reason: "missing quizMeaningZh" };
    if (!option.meaningDetailedZh) return { valid: false, reason: "missing meaningDetailedZh" };
    if (!option.relationEvidence || !option.relationEvidence.kind) return { valid: false, reason: "missing relationEvidence" };
    if (!option.learnerDistinctionZh) return { valid: false, reason: "missing learnerDistinctionZh" };
    if (option.qualityClass !== "P1" && option.qualityClass !== "P2") return { valid: false, reason: "bad qualityClass" };
    if (option.qualityTier !== "A" && option.qualityTier !== "B") return { valid: false, reason: "bad qualityTier" };
  }

  const targetPos = question.posFamily;
  for (const option of question.options) {
    if (option.posFamily !== targetPos) return { valid: false, reason: "posFamily mismatch" };
  }

  return { valid: true };
}

function buildAuditSnapshot(base, options, correctOptionIndex, optionHash) {
  return {
    generatedAt: new Date().toISOString(),
    mode: "meaning-en",
    sourceMode: "meaning-mode-builder",
    target: {
      targetWordId: base.wordId,
      targetHeadword: base.word,
      targetSenseKey: options[correctOptionIndex] ? options[correctOptionIndex].senseKey : null,
      chinesePromptZh: base.correctAnswer,
      canonicalAnswer: base.word,
      posFamily: base.posFamily
    },
    options: options.map((option, index) => ({
      index,
      isCorrect: option.isCorrect,
      sourceWordId: option.sourceWordId,
      headword: option.headword,
      posFamily: option.posFamily,
      senseKey: option.senseKey,
      quizMeaningZh: option.quizMeaningZh,
      relationType: option.relationType,
      learnerDistinctionZh: option.learnerDistinctionZh,
      relationEvidence: option.relationEvidence,
      qualityClass: option.qualityClass,
      qualityTier: option.qualityTier
    })),
    correctOptionIndex,
    optionHash
  };
}

function compactChinesePrompt(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .split(/[;；。]/)[0]
    .trim();
}

function buildNotAnswerReason(option) {
  if (option.learnerDistinctionZh) return option.learnerDistinctionZh;
  const headword = option.displayEnglish || option.sourceHeadword || "该选项";
  const meaning = option.quizMeaningZh || option.meaningZh || "其义项";
  return headword + " 表示「" + meaning + "」，不等同于本题中文义项。";
}

function classifyDistractor(option) {
  const relation = String(option.relationType || option.relationToTarget || "").toLowerCase();
  if (relation.includes("spelling") || relation.includes("confus")) return "form-confusable";
  if (relation.includes("sibling") || relation.includes("coordinate")) return "sibling-concept";
  return "near-but-distinct";
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}
