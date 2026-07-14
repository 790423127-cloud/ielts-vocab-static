import test from "node:test";
import assert from "node:assert/strict";
import { emptyParaphraseReviewState, getParaphraseReviewEntry, recordParaphraseQuizResult } from "../paraphrase-review.mjs";

test("fixed review schedule is 1, 3, 7, 14 days and wrong resets streak", () => {
  const day = 86400000;
  let state = emptyParaphraseReviewState();
  for (const expected of [1, 3, 7, 14]) {
    state = recordParaphraseQuizResult(state, "g1", { correct: true, direction: "anchorToMember" }, 1000);
    assert.equal(getParaphraseReviewEntry(state, "g1").nextReviewAt, 1000 + expected * day);
  }
  state = recordParaphraseQuizResult(state, "g1", { correct: false }, 2000);
  assert.equal(getParaphraseReviewEntry(state, "g1").correctStreak, 0);
  assert.equal(getParaphraseReviewEntry(state, "g1").wrongCount, 1);
});
