import test from "node:test";
import assert from "node:assert/strict";

import {
  SPELLING_BATCH_SIZE,
  SPELLING_PHRASE_CATEGORY_TYPES,
  dedupePhrasePracticeEntries,
  filterBySpellingCategory,
  filterBySpellingScope,
  listSpellingBatchOptionsFromSelection,
  orderSpellingEntries,
  selectSpellingBatch,
  splitSpellingBatches
} from "../spelling-categories.mjs";
import {
  IDICTATION_FREQUENCY_BATCH_SIZE,
  ensureIdictationFrequencyData,
  entryMatchesChapter,
  getIdictationSource,
  idictationChapterFromGroupKey,
  listIdictationBatchOptions,
  listIdictationChapterGroupOptions,
  listIdictationFrequencyGroupOptions,
  listIdictationGroupOptions,
  selectIdictationBatch
} from "../idictation-frequency.mjs";

test.before(async () => {
  await ensureIdictationFrequencyData();
});

const sampleEntries = Array.from({ length: 950 }, (_, index) => ({
  word: index < 700 ? `word-${String(index).padStart(4, "0")}` : `phrase ${index}`,
  entryType: index < 700 ? "word" : "phrase",
  difficulty: index < 400 ? "基础高频" : index < 800 ? "中级核心" : "高级加分",
  topics: index % 2 === 0 ? ["工作"] : ["教育"],
  ieltsUse: index % 3 === 0 ? ["Speaking"] : ["Listening"]
}));

test("splitSpellingBatches creates chunks of 400 words", () => {
  const batches = splitSpellingBatches(sampleEntries, SPELLING_BATCH_SIZE);
  assert.equal(batches.length, 3);
  assert.equal(batches[0].length, 400);
  assert.equal(batches[1].length, 400);
  assert.equal(batches[2].length, 150);
});

test("filterBySpellingScope keeps only phrase entries", () => {
  const phrases = filterBySpellingScope(sampleEntries, "phrase");
  assert.equal(phrases.length, 250);
  assert.ok(phrases.every((entry) => entry.entryType === "phrase"));
});

test("filterBySpellingCategory keeps only the selected difficulty across the full pool by default", () => {
  const filtered = filterBySpellingCategory(sampleEntries, "difficulty", "基础高频");
  assert.equal(filtered.length, 400);
  assert.ok(filtered.every((entry) => entry.difficulty === "基础高频"));
});

test("word partition batch excludes phrases even when source pool contains both scopes", () => {
  const wordBatch = selectSpellingBatch(sampleEntries, {
    scopeKind: "word",
    categoryType: "difficulty",
    categoryValue: "基础高频",
    batchIndex: 0
  });

  assert.equal(wordBatch.batchEntryCount, 400);
  assert.ok(wordBatch.entries.every((entry) => entry.entryType === "word"));
});

test("selectSpellingBatch returns phrase batches by difficulty and ielts scene", () => {
  const phraseBatch = selectSpellingBatch(sampleEntries, {
    scopeKind: "phrase",
    categoryType: "ielts_use",
    categoryValue: "Speaking",
    batchIndex: 0
  });

  assert.ok(phraseBatch.batchEntryCount > 0);
  assert.ok(phraseBatch.entries.every((entry) => entry.entryType === "phrase"));
  assert.ok(phraseBatch.entries.every((entry) => entry.ieltsUse.includes("Speaking")));

  const first = selectSpellingBatch(sampleEntries, {
    scopeKind: "word",
    categoryType: "difficulty",
    categoryValue: "中级核心",
    batchIndex: 0
  });

  assert.equal(first.totalInCategory, 300);
  assert.equal(first.batchCount, 1);
  assert.equal(first.batchEntryCount, 300);
  assert.equal(first.entries[0].entryType, "word");
});

