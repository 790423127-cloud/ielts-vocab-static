import {
  readJsonFromLocalStorage,
  spellingUxPrefsKey,
  writeJsonToLocalStorage
} from "./spelling-training-storage.mjs";
import { SPELLING_ALL_DIFFICULTIES_VALUE } from "./spelling-categories.mjs";

export const DEFAULT_SPELLING_PREFS = {
  categoryType: "difficulty",
  categoryValue: SPELLING_ALL_DIFFICULTIES_VALUE,
  sortDirection: "easy_to_hard",
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
    sortDirection: saved.sortDirection || fallback.sortDirection,
    batchIndex: Number.isInteger(saved.batchIndex) ? saved.batchIndex : fallback.batchIndex
  };
}
