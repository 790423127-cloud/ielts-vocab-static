import {
  createSpellingEngine
} from "./engine.mjs";
import { buildCurrentBatchCandidates, writeCandidateCacheSnapshot } from "./candidate-pool.mjs";
import { logCandidateBreakdownDebug } from "./candidate-breakdown.mjs";
import { normalizeEntryMode } from "./entry-mode.mjs";
import { resolveSpellingScope } from "./spelling-scope.mjs";
import { syncLexiconMeta } from "./lexicon-meta.mjs";
import { buildSpellingDebugDetails } from "./spelling-display.mjs";
import { diagnoseSpellingError } from "./spelling-error-diagnosis.mjs";
import {
  getSpellingHint,
  isWaitingSecondEligible,
  isWaitingSecondForced,
  migrateLegacySpellingRecord,
  rolloverSpellingRecordForSession
} from "./state-machine.mjs";

function isBrowserDebugMode() {
  return typeof window !== "undefined" && window.__SPELLING_DEBUG__ === true;
}

function cloneRecord(record) {
  return JSON.parse(JSON.stringify(record));
}

function toRecordMap(records = []) {
  const map = {};

  for (const record of Array.isArray(records) ? records : Object.values(records || {})) {
    if (record?.wordId) map[record.wordId] = cloneRecord(record);
  }

  return map;
}

function getUiState(output, lastFeedback = "") {
  if (lastFeedback === "wrong") return "wrong_feedback";
  if (lastFeedback === "skipped" || lastFeedback === "familiar" || lastFeedback === "priority_review" || lastFeedback === "navigated") {
    return "show_question";
  }
  if (!output?.currentWord) {
    if (lastFeedback === "correct") return "correct_feedback";
    return output?.sessionProgress?.isCompletedToday ? "done_today" : "idle";
  }

  const repairState = output?.expectedInputState?.repairState;
  if (repairState === "in_repair") return "in_repair";
  if (repairState === "mastered") return "done_today";
  if (repairState === "waiting_second") return "in_repair";
  if (repairState === "done_today") return "done_today";

  return "show_question";
}

function buildDebugSnapshot(output, records, context = {}) {
  const wordId = output?.currentWord?.wordId || "";
  const record = wordId ? records[wordId] : null;
  const lexiconMeta = context.lexiconMeta || {};

  return {
    wordId,
    schedulerReason: output?.debug?.schedulerHit?.source || "",
    stateMachineState: record?.today?.repairState || output?.expectedInputState?.repairState || "idle",
    srs: record?.srs || null,
    waitingSecondEligible: record ? isWaitingSecondEligible(record, { now: context.now, sequence: context.sequence }) : false,
    waitingSecondForced: record ? isWaitingSecondForced(record, { now: context.now, sequence: context.sequence }) : false,
    candidates: output?.debug?.candidates || [],
    lexiconVersion: lexiconMeta.lexiconVersion || "",
    lexiconHash: lexiconMeta.lexiconHash || "",
    lexiconCounts: lexiconMeta.counts || null,
    entryMode: context.entryMode || "",
    entry: buildSpellingDebugDetails(output?.currentWord, {
      entryMode: context.entryMode,
      lexiconVersion: lexiconMeta.lexiconVersion,
      lexiconHash: lexiconMeta.lexiconHash,
      counts: lexiconMeta.counts,
      schedulerReason: output?.debug?.schedulerHit?.source || ""
    })
  };
}

export function mapSessionOutputToUiSnapshot(output, context = {}) {
  const records = context.records || {};
  const now = Number(context.now || Date.now());
  const sequence = Number(context.sequence || 0);
  const uiState = getUiState(output, context.lastFeedback || "");
  const debug = context.debugMode
    ? buildDebugSnapshot(output, records, { ...context, now, sequence })
    : null;

  return {
    ...output,
    uiState,
    debug,
    canGoNext: output?.canAdvance !== false,
    lockedWordId: output?.canAdvance === false ? output?.currentWord?.wordId || "" : ""
  };
}