test("batch picker options reuse the selected category totals", () => {
  const options = listSpellingBatchOptionsFromSelection({
    batchCount: 3,
    batchSize: 400,
    totalInCategory: 950
  });

  assert.deepEqual(options, [
    { value: 0, label: "第 1 批 · 400 词", count: 400 },
    { value: 1, label: "第 2 批 · 400 词", count: 400 },
    { value: 2, label: "第 3 批 · 150 词", count: 150 }
  ]);
});

test("phrase practice dedupes article-only variants without merging distinct quantifier phrases", () => {
  const entries = [
    { word: "government policy", entryType: "phrase" },
    { word: "a government policy", entryType: "phrase" },
    { word: "solution to unemployment", entryType: "phrase" },
    { word: "a solution to unemployment", entryType: "phrase" },
    { word: "a number of", entryType: "phrase" },
    { word: "the number of", entryType: "phrase" }
  ];

  const deduped = dedupePhrasePracticeEntries(entries).map((entry) => entry.word);

  assert.deepEqual(deduped, [
    "government policy",
    "solution to unemployment",
    "a number of",
    "the number of"
  ]);
});

test("phrase batches do not repeat article-only variants across the first two groups", () => {
  const entries = [
    ...Array.from({ length: 800 }, (_, index) => ({
      word: `filler phrase ${String(index).padStart(3, "0")}`,
      entryType: "phrase"
    })),
    { word: "a government policy", entryType: "phrase" },
    { word: "government policy", entryType: "phrase" }
  ];

  const first = selectSpellingBatch(entries, { scopeKind: "phrase", categoryType: "all", batchIndex: 0 });
  const second = selectSpellingBatch(entries, { scopeKind: "phrase", categoryType: "all", batchIndex: 1 });
  const allShown = [...first.entries, ...second.entries].map((entry) => entry.word);

  assert.equal(allShown.filter((word) => /government policy/.test(word)).length, 1);
});

test("listening and reading high-frequency modes exclude advanced and low-frequency words", () => {
  const entries = [
    { word: "hf-listening-alpha", entryType: "word", difficulty: "基础高频", ieltsUse: ["Listening"] },
    { word: "hf-reading-alpha", entryType: "word", difficulty: "中级核心", ieltsUse: ["Reading"] },
    { word: "hf-both-alpha", entryType: "word", difficulty: "中级核心", ieltsUse: ["Listening", "Reading"] },
    {
      word: "hf-review-alpha",
      entryType: "word",
      difficulty: "中级核心",
      ieltsUse: ["Listening", "Reading"],
      entryQuality: "reconstructed_from_v1_audit_report_needs_editorial_review"
    },
    { word: "hf-advanced-alpha", entryType: "word", difficulty: "高级加分", ieltsUse: ["Reading"] },
    { word: "hf-low-alpha", entryType: "word", difficulty: "低频认识即可", ieltsUse: ["Listening"] }
  ];

  const listening = filterBySpellingCategory(entries, "lr_high_frequency", "listening", "word");
  const reading = filterBySpellingCategory(entries, "lr_high_frequency", "reading", "word");
  const combined = filterBySpellingCategory(entries, "lr_high_frequency", "listening_reading", "word");

  assert.deepEqual(listening.map((entry) => entry.word).sort(), ["hf-both-alpha", "hf-listening-alpha"]);
  assert.deepEqual(reading.map((entry) => entry.word).sort(), ["hf-both-alpha", "hf-reading-alpha"]);
  assert.deepEqual(combined.map((entry) => entry.word).sort(), ["hf-both-alpha", "hf-listening-alpha", "hf-reading-alpha"]);
  assert.equal(listening[0].word, "hf-listening-alpha");
  assert.deepEqual(
    filterBySpellingCategory(entries, "lr_high_frequency", "listening", "word"),
    listening
  );
});

