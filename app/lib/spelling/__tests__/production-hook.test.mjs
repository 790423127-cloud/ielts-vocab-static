import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import hookModule from "../../../hooks/useSpellingEngine.js";
import { resolveSpellingLoadingState } from "../spelling-training-page-helpers.mjs";

const {
  createInitialProductionSpellingState,
  isSpellingStorageUnavailableError,
  mapSnapshotToProductionHookState
} = hookModule;

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
