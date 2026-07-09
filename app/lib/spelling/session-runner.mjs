import { computeBatchProgress } from "./batch-progress.mjs";
import { dedupeReviewQueueWordIds } from "./error-bank-dedupe.mjs";
import { selectNextPersonalWrongWrite } from "./personal-wrong-progress.mjs";
import { getTodayStats } from "./stats.mjs";
import { selectNextSpellingWord } from "./scheduler.mjs";
import {
  formatRepairProgressLabel,
  getRepairProgress,
  isMasteredState,
  isRepairRevisitEligible,
  isRepairRevisitForced,
  normalizeRepairState,
  REPAIR_STATES
} from "./repair-progress.mjs";
import {
  createSpellingRecord,
  enqueueSpellingPriorityReview,
  getSpellingHint,
  markSpellingFamiliar,
  rolloverSpellingRecordForSession,
  submitSpellingAnswer
} from "./state-machine.mjs";

function toCandidateMap(candidates = []) {
  return new Map((Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => candidate?.wordId)
    .map((candidate) => [candidate.wordId, candidate]));
}

function selectNextWord(candidateBreakdown, candidateWordIds, records, options = {}) {
  const wordUnits = candidateBreakdown?.personalWrongWordUnits;
  if (candidateBreakdown?.personalWrongSequential && Array.isArray(wordUnits) && wordUnits.length) {
    return selectNextPersonalWrongWrite(wordUnits, records, options);
  }

  return selectNextSpellingWord({
    candidateWordIds,
    records,
    ...options
  });
}

function filterPersonalWrongUnitWrites(unit = {}, allowedWordIds = new Set()) {
  const writes = Array.isArray(unit.writes)
    ? unit.writes.filter((write) => allowedWordIds.has(write.wordId))
    : [];

  return {
    ...unit,
    writes,
    writeWordIds: writes.map((write) => write.wordId)
  };
}

function isPersonalWrongWriteCompleteForQueue(record) {
  if (!record) return false;
  if (normalizeRepairState(record?.today?.repairState) === REPAIR_STATES.IN_REPAIR) return false;
  return isMasteredState(record) || Number(record?.spelling?.correctAttempts || 0) > 0;
}

function filterActivePersonalWrongUnit(unit = {}, records = {}) {
  const writes = Array.isArray(unit.writes)
    ? unit.writes.filter((write) => !isPersonalWrongWriteCompleteForQueue(records[write.wordId]))
    : [];

  return {
    ...unit,
    writes,
    writeWordIds: writes.map((write) => write.wordId)
  };
}

function resolveActivePersonalWrongQueue(candidateBreakdown, rawSessionWordIds, records) {
  const units = Array.isArray(candidateBreakdown?.personalWrongWordUnits)
    ? candidateBreakdown.personalWrongWordUnits
    : [];

  if (!candidateBreakdown?.personalWrongSequential || !units.length) {
    return {
      candidateBreakdown,
      sessionWordIds: rawSessionWordIds
    };
  }

  const activeUnits = units
    .map((unit) => filterActivePersonalWrongUnit(unit, records))
    .filter((unit) => unit.writeWordIds.length);
  const activeWordIds = activeUnits
    .flatMap((unit) => Array.isArray(unit.writeWordIds) ? unit.writeWordIds : [])
    .filter(Boolean);
  const originalWriteCount = rawSessionWordIds.length;
  const skippedMasteredWriteCount = Math.max(0, originalWriteCount - activeWordIds.length);

  return {
    sessionWordIds: activeWordIds,
    candidateBreakdown: {
      ...candidateBreakdown,
      personalWrongWordUnits: activeUnits,
      sessionWordIds: activeWordIds,
      sessionTotal: activeUnits.length,
      eligibleTotal: activeUnits.length,
      candidateTotal: activeWordIds.length,
      filteredOutTotal: Number(candidateBreakdown.filteredOutTotal || 0) + skippedMasteredWriteCount,
      filteredByCompleted: Number(candidateBreakdown.filteredByCompleted || 0) + skippedMasteredWriteCount,
      filteredByMasteredPersonalWrong: skippedMasteredWriteCount,
      personalWrongSkippedMasteredWrites: skippedMasteredWriteCount
    }
  };
}

