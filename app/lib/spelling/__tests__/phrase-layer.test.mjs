import test from "node:test";
import assert from "node:assert/strict";
import { buildSpellingCandidates } from "../candidate-builder.mjs";

const items = [
  { id: "word_one", word: "vacancy", pos: "noun", meaning: "空缺" },
  { id: "phrase_one", word: "be due to", pos: "phrase", meaning: "由于", entryType: "phrase", isPhrase: true }
];

test("phrase mode returns restored phrase entries only", () => {
  const result = buildSpellingCandidates(items, {}, {
    entryMode: "phrases",
    scope: "phrase",
    excludeFamiliarFlashcards: false
  });
  assert.deepEqual(result.map((item) => item.word), ["be due to"]);
  assert.equal(result[0].entryType, "phrase");
});

test("headword mode excludes phrases", () => {
  const headwords = buildSpellingCandidates(items, {}, {
    entryMode: "headwords",
    scope: "word",
    excludeFamiliarFlashcards: false
  });
  assert.deepEqual(headwords.map((item) => item.word), ["vacancy"]);
  assert.equal(headwords[0].entryType, "word");
});