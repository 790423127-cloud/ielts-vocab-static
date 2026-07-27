import test from "node:test";
import assert from "node:assert/strict";
import {
  getReadingWordMissingFields,
  isReadingWordIncomplete,
  mergeReadingWordAiProfile,
  mergeReadingWordImports,
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
    definition: "to continue to have something",
    pos: "verb",
    example: "The museum retained its original entrance.",
    exampleCn: "博物馆保留了原来的入口。",
    synonyms: ["keep", "preserve"],
    collocations: [{ phrase: "retain control", chinese: "保持控制" }],
    phraseCollocations: [{ phrase: "retain the right to", chinese: "保留……的权利" }]
  });

  assert.equal(after.meaning, "用户自己的释义");
  assert.equal(after.definition, "to continue to have something");
  assert.deepEqual(after.synonyms, ["keep", "preserve"]);
  assert.equal(Object.hasOwn(after, "collocations"), false);
  assert.equal(Object.hasOwn(after, "phraseCollocations"), false);
  assert.equal(after.id, "reading-1");
  assert.equal(after.status, "不熟");
  assert.equal(after.favorite, true);
  assert.equal(isReadingWordIncomplete(after), false);
  assert.deepEqual(getReadingWordMissingFields(after), []);
});