function buildExpectedInputState(candidate, record) {
  if (!candidate || !record) return null;

  const repairProgress = getRepairProgress(record);

  return {
    wordId: candidate.wordId,
    repairState: normalizeRepairState(record.today.repairState),
    repairStreak: repairProgress.streak,
    repairRequired: repairProgress.required,
    repairProgressLabel: repairProgress.inRepair ? formatRepairProgressLabel(record) : "",
    expectedAnswer: candidate.expectedAnswer,
    acceptedAnswers: candidate.acceptedAnswers || [],
    nextEligibleAt: record.today.nextEligibleAt,
    minOtherWordsBeforeNext: record.today.minOtherWordsBeforeNext,
    lastSeenSequence: record.today.lastSeenSequence,
    repairLocked: Boolean(record.today.repairLocked),
    totalWrongCount: Number(record.errorBank?.totalWrongCount || 0)
  };
}

function explainCandidate(wordId, selected, records, options) {
  const record = records[wordId];
  const state = record?.today?.repairState;

  if (wordId === selected.wordId) return `selected:${selected.source}`;
  if (isMasteredState(record)) return "skipped:mastered";
  if (normalizeRepairState(state) === REPAIR_STATES.IN_REPAIR) {
    if (record?.today?.repairLocked) return "queued:in_repair_locked";
    if (isRepairRevisitForced(record, options)) return "queued:in_repair_forced";
    if (isRepairRevisitEligible(record, options)) return "queued:in_repair_ready";
    return "skipped:in_repair_not_ready";
  }
  if (Number(record?.srs?.nextReviewAt || 0) > 0 && record.srs.nextReviewAt <= options.now) {
    return "queued:srs_due";
  }

  return "queued:ordinary";
}

