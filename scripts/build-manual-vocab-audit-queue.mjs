import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  getWordQualityEvaluation,
  hasUsefulQualityText
} from "../app/lib/vocab/word-quality-status.mjs";

const projectRoot = process.cwd();
const sourceFile = path.join(projectRoot, "public", "data", "words.json");
const outputArgIndex = process.argv.indexOf("--out-dir");
const outputDir = path.resolve(
  projectRoot,
  outputArgIndex >= 0 && process.argv[outputArgIndex + 1]
    ? process.argv[outputArgIndex + 1]
    : "reports/manual-vocab-audit"
);
const batchSize = 100;
const DIRECT_FAMILY_RELATIONS = new Set([
  "base-word",
  "noun-form",
  "verb-form",
  "adjective-form",
  "adverb-form",
  "agent-noun",
  "negative-form",
  "related-to"
]);

function text(value) {
  return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
}

function key(value) {
  return text(value).toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
}

function isSingleEnglishHeadword(value) {
  return /^[A-Za-z][A-Za-z'-]*$/.test(text(value));
}

function inspectPhraseItems(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];

  for (const item of value) {
    const phrase = text(typeof item === "string" ? item : item?.phrase || item?.text || item?.collocation);
    const chinese = text(typeof item === "string" ? "" : item?.chinese || item?.translation || item?.meaning);
    const phraseKey = key(phrase).replace(/[^a-z0-9]+/g, " ").trim();
    const wordCount = phrase.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length || 0;
    const reasons = [];

    if (!phrase) reasons.push("empty-phrase");
    if (wordCount < 2) reasons.push("not-a-collocation");
    if (wordCount > 10) reasons.push("too-long");
    if (!chinese) reasons.push("missing-chinese");
    if (/[?？]/.test(phrase)) reasons.push("question-like");
    if (phraseKey && seen.has(phraseKey)) reasons.push("duplicate");
    if (phraseKey) seen.add(phraseKey);

    result.push({ phrase, chinese, valid: reasons.length === 0, reasons });
  }

  return result;
}

const payload = JSON.parse(readFileSync(sourceFile, "utf8"));
const words = Array.isArray(payload) ? payload : payload.words;
if (!Array.isArray(words) || !words.length) {
  throw new Error("public/data/words.json does not contain a non-empty words array");
}

const byWord = new Map();
const duplicateHeadwords = new Map();
words.forEach((word, index) => {
  const wordKey = key(word?.word);
  if (!wordKey) return;
  const indexes = duplicateHeadwords.get(wordKey) || [];
  indexes.push(index);
  duplicateHeadwords.set(wordKey, indexes);
  if (!byWord.has(wordKey)) byWord.set(wordKey, word);
});
const knownHeadwords = new Set(byWord.keys());

function classifyEntry(word) {
  const quality = getWordQualityEvaluation(word, { knownHeadwords });
  const common = inspectPhraseItems(word?.collocations);
  const phrase = inspectPhraseItems(word?.phraseCollocations);
  const validCommon = common.filter((item) => item.valid);
  const validPhrase = phrase.filter((item) => item.valid);
  const reviewReasons = [];
  const optionalEnrichmentReasons = [];

  if (quality.contentMissing) reviewReasons.push("missing-required-content");
  if (quality.contentInvalid) reviewReasons.push("invalid-content-structure");
  if (common.some((item) => !item.valid)) reviewReasons.push("invalid-common-collocation");
  if (phrase.some((item) => !item.valid)) reviewReasons.push("invalid-phrase-collocation");
  if (quality.classificationMissing) reviewReasons.push("missing-classification");
  if (quality.needsFamilyReview) reviewReasons.push("invalid-family-structure");
  if (quality.needsOptionalEnrichment) {
    optionalEnrichmentReasons.push("below-tier-enrichment-target");
  }

  const requiredRepair = quality.lane === "completion" || quality.lane === "repair";
  const priority = requiredRepair
    ? "P1"
    : quality.classificationMissing || quality.needsFamilyReview
      ? "P2"
      : "READY";

  return {
    id: text(word?.id || word?.wordId),
    word: text(word?.word),
    pos: text(word?.pos),
    meaning: text(word?.meaning),
    lane: quality.lane,
    priority,
    missingContentFields: quality.missingContentFields,
    invalidContentFields: quality.invalidContentFields,
    invalidOtherMeaningIndexes: quality.invalidOtherMeaningIndexes,
    missingClassificationFields: quality.missingClassificationFields,
    reliableContentCounts: quality.reliableContentCounts,
    minimumLearningTarget: quality.minimumLearningTarget,
    commonCollocations: common,
    phraseCollocations: phrase,
    validCommonCount: validCommon.length,
    validPhraseCount: validPhrase.length,
    enrichmentStatus: quality.enrichmentStatus,
    enrichmentCounts: quality.enrichmentCounts,
    enrichmentTarget: quality.enrichmentTarget,
    needsOptionalEnrichment: quality.needsOptionalEnrichment,
    optionalEnrichmentReasons,
    familyStatus: quality.familyStatus,
    familyReviewItems: quality.familyReviewItems,
    familyPromotionCandidates: quality.familyPromotionCandidates,
    reviewReasons,
    needsManualReview: reviewReasons.length > 0
  };
}

const entries = words.map(classifyEntry);
const reviewEntries = entries.filter((entry) => entry.needsManualReview);
const optionalEnrichment = entries.filter((entry) => entry.needsOptionalEnrichment);

