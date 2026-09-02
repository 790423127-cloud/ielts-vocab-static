import test from "node:test";
import assert from "node:assert/strict";
import {
  getReadingGSynonymStatus,
  isReadingGSynonymReviewCurrent,
  normalizeReadingGSynonymDetails,
  normalizeReadingGSynonyms,
  READING_G_SYNONYM_REVIEW_POLICY,
  READING_G_SYNONYM_STATUS
} from "../synonym-relations.mjs";
import {
  buildReadingGSynonymCompletedEntry,
  isReadingGSynonymCompletionCandidate
} from "../synonym-completion.mjs";

test("G-reading replacements are distinct, capped at five, with words before phrases", () => {
  assert.deepEqual(
    normalizeReadingGSynonyms([
      "go with",
      "colour",
      "color",
      "wide",
      "WIDE",
      "broad",
      "extensive",
      "large",
      "very wide"
    ], "Color"),
    ["wide", "broad", "extensive", "large", "go with"]
  );
});

test("G-reading synonym status separates available, pending, and reviewed-none", () => {
  assert.equal(
    getReadingGSynonymStatus({ word: "rapid", synonyms: ["fast"] }).state,
    READING_G_SYNONYM_STATUS.AVAILABLE
  );
  assert.equal(
    getReadingGSynonymStatus({ word: "rapid", synonyms: [] }).state,
    READING_G_SYNONYM_STATUS.PENDING
  );
  assert.equal(
    getReadingGSynonymStatus({ word: "rapid", synonyms: [], synonymsReviewed: true }).state,
    READING_G_SYNONYM_STATUS.REVIEWED_NONE
  );
});

test("G-reading synonym details stay attached to their displayed synonym", () => {
  const details = normalizeReadingGSynonymDetails([
    {
      word: "capability",
      pos: "noun",
      meaningZh: "能力；性能"
    }
  ], "ability", ["capability"]);
  assert.deepEqual(details, [{
    word: "capability",
    pos: "noun",
    meaningZh: "能力；性能"
  }]);
  assert.deepEqual(
    getReadingGSynonymStatus({ word: "ability", synonyms: ["capability"], synonymDetails: details }).details,
    details
  );
});

test("G-reading synonym completion preserves identity and records an empty AI review", () => {
  const entry = {
    id: "rg_word_unique",
    entryType: "word",
    word: "unique",
    normalizedKey: "unique",
    sourceFiles: ["source.json"],
    synonyms: []
  };
  assert.equal(isReadingGSynonymCompletionCandidate(entry), true);
  const completed = buildReadingGSynonymCompletedEntry(entry, {
    word: "unique",
    synonyms: []
  }, {
    source: "ai-cache",
    reviewedAt: "2026-08-06T00:00:00.000Z"
  });

  assert.equal(completed.id, entry.id);
  assert.equal(completed.word, entry.word);
  assert.deepEqual(completed.synonyms, []);
  assert.equal(completed.synonymsReviewed, true);
  assert.equal(completed.synonymsReviewSource, "ai-cache");
  assert.equal(getReadingGSynonymStatus(completed).state, READING_G_SYNONYM_STATUS.REVIEWED_NONE);
});

test("G-reading phrase entries use the same synonym replacement queue", () => {
  const entry = {
    id: "rg_phrase_compared_with",
    entryType: "phrase",
    word: "compared with",
    normalizedKey: "compared with",
    sourceFiles: ["source.json"],
    synonyms: []
  };
  assert.equal(isReadingGSynonymCompletionCandidate(entry), true);
  const completed = buildReadingGSynonymCompletedEntry(entry, {
    word: "compared with",
    synonyms: ["in comparison with"],
    synonymDetails: [{
      word: "in comparison with",
      pos: "connector/expression",
      meaningZh: "与……相比"
    }]
  }, {
    source: "ai-cache",
    reviewedAt: "2026-08-06T00:00:00.000Z"
  });

  assert.equal(completed.entryType, "phrase");
  assert.deepEqual(completed.synonyms, ["in comparison with"]);
  assert.equal(getReadingGSynonymStatus(completed).state, READING_G_SYNONYM_STATUS.AVAILABLE);
});

test("G-reading synonym review excludes reference-only entries", () => {
  assert.equal(isReadingGSynonymCompletionCandidate({
    entryType: "word",
    word: "reference-only",
    studyMode: "reference"
  }), false);
});

test("G-reading review policy makes legacy synonym reviews eligible for the new rule", () => {
  assert.equal(isReadingGSynonymReviewCurrent({ synonymsReviewed: true }), false);
  assert.equal(isReadingGSynonymReviewCurrent({
    synonymsReviewed: true,
    synonymsReviewPolicy: READING_G_SYNONYM_REVIEW_POLICY
  }), true);
});

test("G-reading phrase rewrites retain their type after normalization", () => {
  const [detail] = normalizeReadingGSynonymDetails([
    {
      word: "high-speed internet",
      pos: "noun phrase",
      meaningZh: "高速互联网",
      replacement_type: "phrase"
    }
  ], "broadband", ["high-speed internet"]);
  assert.equal(detail.word, "high-speed internet");
  assert.equal(detail.replacementType, "phrase");
});
