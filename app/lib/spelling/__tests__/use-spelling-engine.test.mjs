import test from "node:test";
import assert from "node:assert/strict";

import {
  createInitialSpellingHookState,
  mapBridgeSnapshotToHookState
} from "../use-spelling-engine.mjs";

test("hook state starts idle and maps bridge question snapshots for the UI", () => {
  assert.deepEqual(createInitialSpellingHookState(), {
    uiState: "idle",
    currentQuestion: null,
    input: "",
    hint: "",
    hintLevel: 0,
    message: "拼写训练准备中",
    progress: null,
    debug: null,
    ready: false
  });

  const mapped = mapBridgeSnapshotToHookState({
    uiState: "in_repair",
    currentWord: { wordId: "alpha", expectedAnswer: "alpha" },
    hintLevel: 1,
    sessionProgress: { todayRepairPendingCount: 1 },
    debug: { schedulerHit: { source: "in_repair" } }
  }, { hint: "_ _ _ _ _", ready: true });

  assert.equal(mapped.uiState, "in_repair");
  assert.equal(mapped.currentQuestion.expectedAnswer, "alpha");
  assert.equal(mapped.hint, "_ _ _ _ _");
  assert.equal(mapped.message, "请继续拼写当前内容");
  assert.equal(mapped.ready, true);
});
