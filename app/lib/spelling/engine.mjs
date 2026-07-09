import { buildSpellingCandidates } from "./candidate-builder.mjs";
import { SpellingIndexedDbStore } from "./indexeddb-store.mjs";
import { getTodayStats } from "./stats.mjs";
import { selectNextSpellingWord } from "./scheduler.mjs";
import { createSrsEngine } from "./srs-engine.mjs";
import { createSpellingSessionRunner } from "./session-runner.mjs";
import {
  createSpellingRecord,
  getSpellingHint,
  isWaitingSecondEligible,
  isWaitingSecondForced,
  submitSpellingAnswer,
  toSessionDate
} from "./state-machine.mjs";

export function createSpellingEngine(options = {}) {
  const debugMode = options.debugMode === true || options.DEBUG_MODE === true;
  const indexedDBStore = options.createIndexedDBStore === false
    ? null
    : new SpellingIndexedDbStore({
      indexedDB: options.indexedDB,
      scope: options.scope || "word"
    });
  const srsEngine = createSrsEngine(options.srs || {});

  return {
    scheduler: {
      selectNextSpellingWord
    },
    stateMachine: {
      createSpellingRecord,
      getSpellingHint,
      isWaitingSecondEligible,
      isWaitingSecondForced,
      submitSpellingAnswer,
      toSessionDate
    },
    sessionRunner: {
      createSession: (sessionOptions = {}) => createSpellingSessionRunner({
        debugMode,
        ...sessionOptions
      })
    },
    srsEngine,
    indexedDBStore,
    buildCandidates: buildSpellingCandidates,
    getTodayStats: (records = {}, statsOptions = {}) => getTodayStats(records, statsOptions)
  };
}
