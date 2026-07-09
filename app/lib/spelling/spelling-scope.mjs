export const SPELLING_SCOPES = ["word", "phrase"];

export const SPELLING_SCOPE_LABELS = {
  word: "单词",
  phrase: "词组"
};

export const SPELLING_SCOPE_ENTRY_MODES = {
  word: "headwords",
  phrase: "phrases"
};

export const SPELLING_SCOPE_ROUTES = {
  word: "/spelling-words",
  phrase: "/spelling-phrases"
};

export function normalizeSpellingScope(scope = "word") {
  const value = String(scope || "word").trim().toLowerCase();
  if (value === "words" || value === "headword" || value === "headwords") return "word";
  if (value === "phrases" || value === "phrase") return "phrase";
  return SPELLING_SCOPES.includes(value) ? value : "word";
}

export function resolveSpellingScope(scope = "word") {
  const normalized = normalizeSpellingScope(scope);
  const entryMode = SPELLING_SCOPE_ENTRY_MODES[normalized];

  return {
    scope: normalized,
    entryMode,
    label: SPELLING_SCOPE_LABELS[normalized],
    route: SPELLING_SCOPE_ROUTES[normalized],
    stores: {
      spellingProgress: normalized === "phrase" ? "phrase-spelling-progress" : "word-spelling-progress",
      errorBank: normalized === "phrase" ? "phrase-error-bank" : "word-error-bank",
      todayRepairQueue: normalized === "phrase" ? "phrase-today-repair-queue" : "word-today-repair-queue",
      srsReviewQueue: normalized === "phrase" ? "phrase-srs" : "word-srs"
    }
  };
}

export function getScopeStorageKey(scope = "word") {
  return `ielts-vocab:spelling-category:${normalizeSpellingScope(scope)}`;
}

export function getScopeRangeUiKey(scope = "word") {
  return `ielts-vocab:spelling-range-expanded:${normalizeSpellingScope(scope)}`;
}