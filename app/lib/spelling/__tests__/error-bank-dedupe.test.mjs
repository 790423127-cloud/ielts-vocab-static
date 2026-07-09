import test from "node:test";
import assert from "node:assert/strict";

import {
  buildErrorDedupeKey,
  dedupeErrorBankDisplayItems,
  dedupeErrorBankRecordsBySpellingKey,
  dedupeReviewQueueWordIds,
  mergeDedupedErrorStats,
  normalizeSpellingKey
} from "../error-bank-dedupe.mjs";
import { mergeErrorBankRecords } from "../error-bank.mjs";
import {
  consolidateSpellingErrorBankByDedupeKey,
  recoverErrorBankRecords
} from "../error-bank-recovery.mjs";
import { submitSpellingAnswer } from "../state-machine.mjs";

const lexiconEntries = [
  { word: "Hello", wordId: "word_hello_a", meaning: "你好" },
  { word: "hello", wordId: "word_hello_b", meaning: "你好（副本）" },
  { word: "accommodation", wordId: "word_acc", meaning: "住宿" }
];

test("normalizeSpellingKey treats case, spaces, and curly quotes as the same word", () => {
  assert.equal(normalizeSpellingKey("Hello"), "hello");
  assert.equal(normalizeSpellingKey("  hello  "), "hello");
  assert.equal(normalizeSpellingKey("hello   world"), "hello world");
  assert.equal(normalizeSpellingKey("it's"), "it's");
  assert.equal(normalizeSpellingKey("it’s"), "it's");
});

test("dedupeErrorBankRecordsBySpellingKey keeps one record for case-different writes", () => {
  const { records } = dedupeErrorBankRecordsBySpellingKey(
    [
      {
        wordId: "word_hello_a",
        everWrong: true,
        totalWrongCount: 1,
        latestWrongAt: 100,
        active: true
      },
      {
        wordId: "word_hello_b",
        everWrong: true,
        totalWrongCount: 1,
        latestWrongAt: 200,
        active: true
      }
    ],
    lexiconEntries
  );

  assert.equal(records.length, 1);
  assert.equal(records[0].dedupeKey, "hello");
  assert.equal(records[0].totalWrongCount, 2);
  assert.deepEqual(records[0].sourceWordIds.sort(), ["word_hello_a", "word_hello_b"]);
});

test("dedupeErrorBankRecordsBySpellingKey keeps one record for spaced variants", () => {
  const orphanLexicon = [{ word: "be due to", wordId: "phrase_due", meaning: "由于" }];
  const { records } = dedupeErrorBankRecordsBySpellingKey(
    [
      {
        wordId: "phrase:be due to",
        everWrong: true,
        totalWrongCount: 1,
        latestWrongAt: 100,
        active: true
      },
      {
        wordId: "phrase:  be   due to  ",
        everWrong: true,
        totalWrongCount: 2,
        latestWrongAt: 200,
        active: true,
        orphaned: true
      }
    ],
    orphanLexicon
  );

  assert.equal(records.length, 1);
  assert.equal(records[0].dedupeKey, "be due to");
  assert.equal(records[0].totalWrongCount, 3);
});

test("three wrong attempts on the same dedupeKey yield wrongCount=3 with one list row", () => {
  let record = null;
  for (let index = 0; index < 3; index += 1) {
    const result = submitSpellingAnswer(record, {
      wordId: "word_acc",
      answer: "accomodation",
      expectedAnswer: "accommodation",
      now: 100 + index
    });
    record = result.record;
  }

  const merged = mergeErrorBankRecords(
    [{ wordId: "word_acc", everWrong: true, ...record.errorBank }],
    lexiconEntries
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].errorBank.totalWrongCount, 3);
});

test("different sourceWordIds with the same spelling target render as one display item", () => {
  const merged = mergeErrorBankRecords(
    [
      {
        wordId: "word_hello_a",
        everWrong: true,
        totalWrongCount: 2,
        latestWrongAt: 100,
        active: true
      },
      {
        wordId: "word_hello_b",
        everWrong: true,
        totalWrongCount: 3,
        latestWrongAt: 200,
        active: true
      }
    ],
    lexiconEntries
  );

  assert.equal(merged.length, 1);
  assert.equal(normalizeSpellingKey(merged[0].expectedAnswer), "hello");
  assert.equal(merged[0].errorBank.totalWrongCount, 5);
});

