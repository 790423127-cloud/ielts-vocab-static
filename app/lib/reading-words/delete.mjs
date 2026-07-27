function normalizeId(value) {
  return String(value || "").trim();
}

function entryId(entry = {}) {
  return normalizeId(entry.id || entry.wordId);
}

// Reading-list deletion is isolated from the main lexicon and other learning stores.
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
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target;
  const tag = String(target?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) return false;
  const key = String(event.key || "").toLowerCase();
  const code = String(event.code || "");
  return key === "d" || key === "delete" || code === "Delete";
}
