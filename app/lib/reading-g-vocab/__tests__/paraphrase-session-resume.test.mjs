import test from "node:test";
import assert from "node:assert/strict";
import { normalizeParaphraseSession, restartParaphraseSession } from "../paraphrase-session.mjs";

test("session resume preserves queue/stage and restart clears only current-session work", () => {
  const raw = { mode: "guided", currentSessionGroupIds: ["g1", "g2"], sessionTaskKinds: ["new", "wrong"], baseGroupCount: 2, currentIndex: 1, currentLearningStage: "feedback", wrongReinsertQueue: ["g2"], sessionResults: [{ type: "quiz" }], startedAt: 10 };
  const resumed = normalizeParaphraseSession(raw);
  assert.equal(resumed.currentIndex, 1);
  assert.equal(resumed.currentLearningStage, "feedback");
  const restarted = restartParaphraseSession(resumed, 20);
  assert.deepEqual(restarted.currentSessionGroupIds, raw.currentSessionGroupIds);
  assert.equal(restarted.currentIndex, 0);
  assert.deepEqual(restarted.sessionResults, []);
});
