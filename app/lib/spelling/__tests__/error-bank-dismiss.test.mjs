import test from "node:test";
import assert from "node:assert/strict";

import {
  dismissErrorBankCandidate,
  getErrorBankRecordIds,
  isErrorBankCandidate,
  resolveErrorBankDeleteShortcut
} from "../error-bank-dismiss.mjs";
import { errorBankEntriesToSpellingCandidates } from "../error-bank.mjs";

function createStore(records = []) {
  const progress = new Map(records.map((record) => [record.wordId, structuredClone(record)]));
  const deletedErrorIds = [];

  return {
    progress,
    deletedErrorIds,
    async getRecord(wordId) {
      return progress.get(wordId) || null;
    },
    async putRecord(record) {
      progress.set(record.wordId, structuredClone(record));
      if (!record.errorBank?.everWrong) deletedErrorIds.push(record.wordId);
      return record;
    },
    async deleteErrorBankRecord(wordId) {
      deletedErrorIds.push(wordId);
    }
  };
}

test("error bank candidates keep the exact underlying record ids", () => {
  const [candidate] = errorBankEntriesToSpellingCandidates([{
    id: "stable-word",
    wordId: "stable-word",
    word: "brochure",
    errorBank: {
      dedupeKey: "word:brochure",
      sourceWordIds: ["stable-word", "legacy:brochure"]
    }
  }]);

  assert.deepEqual(candidate.__errorBankRecordIds, ["stable-word", "legacy:brochure"]);
  assert.deepEqual(getErrorBankRecordIds({ sourceWord: candidate }), ["stable-word", "legacy:brochure"]);
  assert.equal(isErrorBankCandidate({ sourceWord: candidate }), true);
});

test("dismissing an error bank item preserves spelling progress and SRS", async () => {
  const original = {
    wordId: "stable-word",
    spelling: { level: 3 },
    today: { repairState: "idle", sessionDate: "2026-07-28" },
    srs: { stage: 2, nextReviewAt: 123456 },
    errorBank: { everWrong: true, active: true, totalWrongCount: 4 },
    revision: 7,
    updatedAt: 100
  };
  const store = createStore([original]);
  const candidate = {
    entryType: "word",
    sourceWord: { __errorBankRecordIds: ["stable-word"] }
  };

  const result = await dismissErrorBankCandidate(store, candidate, { now: 500 });
  const saved = store.progress.get("stable-word");

  assert.deepEqual(result, { removed: 1, wordIds: ["stable-word"] });
  assert.deepEqual(saved.spelling, original.spelling);
  assert.deepEqual(saved.today, original.today);
  assert.deepEqual(saved.srs, original.srs);
  assert.equal(saved.wordId, "stable-word");
  assert.equal(saved.errorBank.everWrong, false);
  assert.equal(saved.errorBank.active, false);
  assert.equal(saved.errorBank.dismissedAt, 500);
  assert.equal(saved.revision, 8);
  assert.deepEqual(store.deletedErrorIds, ["stable-word"]);
});

test("error bank shortcuts do not turn a typed d into deletion", () => {
  const base = { hasErrorBankCandidate: true };

  assert.equal(resolveErrorBankDeleteShortcut({ key: "d" }, { ...base, editableTarget: false }), true);
  assert.equal(resolveErrorBankDeleteShortcut({ key: "D" }, { ...base, editableTarget: false }), true);
  assert.equal(resolveErrorBankDeleteShortcut({ key: "d" }, { ...base, editableTarget: true }), false);
  assert.equal(resolveErrorBankDeleteShortcut({ key: "Delete" }, { ...base, editableTarget: true }), true);
  assert.equal(resolveErrorBankDeleteShortcut({ key: "Delete", repeat: true }, base), false);
  assert.equal(resolveErrorBankDeleteShortcut({ key: "Delete" }, { hasErrorBankCandidate: false }), false);
});
