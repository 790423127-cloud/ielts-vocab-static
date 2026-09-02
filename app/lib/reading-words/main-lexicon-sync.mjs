import {
  isReadingWordIncomplete,
  mergeReadingWordImports,
  normalizeReadingSynonyms,
  normalizeReadingWordKey
} from "./storage.mjs";
import { getStudyEntryDisplay } from "../vocab/study-entry-display.mjs";
import { normalizeReadingSynonymDetails } from "./synonym-details.mjs";
import { needsMeaningCoverageReview } from "../vocab/meaning-coverage-audit.mjs";
import { isMeaningDetailInformative } from "../vocab/meaning-display.mjs";
import {
  classifySurfaceInflection,
  normalizeSurfaceWord
} from "../vocab/word-surface-morphology.mjs";
import {
  CONFIRMED_PERSON_NAME_WORDS,
  normalizeHeadword
} from "../vocab/lexicon-guard-shared.mjs";

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
  "wordFamily",
  "synonymDetails",
  "collocations",
  "phraseCollocations",
  "senses"
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

export function shouldKeepReadingWordLocal(readingWord = {}) {
  const word = normalizeHeadword(readingWord?.word);
  if (!word) return true;
  if (CONFIRMED_PERSON_NAME_WORDS.has(word)) return true;
  if (
    readingWord?.entryType === "phrase" ||
    readingWord?.isPhrase === true ||
    /\bphrase\b/i.test(cleanText(readingWord?.pos))
  ) return true;
  const tokens = word.split(" ").filter(Boolean);
  if (tokens.length >= 8) return true;
  if (word.length >= 48 && /[.!?'’“”]/.test(word)) return true;
  return false;
}

function meaningKey(entry = {}) {
  return cleanText(entry?.meaning || entry?.meaningZh || entry?.chineseMeaning)
    .toLowerCase()
    .replace(/[；;，,。.!！?？、\s]+/g, "");
}

function isPersonalReadingMainEntry(entry = {}) {
  return entry?.source === "personal-reading" || entry?.addedFromReadingWords === true;
}

function addMainEntryToLookup(lookup, entry, index, { replace = false } = {}) {
  if (!lookup?.byKey || !lookup?.byId || !entry || !Number.isInteger(index)) return;
  const location = { entry, index };
  const wordKey = normalizeReadingWordKey(entry.word);
  if (wordKey && (replace || !lookup.byKey.has(wordKey))) lookup.byKey.set(wordKey, location);
  for (const id of [cleanText(entry.id), cleanText(entry.wordId)]) {
    if (id && (replace || !lookup.byId.has(id))) lookup.byId.set(id, location);
  }
}

/**
 * Index the master lexicon once when a reading-notebook operation has to
 * resolve many cards.  Rebuilding this index for every card made opening a
 * 400+ card notebook repeatedly scan the whole 14k+ word lexicon.
 */
export function buildReadingMainLookup(mainWords = []) {
  const words = Array.isArray(mainWords) ? mainWords : [];
  const lookup = { byKey: new Map(), byId: new Map() };
  words.forEach((entry, index) => addMainEntryToLookup(lookup, entry, index));
  return lookup;
}

function isReadingMainLookup(value) {
  return value?.byKey instanceof Map && value?.byId instanceof Map;
}

function hasPossibleInflectionEvidence(readingWord = {}) {
  if (cleanText(readingWord?.baseWord) || cleanText(readingWord?.relationType)) return true;
  const grammaticalText = [
    readingWord?.pos,
    readingWord?.definition,
    readingWord?.meaningDetailZh
  ].filter(Boolean).join(" | ");
  return (
    INFLECTION_POS_EVIDENCE_RE.test(grammaticalText)
    || /\bof\s+[a-z]+(?:['-][a-z]+)*\b/i.test(grammaticalText)
    || /是\s*[a-z]+(?:['-][a-z]+)*\s*的/i.test(grammaticalText)
  );
}

const INFLECTION_POS_EVIDENCE_RE = /(?:\bplural\b|\bthird[- ]person\b|\bpast\s+(?:tense|participle)\b|\bpresent\s+participle\b|\bgerund\b|\bcomparative\b|\bsuperlative\b|\bpossessive\b|复数|第三人称|过去式|过去分词|现在分词|动名词|比较级|最高级|所有格)/i;

function readingInflectionEvidence(readingWord = {}, baseWord = "") {
  const baseKey = normalizeSurfaceWord(baseWord);
  const relation = classifySurfaceInflection(baseKey, readingWord?.word);
  if (!relation) return "";

  const storedBaseKey = normalizeSurfaceWord(readingWord?.baseWord);
  const storedRelation = cleanText(readingWord?.relationType);
  if (storedBaseKey === baseKey && storedRelation) return relation;

  const grammaticalText = [
    readingWord?.pos,
    readingWord?.definition,
    readingWord?.meaningDetailZh
  ].filter(Boolean).join(" | ");
  const textKey = normalizeSurfaceWord(grammaticalText);
  const explicitlyNamesBase = Boolean(
    baseKey && (
      textKey.includes(`of ${baseKey}`)
      || textKey.includes(`是 ${baseKey} 的`)
      || textKey.includes(`是${baseKey}的`)
      || textKey.includes(`${baseKey} 的`)
    )
  );

  return explicitlyNamesBase || INFLECTION_POS_EVIDENCE_RE.test(grammaticalText)
    ? relation
    : "";
}

function readingRelationLabel(relationType = "") {
  const labels = {
    "plural-or-third-person": "复数或第三人称单数",
    "present-participle": "现在分词或动名词",
    "past-or-past-participle": "过去式或过去分词",
    irregular: "不规则词形"
  };
  return labels[relationType] || "词形";
}

function buildReadingLemmaForm(readingWord = {}, mainEntry = {}, relationType = "") {
  const surface = cleanText(readingWord?.word);
  const lemma = cleanText(mainEntry?.word);
  if (!surface || !lemma || !relationType) return [];
  return [{
    word: lemma,
    type: "base-form",
    pos: cleanText(mainEntry?.pos),
    meaning: cleanText(mainEntry?.meaning),
    note: `${surface} 是 ${lemma} 的${readingRelationLabel(relationType)}形式`,
    source: "local-morphology-owner-resolution"
  }];
}

/**
 * Resolve a passage surface form to an existing curated lemma without
 * renaming the reading card.  The passage keeps "disqualified" and its
 * sentence; the master study card is owned by "disqualify".
 */
export function resolveReadingMainEntry(readingWord = {}, mainWords = [], mainLookup = null) {
  const list = Array.isArray(mainWords) ? mainWords : [];
  const lookup = isReadingMainLookup(mainLookup) ? mainLookup : null;
  const exactKey = normalizeReadingWordKey(readingWord?.word);
  const exactLocation = lookup?.byKey.get(exactKey);
  const exactIndex = exactLocation?.index ?? list.findIndex(
    (entry) => normalizeReadingWordKey(entry?.word) === exactKey
  );
  const exactEntry = exactLocation?.entry || (exactIndex >= 0 ? list[exactIndex] : null);
  const preferredId = cleanText(readingWord?.mainWordId);

  if (preferredId) {
    const preferredLocation = lookup?.byId.get(preferredId);
    const preferredIndex = preferredLocation?.index ?? list.findIndex((entry) => (
      cleanText(entry?.id) === preferredId || cleanText(entry?.wordId) === preferredId
    ));
    if (preferredIndex >= 0) {
      const entry = preferredLocation?.entry || list[preferredIndex];
      if (entry?.studyMode === "reference" && cleanText(entry?.baseWord || entry?.redirectToWord)) {
        const baseKey = normalizeReadingWordKey(entry.baseWord || entry.redirectToWord);
        const baseLocation = lookup?.byKey.get(baseKey);
        const baseIndex = baseLocation?.index ?? list.findIndex(
          (candidate) => normalizeReadingWordKey(candidate?.word) === baseKey
        );
        if (baseIndex >= 0) {
          return {
            entry: baseLocation?.entry || list[baseIndex],
            index: baseIndex,
            relationType: cleanText(entry.relationType) || readingInflectionEvidence(
              readingWord,
              (baseLocation?.entry || list[baseIndex]).word
            ),
            redirected: true
          };
        }
      }
      const relationType = readingInflectionEvidence(readingWord, entry.word);
      if (normalizeReadingWordKey(entry.word) === exactKey || relationType) {
        return { entry, index: preferredIndex, relationType, redirected: Boolean(relationType) };
      }
    }
  }

  // A trusted exact headword wins over spelling-based morphology.  Provisional
  // personal-reading duplicates are the exception: they are precisely the
  // records this resolver must reconnect to the already-curated lemma.
  if (exactEntry && !isPersonalReadingMainEntry(exactEntry)) {
    return { entry: exactEntry, index: exactIndex, relationType: "", redirected: false };
  }

  // Without a stored base or grammar signal, readingInflectionEvidence() can
  // never resolve a personal reading headword to another lemma.  Returning the
  // exact provisional entry avoids a full lexicon scan for ordinary cards.
  if (exactEntry && !hasPossibleInflectionEvidence(readingWord)) {
    return { entry: exactEntry, index: exactIndex, relationType: "", redirected: false };
  }

  const matches = [];
  for (let index = 0; index < list.length; index += 1) {
    const candidate = list[index];
    if (!candidate?.word || isPersonalReadingMainEntry(candidate)) continue;
    const relationType = readingInflectionEvidence(readingWord, candidate.word);
    if (relationType) matches.push({ entry: candidate, index, relationType, redirected: true });
  }
  if (matches.length === 1) return matches[0];

  return exactEntry
    ? { entry: exactEntry, index: exactIndex, relationType: "", redirected: false }
    : null;
}

function canonicalizeReadingWordAgainstMain(readingWord = {}, mainWords = [], options = {}) {
  const previousWord = cleanText(readingWord?.word || readingWord?.headword);
  const morphologyTarget = resolveReadingMainEntry(readingWord, mainWords, options.mainLookup);
  if (morphologyTarget?.redirected) {
    return {
      readingWord: {
        ...readingWord,
        mainWordId: cleanText(morphologyTarget.entry.id || morphologyTarget.entry.wordId),
        baseWord: cleanText(morphologyTarget.entry.word),
        baseWordId: cleanText(morphologyTarget.entry.id || morphologyTarget.entry.wordId),
        relationType: morphologyTarget.relationType,
        forms: buildReadingLemmaForm(readingWord, morphologyTarget.entry, morphologyTarget.relationType),
        formsReviewed: true,
        formsReviewSource: "local-morphology-owner-resolution"
      },
      suggestion: {
        word: previousWord,
        key: normalizeReadingWordKey(previousWord),
        corrected: false,
        mainEntry: morphologyTarget.entry,
        previousWord,
        relationType: morphologyTarget.relationType
      },
      corrected: false
    };
  }
  const suggestion = suggestCanonicalReadingHeadword(
    previousWord,
    mainWords,
    readingWord,
    { mainLookup: options.mainLookup }
  );
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
  // Prefer top-level main fields; fall back to sense-aware display (例句常挂在 senses 上)
  const mainDisplay = getStudyEntryDisplay(mainEntry);
  const next = {
    ...readingWord,
    mainWordId: cleanText(mainEntry.id || mainEntry.wordId || mainEntry.word)
  };

  const linkedSurfaceForm = Boolean(
    normalizeReadingWordKey(next.word) !== normalizeReadingWordKey(mainEntry.word)
    && readingInflectionEvidence(next, mainEntry.word)
  );
  const mainPhonetic = cleanText(mainEntry.phonetic || mainDisplay?.phonetic);
  if (mainPhonetic && !linkedSurfaceForm) next.phonetic = mainPhonetic;
  const mainPos = cleanText(mainEntry.pos || mainDisplay?.pos);
  const hasContextualMeaning = Boolean(cleanText(next.readingMeaning) || next.readingContextReviewed === true);
  if (mainPos && (!hasContextualMeaning || !cleanText(next.pos))) next.pos = mainPos;
  for (const field of ["meaning", "meaningDetailZh", "definition", "example", "exampleCn"]) {
    if (linkedSurfaceForm) continue;
    if (field === "meaningDetailZh") {
      if (
        !hasContextualMeaning &&
        !isMeaningDetailInformative(next) &&
        isMeaningDetailInformative(mainEntry)
      ) {
        next[field] = cleanText(mainEntry[field]);
      }
      continue;
    }
    if (!cleanText(next[field])) {
      const fromMain = cleanText(mainEntry[field] || mainDisplay?.[field]);
      if (fromMain) next[field] = fromMain;
    }
  }
  for (const field of MAIN_ARRAY_FIELDS) {
    // A reviewed passage meaning owns its semantic sense rows. Pulling the
    // global dictionary rows back in recreates combined-POS meanings on reload.
    if (hasContextualMeaning && ["otherMeanings", "senses", "meaningsZh"].includes(field)) {
      continue;
    }
    // 生词本为空数组时也要用主词库补全（forms / collocations / senses）
    const localEmpty = !Array.isArray(next[field]) || next[field].length === 0;
    const reviewedField = field === "forms"
      ? "formsReviewed"
      : field === "wordFamily"
        ? "wordFamilyReviewed"
        : field === "synonymDetails"
          ? "synonymsReviewed"
          : "";
    const explicitlyReviewed = reviewedField && next[reviewedField] === true;
    if (
      localEmpty
      && !explicitlyReviewed
      && !(field === "forms" && linkedSurfaceForm)
      && Array.isArray(mainEntry[field])
      && mainEntry[field].length
    ) {
      next[field] = mainEntry[field];
    }
  }
  if (
    (!Array.isArray(next.synonyms) || !next.synonyms.length)
    && next.synonymsReviewed !== true
    && Array.isArray(mainEntry.synonyms)
  ) {
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
    synonymDetails: normalizeReadingSynonymDetails(
      readingWord.synonymDetails,
      readingWord.synonyms,
      readingWord.word
    ),
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
  const resolved = resolveReadingMainEntry(canonicalReadingWord, mainWords, options.mainLookup);
  if (resolved?.entry) {
    return {
      mainWords,
      mainEntry: resolved.entry,
      mainIndex: resolved.index,
      readingWord: canonicalReadingWord,
      corrected: canonical.corrected,
      redirected: resolved.redirected,
      added: false
    };
  }
  if (shouldKeepReadingWordLocal(canonicalReadingWord)) {
    return {
      mainWords,
      mainEntry: null,
      mainIndex: -1,
      readingWord: canonicalReadingWord,
      corrected: canonical.corrected,
      added: false,
      localOnly: true
    };
  }
  const wordKey = normalizeReadingWordKey(canonicalReadingWord?.word);
  const existingIndex = options.mainLookup?.byKey.get(wordKey)?.index ?? mainWords.findIndex(
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
  const mainLookup = buildReadingMainLookup(mainWords);
  let addedToMain = 0;
  let correctedHeadwords = 0;

  const words = (Array.isArray(readingWords) ? readingWords : []).map((readingWord) => {
    if (!normalizeReadingWordKey(readingWord?.word)) return readingWord;
    const ensured = ensureReadingWordMainEntry(readingWord, mainWords, {
      ...options,
      usedIds,
      now,
      mainLookup
    });
    mainWords = ensured.mainWords;
    if (ensured.added) addMainEntryToLookup(mainLookup, ensured.mainEntry, ensured.mainIndex);
    if (ensured.added) addedToMain += 1;
    if (ensured.corrected) correctedHeadwords += 1;
    if (!ensured.mainEntry) return ensured.readingWord;
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
  ) || cleanText(mainEntry?.meaning || mainEntry?.meaningZh || mainEntry?.chineseMeaning);
  return { word, meaning };
}

export function reconcileReadingImportsWithMain(
  currentReadingWords,
  incomingWords,
  currentMainWords,
  options = {}
) {
  const now = cleanText(options.now) || new Date().toISOString();
  const allowMainWrites = options.allowMainWrites !== false;
  const mainWords = Array.isArray(currentMainWords) ? [...currentMainWords] : [];
  const mainLookup = buildReadingMainLookup(mainWords);
  let correctedHeadwords = 0;
  const canonicalizeList = (list) => (Array.isArray(list) ? list : []).map((word) => {
    const canonical = canonicalizeReadingWordAgainstMain(word, mainWords, { now, mainLookup });
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
    [...mainLookup.byKey].map(([key, location]) => [key, location.index])
  );
  const usedIds = new Set(
    mainWords.flatMap((entry) => [cleanText(entry?.id), cleanText(entry?.wordId)]).filter(Boolean)
  );
  let reusedMain = 0;
  let addedToMain = 0;
  let missingMain = 0;
  let mainChanged = false;

  const readingWords = importResult.words.map((readingWord) => {
    const key = normalizeReadingWordKey(readingWord.word);
    const resolved = resolveReadingMainEntry(readingWord, mainWords, mainLookup);
    const mainIndex = resolved?.index ?? mainIndexByKey.get(key);
    if (mainIndex !== undefined) {
      const mainEntry = mainWords[mainIndex];
      const linkedSource = resolved?.redirected
        ? {
          ...readingWord,
          mainWordId: cleanText(mainEntry.id || mainEntry.wordId),
          baseWord: cleanText(mainEntry.word),
          baseWordId: cleanText(mainEntry.id || mainEntry.wordId),
          relationType: resolved.relationType,
          forms: buildReadingLemmaForm(readingWord, mainEntry, resolved.relationType),
          formsReviewed: true,
          formsReviewSource: "local-morphology-owner-resolution"
        }
        : readingWord;
      const linked = applyMainEntryToReadingWord(linkedSource, mainEntry, now);
      if (incomingCounts.has(key)) {
        const nextCount = Math.max(
          Number(mainEntry.readingImportCount) || 0,
          Number(linked.importCount) || incomingCounts.get(key) || 1
        );
        if (allowMainWrites && nextCount !== Number(mainEntry.readingImportCount || 0)) {
          mainWords[mainIndex] = {
            ...mainEntry,
            readingImportCount: nextCount
          };
          addMainEntryToLookup(mainLookup, mainWords[mainIndex], mainIndex, { replace: true });
          mainChanged = true;
        }
        reusedMain += 1;
      }
      return linked;
    }

    if (!incomingCounts.has(key)) return readingWord;
    if (!allowMainWrites) {
      missingMain += 1;
      return readingWord;
    }
    const addition = buildPersonalReadingMainEntry(readingWord, {
      idFactory: options.mainIdFactory,
      usedIds,
      now
    });
    mainIndexByKey.set(key, mainWords.length);
    mainWords.push(addition);
    addMainEntryToLookup(mainLookup, addition, mainWords.length - 1);
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
    addedToMain,
    missingMain,
    localOnly: !allowMainWrites
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
export function suggestCanonicalReadingHeadword(rawWord = "", mainWords = [], readingWord = {}, options = {}) {
  const previousWord = cleanText(rawWord);
  const key = normalizeReadingWordKey(previousWord);
  if (!key) {
    return { word: previousWord, key: "", corrected: false, mainEntry: null, previousWord };
  }

  const lookup = isReadingMainLookup(options.mainLookup)
    ? options.mainLookup
    : buildReadingMainLookup(mainWords);
  const entryForKey = (entryKey) => lookup.byKey.get(entryKey)?.entry || null;

  let bestKey = key;
  let bestEntry = entryForKey(key);
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

  // A browser selection can occasionally start or end inside a word.  Use the
  // original reading sentence as stronger evidence than an AI gloss generated
  // for the fragment itself (for example cam -> campus, pport -> opportunity).
  // Only a unique, already-curated main headword may win this correction.
  const sourceTokenCandidates = new Map();
  if (key.length >= 3 && !/\s/.test(key)) {
    for (const source of Array.isArray(readingWord?.readingSources) ? readingWord.readingSources : []) {
      const tokens = cleanText(source?.sentence).toLowerCase().match(/[a-z]+(?:['-][a-z]+)*/g) || [];
      for (const token of tokens) {
        if (token === key || !token.includes(key) || key.length / token.length < 0.4) continue;
        const candidateEntry = entryForKey(token);
        if (!candidateEntry || isPersonalReadingMainEntry(candidateEntry)) continue;
        sourceTokenCandidates.set(token, candidateEntry);
      }
    }
  }
  if (sourceTokenCandidates.size === 1) {
    const [[candidateKey, candidateEntry]] = sourceTokenCandidates;
    bestKey = candidateKey;
    bestEntry = candidateEntry;
    bestScore = mainEntryCompletenessScore(candidateEntry);
  }

  // Missing first letter: a+key, b+key, ...
  const prefixedCandidates = [];
  for (let code = 97; code <= 122; code += 1) {
    const candidateKey = `${String.fromCharCode(code)}${key}`;
    const candidateEntry = entryForKey(candidateKey);
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
    const candidateEntry = entryForKey(candidateKey);
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

export function needsReadingAiProcessing(
  readingWord = {},
  mainEntry = {},
  mainWords = [],
  options = {}
) {
  return (
    isReadingWordIncomplete(readingWord)
    || readingWord?.readingContextPending === true
    || needsMeaningCoverageReview(readingWord)
    || (options.requireMainClassification !== false && isMainEntryClassificationIncomplete(mainEntry))
    || suggestCanonicalReadingHeadword(readingWord?.word, mainWords, readingWord, options).corrected
  );
}

export function mergeAiProfileIntoMainEntry(mainEntry = {}, profile = {}, options = {}) {
  const next = { ...mainEntry };

  for (const field of MAIN_TEXT_FIELDS) {
    if (field === "meaningDetailZh") {
      if (
        !isMeaningDetailInformative(next) &&
        isMeaningDetailInformative(profile) &&
        (!meaningKey(next) || meaningKey(next) === meaningKey(profile))
      ) {
        next[field] = cleanText(profile[field]);
      }
      continue;
    }
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
  next.synonymDetails = normalizeReadingSynonymDetails(
    [
      ...(Array.isArray(next.synonymDetails) ? next.synonymDetails : []),
      ...(Array.isArray(profile.synonymDetails) ? profile.synonymDetails : [])
    ],
    next.synonyms,
    next.word
  );
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
