import {
  isDetailedOtherMeaning,
  isReliableAiCollocation,
  normalizeAiPhraseItems
} from "./admin-ai-content-profile.mjs";

const MISSING_TEXT_RE = /^(?:-|—|n\/?a|none|null|undefined|unknown|not available|待补全|待完善|暂无|无释义|中文释义|英文释义|meaning here|translation here|example sentence|\?{2,})$/i;
const FUNCTION_WORD_POS_RE = /\b(?:article|auxiliary|conjunction|determiner|interjection|modal|preposition|pronoun)\b/i;
const REFERENCE_CATEGORY_RE = /(?:参考|专名|来源待核|专业参考|拼写变体)/;
const FAMILY_RELATIONS = new Set([
  "base-word",
  "noun-form",
  "verb-form",
  "adjective-form",
  "adverb-form",
  "agent-noun",
  "negative-form",
  "related-to"
]);
const FAMILY_RELATION_ALIASES = new Map([
  ["同词族 / 派生词", "related-to"],
  ["同词族/派生词", "related-to"],
  ["同词族 / 词汇化派生词", "related-to"],
  ["同词族/词汇化派生词", "related-to"],
  ["lexicalised/derived relation", "related-to"],
  ["lexicalized/derived relation", "related-to"]
]);

export const WORD_QUALITY_LANES = Object.freeze({
  COMPLETION: "completion",
  REPAIR: "repair",
  CLASSIFICATION: "classification",
  READY: "ready"
});

export const WORD_ENRICHMENT_STATUS = Object.freeze({
  THIN: "thin",
  STANDARD: "standard",
  RICH: "rich"
});

export const WORD_FAMILY_STATUS = Object.freeze({
  CLEAN: "clean",
  REVIEW: "review",
  PROMOTION_CANDIDATE: "promotion-candidate"
});

export function hasUsefulQualityText(value) {
  const normalized = String(value ?? "").trim();
  return Boolean(normalized) && !MISSING_TEXT_RE.test(normalized);
}

export function hasUsefulHeadword(value) {
  return Boolean(String(value ?? "").trim());
}

function normalizeHeadword(value) {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ");
}