export function createSpellingSessionRunner(options = {}) {
  const candidates = Array.isArray(options.candidates) ? options.candidates : [];
  const candidateMap = toCandidateMap(candidates);
  let candidateBreakdown = options.candidateBreakdown || null;
  const records = { ...(options.records || {}) };
  const rawSessionWordIds = Array.isArray(candidateBreakdown?.sessionWordIds) && candidateBreakdown.sessionWordIds.length
    ? candidateBreakdown.sessionWordIds
    : candidates.map((candidate) => candidate.wordId).filter(Boolean);
  const lexiconEntries = Array.isArray(options.lexiconEntries) ? options.lexiconEntries : [];
  let sessionWordIds = [];
  const debugMode = options.debugMode === true || options.DEBUG_MODE === true;
  const allowRepairSpacingFallback = options.allowRepairSpacingFallback === true;
  let now = Number(options.now || Date.now());
  let sequence = Number(options.sequence || 0);
  let lastWordId = options.lastWordId || "";
  let currentWordId = "";
  let currentSchedulerHit = { wordId: "", source: "empty" };

  function rolloverRecords() {
    for (const [wordId, record] of Object.entries(records)) {
      const rolled = rolloverSpellingRecordForSession(record, { now });
      if (rolled.changed) records[wordId] = rolled.record;
    }
  }

  rolloverRecords();
  const activeQueue = resolveActivePersonalWrongQueue(candidateBreakdown, rawSessionWordIds, records);
  candidateBreakdown = activeQueue.candidateBreakdown;
  sessionWordIds = dedupeReviewQueueWordIds(activeQueue.sessionWordIds, records, lexiconEntries);

  if (candidateBreakdown?.personalWrongSequential && Array.isArray(candidateBreakdown.personalWrongWordUnits)) {
    const activeWordIdSet = new Set(sessionWordIds);
    candidateBreakdown = {
      ...candidateBreakdown,
      personalWrongWordUnits: candidateBreakdown.personalWrongWordUnits
        .map((unit) => filterPersonalWrongUnitWrites(unit, activeWordIdSet))
        .filter((unit) => unit.writeWordIds.length),
      sessionWordIds,
      sessionTotal: sessionWordIds.length
        ? candidateBreakdown.personalWrongWordUnits.filter((unit) => unit.writeWordIds.some((id) => activeWordIdSet.has(id))).length
        : 0,
      eligibleTotal: sessionWordIds.length
        ? candidateBreakdown.personalWrongWordUnits.filter((unit) => unit.writeWordIds.some((id) => activeWordIdSet.has(id))).length
        : 0,
      candidateTotal: sessionWordIds.length
    };
  }

  function getRecord(wordId) {
    if (!records[wordId]) records[wordId] = createSpellingRecord(wordId, { now });
    return records[wordId];
  }

  function buildDebug(selected) {
    if (!debugMode) return undefined;

    return {
      schedulerHit: selected,
      currentWordState: selected.wordId ? records[selected.wordId]?.today?.repairState || "normal" : "empty",
      candidates: sessionWordIds.map((wordId) => ({
        wordId,
        reason: explainCandidate(wordId, selected, records, { now, sequence })
      }))
    };
  }

  function buildOutput(wordId, selected, canAdvance = true) {
    const candidate = wordId ? candidateMap.get(wordId) : null;
    const record = wordId ? getRecord(wordId) : null;

    return {
      currentWord: candidate,
      expectedInputState: buildExpectedInputState(candidate, record),
      hintLevel: Number(record?.spelling?.hintLevel || 0),
      canAdvance,
      sessionProgress: {
        ...getTodayStats(records, { candidateWordIds: sessionWordIds, now }),
        candidateBreakdown,
        batchProgress: computeBatchProgress(records, sessionWordIds, candidateBreakdown, wordId)
      },
      debug: buildDebug(selected)
    };
  }

  function getCurrent(overrides = {}) {
    now = Number(overrides.now || now || Date.now());
    sequence = Number(overrides.sequence ?? sequence);
    lastWordId = overrides.lastWordId ?? lastWordId;
    rolloverRecords();

    const selected = selectNextWord(candidateBreakdown, sessionWordIds, records, {
      now,
      sequence,
      lastWordId,
      allowRepairSpacingFallback
    });

    currentSchedulerHit = selected;
    currentWordId = selected.wordId || "";
    if (currentWordId) getRecord(currentWordId);

    return buildOutput(currentWordId, selected, true);
  }

  function submitAnswer(answer, overrides = {}) {
    now = Number(overrides.now || now || Date.now());
    sequence = Number(overrides.sequence ?? sequence);
    rolloverRecords();

    if (!currentWordId) getCurrent({ now, sequence });
    if (!currentWordId) {
      return {
        ...buildOutput("", currentSchedulerHit, false),
        answerMeta: { isCorrect: false, canAdvance: false, skipped: false, wordId: "" }
      };
    }

    const candidate = candidateMap.get(currentWordId);
    const result = submitSpellingAnswer(records[currentWordId], {
      answer,
      expectedAnswer: candidate.expectedAnswer,
      acceptedAnswers: candidate.acceptedAnswers || [],
      now,
      sequence,
      wordId: currentWordId
    });

    records[currentWordId] = result.record;
    const answeredWordId = currentWordId;
    const selected = { wordId: answeredWordId, source: `answer:${result.isCorrect ? "correct" : "wrong"}` };
    const output = buildOutput(answeredWordId, selected, result.canAdvance);

    if (result.canAdvance) {
      lastWordId = answeredWordId;
      currentWordId = "";
    }

    return {
      ...output,
      answerMeta: {
        isCorrect: result.isCorrect,
        canAdvance: result.canAdvance,
        skipped: false,
        wordId: answeredWordId,
        candidate
      }
    };
  }

  function advanceAfterManualAction(wordId, candidate, action, overrides = {}) {
    now = Number(overrides.now || now || Date.now());
    sequence = Number(overrides.sequence ?? sequence);
    rolloverRecords();

    lastWordId = wordId;
    currentWordId = "";
    sequence += 1;

    const selected = selectNextWord(candidateBreakdown, sessionWordIds, records, {
      now,
      sequence,
      lastWordId,
      allowRepairSpacingFallback
    });

    currentSchedulerHit = selected;
    currentWordId = selected.wordId || "";
    if (currentWordId) getRecord(currentWordId);

    return {
      ...buildOutput(currentWordId, selected, true),
      answerMeta: {
        isCorrect: false,
        canAdvance: true,
        skipped: false,
        familiar: action === "familiar",
        priorityReview: action === "priority_review",
        wordId,
        candidate
      }
    };
  }

  function markFamiliarCurrent(overrides = {}) {
    now = Number(overrides.now || now || Date.now());
    sequence = Number(overrides.sequence ?? sequence);
    rolloverRecords();

    if (!currentWordId) getCurrent({ now, sequence });
    if (!currentWordId) {
      return {
        ...buildOutput("", currentSchedulerHit, false),
        answerMeta: { isCorrect: false, canAdvance: false, skipped: false, familiar: true, wordId: "" }
      };
    }

    const wordId = currentWordId;
    const candidate = candidateMap.get(wordId);
    const result = markSpellingFamiliar(records[wordId], { now, sequence, wordId });
    records[wordId] = result.record;

    return advanceAfterManualAction(wordId, candidate, "familiar", overrides);
  }

  function enqueuePriorityReviewCurrent(overrides = {}) {
    now = Number(overrides.now || now || Date.now());
    sequence = Number(overrides.sequence ?? sequence);
    rolloverRecords();

    if (!currentWordId) getCurrent({ now, sequence });
    if (!currentWordId) {
      return {
        ...buildOutput("", currentSchedulerHit, false),
        answerMeta: { isCorrect: false, canAdvance: false, skipped: false, priorityReview: true, wordId: "" }
      };
    }

    const wordId = currentWordId;
    const candidate = candidateMap.get(wordId);
    const result = enqueueSpellingPriorityReview(records[wordId], { now, sequence, wordId });
    records[wordId] = result.record;

    return advanceAfterManualAction(wordId, candidate, "priority_review", overrides);
  }

  function skipCurrent(overrides = {}) {
    now = Number(overrides.now || now || Date.now());
    sequence = Number(overrides.sequence ?? sequence);
    rolloverRecords();

    if (!currentWordId) getCurrent({ now, sequence });
    if (!currentWordId) {
      return {
        ...buildOutput("", currentSchedulerHit, false),
        answerMeta: { isCorrect: false, canAdvance: true, skipped: true, wordId: "" }
      };
    }

    const skippedId = currentWordId;
    const candidate = candidateMap.get(skippedId);
    const record = getRecord(skippedId);
    record.today.lastSeenSequence = sequence;
    record.today.lastSeenAt = now;
    record.updatedAt = now;
    record.revision = Number(record.revision || 0) + 1;

    lastWordId = skippedId;
    currentWordId = "";
    sequence += 1;

    const selected = selectNextWord(candidateBreakdown, sessionWordIds, records, {
      now,
      sequence,
      lastWordId,
      allowRepairSpacingFallback
    });

    currentSchedulerHit = selected;
    currentWordId = selected.wordId || "";
    if (currentWordId) getRecord(currentWordId);

    return {
      ...buildOutput(currentWordId, selected, true),
      answerMeta: {
        isCorrect: false,
        canAdvance: true,
        skipped: true,
        wordId: skippedId,
        candidate
      }
    };
  }

  function navigateToNextQuestion(overrides = {}) {
    now = Number(overrides.now || now || Date.now());
    sequence = Number(overrides.sequence ?? sequence);
    rolloverRecords();

    if (!currentWordId) getCurrent({ now, sequence });
    if (!currentWordId) {
      return {
        ...buildOutput("", currentSchedulerHit, false),
        answerMeta: { isCorrect: false, canAdvance: false, skipped: false, navigated: true, wordId: "" }
      };
    }

    const leftWordId = currentWordId;
    const candidate = candidateMap.get(leftWordId);
    lastWordId = leftWordId;
    currentWordId = "";
    sequence += 1;

    const selected = selectNextWord(candidateBreakdown, sessionWordIds, records, {
      now,
      sequence,
      lastWordId,
      allowRepairSpacingFallback
    });

    currentSchedulerHit = selected;
    currentWordId = selected.wordId || "";
    if (currentWordId) getRecord(currentWordId);

    return {
      ...buildOutput(currentWordId, selected, true),
      answerMeta: {
        isCorrect: false,
        canAdvance: true,
        skipped: false,
        navigated: true,
        wordId: leftWordId,
        candidate
      }
    };
  }

  function goToWordId(wordId, overrides = {}) {
    now = Number(overrides.now || now || Date.now());
    sequence = Number(overrides.sequence ?? sequence);
    rolloverRecords();

    const targetWordId = String(wordId || "").trim();
    if (!targetWordId || !candidateMap.has(targetWordId)) {
      return {
        ...buildOutput("", { wordId: "", source: "empty" }, false),
        answerMeta: {
          isCorrect: false,
          canAdvance: false,
          skipped: false,
          navigated: true,
          wordId: targetWordId
        }
      };
    }

    lastWordId = currentWordId && currentWordId !== targetWordId ? currentWordId : lastWordId;
    currentWordId = targetWordId;
    currentSchedulerHit = { wordId: targetWordId, source: "manual_nav" };
    getRecord(targetWordId);

    const candidate = candidateMap.get(targetWordId);
    return {
      ...buildOutput(targetWordId, currentSchedulerHit, true),
      answerMeta: {
        isCorrect: false,
        canAdvance: true,
        skipped: false,
        navigated: true,
        wordId: targetWordId,
        candidate
      }
    };
  }

  function captureNavigatorState() {
    return {
      sequence,
      lastWordId,
      currentWordId,
      currentSchedulerHit: { ...currentSchedulerHit },
      affectedRecord: currentWordId
        ? JSON.parse(JSON.stringify(records[currentWordId]))
        : null
    };
  }

  function restoreNavigatorState(snapshot = {}) {
    sequence = Number(snapshot.sequence ?? sequence);
    lastWordId = String(snapshot.lastWordId || "");
    currentWordId = String(snapshot.currentWordId || "");
    currentSchedulerHit = snapshot.currentSchedulerHit
      ? { ...snapshot.currentSchedulerHit }
      : { wordId: currentWordId, source: "restore" };

    if (currentWordId && snapshot.affectedRecord) {
      records[currentWordId] = JSON.parse(JSON.stringify(snapshot.affectedRecord));
    }

    if (currentWordId) getRecord(currentWordId);
    return buildOutput(currentWordId, currentSchedulerHit, true);
  }

  return {
    getCurrent,
    submitAnswer,
    markFamiliarCurrent,
    enqueuePriorityReviewCurrent,
    skipCurrent,
    navigateToNextQuestion,
    goToWordId,
    captureNavigatorState,
    restoreNavigatorState,
    getSessionWordIds: () => [...sessionWordIds],
    getTodayStats: (overrides = {}) => getTodayStats(records, {
      candidateWordIds: sessionWordIds,
      now: Number(overrides.now || now || Date.now())
    }),
    getRecords: () => records,
    getHint: (wordId) => {
      const candidate = candidateMap.get(wordId);
      const record = records[wordId];
      return getSpellingHint(candidate, Number(record?.spelling?.hintLevel || 0));
    }
  };
}
