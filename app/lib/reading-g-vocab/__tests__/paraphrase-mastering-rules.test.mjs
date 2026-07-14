import test from "node:test";
import assert from "node:assert/strict";
import { canMarkParaphraseFamiliar, PARA_DIRECTION } from "../paraphrase-review.mjs";

test("one guessed answer cannot master; complete guided evidence can", () => {
  const guessed = { correctCount: 1, lastResult: "correct", anchorToMemberCorrect: 1 };
  assert.equal(canMarkParaphraseFamiliar(guessed, [PARA_DIRECTION.ANCHOR_TO_MEMBER]), false);
  const learned = { ...guessed, previewCompleted: true, recallAttemptCount: 1 };
  assert.equal(canMarkParaphraseFamiliar(learned, [PARA_DIRECTION.ANCHOR_TO_MEMBER]), true);
  assert.equal(canMarkParaphraseFamiliar(learned, [PARA_DIRECTION.ANCHOR_TO_MEMBER], true), false);
});
