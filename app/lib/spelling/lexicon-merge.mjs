import { buildLexiconFingerprint } from "./lexicon-meta.mjs";

export function normalizeEntryKey(entry = {}) {
  return String(entry?.word || entry?.answer || entry?.text || entry?.phrase || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function asWordList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.words)) return payload.words;
  return [];
}

export function asPhraseList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.phrases)) return payload.phrases;
  return [];
}

export function mergeSpellingLexicon(headwords = [], phrases = [], versions = {}) {
  const existing = new Set(headwords.map(normalizeEntryKey));
  const restoredPhrases = phrases.filter((phrase) => {
    const key = normalizeEntryKey(phrase);
    return key && !existing.has(key);
  });
  const allEntries = [...headwords, ...restoredPhrases];
  const fingerprint = buildLexiconFingerprint(headwords, restoredPhrases, {
    headwordVersion: versions.headwordVersion,
    phraseVersion: versions.phraseVersion,
    headwordCount: headwords.length,
    phraseCount: restoredPhrases.length
  });

  return {
    ...fingerprint,
    headwords,
    phrases: restoredPhrases,
    allEntries,
    counts: {
      headwords: headwords.length,
      phrases: restoredPhrases.length,
      total: allEntries.length
    }
  };
}