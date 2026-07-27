import {
  IDICTATION_PRACTICE_SOURCES,
  normalizeIdictationPrefs
} from "./idictation-frequency.mjs";
import {
  PERSONAL_WRONG_BOOK_BASE_REPS,
  PERSONAL_WRONG_BOOK_PLURAL_REPS,
  PERSONAL_WRONG_BOOK_REPETITIONS
} from "./personal-wrong-book.mjs";
import {
  SPELLING_CATEGORY_TYPES,
  SPELLING_DIFFICULTY_OPTIONS,
  SPELLING_IELTS_USE_OPTIONS,
  SPELLING_LISTENING_READING_OPTIONS,
  SPELLING_PHRASE_CATEGORY_TYPES,
  SPELLING_PRACTICE_SOURCES,
  SPELLING_TOPIC_OPTIONS
} from "./spelling-categories.mjs";
import {
  DEFAULT_SPELLING_PREFS as DEFAULT_PREFS
} from "./spelling-training-prefs.mjs";
import {
  getScopeRangeUiKey,
  getScopeStorageKey,
  normalizeSpellingScope
} from "./spelling-scope.mjs";
import {
  readJsonFromLocalStorage,
  readPersonalWrongBookRecords as readStoredPersonalWrongBookRecords,
  spellingDailyStatsKey,
  spellingPositionKey,
  spellingUxPrefsKey,
  writeJsonToLocalStorage,
  writePersonalWrongBookRecords as writeStoredPersonalWrongBookRecords
} from "./spelling-training-storage.mjs";

export function resolveSpellingLoadingState(options = {}) {
  const lexiconReady = options.lexiconReady === true;
  const activeSourceLoading = options.activeSourceLoading === true;
  const entryCount = Math.max(0, Number(options.entryCount) || 0);
  const engineReady = options.engineReady === true;

  if (!lexiconReady) {
    return { loading: true, phase: "读取主词库", showEnginePreparing: false };
  }
  if (activeSourceLoading) {
    return { loading: true, phase: "恢复所选训练来源", showEnginePreparing: false };
  }
  if (entryCount > 0 && !engineReady) {
    return { loading: true, phase: "初始化训练引擎", showEnginePreparing: true };
  }
  return {
    loading: false,
    phase: entryCount > 0 ? "训练已就绪" : "所选来源暂无内容",
    showEnginePreparing: false
  };
}

export function getUxPrefsKey(scope) {
  return spellingUxPrefsKey(scope);
}

export function getPositionKey(scope) {
  return spellingPositionKey(scope);
}

export function getDailyStatsKey(scope) {
  return spellingDailyStatsKey(scope);
}

export function readDailyStats(scope) {
  return readJsonFromLocalStorage(getDailyStatsKey(scope), null);
}

export function writeDailyStats(scope, stats) {
  writeJsonToLocalStorage(getDailyStatsKey(scope), stats);
}

export function readPersonalWrongBookRecords() {
  return readStoredPersonalWrongBookRecords();
}

export function writePersonalWrongBookRecords(records) {
  writeStoredPersonalWrongBookRecords(records);
}