const familyCandidateMap = new Map();
words.forEach((owner) => {
  const ownerWord = text(owner?.word);
  const ownerId = text(owner?.id || owner?.wordId);
  const family = Array.isArray(owner?.wordFamily) ? owner.wordFamily : [];

  family.forEach((item) => {
    const familyWord = text(item?.word || item);
    const familyKey = key(familyWord);
    const relation = key(item?.relation || "related-to");
    const meaning = text(item?.meaningZh || item?.meaning || item?.chinese);
    const pos = text(item?.pos);
    if (!familyKey || familyKey === key(ownerWord)) return;
    if (!isSingleEnglishHeadword(familyWord)) return;
    if (!DIRECT_FAMILY_RELATIONS.has(relation)) return;
    if (!hasUsefulQualityText(meaning)) return;

    const existing = byWord.get(familyKey);
    const candidate = familyCandidateMap.get(familyKey) || {
      word: familyWord,
      pos,
      meaning,
      existingInLexicon: Boolean(existing),
      existingId: text(existing?.id || existing?.wordId),
      owners: [],
      relations: []
    };
    if (!candidate.pos && pos) candidate.pos = pos;
    if (!candidate.meaning && meaning) candidate.meaning = meaning;
    candidate.owners.push({ ownerId, ownerWord });
    if (!candidate.relations.includes(relation)) candidate.relations.push(relation);
    familyCandidateMap.set(familyKey, candidate);
  });
});

const familyCandidates = [...familyCandidateMap.values()]
  .map((candidate) => ({
    ...candidate,
    action: candidate.existingInLexicon ? "link-existing-entry" : "manual-review-before-promote",
    eligibleForStandaloneReview: Boolean(
      !candidate.existingInLexicon &&
      isSingleEnglishHeadword(candidate.word) &&
      hasUsefulQualityText(candidate.meaning)
    )
  }))
  .sort((a, b) => a.word.localeCompare(b.word));

const duplicateGroups = [...duplicateHeadwords.entries()]
  .filter(([, indexes]) => indexes.length > 1)
  .map(([word, indexes]) => ({
    word,
    count: indexes.length,
    entries: indexes.map((index) => ({
      index,
      id: text(words[index]?.id || words[index]?.wordId),
      displayedWord: text(words[index]?.word)
    }))
  }));

const countLane = (lane) => entries.filter((entry) => entry.lane === lane).length;
const summary = {
  generatedAt: new Date().toISOString(),
  sourceVersion: text(payload?.version),
  totalWords: words.length,
  requiredRepairCount: countLane("completion") + countLane("repair"),
  completionCount: countLane("completion"),
  repairCount: countLane("repair"),
  classificationCount: countLane("classification"),
  readyCount: countLane("ready"),
  manualReviewCount: reviewEntries.length,
  optionalEnrichmentCount: optionalEnrichment.length,
  enrichmentThinCount: entries.filter((entry) => entry.enrichmentStatus === "thin").length,
  enrichmentStandardCount: entries.filter((entry) => entry.enrichmentStatus === "standard").length,
  enrichmentRichCount: entries.filter((entry) => entry.enrichmentStatus === "rich").length,
  commonCollocationsUnderFour: entries.filter((entry) => entry.validCommonCount < 4).length,
  phraseCollocationsUnderFour: entries.filter((entry) => entry.validPhraseCount < 4).length,
  invalidOtherMeaningsCount: entries.filter((entry) => entry.invalidOtherMeaningIndexes.length).length,
  missingClassificationCount: entries.filter((entry) => entry.missingClassificationFields.length).length,
  duplicateHeadwordGroups: duplicateGroups.length,
  familyMembersObserved: familyCandidates.length,
  familyMembersAlreadyStandalone: familyCandidates.filter((item) => item.existingInLexicon).length,
  familyMembersEligibleForStandaloneReview: familyCandidates.filter((item) => item.eligibleForStandaloneReview).length,
  familyStructureReviewCount: entries.filter((entry) => entry.familyStatus === "review").length,
  note: "Required repairs are separated from optional enrichment. Fewer than four collocations alone does not make an entry defective."
};

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(path.join(outputDir, "batches"), { recursive: true });

function writeJson(filename, value) {
  writeFileSync(path.join(outputDir, filename), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeJsonLines(filename, values) {
  const content = values.map((value) => JSON.stringify(value)).join("\n");
  writeFileSync(path.join(outputDir, filename), content ? `${content}\n` : "", "utf8");
}

writeJson("summary.json", summary);
writeJsonLines("entries-needing-review.jsonl", reviewEntries);
writeJsonLines("optional-enrichment.jsonl", optionalEnrichment);
writeJsonLines("word-family-candidates.jsonl", familyCandidates);
writeJson("duplicate-headwords.json", duplicateGroups);

for (let start = 0; start < reviewEntries.length; start += batchSize) {
  const batchNumber = Math.floor(start / batchSize) + 1;
  const batch = reviewEntries.slice(start, start + batchSize);
  writeJson(
    path.join("batches", `batch-${String(batchNumber).padStart(4, "0")}.json`),
    {
      batchNumber,
      startIndex: start,
      endIndex: start + batch.length - 1,
      entries: batch
    }
  );
}

console.log(JSON.stringify(summary, null, 2));
