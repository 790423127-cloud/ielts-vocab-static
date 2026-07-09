import { computePersonalWrongBatchProgress } from "./personal-wrong-progress.mjs";
import { isMasteredState } from "./repair-progress.mjs";

export function computeBatchProgress(records = {}, sessionWordIds = [], breakdown = null, currentWordId = "") {
  if (Array.isArray(breakdown?.personalWrongWordUnits)) {
    const progress = computePersonalWrongBatchProgress(records, breakdown.personalWrongWordUnits, currentWordId);
    return {
      ...progress,
      rawBatchTotal: Number(breakdown?.rawBatchTotal ?? progress.rawBatchTotal) || 0,
      eligibleTotal: Number(breakdown?.eligibleTotal ?? progress.eligibleTotal) || 0,
      filteredOutTotal: Number(breakdown?.filteredOutTotal ?? progress.filteredOutTotal) || 0,
      filteredByCompleted: Number(breakdown?.filteredByCompleted ?? progress.filteredByCompleted) || 0,
      filteredByMasteredPersonalWrong: Number(breakdown?.filteredByMasteredPersonalWrong ?? 0) || 0,
      personalWrongSkippedMasteredWrites: Number(breakdown?.personalWrongSkippedMasteredWrites ?? 0) || 0
    };
  }

  const ids = Array.isArray(sessionWordIds) ? sessionWordIds.filter(Boolean) : [];
  const sessionTotal = Number(breakdown?.sessionTotal ?? ids.length) || 0;
  let completedCount = 0;

  for (const wordId of ids) {
    const record = records[wordId];
    if (isMasteredState(record)) {
      completedCount += 1;
    }
  }

  const activeWordId = String(currentWordId || "").trim();
  const activeIndex = activeWordId ? ids.indexOf(activeWordId) : -1;
  const currentNumber = sessionTotal === 0
    ? 0
    : activeIndex >= 0
      ? activeIndex + 1
      : Math.min(completedCount + 1, sessionTotal);
  const positionRatio = sessionTotal > 0 ? currentNumber / sessionTotal : 0;
  const masteryRatio = sessionTotal > 0 ? completedCount / sessionTotal : 0;
  const positionPercent = Math.round(positionRatio * 100);
  const masteryPercent = Math.round(masteryRatio * 100);

  return {
    rawBatchTotal: Number(breakdown?.rawBatchTotal ?? sessionTotal) || 0,
    eligibleTotal: Number(breakdown?.eligibleTotal ?? sessionTotal) || 0,
    sessionTotal,
    completedCount,
    filteredOutTotal: Number(breakdown?.filteredOutTotal ?? 0) || 0,
    filteredByFamiliar: Number(breakdown?.filteredByFamiliar ?? 0) || 0,
    filteredByInvalidAnswer: Number(breakdown?.filteredByInvalidAnswer ?? 0) || 0,
    filteredByMode: Number(breakdown?.filteredByMode ?? 0) || 0,
    filteredByCompleted: Number(breakdown?.filteredByCompleted ?? 0) || 0,
    filteredByDuplicate: Number(breakdown?.filteredByDuplicate ?? 0) || 0,
    filteredBySrsOnly: Number(breakdown?.filteredBySrsOnly ?? 0) || 0,
    filteredByRepairState: Number(breakdown?.filteredByRepairState ?? 0) || 0,
    filteredOther: Number(breakdown?.filteredOther ?? 0) || 0,
    currentMode: breakdown?.currentMode || "",
    includeFamiliar: breakdown?.includeFamiliar,
    currentBatch: breakdown?.currentBatch || breakdown?.currentBatchId || "",
    currentBatchId: breakdown?.currentBatchId || breakdown?.currentBatch || "",
    currentNumber,
    positionRatio,
    masteryRatio,
    positionPercent,
    masteryPercent,
    percent: Math.max(positionPercent, masteryPercent),
    completed: completedCount,
    total: sessionTotal
  };
}

export function resolveSpellingProgressBarPercent(sessionTotal, completedCount, currentPosition) {
  const total = Number(sessionTotal) || 0;
  if (total <= 0) return 0;

  const position = Math.max(0, Number(currentPosition) || 0);
  const completed = Math.max(0, Number(completedCount) || 0);
  const positionPct = (position / total) * 100;
  const masteryPct = (completed / total) * 100;

  return Math.min(100, Math.max(0.5, positionPct, masteryPct));
}

export function resolveSpellingStudyPosition(sessionTotal, completedCount, hasCurrent = true) {
  const total = Math.max(0, Number(sessionTotal) || 0);
  if (!total) return 0;

  const completed = Math.min(total, Math.max(0, Number(completedCount) || 0));
  return Math.min(total, completed + (hasCurrent && completed < total ? 1 : 0));
}
