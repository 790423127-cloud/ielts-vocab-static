import test from "node:test";
import assert from "node:assert/strict";

import { mergeErrorBankRecords } from "../error-bank.mjs";
import {
  buildErrorBankLexiconIndexes,
  parseLegacySpellingWordId,
  recoverErrorBankRecords,
  recoverAndPersistSpellingErrorBank,
  resolveErrorBankTarget
} from "../error-bank-recovery.mjs";

const lexiconEntries = [
  {
    word: "bill",
    id: "word_c6b0999819b0",
    fixedFrom: "bil",
    fixedCanonical: "bill",
    sourceType: "truncation-canonical-fix",
    meaning: "账单"
  },
  {
    word: "rustproof",
    id: "word_a838666f9dad",
    displacedFrom: "bill",
    displacedTo: "bil",
    sourceType: "truncation-slot-displaced",
    meaning: "防锈"
  },
  {
    word: "vacancy",
    id: "word_vacancy",
    meaning: "空缺"
  }
];

test("parseLegacySpellingWordId reads legacy localStorage ids", () => {
  assert.equal(parseLegacySpellingWordId("word:bil"), "bil");
  assert.equal(parseLegacySpellingWordId("phrase:be due to"), "be due to");
});

test("resolveErrorBankTarget keeps restored bill on the bil slot", () => {
  const indexes = buildErrorBankLexiconIndexes(lexiconEntries);
  const target = resolveErrorBankTarget({ wordId: "word_c6b0999819b0" }, indexes);

  assert.equal(target?.wordId, "word_c6b0999819b0");
  assert.equal(target?.entry.word, "bill");
});

test("resolveErrorBankTarget relinks the old bill slot and legacy bil ids", () => {
  const indexes = buildErrorBankLexiconIndexes(lexiconEntries);

  const oldBillSlot = resolveErrorBankTarget({ wordId: "word_a838666f9dad" }, indexes);
  assert.equal(oldBillSlot?.wordId, "word_c6b0999819b0");
  assert.equal(oldBillSlot?.reason, "displaced-slot");

  const legacyBil = resolveErrorBankTarget({ wordId: "word:bil" }, indexes);
  assert.equal(legacyBil?.wordId, "word_c6b0999819b0");
  assert.equal(legacyBil?.reason, "legacy-word-id");

  const legacyBill = resolveErrorBankTarget({ wordId: "word:bill" }, indexes);
  assert.equal(legacyBill?.wordId, "word_c6b0999819b0");
});

test("recoverErrorBankRecords merges bil, bill, and old-slot errors onto restored bill", () => {
  const { records, relinks } = recoverErrorBankRecords(
    [
      {
        wordId: "word:bil",
        everWrong: true,
        totalWrongCount: 2,
        latestWrongAt: 100,
        lastWrongAnswer: "bil",
        active: true
      },
      {
        wordId: "word_a838666f9dad",
        everWrong: true,
        totalWrongCount: 3,
        latestWrongAt: 250,
        lastWrongAnswer: "bile",
        active: true
      },
      {
        wordId: "word_c6b0999819b0",
        everWrong: true,
        totalWrongCount: 1,
        latestWrongAt: 200,
        lastWrongAnswer: "billl",
        active: true
      }
    ],
    lexiconEntries
  );

  assert.equal(records.length, 1);
  assert.equal(records[0].wordId, "word_c6b0999819b0");
  assert.equal(records[0].totalWrongCount, 3);
  assert.equal(records[0].lastWrongAnswer, "bile");
  assert.ok(relinks.length >= 2);
});

test("mergeErrorBankRecords shows restored bill for truncated aliases", () => {
  const merged = mergeErrorBankRecords(
    [
      {
        wordId: "word:bil",
        everWrong: true,
        totalWrongCount: 3,
        latestWrongAt: 300,
        lastWrongAnswer: "bil",
        active: true
      }
    ],
    lexiconEntries
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].word, "bill");
  assert.equal(merged[0].errorBank.totalWrongCount, 3);
});

