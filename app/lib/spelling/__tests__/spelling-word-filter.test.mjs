import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  filterSpellingInterjections,
  isSpellingInterjectionEntry
} from "../spelling-word-filter.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const wordsPath = path.join(root, ".static-export-cache", "words.json");

test("isSpellingInterjectionEntry detects filler headwords and pure interjection pos", () => {
  assert.equal(isSpellingInterjectionEntry({ word: "aha", pos: "interjection" }), true);
  assert.equal(isSpellingInterjectionEntry({ word: "heck", pos: "interjection/noun" }), true);
  assert.equal(isSpellingInterjectionEntry({ word: "ok", pos: "adjective / adverb / interjection" }), false);
  assert.equal(isSpellingInterjectionEntry({ word: "dear", pos: "adjective/interjection" }), false);
  assert.equal(isSpellingInterjectionEntry({ word: "abandon", pos: "verb" }), false);
});

test("filterSpellingInterjections removes interjections from live lexicon", () => {
  const wordsRaw = JSON.parse(fs.readFileSync(wordsPath, "utf8"));
  const words = wordsRaw.words || wordsRaw;
  const { kept, removed } = filterSpellingInterjections(words);

  assert.equal(kept.length + removed.length, words.length);
  assert.equal(removed.length, 0);
  assert.ok(!kept.some((entry) => ["ah", "aha", "heck", "hmm"].includes(String(entry.word || "").toLowerCase())));
});