import {
  PERSONAL_WRONG_BOOK_STORAGE_KEY,
  dedupePersonalWrongBookRecords
} from "./personal-wrong-book.mjs";

export function spellingUxPrefsKey(scope) {
  return `ielts-vocab:spelling-ux:${scope}`;
}

export function spellingPositionKey(scope) {
  return `ielts-vocab:spelling-position:${scope}`;
}

export function spellingDailyStatsKey(scope) {
  return `ielts-vocab:spelling-daily-stats:${scope}`;
}

export function readJsonFromLocalStorage(key, fallback = null) {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJsonToLocalStorage(key, value) {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readPersonalWrongBookRecords() {
  const records = readJsonFromLocalStorage(PERSONAL_WRONG_BOOK_STORAGE_KEY, []);
  return dedupePersonalWrongBookRecords(records).records;
}

export function writePersonalWrongBookRecords(records) {
  return writeJsonToLocalStorage(
    PERSONAL_WRONG_BOOK_STORAGE_KEY,
    dedupePersonalWrongBookRecords(records).records
  );
}
