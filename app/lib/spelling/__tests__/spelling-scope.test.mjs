import test from "node:test";
import assert from "node:assert/strict";

import { SpellingIndexedDbStore } from "../indexeddb-store.mjs";
import { resolveSpellingScope } from "../spelling-scope.mjs";

test("resolveSpellingScope maps word and phrase stores independently", () => {
  const word = resolveSpellingScope("word");
  const phrase = resolveSpellingScope("phrase");

  assert.equal(word.entryMode, "headwords");
  assert.equal(phrase.entryMode, "phrases");
  assert.equal(word.stores.errorBank, "word-error-bank");
  assert.equal(word.stores.srsReviewQueue, "word-srs");
  assert.equal(phrase.stores.errorBank, "phrase-error-bank");
  assert.equal(phrase.stores.srsReviewQueue, "phrase-srs");
  assert.notEqual(word.stores.spellingProgress, phrase.stores.spellingProgress);
});

test("SpellingIndexedDbStore binds to scope-specific object stores", () => {
  const wordStore = new SpellingIndexedDbStore({ scope: "word" });
  const phraseStore = new SpellingIndexedDbStore({ scope: "phrase" });

  assert.equal(wordStore.stores.errorBank, "word-error-bank");
  assert.equal(phraseStore.stores.errorBank, "phrase-error-bank");
  assert.equal(wordStore.stores.srsReviewQueue, "word-srs");
  assert.equal(phraseStore.stores.srsReviewQueue, "phrase-srs");
});