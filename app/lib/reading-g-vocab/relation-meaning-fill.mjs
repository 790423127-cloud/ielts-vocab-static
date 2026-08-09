import { isReadingGPlaceholderContent } from "./content-completeness.mjs";
import { normalizeReadingGKey } from "./normalize.mjs";

function text(value) {
  return String(value == null ? "" : value).trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function hasUsableText(value) {
  const normalized = text(value);
  return Boolean(normalized && !isReadingGPlaceholderContent(normalized));
}

function relationWord(value) {
  return typeof value === "string"
    ? text(value)
    : text(value?.word || value?.form || value?.value);
}

function entryMeaning(entry) {
  return text(entry?.primaryMeaningZh || entry?.meaningZh || entry?.meaning);
}

/**
 * Fill only relation meanings that can be resolved from an exact local
 * headword. Forms may fall back to the owner's verified meaning because an
 * inflection does not change the lexical sense. Family rows never use that
 * fallback: derivatives can change meaning and must not be guessed.
 */
export function fillReadingGRelationMeanings(items, masterByKey) {
  const knownMeanings = new Map();
  for (const [key, entry] of masterByKey || []) {
    const meaning = entryMeaning(entry);
    if (key && hasUsableText(meaning)) knownMeanings.set(key, meaning);
  }
  for (const entry of list(items)) {
    const key = normalizeReadingGKey(entry?.word);
    const meaning = entryMeaning(entry);
    if (key && hasUsableText(meaning)) knownMeanings.set(key, meaning);
  }

  const stats = {
    entriesChanged: 0,
    formsFilledFromKnownWord: 0,
    formsFilledFromHeadword: 0,
    familiesFilledFromKnownWord: 0,
    stillMissing: 0
  };
  const nextItems = list(items).map((entry) => {
    if ((entry?.entryType || "word") !== "word") return entry;
    let changed = false;
    const headwordMeaning = entryMeaning(entry);
    const forms = list(entry.forms).map((row) => {
      if (hasUsableText(row?.meaning || row?.meaningZh)) return row;
      const word = relationWord(row);
      const knownMeaning = knownMeanings.get(normalizeReadingGKey(word));
      const meaning = knownMeaning || (hasUsableText(headwordMeaning)
        ? `${word}（${text(row?.type) || "相关词形"}）：${headwordMeaning}`
        : "");
      if (!meaning) {
        stats.stillMissing += 1;
        return row;
      }
      changed = true;
      if (knownMeaning) stats.formsFilledFromKnownWord += 1;
      else stats.formsFilledFromHeadword += 1;
      return { ...row, meaning };
    });
    const wordFamily = list(entry.wordFamily).map((row) => {
      if (hasUsableText(row?.meaning || row?.meaningZh)) return row;
      const knownMeaning = knownMeanings.get(normalizeReadingGKey(relationWord(row)));
      if (!knownMeaning) {
        stats.stillMissing += 1;
        return row;
      }
      changed = true;
      stats.familiesFilledFromKnownWord += 1;
      return { ...row, meaning: knownMeaning };
    });
    if (!changed) return entry;
    stats.entriesChanged += 1;
    return {
      ...entry,
      forms,
      wordFamily,
      qualityFlags: [...new Set([
        ...list(entry.qualityFlags).map(text).filter(Boolean),
        "relation_meanings_local_enriched"
      ])]
    };
  });
  return { items: nextItems, stats };
}
