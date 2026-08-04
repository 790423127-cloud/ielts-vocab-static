/**
 * Pure helpers for study-queue delete landing.
 * Always advance by stable entry id inside the *current visible queue order*
 * (easy→hard / frozen / etc), never by raw items[] position alone.
 */

/**
 * @param {Array<{ entry?: { id?: string }, originalIndex?: number }>} studyList
 * @param {string} currentEntryId
 * @returns {{
 *   pos: number,
 *   nextList: typeof studyList,
 *   landingPos: number,
 *   landingRow: any,
 *   landingEntryId: string,
 *   landingOriginalIndex: number
 * } | null}
 */
export function advanceStudyQueueAfterDelete(studyList, currentEntryId) {
  const list = Array.isArray(studyList) ? studyList : [];
  const id = String(currentEntryId || "").trim();
  if (!id || !list.length) return null;

  const pos = list.findIndex((row) => String(row?.entry?.id || "").trim() === id);
  if (pos < 0) return null;

  const nextList = list.filter((row) => String(row?.entry?.id || "").trim() !== id);
  if (!nextList.length) {
    return {
      pos,
      nextList,
      landingPos: -1,
      landingRow: null,
      landingEntryId: "",
      landingOriginalIndex: 0
    };
  }

  // After removal, the old successor at pos+1 slides into `pos`.
  // If we deleted the last card, land on the previous survivor.
  const landingPos = Math.min(pos, nextList.length - 1);
  const landingRow = nextList[landingPos] || null;
  const landingEntryId = String(landingRow?.entry?.id || "").trim();
  const landingOriginalIndex = Number.isInteger(landingRow?.originalIndex)
    ? landingRow.originalIndex
    : 0;

  return {
    pos,
    nextList,
    landingPos,
    landingRow,
    landingEntryId,
    landingOriginalIndex
  };
}

function studyQueueEntryId(row) {
  return String(row?.entry?.id || "").trim();
}

/**
 * Advance after the focused card leaves the current queue for any reason
 * (physical delete, "熟悉" removing it from pending, unmarking inside 不熟 list).
 * The landing is computed inside the visible ordered queue first, then narrowed
 * to rows that still exist in the rebuilt eligible queue.
 *
 * @param {Array<{ entry?: { id?: string }, originalIndex?: number }>} studyList
 * @param {string} currentEntryId
 * @param {Array<{ entry?: { id?: string }, originalIndex?: number }>} eligibleRows
 */
export function advanceStudyQueueAfterExit(studyList, currentEntryId, eligibleRows = null) {
  const advanced = advanceStudyQueueAfterDelete(studyList, currentEntryId);
  if (!advanced) return null;

  const eligibleList = Array.isArray(eligibleRows) ? eligibleRows : [];
  const eligibleIds = new Set(
    eligibleList
      .map(studyQueueEntryId)
      .filter(Boolean)
  );
  const nextList = eligibleIds.size
    ? advanced.nextList.filter((row) => eligibleIds.has(studyQueueEntryId(row)))
    : advanced.nextList;

  if (!nextList.length) {
    return {
      ...advanced,
      nextList,
      landingPos: -1,
      landingRow: null,
      landingEntryId: "",
      landingOriginalIndex: 0
    };
  }

  const preferredId = advanced.landingEntryId;
  let landingPos = preferredId
    ? nextList.findIndex((row) => studyQueueEntryId(row) === preferredId)
    : -1;
  if (landingPos < 0) {
    landingPos = Math.min(Math.max(0, advanced.landingPos), nextList.length - 1);
  }
  const landingRow = nextList[landingPos] || null;
  const landingEntryId = studyQueueEntryId(landingRow);
  const landingOriginalIndex = Number.isInteger(landingRow?.originalIndex)
    ? landingRow.originalIndex
    : 0;

  return {
    ...advanced,
    nextList,
    landingPos,
    landingRow,
    landingEntryId,
    landingOriginalIndex
  };
}

/**
 * Resolve which entry id the user is currently viewing.
 * Prefer explicit focus id, then study-queue match by originalIndex, then items[index].
 */
export function resolveCurrentStudyEntryId({
  focusEntryId,
  studyList,
  items,
  index
}) {
  const focus = String(focusEntryId || "").trim();
  const list = Array.isArray(studyList) ? studyList : [];
  // 1) Explicit focus id only if it still exists in the active queue.
  if (focus && list.some((row) => String(row?.entry?.id || "").trim() === focus)) {
    return focus;
  }
  // 2) Match the numeric index against the active queue (ordered / frozen).
  if (Number.isInteger(index)) {
    const byIndex = list.find((row) => row?.originalIndex === index);
    if (byIndex?.entry?.id) return String(byIndex.entry.id).trim();
  }
  // 3) If focus id is set but missing from the queue, do NOT fall back to list[0]
  //    (that is the classic "jumped to another word" bug after delete).
  if (focus) return focus;
  // 4) Last resort: items[index] id (initial load before focus is seeded).
  if (Number.isInteger(index) && Array.isArray(items) && items[index]?.id) {
    return String(items[index].id).trim();
  }
  return "";
}
