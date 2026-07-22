import {
  PERSONAL_WRONG_BOOK_BASE_REPS,
  PERSONAL_WRONG_BOOK_PLURAL_REPS,
  PERSONAL_WRONG_BOOK_REPETITIONS
} from "./personal-wrong-book.mjs";
import {
  isInRepairState,
  isMasteredState,
  isRepairRevisitEligible,
  isRepairRevisitForced
} from "./repair-progress.mjs";

export function extractPersonalWrongWordUnits(candidates = []) {
  const units = [];
  const unitMap = new Map();

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const meta = candidate?.personalWrong;
    if (!meta?.unitId) continue;

    let unit = unitMap.get(meta.unitId);
    if (!unit) {
      unit = {
        unitId: meta.unitId,
        anchor: meta.anchor || meta.baseWord || "",
        inflected: meta.inflected || meta.targetAnswer || "",
        hasInflectionPair: Boolean(meta.hasInflectionPair),
        writeWordIds: [],
        writes: []
      };
      unitMap.set(meta.unitId, unit);
      units.push(unit);
    }

    const wordId = String(candidate.wordId || "").trim();
    if (!wordId || unit.writeWordIds.includes(wordId)) continue;

    unit.writeWordIds.push(wordId);
    unit.writes.push({
      wordId,
      formKind: meta.formKind || "same",
      formIndex: Number(meta.formIndex || meta.unitWriteIndex || 0),
      unitWriteIndex: Number(meta.unitWriteIndex || 0),
      expectedAnswer: candidate.expectedAnswer || candidate.answer || ""
    });
  }

  for (const unit of units) {
    unit.writes.sort((left, right) => left.unitWriteIndex - right.unitWriteIndex);
    unit.writeWordIds = unit.writes.map((write) => write.wordId);
  }

  return units;
}

export function isPersonalWrongUnitMastered(unit = {}, records = {}) {
  const writeWordIds = Array.isArray(unit.writeWordIds) ? unit.writeWordIds : [];
  if (!writeWordIds.length) return false;
  return writeWordIds.every((wordId) => isMasteredState(records[wordId]));
}

function countMasteredWrites(unit = {}, records = {}, formKind = "") {
  return (unit.writes || []).filter((write) => {
    if (formKind && write.formKind !== formKind) return false;
    return isMasteredState(records[write.wordId]);
  }).length;
}

export function resolvePersonalWrongUnitProgress(unit = {}, records = {}, currentWriteWordId = "") {
  if (!unit?.unitId) return null;

  const totalWrites = unit.writeWordIds.length || PERSONAL_WRONG_BOOK_REPETITIONS;
  const masteredWrites = countMasteredWrites(unit, records);
  const baseMastered = countMasteredWrites(unit, records, "base");
  const pluralMastered = countMasteredWrites(unit, records, "plural");
  const baseTotal = unit.hasInflectionPair ? PERSONAL_WRONG_BOOK_BASE_REPS : 0;
  const pluralTotal = unit.hasInflectionPair ? PERSONAL_WRONG_BOOK_PLURAL_REPS : 0;
  const activeWrite = (unit.writes || []).find((write) => write.wordId === currentWriteWordId) || null;

  return {
    unitId: unit.unitId,
    anchor: unit.anchor,
    inflected: unit.inflected,
    hasInflectionPair: Boolean(unit.hasInflectionPair),
    masteredWrites,
    totalWrites,
    baseMastered,
    baseTotal,
    pluralMastered,
    pluralTotal,
    activeFormKind: activeWrite?.formKind || "",
    activeFormIndex: Number(activeWrite?.formIndex || 0),
    label: unit.hasInflectionPair
      ? `本词 ${masteredWrites}/${totalWrites} · 原形 ${baseMastered}/${baseTotal} · 复数 ${pluralMastered}/${pluralTotal}`
      : `本词 ${masteredWrites}/${totalWrites}`
  };
}

export function computePersonalWrongBatchProgress(records = {}, wordUnits = [], currentWriteWordId = "") {
  const units = Array.isArray(wordUnits) ? wordUnits : [];
  const sessionTotal = units.length;
  let completedCount = 0;

  for (const unit of units) {
    if (isPersonalWrongUnitMastered(unit, records)) completedCount += 1;
  }

  const activeUnit = units.find((unit) => unit.writeWordIds.includes(currentWriteWordId))
    || units.find((unit) => !isPersonalWrongUnitMastered(unit, records))
    || null;
  const activeUnitIndex = activeUnit ? units.indexOf(activeUnit) : -1;
  const currentNumber = sessionTotal === 0
    ? 0
    : completedCount >= sessionTotal
      ? sessionTotal
      : Math.max(1, activeUnitIndex >= 0 ? activeUnitIndex + 1 : completedCount + 1);
  const positionRatio = sessionTotal > 0 ? currentNumber / sessionTotal : 0;
  const masteryRatio = sessionTotal > 0 ? completedCount / sessionTotal : 0;
  const positionPercent = Math.round(positionRatio * 100);
  const masteryPercent = Math.round(masteryRatio * 100);
  const personalWrongUnitProgress = activeUnit
    ? resolvePersonalWrongUnitProgress(activeUnit, records, currentWriteWordId)
    : null;

  return {
    rawBatchTotal: sessionTotal,
    eligibleTotal: sessionTotal,
    sessionTotal,
    completedCount,
    filteredOutTotal: 0,
    filteredByFamiliar: 0,
    filteredByInvalidAnswer: 0,
    filteredByMode: 0,
    filteredByCompleted: 0,
    filteredByDuplicate: 0,
    filteredBySrsOnly: 0,
    filteredByRepairState: 0,
    filteredOther: 0,
    currentNumber,
    positionRatio,
    masteryRatio,
    positionPercent,
    masteryPercent,
    percent: Math.max(positionPercent, masteryPercent),
    completed: completedCount,
    total: sessionTotal,
    personalWrongUnitProgress,
    personalWrongWordUnits: units,
    personalWrongSequential: true
  };
}

