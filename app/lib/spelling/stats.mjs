import {
  REPAIR_STATES,
  computeRepairSessionStats,
  isMasteredState,
  normalizeRepairState
} from "./repair-progress.mjs";

export function getTodayStats(records = {}, options = {}) {
  const now = Number(options.now || Date.now());
  const candidateWordIds = Array.isArray(options.candidateWordIds)
    ? options.candidateWordIds.filter(Boolean)
    : Object.keys(records || {});

  let todaySpellingRemainingCount = 0;
  let todayRepairPendingCount = 0;
  let todaySrsDueCount = 0;

  for (const wordId of candidateWordIds) {
    const record = records[wordId];
    const state = normalizeRepairState(record?.today?.repairState);

    if (state === REPAIR_STATES.IN_REPAIR) {
      todayRepairPendingCount += 1;
    } else if (!isMasteredState(record)) {
      todaySpellingRemainingCount += 1;
    }

    if (Number(record?.srs?.nextReviewAt || 0) > 0 && record.srs.nextReviewAt <= now) {
      todaySrsDueCount += 1;
    }
  }

  const repairStats = computeRepairSessionStats(records, candidateWordIds);

  return {
    todaySpellingRemainingCount,
    todayRepairPendingCount,
    todaySrsDueCount,
    newWordsPassed: repairStats.newWordsPassed,
    repairingCount: repairStats.repairingCount,
    repairedCount: repairStats.repairedCount,
    masteredCount: repairStats.masteredCount,
    isCompletedToday: candidateWordIds.length > 0 &&
      todaySpellingRemainingCount === 0 &&
      todayRepairPendingCount === 0
  };
}