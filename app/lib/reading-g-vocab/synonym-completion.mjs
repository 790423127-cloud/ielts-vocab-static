import { normalizeReadingGKey } from "./normalize.mjs";
import {
  isReadingGSynonymReviewCurrent,
  normalizeReadingGSynonymDetails,
  normalizeReadingGSynonyms,
  READING_G_SYNONYM_REVIEW_POLICY
} from "./synonym-relations.mjs";

export const READING_G_SYNONYM_COMPLETION_SOURCE =
  "public/data/reading-g-synonym-completions.json";

function text(value) {
  return String(value == null ? "" : value).trim();
}

function profileKey(value) {
  return String(value || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

export function isReadingGSynonymSupportedEntry(entry) {
  const entryType = String(entry?.entryType || "word").trim();
  return (entryType === "word" || entryType === "phrase")
    && entry?.studyMode !== "reference";
}

export function isReadingGSynonymCompletionCandidate(entry) {
  return Boolean(
    entry
    && isReadingGSynonymSupportedEntry(entry)
    && !isReadingGSynonymReviewCurrent(entry)
  );
}

export function buildReadingGSynonymCompletedEntry(entry, review, options = {}) {
  if (!isReadingGSynonymCompletionCandidate(entry)) {
    throw new Error("只允许补全待审核的G类单词或短语同义替换");
  }
  const word = text(entry.word);
  if (profileKey(review?.word) !== profileKey(word)) {
    throw new Error(`同义替换返回词头不一致：${word} → ${text(review?.word) || "(empty)"}`);
  }
  if (!Array.isArray(review?.synonyms)) {
    throw new Error(`同义替换未返回明确数组：${word}`);
  }

  const source = options.source === "ai-cache" ? "ai-cache" : "deepseek";
  const reviewedAt = text(options.reviewedAt || new Date().toISOString());
  const synonyms = normalizeReadingGSynonyms(review.synonyms, word);
  const synonymDetails = normalizeReadingGSynonymDetails(
    review.synonymDetails,
    word,
    synonyms
  );
  return {
    ...entry,
    normalizedKey: entry.normalizedKey || normalizeReadingGKey(word),
    synonyms,
    synonymDetails,
    synonymsReviewed: true,
    synonymsReviewSource: source,
    synonymsReviewedAt: reviewedAt,
    synonymsReviewPolicy: READING_G_SYNONYM_REVIEW_POLICY,
    sourceFiles: unique([
      ...list(entry.sourceFiles),
      READING_G_SYNONYM_COMPLETION_SOURCE
    ])
  };
}
