import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

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

const PLACEHOLDER_RE = /^(?:-|—|n\/?a|none|null|undefined|unknown|not available|待补全|待完善|暂无|无释义|中文释义|英文释义|meaning here|translation here|example sentence|\?{2,})$/i;
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

function useful(value) {
  const valueText = text(value);
  return Boolean(valueText) && !PLACEHOLDER_RE.test(valueText);
}

function isSingleEnglishHeadword(value) {
  return /^[A-Za-z][A-Za-z'-]*$/.test(text(value));
}

function normalizePhraseItems(value) {
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

function classifyEntry(word) {
  const missingCoreFields = [];
  if (!text(word?.word)) missingCoreFields.push("word");
  for (const field of ["pos", "meaning", "definition", "example", "exampleCn"]) {
    if (!useful(word?.[field])) missingCoreFields.push(field);
  }

  const common = normalizePhraseItems(word?.collocations);
  const phrase = normalizePhraseItems(word?.phraseCollocations);
  const validCommon = common.filter((item) => item.valid);
  const validPhrase = phrase.filter((item) => item.valid);
  const missingClassificationFields = [];
  if (!Array.isArray(word?.ieltsUse) || !word.ieltsUse.length) missingClassificationFields.push("ieltsUse");
  if (!Array.isArray(word?.topics) || !word.topics.length) missingClassificationFields.push("topics");
  if (!useful(word?.difficulty)) missingClassificationFields.push("difficulty");

  const otherMeanings = Array.isArray(word?.otherMeanings) ? word.otherMeanings : [];
  const invalidOtherMeaningIndexes = [];
  otherMeanings.forEach((sense, index) => {
    if (typeof sense === "string") {
      invalidOtherMeaningIndexes.push(index);
      return;
    }
    if (
      !useful(sense?.meaningZh || sense?.meaning) ||
      !useful(sense?.definitionEn || sense?.definition) ||
      !useful(sense?.example) ||
      !useful(sense?.exampleCn)
    ) {
      invalidOtherMeaningIndexes.push(index);
    }
  });

  const reviewReasons = [];
  if (missingCoreFields.length) reviewReasons.push("missing-core-content");
  if (validCommon.length < 4) reviewReasons.push("common-collocations-under-four");
  if (validPhrase.length < 4) reviewReasons.push("phrase-collocations-under-four");
  if (common.some((item) => !item.valid)) reviewReasons.push("invalid-common-collocation");
  if (phrase.some((item) => !item.valid)) reviewReasons.push("invalid-phrase-collocation");
  if (missingClassificationFields.length) reviewReasons.push("missing-classification");
  if (invalidOtherMeaningIndexes.length) reviewReasons.push("invalid-other-meanings");

  return {
    id: text(word?.id || word?.wordId),
    word: text(word?.word),
    pos: text(word?.pos),
    meaning: text(word?.meaning),
    missingCoreFields,
    missingClassificationFields,
    commonCollocations: common,
    phraseCollocations: phrase,
    validCommonCount: validCommon.length,
    validPhraseCount: validPhrase.length,
    commonNeedsManualCompletion: validCommon.length < 4,
    phraseNeedsManualCompletion: validPhrase.length < 4,
    invalidOtherMeaningIndexes,
    reviewReasons,
    needsManualReview: reviewReasons.length > 0,
    priority: missingCoreFields.length
      ? "P1"
      : (validCommon.length < 4 || validPhrase.length < 4 || invalidOtherMeaningIndexes.length)
        ? "P2"
        : missingClassificationFields.length
          ? "P3"
          : "READY"
  };
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

const entries = words.map(classifyEntry);
const reviewEntries = entries.filter((entry) => entry.needsManualReview);
const collocationReview = reviewEntries.filter((entry) => (
  entry.commonNeedsManualCompletion ||
  entry.phraseNeedsManualCompletion ||
  entry.commonCollocations.some((item) => !item.valid) ||
  entry.phraseCollocations.some((item) => !item.valid)
));

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
    if (!useful(meaning)) return;

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
      useful(candidate.meaning)
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

const summary = {
  generatedAt: new Date().toISOString(),
  sourceVersion: text(payload?.version),
  totalWords: words.length,
  manualReviewCount: reviewEntries.length,
  missingCoreCount: entries.filter((entry) => entry.missingCoreFields.length).length,
  commonCollocationsUnderFour: entries.filter((entry) => entry.validCommonCount < 4).length,
  phraseCollocationsUnderFour: entries.filter((entry) => entry.validPhraseCount < 4).length,
  invalidOtherMeaningsCount: entries.filter((entry) => entry.invalidOtherMeaningIndexes.length).length,
  missingClassificationCount: entries.filter((entry) => entry.missingClassificationFields.length).length,
  duplicateHeadwordGroups: duplicateGroups.length,
  familyMembersObserved: familyCandidates.length,
  familyMembersAlreadyStandalone: familyCandidates.filter((item) => item.existingInLexicon).length,
  familyMembersEligibleForStandaloneReview: familyCandidates.filter((item) => item.eligibleForStandaloneReview).length,
  note: "This report is deterministic triage only. It does not modify the lexicon and does not certify semantic correctness."
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
writeJsonLines("collocation-review.jsonl", collocationReview);
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