test("loading legacy duplicate records migrates to one merged record", async () => {
  const records = new Map([
    ["word_hello_a", {
      wordId: "word_hello_a",
      revision: 1,
      errorBank: {
        everWrong: true,
        totalWrongCount: 2,
        latestWrongAt: 100,
        active: true
      }
    }],
    ["word_hello_b", {
      wordId: "word_hello_b",
      revision: 1,
      errorBank: {
        everWrong: true,
        totalWrongCount: 3,
        latestWrongAt: 200,
        active: true
      }
    }]
  ]);

  const store = {
    async getAllRecords() {
      return [...records.values()];
    },
    async putRecord(record) {
      records.set(record.wordId, JSON.parse(JSON.stringify(record)));
    },
    async deleteRecord(wordId) {
      records.delete(wordId);
    }
  };

  const first = await consolidateSpellingErrorBankByDedupeKey(store, lexiconEntries);
  const second = await consolidateSpellingErrorBankByDedupeKey(store, lexiconEntries);

  assert.equal(first.changed, true);
  assert.equal(records.size, 1);
  assert.equal([...records.values()][0]?.errorBank?.totalWrongCount, 5);
  assert.equal(second.changed, false);
  assert.equal([...records.values()][0]?.errorBank?.totalWrongCount, 5);
});

test("review queue keeps at most one active dedupeKey at a time", () => {
  const records = {
    word_hello_a: {
      wordId: "word_hello_a",
      today: { repairState: "in_repair", repairLocked: true },
      errorBank: { everWrong: true, totalWrongCount: 2 }
    },
    word_hello_b: {
      wordId: "word_hello_b",
      today: { repairState: "in_repair" },
      errorBank: { everWrong: true, totalWrongCount: 1 }
    },
    word_acc: {
      wordId: "word_acc",
      today: { repairState: "in_repair" },
      errorBank: { everWrong: true, totalWrongCount: 1 }
    }
  };

  const deduped = dedupeReviewQueueWordIds(
    ["word_hello_a", "word_hello_b", "word_acc"],
    records,
    lexiconEntries
  );

  assert.deepEqual(deduped, ["word_hello_a", "word_acc"]);
});

test("spelling review stats and unrelated words remain intact after dedupe", () => {
  const { records } = recoverErrorBankRecords(
    [
      {
        wordId: "word_hello_a",
        everWrong: true,
        totalWrongCount: 2,
        totalCorrectCount: 1,
        latestWrongAt: 100,
        active: true
      },
      {
        wordId: "word_acc",
        everWrong: true,
        totalWrongCount: 4,
        totalCorrectCount: 2,
        latestWrongAt: 300,
        active: true,
        severity: "high"
      }
    ],
    lexiconEntries
  );

  const display = dedupeErrorBankDisplayItems(
    mergeErrorBankRecords(records, lexiconEntries)
  );

  assert.equal(display.length, 2);
  assert.equal(display.find((item) => buildErrorDedupeKey({ wordId: item.wordId }, item) === "accommodation")?.errorBank?.totalWrongCount, 4);
  assert.equal(display.find((item) => item.wordId === "word_hello_a")?.errorBank?.totalCorrectCount, 1);
});

test("consolidate removes duplicate error-bank-only rows without progress records", async () => {
  const errorRecords = new Map([
    ["word_hello_a", {
      wordId: "word_hello_a",
      everWrong: true,
      totalWrongCount: 2,
      latestWrongAt: 100,
      active: true
    }],
    ["word_hello_b", {
      wordId: "word_hello_b",
      everWrong: true,
      totalWrongCount: 3,
      latestWrongAt: 200,
      active: true
    }]
  ]);
  const progressRecords = new Map();

  const store = {
    async getAllRecords() {
      return [...progressRecords.values()];
    },
    async getAllErrorBankRecords() {
      return [...errorRecords.values()];
    },
    async putRecord(record) {
      progressRecords.set(record.wordId, JSON.parse(JSON.stringify(record)));
      errorRecords.set(record.wordId, {
        wordId: record.wordId,
        ...record.errorBank
      });
    },
    async deleteRecord(wordId) {
      progressRecords.delete(wordId);
      errorRecords.delete(wordId);
    }
  };

  const result = await consolidateSpellingErrorBankByDedupeKey(store, lexiconEntries);

  assert.equal(result.changed, true);
  assert.equal(errorRecords.size, 1);
  assert.equal(progressRecords.size, 1);
  assert.equal([...errorRecords.values()][0].totalWrongCount, 5);
});

test("mergeDedupedErrorStats does not double-count the same sourceWordId", () => {
  const merged = mergeDedupedErrorStats(
    { wordId: "word_a", totalWrongCount: 3, latestWrongAt: 100, sourceWordIds: ["word_a"] },
    { wordId: "word_a", totalWrongCount: 3, latestWrongAt: 200, sourceWordIds: ["word_a"] }
  );

  assert.equal(merged.totalWrongCount, 3);
});