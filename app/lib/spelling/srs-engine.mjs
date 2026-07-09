import { MS_PER_DAY, SPELLING_REPAIR_CONFIG } from "./config.mjs";

function asRecordList(records = []) {
  if (Array.isArray(records)) return records;
  if (records && typeof records === "object") return Object.values(records);
  return [];
}

export function createSrsEngine(options = {}) {
  const intervalsDays = Array.isArray(options.intervalsDays)
    ? options.intervalsDays
    : SPELLING_REPAIR_CONFIG.longTermIntervalsDays;

  function getDueSrsWords(records = [], now = Date.now()) {
    const currentTime = Number(now || Date.now());

    return asRecordList(records).filter((record) => {
      const nextReviewAt = Number(record?.srs?.nextReviewAt || record?.nextReviewAt || 0);
      return nextReviewAt > 0 && nextReviewAt <= currentTime;
    });
  }

  function scheduleNext(wordId, stage = 0, now = Date.now()) {
    const currentStage = Number(stage || 0);
    const nextStage = Math.min(currentStage + 1, intervalsDays.length);
    const intervalDays = intervalsDays[Math.max(0, nextStage - 1)] || 0;
    const reviewedAt = Number(now || Date.now());

    return {
      wordId: String(wordId || ""),
      stage: nextStage,
      lastReviewedAt: reviewedAt,
      nextReviewAt: intervalDays ? reviewedAt + intervalDays * MS_PER_DAY : 0
    };
  }

  function resetAfterWrong(wordId) {
    return {
      wordId: String(wordId || ""),
      stage: 0,
      lastReviewedAt: 0,
      nextReviewAt: 0
    };
  }

  return {
    getDueSrsWords,
    scheduleNext,
    resetAfterWrong
  };
}
