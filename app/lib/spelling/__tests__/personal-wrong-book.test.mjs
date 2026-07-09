import test from "node:test";
import assert from "node:assert/strict";

import {
  PERSONAL_WRONG_BOOK_BASE_REPS,
  PERSONAL_WRONG_BOOK_BATCH_SIZE,
  PERSONAL_WRONG_BOOK_PLURAL_REPS,
  PERSONAL_WRONG_BOOK_REPETITIONS,
  buildPersonalWrongBookCandidates,
  clampPersonalWrongBatchIndex,
  dedupePersonalWrongBookRecords,
  inferPluralBase,
  listPersonalWrongBookBatchOptions,
  mergePersonalWrongBookRecords,
  normalizePersonalWrongBookRecords,
  parsePersonalWrongBookInput,
  resolvePersonalWrongBatchIndexAfterAdd,
  resolvePluralInflectionPair,
  selectPersonalWrongBookBatch,
  summarizePersonalWrongBook
} from "../personal-wrong-book.mjs";
import { buildCurrentBatchCandidates } from "../candidate-pool.mjs";
import { computeBatchProgress } from "../batch-progress.mjs";
import { selectNextPersonalWrongWrite, extractPersonalWrongWordUnits } from "../personal-wrong-progress.mjs";
import { createSpellingSessionRunner } from "../session-runner.mjs";
import { createSpellingRecord } from "../state-machine.mjs";
import { REPAIR_STATES } from "../repair-progress.mjs";

test("parsePersonalWrongBookInput accepts one item per line and optional meaning", () => {
  const parsed = parsePersonalWrongBookInput("accommodation | 住宿\non the other hand | 另一方面\naccommodation", {
    now: 1000
  });

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].anchor, "accommodation");
  assert.equal(parsed[0].meaning, "住宿");
  assert.equal(parsed[1].scope, "phrase");
});

test("parsePersonalWrongBookInput accepts numbered answer-list lines", () => {
  const parsed = parsePersonalWrongBookInput("31、 rats\n32, snakes\n33. tourism\n34) traffic\n35 rain", {
    now: 1000
  });

  assert.deepEqual(parsed.map((item) => item.targetAnswer), ["rats", "snakes", "tourism", "traffic", "rain"]);
  assert.equal(parsed.find((item) => item.targetAnswer === "snakes").anchor, "snake");
  assert.ok(parsed.every((item) => item.scope === "word"));
});

test("personal wrong book expands each record to four writes with two base and two plural", () => {
  const records = mergePersonalWrongBookRecords([], parsePersonalWrongBookInput("vacancies | vacancy | 职位空缺"));
  const candidates = buildPersonalWrongBookCandidates(records, [
    {
      id: "word_vacancy",
      wordId: "word_vacancy",
      word: "vacancy",
      answer: "vacancy",
      meaning: "空缺",
      entryType: "headword"
    }
  ], { scope: "word" });

  assert.equal(candidates.length, PERSONAL_WRONG_BOOK_REPETITIONS);
  assert.deepEqual(
    candidates.map((entry) => entry.personalWrong.formKind),
    ["base", "base", "plural", "plural"]
  );
  assert.deepEqual(
    candidates.slice(0, PERSONAL_WRONG_BOOK_BASE_REPS).map((entry) => entry.expectedAnswer),
    ["vacancy", "vacancy"]
  );
  assert.deepEqual(
    candidates.slice(PERSONAL_WRONG_BOOK_BASE_REPS).map((entry) => entry.expectedAnswer),
    ["vacancies", "vacancies"]
  );
});

test("personal wrong book without plural pair repeats the same form twice", () => {
  const records = mergePersonalWrongBookRecords([], parsePersonalWrongBookInput("accommodation | 住宿"));
  const candidates = buildPersonalWrongBookCandidates(records, [], { scope: "word" });

  assert.equal(records[0].targetRepetitions, PERSONAL_WRONG_BOOK_BASE_REPS);
  assert.equal(candidates.length, PERSONAL_WRONG_BOOK_BASE_REPS);
  assert.ok(candidates.every((entry) => entry.expectedAnswer === "accommodation"));
  assert.ok(candidates.every((entry) => entry.personalWrong.formKind === "same"));
});

