import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReadingWordsBackup,
  getReadingWordContext,
  getReadingWordMissingFields,
  isReadingWordIncomplete,
  mergeReadingWordAiProfile,
  mergeReadingWordImports,
  normalizeReadingWord,
  normalizeReadingWordsSession,
  parseReadingWordsTable
} from "../storage.mjs";

function idFactory() {
  let index = 0;
  return () => `reading-test-${++index}`;
}

test("parses pasted Excel rows with Chinese headers and synonym replacements", () => {
  const rows = parseReadingWordsTable(
    [
      "单词\t中文释义\t词性\t英文释义\t英文例句\t例句翻译\t同义替换",
      "allocate\t分配\tverb\tto distribute resources\tThe council allocated more funds.\t市政会分配了更多资金。\tassign; distribute"
    ].join("\n"),
    { idFactory: idFactory() }
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].word, "allocate");
  assert.equal(rows[0].meaning, "分配");
  assert.deepEqual(rows[0].synonyms, ["assign", "distribute"]);
  assert.equal(rows[0].id, rows[0].wordId);
});

test("JSON backup import preserves stable ids and skips duplicate headwords", () => {
  const imported = parseReadingWordsTable(JSON.stringify({
    version: 1,
    words: [
      { id: "reading-original-id", word: "retain", meaning: "保留" },
      { id: "reading-second-id", word: "retain", meaning: "保持" }
    ]
  }));
  const result = mergeReadingWordImports([], imported, { idFactory: idFactory() });

  assert.equal(result.added, 1);
  assert.equal(result.duplicates, 1);
  assert.equal(result.words[0].id, "reading-original-id");
  assert.equal(result.words[0].wordId, "reading-original-id");
});

test("AI merge fills only missing reading fields and never adds collocation sections", () => {
  const before = {
    id: "reading-1",
    wordId: "reading-1",
    word: "retain",
    meaning: "用户自己的释义",
    definition: "",
    pos: "",
    example: "",
    exampleCn: "",
    synonyms: [],
    status: "不熟",
    favorite: true
  };
  const after = mergeReadingWordAiProfile(before, {
    meaning: "AI 释义",
    meaningDetailZh: "指继续保有某物、维持某种状态，或不让已有事物失去。",
    definition: "to continue to have something",
    pos: "verb",
    example: "The museum retained its original entrance.",
    exampleCn: "博物馆保留了原来的入口。",
    forms: [],
    wordFamily: [],
    synonyms: ["keep", "preserve"],
    synonymDetails: [
      { word: "keep", pos: "verb", meaningZh: "保留" },
      { word: "preserve", pos: "verb", meaningZh: "保存" }
    ],
    collocations: [{ phrase: "retain control", chinese: "保持控制" }],
    phraseCollocations: [{ phrase: "retain the right to", chinese: "保留……的权利" }]
  });

  assert.equal(after.meaning, "用户自己的释义");
  assert.equal(after.definition, "to continue to have something");
  assert.deepEqual(after.synonyms, ["keep", "preserve"]);
  assert.deepEqual(after.synonymDetails, [
    { word: "keep", pos: "verb", meaningZh: "保留" },
    { word: "preserve", pos: "verb", meaningZh: "保存" }
  ]);
  assert.equal(Object.hasOwn(after, "collocations"), false);
  assert.equal(Object.hasOwn(after, "phraseCollocations"), false);
  assert.equal(after.id, "reading-1");
  assert.equal(after.status, "不熟");
  assert.equal(after.favorite, true);
  assert.equal(isReadingWordIncomplete(after), false);
  assert.deepEqual(getReadingWordMissingFields(after), []);
});

test("a form-only legacy detail remains pending in the reading notebook", () => {
  const word = normalizeReadingWord({
    word: "modifications",
    pos: "noun",
    meaning: "修改；变更；改进",
    meaningDetailZh: "modifications: 修改；变更；改进；“modification”的复数；",
    definition: "changes made to improve something",
    example: "Modifications will shortly be introduced.",
    exampleCn: "相关修改将很快推出。",
    formsReviewed: true,
    wordFamilyReviewed: true,
    synonymsReviewed: true
  });

  assert.deepEqual(getReadingWordMissingFields(word), ["meaningDetailZh"]);
});

