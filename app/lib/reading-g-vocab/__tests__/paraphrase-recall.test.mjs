import test from "node:test";
import assert from "node:assert/strict";
import { emptyParaphraseReviewState, recordParaphraseRecall, getParaphraseReviewEntry } from "../paraphrase-review.mjs";

test("recall stores know/uncertain/dontKnow without touching legacy status", () => {
  let state = emptyParaphraseReviewState();
  state = recordParaphraseRecall(state, "g1", "uncertain", 1000);
  const entry = getParaphraseReviewEntry(state, "g1");
  assert.equal(entry.recallAttemptCount, 1);
  assert.equal(entry.selfRating, "uncertain");
  assert.ok(entry.nextReviewAt > 1000);
  assert.equal(Object.hasOwn(entry, "paraphraseStatus"), false);
});
