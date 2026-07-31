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
  normalizeWord,
  sortQueue,
  orderedQueue
}) {
  const sourceWords = Array.isArray(words) ? words : [];
  if (!Number.isInteger(currentIndex) || !sourceWords[currentIndex]) return null;
  if (typeof wordMatchesFilter !== "function" || typeof normalizeWord !== "function") return null;

  const targetKey = normalizeWord(sourceWords[currentIndex]?.word);
  if (!targetKey) return null;

  const visibleQueue = Array.isArray(orderedQueue)
    ? orderedQueue
      .map((entry) => (
        Number.isInteger(entry)
          ? entry
          : Number.isInteger(entry?.originalIndex)
            ? entry.originalIndex
            : -1
      ))
      .filter((sourceIndex) => (
        sourceIndex >= 0
        && sourceWords[sourceIndex]
        && wordMatchesFilter(sourceWords[sourceIndex], filter, sourceIndex)
      ))
    : [];
  const oldQueue = [];
  if (visibleQueue.length) {
    oldQueue.push(...visibleQueue);
  } else {
    for (let sourceIndex = 0; sourceIndex < sourceWords.length; sourceIndex += 1) {
      if (wordMatchesFilter(sourceWords[sourceIndex], filter, sourceIndex)) oldQueue.push(sourceIndex);
    }
  }
  const sortedOldQueue = visibleQueue.length || typeof sortQueue !== "function"
    ? oldQueue
    : sortQueue(oldQueue, sourceWords, filter);

  const oldPosition = sortedOldQueue.indexOf(currentIndex);
  const nextWords = [];
  const oldToNewIndex = new Map();
  let deletedCount = 0;

  for (let sourceIndex = 0; sourceIndex < sourceWords.length; sourceIndex += 1) {
    const word = sourceWords[sourceIndex];
    if (normalizeWord(word?.word) === targetKey) {
      deletedCount += 1;
      continue;
    }

    const nextIndex = nextWords.length;
    nextWords.push(word);
    oldToNewIndex.set(sourceIndex, nextIndex);
  }

  if (!deletedCount) return null;

  let sortedNextQueue;
  let nextQueuePosition = -1;
  if (visibleQueue.length) {
    sortedNextQueue = [];
    let survivorsBeforeCurrent = 0;

    sortedOldQueue.forEach((sourceIndex, queuePosition) => {
      const nextIndex = oldToNewIndex.get(sourceIndex);
      if (!Number.isInteger(nextIndex)) return;
      if (!wordMatchesFilter(nextWords[nextIndex], filter, nextIndex)) return;
      if (oldPosition >= 0 && queuePosition < oldPosition) survivorsBeforeCurrent += 1;
      sortedNextQueue.push(nextIndex);
    });

    if (oldPosition >= 0) {
      nextQueuePosition = Math.min(survivorsBeforeCurrent, sortedNextQueue.length - 1);
    }
  } else {
    const nextQueue = [];
    for (let nextIndex = 0; nextIndex < nextWords.length; nextIndex += 1) {
      if (wordMatchesFilter(nextWords[nextIndex], filter, nextIndex)) nextQueue.push(nextIndex);
    }
    sortedNextQueue = typeof sortQueue === "function"
      ? sortQueue(nextQueue, nextWords, filter)
      : nextQueue;
  }

  let nextIndex = 0;
  if (sortedNextQueue.length) {
    const queuePosition = nextQueuePosition >= 0
      ? nextQueuePosition
      : oldPosition >= 0
        ? Math.min(oldPosition, sortedNextQueue.length - 1)
        : resolveMissingQueuePosition(
          sortedNextQueue,
          Math.min(currentIndex, Math.max(0, nextWords.length - 1)),
          "next"
        );
    nextIndex = sortedNextQueue[Math.max(0, queuePosition)];
  } else if (nextWords.length) {
    nextIndex = Math.min(currentIndex, nextWords.length - 1);
  }

  return {
    words: nextWords,
    index: nextIndex,
    queueIndices: sortedNextQueue,
    queuePosition: sortedNextQueue.indexOf(nextIndex),
    queueLength: sortedNextQueue.length,
    deletedCount,
    targetKey
  };
}
