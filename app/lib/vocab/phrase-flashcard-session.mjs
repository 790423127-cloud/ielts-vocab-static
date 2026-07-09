import { STUDY_SESSION_SCHEMA_VERSION } from "./study-session.mjs";
import { PROGRESS_SCHEMA_VERSION, progressStorageKey } from "./progress-schema.mjs";
import { normalizePhraseStatusValue } from "./phrase-flashcard-utils.mjs";
import { normalizePhraseKey } from "./load-phrases.mjs";
import { phraseFilterKey } from "./phrase-flashcard-utils.mjs";

export const PHRASE_FLASHCARD_PROGRESS_SESSION_KEY = progressStorageKey("flashcard", "phrase", "session");

export function resolvePhraseStudyIndex(phrases, {
  session = null,
  entryPositions = {},
  filter = { type: "all", value: "" },
  statusMap = {},
  studyList = null,
  buildStudyList
}) {
  const list = Array.isArray(phrases) ? phrases : [];
  if (!list.length) {
    return { index: -1, restored: false, reason: "emptyLexicon", filter };
  }

  const nextFilter = session?.filter && typeof session.filter === "object"
    ? session.filter
    : filter;
  const filterKeyValue = phraseFilterKey(nextFilter);
  const savedPhraseKey = String(session?.phraseKey || "").trim().toLowerCase();
  const savedPositionKey = String(entryPositions[filterKeyValue] || "").trim().toLowerCase();
  const savedIndex = Number.isInteger(session?.index) ? session.index : -1;

  function findByKey(key, requireStudyQueue) {
    if (!key) return -1;
    const index = list.findIndex((entry) => normalizePhraseKey(entry) === key);
    if (index < 0) return -1;

    if (!requireStudyQueue) return index;

    const queue = Array.isArray(studyList)
      ? studyList
      : typeof buildStudyList === "function"
        ? buildStudyList(list, nextFilter, statusMap)
        : [];

    return queue.some((item) => item.originalIndex === index) ? index : -1;
  }

  let index = findByKey(savedPhraseKey, true);
  if (index >= 0) return { index, restored: true, reason: "phraseKey", filter: nextFilter };

  index = findByKey(savedPositionKey, true);
  if (index >= 0) return { index, restored: true, reason: "entryPosition", filter: nextFilter };

  index = findByKey(savedPhraseKey, false);
  if (index >= 0) return { index, restored: true, reason: "phraseKeyOutOfFilter", filter: nextFilter };

  index = findByKey(savedPositionKey, false);
  if (index >= 0) return { index, restored: true, reason: "entryPositionOutOfFilter", filter: nextFilter };

  if (savedIndex >= 0 && savedIndex < list.length && list[savedIndex]) {
    return { index: savedIndex, restored: true, reason: "savedIndex", filter: nextFilter };
  }

  return { index: -1, restored: false, reason: "notFound", filter: nextFilter };
}

export function resolvePhraseFilterSwitchIndex(phrases, options) {
  const result = resolvePhraseStudyIndex(phrases, options);
  if (result.index >= 0) return result;

  const { findFirstInFilter } = options;
  const firstIndex = typeof findFirstInFilter === "function" ? findFirstInFilter() : -1;
  if (firstIndex >= 0) {
    return { index: firstIndex, restored: false, reason: "filterFirst", filter: result.filter };
  }

  return { index: -1, restored: false, reason: "emptyFilter", filter: result.filter };
}

export function buildPhraseFlashSessionPayload({
  phrases,
  index,
  filter,
  entryPositions
}) {
  const entry = Array.isArray(phrases) ? phrases[index] : null;
  return {
    v: STUDY_SESSION_SCHEMA_VERSION,
    progressSchemaVersion: PROGRESS_SCHEMA_VERSION,
    progressKey: PHRASE_FLASHCARD_PROGRESS_SESSION_KEY,
    index,
    phraseKey: entry ? normalizePhraseKey(entry) : "",
    filter,
    entryPositions: entryPositions && typeof entryPositions === "object" ? entryPositions : {},
    savedAt: Date.now()
  };
}

export function restoreMessageForPhraseReason(reason, phraseLabel = "") {
  switch (reason) {
    case "phraseKey":
    case "entryPosition":
    case "savedIndex":
      return phraseLabel ? `已恢复到：${phraseLabel}` : "已恢复到上次学习位置";
    case "phraseKeyOutOfFilter":
    case "entryPositionOutOfFilter":
      return phraseLabel
        ? `已恢复到：${phraseLabel}（不在当前待学范围）`
        : "已恢复到上次位置（不在当前待学范围）";
    case "notFound":
      return "未找到上次学习位置，请手动选择范围";
    default:
      return "";
  }
}

export function normalizePhraseFilterValue(value = "") {
  return normalizePhraseStatusValue(value);
}