export function readUxPrefs(scope) {
  if (typeof localStorage === "undefined") return {};
  try {
    const key = getUxPrefsKey(scope);
    const raw = localStorage.getItem(key) || (typeof sessionStorage !== "undefined" ? sessionStorage.getItem(key) : "");
    if (raw && typeof sessionStorage !== "undefined") sessionStorage.removeItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function writeUxPrefs(scope, prefs) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(getUxPrefsKey(scope), JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export function readRangeSettingsExpanded(scope) {
  if (typeof localStorage === "undefined") return false;
  try {
    const key = getScopeRangeUiKey(scope);
    const value = localStorage.getItem(key) || (typeof sessionStorage !== "undefined" ? sessionStorage.getItem(key) : "");
    if (value && typeof sessionStorage !== "undefined") sessionStorage.removeItem(key);
    return value === "1";
  } catch {
    return false;
  }
}

export function writeRangeSettingsExpanded(scope, expanded) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(getScopeRangeUiKey(scope), expanded ? "1" : "0");
  } catch {
    // ignore
  }
}

export function readCategoryPrefs(scope) {
  if (typeof localStorage === "undefined") return null;
  try {
    const key = getScopeStorageKey(scope);
    const raw = localStorage.getItem(key) || (typeof sessionStorage !== "undefined" ? sessionStorage.getItem(key) : "");
    if (raw && typeof sessionStorage !== "undefined") sessionStorage.removeItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeCategoryPrefs(scope, prefs) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(getScopeStorageKey(scope), JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export function readSpellingPosition(scope, activeBatchId) {
  if (typeof localStorage === "undefined" || !activeBatchId) return null;
  try {
    const raw = localStorage.getItem(getPositionKey(scope));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.activeBatchId === activeBatchId ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSpellingPosition(scope, position) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(getPositionKey(scope), JSON.stringify(position));
  } catch {
    // ignore
  }
}

export function normalizePrefs(prefs = {}, scope = "word") {
  const isPhrase = normalizeSpellingScope(scope) === "phrase";
  const categoryTypes = isPhrase ? SPELLING_PHRASE_CATEGORY_TYPES : SPELLING_CATEGORY_TYPES;
  const categoryType = categoryTypes.some((item) => item.value === prefs.categoryType)
    ? prefs.categoryType
    : DEFAULT_PREFS.categoryType;

  let categoryValue = String(prefs.categoryValue || "").trim();
  if (categoryType === "difficulty") {
    const match = SPELLING_DIFFICULTY_OPTIONS.find((item) => item.value === categoryValue);
    categoryValue = match?.value || DEFAULT_PREFS.categoryValue;
  } else if (categoryType === "topic") {
    categoryValue = SPELLING_TOPIC_OPTIONS.includes(categoryValue)
      ? categoryValue
      : SPELLING_TOPIC_OPTIONS[0];
  } else if (categoryType === "ielts_use") {
    const match = SPELLING_IELTS_USE_OPTIONS.find((item) => item.value === categoryValue);
    categoryValue = match?.value || SPELLING_IELTS_USE_OPTIONS[0].value;
  } else if (categoryType === "lr_high_frequency") {
    const match = SPELLING_LISTENING_READING_OPTIONS.find((item) => item.value === categoryValue);
    categoryValue = match?.value || SPELLING_LISTENING_READING_OPTIONS[0].value;
  } else {
    categoryValue = "";
  }

  return {
    categoryType,
    categoryValue,
    batchIndex: Math.max(0, Number(prefs.batchIndex) || 0)
  };
}

export function normalizeStoredPrefs(saved, scope = "word") {
  const input = saved && typeof saved === "object" ? saved : {};
  const isPhrase = normalizeSpellingScope(scope) === "phrase";
  const allowedSources = isPhrase
    ? SPELLING_PRACTICE_SOURCES
    : [...SPELLING_PRACTICE_SOURCES, ...IDICTATION_PRACTICE_SOURCES];
  const practiceSource = allowedSources.some((item) => item.value === input.practiceSource)
    ? input.practiceSource
    : "category";
  const idictationInput = input.idictation && typeof input.idictation === "object" ? input.idictation : {};

  return {
    practiceSource,
    category: normalizePrefs(input.category || input, scope),
    personalWrongBatchIndex: Math.max(0, Number(input.personalWrongBatchIndex) || 0),
    errorBankBatchIndex: Math.max(0, Number(input.errorBankBatchIndex) || 0),
    srsBatchIndex: Math.max(0, Number(input.srsBatchIndex) || 0),
    idictation: {
      listening: normalizeIdictationPrefs("listening", idictationInput.listening),
      reading: normalizeIdictationPrefs("reading", idictationInput.reading)
    }
  };
}

export function formatWrongTime(timestamp) {
  const value = Number(timestamp || 0);
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatPersonalWrongRepeatLabel(record = {}) {
  const repeatTotal = Number(record.targetRepetitions)
    || (record.hasInflectionPair ? PERSONAL_WRONG_BOOK_REPETITIONS : PERSONAL_WRONG_BOOK_BASE_REPS);

  if (record.hasInflectionPair) {
    return `原形${PERSONAL_WRONG_BOOK_BASE_REPS}+复数${PERSONAL_WRONG_BOOK_PLURAL_REPS} · 共${repeatTotal}遍`;
  }

  return `原形${PERSONAL_WRONG_BOOK_BASE_REPS}遍`;
}

export function resolvePersonalWrongNavigationWordId(wordId = "", units = []) {
  const key = String(wordId || "").trim();
  if (!key) return "";

  const unit = (Array.isArray(units) ? units : [])
    .find((item) => Array.isArray(item?.writeWordIds) && item.writeWordIds.includes(key));
  return String(unit?.writeWordIds?.[0] || key).trim();
}
