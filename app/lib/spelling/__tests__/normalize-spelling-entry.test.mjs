import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeSpellingEntry,
  normalizeSpellingEntries
} from "../normalize-spelling-entry.mjs";

test("normalizeSpellingEntry resolves phrase fields from phrase/text/word/answer", () => {
  const cases = [
    { input: { phrase: "opposite the bank", meaning: "银行对面" }, answer: "opposite the bank" },
    { input: { text: "be due to", meaning: "由于" }, answer: "be due to" },
    { input: { word: "vacancy", meaning: "空缺" }, answer: "vacancy" },
    { input: { answer: "job application", meaning: "求职申请" }, answer: "job application" }
  ];

  for (const entry of cases) {
    const normalized = normalizeSpellingEntry(entry.input);
    assert.equal(normalized.expectedAnswer, entry.answer);
    assert.ok(normalized.wordId);
    assert.ok(normalized.displayText);
  }
});

test("phrase entries are typed as phrase with friendly pos label", () => {
  const normalized = normalizeSpellingEntry({
    phrase: "due to the fact that",
    pos: "phrase",
    meaning: "由于...的事实"
  });

  assert.equal(normalized.entryType, "phrase");
  assert.equal(normalized.pos, "短语");
  assert.equal(normalized.displayText, "due to the fact that");
});

test("normalizeSpellingEntries preserves list length", () => {
  const list = normalizeSpellingEntries([
    { word: "abandon" },
    { phrase: "be due to" }
  ]);

  assert.equal(list.length, 2);
  assert.equal(list[1].entryType, "phrase");
});

test("normalization supports common POS, meaning, and IPA aliases", () => {
  const normalized = normalizeSpellingEntry({
    word: "organise",
    pos: "v./n.",
    translation: "组织；安排",
    ukPhonetic: "/ˈɔːɡənaɪz/"
  });

  assert.equal(normalized.pos, "动词 / 名词");
  assert.equal(normalized.meaning, "组织；安排");
  assert.equal(normalized.phonetic, "/ˈɔːɡənaɪz/");
});
