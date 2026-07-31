/**
 * Shared study-session restore/persist coordination.
 * Prevents stale index=0 from being written before React applies a restored index.
 */

export const STUDY_SESSION_SCHEMA_VERSION = 2;

/**
 * @typedef {object} StudyRestoreController
 * @property {boolean} restored
 * @property {boolean} userAdjusted
 * @property {boolean} persistBlocked
 * @property {number | null} restoreTargetIndex
 * @property {boolean} settling
 * @property {boolean} toastShown
 * @property {number} wordsGeneration
 */

/** @returns {StudyRestoreController} */
export function createStudyRestoreController() {
  return {
    restored: false,
    userAdjusted: false,
    persistBlocked: true,
    restoreTargetIndex: null,
    settling: false,
    toastShown: false,
    wordsGeneration: 0
  };
}

/**
 * Effective index for display/persist while React state is catching up.
 * @param {StudyRestoreController} controller
 * @param {number} currentIndex
 */
export function effectiveStudyIndex(controller, currentIndex) {
  if (
    controller.persistBlocked &&
    Number.isInteger(controller.restoreTargetIndex) &&
    controller.restoreTargetIndex >= 0 &&
    currentIndex !== controller.restoreTargetIndex
  ) {
    return controller.restoreTargetIndex;
  }
  return currentIndex;
}

/**
 * Whether index-driven persist should be skipped.
 * @param {StudyRestoreController} controller
 * @param {number} currentIndex
 */
export function shouldBlockStudyIndexPersist(controller, currentIndex) {
  if (!controller.restored) return true;
  if (!controller.persistBlocked) return false;
  if (!Number.isInteger(controller.restoreTargetIndex) || controller.restoreTargetIndex < 0) {
    return false;
  }
  return currentIndex !== controller.restoreTargetIndex;
}

/**
 * @param {StudyRestoreController} controller
 * @param {{ index: number, settling?: boolean }} result
 */
export function markStudyRestoreApplied(controller, { index, settling = false }) {
  controller.restored = true;
  controller.persistBlocked = true;
  controller.restoreTargetIndex = index >= 0 ? index : null;
  controller.settling = settling && index >= 0;
}

/**
 * @param {StudyRestoreController} controller
 * @param {number} currentIndex
 */
export function releaseStudyPersistBlock(controller, currentIndex) {
  if (!controller.persistBlocked) return false;
  if (controller.restoreTargetIndex === null) {
    controller.persistBlocked = false;
    return true;
  }
  if (currentIndex !== controller.restoreTargetIndex) return false;
  controller.persistBlocked = false;
  controller.restoreTargetIndex = null;
  controller.settling = false;
  return true;
}

/**
 * Page-load restore runs once; later vocab hydration only re-resolves by wordKey.
 * @param {StudyRestoreController} controller
 */
export function shouldRunFullStudyRestore(controller) {
  return !controller.restored && !controller.userAdjusted;
}

/**
 * @param {StudyRestoreController} controller
 * @param {{ wordKey?: string }} session
 */
export function shouldReResolveStudyIndex(controller, session) {
  return controller.restored && !controller.userAdjusted && Boolean(String(session?.wordKey || "").trim());
}

/**
 * Resolve index when switching filters. Falls back to first in-range word only for manual switches.
 */
export function resolveFilterSwitchIndex(resolveIndex, {
  words,
  entryPositions = {},
  filter,
  filterKey,
  wordMatchesFilter,
  normalizeWord,
  studyPool = null,
  findFirstInFilter
}) {
  const result = resolveIndex(words, {
    session: { filter },
    entryPositions,
    filter,
    wordMatchesFilter,
    filterKey,
    normalizeWord,
    studyPool
  });

  const outOfFilterReasons = new Set([
    "wordKeyOutOfFilter",
    "entryPositionOutOfFilter",
    "savedIndexOutOfFilter"
  ]);

  if (result.index >= 0 && !outOfFilterReasons.has(result.reason)) {
    return { ...result, switched: true };
  }

  const firstIndex = typeof findFirstInFilter === "function" ? findFirstInFilter(filter) : -1;
  if (firstIndex >= 0) {
    return { index: firstIndex, restored: false, reason: "filterFirst", filter, switched: true };
  }

  return { index: -1, restored: false, reason: "emptyFilter", filter, switched: true };
}