test("recoverAndPersistSpellingErrorBank merges alias progress records onto restored bill", async () => {
  const records = new Map([
    ["word_c6b0999819b0", {
      wordId: "word_c6b0999819b0",
      revision: 1,
      errorBank: {
        everWrong: true,
        totalWrongCount: 1,
        latestWrongAt: 120,
        lastWrongAnswer: "billl",
        active: true
      }
    }],
    ["word_a838666f9dad", {
      wordId: "word_a838666f9dad",
      revision: 1,
      errorBank: {
        everWrong: true,
        totalWrongCount: 2,
        latestWrongAt: 180,
        lastWrongAnswer: "bile",
        active: true
      }
    }]
  ]);

  const store = {
    async open() {},
    async getAllErrorBankRecords() {
      return Array.from(records.values()).map((record) => ({
        wordId: record.wordId,
        ...record.errorBank
      }));
    },
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

  const result = await recoverAndPersistSpellingErrorBank(store, lexiconEntries, {
    scope: "test",
    forceRecovery: true
  });

  assert.equal(result.changed, true);
  assert.equal(records.get("word_c6b0999819b0")?.errorBank?.totalWrongCount, 2);
  assert.equal(records.get("word_c6b0999819b0")?.errorBank?.lastWrongAnswer, "bile");
  assert.equal(records.get("word_a838666f9dad"), undefined);
  assert.equal(records.size, 1);
});

test("recoverErrorBankRecords keeps lexicon orphans instead of dropping them", () => {
  const { records } = recoverErrorBankRecords(
    [
      {
        wordId: "word:agre",
        everWrong: true,
        totalWrongCount: 2,
        latestWrongAt: 400,
        lastWrongAnswer: "agre",
        active: true
      }
    ],
    lexiconEntries
  );

  assert.equal(records.length, 1);
  assert.equal(records[0].wordId, "word:agre");
  assert.equal(records[0].orphaned, true);
});

test("mergeErrorBankRecords shows lexicon orphans with legacy headword", () => {
  const merged = mergeErrorBankRecords(
    [
      {
        wordId: "word:agre",
        everWrong: true,
        totalWrongCount: 2,
        latestWrongAt: 400,
        lastWrongAnswer: "agre",
        active: true
      }
    ],
    lexiconEntries
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].word, "agre");
  assert.equal(merged[0].orphaned, true);
});

test("recoverAndPersistSpellingErrorBank skips persistence after recovery version is current", async () => {
  const records = new Map([
    ["word_vacancy", {
      wordId: "word_vacancy",
      revision: 1,
      errorBank: {
        everWrong: true,
        dedupeKey: "vacancy",
        displayWord: "vacancy",
        sourceWordIds: ["word_vacancy"],
        totalWrongCount: 1,
        latestWrongAt: 120,
        active: true
      }
    }]
  ]);

  let putCount = 0;
  let errorReadCount = 0;
  let progressReadCount = 0;
  const store = {
    async open() {},
    async getAllErrorBankRecords() {
      errorReadCount += 1;
      return Array.from(records.values()).map((record) => ({
        wordId: record.wordId,
        ...record.errorBank
      }));
    },
    async getAllRecords() {
      progressReadCount += 1;
      return [...records.values()];
    },
    async putRecord(record) {
      putCount += 1;
      records.set(record.wordId, JSON.parse(JSON.stringify(record)));
    }
  };

  const result = await recoverAndPersistSpellingErrorBank(store, lexiconEntries, {
    scope: "already-recovered"
  });

  assert.equal(result.changed, false);
  assert.equal(result.forceRecovery, false);
  assert.equal(putCount, 0);
  assert.equal(errorReadCount, 1);
  assert.equal(progressReadCount, 1);
});

test("recoverAndPersistSpellingErrorBank restores progress-only historical errors without force", async () => {
  const records = new Map([
    ["word_vacancy", {
      wordId: "word_vacancy",
      revision: 4,
      today: {
        sessionDate: "2026-06-22",
        repairState: "mastered",
        completedToday: true,
        activeInTodayList: false
      },
      errorBank: {
        everWrong: true,
        totalWrongCount: 3,
        totalCorrectCount: 2,
        latestWrongAt: 500,
        lastWrongAnswer: "vacncy",
        active: false,
        severity: "medium"
      }
    }]
  ]);
  const errorRecords = new Map();

  const store = {
    async getAllErrorBankRecords() {
      return [...errorRecords.values()];
    },
    async getAllRecords() {
      return [...records.values()];
    },
    async putRecord(record) {
      records.set(record.wordId, JSON.parse(JSON.stringify(record)));
      errorRecords.set(record.wordId, {
        wordId: record.wordId,
        ...record.errorBank
      });
    },
    async deleteRecord(wordId) {
      records.delete(wordId);
      errorRecords.delete(wordId);
    }
  };

  const result = await recoverAndPersistSpellingErrorBank(store, lexiconEntries, {
    scope: "progress-only",
    importLegacy: false
  });

  assert.equal(result.changed, true);
  assert.equal(errorRecords.get("word_vacancy")?.active, true);
  assert.equal(errorRecords.get("word_vacancy")?.totalWrongCount, 3);
  assert.equal(records.get("word_vacancy")?.today?.completedToday, true);
});
