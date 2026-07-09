import test from "node:test";
import assert from "node:assert/strict";

import { mergeErrorBankRecords } from "../error-bank.mjs";
import { submitSpellingAnswer, createSpellingRecord } from "../state-machine.mjs";

const lexiconEntries = [{ word: "accommodation", wordId: "word_a", meaning: "住宿" }];

test("mergeErrorBankRecords keeps repaired words visible in the error bank", () => {
  const merged = mergeErrorBankRecords(
    [
      {
        wordId: "word_a",
        everWrong: true,
        totalWrongCount: 2,
        totalCorrectCount: 2,
        latestWrongAt: 200,
        lastWrongAnswer: "accomodation",
        active: false,
        severity: "medium"
      }
    ],
    lexiconEntries
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].errorBank.active, true);
});

test("repair completion does not remove a word from the error bank", () => {
  let record = createSpellingRecord("word_a");
  record = submitSpellingAnswer(record, {
    answer: "accomodation",
    expectedAnswer: "accommodation",
    now: 100,
    sequence: 1
  }).record;

  record = submitSpellingAnswer(record, {
    answer: "accommodation",
    expectedAnswer: "accommodation",
    now: 200,
    sequence: 2
  }).record;

  record = submitSpellingAnswer(record, {
    answer: "accommodation",
    expectedAnswer: "accommodation",
    now: 300,
    sequence: 11
  }).record;

  assert.equal(record.today.repairState, "mastered");
  assert.equal(record.errorBank.everWrong, true);
  assert.equal(record.errorBank.active, true);
});