function isSingleEnglishHeadword(value) {
  return /^[A-Za-z][A-Za-z'-]*$/.test(String(value ?? "").trim());
}

function reliablePhraseCount(value, { requireChinese = false } = {}) {
  return normalizeAiPhraseItems(value, { max: 20, requireChinese })
    .filter((item) => isReliableAiCollocation(item))
    .length;
}

function isReferenceEntry(word = {}) {
  return word?.studyMode === "reference" || REFERENCE_CATEGORY_RE.test(String(word?.category || ""));
}

function isFunctionWord(word = {}) {
  return FUNCTION_WORD_POS_RE.test(String(word?.pos || ""));
}

export function resolveWordEnrichmentTarget(word = {}) {
  if (isReferenceEntry(word)) {
    return {
      applicable: false,
      minimum: { common: 0, phrase: 0 },
      standard: { common: 0, phrase: 0 },
      rich: { common: 0, phrase: 0 }
    };
  }

  if (/\binterjection\b/i.test(String(word?.pos || ""))) {
    return {
      applicable: false,
      minimum: { common: 0, phrase: 0 },
      standard: { common: 0, phrase: 0 },
      rich: { common: 0, phrase: 0 }
    };
  }

  if (isFunctionWord(word)) {
    return {
      applicable: true,
      minimum: { common: 0, phrase: 0 },
      standard: { common: 0, phrase: 1 },
      rich: { common: 0, phrase: 4 }
    };
  }

  const difficulty = String(word?.difficulty || "").trim();
  if (difficulty === "低频认识即可") {
    return {
      applicable: true,
      minimum: { common: 0, phrase: 0 },
      standard: { common: 1, phrase: 0 },
      rich: { common: 2, phrase: 1 }
    };
  }
  if (difficulty === "高级加分") {
    return {
      applicable: true,
      minimum: { common: 0, phrase: 0 },
      standard: { common: 1, phrase: 1 },
      rich: { common: 3, phrase: 3 }
    };
  }

  return {
    applicable: true,
    minimum: { common: 0, phrase: 0 },
    standard: { common: 1, phrase: 1 },
    rich: { common: 4, phrase: 4 }
  };
}

export function getWordEnrichmentStatus(word = {}) {
  const target = resolveWordEnrichmentTarget(word);
  const counts = {
    common: reliablePhraseCount(word?.collocations, { requireChinese: true }),
    phrase: reliablePhraseCount(word?.phraseCollocations, { requireChinese: true })
  };
  const meets = (level) => (
    counts.common >= target[level].common && counts.phrase >= target[level].phrase
  );
  const status = !target.applicable || meets("rich")
    ? WORD_ENRICHMENT_STATUS.RICH
    : meets("standard")
      ? WORD_ENRICHMENT_STATUS.STANDARD
      : WORD_ENRICHMENT_STATUS.THIN;

  return {
    enrichmentApplicable: target.applicable,
    enrichmentStatus: status,
    enrichmentCounts: counts,
    enrichmentTarget: target,
    needsOptionalEnrichment: target.applicable && status === WORD_ENRICHMENT_STATUS.THIN
  };
}

function inspectOtherMeanings(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return [-1];
  const invalidIndexes = [];
  value.forEach((sense, index) => {
    if (!isDetailedOtherMeaning(sense)) invalidIndexes.push(index);
  });
  return invalidIndexes;
}

export function getWordQualityStatus(word = {}) {
  const missingContentFields = [];
  const target = resolveWordEnrichmentTarget(word);
  const commonCount = reliablePhraseCount(word?.collocations);
  const phraseCount = reliablePhraseCount(word?.phraseCollocations);

  // Words such as "none", "null", and "unknown" are legitimate English
  // headwords even though the same strings are placeholders in content fields.
  if (!hasUsefulHeadword(word.word)) missingContentFields.push("word");
  if (!hasUsefulQualityText(word.pos)) missingContentFields.push("pos");
  if (!hasUsefulQualityText(word.meaning)) missingContentFields.push("meaning");
  if (!hasUsefulQualityText(word.definition)) missingContentFields.push("definition");
  if (!hasUsefulQualityText(word.example)) missingContentFields.push("example");
  if (!hasUsefulQualityText(word.exampleCn)) missingContentFields.push("exampleCn");

  const invalidOtherMeaningIndexes = inspectOtherMeanings(word?.otherMeanings);
  const invalidContentFields = invalidOtherMeaningIndexes.length ? ["otherMeanings"] : [];

  const missingClassificationFields = [];
  if (!Array.isArray(word.ieltsUse) || !word.ieltsUse.length) {
    missingClassificationFields.push("ieltsUse");
  }
  if (!Array.isArray(word.topics) || !word.topics.length) {
    missingClassificationFields.push("topics");
  }
  if (!hasUsefulQualityText(word.difficulty)) missingClassificationFields.push("difficulty");

  const contentMissing = missingContentFields.length > 0;
  const contentInvalid = invalidContentFields.length > 0;

  return {
    contentComplete: !contentMissing && !contentInvalid,
    contentMissing,
    contentInvalid,
    classificationComplete: missingClassificationFields.length === 0,
    classificationMissing: missingClassificationFields.length > 0,
    missingContentFields,
    invalidContentFields,
    invalidOtherMeaningIndexes,
    missingClassificationFields,
    minimumLearningTarget: target.minimum,
    reliableContentCounts: { common: commonCount, phrase: phraseCount }
  };
}

export function getWordFamilyStatus(word = {}, { knownHeadwords = new Set() } = {}) {
  const family = Array.isArray(word?.wordFamily) ? word.wordFamily : [];
  const headwordKey = normalizeHeadword(word?.word);
  const known = knownHeadwords instanceof Set
    ? knownHeadwords
    : new Set(Array.from(knownHeadwords || [], normalizeHeadword));
  const promotionCandidates = [];
  const reviewItems = [];

  for (const item of family) {
    const familyWord = String(typeof item === "string" ? item : item?.word || "").trim();
    const familyKey = normalizeHeadword(familyWord);
    const rawRelation = String(typeof item === "string" ? "related-to" : item?.relation || "related-to").trim();
    const relation = FAMILY_RELATION_ALIASES.get(rawRelation)
      || rawRelation.toLowerCase();
    const meaning = String(typeof item === "string" ? "" : item?.meaningZh || item?.meaning || item?.chinese || "").trim();
    const explicitStandaloneCandidate = Boolean(
      typeof item !== "string" &&
      (
        item?.standaloneCandidate === true ||
        item?.promotionStatus === "pending" ||
        item?.standaloneReviewStatus === "pending"
      )
    );

    if (!familyKey || familyKey === headwordKey || !isSingleEnglishHeadword(familyWord) || !FAMILY_RELATIONS.has(relation)) {
      reviewItems.push({ word: familyWord, relation, reason: "invalid-family-structure" });
      continue;
    }
    if (explicitStandaloneCandidate && !known.has(familyKey) && hasUsefulQualityText(meaning)) {
      promotionCandidates.push({ word: familyWord, relation, meaning });
    }
  }

  const familyStatus = reviewItems.length
    ? WORD_FAMILY_STATUS.REVIEW
    : promotionCandidates.length
      ? WORD_FAMILY_STATUS.PROMOTION_CANDIDATE
      : WORD_FAMILY_STATUS.CLEAN;

  return {
    familyStatus,
    needsFamilyReview: familyStatus === WORD_FAMILY_STATUS.REVIEW,
    hasFamilyPromotionCandidate: familyStatus === WORD_FAMILY_STATUS.PROMOTION_CANDIDATE,
    familyReviewItems: reviewItems,
    familyPromotionCandidates: promotionCandidates
  };
}

export function getWordQualityEvaluation(word = {}, options = {}) {
  const quality = getWordQualityStatus(word);
  const enrichment = getWordEnrichmentStatus(word);
  const family = getWordFamilyStatus(word, options);
  const repairRequired = Boolean(options.needsRepair) || quality.contentInvalid;
  const lane = repairRequired
    ? WORD_QUALITY_LANES.REPAIR
    : quality.contentMissing
      ? WORD_QUALITY_LANES.COMPLETION
      : quality.classificationMissing
        ? WORD_QUALITY_LANES.CLASSIFICATION
        : WORD_QUALITY_LANES.READY;

  return {
    ...quality,
    ...enrichment,
    ...family,
    lane,
    needsRepair: repairRequired,
    unresolved: lane !== WORD_QUALITY_LANES.READY
  };
}

export function summarizeWordQuality(words = [], options = {}) {
  const list = Array.isArray(words) ? words : [];
  const resolveNeedsRepair = typeof options.needsRepair === "function"
    ? options.needsRepair
    : () => Boolean(options.needsRepair);
  const knownHeadwords = options.knownHeadwords instanceof Set
    ? options.knownHeadwords
    : new Set(list.map((word) => normalizeHeadword(word?.word)).filter(Boolean));
  const counts = {
    completion: 0,
    repair: 0,
    classification: 0,
    ready: 0,
    contentMissing: 0,
    contentInvalid: 0,
    classificationMissing: 0,
    enrichmentThin: 0,
    enrichmentStandard: 0,
    enrichmentRich: 0,
    familyReview: 0,
    familyPromotion: 0,
    total: list.length
  };

  list.forEach((word, index) => {
    const evaluation = getWordQualityEvaluation(word, {
      needsRepair: resolveNeedsRepair(word, index),
      knownHeadwords
    });
    counts[evaluation.lane] += 1;
    if (evaluation.contentMissing) counts.contentMissing += 1;
    if (evaluation.contentInvalid) counts.contentInvalid += 1;
    if (evaluation.classificationMissing) counts.classificationMissing += 1;
    if (evaluation.enrichmentApplicable) {
      if (evaluation.enrichmentStatus === WORD_ENRICHMENT_STATUS.THIN) counts.enrichmentThin += 1;
      if (evaluation.enrichmentStatus === WORD_ENRICHMENT_STATUS.STANDARD) counts.enrichmentStandard += 1;
      if (evaluation.enrichmentStatus === WORD_ENRICHMENT_STATUS.RICH) counts.enrichmentRich += 1;
    }
    if (evaluation.needsFamilyReview) counts.familyReview += 1;
    if (evaluation.hasFamilyPromotionCandidate) counts.familyPromotion += 1;
  });

  return counts;
}

export function isMissingAiFields(word) {
  return getWordQualityStatus(word).contentMissing;
}

export function isInvalidAiContent(word) {
  return getWordQualityStatus(word).contentInvalid;
}

export function isMissingClassification(word) {
  return getWordQualityStatus(word).classificationMissing;
}

export function needsOptionalWordEnrichment(word) {
  return getWordEnrichmentStatus(word).needsOptionalEnrichment;
}

export function isLearningContentComplete(word) {
  return getWordQualityStatus(word).contentComplete;
}

export function getUnifiedQualityQueue(word = {}, options = {}) {
  return getWordQualityEvaluation(word, options).lane;
}
