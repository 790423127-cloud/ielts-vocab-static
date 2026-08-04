import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  analyzeCandidateBreakdown,
  buildSpellingCandidates,
  computeBatchProgress,
  createSpellingSessionRunner,
  formatSessionTrainingLine,
  getWordId
} from "../index.mjs";
import { mergeSpellingLexicon } from "../lexicon-merge.mjs";
import { selectSpellingBatch } from "../spelling-categories.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const wordsPath = path.join(root, ".static-export-cache", "words.json");
const phrasesPath = path.join(root, "public", "data", "phrases.json");

test("word batch uses headwords only so headwords mode does not filter phrases out of session total", () => {
  const wordsRaw = JSON.parse(fs.readFileSync(wordsPath, "utf8"));
  const phrasesRaw = JSON.parse(fs.readFileSync(phrasesPath, "utf8"));
  const lexicon = mergeSpellingLexicon(wordsRaw.words || wordsRaw, phrasesRaw.phrases || phrasesRaw);

  const wordBatch = selectSpellingBatch(lexicon.headwords, {
    scopeKind: "word",
    categoryType: "difficulty",
    categoryValue: "基础高频",
    batchIndex: 0
  });

  const statuses = {};
  for (const entry of wordBatch.entries) {
    const wordId = getWordId(entry);
    if (wordId && entry.status) statuses[wordId] = entry.status;
  }

  const breakdown = analyzeCandidateBreakdown(wordBatch.entries, { statuses }, {
    entryMode: "headwords",
    excludeFamiliarFlashcards: true
  });

  assert.equal(wordBatch.batchEntryCount, 400);
  assert.equal(breakdown.rawBatchTotal, 400);
  assert.equal(breakdown.filteredByMode, 0);
  assert.ok(breakdown.filteredByInvalidAnswer >= 0);
  assert.ok(breakdown.filteredByFamiliar >= 0);
  assert.equal(breakdown.filteredByDuplicate, 0);
  assert.equal(breakdown.filteredBySrsOnly, 0);
  assert.equal(breakdown.filteredByRepairState, 0);
  assert.equal(
    breakdown.sessionTotal,
    breakdown.rawBatchTotal
      - breakdown.filteredByMode
      - breakdown.filteredByInvalidAnswer
      - breakdown.filteredByFamiliar
      - breakdown.filteredByDuplicate
      - breakdown.filteredBySrsOnly
      - breakdown.filteredByRepairState
  );
  assert.ok(wordBatch.entries.every((entry) => !/\s/.test(String(entry.word || "").trim()) || entry.entryType === "word"));
});

test("word training rejects phrase entries when scope is word", () => {
  const breakdown = analyzeCandidateBreakdown([
    { word: "alpha" },
    { word: "be due to", entryType: "phrase", isPhrase: true }
  ], { statuses: {} }, {
    entryMode: "headwords",
    scope: "word",
    excludeFamiliarFlashcards: false
  });

  assert.equal(breakdown.rawBatchTotal, 2);
  assert.equal(breakdown.filteredByMode, 1);
  assert.equal(breakdown.sessionTotal, 1);
  assert.equal(breakdown.sessionCandidates[0].entryType, "word");
});

test("includeFamiliar toggle increases sessionTotal when familiar words are excluded by default", () => {
  const words = [
    { word: "alpha" },
    { word: "beta" },
    { word: "gamma" }
  ];
  const familiarId = getWordId(words[1]);
  const flashcardState = { statuses: { [familiarId]: "熟悉" } };

  const excluded = analyzeCandidateBreakdown(words, flashcardState, {
    entryMode: "headwords",
    excludeFamiliarFlashcards: true
  });
  const included = analyzeCandidateBreakdown(words, flashcardState, {
    entryMode: "headwords",
    excludeFamiliarFlashcards: false
  });

  assert.equal(excluded.sessionTotal, 2);
  assert.equal(included.sessionTotal, 3);
  assert.equal(excluded.filteredByFamiliar, 1);
  assert.equal(included.filteredByFamiliar, 0);
});

test("progress denominator uses sessionTotal rather than rawBatchTotal", () => {
  const words = [
    { word: "alpha" },
    { word: "be due to", entryType: "phrase", isPhrase: true }
  ];

  const breakdown = analyzeCandidateBreakdown(words, { statuses: {} }, { entryMode: "headwords" });
  const candidates = buildSpellingCandidates(words, { statuses: {} }, { entryMode: "headwords" });
  const runner = createSpellingSessionRunner({
    candidates,
    candidateBreakdown: breakdown,
    records: {},
    now: Date.UTC(2026, 5, 18, 22, 0, 0),
    sequence: 1
  });

  const output = runner.getCurrent();
  assert.equal(output.sessionProgress.batchProgress.rawBatchTotal, 2);
  assert.equal(output.sessionProgress.batchProgress.sessionTotal, 1);
  assert.equal(output.sessionProgress.batchProgress.total, 1);
});

