import {
  filterDistinctSynonymTerms,
  synonymEquivalenceKey
} from "../vocab/synonym-equivalence.mjs";

// A replacement list is a learning aid, not a thesaurus dump: show direct
// single-word replacements first, then only the most useful phrase rewrites.
export const READING_G_SYNONYM_LIMIT = 5;
export const READING_G_SYNONYM_REVIEW_POLICY = "g-replacement-v2-words-first-phrases";

export const READING_G_SYNONYM_STATUS = Object.freeze({
  AVAILABLE: "available",
  PENDING: "pending",
  REVIEWED_NONE: "reviewed-none"
});

export function normalizeReadingGSynonyms(value, headword = "") {
  const distinct = filterDistinctSynonymTerms(value, headword, {
    max: Number.MAX_SAFE_INTEGER
  });
  return distinct
    .map((word, index) => ({ word, index, isPhrase: /\s/.test(word) }))
    .sort((left, right) => Number(left.isPhrase) - Number(right.isPhrase) || left.index - right.index)
    .slice(0, READING_G_SYNONYM_LIMIT)
    .map((item) => item.word);
}

function text(value) {
  return String(value == null ? "" : value).trim();
}

function synonymDetailWord(value) {
  return typeof value === "string" ? value : value?.word || value?.replacement;
}

function normalizeSynonymDetail(value, word) {
  const declaredType = text(value?.replacementType || value?.replacement_type).toLowerCase();
  const replacementType = declaredType === "phrase" || /\s/.test(word) ? "phrase" : "word";
  return {
    word,
    pos: text(value?.pos || value?.primaryPos),
    meaningZh: text(value?.meaningZh || value?.primaryMeaningZh || value?.meaning),
    ...(replacementType === "phrase" ? { replacementType } : {})
  };
}

export function isReadingGSynonymReviewCurrent(entry = {}) {
  return String(entry?.synonymsReviewPolicy || "").trim() === READING_G_SYNONYM_REVIEW_POLICY;
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
