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
    source: "personal-reading",
    supplemental: true,
    addedFromReadingWords: true,
    readingImportCount: Math.max(1, Number(readingWord.importCount) || 1),
    addedAt: cleanText(options.now) || new Date().toISOString()
  };

  return entry;
}

export function reconcileReadingImportsWithMain(
  currentReadingWords,
  incomingWords,
  currentMainWords,
  options = {}
) {
  const now = cleanText(options.now) || new Date().toISOString();
  const importResult = mergeReadingWordImports(currentReadingWords, incomingWords, {
    idFactory: options.readingIdFactory,
    now
  });
  const incomingCounts = new Map();
  for (const item of Array.isArray(incomingWords) ? incomingWords : []) {
    const key = normalizeReadingWordKey(item?.word || item?.headword);
    if (key) incomingCounts.set(key, (incomingCounts.get(key) || 0) + 1);
  }

  const mainWords = Array.isArray(currentMainWords) ? [...currentMainWords] : [];
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

export function needsReadingAiProcessing(readingWord = {}, mainEntry = {}) {
  return isReadingWordIncomplete(readingWord) || isMainEntryClassificationIncomplete(mainEntry);
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
