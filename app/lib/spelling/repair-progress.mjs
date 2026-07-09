import { MS_PER_MINUTE, SPELLING_REPAIR_CONFIG } from "./config.mjs";

export const REPAIR_STATES = {
  NORMAL: "normal",
  IN_REPAIR: "in_repair",
  MASTERED: "mastered"
};

const LEGACY_REPAIR_STATE_MAP = {
  must_repair: REPAIR_STATES.IN_REPAIR,
  waiting_second: REPAIR_STATES.IN_REPAIR,
  done_today: REPAIR_STATES.MASTERED
};

export function normalizeRepairState(state = "normal") {
  return LEGACY_REPAIR_STATE_MAP[state] || state || REPAIR_STATES.NORMAL;
}

export function isInRepairState(record) {
  return normalizeRepairState(record?.today?.repairState) === REPAIR_STATES.IN_REPAIR;
}

export function isMasteredState(record) {
  return normalizeRepairState(record?.today?.repairState) === REPAIR_STATES.MASTERED
    || Boolean(record?.today?.completedToday);
}

export function getRepairStreak(record) {
  const today = record?.today || {};
  if (Number.isFinite(Number(today.repairStreak))) {
    return Math.max(0, Number(today.repairStreak));
  }

  return Math.max(0, Number(today.repairCorrectCount || 0));
}

export function getRepairStreakRequired(record) {
  const totalWrongCount = Number(record?.errorBank?.totalWrongCount || 0);
  return totalWrongCount >= SPELLING_REPAIR_CONFIG.highErrorThreshold
    ? SPELLING_REPAIR_CONFIG.repairStreakRequiredHighError
    : SPELLING_REPAIR_CONFIG.repairStreakRequired;
}

export function getRepairProgress(record) {
  const streak = getRepairStreak(record);
  const required = getRepairStreakRequired(record);

  return {
    streak,
    required,
    label: `${streak}/${required}`,
    isComplete: streak >= required,
    inRepair: isInRepairState(record)
  };
}

export function formatRepairProgressLabel(record) {
  const progress = getRepairProgress(record);
  return `Repair Progress: ${progress.label}`;
}

export function normalizeTodayRepairFields(today = {}) {
  const repairState = normalizeRepairState(today.repairState);
  const repairStreak = getRepairStreak({ today });

  return {
    ...today,
    repairState,
    repairStreak,
    repairCorrectCount: repairStreak,
    completedToday: Boolean(today.completedToday) || repairState === REPAIR_STATES.MASTERED
  };
}

export function isRepairRevisitEligible(record, options = {}) {
  const current = { today: normalizeTodayRepairFields(record?.today || {}) };
  const now = Number(options.now || Date.now());
  const sequence = Number(options.sequence || 0);
  const today = current.today;

  if (today.repairState !== REPAIR_STATES.IN_REPAIR) return false;
  if (today.repairLocked) return false;
  if (now < Number(today.nextEligibleAt || 0)) return false;
  if ((sequence - Number(today.lastSeenSequence || 0)) < Number(today.minOtherWordsBeforeNext || 0)) {
    return false;
  }

  return true;
}

export function isRepairRevisitForced(record, options = {}) {
  const current = { today: normalizeTodayRepairFields(record?.today || {}) };
  const now = Number(options.now || Date.now());
  const sequence = Number(options.sequence || 0);
  const today = current.today;

  if (today.repairState !== REPAIR_STATES.IN_REPAIR) return false;

  const otherWordsWaited = sequence - Number(today.lastSeenSequence || 0);
  const minutesWaited = (now - Number(today.lastSeenAt || 0)) / MS_PER_MINUTE;

  return (
    otherWordsWaited >= SPELLING_REPAIR_CONFIG.forceRepairReviewAfterOtherWords
    || minutesWaited >= SPELLING_REPAIR_CONFIG.forceRepairReviewAfterMinutes
  );
}

export function computeRepairSessionStats(records = {}, sessionWordIds = []) {
  const ids = Array.isArray(sessionWordIds) ? sessionWordIds.filter(Boolean) : Object.keys(records || {});
  let newWordsPassed = 0;
  let repairingCount = 0;
  let repairedCount = 0;
  let masteredCount = 0;

  for (const wordId of ids) {
    const record = records[wordId];
    if (!record) continue;

    const state = normalizeRepairState(record.today?.repairState);

    if (state === REPAIR_STATES.IN_REPAIR) {
      repairingCount += 1;
      continue;
    }

    if (!isMasteredState(record)) continue;

    masteredCount += 1;
    if (record.today?.passedViaRepair) {
      repairedCount += 1;
    } else if (record.today?.passedViaNew || !record.errorBank?.everWrong) {
      newWordsPassed += 1;
    }
  }

  return {
    newWordsPassed,
    repairingCount,
    repairedCount,
    masteredCount
  };
}

// Backward-compatible aliases used by older modules/tests during migration.
export const isWaitingSecondEligible = isRepairRevisitEligible;
export const isWaitingSecondForced = isRepairRevisitForced;