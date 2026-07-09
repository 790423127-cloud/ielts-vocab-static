export { MS_PER_DAY, MS_PER_MINUTE, SPELLING_DB_CONFIG, SPELLING_REPAIR_CONFIG } from "./config.mjs";
export { buildSpellingCandidates, buildSpellingCandidatesWithBreakdown } from "./candidate-builder.mjs";
export {
  buildCurrentBatchCandidates,
  clearCandidateCache,
  dedupeCandidates,
  findCandidateDuplicates,
  getCandidateCacheKey
} from "./candidate-pool.mjs";
export {
  SPELLING_SCOPES,
  SPELLING_SCOPE_LABELS,
  SPELLING_SCOPE_ROUTES,
  getScopeRangeUiKey,
  getScopeStorageKey,
  normalizeSpellingScope,
  resolveSpellingScope
} from "./spelling-scope.mjs";
export {
  analyzeCandidateBreakdown,
  formatCandidateBreakdownSummary,
  formatSessionTrainingLine,
  logCandidateBreakdownDebug
} from "./candidate-breakdown.mjs";
export { createSpellingEngine } from "./engine.mjs";
export { SpellingIndexedDbStore } from "./indexeddb-store.mjs";
export { getSpellingTodayStats, selectNextSpellingWord } from "./scheduler.mjs";
export { createSpellingSessionRunner } from "./session-runner.mjs";
export { createSrsEngine } from "./srs-engine.mjs";
export { createCloudBaseSpellingSync, syncSpellingProgress } from "./sync/cloudbase-sync.mjs";
export { mergeBatch, mergeWordState, resolveConflict } from "./sync/merge-engine.mjs";
export {
  computeBatchProgress,
  resolveSpellingProgressBarPercent,
  resolveSpellingStudyPosition
} from "./batch-progress.mjs";
export { getTodayStats } from "./stats.mjs";
export { diagnoseSpellingError, formatSpellingErrorDiagnosis } from "./spelling-error-diagnosis.mjs";
export {
  REPAIR_STATES,
  computeRepairSessionStats,
  formatRepairProgressLabel,
  getRepairProgress,
  getRepairStreak,
  getRepairStreakRequired,
  isInRepairState,
  isMasteredState,
  isRepairRevisitEligible,
  isRepairRevisitForced
} from "./repair-progress.mjs";
export {
  beginQuestion,
  computeSpellingSessionMetrics,
  createSpellingSessionStats,
  markFamiliar,
  recordAttempt
} from "./spelling-session-stats.mjs";
export { createSpellingUiBridge, mapSessionOutputToUiSnapshot } from "./ui-bridge.mjs";
export { buildFlashcardStateFromWords, useSpellingEngine } from "./use-spelling-engine.mjs";
export {
  createSpellingRecord,
  enqueueSpellingPriorityReview,
  getSpellingHint,
  isWaitingSecondEligible,
  isWaitingSecondForced,
  markSpellingFamiliar,
  migrateLegacySpellingRecord,
  rolloverSpellingRecordForSession,
  submitSpellingAnswer,
  toSessionDate
} from "./state-machine.mjs";
export { getWordId, normalizeSpellingAnswer } from "./word-id.mjs";
