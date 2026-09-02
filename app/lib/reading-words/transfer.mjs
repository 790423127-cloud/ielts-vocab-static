import { USER_STATE_FIELDS } from "../vocab/word-cache-meta.mjs";
import {
  compactReadingWordsForPersistence,
  normalizeReadingWord,
  normalizeReadingWordKey
} from "./storage.mjs";
import { applyMainEntryToReadingWord, buildPersonalReadingMainEntry } from "./main-lexicon-sync.mjs";

export const READING_WORDS_TRANSFER_VERSION = 1;

function cleanText(value) {
  return String(value ?? "").normalize("NFC").trim();
}

function isPersonalReadingSupplement(entry = {}) {
  return (
    entry.addedFromReadingWords === true ||
    entry.source === "personal-reading"
  );
}

function selectTransferMainEntry(entry = {}) {
  if (isPersonalReadingSupplement(entry)) {
    return { ...entry, transferType: "supplement" };
  }

  const stateEntry = {
    id: cleanText(entry.id),
    wordId: cleanText(entry.wordId),
    word: cleanText(entry.word),
    transferType: "user-state"
  };
  for (const field of USER_STATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(entry, field)) stateEntry[field] = entry[field];
  }
  return stateEntry;
}

export function buildReadingWordsTransferPackage(readingWords, mainWords, mainMeta = {}) {
  const compactReadingWords = compactReadingWordsForPersistence(readingWords);
  const readingKeys = new Set(
    compactReadingWords
      .map((entry) => normalizeReadingWordKey(entry?.word))
      .filter(Boolean)
  );
  const linkedMainIds = new Set(
    compactReadingWords
      .map((entry) => cleanText(entry?.mainWordId || entry?.baseWordId))
      .filter(Boolean)
  );
  const linkedMainEntries = (Array.isArray(mainWords) ? mainWords : [])
    .filter((entry) => (
      readingKeys.has(normalizeReadingWordKey(entry?.word))
      || linkedMainIds.has(cleanText(entry?.id || entry?.wordId))
    ))
    .map(selectTransferMainEntry);

  return {
    type: "ielts-reading-words-transfer",
    version: READING_WORDS_TRANSFER_VERSION,
    exportedAt: new Date().toISOString(),
    readingWords: compactReadingWords,
    linkedMainEntries,
    sourceMainMeta: {
      version: cleanText(mainMeta.version),
      lexiconHash: cleanText(mainMeta.lexiconHash)
    }
  };
}

function mergeUserState(target = {}, incoming = {}) {
  const next = { ...target };
  for (const field of USER_STATE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(incoming, field)) continue;
    const incomingValue = incoming[field];
    if (field === "favorite") {
      next[field] = Boolean(target[field] || incomingValue);
    } else if (["reviewCount", "correctCount", "wrongCount", "mastery"].includes(field)) {
      next[field] = Math.max(Number(target[field]) || 0, Number(incomingValue) || 0);
    } else if (field === "lastReviewedAt") {
      next[field] = [target[field], incomingValue]
        .filter((value) => value !== undefined && value !== null && value !== "")
        .sort((left, right) => {
          const leftTime = new Date(left).getTime();
          const rightTime = new Date(right).getTime();
          if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) return leftTime - rightTime;
          return String(left).localeCompare(String(right));
        })
        .at(-1);
    } else if (target[field] === undefined || target[field] === null || target[field] === "") {
      next[field] = incomingValue;
    }
  }
  return next;
}

export function mergeTransferredMainEntries(currentMainWords, transferredEntries, options = {}) {
  const mainWords = Array.isArray(currentMainWords) ? [...currentMainWords] : [];
  const indexByKey = new Map(
    mainWords.map((entry, index) => [normalizeReadingWordKey(entry?.word), index])
  );
  const usedIds = new Set(
    mainWords.flatMap((entry) => [cleanText(entry?.id), cleanText(entry?.wordId)]).filter(Boolean)
  );
  let added = 0;
  let merged = 0;

  for (const incoming of Array.isArray(transferredEntries) ? transferredEntries : []) {
    const key = normalizeReadingWordKey(incoming?.word);
    if (!key) continue;
    const existingIndex = indexByKey.get(key);
    if (existingIndex !== undefined) {
      mainWords[existingIndex] = mergeUserState(mainWords[existingIndex], incoming);
      merged += 1;
      continue;
    }
    if (incoming.transferType !== "supplement") continue;

    const addition = buildPersonalReadingMainEntry(incoming, {
      idFactory: options.mainIdFactory,
      usedIds,
      now: options.now
    });
    const incomingContent = { ...incoming };
    delete incomingContent.id;
    delete incomingContent.wordId;
    delete incomingContent.transferType;
    mainWords.push(mergeUserState({
      ...addition,
      ...incomingContent,
      id: addition.id,
      wordId: addition.wordId
    }, incoming));
    indexByKey.set(key, mainWords.length - 1);
    added += 1;
  }

  return { mainWords, added, merged };
}

