export const AI_CONTENT_FIELDS = Object.freeze([
  "phonetic",
  "pos",
  "meaning",
  "meaningDetailZh",
  "definition",
  "otherMeanings",
  "example",
  "exampleCn",
  "collocations",
  "phraseCollocations",
  "ieltsUse",
  "topics",
  "difficulty",
  "category",
  "forms",
  "wordFamily",
  "aiContentProfile",
  "aiGenerated",
  "generatedAt",
  "cachedAt",
  "source",
  "aiMergeMode"
]);

export const USER_STATE_FIELDS = Object.freeze([
  "status",
  "favorite",
  "reviewCount",
  "correctCount",
  "wrongCount",
  "mastery",
  "lastReviewedAt",
  "learningProgress"
]);

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(String(value ?? "").trim());
}

export function scoreAiContentPackage(word = {}) {
  let score = 0;
  for (const field of AI_CONTENT_FIELDS) {
    if (hasValue(word[field])) score += field === "aiContentProfile" ? 4 : 1;
  }
  return score;
}

export function pickPreferredAiContentPackage(first = {}, second = {}) {
  return scoreAiContentPackage(second) > scoreAiContentPackage(first) ? second : first;
}

export function copyFields(source = {}, fields = []) {
  const result = {};
  for (const field of fields) {
    if (source[field] !== undefined) result[field] = source[field];
  }
  return result;
}
