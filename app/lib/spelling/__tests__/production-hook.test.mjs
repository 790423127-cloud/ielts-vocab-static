import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import hookModule from "../../../hooks/useSpellingEngine.js";
import {
  clearSpellingLexiconCache,
  getCachedSpellingLexicon,
  loadSpellingLexicon,
  primeSpellingLexiconCache
} from "../load-spelling-lexicon.mjs";
import { resolveSpellingLoadingState } from "../spelling-training-page-helpers.mjs";

const {
  buildEngineDepsKey,
  createInitialProductionSpellingState,
  isSpellingStorageUnavailableError,
  mapSnapshotToProductionHookState
} = hookModule;


test("equal-sized spelling entries produce different engine identities", () => {
  const shared = {
    entryMode: "headwords",
    excludeFamiliarFlashcards: true
  };
  const scope = { scope: "word", entryMode: "headwords" };
  const categoryScope = {
    practiceSource: "category",
    currentBatchId: "word:category:mobile-switch"
  };

  const firstKey = buildEngineDepsKey(
    [{ wordId: "alpha", expectedAnswer: "alpha" }],
    shared,
    { lexiconVersion: "v1", lexiconHash: "hash" },
    false,
    categoryScope,
    scope
  );
  const secondKey = buildEngineDepsKey(
    [{ wordId: "beta", expectedAnswer: "beta" }],
    shared,
    { lexiconVersion: "v1", lexiconHash: "hash" },
    false,
    categoryScope,
    scope
  );

  assert.notEqual(firstKey, secondKey);
});

test("home runtime words prime the spelling cache before route entry", async () => {
  clearSpellingLexiconCache();
  const words = [
    { id: "word-alpha", word: "alpha", meaning: "第一个" },
    { id: "word-beta", word: "beta", meaning: "第二个" }
  ];

  const primed = primeSpellingLexiconCache(words, {
    headwordVersion: "home-v1"
  });
  assert.strictEqual(getCachedSpellingLexicon({ scope: "word" }), primed);
  const loaded = await loadSpellingLexicon({ scope: "word" });

  assert.strictEqual(loaded, primed);
  assert.strictEqual(loaded.headwords, words);
  assert.equal(loaded.counts.headwords, 2);
  assert.equal(loaded.counts.phrases, 0);

  clearSpellingLexiconCache();
});

test("batch changes clear the previous word before the new engine is ready", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/hooks/useSpellingEngine.js"), "utf8");
  const resetBlock = source.slice(
    source.indexOf("if (!previousKey || previousKey !== engineDepsKey)"),
    source.indexOf("const initialize = async ()")
  );

  assert.match(resetBlock, /setSnapshot\(null\)/);
  assert.match(resetBlock, /setInputValue\(""\)/);
  assert.match(resetBlock, /setAwaitingAdvance\(false\)/);
});

test("late error-bank metadata cannot cancel an in-flight engine initialization", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/hooks/useSpellingEngine.js"), "utf8");
  const effectStart = source.indexOf("useEffect(() => {", source.indexOf("const engineDepsKey"));
  const effectEnd = source.indexOf("\n\n  function refresh", effectStart);
  const initializationEffect = source.slice(effectStart, effectEnd);

  assert.match(initializationEffect, /const activeCategoryScope = categoryScopeRef\.current/);
  assert.match(initializationEffect, /errorBankTotal: Number\(activeCategoryScope\?\.errorBankTotal\)/);
  assert.match(initializationEffect, /\}, \[engineDepsKey\]\);/);
  assert.doesNotMatch(initializationEffect, /categoryScope\?\.(errorBankTotal|label|practiceSource)/);
});

test("spelling route reveals its header and footer only after one shared readiness gate", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const page = fs.readFileSync(path.join(root, "app/components/SpellingTrainingPage.jsx"), "utf8");
  const focus = fs.readFileSync(path.join(root, "app/components/SpellingFocusCard.jsx"), "utf8");
  const preferences = fs.readFileSync(path.join(root, "app/hooks/useSpellingTrainingPreferences.js"), "utf8");
  const errorBankHook = fs.readFileSync(path.join(root, "app/hooks/useSpellingErrorBank.js"), "utf8");
  const srsReviewHook = fs.readFileSync(path.join(root, "app/hooks/useSpellingSrsReview.js"), "utf8");

  assert.match(preferences, /preferencesHydrated: hydratedScope === normalizedScope/);
  assert.match(errorBankHook, /initialized/);
  assert.match(srsReviewHook, /initialized/);
  assert.match(page, /practiceSource === "error_bank"\s*\? !errorBank\.initialized/);
  assert.match(page, /practiceSource === "srs_review"\s*\? !srsReview\.initialized/);
  assert.match(page, /const isPagePreparing = isSpellingLoading \|\| !supportingDataReady/);
  assert.match(page, /<main className="spelling-page-shell" aria-busy=\{isPagePreparing\}>/);
  assert.match(page, /\{!isPagePreparing \? \(\s*<header className="spelling-topbar"/);
  assert.match(page, /isSpellingLoading=\{isPagePreparing\}/);
  assert.match(focus, /\{!isSpellingLoading \? <footer className="spelling-training-footer">/);
  assert.doesNotMatch(
    page,
    /if \(!spelling\.ready\) return;\s*refreshErrorBank\(\);\s*refreshSrsReview\(\);/
  );
});

test("category entry does not reload the full lexicon for personal-wrong reconciliation", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const page = fs.readFileSync(path.join(root, "app/components/SpellingTrainingPage.jsx"), "utf8");
  const reconciliationStart = page.indexOf("personalWrongLexiconReconciledRef.current = true");
  const reconciliationEnd = page.indexOf("\n  }, [personalWrongHydrated", reconciliationStart);
  const reconciliationEffect = page.slice(reconciliationStart, reconciliationEnd);

  assert.match(page, /practiceSource !== "personal_wrong_book"/);
  assert.match(page, /\[personalWrongHydrated, personalWrongRecords, practiceSource, scope\]/);
  assert.doesNotMatch(reconciliationEffect, /loadSpellingLexicon\(\{ force: true, scope \}\)/);
  assert.match(reconciliationEffect, /syncPersonalWrongRecordsToLocalLexicon/);
});

test("mobile range controls mark touch interaction before changing filters", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/components/SpellingRangeBar.jsx"), "utf8");
  const pointerGuards = source.match(/onPointerDown=\{trainingControls\.markSettingsInteraction\}/g) || [];

  assert.ok(pointerGuards.length >= 5);
});

