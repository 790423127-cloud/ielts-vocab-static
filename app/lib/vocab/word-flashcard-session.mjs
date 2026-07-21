import { STUDY_SESSION_SCHEMA_VERSION } from "./study-session.mjs";
import {
  PROGRESS_SCHEMA_VERSION,
  progressStorageKey,
  readWithLegacyFallback,
  writeJsonStorage
} from "./progress-schema.mjs";
import { resolveInflectedReferenceIndex } from "./word-study-eligibility.mjs";

export const WORD_FLASHCARD_SESSION_KEY = "ielts_vocab_session_v1";
export const WORD_FLASHCARD_POSITIONS_KEY = "ielts_vocab_entry_positions_v1";
export const WORD_FLASHCARD_PROGRESS_KEY = progressStorageKey("flashcard", "word", "session");
export const WORD_FLASHCARD_PROGRESS_POSITIONS_KEY = progressStorageKey("flashcard", "word", "positions");
export const IDICTATION_FLASH_INDEX_OFFSET = 1000000000;

const DEFAULT_FILTER = { type: "all", value: "" };

export function isIdictationFlashFilter(filter) {
  return filter?.type === "idictation" && ["listening", "reading"].includes(filter?.value);
}

export function toIdictationSourceIndex(virtualIndex) {
  if (!Number.isInteger(virtualIndex) || virtualIndex < IDICTATION_FLASH_INDEX_OFFSET) {
    return -1;
  }
  return virtualIndex - IDICTATION_FLASH_INDEX_OFFSET;
}

export function toIdictationVirtualIndex(sourceIndex) {
  if (!Number.isInteger(sourceIndex) || sourceIndex < 0) {
    return -1;
  }
  return IDICTATION_FLASH_INDEX_OFFSET + sourceIndex;
}

export function readWordFlashEntryPositions(storageGet = defaultStorageGet, storageSet = defaultStorageSet) {
  const { value, migrated } = readWithLegacyFallback(
    storageGet,
    WORD_FLASHCARD_PROGRESS_POSITIONS_KEY,
    [WORD_FLASHCARD_POSITIONS_KEY],
    {}
  );

  if (migrated && value && typeof value === "object") {
    writeJsonStorage(storageSet, WORD_FLASHCARD_PROGRESS_POSITIONS_KEY, value);
  }

  return value && typeof value === "object" ? value : {};
}

export function readWordFlashPendingSession(storageGet = defaultStorageGet, storageSet = defaultStorageSet) {
  const { value, migrated } = readWithLegacyFallback(
    storageGet,
    WORD_FLASHCARD_PROGRESS_KEY,
    [WORD_FLASHCARD_SESSION_KEY],
    null
  );

  if (migrated && value && typeof value === "object") {
    writeJsonStorage(storageSet, WORD_FLASHCARD_PROGRESS_KEY, value);
  }

  return value && typeof value === "object" ? value : null;
}

export function normalizeWordFlashFilter(filter) {
  if (filter && typeof filter === "object" && typeof filter.type === "string") {
    return {
      type: filter.type,
      value: filter.value ?? ""
    };
  }
  return { ...DEFAULT_FILTER };
}

function findStudyPoolItemByKey(studyPool, key, normalizeWord) {
  if (!key || !Array.isArray(studyPool)) return null;
  return studyPool.find((item) => normalizeWord(item?.word) === key) || null;
}

function resolveIdictationStudyIndex(studyPool, {
  session = null,
  entryPositions = {},
  filter = DEFAULT_FILTER,
  filterKey,
  normalizeWord
}) {
  const nextFilter = normalizeWordFlashFilter(filter);
  const filterKeyValue = filterKey(nextFilter);
  const savedWordKey = String(session?.wordKey || "").trim();
  const savedPositionKey = String(entryPositions[filterKeyValue] || "").trim();
  const savedIndex = Number.isInteger(session?.index) ? session.index : -1;
  const savedSourceIndex = Number.isInteger(session?.idictationSourceIndex)
    ? session.idictationSourceIndex
    : toIdictationSourceIndex(savedIndex);

  function restoreFromPoolItem(item, reason) {
    if (!item || !Number.isInteger(item.originalIndex)) return null;
    return { index: item.originalIndex, restored: true, reason, filter: nextFilter };
  }

  let restored = restoreFromPoolItem(
    findStudyPoolItemByKey(studyPool, savedWordKey, normalizeWord),
    "wordKey"
  );
  if (restored) return restored;

  restored = restoreFromPoolItem(
    findStudyPoolItemByKey(studyPool, savedPositionKey, normalizeWord),
    "entryPosition"
  );
  if (restored) return restored;

  if (savedSourceIndex >= 0 && savedSourceIndex < studyPool.length) {
    restored = restoreFromPoolItem(studyPool[savedSourceIndex], "idictationSourceIndex");
    if (restored) return restored;
  }

  if (savedIndex >= IDICTATION_FLASH_INDEX_OFFSET) {
    restored = restoreFromPoolItem(
      studyPool.find((item) => item.originalIndex === savedIndex) || null,
      "savedIndex"
    );
    if (restored) return restored;
  }

  return { index: -1, restored: false, reason: "notFound", filter: nextFilter };
}

