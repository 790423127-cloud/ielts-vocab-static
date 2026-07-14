import test from "node:test";
import assert from "node:assert/strict";
import { createParaphraseSession, PARA_LEARNING_STAGE, summarizeParaphraseSession } from "../paraphrase-session.mjs";

test("guided starts at preview while quick/full start at quiz", () => {
  const batch = { sessionIds: ["g1", "g2"], sessionKinds: ["new", "new"], coverage: { currentCycleIndex: 2 } };
  assert.equal(createParaphraseSession(batch, "guided", 1).currentLearningStage, PARA_LEARNING_STAGE.PREVIEW);
  assert.equal(createParaphraseSession(batch, "quick", 1).currentLearningStage, PARA_LEARNING_STAGE.QUIZ);
  assert.equal(createParaphraseSession(batch, "full", 1).currentLearningStage, PARA_LEARNING_STAGE.QUIZ);
});

test("guided summary reports first mastery and completed legal directions", () => {
  const summary = summarizeParaphraseSession({
    currentSessionGroupIds: ["g1"],
    baseGroupCount: 1,
    wrongReinsertQueue: [],
    uncertainReinsertQueue: [],
    sessionResults: [
      { type: "mastery", groupId: "g1", firstMastered: true, legalDirectionsCompleted: true }
    ]
  });
  assert.equal(summary.firstMastered, 1);
  assert.equal(summary.legalDirectionsCompleted, 1);
});
