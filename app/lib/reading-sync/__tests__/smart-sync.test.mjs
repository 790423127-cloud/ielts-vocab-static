import assert from "node:assert/strict";
import test from "node:test";

import { createReadingParaphraseState } from "../../reading-paraphrases/storage.mjs";
import {
  buildReadingCoachSyncReceipt,
  mergeReadingCoachParaphrases,
  mergeReadingCoachWords,
  parseReadingCoachSyncPackage
} from "../smart-sync.mjs";

const fingerprintA = "a".repeat(64);
const fingerprintB = "b".repeat(64);

function packageWith(overrides = {}) {
  return {
    type: "ielts-reading-coach-smart-sync",
    schemaVersion: 1,
    transferId: "transfer-1",
    words: [{
      id: "word-1",
      fingerprint: fingerprintA,
      word: "retain",
      meaning: "保留",
      note: "原文生词",
      occurrenceCount: 2,
      sources: [{ testTitle: "剑雅5 Test B", partNumber: 2 }]
    }],
    paraphrases: [{
      id: "pair-1",
      fingerprint: fingerprintA,
      questionPhrase: "glow-worm distribution",
      sourcePhrase: "spread around the globe",
      relationType: "near-paraphrase",
      sources: [{ evidence: "They spread around the globe." }]
    }],
    ...overrides
  };
}

test("validates the reading coach package and builds an exact receipt", () => {
  const payload = parseReadingCoachSyncPackage(packageWith());
  const receipt = buildReadingCoachSyncReceipt(payload);
  assert.equal(payload.words.length, 1);
  assert.deepEqual(receipt.words, [{ id: "word-1", fingerprint: fingerprintA }]);
  assert.deepEqual(receipt.paraphrases, [{ id: "pair-1", fingerprint: fingerprintA }]);
});

test("repeating the same word fingerprint is idempotent", () => {
  const first = mergeReadingCoachWords([], packageWith().words, { now: "2026-08-01T00:00:00.000Z" });
  const second = mergeReadingCoachWords(first.words, packageWith().words, { now: "2026-08-02T00:00:00.000Z" });
  assert.equal(first.added, 1);
  assert.equal(second.unchanged, 1);
  assert.equal(second.words.length, 1);
  assert.equal(second.words[0].importCount, 2);
});

test("changed source content updates one linked word without overwriting local study state", () => {
  const first = mergeReadingCoachWords([], packageWith().words, { now: "2026-08-01T00:00:00.000Z" });
  first.words[0].status = "不熟";
  first.words[0].favorite = true;
  const changed = packageWith().words.map((item) => ({
    ...item,
    fingerprint: fingerprintB,
    meaning: "保留；保持"
  }));
  const second = mergeReadingCoachWords(first.words, changed, { now: "2026-08-02T00:00:00.000Z" });
  assert.equal(second.updated, 1);
  assert.equal(second.words.length, 1);
  assert.equal(second.words[0].meaning, "保留；保持");
  assert.equal(second.words[0].status, "不熟");
  assert.equal(second.words[0].favorite, true);
});

test("an imported source sentence without a supplied meaning stays pending for contextual AI review", () => {
  const [incoming] = packageWith().words;
  const result = mergeReadingCoachWords([], [{
    ...incoming,
    meaning: "",
    sources: [{
      id: "source-1",
      sentence: "Visitors can stroke or feed the sheep.",
      testTitle: "剑雅17 Test 4"
    }]
  }], { now: "2026-08-11T00:00:00.000Z" });

  assert.equal(result.words[0].readingContextPending, true);
  assert.equal(result.words[0].readingContextReviewed, false);
  assert.equal(result.words[0].readingMeaning, "");
});

test("paraphrase updates by external id even when the phrase changes", () => {
  const first = mergeReadingCoachParaphrases(createReadingParaphraseState(), packageWith().paraphrases, 100);
  first.state.items[0].study = { status: "fuzzy", updatedAt: 200 };
  const changed = packageWith().paraphrases.map((item) => ({
    ...item,
    fingerprint: fingerprintB,
    sourcePhrase: "spread to almost every part of the globe"
  }));
  const second = mergeReadingCoachParaphrases(first.state, changed, 300);
  assert.equal(second.updated, 1);
  assert.equal(second.state.items.length, 1);
  assert.equal(second.state.items[0].sourcePhrase, "spread to almost every part of the globe");
  assert.equal(second.state.items[0].study.status, "fuzzy");
});

test("rejects incomplete fingerprints instead of partially importing", () => {
  assert.throws(
    () => parseReadingCoachSyncPackage(packageWith({ words: [{ id: "word-1", word: "retain", fingerprint: "bad" }] })),
    /不完整条目/
  );
});
