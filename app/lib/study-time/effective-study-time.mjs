export const EFFECTIVE_STUDY_TIME_STORAGE_KEY = "ielts_effective_study_time_v1";
export const EFFECTIVE_STUDY_TIME_UPDATE_EVENT = "ielts:effective-study-time-updated";
export const EFFECTIVE_STUDY_ACTIVITY_EVENT = "ielts:effective-study-activity";
export const EFFECTIVE_STUDY_MODULE_CHANGE_EVENT = "ielts:effective-study-module-changed";
export const EFFECTIVE_STUDY_TIME_VERSION = 1;
export const EFFECTIVE_STUDY_IDLE_MS = 30_000;
export const EFFECTIVE_STUDY_INITIAL_READING_MS = 8_000;
export const EFFECTIVE_STUDY_RESUME_MS = 1_000;
export const EFFECTIVE_STUDY_HISTORY_DAYS = 370;

export const EFFECTIVE_STUDY_MODULES = Object.freeze({
  main: { key: "main", label: "主词库单词刷词", paths: ["/"] },
  "main-phrases": { key: "main-phrases", label: "主词库词组刷词", paths: [] },
  "main-paraphrases": { key: "main-paraphrases", label: "听力阅读同义替换", paths: [] },
  basic: { key: "basic", label: "零基础词库", paths: ["/basic"] },
  "ielts-538": { key: "ielts-538", label: "538 考点", paths: ["/ielts-538"] },
  "reading-g": { key: "reading-g", label: "G 类阅读提升", paths: ["/reading-g"] },
  "reading-words": { key: "reading-words", label: "阅读生词本", paths: ["/reading-words"] },
  "reading-paraphrases": { key: "reading-paraphrases", label: "阅读同义替换", paths: ["/reading-paraphrases"] },
  "spelling-words": { key: "spelling-words", label: "单词拼写训练", paths: ["/spelling-words"] },
  "spelling-phrases": { key: "spelling-phrases", label: "词组拼写训练", paths: ["/spelling-phrases"] },
  meaning: { key: "meaning", label: "看词选中文", paths: ["/meaning"] },
  "meaning-en": { key: "meaning-en", label: "看中文选英文", paths: ["/meaning-en"] },
  expressions: { key: "expressions", label: "高频表达", paths: ["/expressions"] }
});

const MODULE_BY_PATH = new Map(
  Object.values(EFFECTIVE_STUDY_MODULES).flatMap((module) =>
    module.paths.map((path) => [path, module])
  )
);

export function resolveEffectiveStudyModule(pathname = "/") {
  return MODULE_BY_PATH.get(String(pathname || "/")) || null;
}

export function getEffectiveStudyModule(moduleKey) {
  return EFFECTIVE_STUDY_MODULES[String(moduleKey || "")] || null;
}

