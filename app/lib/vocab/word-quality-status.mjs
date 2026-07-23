import { isReliableAiCollocation, normalizeAiPhraseItems } from "./admin-ai-content-profile.mjs";

const MISSING_TEXT_RE = /^(?:-|—|n\/?a|none|null|undefined|unknown|not available|待补全|待完善|暂无|无释义|中文释义|英文释义|meaning here|translation here|example sentence|\?{2,})$/i;

export function hasUsefulQualityText(value) {
  const normalized = String(value ?? "").trim();
  return Boolean(normalized) && !MISSING_TEXT_RE.test(normalized);
}

function hasPhraseItems(value) {
  return normalizeAiPhraseItems(value).some((item) => isReliableAiCollocation(item));
}

export function getWordQualityStatus(word = {}) {
  const missingContentFields = [];

  if (!hasUsefulQualityText(word.word)) missingContentFields.push("word");
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

export function isMissingAiFields(word) {
  return getWordQualityStatus(word).contentMissing;
}

export function isMissingClassification(word) {
  return getWordQualityStatus(word).classificationMissing;
}

export function isLearningContentComplete(word) {
  return getWordQualityStatus(word).contentComplete;
}

export function getUnifiedQualityQueue(word = {}, { needsRepair = false } = {}) {
  const quality = getWordQualityStatus(word);
  if (needsRepair) return "repair";
  if (quality.contentMissing) return "completion";
  if (quality.classificationMissing) return "classification";
  return "ready";
}
