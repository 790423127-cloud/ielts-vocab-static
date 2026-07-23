import {
  normalizeAiForms,
  normalizeAiPhraseItems,
  normalizeAiWordFamily,
  normalizeOtherMeanings
} from "./admin-ai-content-profile.mjs";

const RECOVERABLE_SCALAR_FIELDS = Object.freeze([
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

const RECOVERABLE_ARRAY_FIELDS = Object.freeze([
  "otherMeanings",
  "forms",
  "wordFamily",
  "collocations",
  "phraseCollocations",
  "ieltsUse",
  "topics"
]);

const USER_STATE_FIELDS = Object.freeze([
  "status",
  "favorite",
  "lastReviewedAt",
  "reviewCount",
  "correctCount",
  "wrongCount",
  "mastery",
  "learningProgress"
]);

const PLACEHOLDER_RE = /^(?:-|—|n\/?a|none|null|unknown|待补充|待完善|暂无|无|未分类|未填写|to be completed)$/i;

export function normalizeRecoveryWord(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ");
}

export function isInflectedReferenceForRecovery(word) {
  if (!word) return false;
  if (word.entryType === "inflected-form" && word.studyMode === "reference") return true;
  return Boolean(
    word.studyMode === "reference" &&
    (word.baseWord || word.baseWordId || word.redirectToWord) &&
    /(?:plural|past tense|past participle|present participle|comparative|superlative|third-person|inflected form)/i.test(String(word.relationType || ""))
  );
}

export function hasUsefulScalar(value) {
  const text = String(value ?? "").trim();
  return Boolean(text) && !PLACEHOLDER_RE.test(text);
}

export function hasUsefulArray(value) {
  return Array.isArray(value) && value.some((item) => {
    if (typeof item === "string") return hasUsefulScalar(item);
    if (!item || typeof item !== "object") return false;
    return hasUsefulScalar(item.phrase || item.text || item.collocation || item.word || item.chinese || item.meaning || item.translation);
  });
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const text = String(item || "").trim();
    const key = normalizeRecoveryWord(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

export function normalizeCachedRecoveryEntry(entry = {}, fallbackWord = "") {
  const word = String(entry.word || fallbackWord || "").trim();
  const meaning = String(entry.chinese_meaning || entry.meaning || "").trim();
  return {
    word,
    phonetic: String(entry.phonetic || "").trim(),
    pos: String(entry.part_of_speech || entry.pos || "").trim(),
    meaning,
    meaningDetailZh: String(entry.main_meaning_detail_zh || entry.meaningDetailZh || entry.meaning_detail_zh || "").trim(),
    definition: String(entry.english_definition || entry.definition || "").trim(),
    otherMeanings: normalizeOtherMeanings(entry.other_meanings || entry.otherMeanings, meaning),
    example: String(entry.ielts_example || entry.example || "").trim(),
    exampleCn: String(entry.example_chinese || entry.exampleCn || "").trim(),
    forms: normalizeAiForms(entry.forms, word),
    wordFamily: normalizeAiWordFamily(entry.word_family || entry.wordFamily, word),
    collocations: normalizeAiPhraseItems(entry.common_collocations || entry.collocations || entry.commonCollocations),
    phraseCollocations: normalizeAiPhraseItems(entry.phrase_collocations || entry.phraseCollocations || entry.prepositional_phrases),
    ieltsUse: normalizeStringArray(entry.ielts_use || entry.ieltsUse),
    topics: normalizeStringArray(entry.topics || entry.topic),
    difficulty: String(entry.difficulty || "").trim(),
    category: String(entry.category || "").trim(),
    generatedAt: String(entry.generatedAt || "").trim(),
    cachedAt: Number(entry.cachedAt || 0) || 0
  };
}

export function mergeCachedEntryIntoWord(word, cacheEntry) {
  const next = { ...word };
  const changedFields = [];

  for (const field of RECOVERABLE_SCALAR_FIELDS) {
    if (!hasUsefulScalar(next[field]) && hasUsefulScalar(cacheEntry[field])) {
      next[field] = cacheEntry[field];
      changedFields.push(field);
    }
  }

  for (const field of RECOVERABLE_ARRAY_FIELDS) {
    if (!hasUsefulArray(next[field]) && hasUsefulArray(cacheEntry[field])) {
      next[field] = cacheEntry[field];
      changedFields.push(field);
    }
  }

  return { next, changedFields };
}

export function buildDeepseekCacheRecoveryPlan(words = [], cacheObject = {}, options = {}) {
  const since = String(options.since || "").trim();
  const byWord = new Map();
  for (let index = 0; index < words.length; index += 1) {
    const key = normalizeRecoveryWord(words[index]?.word);
    if (key && !byWord.has(key)) byWord.set(key, { index, word: words[index] });
  }

  const nextWords = words.map((word) => ({ ...word }));
  const results = [];

  for (const [cacheKey, rawEntry] of Object.entries(cacheObject || {})) {
    const entry = normalizeCachedRecoveryEntry(rawEntry, cacheKey);
    if (since && (!entry.generatedAt || !entry.generatedAt.startsWith(since))) continue;

    const key = normalizeRecoveryWord(entry.word || cacheKey);
    if (!key) {
      results.push({ status: "INVALID_CACHE_ENTRY", cacheKey, reason: "missing word" });
      continue;
    }

    const match = byWord.get(key);
    if (!match) {
      results.push({ status: "NOT_FOUND", cacheKey, word: entry.word || cacheKey });
      continue;
    }

    if (isInflectedReferenceForRecovery(match.word)) {
      results.push({
        status: "SKIP_INFLECTED_REFERENCE",
        cacheKey,
        word: match.word.word,
        id: match.word.id || match.word.wordId || ""
      });
      continue;
    }

    const beforeState = Object.fromEntries(USER_STATE_FIELDS.map((field) => [field, match.word?.[field]]));
    const merged = mergeCachedEntryIntoWord(match.word, entry);
    const afterState = Object.fromEntries(USER_STATE_FIELDS.map((field) => [field, merged.next?.[field]]));
    const stateChanged = JSON.stringify(beforeState) !== JSON.stringify(afterState);
    const idChanged = String(merged.next.id || merged.next.wordId || "") !== String(match.word.id || match.word.wordId || "");
    const wordChanged = normalizeRecoveryWord(merged.next.word) !== normalizeRecoveryWord(match.word.word);

    if (stateChanged || idChanged || wordChanged) {
      results.push({
        status: "MATCHED_CONFLICT",
        cacheKey,
        word: match.word.word,
        id: match.word.id || match.word.wordId || "",
        reason: "protected field changed"
      });
      continue;
    }

    if (!merged.changedFields.length) {
      results.push({
        status: "MATCHED_NO_CHANGE",
        cacheKey,
        word: match.word.word,
        id: match.word.id || match.word.wordId || ""
      });
      continue;
    }

    nextWords[match.index] = merged.next;
    results.push({
      status: "MATCHED_CAN_FILL",
      cacheKey,
      word: match.word.word,
      id: match.word.id || match.word.wordId || "",
      changedFields: merged.changedFields,
      generatedAt: entry.generatedAt,
      cachedAt: entry.cachedAt
    });
  }

  const counts = {};
  for (const result of results) counts[result.status] = (counts[result.status] || 0) + 1;

  return {
    words: nextWords,
    results,
    counts,
    changedWords: results.filter((item) => item.status === "MATCHED_CAN_FILL").length,
    changedFields: results.reduce((total, item) => total + (item.changedFields?.length || 0), 0)
  };
}

export const RECOVERY_PROTECTED_USER_STATE_FIELDS = USER_STATE_FIELDS;
