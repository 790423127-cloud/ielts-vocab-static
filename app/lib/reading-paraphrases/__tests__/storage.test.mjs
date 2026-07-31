import assert from "node:assert/strict";
import test from "node:test";

import {
  READING_PARAPHRASE_MAX_IMPORT_BYTES,
  READING_PARAPHRASE_MAX_IMPORT_ITEMS,
  READING_PARAPHRASE_STATUS,
  createReadingParaphraseState,
  mergeReadingParaphraseCloudState,
  mergeReadingParaphraseState,
  parseReadingParaphraseImport
} from "../storage.mjs";

test("imports the detailed reading coach package without dropping evidence", () => {
  const items = parseReadingParaphraseImport({
    schemaVersion: 1,
    source: "ielts-reading-coach",
    items: [{
      id: "pair-1",
      questionPhrase: "cost less than",
      sourcePhrase: "under $10",
      occurrenceCount: 2,
      sources: [{
        id: "source-1",
        testTitle: "Test 1",
        partNumber: 2,
        evidence: "Every item is under $10."
      }]
    }]
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].id, "pair-1");
  assert.equal(items[0].occurrenceCount, 2);
  assert.equal(items[0].sources[0].evidence, "Every item is under $10.");
});

test("keeps TXT compatibility and directional pair identity", () => {
  const items = parseReadingParaphraseImport("cost less than = under $10\nannual fee = yearly charge");
  assert.equal(items.length, 2);
  assert.equal(items[0].questionPhrase, "cost less than");
  assert.equal(items[0].sourcePhrase, "under $10");
});

test("rejects oversized imports before they can exhaust browser storage", () => {
  assert.throws(
    () => parseReadingParaphraseImport("x".repeat(READING_PARAPHRASE_MAX_IMPORT_BYTES + 1)),
    /不超过 4 MB/
  );
  assert.throws(
    () => parseReadingParaphraseImport({
      items: Array.from({ length: READING_PARAPHRASE_MAX_IMPORT_ITEMS + 1 })
    }),
    /最多导入 20000/
  );
});

test("reimport merges sources while preserving local study status", () => {
  const first = parseReadingParaphraseImport({
    items: [{
      id: "pair-1",
      questionPhrase: "cost less than",
      sourcePhrase: "under $10",
      sources: [{ id: "source-1", evidence: "First evidence." }]
    }]
  });
  const initial = mergeReadingParaphraseState(createReadingParaphraseState(), first, 100).state;
  initial.items[0].study = { status: READING_PARAPHRASE_STATUS.UNFAMILIAR, updatedAt: 200 };

  const next = parseReadingParaphraseImport({
    items: [{
      id: "pair-new-id",
      questionPhrase: "cost less than",
      sourcePhrase: "under $10",
      occurrenceCount: 2,
      sources: [{ id: "source-2", evidence: "Second evidence." }]
    }]
  });
  const result = mergeReadingParaphraseState(initial, next, 300);

  assert.equal(result.added, 0);
  assert.equal(result.updated, 1);
  assert.equal(result.state.items.length, 1);
  assert.equal(result.state.items[0].id, "pair-1");
  assert.equal(result.state.items[0].sources.length, 2);
  assert.equal(result.state.items[0].study.status, READING_PARAPHRASE_STATUS.UNFAMILIAR);
});

test("cloud merge keeps the newest per-pair study event", () => {
  const local = {
    ...createReadingParaphraseState(),
    updatedAt: 500,
    items: [{
      id: "pair-1",
      questionPhrase: "annual fee",
      sourcePhrase: "yearly charge",
      study: { status: READING_PARAPHRASE_STATUS.FUZZY, updatedAt: 500 }
    }]
  };
  const remote = {
    ...createReadingParaphraseState(),
    updatedAt: 600,
    items: [{
      id: "pair-1",
      questionPhrase: "annual fee",
      sourcePhrase: "yearly charge",
      study: { status: READING_PARAPHRASE_STATUS.KNOWN, updatedAt: 400 }
    }]
  };

  const merged = mergeReadingParaphraseCloudState(local, remote);
  assert.equal(merged.items[0].study.status, READING_PARAPHRASE_STATUS.FUZZY);
});

test("cloud merge uses the cursor from the newer device snapshot", () => {
  const local = {
    ...createReadingParaphraseState(),
    updatedAt: 500,
    positions: { "question-to-source:all": "local-pair" }
  };
  const remote = {
    ...createReadingParaphraseState(),
    updatedAt: 600,
    positions: { "question-to-source:all": "remote-pair" }
  };

  const merged = mergeReadingParaphraseCloudState(local, remote);
  assert.equal(merged.positions["question-to-source:all"], "remote-pair");
});
