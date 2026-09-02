import {
  AI_COLLOCATION_LIMIT,
  isDetailedOtherMeaning,
  normalizeAiPhraseItems,
  normalizeOtherMeanings,
  sanitizeAiWordCollocations
} from "./admin-ai-content-profile.mjs";
import {
  getWordQualityStatus,
  hasUsefulQualityText
} from "./word-quality-status.mjs";
import { isAiProfileCompatibleWithDeclaredPos } from "./multi-pos-sense-coverage.mjs";

export const AI_WRITE_MODES = Object.freeze({
  PRECISE_STRUCTURE_REPAIR: "precise-structure-repair",
  OPTIONAL_ENRICHMENT: "optional-enrichment"
});

const SEMANTIC_CONTENT_FIELDS = Object.freeze([
  "phonetic",
  "pos",
  "meaning",
  "meaningDetailZh",
  "definition",
  "example",
  "exampleCn"
]);

const CLASSIFICATION_FIELDS = Object.freeze([
  "ieltsUse",
  "topics",
  "difficulty"
]);

function phraseKey(value) {
  return String(value || "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mergeTranslatedPhrases(existingValue, candidateValue, max = AI_COLLOCATION_LIMIT) {
  const existing = normalizeAiPhraseItems(existingValue, {
    max: 20,
    requireChinese: true
  });
  const candidate = normalizeAiPhraseItems(candidateValue, {
    max: 20,
    requireChinese: true
  });
  const merged = new Map();

  for (const item of [...existing, ...candidate]) {
    const key = phraseKey(item.phrase);
    if (!key) continue;
    const previous = merged.get(key);
    merged.set(key, {
      phrase: previous?.phrase || item.phrase,
      chinese: previous?.chinese || item.chinese
    });
    if (merged.size >= max) break;
  }

  return Array.from(merged.values()).slice(0, max);
}

function validOtherMeanings(value, mainMeaning, mainPos) {
  return normalizeOtherMeanings(value, mainMeaning, mainPos).filter(isDetailedOtherMeaning);
}

function cleanCandidate(candidateWord = {}) {
  const next = sanitizeAiWordCollocations({ ...candidateWord });
  delete next.aiWriteMode;
  delete next.aiRepairScope;
  delete next.aiReplaceExisting;
  return next;
}

function copyUsefulScalar(next, candidate, field) {
  if (hasUsefulQualityText(candidate?.[field])) next[field] = candidate[field];
}

function copyMissingClassification(next, existing, candidate) {
  if ((!Array.isArray(existing.ieltsUse) || !existing.ieltsUse.length) && Array.isArray(candidate.ieltsUse) && candidate.ieltsUse.length) {
    next.ieltsUse = candidate.ieltsUse;
  }
  if ((!Array.isArray(existing.topics) || !existing.topics.length) && Array.isArray(candidate.topics) && candidate.topics.length) {
    next.topics = candidate.topics;
  }
  if (!hasUsefulQualityText(existing.difficulty) && hasUsefulQualityText(candidate.difficulty)) {
    next.difficulty = candidate.difficulty;
  }
}

export function mergePreciseStructureRepair(existingWord = {}, candidateWord = {}) {
  const candidate = cleanCandidate(candidateWord);
  const quality = getWordQualityStatus(existingWord);
  const next = { ...existingWord };
  const multiPosRepair = quality.invalidContentFields.includes("multiPosSenses");
  const semanticRepair = (!quality.contentInvalid && !quality.contentMissing) || multiPosRepair;

  if (
    multiPosRepair
    && !isAiProfileCompatibleWithDeclaredPos(
      candidate,
      existingWord.primaryPos || existingWord.pos || existingWord.partOfSpeech
    )
  ) {
    const error = new Error("AI返回的主词性和附加义项没有覆盖原词条声明的全部词性");
    error.code = "AI_MULTI_POS_COVERAGE_INCOMPLETE";
    throw error;
  }

  if (semanticRepair) {
    for (const field of SEMANTIC_CONTENT_FIELDS) copyUsefulScalar(next, candidate, field);
    const candidateSenses = validOtherMeanings(
      candidate.otherMeanings,
      candidate.meaning || next.meaning,
      candidate.pos || next.pos
    );
    if (candidateSenses.length || Array.isArray(candidate.otherMeanings)) next.otherMeanings = candidateSenses;
    next.collocations = normalizeAiPhraseItems(candidate.collocations, {
      max: AI_COLLOCATION_LIMIT,
      requireChinese: true
    });
    next.phraseCollocations = normalizeAiPhraseItems(candidate.phraseCollocations, {
      max: AI_COLLOCATION_LIMIT,
      requireChinese: true
    });
  } else {
    for (const field of quality.missingContentFields) {
      if (field !== "word") copyUsefulScalar(next, candidate, field);
    }

    if (quality.invalidContentFields.includes("otherMeanings")) {
      const candidateSenses = validOtherMeanings(
        candidate.otherMeanings,
        candidate.meaning || next.meaning,
        candidate.pos || next.pos
      );
      const recoveredExisting = validOtherMeanings(
        existingWord.otherMeanings,
        existingWord.meaning,
        existingWord.pos
      );
      next.otherMeanings = candidateSenses.length ? candidateSenses : recoveredExisting;
    }

    const cleanedExisting = sanitizeAiWordCollocations(existingWord);
    if (Array.isArray(cleanedExisting.collocations)) next.collocations = cleanedExisting.collocations;
    if (Array.isArray(cleanedExisting.phraseCollocations)) next.phraseCollocations = cleanedExisting.phraseCollocations;
    if (!next.collocations?.length && candidate.collocations?.length) {
      next.collocations = normalizeAiPhraseItems(candidate.collocations, {
        max: AI_COLLOCATION_LIMIT,
        requireChinese: true
      });
    }
    if (!next.phraseCollocations?.length && candidate.phraseCollocations?.length) {
      next.phraseCollocations = normalizeAiPhraseItems(candidate.phraseCollocations, {
        max: AI_COLLOCATION_LIMIT,
        requireChinese: true
      });
    }
  }

  copyMissingClassification(next, existingWord, candidate);

  // Identity, morphology and user progress are never taken from an AI repair.
  next.word = existingWord.word;
  if (Object.prototype.hasOwnProperty.call(existingWord, "id")) next.id = existingWord.id;
  if (Object.prototype.hasOwnProperty.call(existingWord, "wordId")) next.wordId = existingWord.wordId;
  next.forms = existingWord.forms;
  next.wordFamily = existingWord.wordFamily;
  next.status = existingWord.status || "";
  next.favorite = Boolean(existingWord.favorite);
  next.aiPreciseRepairAt = Date.now();
  next.aiMergeMode = AI_WRITE_MODES.PRECISE_STRUCTURE_REPAIR;

  return sanitizeAiWordCollocations(next);
}

export function mergeOptionalEnrichment(existingWord = {}, candidateWord = {}) {
  const candidate = cleanCandidate(candidateWord);
  const cleanedExisting = sanitizeAiWordCollocations(existingWord);
  const next = {
    ...existingWord,
    collocations: mergeTranslatedPhrases(cleanedExisting.collocations, candidate.collocations),
    phraseCollocations: mergeTranslatedPhrases(cleanedExisting.phraseCollocations, candidate.phraseCollocations),
    aiEnrichedAt: Date.now(),
    aiMergeMode: AI_WRITE_MODES.OPTIONAL_ENRICHMENT
  };

  // Enrichment is deliberately narrow: never rewrite definitions, examples,
  // classification, morphology, identity, or learning state.
  for (const field of SEMANTIC_CONTENT_FIELDS) next[field] = existingWord[field];
  for (const field of CLASSIFICATION_FIELDS) next[field] = existingWord[field];
  next.otherMeanings = existingWord.otherMeanings;
  next.forms = existingWord.forms;
  next.wordFamily = existingWord.wordFamily;
  next.word = existingWord.word;
  if (Object.prototype.hasOwnProperty.call(existingWord, "id")) next.id = existingWord.id;
  if (Object.prototype.hasOwnProperty.call(existingWord, "wordId")) next.wordId = existingWord.wordId;
  next.status = existingWord.status || "";
  next.favorite = Boolean(existingWord.favorite);

  return sanitizeAiWordCollocations(next);
}
