import {
  readJsonFromLocalStorage,
  spellingUxPrefsKey,
  writeJsonToLocalStorage
} from "./spelling-training-storage.mjs";

export const DEFAULT_SPELLING_PREFS = {
  categoryType: "difficulty",
  categoryValue: "基础高频",
  batchIndex: 0
};

export function readSpellingUxPrefs(scope) {
  return readJsonFromLocalStorage(spellingUxPrefsKey(scope), {});
}

export function writeSpellingUxPrefs(scope, prefs) {
  return writeJsonToLocalStorage(spellingUxPrefsKey(scope), prefs);
}

export function resolveSpellingPrefs(scope, fallback = DEFAULT_SPELLING_PREFS) {
  const saved = readSpellingUxPrefs(scope);
  return {
    categoryType: saved.categoryType || fallback.categoryType,
    categoryValue: saved.categoryValue || fallback.categoryValue,
    batchIndex: Number.isInteger(saved.batchIndex) ? saved.batchIndex : fallback.batchIndex
  };
}