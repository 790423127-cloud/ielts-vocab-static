function normalizeWordKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ");
}

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeMeaningKey(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[，,；;。.!！、：:\s]/g, "");
}

function collectOriginalMeanings(entry) {
  const values = [
    entry?.meaning,
    entry?.definition,
    ...(Array.isArray(entry?.otherMeanings)
      ? entry.otherMeanings.map((item) =>
          typeof item === "string"
            ? item
            : item?.meaningZh || item?.meaning || item?.chinese || ""
        )
      : [])
  ];
  const seen = new Set();

  return values
    .map(cleanText)
    .filter((meaning) => {
      const key = normalizeMeaningKey(meaning);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

export function buildIelts538SynonymDetailIndex(masterWords) {
  return new Map(
    (Array.isArray(masterWords) ? masterWords : [])
      .map((entry) => {
        const word = normalizeWordKey(entry?.word);
        const meanings = collectOriginalMeanings(entry);
        if (!word || !meanings.length) return null;
        return [
          word,
          {
            pos: cleanText(entry?.pos),
            originalMeaning: meanings.join("；")
          }
        ];
      })
      .filter(Boolean)
  );
}

export function applyIelts538SynonymDetails(words, detailIndex) {
  return (Array.isArray(words) ? words : []).map((entry) => {
    const candidates = [
      ...(Array.isArray(entry?.synonyms) ? entry.synonyms : []),
      ...(Array.isArray(entry?.paraphraseExamples)
        ? entry.paraphraseExamples.map((pair) => pair?.replacement)
        : [])
    ];
    const synonymDetails = {};

    for (const candidate of candidates) {
      const replacement = cleanText(candidate);
      if (!replacement || Object.hasOwn(synonymDetails, replacement)) continue;
      const original = detailIndex.get(normalizeWordKey(replacement));
      synonymDetails[replacement] = {
        pos: original?.pos || (replacement.includes(" ") ? "phrase" : ""),
        originalMeaning: original?.originalMeaning || "",
        contextualMeaning: cleanText(entry?.meaning)
      };
    }

    return {
      ...entry,
      synonymDetails
    };
  });
}
