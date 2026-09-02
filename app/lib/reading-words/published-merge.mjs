import {
  normalizeReadingWord,
  normalizeReadingWordKey
} from "./storage.mjs";

const USER_PROGRESS_FIELDS = [
  "status",
  "lastReviewedAt",
  "favorite",
  "readingStatus",
  "importCount",
  "highFrequency",
  "firstImportedAt",
  "lastImportedAt",
  "createdAt"
];

const USER_CONTEXT_FIELDS = [
  "readingMeaning",
  "readingContextPending",
  "readingContextReviewed",
  "readingContextReviewSource",
  "readingContextReviewedAt",
  "readingNote",
  "readingSources"
];

function cleanText(value) {
  return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
}

function stableIds(entry = {}) {
  return new Set(
    [entry.id, entry.wordId]
      .map(cleanText)
      .filter(Boolean)
  );
}

function aliasKey(value) {
  if (typeof value === "string") return normalizeReadingWordKey(value);
  if (value && typeof value === "object") {
    return normalizeReadingWordKey(value.word || value.headword || value.alias);
  }
  return "";
}

function publishedAliasKeys(entry = {}) {
  return new Set(
    [
      entry.correctedFrom,
      ...(Array.isArray(entry.legacyHeadwords) ? entry.legacyHeadwords : []),
      ...(Array.isArray(entry.mergedAliases) ? entry.mergedAliases : [])
    ]
      .map(aliasKey)
      .filter(Boolean)
  );
}

function hasSharedStableId(left = {}, right = {}) {
  const rightIds = stableIds(right);
  return [...stableIds(left)].some((id) => rightIds.has(id));
}

function copyFields(target, source, fields) {
  const next = { ...target };
  for (const field of fields) next[field] = source[field];
  return next;
}

/**
 * Reconciles the published reading notebook with browser-local state.
 *
 * A historic OCR/selection repair can change a published headword while the
 * browser still has the old fragment under the same stable ID.  Matching by
 * raw word alone appends that fragment as a second card after it is
 * canonicalised.  Here we resolve canonical word, stable ID, and published
 * aliases in one pass.  Progress survives; teaching content always stays
 * with the published canonical card when a legacy alias was involved.
 */
export function mergePublishedReadingWordsWithLocal(publishedWords, localWords) {
  const localByKey = new Map();
  for (const raw of Array.isArray(localWords) ? localWords : []) {
    const local = normalizeReadingWord(raw);
    const key = normalizeReadingWordKey(local.word);
    if (key) localByKey.set(key, local);
  }
  const locals = [...localByKey.entries()].map(([key, entry]) => ({ key, entry }));
  const usedLocalKeys = new Set();

  const merged = (Array.isArray(publishedWords) ? publishedWords : []).map((published) => {
    const canonical = normalizeReadingWord(published);
    const canonicalKey = normalizeReadingWordKey(canonical.word);
    const aliases = publishedAliasKeys(published);
    const directMatches = locals.filter((local) => local.key === canonicalKey);
    const idMatches = locals.filter((local) => hasSharedStableId(local.entry, published));
    const aliasMatches = locals.filter((local) => aliases.has(local.key));
    const matches = [...new Map(
      [...directMatches, ...idMatches, ...aliasMatches].map((local) => [local.key, local])
    ).values()];

    for (const local of matches) usedLocalKeys.add(local.key);
    if (!matches.length) return canonical;

    const local = directMatches.at(-1)?.entry
      || idMatches.at(-1)?.entry
      || aliasMatches.at(-1)?.entry;
    const includesLegacyHeadword = matches.some((item) => item.key !== canonicalKey);
    let next = copyFields(canonical, local, USER_PROGRESS_FIELDS);
    // Passage context belongs to the local learner only if the local card has
    // always referred to this exact headword.  For an old fragment such as
    // cam -> campus, retaining it would reintroduce the obsolete meaning.
    if (!includesLegacyHeadword) {
      next = copyFields(next, local, USER_CONTEXT_FIELDS);
    }
    return normalizeReadingWord(next);
  });

  // Keep unpublished local additions, but never append a fragment or a
  // duplicate that was consumed by a published card through its stable ID.
  for (const local of locals) {
    if (!usedLocalKeys.has(local.key)) merged.push(local.entry);
  }
  return merged;
}
