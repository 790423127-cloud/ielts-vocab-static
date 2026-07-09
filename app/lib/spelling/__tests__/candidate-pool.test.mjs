import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildCurrentBatchCandidates,
  clearCandidateCache,
  dedupeCandidates,
  findCandidateDuplicates,
  getCandidateCacheKey
} from "../candidate-pool.mjs";
import { mergeSpellingLexicon } from "../lexicon-merge.mjs";
import { selectSpellingBatch, SPELLING_BATCH_SIZE } from "../spelling-categories.mjs";

test("buildCurrentBatchCandidates clears scope cache and dedupes duplicate answers", () => {
  const words = [
    { word: "alpha" },
    { answer: "alpha" },
    { word: "beta" }
  ];

  const result = buildCurrentBatchCandidates(words, { statuses: {} }, {
    entryMode: "headwords",
    scope: "word",
    excludeFamiliarFlashcards: false,
    currentBatchId: "test:0"
  });

  assert.equal(result.candidates.length, 2);
  assert.equal(result.breakdown.candidateTotal, 2);
  assert.equal(result.breakdown.sessionTotal, 2);
  assert.equal(result.duplicateReport.duplicateAnswers.length, 0);
});

test("dedupeCandidates removes duplicate wordIds and answers", () => {
  const { candidates, duplicateCount } = dedupeCandidates([
    { wordId: "word:alpha", expectedAnswer: "alpha" },
    { wordId: "word:alpha", expectedAnswer: "alpha" },
    { wordId: "word:beta", expectedAnswer: "beta" }
  ]);

  assert.equal(candidates.length, 2);
  assert.equal(duplicateCount, 1);
});

test("findCandidateDuplicates reports repeated identifiers", () => {
  const report = findCandidateDuplicates([
    { wordId: "word:alpha", expectedAnswer: "alpha", displayText: "alpha" },
    { wordId: "word:alpha", expectedAnswer: "alpha", displayText: "alpha" }
  ]);

  assert.equal(report.duplicateWordIds.length, 1);
  assert.equal(report.duplicateAnswers.length, 1);
  assert.equal(report.duplicateHeadwords.length, 1);
});

test("word and phrase batches stay within one batch size", () => {
  const wordsRaw = JSON.parse(fs.readFileSync(".static-export-cache/words.json", "utf8"));
  const phrasesRaw = JSON.parse(fs.readFileSync("public/data/phrases.json", "utf8"));
  const lexicon = mergeSpellingLexicon(wordsRaw.words || wordsRaw, phrasesRaw.phrases || phrasesRaw);

  const wordBatch = selectSpellingBatch(lexicon.headwords, {
    scopeKind: "word",
    categoryType: "difficulty",
    categoryValue: "基础高频",
    batchIndex: 0
  });
  const phraseBatch = selectSpellingBatch(lexicon.phrases, {
    scopeKind: "phrase",
    categoryType: "difficulty",
    categoryValue: "基础高频",
    batchIndex: 0
  });

  const wordResult = buildCurrentBatchCandidates(wordBatch.entries, { statuses: {} }, {
    entryMode: "headwords",
    scope: "word",
    excludeFamiliarFlashcards: true,
    currentBatchId: "word:test:0"
  });
  const phraseResult = buildCurrentBatchCandidates(phraseBatch.entries, { statuses: {} }, {
    entryMode: "phrases",
    scope: "phrase",
    excludeFamiliarFlashcards: true,
    currentBatchId: "phrase:test:0"
  });

  assert.equal(wordBatch.entries.length, SPELLING_BATCH_SIZE);
  assert.equal(phraseBatch.entries.length, SPELLING_BATCH_SIZE);
  assert.equal(wordResult.breakdown.rawBatchTotal, SPELLING_BATCH_SIZE);
  assert.equal(phraseResult.breakdown.rawBatchTotal, SPELLING_BATCH_SIZE);
  assert.ok(wordResult.breakdown.sessionTotal <= SPELLING_BATCH_SIZE);
  assert.ok(phraseResult.breakdown.sessionTotal <= SPELLING_BATCH_SIZE);
  assert.ok(wordResult.candidates.every((candidate) => candidate.entryType === "word"));
  assert.ok(phraseResult.candidates.every((candidate) => candidate.entryType === "phrase"));
});

test("candidate cache keys are isolated by scope", () => {
  assert.notEqual(getCandidateCacheKey("word"), getCandidateCacheKey("phrase"));
  assert.doesNotThrow(() => {
    clearCandidateCache("word");
    clearCandidateCache("phrase");
  });
});