export function mergeTransferredReadingWords(currentWords, transferredWords, options = {}) {
  const now = cleanText(options.now) || new Date().toISOString();
  const words = (Array.isArray(currentWords) ? currentWords : [])
    .map((entry) => normalizeReadingWord(entry, { now }));
  const indexByKey = new Map(
    words.map((entry, index) => [normalizeReadingWordKey(entry.word), index])
  );
  const usedIds = new Set(words.map((entry) => cleanText(entry.id)).filter(Boolean));
  let added = 0;
  let merged = 0;

  for (const raw of Array.isArray(transferredWords) ? transferredWords : []) {
    const incoming = normalizeReadingWord(raw, { now });
    const key = normalizeReadingWordKey(incoming.word);
    if (!key) continue;
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      if (usedIds.has(incoming.id)) {
        incoming.id = cleanText(options.readingIdFactory?.()) || `reading-transfer-${Date.now()}-${added}`;
        incoming.wordId = incoming.id;
      }
      words.push(incoming);
      usedIds.add(incoming.id);
      indexByKey.set(key, words.length - 1);
      added += 1;
      continue;
    }

    const target = words[existingIndex];
    const next = { ...target };
    for (const field of [
      "phonetic", "pos", "meaning", "meaningDetailZh", "definition", "example", "exampleCn"
    ]) {
      if (!cleanText(next[field]) && cleanText(incoming[field])) next[field] = incoming[field];
    }
    for (const field of ["otherMeanings", "forms", "wordFamily", "synonyms", "synonymDetails"]) {
      if ((!Array.isArray(next[field]) || !next[field].length) && Array.isArray(incoming[field])) {
        next[field] = incoming[field];
      }
    }
    next.favorite = Boolean(target.favorite || incoming.favorite);
    next.status = target.status || incoming.status;
    next.importCount = Math.max(Number(target.importCount) || 1, Number(incoming.importCount) || 1);
    next.highFrequency = next.importCount >= 2 || target.highFrequency === true || incoming.highFrequency === true;
    next.firstImportedAt = [target.firstImportedAt, incoming.firstImportedAt].filter(Boolean).sort()[0] || now;
    next.lastImportedAt = [target.lastImportedAt, incoming.lastImportedAt].filter(Boolean).sort().at(-1) || now;
    next.updatedAt = now;
    words[existingIndex] = next;
    merged += 1;
  }

  return { words, added, merged };
}

export function importReadingWordsTransferPackage(payload, currentReadingWords, currentMainWords, options = {}) {
  if (
    payload?.type !== "ielts-reading-words-transfer" ||
    Number(payload?.version) !== READING_WORDS_TRANSFER_VERSION ||
    !Array.isArray(payload?.readingWords) ||
    !Array.isArray(payload?.linkedMainEntries)
  ) {
    throw new Error("这不是有效的阅读生词跨设备迁移包");
  }

  const mainResult = mergeTransferredMainEntries(
    currentMainWords,
    payload.linkedMainEntries,
    options
  );
  const readingResult = mergeTransferredReadingWords(
    currentReadingWords,
    payload.readingWords,
    options
  );
  const mainIndex = new Map(
    mainResult.mainWords.map((entry) => [normalizeReadingWordKey(entry?.word), entry])
  );
  const words = readingResult.words.map((entry) => {
    const mainEntry = mainIndex.get(normalizeReadingWordKey(entry.word));
    return mainEntry ? applyMainEntryToReadingWord(entry, mainEntry, options.now) : entry;
  });

  return {
    words,
    mainWords: mainResult.mainWords,
    readingAdded: readingResult.added,
    readingMerged: readingResult.merged,
    mainAdded: mainResult.added,
    mainMerged: mainResult.merged
  };
}