export function toEffectiveStudyDayKey(now = Date.now()) {
  const date = new Date(now);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getRecentEffectiveStudyDays(count = 14, now = Date.now()) {
  const safeCount = Math.max(1, Math.floor(Number(count) || 14));
  const current = new Date(now);
  current.setHours(12, 0, 0, 0);
  return Array.from({ length: safeCount }, (_, index) => {
    const date = new Date(current);
    date.setDate(current.getDate() - (safeCount - index - 1));
    return {
      key: toEffectiveStudyDayKey(date.getTime()),
      date
    };
  });
}

function normalizeDayModules(modules) {
  const normalized = {};
  for (const [moduleKey, value] of Object.entries(modules || {})) {
    if (!EFFECTIVE_STUDY_MODULES[moduleKey]) continue;
    const activeMs = Math.max(0, Number(value || 0));
    if (activeMs > 0) normalized[moduleKey] = activeMs;
  }
  return normalized;
}

export function normalizeEffectiveStudyHistory(value) {
  const days = {};
  for (const [dayKey, dayValue] of Object.entries(value?.days || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) continue;
    const modules = normalizeDayModules(dayValue?.modules || dayValue);
    if (Object.keys(modules).length) days[dayKey] = { modules };
  }
  return { version: EFFECTIVE_STUDY_TIME_VERSION, days };
}

export function readEffectiveStudyHistory(storage = globalThis.localStorage) {
  if (!storage?.getItem) return normalizeEffectiveStudyHistory(null);
  try {
    const raw = storage.getItem(EFFECTIVE_STUDY_TIME_STORAGE_KEY);
    return normalizeEffectiveStudyHistory(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeEffectiveStudyHistory(null);
  }
}

function pruneHistory(history, now = Date.now()) {
  const latestStoredDay = Object.keys(history.days || {}).reduce((latest, dayKey) => {
    const timestamp = new Date(`${dayKey}T12:00:00`).getTime();
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);
  const referenceNow = Math.max(Number(now || 0), latestStoredDay);
  const keep = new Set(
    getRecentEffectiveStudyDays(EFFECTIVE_STUDY_HISTORY_DAYS, referenceNow).map((entry) => entry.key)
  );
  const days = {};
  for (const [dayKey, dayValue] of Object.entries(history.days || {})) {
    if (keep.has(dayKey)) days[dayKey] = dayValue;
  }
  return { ...history, days };
}

export function writeEffectiveStudyHistory(history, storage = globalThis.localStorage, now = Date.now()) {
  const normalized = pruneHistory(normalizeEffectiveStudyHistory(history), now);
  if (storage?.setItem) {
    storage.setItem(EFFECTIVE_STUDY_TIME_STORAGE_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

export function getEffectiveStudyModuleMs(history, moduleKey, dayKey) {
  return Math.max(0, Number(history?.days?.[dayKey]?.modules?.[moduleKey] || 0));
}

export function addEffectiveStudyDuration(moduleKey, activeMs, options = {}) {
  if (!EFFECTIVE_STUDY_MODULES[moduleKey]) return readEffectiveStudyHistory(options.storage);
  const duration = Math.max(0, Number(activeMs || 0));
  if (!duration) return readEffectiveStudyHistory(options.storage);

  const now = Number(options.now ?? Date.now());
  const storage = options.storage || globalThis.localStorage;
  const dayKey = options.dayKey || toEffectiveStudyDayKey(now);
  const history = readEffectiveStudyHistory(storage);
  const previous = getEffectiveStudyModuleMs(history, moduleKey, dayKey);
  const next = {
    ...history,
    days: {
      ...history.days,
      [dayKey]: {
        modules: {
          ...(history.days[dayKey]?.modules || {}),
          [moduleKey]: previous + duration
        }
      }
    }
  };
  const written = writeEffectiveStudyHistory(next, storage, now);
  notifyEffectiveStudyTimeUpdated({ moduleKey, dayKey, activeMs: duration });
  return written;
}

export function addEffectiveStudyInterval(moduleKey, startedAt, endedAt, options = {}) {
  let cursor = Math.max(0, Number(startedAt || 0));
  const end = Math.max(cursor, Number(endedAt || cursor));
  let history = readEffectiveStudyHistory(options.storage);

  while (cursor < end) {
    const nextMidnight = new Date(cursor);
    nextMidnight.setHours(24, 0, 0, 0);
    const chunkEnd = Math.min(end, nextMidnight.getTime());
    history = addEffectiveStudyDuration(moduleKey, chunkEnd - cursor, {
      ...options,
      now: chunkEnd,
      dayKey: toEffectiveStudyDayKey(cursor)
    });
    cursor = chunkEnd;
  }

  return history;
}

export function formatEffectiveStudyTime(activeMs = 0, options = {}) {
  const milliseconds = Math.max(0, Number(activeMs || 0));
  const totalSeconds = milliseconds > 0 ? Math.max(1, Math.round(milliseconds / 1_000)) : 0;
  if (!totalSeconds) return options.compact ? "0分" : "0 分钟";
  if (totalSeconds < 60) return options.compact ? `${totalSeconds}秒` : `${totalSeconds} 秒`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return options.compact ? `${totalMinutes}分` : `${totalMinutes} 分钟`;
  if (!minutes) return options.compact ? `${hours}时` : `${hours} 小时`;
  return options.compact ? `${hours}时${minutes}分` : `${hours} 小时 ${minutes} 分`;
}

export function getEffectiveStudyIntensity(activeMs = 0) {
  const minutes = Math.max(0, Number(activeMs || 0)) / 60_000;
  if (!minutes) return 0;
  if (minutes < 10) return 1;
  if (minutes < 30) return 2;
  if (minutes < 60) return 3;
  return 4;
}

export function calculateEffectiveStudyStreak(history, moduleKey, now = Date.now()) {
  let streak = 0;
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  while (getEffectiveStudyModuleMs(history, moduleKey, toEffectiveStudyDayKey(cursor.getTime())) > 0) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function notifyEffectiveStudyTimeUpdated(detail) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new CustomEvent(EFFECTIVE_STUDY_TIME_UPDATE_EVENT, { detail }));
}

export function notifyEffectiveStudyActivity(detail = {}) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new CustomEvent(EFFECTIVE_STUDY_ACTIVITY_EVENT, { detail }));
}

export function notifyEffectiveStudyModuleChange(moduleKey) {
  const module = getEffectiveStudyModule(moduleKey);
  if (!module || typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new CustomEvent(EFFECTIVE_STUDY_MODULE_CHANGE_EVENT, {
    detail: { moduleKey: module.key }
  }));
}

const LEGACY_SPELLING_IMPORT_KEY = "ielts_effective_study_time_spelling_import_v1";

export function migrateLegacySpellingActiveTime(storage = globalThis.localStorage, now = Date.now()) {
  if (!storage?.getItem || !storage?.setItem) return readEffectiveStudyHistory(storage);
  const dayKey = toEffectiveStudyDayKey(now);
  try {
    const marker = JSON.parse(storage.getItem(LEGACY_SPELLING_IMPORT_KEY) || "null");
    if (marker?.date === dayKey) return readEffectiveStudyHistory(storage);
  } catch {}

  const imports = [
    ["word", "spelling-words"],
    ["phrase", "spelling-phrases"]
  ];
  let history = readEffectiveStudyHistory(storage);
  const imported = {};
  for (const [scope, moduleKey] of imports) {
    let activeMs = 0;
    try {
      const value = JSON.parse(storage.getItem(`ielts-vocab:spelling-daily-stats:${scope}`) || "null");
      if (value?.date === dayKey) activeMs = Math.max(0, Number(value.activeMs || 0));
    } catch {}
    imported[scope] = activeMs;
    if (activeMs > 0) {
      history = addEffectiveStudyDuration(moduleKey, activeMs, { storage, now, dayKey });
    }
  }
  storage.setItem(LEGACY_SPELLING_IMPORT_KEY, JSON.stringify({ date: dayKey, imported }));
  return history;
}