function shouldStayOnWrite(wordId, unit, records, options = {}) {
  const record = records[wordId];
  if (!record || isMasteredState(record)) return false;

  const writeIndex = unit.writeWordIds.indexOf(wordId);
  if (writeIndex < 0) return false;

  const priorMastered = unit.writeWordIds
    .slice(0, writeIndex)
    .every((id) => isMasteredState(records[id]));
  if (!priorMastered) return false;

  if (!isInRepairState(record)) return true;

  const now = Number(options.now || Date.now());
  const sequence = Number(options.sequence || 0);
  if (record?.today?.repairLocked) return true;
  if (isRepairRevisitForced(record, { now, sequence })) return true;
  if (isRepairRevisitEligible(record, { now, sequence })) return true;
  return true;
}

function selectPendingWriteFromUnit(unit = {}, records = {}, startIndex = 0, source = "personal_wrong_sequential") {
  const writeWordIds = Array.isArray(unit.writeWordIds) ? unit.writeWordIds : [];
  if (!writeWordIds.length) return null;

  for (let index = Math.max(0, Number(startIndex) || 0); index < writeWordIds.length; index += 1) {
    const writeWordId = writeWordIds[index];
    const record = records[writeWordId];
    if (isMasteredState(record)) continue;

    if (isInRepairState(record)) {
      if (record?.today?.repairLocked) return { wordId: writeWordId, source: "personal_wrong_repair_locked" };
      return { wordId: writeWordId, source: "personal_wrong_repair" };
    }

    return { wordId: writeWordId, source };
  }

  return null;
}

export function selectNextPersonalWrongWrite(wordUnits = [], records = {}, options = {}) {
  const units = Array.isArray(wordUnits) ? wordUnits : [];
  const lastWordId = String(options.lastWordId || "").trim();

  if (lastWordId) {
    const lastUnitIndex = units.findIndex((unit) => unit.writeWordIds.includes(lastWordId));
    const lastUnit = lastUnitIndex >= 0 ? units[lastUnitIndex] : null;
    if (lastUnit && shouldStayOnWrite(lastWordId, lastUnit, records, options)) {
      const record = records[lastWordId];
      if (isInRepairState(record)) {
        if (record?.today?.repairLocked) return { wordId: lastWordId, source: "personal_wrong_repair_locked" };
        return { wordId: lastWordId, source: "personal_wrong_repair" };
      }
      return { wordId: lastWordId, source: "personal_wrong_current" };
    }

    if (lastUnit) {
      const lastWriteIndex = lastUnit.writeWordIds.indexOf(lastWordId);
      const sameUnitNext = selectPendingWriteFromUnit(
        lastUnit,
        records,
        lastWriteIndex + 1,
        "personal_wrong_current_unit"
      );
      if (sameUnitNext) return sameUnitNext;

      for (let offset = 1; offset < units.length; offset += 1) {
        const unit = units[(lastUnitIndex + offset) % units.length];
        const nextUnitWrite = selectPendingWriteFromUnit(
          unit,
          records,
          0,
          "personal_wrong_resume_cursor"
        );
        if (nextUnitWrite) return nextUnitWrite;
      }
    }
  }

  for (const unit of units) {
    const selected = selectPendingWriteFromUnit(unit, records);
    if (selected) return selected;
  }

  return { wordId: "", source: "empty" };
}

export function enrichPersonalWrongBreakdown(candidates = [], breakdown = {}, options = {}) {
  const isPersonalWrongSource = options.practiceSource === "personal_wrong_book"
    || options.source === "personal_wrong_book";
  const hasPersonalWrongCandidates = (Array.isArray(candidates) ? candidates : [])
    .some((candidate) => candidate?.personalWrong?.unitId);

  if (!isPersonalWrongSource && !hasPersonalWrongCandidates) {
    return breakdown;
  }

  const wordUnits = extractPersonalWrongWordUnits(candidates);
  if (!wordUnits.length) return breakdown;

  return {
    ...breakdown,
    personalWrongSequential: true,
    personalWrongWordUnits: wordUnits,
    sessionTotal: wordUnits.length,
    rawBatchTotal: wordUnits.length,
    eligibleTotal: wordUnits.length,
    candidateTotal: candidates.length,
    writeTotal: candidates.length
  };
}
