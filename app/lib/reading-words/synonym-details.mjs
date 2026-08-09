import {
  filterDistinctSynonymTerms,
  synonymEquivalenceKey
} from "../vocab/synonym-equivalence.mjs";

function text(value) {
  return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
}

function synonymWord(value) {
  return text(typeof value === "string" ? value : value?.word || value?.replacement);
}

function synonymMeaning(value) {
  return text(value?.meaningZh || value?.meaning || value?.chineseMeaning);
}

function normalizeDetail(value, fallbackWord = "") {
  const word = synonymWord(value) || text(fallbackWord);
  const meaningZh = synonymMeaning(value);
  if (!word || !meaningZh) return null;
  return {
    word,
    pos: text(value?.pos || value?.primaryPos),
    meaningZh
  };
}

function detailIndex(values = []) {
  const index = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    const detail = normalizeDetail(value);
    const key = synonymEquivalenceKey(detail?.word);
    if (key && detail && !index.has(key)) index.set(key, detail);
  }
  return index;
}

export function normalizeReadingSynonymDetails(value, synonyms = [], headword = "") {
  const words = filterDistinctSynonymTerms(synonyms, headword, { max: 8 });
  const byWord = detailIndex(value);
  return words
    .map((word) => {
      const detail = byWord.get(synonymEquivalenceKey(word));
      return detail ? { ...detail, word } : null;
    })
    .filter(Boolean);
}

export function hasCompleteReadingSynonymDetails(entry = {}) {
  const words = filterDistinctSynonymTerms(entry?.synonyms, entry?.word, { max: 8 });
  if (!words.length) return true;
  const details = detailIndex([
    ...(Array.isArray(entry?.synonymDetails) ? entry.synonymDetails : []),
    ...(Array.isArray(entry?.synonyms) ? entry.synonyms : [])
  ]);
  return words.every((word) => details.has(synonymEquivalenceKey(word)));
}

function buildMainDetailIndex(mainWords = []) {
  const index = new Map();
  for (const entry of Array.isArray(mainWords) ? mainWords : []) {
    const key = synonymEquivalenceKey(entry?.word);
    const detail = normalizeDetail({
      word: entry?.word,
      pos: entry?.pos || entry?.primaryPos,
      meaningZh: entry?.meaning || entry?.meaningZh || entry?.chineseMeaning
    });
    if (key && detail && !index.has(key)) index.set(key, detail);
  }
  return index;
}

function buildCompletionIndex(completionEntries = {}) {
  const records = Array.isArray(completionEntries)
    ? completionEntries
    : Object.values(completionEntries && typeof completionEntries === "object" ? completionEntries : {});
  const index = new Map();
  for (const record of records) {
    const headwordKey = synonymEquivalenceKey(record?.word);
    if (!headwordKey) continue;
    if (!index.has(headwordKey)) index.set(headwordKey, []);
    index.get(headwordKey).push(record);
  }
  return index;
}

function resolveCompletionDetail(records, word) {
  const targetKey = synonymEquivalenceKey(word);
  const matches = [];
  for (const record of Array.isArray(records) ? records : []) {
    for (const value of Array.isArray(record?.synonymDetails) ? record.synonymDetails : []) {
      const detail = normalizeDetail(value);
      if (detail && synonymEquivalenceKey(detail.word) === targetKey) matches.push(detail);
    }
  }
  const meanings = [...new Set(matches.map((detail) => detail.meaningZh))];
  if (meanings.length !== 1) return null;
  return matches.find((detail) => detail.meaningZh === meanings[0]) || null;
}

export function enrichReadingWordsSynonymDetails(readingWords = [], options = {}) {
  const mainIndex = buildMainDetailIndex(options.mainWords);
  const completionIndex = buildCompletionIndex(options.completionEntries);
  let changed = false;
  const words = (Array.isArray(readingWords) ? readingWords : []).map((entry) => {
    const synonyms = filterDistinctSynonymTerms(entry?.synonyms, entry?.word, { max: 8 });
    if (!synonyms.length) return entry;

    const existing = detailIndex([
      ...(Array.isArray(entry?.synonymDetails) ? entry.synonymDetails : []),
      ...(Array.isArray(entry?.synonyms) ? entry.synonyms : [])
    ]);
    const completionRecords = completionIndex.get(synonymEquivalenceKey(entry?.word)) || [];
    const synonymDetails = synonyms
      .map((word) => {
        const key = synonymEquivalenceKey(word);
        const detail = existing.get(key)
          || mainIndex.get(key)
          || resolveCompletionDetail(completionRecords, word);
        return detail ? { ...detail, word } : null;
      })
      .filter(Boolean);
    const previous = normalizeReadingSynonymDetails(entry?.synonymDetails, synonyms, entry?.word);
    if (JSON.stringify(previous) === JSON.stringify(synonymDetails)) return entry;
    changed = true;
    return { ...entry, synonymDetails };
  });
  return { words, changed };
}

export function applyReadingSynonymDetailPatches(readingWords = [], patches = []) {
  const byId = new Map();
  const byWord = new Map();
  for (const patch of Array.isArray(patches) ? patches : []) {
    const id = text(patch?.id || patch?.wordId);
    const wordKey = synonymEquivalenceKey(patch?.word);
    if (id) byId.set(id, patch);
    if (wordKey) byWord.set(wordKey, patch);
  }
  let changed = false;
  const words = (Array.isArray(readingWords) ? readingWords : []).map((entry) => {
    const patch = byId.get(text(entry?.id || entry?.wordId))
      || byWord.get(synonymEquivalenceKey(entry?.word));
    if (!patch) return entry;
    const merged = enrichReadingWordsSynonymDetails([{
      ...entry,
      synonymDetails: [
        ...(Array.isArray(entry?.synonymDetails) ? entry.synonymDetails : []),
        ...(Array.isArray(patch?.synonymDetails) ? patch.synonymDetails : [])
      ]
    }]).words[0];
    if (merged === entry || JSON.stringify(merged?.synonymDetails || []) === JSON.stringify(entry?.synonymDetails || [])) {
      return entry;
    }
    changed = true;
    return merged;
  });
  return { words, changed };
}
