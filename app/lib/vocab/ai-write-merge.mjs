import { sanitizeAiWordCollocations } from "./admin-ai-content-profile.mjs";

export const AI_REPLACE_EXISTING_FIELD = "aiReplaceExisting";

const FILL_ONLY_SCALAR_FIELDS = Object.freeze([
  "phonetic",
  "pos",
  "meaning",
  "meaningDetailZh",
  "definition",
  "example",
  "exampleCn",
  "difficulty",
  "category"
]);

const FILL_ONLY_ARRAY_FIELDS = Object.freeze([
  "otherMeanings",
  "forms",
  "wordFamily",
  "ieltsUse",
  "topics"
]);

function hasText(value) {
  return Boolean(String(value ?? "").trim());
}

function hasItems(value) {
  return Array.isArray(value) && value.length > 0;
}

export function mergeAiWriteWithExisting(existingWord = {}, candidateWord = {}) {
  if (!candidateWord || typeof candidateWord !== "object") return candidateWord;
  if (!Object.prototype.hasOwnProperty.call(candidateWord, AI_REPLACE_EXISTING_FIELD)) {
    return sanitizeAiWordCollocations(candidateWord);
  }

  const replaceExisting = candidateWord[AI_REPLACE_EXISTING_FIELD] === true;
  const next = { ...candidateWord };
  delete next[AI_REPLACE_EXISTING_FIELD];

  if (!replaceExisting && existingWord && typeof existingWord === "object") {
    if (hasText(existingWord.word)) next.word = existingWord.word;

    for (const field of FILL_ONLY_SCALAR_FIELDS) {
      if (hasText(existingWord[field])) next[field] = existingWord[field];
    }

    for (const field of FILL_ONLY_ARRAY_FIELDS) {
      if (hasItems(existingWord[field])) next[field] = existingWord[field];
    }

    const cleanExisting = sanitizeAiWordCollocations(existingWord);
    if (hasItems(cleanExisting?.collocations)) next.collocations = cleanExisting.collocations;
    if (hasItems(cleanExisting?.phraseCollocations)) next.phraseCollocations = cleanExisting.phraseCollocations;
  }

  return sanitizeAiWordCollocations(next);
}

export function mergeAiSnapshotWithExisting(previousWords, candidateWords) {
  if (!Array.isArray(candidateWords)) return candidateWords;
  let changed = false;
  const next = candidateWords.map((candidateWord, index) => {
    const merged = mergeAiWriteWithExisting(previousWords?.[index], candidateWord);
    if (merged !== candidateWord) changed = true;
    return merged;
  });
  return changed ? next : candidateWords;
}
