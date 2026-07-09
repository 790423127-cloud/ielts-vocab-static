import { normalizeSpellingEntry } from "./normalize-spelling-entry.mjs";
import { getWordId } from "./word-id.mjs";

export function mergeDueSrsRecords(srsRecords = [], lexiconEntries = []) {
  const entryMap = new Map();

  for (const entry of Array.isArray(lexiconEntries) ? lexiconEntries : []) {
    const wordId = getWordId(entry);
    if (wordId) entryMap.set(wordId, entry);
  }

  return (Array.isArray(srsRecords) ? srsRecords : [])
    .map((srs) => {
      const source = entryMap.get(srs?.wordId);
      if (!source) return null;
      return {
        ...source,
        ...normalizeSpellingEntry(source),
        srs: {
          stage: Number(srs.stage || 0),
          nextReviewAt: Number(srs.nextReviewAt || 0),
          lastReviewedAt: Number(srs.lastReviewedAt || 0)
        }
      };
    })
    .filter(Boolean)
    .sort((left, right) => Number(left.srs.nextReviewAt || 0) - Number(right.srs.nextReviewAt || 0));
}

export function srsReviewEntriesToSpellingCandidates(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const { srs, ...entry } = item;
    return entry;
  });
}