test("if no filters apply sessionTotal equals rawBatchTotal", () => {
  const words = [{ word: "alpha" }, { word: "beta" }];
  const breakdown = analyzeCandidateBreakdown(words, { statuses: {} }, {
    entryMode: "headwords",
    excludeFamiliarFlashcards: false
  });

  assert.equal(breakdown.rawBatchTotal, 2);
  assert.equal(breakdown.sessionTotal, 2);
  assert.equal(breakdown.filteredOutTotal, 0);
});

test("candidate breakdown filters interjections from spelling sessions", () => {
  const breakdown = analyzeCandidateBreakdown([
    { word: "alpha" },
    { word: "aha", pos: "interjection" },
    { word: "beta" }
  ], { statuses: {} }, {
    entryMode: "headwords",
    excludeFamiliarFlashcards: false
  });

  assert.equal(breakdown.rawBatchTotal, 3);
  assert.equal(breakdown.filteredByInterjection, 1);
  assert.equal(breakdown.sessionTotal, 2);
});

test("candidate breakdown filters truncated headwords from spelling sessions", () => {
  const breakdown = analyzeCandidateBreakdown([
    { word: "alpha" },
    {
      word: "agre",
      answer: "agre",
      meaning: "同意（原形 agree）",
      example: "I agree with you."
    },
    { word: "agree", answer: "agree", example: "I agree with you." },
    { word: "beta" }
  ], { statuses: {} }, {
    entryMode: "headwords",
    excludeFamiliarFlashcards: false
  });

  assert.equal(breakdown.filteredByTruncated, 1);
  assert.equal(breakdown.sessionTotal, 3);
});

test("candidate breakdown reports duplicate filters separately", () => {
  const breakdown = analyzeCandidateBreakdown([
    { word: "alpha" },
    { answer: "alpha" },
    { phrase: "be due to", entryType: "phrase" }
  ], { statuses: {} }, {
    entryMode: "phrases",
    scope: "phrase",
    excludeFamiliarFlashcards: false,
    currentBatchId: "phrase:test:0"
  });

  assert.equal(breakdown.rawBatchTotal, 3);
  assert.equal(breakdown.sessionTotal, 1);
  assert.equal(breakdown.filteredByMode, 2);
  assert.equal(breakdown.filteredByDuplicate, 0);
  assert.equal(breakdown.currentBatch, "phrase:test:0");
});

test("computeBatchProgress only counts completed answers in sessionTotal denominator", () => {
  const ids = ["word:alpha", "word:beta"];
  const progress = computeBatchProgress({
    "word:alpha": { today: { repairState: "mastered", completedToday: true } },
    "word:beta": { today: { repairStreak: 0, repairState: "in_repair" } }
  }, ids, {
    rawBatchTotal: 4,
    sessionTotal: 2,
    filteredOutTotal: 2
  });

  assert.equal(progress.completedCount, 1);
  assert.equal(progress.sessionTotal, 2);
  assert.equal(progress.total, 2);
  assert.equal(progress.completed, 1);
  assert.equal(progress.currentNumber, 2);
});

test("word partition batch line does not mention phrase filtering when scope is correct", () => {
  const wordsRaw = JSON.parse(fs.readFileSync(wordsPath, "utf8"));
  const phrasesRaw = JSON.parse(fs.readFileSync(phrasesPath, "utf8"));
  const lexicon = mergeSpellingLexicon(wordsRaw.words || wordsRaw, phrasesRaw.phrases || phrasesRaw);
  const wordBatch = selectSpellingBatch(lexicon.headwords, {
    scopeKind: "word",
    categoryType: "difficulty",
    categoryValue: "基础高频",
    batchIndex: 0
  });
  const breakdown = analyzeCandidateBreakdown(wordBatch.entries, { statuses: {} }, {
    entryMode: "headwords",
    excludeFamiliarFlashcards: true
  });

  const trainingLine = formatSessionTrainingLine(breakdown);
  assert.equal(breakdown.filteredByMode, 0);
  assert.equal(breakdown.filteredByMode, 0);
  assert.match(trainingLine, new RegExp(`本次训练：${breakdown.sessionTotal} 词`));
  assert.doesNotMatch(trainingLine, /短语/);
});