test("personal wrong book rejects legacy records whose answer is an internal id", () => {
  const records = normalizePersonalWrongBookRecords([
    {
      id: "personal_wrong_word_484cfc2",
      word: "personal_wrong_word_484cfc2:write-2",
      anchor: "personal_wrong_word_484cfc2:write-2",
      targetAnswer: "personal_wrong_word_484cfc2:write-2",
      scope: "word",
      addedAt: 1
    },
    {
      id: "valid",
      word: "accommodation",
      anchor: "accommodation",
      targetAnswer: "accommodation",
      scope: "word",
      addedAt: 2
    }
  ]);

  assert.equal(records.length, 1);
  assert.equal(records[0].targetAnswer, "accommodation");

  const candidates = buildPersonalWrongBookCandidates(records, [], { scope: "word" });
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((entry) => !String(entry.expectedAnswer).includes("personal_wrong_")));
});

test("personal wrong book summary reports four repetitions and pair counts", () => {
  const records = mergePersonalWrongBookRecords([], parsePersonalWrongBookInput("accommodation\nvacancies | vacancy"));
  assert.deepEqual(summarizePersonalWrongBook(records), {
    total: 2,
    word: 2,
    phrase: 0,
    withInflectionPair: 1,
    repetitions: PERSONAL_WRONG_BOOK_REPETITIONS,
    baseRepetitions: PERSONAL_WRONG_BOOK_BASE_REPS,
    pluralRepetitions: PERSONAL_WRONG_BOOK_PLURAL_REPS
  });
});

test("personal wrong book arrow notation drills both base and plural forms", () => {
  const records = mergePersonalWrongBookRecords([], parsePersonalWrongBookInput("vacancy -> vacancies | 职位空缺"));
  assert.equal(records[0].anchor, "vacancy");
  assert.equal(records[0].inflected, "vacancies");
  assert.equal(records[0].hasInflectionPair, true);

  const candidates = buildPersonalWrongBookCandidates(records, [], { scope: "word" });
  assert.equal(candidates[0].expectedAnswer, "vacancy");
  assert.equal(candidates[PERSONAL_WRONG_BOOK_BASE_REPS].expectedAnswer, "vacancies");
});

test("personal wrong book infers plural pairs and rejects false positives", () => {
  assert.equal(inferPluralBase("vacancies"), "vacancy");
  assert.equal(inferPluralBase("boxes"), "box");
  assert.equal(inferPluralBase("knives"), "knife");
  assert.equal(inferPluralBase("news"), "");

  const records = mergePersonalWrongBookRecords([], parsePersonalWrongBookInput("city +ies\nbox +es\nbook +s\nnews"));
  assert.deepEqual(records.map((record) => record.inflected).sort(), ["books", "boxes", "cities", "news"]);
  assert.equal(records.find((record) => record.anchor === "news").hasInflectionPair, false);
});

test("personal wrong book keeps phrase scope even when added from the word page", () => {
  const parsed = parsePersonalWrongBookInput("on the other hand | 另一方面", { scopeHint: "word" });
  assert.equal(parsed[0].scope, "phrase");
  assert.equal(parsed[0].anchor, "on the other hand");
});

test("personal wrong book normalizes reversed plural pairs", () => {
  const parsed = parsePersonalWrongBookInput("vacancies | vacancy", { scopeHint: "word" });
  assert.equal(parsed[0].anchor, "vacancy");
  assert.equal(parsed[0].inflected, "vacancies");
  assert.equal(parsed[0].hasInflectionPair, true);

  const pair = resolvePluralInflectionPair("vacancies", "vacancy");
  assert.deepEqual(pair, { baseWord: "vacancy", targetAnswer: "vacancies" });
});

test("personal wrong book dedupes legacy duplicate records by spelling unit", () => {
  const { records, stats } = dedupePersonalWrongBookRecords([
    { id: "old-a", word: "Configure", targetAnswer: "Configure", scope: "word", addedAt: 100 },
    { id: "old-b", word: "configure", targetAnswer: "configure", scope: "word", addedAt: 200 },
    { id: "old-c", word: "vacancies", targetAnswer: "vacancies", scope: "word", addedAt: 300 },
    { id: "old-d", word: "vacancy", targetAnswer: "vacancy", scope: "word", addedAt: 400 }
  ]);

  assert.equal(stats.input, 4);
  assert.equal(stats.output, 2);
  assert.equal(stats.merged, 2);
  assert.deepEqual(records.map((record) => record.normalizedAnchor).sort(), ["configure", "vacancy"]);
});