/**
 * Resolve a saved word position without falling back to the first study word.
 * Saved pure inflection positions are migrated to their brushable base word.
 */
export function resolveWordStudyIndex(words, {
  session = null,
  entryPositions = {},
  filter = DEFAULT_FILTER,
  wordMatchesFilter,
  filterKey,
  normalizeWord,
  studyPool = null
}) {
  const nextFilter = normalizeWordFlashFilter(session?.filter || filter);

  if (isIdictationFlashFilter(nextFilter)) {
    const pool = Array.isArray(studyPool) ? studyPool : [];
    if (!pool.length) {
      return { index: -1, restored: false, reason: "emptyLexicon", filter: nextFilter };
    }
    return resolveIdictationStudyIndex(pool, {
      session,
      entryPositions,
      filter: nextFilter,
      filterKey,
      normalizeWord
    });
  }

  const list = Array.isArray(words) ? words : [];
  if (!list.length) {
    return { index: -1, restored: false, reason: "emptyLexicon", filter: nextFilter };
  }

  const filterKeyValue = filterKey(nextFilter);
  const savedWordKey = String(session?.wordKey || "").trim();
  const savedPositionKey = String(entryPositions[filterKeyValue] || "").trim();
  const savedIndex = Number.isInteger(session?.index) ? session.index : -1;

  function findRawIndexByKey(key) {
    if (!key) return -1;
    return list.findIndex((word) => normalizeWord(word?.word) === key);
  }

  function finalize(rawIndex, reason, requireCurrentFilter) {
    if (!Number.isInteger(rawIndex) || rawIndex < 0 || rawIndex >= list.length) return null;
    const resolvedIndex = resolveInflectedReferenceIndex(list, rawIndex, normalizeWord);
    if (resolvedIndex < 0) return null;
    const resolvedWord = list[resolvedIndex];
    if (requireCurrentFilter && !wordMatchesFilter(resolvedWord, nextFilter)) return null;
    return {
      index: resolvedIndex,
      restored: true,
      reason: resolvedIndex === rawIndex ? reason : "inflectedFormRedirect",
      filter: nextFilter
    };
  }

  let restored = finalize(findRawIndexByKey(savedWordKey), "wordKey", true);
  if (restored) return restored;

  restored = finalize(findRawIndexByKey(savedPositionKey), "entryPosition", true);
  if (restored) return restored;

  if (savedWordKey) {
    restored = finalize(findRawIndexByKey(savedWordKey), "wordKeyOutOfFilter", false);
    if (restored) return restored;
  }

  if (savedPositionKey) {
    restored = finalize(findRawIndexByKey(savedPositionKey), "entryPositionOutOfFilter", false);
    if (restored) return restored;
  }

  if (savedIndex >= 0 && savedIndex < list.length) {
    const resolvedIndex = resolveInflectedReferenceIndex(list, savedIndex, normalizeWord);
    if (resolvedIndex >= 0) {
      const resolvedWord = list[resolvedIndex];
      const inFilter = wordMatchesFilter(resolvedWord, nextFilter);
      return {
        index: resolvedIndex,
        restored: true,
        reason: resolvedIndex !== savedIndex
          ? "inflectedFormRedirect"
          : inFilter ? "savedIndex" : "savedIndexOutOfFilter",
        filter: nextFilter
      };
    }
  }

  return { index: -1, restored: false, reason: "notFound", filter: nextFilter };
}

export function resolveCurrentStudyItem({
  words,
  index,
  filter,
  studyPool = null
}) {
  const nextFilter = normalizeWordFlashFilter(filter);

  if (isIdictationFlashFilter(nextFilter) && Array.isArray(studyPool)) {
    return studyPool.find((item) => item.originalIndex === index) || null;
  }

  const list = Array.isArray(words) ? words : [];
  const resolvedIndex = resolveInflectedReferenceIndex(list, index);
  return resolvedIndex >= 0 ? list[resolvedIndex] || null : null;
}