test("blocked or timed-out IndexedDB is treated as recoverable storage unavailability", () => {
  assert.equal(isSpellingStorageUnavailableError(new Error("拼写进度库被其他标签页占用")), true);
  assert.equal(isSpellingStorageUnavailableError(new Error("IndexedDB open failed")), true);
  assert.equal(isSpellingStorageUnavailableError(new Error("candidate builder failed")), false);
});

test("production hook state exposes the required UI API fields", () => {
  const initial = createInitialProductionSpellingState();

  assert.equal(initial.currentWord, null);
  assert.equal(initial.inputValue, "");
  assert.equal(typeof initial.setInputValue, "function");
  assert.equal(typeof initial.submit, "function");
  assert.equal(initial.hint, "");
  assert.equal(initial.uiState, "idle");
  assert.equal(initial.progress, null);
  assert.equal(initial.todayStats, null);
});

test("production hook maps bridge snapshots to page-ready UI state", () => {
  const mapped = mapSnapshotToProductionHookState({
    uiState: "wrong_feedback",
    currentWord: { wordId: "alpha", expectedAnswer: "alpha" },
    hintLevel: 1,
    sessionProgress: {
      todaySpellingRemainingCount: 2,
      todayRepairPendingCount: 1,
      todaySrsDueCount: 0,
      isCompletedToday: false
    },
    debug: {
      wordId: "alpha",
      schedulerReason: "answer:wrong",
      stateMachineState: "in_repair"
    },
    expectedInputState: { totalWrongCount: 3 }
  }, {
    inputValue: "alhpa",
    hint: "_ _ _ _ _"
  });

  assert.equal(mapped.currentWord.expectedAnswer, "alpha");
  assert.equal(mapped.inputValue, "alhpa");
  assert.equal(mapped.hint, "_ _ _ _ _");
  assert.equal(mapped.uiState, "wrong_feedback");
  assert.equal(mapped.progress.todayRepairPendingCount, 1);
  assert.equal(mapped.todayStats.todayRepairPendingCount, 1);
  assert.equal(mapped.statusText, "拼写错误，请重新输入");
  assert.equal(mapped.totalWrongCount, 3);
});

test("correct-answer flow keeps input visible during feedback and clears on advance", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/hooks/useSpellingEngine.js"), "utf8");
  const correctBranch = source.slice(
    source.indexOf('playSpellingFeedbackSfx("correct")'),
    source.indexOf("async function continueAfterCorrect")
  );
  const feedbackSnapshotIndex = correctBranch.indexOf("setSnapshot(feedbackSnapshot)");
  const preFeedbackSlice = correctBranch.slice(0, feedbackSnapshotIndex);

  assert.equal(
    preFeedbackSlice.indexOf('setInputValue("")'),
    -1,
    "input should stay visible until feedback snapshot is shown"
  );
  assert.ok(correctBranch.indexOf("if (delay > 0) await wait(delay);") >= 0);
  assert.ok(correctBranch.indexOf('setInputValue("")', correctBranch.indexOf("if (delay > 0) await wait(delay);")) >= 0);
});

test("production submit flow rejects duplicate in-flight attempts", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = fs.readFileSync(path.join(root, "app/hooks/useSpellingEngine.js"), "utf8");
  const submitBranch = source.slice(
    source.indexOf("async function submit()"),
    source.indexOf("async function continueAfterCorrect()")
  );

  assert.match(submitBranch, /if \(submitInFlightRef\.current\) return null/);
  assert.match(submitBranch, /submitInFlightRef\.current = true/);
  assert.match(submitBranch, /finally \{\s*submitInFlightRef\.current = false/);
});

test("resolved empty practice sources leave the loading screen", () => {
  const state = resolveSpellingLoadingState({
    lexiconReady: true,
    activeSourceLoading: false,
    entryCount: 0,
    engineReady: false
  });

  assert.equal(state.loading, false);
  assert.equal(state.phase, "所选来源暂无内容");
  assert.equal(state.showEnginePreparing, false);
});

test("non-empty practice sources wait for the spelling engine", () => {
  const state = resolveSpellingLoadingState({
    lexiconReady: true,
    activeSourceLoading: false,
    entryCount: 202,
    engineReady: false
  });

  assert.equal(state.loading, true);
  assert.equal(state.phase, "初始化训练引擎");
  assert.equal(state.showEnginePreparing, true);
});
