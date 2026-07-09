import {
  PHRASE_FLASHCARD_POSITIONS_KEY,
  PHRASE_FLASHCARD_PROGRESS_POSITIONS_KEY,
  PHRASE_FLASHCARD_PROGRESS_SESSION_KEY,
  PHRASE_FLASHCARD_SESSION_KEY
} from "./phrase-flashcard-keys.mjs";
import { readWithLegacyFallback } from "./progress-schema.mjs";
import { readJsonStorage, writeJsonStorage as writeBrowserJsonStorage } from "../browser-storage.mjs";

export function readPhraseFlashEntryPositions() {
  const { value, migrated } = readWithLegacyFallback(
    (key) => readJsonStorage(key, null),
    PHRASE_FLASHCARD_PROGRESS_POSITIONS_KEY,
    [PHRASE_FLASHCARD_POSITIONS_KEY],
    {}
  );

  if (migrated && value && typeof value === "object") {
    writeBrowserJsonStorage(PHRASE_FLASHCARD_PROGRESS_POSITIONS_KEY, value);
  }

  return value && typeof value === "object" ? value : {};
}

export function readPhraseFlashSession() {
  const { value, migrated } = readWithLegacyFallback(
    (key) => readJsonStorage(key, null),
    PHRASE_FLASHCARD_PROGRESS_SESSION_KEY,
    [PHRASE_FLASHCARD_SESSION_KEY],
    null
  );

  if (migrated && value && typeof value === "object") {
    writeBrowserJsonStorage(PHRASE_FLASHCARD_PROGRESS_SESSION_KEY, value);
  }

  return value && typeof value === "object" ? value : null;
}

export function writePhraseFlashEntryPositions(value) {
  const savedLegacy = writeBrowserJsonStorage(PHRASE_FLASHCARD_POSITIONS_KEY, value);
  const savedPrimary = writeBrowserJsonStorage(PHRASE_FLASHCARD_PROGRESS_POSITIONS_KEY, value);
  return savedLegacy && savedPrimary;
}

export function writePhraseFlashSession(value) {
  const savedLegacy = writeBrowserJsonStorage(PHRASE_FLASHCARD_SESSION_KEY, value);
  const savedPrimary = writeBrowserJsonStorage(PHRASE_FLASHCARD_PROGRESS_SESSION_KEY, value);
  return savedLegacy && savedPrimary;
}

export function clearPhraseFlashProgress() {
  if (typeof localStorage === "undefined") return;
  [
    PHRASE_FLASHCARD_PROGRESS_SESSION_KEY,
    PHRASE_FLASHCARD_PROGRESS_POSITIONS_KEY,
    PHRASE_FLASHCARD_SESSION_KEY,
    PHRASE_FLASHCARD_POSITIONS_KEY
  ].forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {}
  });
}