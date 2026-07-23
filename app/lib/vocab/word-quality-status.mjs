import { isReliableAiCollocation, normalizeAiPhraseItems } from "./admin-ai-content-profile.mjs";

const MISSING_TEXT_RE = /^(?:-|—|n\/?a|none|null|undefined|unknown|not available|待补全|待完善|暂无|无释义|中文释义|英文释义|meaning here|translation here|example sentence|\?{2,})$/i;

export const WORD_QUALITY_LANES = Object.freeze({
  COMPLETION: "completion",
  REPAIR: "repair",
  CLASSIFICATION: "classification",
  READY: "ready"
});

export function hasUsefulQualityText(value) {
  const normalized = String(value ?? "").trim();
  return Boolean(normalized) && !MISSING_TEXT_RE.test(normalized);
}

export function hasUsefulHeadword(value) {
  return Boolean(String(value ?? "").trim());
}

function hasPhraseItems(value) {
  return normalizeAiPhraseItems(value).some((item) => isReliableAiCollocation(item));
}

export function getWordQualityStatus(word = {}) {
  const missingContentFields = [];

  // Words such as "none", "null", and "unknown" are legitimate English
  // headwords even though the same strings are placeholders in content fields.
  if (!hasUsefulHeadword(word.word)) missingContentFields.push("word");
  if (!hasUsefulQualityText(word.pos)) missingContentFields.push("pos");
  if (!hasUsefulQualityText(word.meaning)) missingContentFields.push("meaning");
  if (!hasUsefulQualityText(word.definition)) missingContentFields.push("definition");
  if (!hasUsefulQualityText(word.example)) missingContentFields.push("example");
  if (!hasUsefulQualityText(word.exampleCn)) missingContentFields.push("exampleCn");
  if (!hasPhraseItems(word.collocations)) missingContentFields.push("collocations");
  if (!hasPhraseItems(word.phraseCollocations)) missingContentFields.push("phraseCollocations");

  const missingClassificationFields = [];
  if (!Array.isArray(word.ieltsUse) || !word.ieltsUse.length) {
    missingClassificationFields.push("ieltsUse");
  }
  if (!Array.isArray(word.topics) || !word.topics.length) {
    missingClassificationFields.push("topics");
  }
  if (!hasUsefulQualityText(word.difficulty)) missingClassificationFields.push("difficulty");

  return {
    contentComplete: missingContentFields.length === 0,
    contentMissing: missingContentFields.length > 0,
    classificationComplete: missingClassificationFields.length === 0,
    classificationMissing: missingClassificationFields.length > 0,
    missingContentFields,
    missingClassificationFields
  };
}

export function getWordQualityEvaluation(word = {}, { needsRepair = false } = {}) {
  const quality = getWordQualityStatus(word);
  const repairRequired = Boolean(needsRepair);
  const lane = repairRequired
    ? WORD_QUALITY_LANES.REPAIR
    : quality.contentMissing
      ? WORD_QUALITY_LANES.COMPLETION
      : quality.classificationMissing
        ? WORD_QUALITY_LANES.CLASSIFICATION
        : WORD_QUALITY_LANES.READY;

  return {
    ...quality,
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
  const counts = {
    completion: 0,
    repair: 0,
    classification: 0,
    ready: 0,
    contentMissing: 0,
    classificationMissing: 0,
    total: list.length
  };

  list.forEach((word, index) => {
    const evaluation = getWordQualityEvaluation(word, {
      needsRepair: resolveNeedsRepair(word, index)
    });
    counts[evaluation.lane] += 1;
    if (evaluation.contentMissing) counts.contentMissing += 1;
    if (evaluation.classificationMissing) counts.classificationMissing += 1;
  });

  return counts;
}

export function isMissingAiFields(word) {
  return getWordQualityStatus(word).contentMissing;
}

export function isMissingClassification(word) {
  return getWordQualityStatus(word).classificationMissing;
}

export function isLearningContentComplete(word) {
  return getWordQualityStatus(word).contentComplete;
}

export function getUnifiedQualityQueue(word = {}, options = {}) {
  return getWordQualityEvaluation(word, options).lane;
}
