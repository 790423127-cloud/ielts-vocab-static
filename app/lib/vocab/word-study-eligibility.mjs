export function isInflectedReferenceWord(word) {
  if (!word || typeof word !== "object") return false;
  if (word.entryType === "inflected-form") return true;
  if (word.morphologyReview?.action === "SAFE_FORM_MERGE") return true;
  return Boolean(
    word.studyMode === "reference" &&
    word.relationType &&
    (word.baseWord || word.baseWordId || word.redirectToWord)
  );
}

export function isBrushableWord(word) {
  return !isInflectedReferenceWord(word);
}

export function resolveInflectedReferenceIndex(words, index, normalizeWord = defaultNormalizeWord) {
  const list = Array.isArray(words) ? words : [];
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return -1;

  const entry = list[index];
  if (!isInflectedReferenceWord(entry)) return index;

  const baseKey = normalizeWord(entry.baseWord || entry.redirectToWord || "");
  if (!baseKey) return -1;

  return list.findIndex((word) => {
    if (!isBrushableWord(word)) return false;
    return normalizeWord(word?.word) === baseKey;
  });
}

function defaultNormalizeWord(value) {
  return String(value || "").trim().toLowerCase();
}
