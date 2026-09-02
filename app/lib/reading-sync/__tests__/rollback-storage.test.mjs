import test from "node:test";
import assert from "node:assert/strict";

import {
  READING_WORDS_ROLLBACK_KEY,
  READING_WORDS_STORAGE_KEY,
  buildReadingWordsRollback,
  compactReadingWordsForPersistence,
  restoreReadingWordsRollback,
  writeReadingWords,
  writeReadingWordsWithBackup
} from "../../reading-words/storage.mjs";
import {
  buildReadingParaphraseRollback,
  restoreReadingParaphraseRollback
} from "../../reading-paraphrases/storage.mjs";

function readingWord(id, overrides = {}) {
  return {
    id,
    wordId: id,
    word: `word-${id}`,
    meaning: "原释义",
    definition: "x".repeat(800),
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
    ...overrides
  };
}

class QuotaStorage {
  constructor(limit) {
    this.limit = limit;
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    const next = new Map(this.values);
    next.set(String(key), String(value));
    const size = [...next].reduce((sum, [storedKey, storedValue]) => (
      sum + storedKey.length + storedValue.length
    ), 0);
    if (size > this.limit) throw new Error("QuotaExceededError");
    this.values = next;
  }
}

test("reading rollback stores only the reverse delta and restores the exact previous order", () => {
  const previous = [readingWord("a"), readingWord("b"), readingWord("c")];
  const next = [
    readingWord("a"),
    readingWord("b", { meaning: "新释义" }),
    readingWord("d")
  ];
  const rollback = buildReadingWordsRollback(next, previous, {
    now: "2026-08-14T01:00:00.000Z"
  });

  assert.equal(rollback.kind, "delta");
  assert.deepEqual(rollback.previousOrder, ["a", "b", "c"]);
  assert.deepEqual(rollback.previousEntries.map((item) => item.id), ["b", "c"]);
  assert.deepEqual(
    restoreReadingWordsRollback(next, rollback, { now: "2026-08-14T01:00:00.000Z" }),
    compactReadingWordsForPersistence(previous, { now: "2026-08-14T01:00:00.000Z" })
  );
});

test("delta backup allows a near-quota notebook to add entries without duplicating the whole book", () => {
  const previousWindow = globalThis.window;
  const words = Array.from({ length: 120 }, (_, index) => readingWord(`id-${index}`));
  const nextWords = [...words, readingWord("new")];
  const currentPayload = JSON.stringify({
    version: 1,
    updatedAt: "2026-08-14T00:00:00.000Z",
    words: compactReadingWordsForPersistence(words, { now: "2026-08-14T00:00:00.000Z" })
  });
  const nextPayload = JSON.stringify({
    version: 1,
    updatedAt: "2026-08-14T00:00:00.000Z",
    words: compactReadingWordsForPersistence(nextWords, { now: "2026-08-14T00:00:00.000Z" })
  });
  const rollbackPayload = JSON.stringify(buildReadingWordsRollback(nextWords, words, {
    now: "2026-08-14T00:00:00.000Z"
  }));
  const quota = READING_WORDS_STORAGE_KEY.length + nextPayload.length
    + READING_WORDS_ROLLBACK_KEY.length + rollbackPayload.length + 200;
  const storage = new QuotaStorage(quota);
  storage.setItem(READING_WORDS_STORAGE_KEY, currentPayload);
  globalThis.window = { localStorage: storage };

  try {
    assert.ok(currentPayload.length * 2 > quota);
    assert.equal(writeReadingWordsWithBackup(nextWords, words), true);
    assert.equal(JSON.parse(storage.getItem(READING_WORDS_STORAGE_KEY)).words.length, 121);
    assert.equal(JSON.parse(storage.getItem(READING_WORDS_ROLLBACK_KEY)).kind, "delta");
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("a failed replacement remains atomic and keeps the previous notebook", () => {
  const previousWindow = globalThis.window;
  const previous = [readingWord("a")];
  const storage = new QuotaStorage(10_000);
  globalThis.window = { localStorage: storage };
  assert.equal(writeReadingWords(previous), true);
  const before = storage.getItem(READING_WORDS_STORAGE_KEY);
  storage.limit = before.length + 100;

  try {
    assert.equal(writeReadingWordsWithBackup([readingWord("huge", {
      definition: "y".repeat(20_000)
    })], previous), false);
    assert.equal(storage.getItem(READING_WORDS_STORAGE_KEY), before);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("paraphrase rollback also uses a reversible delta instead of a full duplicate", () => {
  const items = Array.from({ length: 80 }, (_, index) => ({
    id: `pair-${index}`,
    questionPhrase: `question phrase ${index}`,
    sourcePhrase: `source phrase ${index}`,
    sources: [{ id: `source-${index}`, evidence: "x".repeat(120) }]
  }));
  const previous = {
    schemaVersion: 1,
    items,
    direction: "source-to-question",
    positions: { "pair-0": 2 },
    updatedAt: 10
  };
  const next = {
    ...previous,
    items: [
      ...previous.items.slice(0, 25),
      { ...previous.items[25], sourcePhrase: "changed source phrase" },
      ...previous.items.slice(26),
      { id: "pair-new", questionPhrase: "near", sourcePhrase: "close to" }
    ],
    updatedAt: 20
  };
  const rollback = buildReadingParaphraseRollback(next, previous, 30);

  assert.equal(rollback.kind, "delta");
  assert.deepEqual(rollback.previousEntries.map((item) => item.id), ["pair-25"]);
  assert.deepEqual(restoreReadingParaphraseRollback(next, rollback), previous);
  assert.ok(JSON.stringify(rollback).length < JSON.stringify(previous).length);
});