test("adding an existing personal wrong word does not create another record", () => {
  const existing = mergePersonalWrongBookRecords([], parsePersonalWrongBookInput("configure"));
  const incoming = parsePersonalWrongBookInput("Configure\nconfigure | 配置");
  const merged = mergePersonalWrongBookRecords(existing, incoming);

  assert.equal(existing.length, 1);
  assert.equal(incoming.length, 1);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].normalizedAnchor, "configure");
});

test("adding a duplicate personal wrong word keeps its original group position", () => {
  const merged = mergePersonalWrongBookRecords([
    { id: "kept-id", word: "configure", anchor: "configure", targetAnswer: "configure", scope: "word", addedAt: 100 }
  ], [
    { id: "new-id", word: "Configure", anchor: "Configure", targetAnswer: "Configure", scope: "word", addedAt: 999, meaning: "配置" }
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "kept-id");
  assert.equal(merged[0].addedAt, 100);
  assert.equal(merged[0].meaning, "配置");
});

test("personal wrong book breakdown counts words while keeping all writes", () => {
  const records = mergePersonalWrongBookRecords([], parsePersonalWrongBookInput("accommodation | 住宿\nnews"));
  const expanded = buildPersonalWrongBookCandidates(records, [], { scope: "word" });

  const { candidates, breakdown } = buildCurrentBatchCandidates(expanded, {}, {
    scope: "word",
    entryMode: "headwords",
    practiceSource: "personal_wrong_book"
  });

  assert.equal(expanded.length, PERSONAL_WRONG_BOOK_BASE_REPS * 2);
  assert.equal(candidates.length, PERSONAL_WRONG_BOOK_BASE_REPS * 2);
  assert.equal(breakdown.filteredByDuplicate, 0);
  assert.equal(breakdown.sessionTotal, 2);
  assert.equal(breakdown.writeTotal, PERSONAL_WRONG_BOOK_BASE_REPS * 2);
  assert.equal(breakdown.personalWrongWordUnits.length, 2);
});

test("personal wrong book progress advances by word units not writes", () => {
  const records = mergePersonalWrongBookRecords([], parsePersonalWrongBookInput("vacancy\nvenue"));
  const candidates = buildPersonalWrongBookCandidates(records, [], { scope: "word" });
  const wordUnits = extractPersonalWrongWordUnits(candidates);
  const progressRecords = {};

  for (const write of wordUnits[0].writes) {
    progressRecords[write.wordId] = {
      today: { repairState: REPAIR_STATES.MASTERED, completedToday: true }
    };
  }

  const progress = computeBatchProgress(progressRecords, candidates.map((item) => item.wordId), {
    personalWrongWordUnits: wordUnits,
    personalWrongSequential: true,
    sessionTotal: wordUnits.length
  }, wordUnits[1].writes[0].wordId);

  assert.equal(progress.completedCount, 1);
  assert.equal(progress.sessionTotal, 2);
  assert.equal(progress.currentNumber, 2);
  assert.ok(progress.personalWrongUnitProgress);
});

test("personal wrong book session reopens on unfinished units instead of the first mastered word", () => {
  const records = mergePersonalWrongBookRecords([], parsePersonalWrongBookInput("alpha\nbeta"));
  const expanded = buildPersonalWrongBookCandidates(records, [], { scope: "word" });
  const { candidates, breakdown } = buildCurrentBatchCandidates(expanded, {}, {
    scope: "word",
    entryMode: "headwords",
    practiceSource: "personal_wrong_book"
  });
  const wordUnits = extractPersonalWrongWordUnits(candidates);
  const progressRecords = {};

  for (const write of wordUnits[0].writes) {
    progressRecords[write.wordId] = createSpellingRecord(write.wordId);
    progressRecords[write.wordId].today.repairState = REPAIR_STATES.MASTERED;
    progressRecords[write.wordId].today.completedToday = true;
  }

  const runner = createSpellingSessionRunner({
    candidates,
    candidateBreakdown: breakdown,
    records: progressRecords
  });
  const sessionWordIds = runner.getSessionWordIds();
  const current = runner.getCurrent();

  assert.deepEqual(sessionWordIds, wordUnits[1].writeWordIds);
  assert.equal(current.currentWord.expectedAnswer, "beta");
  assert.equal(current.sessionProgress.batchProgress.sessionTotal, 1);
  assert.equal(current.sessionProgress.batchProgress.filteredByMasteredPersonalWrong, wordUnits[0].writeWordIds.length);
});

test("personal wrong book skips writes completed in an earlier session", () => {
  const records = mergePersonalWrongBookRecords([], parsePersonalWrongBookInput("alpha\nbeta"));
  const expanded = buildPersonalWrongBookCandidates(records, [], { scope: "word" });
  const { candidates, breakdown } = buildCurrentBatchCandidates(expanded, {}, {
    scope: "word",
    entryMode: "headwords",
    practiceSource: "personal_wrong_book"
  });
  const wordUnits = extractPersonalWrongWordUnits(candidates);
  const yesterday = Date.UTC(2026, 5, 17, 8, 0, 0);
  const today = Date.UTC(2026, 5, 18, 8, 0, 0);
  const progressRecords = {};

  for (const write of wordUnits[0].writes) {
    progressRecords[write.wordId] = createSpellingRecord(write.wordId, { now: yesterday });
    progressRecords[write.wordId].spelling.correctAttempts = 1;
  }

  const runner = createSpellingSessionRunner({
    candidates,
    candidateBreakdown: breakdown,
    records: progressRecords,
    now: today
  });

  assert.deepEqual(runner.getSessionWordIds(), wordUnits[1].writeWordIds);
  assert.equal(runner.getCurrent({ now: today }).currentWord.expectedAnswer, "beta");
});

test("personal wrong scheduler stays sequential across base and plural writes", () => {
  const records = mergePersonalWrongBookRecords([], parsePersonalWrongBookInput("vacancy"));
  const candidates = buildPersonalWrongBookCandidates(records, [], { scope: "word" });
  const wordUnits = extractPersonalWrongWordUnits(candidates);
  const progressRecords = {};

  const first = selectNextPersonalWrongWrite(wordUnits, progressRecords, {});
  assert.equal(first.wordId, wordUnits[0].writes[0].wordId);

  progressRecords[first.wordId] = createSpellingRecord(first.wordId);
  progressRecords[first.wordId].today.repairState = REPAIR_STATES.MASTERED;

  const second = selectNextPersonalWrongWrite(wordUnits, progressRecords, { lastWordId: first.wordId });
  assert.equal(second.wordId, wordUnits[0].writes[1].wordId);
  assert.equal(candidates.find((item) => item.wordId === second.wordId).personalWrong.formKind, "base");
});

test("personal wrong scheduler continues from a manually selected unit", () => {
  const records = mergePersonalWrongBookRecords([], parsePersonalWrongBookInput("alpha\nbeta\ngamma"));
  const candidates = buildPersonalWrongBookCandidates(records, [], { scope: "word" });
  const wordUnits = extractPersonalWrongWordUnits(candidates);
  const progressRecords = {};
  const betaFirstWriteId = wordUnits[1].writes[0].wordId;

  progressRecords[betaFirstWriteId] = createSpellingRecord(betaFirstWriteId);
  progressRecords[betaFirstWriteId].today.repairState = REPAIR_STATES.MASTERED;

  const betaSecond = selectNextPersonalWrongWrite(wordUnits, progressRecords, { lastWordId: betaFirstWriteId });
  assert.equal(betaSecond.wordId, wordUnits[1].writes[1].wordId);
  assert.equal(betaSecond.source, "personal_wrong_current_unit");
});

test("personal wrong scheduler resumes after the completed manual unit before wrapping to the first unit", () => {
  const records = mergePersonalWrongBookRecords([], parsePersonalWrongBookInput("alpha\nbeta\ngamma"));
  const candidates = buildPersonalWrongBookCandidates(records, [], { scope: "word" });
  const wordUnits = extractPersonalWrongWordUnits(candidates);
  const progressRecords = {};

  for (const write of wordUnits[1].writes) {
    progressRecords[write.wordId] = createSpellingRecord(write.wordId);
    progressRecords[write.wordId].today.repairState = REPAIR_STATES.MASTERED;
  }

  const resumed = selectNextPersonalWrongWrite(wordUnits, progressRecords, {
    lastWordId: wordUnits[1].writes.at(-1).wordId
  });
  assert.equal(resumed.wordId, wordUnits[2].writes[0].wordId);
  assert.equal(resumed.source, "personal_wrong_resume_cursor");
});

test("personal wrong book batches by word records not expanded writes", () => {
  const records = mergePersonalWrongBookRecords([], parsePersonalWrongBookInput("a\nb\nc"));
  const batch = selectPersonalWrongBookBatch(records, [], { scope: "word", batchIndex: 0, batchSize: 2 });

  assert.equal(batch.batchEntryCount, 2);
  assert.equal(batch.writeCount, PERSONAL_WRONG_BOOK_BASE_REPS * 2);
  assert.equal(batch.entries.length, PERSONAL_WRONG_BOOK_BASE_REPS * 2);
});

function buildSampleWrongWords(count = 1) {
  const pool = ["rat", "cat", "dog", "fish", "bird"];
  return Array.from({ length: count }, (_, index) => {
    const base = pool[index % pool.length];
    const suffix = String.fromCharCode(97 + (index % 26));
    return `${base}${suffix}`;
  });
}

test("personal wrong batch write count is scoped to the selected group", () => {
  const baseRecords = Array.from({ length: 35 }, (_, index) => {
    const word = `wrongword${index + 1}`;
    return {
      id: `base-${index + 1}`,
      word,
      anchor: word,
      inflected: word,
      targetAnswer: word,
      scope: "word",
      hasInflectionPair: false,
      addedAt: index + 1
    };
  });
  const records = mergePersonalWrongBookRecords(baseRecords, [{
    id: "pair-city",
    word: "city",
    anchor: "city",
    inflected: "cities",
    targetAnswer: "cities",
    scope: "word",
    hasInflectionPair: true,
    addedAt: 36
  }]);
  const allWrites = buildPersonalWrongBookCandidates(records, [], { scope: "word" });
  const first = selectPersonalWrongBookBatch(records, [], { scope: "word", batchIndex: 0 });
  const second = selectPersonalWrongBookBatch(records, [], { scope: "word", batchIndex: 1 });

  assert.equal(records.length, 36);
  assert.equal(allWrites.length, (35 * PERSONAL_WRONG_BOOK_BASE_REPS) + PERSONAL_WRONG_BOOK_REPETITIONS);
  assert.equal(first.batchEntryCount, PERSONAL_WRONG_BOOK_BATCH_SIZE);
  assert.equal(first.writeCount, 35 * PERSONAL_WRONG_BOOK_BASE_REPS);
  assert.equal(first.entries.length, first.writeCount);
  assert.equal(second.batchEntryCount, 1);
  assert.equal(second.writeCount, PERSONAL_WRONG_BOOK_REPETITIONS);
  assert.equal(second.entries.length, second.writeCount);
});

test("personal wrong book defaults to groups of 35 words", () => {
  const records = mergePersonalWrongBookRecords([], parsePersonalWrongBookInput(buildSampleWrongWords(72).join("\n")));
  const options = listPersonalWrongBookBatchOptions(records, { scope: "word" });

  assert.equal(PERSONAL_WRONG_BOOK_BATCH_SIZE, 35);
  assert.equal(options.length, 3);
  assert.deepEqual(options.map((item) => item.count), [35, 35, 2]);
  assert.match(options[0].label, /第 1 组 · 35 词/);
});

test("new personal wrong words fill the last partial group before creating another group", () => {
  const existing = Array.from({ length: 36 }, (_, index) => {
    const word = `wrongword${index + 1}`;
    return { id: `old-${index + 1}`, word, anchor: word, targetAnswer: word, scope: "word", addedAt: index + 1 };
  });
  const merged = mergePersonalWrongBookRecords(existing, [
    { id: "fresh-id", word: "freshword", anchor: "freshword", targetAnswer: "freshword", scope: "word", addedAt: 999 }
  ]);

  const first = selectPersonalWrongBookBatch(merged, [], { scope: "word", batchIndex: 0 });
  const second = selectPersonalWrongBookBatch(merged, [], { scope: "word", batchIndex: 1 });

  assert.equal(first.batchEntryCount, PERSONAL_WRONG_BOOK_BATCH_SIZE);
  assert.equal(second.batchEntryCount, 2);
  assert.equal(first.records.some((record) => record.normalizedAnchor === "freshword"), false);
  assert.equal(second.records.some((record) => record.normalizedAnchor === "freshword"), true);
});

test("adding new personal wrong words keeps the current batch index when possible", () => {
  const existing = mergePersonalWrongBookRecords([], parsePersonalWrongBookInput(buildSampleWrongWords(40).join("\n")));
  const incoming = parsePersonalWrongBookInput("freshword | 新词");
  const merged = mergePersonalWrongBookRecords(existing, incoming);

  assert.equal(resolvePersonalWrongBatchIndexAfterAdd(merged, {
    scope: "word",
    currentBatchIndex: 1,
    addedRecordIds: incoming.map((record) => record.id)
  }), 1);
  assert.equal(clampPersonalWrongBatchIndex(99, merged, { scope: "word" }), 1);
});
