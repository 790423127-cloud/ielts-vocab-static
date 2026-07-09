function normalizeWordForId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, " ");
}

function hashText(value) {
  let hash = 2166136261;
  const text = String(value || "");

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function textForWordId(word) {
  if (word && typeof word === "object") {
    return normalizeWordForId(
      word.word ||
      word.answer ||
      word.text ||
      word.phrase ||
      ""
    );
  }

  return normalizeWordForId(word);
}

export function getWordId(word) {
  if (word && typeof word === "object") {
    const existing = word.wordId || word.id;
    if (existing) return String(existing);

    const normalized = textForWordId(word);
    return normalized
      ? `word_${hashText(normalized)}_${normalized.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48)}`
      : "";
  }

  const normalized = textForWordId(word);
  return normalized
    ? `word_${hashText(normalized)}_${normalized.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48)}`
    : "";
}

export function normalizeSpellingAnswer(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, " ");
}

export function isInternalSpellingIdentifier(value = "") {
  const text = String(value || "").trim();
  if (!text) return false;

  return /^personal_wrong_(?:word|phrase|local)[a-z0-9_:.-]*$/i.test(text) ||
    /:(?:same|base|plural|write|restored-wrong)-\d+$/i.test(text);
}
