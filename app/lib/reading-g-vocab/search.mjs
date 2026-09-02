function text(value) {
  return String(value == null ? "" : value).trim().toLowerCase();
}

function relationWord(value) {
  return typeof value === "string"
    ? text(value)
    : text(value?.word || value?.form || value?.key || value?.value);
}

/**
 * Search a compacted G-reading entry by its visible headword, Chinese meaning,
 * or any surface form/progress alias that now belongs to the headword.
 */
export function readingGEntryMatchesSearch(entry, query) {
  return Number.isFinite(getReadingGEntrySearchRank(entry, query));
}

export function getReadingGEntrySearchRank(entry, query) {
  const q = text(query);
  if (!q) return 0;
  const headword = text(entry?.word);
  const meaning = text(entry?.meaning || entry?.primaryMeaningZh || entry?.meaningZh);
  const surfaceForms = [
    ...(Array.isArray(entry?.forms) ? entry.forms : []).map(relationWord),
    ...(Array.isArray(entry?.mergedAliases) ? entry.mergedAliases : []).map(relationWord)
  ];
  if (headword === q) return 0;
  if (surfaceForms.some((value) => value === q)) return 1;
  if (headword.startsWith(q)) return 2;
  if (surfaceForms.some((value) => value.startsWith(q))) return 3;
  if (headword.includes(q)) return 4;
  if (surfaceForms.some((value) => value.includes(q))) return 5;
  if (meaning.includes(q)) return 6;
  return Number.POSITIVE_INFINITY;
}