test("idictation generated entrances stay independent from legacy high-frequency modes", () => {
  const entries = [
    { word: "art", entryType: "word", difficulty: "low", ieltsUse: [] },
    { word: "language", entryType: "word", difficulty: "low", ieltsUse: [] },
    { word: "not-in-idictation-nonce", entryType: "word", difficulty: "low", ieltsUse: [] }
  ];

  assert.deepEqual(filterBySpellingCategory(entries, "lr_high_frequency", "reading", "word"), []);
  assert.deepEqual(filterBySpellingCategory(entries, "lr_high_frequency", "listening", "word"), []);
});

test("idictation listening and reading sources are independent generated entrances", () => {
  const listening = getIdictationSource("listening");
  const reading = getIdictationSource("reading");

  assert.equal(listening.source, "idictation_listening");
  assert.equal(reading.source, "idictation_reading");
  assert.ok(listening.uniqueWords >= 3900);
  assert.ok(reading.uniqueWords >= 3300);
  assert.ok(listening.entries.every((entry) => entry.source === "idictation_listening"));
  assert.ok(reading.entries.every((entry) => entry.source === "idictation_reading"));
});

test("idictation listening chapters group answer words before transcript and phrases", () => {
  const groups = listIdictationGroupOptions("listening");
  const types = groups.map((group) => {
    const label = group.label || "";
    if (label.includes("答案词")) return "answer";
    if (label.includes("听力原文")) return "transcript";
    if (label.includes("词组")) return "phrase";
    return "other";
  });

  const firstTranscript = types.indexOf("transcript");
  const firstPhrase = types.indexOf("phrase");
  const lastAnswer = types.lastIndexOf("answer");

  assert.ok(firstTranscript > lastAnswer, "all answer chapters should appear before transcript chapters");
  assert.ok(firstPhrase > firstTranscript, "all transcript chapters should appear before phrase chapters");
  assert.equal(types[0], "answer");
  assert.equal(types[types.length - 1], "phrase");
});

test("idictation spelling groups use original Excel chapters", () => {
  for (const sourceKey of ["listening", "reading"]) {
    const groups = listIdictationGroupOptions(sourceKey);
    assert.ok(groups.length >= (sourceKey === "listening" ? 60 : 50));
    assert.ok(groups.every((group) => group.value.startsWith("chapter:")));

    for (const group of groups.slice(0, 5)) {
      const chapter = idictationChapterFromGroupKey(group.value);
      const batches = listIdictationBatchOptions(sourceKey, group.value);
      assert.equal(batches.length, 1);

      const selected = selectIdictationBatch(sourceKey, { groupKey: group.value, batchIndex: 0 });
      assert.equal(selected.groupMode, "chapter");
      assert.equal(selected.batchCount, 1);
      assert.ok(selected.entries.every((entry) => entryMatchesChapter(entry, chapter)));
    }
  }
});

test("idictation flashcard frequency groups still expose 9 merged bands", () => {
  for (const sourceKey of ["listening", "reading"]) {
    const groups = listIdictationFrequencyGroupOptions(sourceKey);
    assert.equal(groups.length, 9);

    for (const group of groups) {
      const batches = listIdictationBatchOptions(sourceKey, group.value);
      assert.ok(batches.length >= 1);

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const selected = selectIdictationBatch(sourceKey, { groupKey: group.value, batchIndex });
        assert.ok(selected.batchEntryCount <= IDICTATION_FREQUENCY_BATCH_SIZE);
        assert.ok(selected.entries.every((entry) => entry.frequencyGroup === group.value));
      }
    }
  }
});

test("idictation duplicate words can appear in multiple original chapters", () => {
  const listening = getIdictationSource("listening");
  const duplicated = listening.entries.find((entry) => String(entry.sourceChapter || "").includes("|"));
  assert.ok(duplicated, "expected at least one merged chapter entry");

  const chapters = String(duplicated.sourceChapter).split("|").map((part) => part.trim());
  for (const chapter of chapters) {
    const groupKey = `chapter:${chapter}`;
    const selected = selectIdictationBatch("listening", { groupKey, batchIndex: 0 });
    assert.ok(selected.entries.some((entry) => entry.id === duplicated.id));
  }
});

