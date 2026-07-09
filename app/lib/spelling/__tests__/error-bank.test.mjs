import test from "node:test";
import assert from "node:assert/strict";

import {
  errorBankEntriesToSpellingCandidates,
  mergeErrorBankRecords,
  shouldExcludeFamiliarSpellingEntries,
  summarizeErrorBankItems
} from "../error-bank.mjs";

const lexiconEntries = [
  {
    word: "accommodation",
    wordId: "word_a",
    meaning: "住宿"
  },
  {
    word: "be due to",
    wordId: "phrase_b",
    entryType: "phrase",
    isPhrase: true,
    meaning: "由于"
  }
];

test("mergeErrorBankRecords joins indexeddb errors with lexicon entries", () => {
  const merged = mergeErrorBankRecords(
    [
      {
        wordId: "word_a",
        everWrong: true,
        totalWrongCount: 2,
        latestWrongAt: 200,
        lastWrongAnswer: "accomodation",
        active: true,
        severity: "medium"
      },
      {
        wordId: "missing",
        everWrong: true,
        totalWrongCount: 1,
        latestWrongAt: 300,
        active: true
      }
    ],
    lexiconEntries
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[0].expectedAnswer, "missing");
  assert.equal(merged[0].orphaned, true);
  assert.equal(merged[1].expectedAnswer, "accommodation");
  assert.equal(merged[1].errorBank.lastWrongAnswer, "accomodation");
});

test("error bank helpers summarize and strip metadata for spelling candidates", () => {
  const items = mergeErrorBankRecords(
    [
      {
        wordId: "phrase_b",
        everWrong: true,
        totalWrongCount: 4,
        latestWrongAt: 400,
        lastWrongAnswer: "due to",
        active: true,
        severity: "high"
      }
    ],
    lexiconEntries
  );

  const summary = summarizeErrorBankItems(items);
  assert.equal(summary.total, 1);
  assert.equal(summary.phrase, 1);
  assert.equal(summary.high, 1);

  const candidates = errorBankEntriesToSpellingCandidates(items);
  assert.equal(candidates[0].word, "be due to");
  assert.equal(candidates[0].errorBank, undefined);
});

test("error-bank practice keeps familiar flashcards eligible", () => {
  assert.equal(shouldExcludeFamiliarSpellingEntries("category", false), true);
  assert.equal(shouldExcludeFamiliarSpellingEntries("category", true), false);
  assert.equal(shouldExcludeFamiliarSpellingEntries("error_bank", false), false);
  assert.equal(shouldExcludeFamiliarSpellingEntries("srs_review", false), false);
});
