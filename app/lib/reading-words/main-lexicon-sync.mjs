import {
  isReadingWordIncomplete,
  mergeReadingWordImports,
  normalizeReadingSynonyms,
  normalizeReadingWordKey
} from "./storage.mjs";

const MAIN_TEXT_FIELDS = [
  "phonetic",
  "pos",
  "meaning",
  "meaningDetailZh",
  "definition",
  "example",
  "exampleCn"
];

const MAIN_ARRAY_FIELDS = [
  "otherMeanings",
  "forms",
  "wordFamily"
];

function cleanText(value) {
  return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
}

function createMainWordId(idFactory) {
  if (typeof idFactory === "function") return cleanText(idFactory());
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `personal-reading-${globalThis.crypto.randomUUID()}`;
  }
  return `personal-reading-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function meaningKey(entry = {}) {
  return cleanText(entry?.meaning || entry?.meaningZh || entry?.chineseMeaning)
    .toLowerCase()
    .replace(/[；;，,。.!！?？、\s]+/g, "");
}

function isPersonalReadingMainEntry(entry = {}) {
  return entry?.source === "personal-reading" || entry?.addedFromReadingWords === true;
}

function canonicalizeReadingWordAgainstMain(readingWord = {}, mainWords = [], options = {}) {
  const previousWord = cleanText(readingWord?.word || readingWord?.headword);
  const suggestion = suggestCanonicalReadingHeadword(previousWord, mainWords, readingWord);
  if (!suggestion.corrected) {
    return { readingWord, suggestion, corrected: false };
  }

  return {
    readingWord: {
      ...readingWord,
      word: suggestion.word,
      correctedFrom: cleanText(readingWord.correctedFrom) || previousWord,
      mainWordId: cleanText(
        suggestion.mainEntry?.id || suggestion.mainEntry?.wordId || readingWord.mainWordId
      ),
      updatedAt: cleanText(options.now) || readingWord.updatedAt
    },
    suggestion,
    corrected: true
  };
}

export function applyMainEntryToReadingWord(readingWord = {}, mainEntry = {}, now = "") {
  if (!mainEntry?.word) return readingWord;
  const next = {
    ...readingWord,
    mainWordId: cleanText(mainEntry.id || mainEntry.wordId || mainEntry.word)
  };

  for (const field of ["phonetic", "pos"]) {
    if (cleanText(mainEntry[field])) next[field] = cleanText(mainEntry[field]);
  }
  for (const field of ["meaning", "meaningDetailZh", "definition", "example", "exampleCn"]) {
    if (!cleanText(next[field]) && cleanText(mainEntry[field])) {
      next[field] = cleanText(mainEntry[field]);
    }
  }
  for (const field of MAIN_ARRAY_FIELDS) {
    if (Array.isArray(mainEntry[field]) && mainEntry[field].length) {
      next[field] = mainEntry[field];
    }
  }
  if ((!Array.isArray(next.synonyms) || !next.synonyms.length) && Array.isArray(mainEntry.synonyms)) {
    next.synonyms = normalizeReadingSynonyms(mainEntry.synonyms, next.word);
  }
  next.updatedAt = cleanText(now) || next.updatedAt;
  return next;
}

export function buildPersonalReadingMainEntry(readingWord = {}, options = {}) {
  const usedIds = options.usedIds instanceof Set ? options.usedIds : new Set();
  let id = cleanText(readingWord.mainWordId || readingWord.id || readingWord.wordId);
  if (!id || usedIds.has(id)) id = createMainWordId(options.idFactory);
  usedIds.add(id);

  const entry = {
    id,
    wordId: id,
    word: cleanText(readingWord.word),
    phonetic: cleanText(readingWord.phonetic),
    pos: cleanText(readingWord.pos),
    meaning: cleanText(readingWord.meaning),
    meaningDetailZh: cleanText(readingWord.meaningDetailZh),
    definition: cleanText(readingWord.definition),
    otherMeanings: Array.isArray(readingWord.otherMeanings) ? readingWord.otherMeanings : [],
    example: cleanText(readingWord.example),
    exampleCn: cleanText(readingWord.exampleCn),
    forms: Array.isArray(readingWord.forms) ? readingWord.forms : [],
    wordFamily: Array.isArray(readingWord.wordFamily) ? readingWord.wordFamily : [],
    synonyms: normalizeReadingSynonyms(readingWord.synonyms, readingWord.word),
    formsReviewed: readingWord.formsReviewed === true || Boolean(readingWord.forms?.length),
    wordFamilyReviewed: readingWord.wordFamilyReviewed === true || Boolean(readingWord.wordFamily?.length),
    synonymsReviewed: readingWord.synonymsReviewed === true || Boolean(readingWord.synonyms?.length),
    entryType: "headword",
    source: "personal-reading",
    supplemental: false,
    addedFromReadingWords: true,
    readingImportCount: Math.max(1, Number(readingWord.importCount) || 1),
    addedAt: cleanText(options.now) || new Date().toISOString()
  };

  return entry;
}

export function ensureReadingWordMainEntry(readingWord = {}, currentMainWords = [], options = {}) {
  const mainWords = Array.isArray(currentMainWords) ? currentMainWords : [];
  const canonical = canonicalizeReadingWordAgainstMain(readingWord, mainWords, options);
  const canonicalReadingWord = canonical.readingWord;
  const wordKey = normalizeReadingWordKey(canonicalReadingWord?.word);
  const existingIndex = mainWords.findIndex(
    (entry) => normalizeReadingWordKey(entry?.word) === wordKey
  );
  if (existingIndex >= 0) {
    return {
      mainWords,
      mainEntry: mainWords[existingIndex],
      mainIndex: existingIndex,
      readingWord: canonicalReadingWord,
      corrected: canonical.corrected,
      added: false
    };
  }

  const usedIds = options.usedIds instanceof Set
    ? options.usedIds
    : new Set(
      mainWords.flatMap((entry) => [cleanText(entry?.id), cleanText(entry?.wordId)]).filter(Boolean)
    );
  const mainEntry = buildPersonalReadingMainEntry(canonicalReadingWord, {
    ...options,
    usedIds
  });
  return {
    mainWords: [...mainWords, mainEntry],
    mainEntry,
    mainIndex: mainWords.length,
    readingWord: canonicalReadingWord,
    corrected: canonical.corrected,
    added: true
  };
}

export function backfillReadingWordsIntoMain(
  readingWords = [],
  currentMainWords = [],
  options = {}
) {
  const now = cleanText(options.now) || new Date().toISOString();
  const usedIds = new Set(
    (Array.isArray(currentMainWords) ? currentMainWords : [])
      .flatMap((entry) => [cleanText(entry?.id), cleanText(entry?.wordId)])
      .filter(Boolean)
  );
  let mainWords = Array.isArray(currentMainWords) ? [...currentMainWords] : [];
  let addedToMain = 0;
  let correctedHeadwords = 0;

  const words = (Array.isArray(readingWords) ? readingWords : []).map((readingWord) => {
    if (!normalizeReadingWordKey(readingWord?.word)) return readingWord;
    const ensured = ensureReadingWordMainEntry(readingWord, mainWords, {
      ...options,
      usedIds,
      now
    });
    mainWords = ensured.mainWords;
    if (ensured.added) addedToMain += 1;
    if (ensured.corrected) correctedHeadwords += 1;
    return applyMainEntryToReadingWord(
      ensured.readingWord,
      ensured.mainEntry,
      ensured.added || ensured.corrected ? now : ""
    );
  });

  return {
    words,
    mainWords,
    mainChanged: addedToMain > 0,
    readingChanged: correctedHeadwords > 0,
    correctedHeadwords,
    addedToMain
  };
}

export function buildReadingSynonymDisplay(item, mainEntry = {}) {
  const word = cleanText(
    typeof item === "string"
      ? item
      : item?.word || item?.replacement
  );
  const meaning = cleanText(
    typeof item === "object" && item
      ? item.meaning || item.meaningZh || item.chineseMeaning
      : ""
  ) || cleanText(mainEntry?.meaning || mainEntry?.chineseMeaning);
  return { word, meaning };
}

export function reconcileReadingImportsWithMain(
  currentReadingWords,
  incomingWords,
  currentMainWords,
  options = {}
) {
  const now = cleanText(options.now) || new Date().toISOString();
  const mainWords = Array.isArray(currentMainWords) ? [...currentMainWords] : [];
  let correctedHeadwords = 0;
  const canonicalizeList = (list) => (Array.isArray(list) ? list : []).map((word) => {
    const canonical = canonicalizeReadingWordAgainstMain(word, mainWords, { now });
    if (canonical.corrected) correctedHeadwords += 1;
    return canonical.readingWord;
  });
  const canonicalCurrentWords = canonicalizeList(currentReadingWords);
  const canonicalIncomingWords = canonicalizeList(incomingWords);
  const importResult = mergeReadingWordImports(canonicalCurrentWords, canonicalIncomingWords, {
    idFactory: options.readingIdFactory,
    now
  });
  const incomingCounts = new Map();
  for (const item of canonicalIncomingWords) {
    const key = normalizeReadingWordKey(item?.word || item?.headword);
    if (key) incomingCounts.set(key, (incomingCounts.get(key) || 0) + 1);
  }

  const mainIndexByKey = new Map(
    mainWords.map((entry, index) => [normalizeReadingWordKey(entry?.word), index])
  );
  const usedIds = new Set(
    mainWords.flatMap((entry) => [cleanText(entry?.id), cleanText(entry?.wordId)]).filter(Boolean)
  );
  let reusedMain = 0;
  let addedToMain = 0;
  let mainChanged = false;

  const readingWords = importResult.words.map((readingWord) => {
    const key = normalizeReadingWordKey(readingWord.word);
    const mainIndex = mainIndexByKey.get(key);
    if (mainIndex !== undefined) {
      const mainEntry = mainWords[mainIndex];
      const linked = applyMainEntryToReadingWord(readingWord, mainEntry, now);
      if (incomingCounts.has(key)) {
        const nextCount = Math.max(
          Number(mainEntry.readingImportCount) || 0,
          Number(linked.importCount) || incomingCounts.get(key) || 1
        );
        if (
          nextCount !== Number(mainEntry.readingImportCount || 0) ||
          mainEntry.lastReadingImportedAt !== now
        ) {
          mainWords[mainIndex] = {
            ...mainEntry,
            readingImportCount: nextCount,
            lastReadingImportedAt: now
          };
          mainChanged = true;
        }
        reusedMain += 1;
      }
      return linked;
    }

    if (!incomingCounts.has(key)) return readingWord;
    const addition = buildPersonalReadingMainEntry(readingWord, {
      idFactory: options.mainIdFactory,
      usedIds,
      now
    });
    mainIndexByKey.set(key, mainWords.length);
    mainWords.push(addition);
    addedToMain += 1;
    mainChanged = true;
    return applyMainEntryToReadingWord(readingWord, addition, now);
  });

  return {
    ...importResult,
    words: readingWords,
    mainWords,
    mainChanged,
    readingChanged: correctedHeadwords > 0,
    correctedHeadwords,
    reusedMain,
    addedToMain
  };
}

export function isMainEntryClassificationIncomplete(entry = {}) {
  return !(
    Array.isArray(entry.ieltsUse) &&
    entry.ieltsUse.length &&
    Array.isArray(entry.topics) &&
    entry.topics.length &&
    cleanText(entry.difficulty)
  );
}

function mainEntryCompletenessScore(entry = {}) {
  if (!entry || typeof entry !== "object") return -1;
  let score = 0;
  if (cleanText(entry.pos)) score += 1;
  if (cleanText(entry.meaning)) score += 2;
  if (cleanText(entry.definition)) score += 2;
  if (cleanText(entry.example) && cleanText(entry.exampleCn)) score += 2;
  if (cleanText(entry.difficulty)) score += 1;
  if (Array.isArray(entry.ieltsUse) && entry.ieltsUse.length) score += 1;
  if (Array.isArray(entry.topics) && entry.topics.length) score += 1;
  if (Array.isArray(entry.forms) && entry.forms.length) score += 1;
  if (Array.isArray(entry.wordFamily) && entry.wordFamily.length) score += 1;
  return score;
}

/**
 * Prefer canonical spellings already in the master lexicon.
 * Handles common import/OCR typos such as missing first letter:
 * "ncestors" → "ancestors".
 */
export function suggestCanonicalReadingHeadword(rawWord = "", mainWords = [], readingWord = {}) {
  const previousWord = cleanText(rawWord);
  const key = normalizeReadingWordKey(previousWord);
  if (!key) {
    return { word: previousWord, key: "", corrected: false, mainEntry: null, previousWord };
  }

  const byKey = new Map();
  for (const entry of Array.isArray(mainWords) ? mainWords : []) {
    const entryKey = normalizeReadingWordKey(entry?.word);
    if (!entryKey || byKey.has(entryKey)) continue;
    byKey.set(entryKey, entry);
  }

  let bestKey = key;
  let bestEntry = byKey.get(key) || null;
  let bestScore = mainEntryCompletenessScore(bestEntry);
  const originalEntry = bestEntry;
  const sourceMeaning = meaningKey(readingWord);

  // Never replace a trusted existing headword. Automatic correction is only
  // allowed for a missing entry or a provisional entry created by reading import.
  if (bestEntry && !isPersonalReadingMainEntry(bestEntry)) {
    return { word: cleanText(bestEntry.word), key, corrected: false, mainEntry: bestEntry, previousWord };
  }

  function supportsReadingMeaning(candidateEntry) {
    const candidateMeaning = meaningKey(candidateEntry);
    return Boolean(sourceMeaning && candidateMeaning && sourceMeaning === candidateMeaning);
  }

  // Missing first letter: a+key, b+key, ...
  const prefixedCandidates = [];
  for (let code = 97; code <= 122; code += 1) {
    const candidateKey = `${String.fromCharCode(code)}${key}`;
    const candidateEntry = byKey.get(candidateKey);
    if (!candidateEntry || !supportsReadingMeaning(candidateEntry)) continue;
    prefixedCandidates.push({ candidateKey, candidateEntry });
  }
  if (prefixedCandidates.length === 1) {
    const [{ candidateKey, candidateEntry }] = prefixedCandidates;
    const score = mainEntryCompletenessScore(candidateEntry);
    if (
      score > bestScore ||
      (score === bestScore && candidateKey.length > bestKey.length) ||
      (!originalEntry && score >= 0)
    ) {
      bestKey = candidateKey;
      bestEntry = candidateEntry;
      bestScore = score;
    }
  }

  // Extra first letter on the raw token (rarer).
  if (key.length >= 6) {
    const candidateKey = key.slice(1);
    const candidateEntry = byKey.get(candidateKey);
    if (candidateEntry && supportsReadingMeaning(candidateEntry)) {
      const score = mainEntryCompletenessScore(candidateEntry);
      if (score >= bestScore + 2) {
        bestKey = candidateKey;
        bestEntry = candidateEntry;
        bestScore = score;
      }
    }
  }

  const word = cleanText(bestEntry?.word) || previousWord;
  return {
    word,
    key: bestKey,
    corrected: normalizeReadingWordKey(word) !== key,
    mainEntry: bestEntry,
    previousWord
  };
}

export function needsReadingAiProcessing(readingWord = {}, mainEntry = {}, mainWords = []) {
  return (
    isReadingWordIncomplete(readingWord)
    || isMainEntryClassificationIncomplete(mainEntry)
    || suggestCanonicalReadingHeadword(readingWord?.word, mainWords, readingWord).corrected
  );
}

export function mergeAiProfileIntoMainEntry(mainEntry = {}, profile = {}, options = {}) {
  const next = { ...mainEntry };

  for (const field of MAIN_TEXT_FIELDS) {
    if (!cleanText(next[field]) && cleanText(profile[field])) {
      next[field] = cleanText(profile[field]);
    }
  }
  for (const field of MAIN_ARRAY_FIELDS) {
    if ((!Array.isArray(next[field]) || !next[field].length) && Array.isArray(profile[field])) {
      next[field] = profile[field];
    }
  }
  if ((!Array.isArray(next.synonyms) || !next.synonyms.length) && Array.isArray(profile.synonyms)) {
    next.synonyms = normalizeReadingSynonyms(profile.synonyms, next.word);
  }
  if (Array.isArray(profile.forms)) next.formsReviewed = true;
  if (Array.isArray(profile.wordFamily)) next.wordFamilyReviewed = true;
  if (Array.isArray(profile.synonyms)) next.synonymsReviewed = true;
  if ((!Array.isArray(next.ieltsUse) || !next.ieltsUse.length) && Array.isArray(profile.ieltsUse)) {
    next.ieltsUse = profile.ieltsUse;
  }
  if ((!Array.isArray(next.topics) || !next.topics.length) && Array.isArray(profile.topics)) {
    next.topics = profile.topics;
  }
  if (!cleanText(next.difficulty) && cleanText(profile.difficulty)) {
    next.difficulty = cleanText(profile.difficulty);
  }
  next.updatedAt = cleanText(options.now) || new Date().toISOString();
  return next;
}
