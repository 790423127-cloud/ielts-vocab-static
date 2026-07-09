import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  detectTruncatedHeadword,
  findTruncatedHeadwordEntries
} from "../truncated-headword.mjs";
import { buildTruncationPrefixIndex } from "../truncated-headword.mjs";

test("detectTruncatedHeadword flags bil when forms point to a longer inflected form", () => {
  const entryByHeadword = new Map([
    ["bil", {
      word: "bil",
      answer: "bil",
      importedFromBasicTemplateAt: 1,
      example: "I received the electricity bil yesterday.",
      collocations: [{ phrase: "pay the bil" }],
      forms: [{ word: "billing" }]
    }],
    ["bill", { word: "bill", example: "I need to pay the electricity bill today." }],
    ["billing", { word: "billing", example: "Billing is handled online." }]
  ]);
  const index = buildTruncationPrefixIndex(["bil", "bill", "billing"]);
  const hit = detectTruncatedHeadword(entryByHeadword.get("bil"), index, entryByHeadword);

  assert.equal(hit?.canonical, "bill");
  assert.equal(hit?.reason, "corrupted-template");
});

test("detectTruncatedHeadword flags belov because forms and example use truncated spelling", () => {
  const entryByHeadword = new Map([
    ["belov", {
      word: "belov",
      answer: "belov",
      importedFromBasicTemplateAt: 1,
      example: "She is my belov daughter.",
      collocations: [{ phrase: "belov family" }],
      forms: [{ word: "beloved" }]
    }],
    ["beloved", { word: "beloved", example: "Please learn beloved in context." }]
  ]);
  const index = buildTruncationPrefixIndex(["belov", "beloved"]);
  const hit = detectTruncatedHeadword(entryByHeadword.get("belov"), index, entryByHeadword);

  assert.equal(hit?.canonical, "beloved");
  assert.equal(hit?.reason, "corrupted-template");
});

test("live lexicon has zero truncated spelling headwords", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const words = JSON.parse(
    fs.readFileSync(path.join(root, ".static-export-cache", "words.json"), "utf8")
  ).words;

  const truncated = findTruncatedHeadwordEntries(words);
  assert.equal(truncated.length, 0);
  assert.ok(!words.some((entry) => ["agre", "belov", "bil"].includes(String(entry.word || "").toLowerCase())));
});