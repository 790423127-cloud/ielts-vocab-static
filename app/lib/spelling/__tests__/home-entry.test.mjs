import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const pageSource = readFileSync(path.join(root, "app/page.jsx"), "utf8");
const wordFlashSource = readFileSync(path.join(root, "app/components/WordFlashcardView.jsx"), "utf8");

test("home page links to separate word and phrase spelling routes", () => {
  assert.match(pageSource, /WordFlashcardView/);
  assert.match(wordFlashSource, /href="\/spelling-words"/);
  assert.match(wordFlashSource, /href="\/spelling-phrases"/);
  assert.match(wordFlashSource, /单词拼写训练/);
  assert.match(wordFlashSource, /词组拼写训练/);
  assert.doesNotMatch(pageSource, /href="\/spelling"/);
  assert.doesNotMatch(pageSource, /SpellingEntrySummary/);
  assert.doesNotMatch(pageSource, /function SpellingPanel/);
  assert.doesNotMatch(pageSource, /useSpellingEngine/);
  assert.doesNotMatch(pageSource, /getSpellingEntrySummary/);
  assert.doesNotMatch(pageSource, /loadSpellingLexicon/);
});