import test from "node:test";
import assert from "node:assert/strict";

import { buildSpellingCandidates } from "../candidate-builder.mjs";
import { entryModeLabel, normalizeEntryMode } from "../entry-mode.mjs";

const items = [
  { word: "vacancy", pos: "noun", meaning: "空缺" },
  { word: "be due to", pos: "phrase", meaning: "由于", entryType: "phrase", isPhrase: true }
];

test("normalizeEntryMode maps external aliases to scope-specific defaults", () => {
  assert.equal(normalizeEntryMode("word", { scope: "word" }), "headwords");
  assert.equal(normalizeEntryMode("phrase", { scope: "phrase" }), "phrases");
  assert.equal(normalizeEntryMode("all", { scope: "word" }), "headwords");
  assert.equal(normalizeEntryMode("mixed", { scope: "phrase" }), "phrases");
  assert.equal(normalizeEntryMode("mix", { scope: "word" }), "headwords");
});

test("entryModeLabel returns scope-specific labels", () => {
  assert.equal(entryModeLabel("word", { scope: "word" }), "单词");
  assert.equal(entryModeLabel("phrase", { scope: "phrase" }), "词组");
});

test("candidate builder honors word and phrase aliases without mixed mode", () => {
  const wordsOnly = buildSpellingCandidates(items, {}, {
    entryMode: "word",
    scope: "word",
    excludeFamiliarFlashcards: false
  });
  const phrasesOnly = buildSpellingCandidates(items, {}, {
    entryMode: "phrase",
    scope: "phrase",
    excludeFamiliarFlashcards: false
  });

  assert.deepEqual(wordsOnly.map((item) => item.expectedAnswer), ["vacancy"]);
  assert.deepEqual(phrasesOnly.map((item) => item.expectedAnswer), ["be due to"]);
});