export function createSpellingUiBridge(options = {}) {
  const debugMode = options.debugMode === true || options.DEBUG_MODE === true || isBrowserDebugMode();
  const scopeConfig = resolveSpellingScope(options.scope || "word");
  const engine = options.engine || createSpellingEngine({
    debugMode,
    scope: scopeConfig.scope,
    createIndexedDBStore: options.store ? false : true
  });
  const store = options.store || engine.indexedDBStore;
  const words = options.words || [];
  const flashcardState = options.flashcardState || {};
  const lexiconMeta = options.lexiconMeta || {};
  const entryMode = normalizeEntryMode(
    options.candidateOptions?.entryMode || options.candidateOptions?.mode || scopeConfig.entryMode,
    { scope: scopeConfig.scope }
  );
  const { candidates, breakdown: candidateBreakdown } = buildCurrentBatchCandidates(
    words,
    flashcardState,
    {
      ...(options.candidateOptions || {}),
      entryMode,
      scope: scopeConfig.scope,
      currentBatchId: options.currentBatchId || "",
      source: options.source || "ui-bridge",
      category: options.category || ""
    }
  );
  let now = Number(options.now || Date.now());
  let sequence = Number(options.sequence || 0);
  let session = null;
  let records = {};
  let lastSnapshot = null;

  if (typeof window !== "undefined" && lexiconMeta.lexiconHash) {
    syncLexiconMeta(lexiconMeta);
  }

  function logDebug(snapshot) {
    if (!isBrowserDebugMode() || typeof console === "undefined") return;

    const progress = snapshot?.sessionProgress || {};
    const batchProgress = progress.batchProgress || {};
    logCandidateBreakdownDebug(candidateBreakdown, batchProgress, {
      mode: entryMode,
      category: options.category || "",
      batch: options.currentBatchId || "",
      source: options.source || "ui-bridge",
      duplicateCount: candidateBreakdown.duplicateCount || 0,
      pendingTotal: progress.todaySpellingRemainingCount ?? 0,
      repairTotal: progress.todayRepairPendingCount ?? 0,
      srsTotal: progress.todaySrsDueCount ?? 0,
      errorBankTotal: Number(options.errorBankTotal || 0)
    });
    console.debug("[SPELLING_DEBUG]", snapshot.debug);
  }

  async function persistRecords(wordIds = null) {
    if (!store?.putRecord) return;

    const ids = Array.isArray(wordIds)
      ? wordIds.map((wordId) => String(wordId || "").trim()).filter(Boolean)
      : null;
    const targetRecords = ids
      ? ids.map((wordId) => records[wordId]).filter(Boolean)
      : Object.values(records);

    for (const record of targetRecords) {
      await store.putRecord(record);
    }
  }

  function ensureSession() {
    if (session) return session;

    session = engine.sessionRunner.createSession({
      candidates,
      candidateBreakdown,
      records,
      now,
      sequence,
      debugMode,
      allowRepairSpacingFallback: true
    });
    return session;
  }

  function snapshotFromOutput(output, lastFeedback = "") {
    records = ensureSession().getRecords();
    const snapshot = mapSessionOutputToUiSnapshot(output, {
      records,
      now,
      sequence,
      lastFeedback,
      debugMode,
      lexiconMeta,
      entryMode
    });
    lastSnapshot = snapshot;
    logDebug(snapshot);
    return snapshot;
  }

  return {
    async init() {
      if (store?.open) await store.open();
      if (store?.getAllRecords) {
        const loadedRecords = await store.getAllRecords();
        const migratedRecords = [];
        records = toRecordMap((Array.isArray(loadedRecords) ? loadedRecords : []).map((record) => {
          const migrated = migrateLegacySpellingRecord(record, { now });
          const rolled = rolloverSpellingRecordForSession(migrated.record, { now });
          if (migrated.changed || rolled.changed) migratedRecords.push(rolled.record);
          return rolled.record;
        }));
        if (migratedRecords.length && store?.putRecords) {
          await store.putRecords(migratedRecords);
        } else if (store?.putRecord) {
          for (const migratedRecord of migratedRecords) {
            await store.putRecord(migratedRecord);
          }
        }
      }
      writeCandidateCacheSnapshot({
        rawBatchTotal: candidateBreakdown.rawBatchTotal,
        candidateTotal: candidateBreakdown.candidateTotal,
        sessionTotal: candidateBreakdown.sessionTotal,
        currentBatchId: options.currentBatchId || "",
        scope: scopeConfig.scope,
        mode: entryMode,
        source: options.source || "ui-bridge"
      });
      ensureSession();
      return this.getCurrentQuestion();
    },

    getCurrentQuestion(overrides = {}) {
      now = Number(overrides.now || now || Date.now());
      sequence = Number(overrides.sequence ?? sequence);
      const output = ensureSession().getCurrent({ now, sequence });
      return snapshotFromOutput(output);
    },

    async submitAnswer(input, overrides = {}) {
      now = Number(overrides.now || now || Date.now());
      sequence = Number(overrides.sequence ?? sequence);
      const beforeWord = lastSnapshot?.currentWord || null;
      const output = ensureSession().submitAnswer(input, { now, sequence });
      const candidate = output?.answerMeta?.candidate || beforeWord;
      const diagnosis = diagnoseSpellingError(
        input,
        candidate?.expectedAnswer || "",
        candidate?.acceptedAnswers || []
      );
      let snapshot;

      if (output?.canAdvance === false) {
        snapshot = snapshotFromOutput(output, "wrong");
      } else {
        sequence += 1;
        const nextOutput = ensureSession().getCurrent({ now, sequence });
        snapshot = snapshotFromOutput(nextOutput, "correct");
      }

      snapshot.answerMeta = {
        ...(output?.answerMeta || {}),
        diagnosis,
        previousWord: beforeWord,
        previousTotalWrongCount: Number(output?.expectedInputState?.totalWrongCount || 0),
        submittedAnswer: String(input || "")
      };

      await persistRecords([output?.answerMeta?.wordId]);
      return snapshot;
    },

    async skipQuestion(overrides = {}) {
      now = Number(overrides.now || now || Date.now());
      const beforeWord = lastSnapshot?.currentWord || null;
      const output = ensureSession().skipCurrent({ now, sequence });
      sequence += 1;
      const snapshot = snapshotFromOutput(output, "skipped");
      snapshot.answerMeta = {
        ...(output?.answerMeta || {}),
        diagnosis: null,
        previousWord: beforeWord,
        submittedAnswer: ""
      };
      await persistRecords([output?.answerMeta?.wordId]);
      return snapshot;
    },

    async markFamiliarQuestion(overrides = {}) {
      now = Number(overrides.now || now || Date.now());
      const beforeWord = lastSnapshot?.currentWord || null;
      const output = ensureSession().markFamiliarCurrent({ now, sequence });
      sequence += 1;
      const snapshot = snapshotFromOutput(output, "familiar");
      snapshot.answerMeta = {
        ...(output?.answerMeta || {}),
        diagnosis: null,
        previousWord: beforeWord,
        submittedAnswer: ""
      };
      await persistRecords([output?.answerMeta?.wordId]);
      return snapshot;
    },

    async enqueuePriorityReview(overrides = {}) {
      now = Number(overrides.now || now || Date.now());
      const beforeWord = lastSnapshot?.currentWord || null;
      const output = ensureSession().enqueuePriorityReviewCurrent({ now, sequence });
      sequence += 1;
      const snapshot = snapshotFromOutput(output, "priority_review");
      snapshot.answerMeta = {
        ...(output?.answerMeta || {}),
        diagnosis: null,
        previousWord: beforeWord,
        submittedAnswer: ""
      };
      await persistRecords([output?.answerMeta?.wordId]);
      return snapshot;
    },

    getHint() {
      return this.getSpellingHint();
    },

    getHintLevel() {
      return Number(lastSnapshot?.hintLevel || 0);
    },

    getSpellingHint() {
      const word = lastSnapshot?.currentWord;
      if (!word) return "";
      return getSpellingHint(word, this.getHintLevel());
    },

    getProgress() {
      return this.getTodayStats();
    },

    getTodayStats() {
      return ensureSession().getTodayStats({ now });
    },

    getDebugSnapshot() {
      return lastSnapshot?.debug || null;
    },

    getRecords() {
      return records;
    },

    getLexiconMeta() {
      return lexiconMeta;
    },

    getCandidateBreakdown() {
      return candidateBreakdown;
    },

    captureUndoCheckpoint() {
      ensureSession();
      const session = ensureSession();
      const navigator = session.captureNavigatorState();
      const displayedWord = lastSnapshot?.currentWord;
      const displayedWordId = String(displayedWord?.wordId || displayedWord?.id || "").trim();

      if (!navigator.currentWordId && displayedWordId) {
        navigator.currentWordId = displayedWordId;
        navigator.currentSchedulerHit = {
          wordId: displayedWordId,
          source: navigator.currentSchedulerHit?.source || "ui_display_fallback"
        };
      }

      if (navigator.currentWordId && !navigator.affectedRecord) {
        const sessionRecords = session.getRecords?.() || records;
        const liveRecord = sessionRecords[navigator.currentWordId];
        if (liveRecord) {
          navigator.affectedRecord = cloneRecord(liveRecord);
        }
      }

      return {
        sequence,
        navigator
      };
    },

    async restoreUndoCheckpoint(checkpoint = {}) {
      sequence = Number(checkpoint.sequence ?? sequence);
      const output = ensureSession().restoreNavigatorState(checkpoint.navigator || {});
      const snapshot = snapshotFromOutput(output);
      await persistRecords([checkpoint?.navigator?.currentWordId]);
      return snapshot;
    },

    async goToNextQuestion(overrides = {}) {
      now = Number(overrides.now || now || Date.now());
      const beforeWord = lastSnapshot?.currentWord || null;
      const output = ensureSession().navigateToNextQuestion({ now, sequence });
      sequence += 1;
      const snapshot = snapshotFromOutput(output, "navigated");
      snapshot.answerMeta = {
        ...(output?.answerMeta || {}),
        diagnosis: null,
        previousWord: beforeWord,
        submittedAnswer: ""
      };
      return snapshot;
    },

    async navigateToWord(wordId, overrides = {}) {
      now = Number(overrides.now || now || Date.now());
      const beforeWord = lastSnapshot?.currentWord || null;
      const output = ensureSession().goToWordId(wordId, { now, sequence });
      const snapshot = snapshotFromOutput(output, "navigated");
      snapshot.answerMeta = {
        ...(output?.answerMeta || {}),
        diagnosis: null,
        previousWord: beforeWord,
        submittedAnswer: ""
      };
      return snapshot;
    },

    getSessionWordIds() {
      return ensureSession().getSessionWordIds?.() || [];
    }
  };
}
