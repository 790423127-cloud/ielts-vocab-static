function normalizeId(value) {
  return String(value || "").trim();
}

function entryId(entry = {}) {
  return normalizeId(entry?.id || entry?.wordId);
}

function normalizeWord(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
}

// Compute the reading-list half of a coordinated deletion without mutating input.
export function removeReadingWordEntry(words = [], selectedId = "", visibleWords = words) {
  const list = Array.isArray(words) ? words : [];
  const visible = Array.isArray(visibleWords) ? visibleWords : [];
  const targetId = normalizeId(selectedId);
  const removedIndex = list.findIndex((entry) => entryId(entry) === targetId);
  if (!targetId || removedIndex < 0) {
    return { words: list, removed: null, nextSelectedId: "" };
  }

  const visibleIndex = visible.findIndex((entry) => entryId(entry) === targetId);
  const nextVisible = visible[visibleIndex + 1] || visible[visibleIndex - 1] || null;
  return {
    words: list.filter((entry) => entryId(entry) !== targetId),
    removed: list[removedIndex],
    nextSelectedId: entryId(nextVisible)
  };
}

export function shouldHandleReadingWordDeleteShortcut(event = {}) {
  return shouldHandleStudyDeleteShortcut(event);
}

// Remove exactly the formal entry linked to the reading card. Stable ID is
// authoritative; normalized headword is only a fallback for legacy rows.
export function removeLinkedMainEntry(mainWords = [], linkedEntry = null) {
  const list = Array.isArray(mainWords) ? mainWords : [];
  const targetId = entryId(linkedEntry || {});
  const targetWord = normalizeWord(linkedEntry?.word);
  if (!targetId && !targetWord) {
    return { words: list, removed: [] };
  }

  const removed = [];
  const words = list.filter((entry) => {
    const matches = targetId
      ? entryId(entry) === targetId
      : normalizeWord(entry?.word) === targetWord;
    if (matches) removed.push(entry);
    return !matches;
  });
  return { words, removed };
}
import { shouldHandleStudyDeleteShortcut } from "../vocab/study-keyboard-shortcuts.mjs";