export function buildWordFlashSessionPayload({
  words,
  index,
  filter,
  entryPositions,
  normalizeWord,
  studyPool = null,
  currentItem = null
}) {
  const nextFilter = normalizeWordFlashFilter(filter);
  const resolvedIndex = isIdictationFlashFilter(nextFilter)
    ? index
    : resolveInflectedReferenceIndex(words, index, normalizeWord);
  const safeIndex = resolvedIndex >= 0 ? resolvedIndex : index;
  const item = currentItem || resolveCurrentStudyItem({
    words,
    index: safeIndex,
    filter: nextFilter,
    studyPool
  });

  const payload = {
    v: STUDY_SESSION_SCHEMA_VERSION,
    progressSchemaVersion: PROGRESS_SCHEMA_VERSION,
    progressKey: WORD_FLASHCARD_PROGRESS_KEY,
    index: safeIndex,
    wordKey: item?.word && typeof normalizeWord === "function" ? normalizeWord(item.word) : "",
    word: item?.word || "",
    filter: nextFilter,
    entryPositions: entryPositions && typeof entryPositions === "object" ? entryPositions : {},
    savedAt: Date.now()
  };

  if (isIdictationFlashFilter(nextFilter)) {
    const sourceIndex = toIdictationSourceIndex(safeIndex);
    if (sourceIndex >= 0) payload.idictationSourceIndex = sourceIndex;
  }

  return payload;
}

export function persistWordFlashSession({
  words,
  index,
  filter,
  entryPositions,
  filterKey,
  normalizeWord,
  studyPool = null,
  currentItem = null,
  storageSet = defaultStorageSet
}) {
  const nextFilter = normalizeWordFlashFilter(filter);
  const resolvedIndex = isIdictationFlashFilter(nextFilter)
    ? index
    : resolveInflectedReferenceIndex(words, index, normalizeWord);
  const safeIndex = resolvedIndex >= 0 ? resolvedIndex : index;
  const item = currentItem || resolveCurrentStudyItem({
    words,
    index: safeIndex,
    filter: nextFilter,
    studyPool
  });
  const nextPositions = { ...(entryPositions || {}) };

  if (item?.word && typeof filterKey === "function" && typeof normalizeWord === "function") {
    const key = normalizeWord(item.word);
    if (key) nextPositions[filterKey(nextFilter)] = key;
  }

  const sessionPayload = buildWordFlashSessionPayload({
    words,
    index: safeIndex,
    filter: nextFilter,
    entryPositions: nextPositions,
    normalizeWord,
    studyPool,
    currentItem: item
  });

  const positionsJson = JSON.stringify(nextPositions);
  const sessionJson = JSON.stringify(sessionPayload);
  const positionsSaved =
    storageSet(WORD_FLASHCARD_PROGRESS_POSITIONS_KEY, positionsJson) &&
    storageSet(WORD_FLASHCARD_POSITIONS_KEY, positionsJson);
  const sessionSaved =
    storageSet(WORD_FLASHCARD_PROGRESS_KEY, sessionJson) &&
    storageSet(WORD_FLASHCARD_SESSION_KEY, sessionJson);

  return {
    entryPositions: nextPositions,
    session: sessionPayload,
    saved: positionsSaved && sessionSaved
  };
}

export function restoreMessageForReason(reason, wordLabel = "") {
  switch (reason) {
    case "wordKey":
    case "entryPosition":
    case "savedIndex":
    case "idictationSourceIndex":
      return wordLabel ? `已恢复到：${wordLabel}` : "已恢复到上次学习位置";
    case "inflectedFormRedirect":
      return wordLabel ? `已从词形恢复到基词：${wordLabel}` : "已从词形恢复到对应基词";
    case "wordKeyOutOfFilter":
    case "entryPositionOutOfFilter":
    case "savedIndexOutOfFilter":
      return wordLabel
        ? `已恢复到：${wordLabel}（不在当前待学范围）`
        : "已恢复到上次位置（不在当前待学范围）";
    case "notFound":
      return "未找到上次学习位置，请手动选择范围";
    default:
      return "";
  }
}

function defaultStorageGet(key) {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function defaultStorageSet(key, value) {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function storageRemove(key) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {}
}

export function clearWordStudySession(storageRemoveFn = storageRemove) {
  storageRemoveFn(WORD_FLASHCARD_PROGRESS_KEY);
  storageRemoveFn(WORD_FLASHCARD_PROGRESS_POSITIONS_KEY);
  storageRemoveFn(WORD_FLASHCARD_SESSION_KEY);
  storageRemoveFn(WORD_FLASHCARD_POSITIONS_KEY);
}
