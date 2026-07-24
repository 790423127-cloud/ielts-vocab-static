/**
 * Resolve navigation when the current numeric index was removed from a filtered queue.
 * This happens after deleting a word because all later source indices shift left.
 */
export function resolveMissingQueuePosition(queue, currentIndex, direction = "next") {
  const indices = Array.isArray(queue) ? queue : [];
  if (!indices.length) return -1;

  if (direction === "next") {
    const nextPosition = indices.findIndex((queueIndex) => queueIndex > currentIndex);
    return nextPosition >= 0 ? nextPosition : 0;
  }

  for (let position = indices.length - 1; position >= 0; position -= 1) {
    if (indices[position] < currentIndex) return position;
  }
  return indices.length - 1;
}

/**
 * Build the exact words/index pair that must be committed in the same event as a
 * deletion. Keeping the next index inside the rebuilt filter queue prevents a
 * transient render of queue[0] before React settles on the real successor.
 */
export function buildAtomicDeletionNavigation({
  words,
  currentIndex,
  filter,
  wordMatchesFilter,
  normalizeWord
}) {
  const sourceWords = Array.isArray(words) ? words : [];
  if (!Number.isInteger(currentIndex) || !sourceWords[currentIndex]) return null;
  if (typeof wordMatchesFilter !== "function" || typeof normalizeWord !== "function") return null;

  const targetKey = normalizeWord(sourceWords[currentIndex]?.word);
  if (!targetKey) return null;

  const oldQueue = [];
  for (let sourceIndex = 0; sourceIndex < sourceWords.length; sourceIndex += 1) {
    if (wordMatchesFilter(sourceWords[sourceIndex], filter)) oldQueue.push(sourceIndex);
  }

  const oldPosition = oldQueue.indexOf(currentIndex);
  const nextWords = [];
  const nextQueue = [];
  let deletedCount = 0;

  for (const word of sourceWords) {
    if (normalizeWord(word?.word) === targetKey) {
      deletedCount += 1;
      continue;
    }

    const nextIndex = nextWords.length;
    nextWords.push(word);
    if (wordMatchesFilter(word, filter)) nextQueue.push(nextIndex);
  }

  if (!deletedCount) return null;

  let nextIndex = 0;
  if (nextQueue.length) {
    const queuePosition = oldPosition >= 0
      ? Math.min(oldPosition, nextQueue.length - 1)
      : resolveMissingQueuePosition(nextQueue, Math.min(currentIndex, Math.max(0, nextWords.length - 1)), "next");
    nextIndex = nextQueue[Math.max(0, queuePosition)];
  } else if (nextWords.length) {
    nextIndex = Math.min(currentIndex, nextWords.length - 1);
  }

  return {
    words: nextWords,
    index: nextIndex,
    queueLength: nextQueue.length,
    deletedCount,
    targetKey
  };
}
