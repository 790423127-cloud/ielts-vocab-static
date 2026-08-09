import {
  filterDistinctSynonymTerms,
  synonymEquivalenceKey
} from "../vocab/synonym-equivalence.mjs";

export const READING_G_SYNONYM_LIMIT = 4;

export const READING_G_SYNONYM_STATUS = Object.freeze({
  AVAILABLE: "available",
  PENDING: "pending",
  REVIEWED_NONE: "reviewed-none"
});

export function normalizeReadingGSynonyms(value, headword = "") {
  return filterDistinctSynonymTerms(value, headword, {
    max: READING_G_SYNONYM_LIMIT
  });
}

function text(value) {
  return String(value == null ? "" : value).trim();
}

function synonymDetailWord(value) {
  return typeof value === "string" ? value : value?.word || value?.replacement;
}

function normalizeSynonymDetail(value, word) {
  return {
    word,
    pos: text(value?.pos || value?.primaryPos),
    meaningZh: text(value?.meaningZh || value?.primaryMeaningZh || value?.meaning)
  };
}

export function normalizeReadingGSynonymDetails(value, headword = "", synonyms = []) {
  const words = normalizeReadingGSynonyms(synonyms, headword);
  const detailsByWord = new Map();
  for (const detail of Array.isArray(value) ? value : []) {
    const detailWord = text(synonymDetailWord(detail));
    if (!detailWord) continue;
    const key = synonymEquivalenceKey(detailWord);
    if (key && !detailsByWord.has(key)) detailsByWord.set(key, detail);
  }
  return words.map((word) => (
    normalizeSynonymDetail(detailsByWord.get(synonymEquivalenceKey(word)), word)
  ));
}

export function getReadingGSynonymStatus(entry = {}) {
  const words = normalizeReadingGSynonyms(entry.synonyms, entry.word);
  if (words.length) {
    return {
      state: READING_G_SYNONYM_STATUS.AVAILABLE,
      words,
      details: normalizeReadingGSynonymDetails(entry.synonymDetails, entry.word, words),
      source: String(entry.synonymsReviewSource || "").trim()
    };
  }
  if (entry.synonymsReviewed === true) {
    return {
      state: READING_G_SYNONYM_STATUS.REVIEWED_NONE,
      words: [],
      details: [],
      source: String(entry.synonymsReviewSource || "").trim()
    };
  }
  return {
    state: READING_G_SYNONYM_STATUS.PENDING,
    words: [],
    details: [],
    source: ""
  };
}
