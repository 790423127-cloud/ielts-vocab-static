import test from "node:test";
import assert from "node:assert/strict";
import {
  STATIC_READING_WORDS_PUBLISH_TYPE,
  buildStaticReadingWordsPublishSnapshot,
  isReadingWordsTransferPackage,
  wouldErasePublishedReadingWords
} from "../static-publish.mjs";

function transferPackage(exportedAt) {
  return {
    type: "ielts-reading-words-transfer",
    version: 1,
    exportedAt,
    readingWords: [{ id: "reading-alpha", word: "alpha", meaning: "阿尔法" }],
    linkedMainEntries: [{ id: "reading-alpha", word: "alpha", transferType: "supplement" }],
    sourceMainMeta: { version: "test" }
  };
}

test("static reading publish snapshot keeps a stable content revision", () => {
  const first = buildStaticReadingWordsPublishSnapshot(transferPackage("2026-08-01T00:00:00.000Z"), {
    sourceUpdatedAt: "2026-08-01T00:00:00.000Z",
    publishedAt: "2026-08-01T00:00:00.000Z"
  });
  const second = buildStaticReadingWordsPublishSnapshot(transferPackage("2026-08-02T00:00:00.000Z"), {
    sourceUpdatedAt: "2026-08-02T00:00:00.000Z",
    publishedAt: "2026-08-02T00:00:00.000Z"
  });

  assert.equal(first.type, STATIC_READING_WORDS_PUBLISH_TYPE);
  assert.equal(first.wordCount, 1);
  assert.equal(first.revision, second.revision);
  assert.equal(isReadingWordsTransferPackage(first.transfer), true);
});

test("an empty browser snapshot cannot erase an existing published list", () => {
  assert.equal(wouldErasePublishedReadingWords({ wordCount: 140 }, { wordCount: 0 }), true);
  assert.equal(wouldErasePublishedReadingWords({ wordCount: 0 }, { wordCount: 0 }), false);
  assert.equal(wouldErasePublishedReadingWords({ wordCount: 140 }, { wordCount: 139 }), false);
});
