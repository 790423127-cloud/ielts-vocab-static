import test from "node:test";
import assert from "node:assert/strict";
import { confirmMainLexiconDeletionOnce } from "../main-delete-confirmation.mjs";

test("main lexicon deletion asks once per open page session", () => {
  const stateRef = { current: false };
  let confirmations = 0;
  const confirmAction = () => {
    confirmations += 1;
    return true;
  };

  assert.equal(confirmMainLexiconDeletionOnce(stateRef, "delete alpha", confirmAction), true);
  assert.equal(stateRef.current, true);
  assert.equal(confirmMainLexiconDeletionOnce(stateRef, "delete beta", confirmAction), true);
  assert.equal(confirmations, 1);
});

test("a cancelled first confirmation does not unlock later deletions", () => {
  const stateRef = { current: false };
  assert.equal(confirmMainLexiconDeletionOnce(stateRef, "delete", () => false), false);
  assert.equal(stateRef.current, false);
});