test("idictation entries keep answer forms from the Excel source", () => {
  const listening = getIdictationSource("listening");
  const withAnswer = listening.entries.find((entry) => entry.acceptedAnswers.length > 1);

  assert.ok(withAnswer);
  assert.ok(withAnswer.expectedAnswer);
  assert.ok(withAnswer.acceptedAnswers.includes(withAnswer.expectedAnswer));
  assert.ok(withAnswer.sourceWorkbook.endsWith(".xlsx"));
});

test("writing high-frequency mode supports both words and phrases", () => {
  const entries = [
    { word: "argue", entryType: "word", difficulty: "中级核心", ieltsUse: ["Writing"] },
    { word: "benefit", entryType: "word", difficulty: "中级核心", writingPriority: true },
    { word: "due to", entryType: "phrase", difficulty: "基础高频", ieltsUse: ["Writing Task 2"] },
    { word: "on the other hand", entryType: "phrase", difficulty: "基础高频", writingPriority: true },
    { word: "venue", entryType: "word", difficulty: "基础高频", ieltsUse: ["Listening"] },
    { word: "arcane", entryType: "word", difficulty: "高级加分", ieltsUse: ["Writing"] }
  ];

  const words = filterBySpellingCategory(entries, "lr_high_frequency", "writing", "word");
  const phrases = filterBySpellingCategory(entries, "lr_high_frequency", "writing", "phrase");

  assert.deepEqual(words.map((entry) => entry.word).sort(), ["argue", "benefit"]);
  assert.deepEqual(phrases.map((entry) => entry.word).sort(), ["due to", "on the other hand"]);
  assert.ok(SPELLING_PHRASE_CATEGORY_TYPES.some((entry) => entry.value === "lr_high_frequency"));
});

test("priority mode separates Task 2, speaking, and life-work entries", () => {
  const entries = [
    { word: "argue", entryType: "word", difficulty: "中级核心", ieltsUse: ["Writing", "Task 2"] },
    { word: "fluently", entryType: "word", difficulty: "基础高频", ieltsUse: ["Speaking"] },
    { word: "appointment", entryType: "word", difficulty: "基础高频", ieltsUse: ["生活高频"], topics: ["公共服务"] },
    { word: "lecture", entryType: "word", difficulty: "基础高频", ieltsUse: ["Listening"] }
  ];

  assert.deepEqual(
    filterBySpellingCategory(entries, "lr_high_frequency", "task2", "word").map((entry) => entry.word),
    ["argue"]
  );
  assert.deepEqual(
    filterBySpellingCategory(entries, "lr_high_frequency", "speaking", "word").map((entry) => entry.word),
    ["fluently"]
  );
  assert.deepEqual(
    filterBySpellingCategory(entries, "lr_high_frequency", "life_work", "word").map((entry) => entry.word),
    ["appointment"]
  );
});

test("ordering protects the existing first batch and deterministically shuffles later words", () => {
  const entries = Array.from({ length: 900 }, (_, index) => ({
    word: `entry-${String(899 - index).padStart(4, "0")}`,
    wordId: `word-${899 - index}`
  }));
  const alphabetical = [...entries].sort((a, b) => a.word.localeCompare(b.word));
  const firstRun = orderSpellingEntries(entries, { shuffleSeed: "test-order" });
  const secondRun = orderSpellingEntries(entries, { shuffleSeed: "test-order" });

  assert.deepEqual(firstRun.slice(0, 400), alphabetical.slice(0, 400));
  assert.deepEqual(firstRun, secondRun);
  assert.notDeepEqual(firstRun.slice(400), alphabetical.slice(400));
});

test("error-bank ordering can preserve recency source order", () => {
  const entries = [{ word: "zulu" }, { word: "alpha" }, { word: "middle" }];
  assert.deepEqual(
    orderSpellingEntries(entries, { preserveSourceOrder: true }).map((entry) => entry.word),
    ["zulu", "alpha", "middle"]
  );
});