test("context-aware AI merge puts the passage meaning first and keeps detailed other senses", () => {
  const contextSentence = "Youngsters can stroke or feed the sheep and rabbits.";
  const before = {
    id: "reading-stroke",
    wordId: "reading-stroke",
    word: "stroke",
    pos: "noun / verb",
    meaning: "中风；抚摸；笔画",
    definition: "a medical event",
    example: "He had a stroke last year.",
    exampleCn: "他去年中风了。",
    forms: [{ word: "stroking", type: "present participle / gerund", meaning: "中风" }],
    wordFamily: [],
    synonyms: ["apoplexy", "seizure"],
    synonymDetails: [{ word: "apoplexy", pos: "noun", meaningZh: "中风" }],
    readingContextPending: true,
    readingSources: [{ id: "source-1", sentence: contextSentence }],
    status: "不熟",
    favorite: true
  };
  const after = mergeReadingWordAiProfile(before, {
    pos: "verb",
    meaning: "抚摸；轻抚",
    meaningDetailZh: "用手轻柔地抚摸动物。",
    definition: "To move a hand gently over an animal.",
    example: "A generated sentence.",
    exampleCn: "孩子们可以抚摸或喂羊和兔子。",
    otherMeanings: [{
      pos: "noun",
      meaningZh: "中风",
      definitionEn: "A sudden interruption of blood flow to the brain.",
      example: "He suffered a stroke.",
      exampleCn: "他中风了。"
    }],
    forms: [{ word: "stroking", type: "present participle / gerund", note: "动词现在分词" }],
    wordFamily: [],
    synonyms: ["pet", "caress"],
    synonymDetails: [
      { word: "pet", pos: "verb", meaningZh: "抚摸" },
      { word: "caress", pos: "verb", meaningZh: "轻抚；爱抚" }
    ],
    generatedAt: "2026-08-11T10:00:00.000Z",
    aiGenerated: true
  }, { contextSentence });

  assert.equal(after.id, "reading-stroke");
  assert.equal(after.meaning, "抚摸；轻抚");
  assert.equal(after.readingMeaning, "抚摸；轻抚");
  assert.equal(after.pos, "verb");
  assert.equal(after.example, contextSentence);
  assert.deepEqual(after.synonyms, ["pet", "caress"]);
  assert.deepEqual(after.synonymDetails, [
    { word: "pet", pos: "verb", meaningZh: "抚摸" },
    { word: "caress", pos: "verb", meaningZh: "轻抚；爱抚" }
  ]);
  assert.equal(after.otherMeanings[0].meaningZh, "中风");
  assert.equal(after.readingContextPending, false);
  assert.equal(after.readingContextReviewed, true);
  assert.equal(after.readingContextReviewSource, "reading-context-ai");
  assert.equal(after.status, "不熟");
  assert.equal(after.favorite, true);
  assert.deepEqual(getReadingWordMissingFields(after), []);
});

test("reading context selects the stored source sentence and label", () => {
  const context = getReadingWordContext({
    word: "stroke",
    readingSources: [{
      id: "source-1",
      sentence: "Visitors can stroke or feed the sheep.",
      testTitle: "剑雅17 Test 4",
      context: "Part 1 · 文章段落 1"
    }]
  });

  assert.equal(context.sentence, "Visitors can stroke or feed the sheep.");
  assert.equal(context.label, "剑雅17 Test 4 · Part 1 · 文章段落 1");
  assert.equal(context.sourceId, "source-1");
});

test("reading study session keeps only safe, reusable filter and position values", () => {
  assert.deepEqual(
    normalizeReadingWordsSession({
      selectedId: " reading-7 ",
      search: "  allocate  ",
      onlyIncomplete: true,
      onlyFrequent: "true",
      ignored: "value"
    }),
    {
      selectedId: "reading-7",
      search: "allocate",
      onlyIncomplete: true,
      onlyFrequent: false
    }
  );
});

test("canonical correction provenance survives notebook persistence normalization", () => {
  const normalized = normalizeReadingWord({
    id: "reading-ancestors",
    word: "ancestors",
    correctedFrom: "ncestors",
    mainWordId: "main-ancestors"
  });

  assert.equal(normalized.word, "ancestors");
  assert.equal(normalized.correctedFrom, "ncestors");
  assert.equal(normalized.mainWordId, "main-ancestors");
});

test("morphology links survive notebook persistence normalization", () => {
  const normalized = normalizeReadingWord({
    id: "reading-disqualified",
    word: "disqualified",
    mainWordId: "main-disqualify",
    baseWord: "disqualify",
    baseWordId: "main-disqualify",
    relationType: "past-or-past-participle"
  });

  assert.equal(normalized.mainWordId, "main-disqualify");
  assert.equal(normalized.baseWord, "disqualify");
  assert.equal(normalized.baseWordId, "main-disqualify");
  assert.equal(normalized.relationType, "past-or-past-participle");
});

test("semantic review marks survive reading-notebook persistence", () => {
  const normalized = normalizeReadingWord({
    id: "reading-sense-review",
    word: "record",
    meaning: "记录",
    meaningCoverageReviewed: true,
    meaningCoverageAuditStatus: "reviewed",
    meaningCoverageReviewSource: "ai-cache",
    meaningCoverageReviewedAt: "2026-08-10T00:00:00.000Z",
    meaningCoveragePromptVersion: "main-meaning-detailed-senses-v3"
  });

  assert.equal(normalized.meaningCoverageReviewed, true);
  assert.equal(normalized.meaningCoverageAuditStatus, "reviewed");
  assert.equal(normalized.meaningCoverageReviewSource, "ai-cache");
});

test("reading backups keep notebook fields but strip main-lexicon display supplements", () => {
  const backup = buildReadingWordsBackup([{
    id: "reading-encyclopaedia",
    word: "encyclopaedia",
    meaning: "百科全书",
    synonyms: ["compendium"],
    synonymDetails: [{ word: "compendium", pos: "noun", meaningZh: "概要" }],
    collocations: [{ phrase: "online encyclopaedia", chinese: "在线百科全书" }],
    phraseCollocations: [{ phrase: "in an encyclopaedia", chinese: "在百科全书中" }],
    difficulty: "advanced"
  }]);

  assert.deepEqual(backup.words[0].synonymDetails, [
    { word: "compendium", pos: "noun", meaningZh: "概要" }
  ]);
  assert.equal(Object.hasOwn(backup.words[0], "collocations"), false);
  assert.equal(Object.hasOwn(backup.words[0], "phraseCollocations"), false);
  assert.equal(Object.hasOwn(backup.words[0], "difficulty"), false);
});
