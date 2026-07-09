import {
  REPAIR_STATES,
  isMasteredState,
  isRepairRevisitEligible,
  isRepairRevisitForced,
  normalizeRepairState
} from "./repair-progress.mjs";

function findByPriority(candidateWordIds, records, predicate, lastWordId) {
  const candidates = candidateWordIds.filter((wordId) => predicate(records[wordId], wordId));
  if (!candidates.length) return "";

  return candidates.find((wordId) => wordId !== lastWordId) || candidates[0];
}

function findOldestByPriority(candidateWordIds, records, predicate, lastWordId) {
  const candidates = candidateWordIds
    .filter((wordId) => predicate(records[wordId], wordId))
    .map((wordId, index) => ({
      wordId,
      index,
      lastSeenSequence: Number(records[wordId]?.today?.lastSeenSequence || 0),
      lastSeenAt: Number(records[wordId]?.today?.lastSeenAt || 0)
    }));

  if (!candidates.length) return "";

  candidates.sort((left, right) => (
    left.lastSeenSequence - right.lastSeenSequence
    || left.lastSeenAt - right.lastSeenAt
    || Number(left.wordId === lastWordId) - Number(right.wordId === lastWordId)
    || left.index - right.index
  ));

  return candidates[0].wordId;
}

export function selectNextSpellingWord(options = {}) {
  const candidateWordIds = Array.isArray(options.candidateWordIds) ? options.candidateWordIds.filter(Boolean) : [];
  const records = options.records || {};
  const now = Number(options.now || Date.now());
  const sequence = Number(options.sequence || 0);
  const lastWordId = options.lastWordId || "";

  const lockedRepair = findByPriority(
    candidateWordIds,
    records,
    (record) => normalizeRepairState(record?.today?.repairState) === REPAIR_STATES.IN_REPAIR
      && Boolean(record?.today?.repairLocked),
    lastWordId
  );

  if (lockedRepair) return { wordId: lockedRepair, source: "in_repair_locked" };

  const forcedRepair = findByPriority(
    candidateWordIds,
    records,
    (record) => isRepairRevisitForced(record, { now, sequence }),
    lastWordId
  );

  if (forcedRepair) return { wordId: forcedRepair, source: "in_repair_forced" };

  const waitingRepair = findByPriority(
    candidateWordIds,
    records,
    (record) => isRepairRevisitEligible(record, { now, sequence }),
    lastWordId
  );

  if (waitingRepair) return { wordId: waitingRepair, source: "in_repair" };

  const dueSrs = findByPriority(
    candidateWordIds,
    records,
    (record) => record?.srs?.nextReviewAt > 0 && record.srs.nextReviewAt <= now,
    lastWordId
  );

  if (dueSrs) return { wordId: dueSrs, source: "srs_due" };

  const ordinary = findByPriority(
    candidateWordIds,
    records,
    (record, wordId) => {
      if (!wordId || isMasteredState(record)) return false;
      const state = normalizeRepairState(record?.today?.repairState);
      return state === REPAIR_STATES.NORMAL;
    },
    lastWordId
  );

  if (ordinary) return { wordId: ordinary, source: "ordinary" };

  if (options.allowRepairSpacingFallback === true) {
    const onlyRemainingRepair = findOldestByPriority(
      candidateWordIds,
      records,
      (record) => normalizeRepairState(record?.today?.repairState) === REPAIR_STATES.IN_REPAIR,
      lastWordId
    );

    if (onlyRemainingRepair) {
      return { wordId: onlyRemainingRepair, source: "in_repair_only_remaining" };
    }
  }

  return { wordId: "", source: "empty" };
}

export function getSpellingTodayStats(records = {}, now = Date.now()) {
  const list = Object.values(records || {});

  return {
    todaySpellingRemainingCount: list.filter((record) => {
      const state = normalizeRepairState(record?.today?.repairState);
      return record?.today?.activeInTodayList && state === REPAIR_STATES.NORMAL;
    }).length,
    todayRepairPendingCount: list.filter((record) => (
      normalizeRepairState(record?.today?.repairState) === REPAIR_STATES.IN_REPAIR
    )).length,
    todayNewWrongCount: list.filter((record) => record?.errorBank?.latestWrongAt && record.errorBank.latestWrongAt <= now && record?.today?.sessionDate).length,
    spellingLongTermReviewDueCount: list.filter((record) => record?.srs?.nextReviewAt > 0 && record.srs.nextReviewAt <= now).length,
    isTodaySpellingCompleted: !list.some((record) => {
      const state = normalizeRepairState(record?.today?.repairState);
      return record?.today?.activeInTodayList || state === REPAIR_STATES.IN_REPAIR;
    })
  };
}
