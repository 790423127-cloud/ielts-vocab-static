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
