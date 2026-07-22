import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { normalizeHeadword } from "../lexicon-guard-shared.mjs";
import { buildVocabDataPayload } from "../vocab-data-meta.mjs";
import {
  runNewWordGates,
  runParaphraseGates,
  BANNED_PARAPHRASE
} from "../../../../scripts/lib/gt-quality-gates.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("active words retain the expanded baseline and include Excel modules", () => {
  const raw = fs.readFileSync(path.join(root, ".static-export-cache/words.json"), "utf8");
  const data = JSON.parse(raw);
  const words = data.words || data;
  assert.ok(words.length >= 11532, `expected at least 11532 words, got ${words.length}`);
  assert.equal(Number(data.count), words.length);
  const set = new Set(words.map((w) => normalizeHeadword(w.word)));
  assert.equal(set.size, words.length);
  assert.match(String(data.version || ""), /^v\d+-\d+-/);
});

test("phrases retain the original layer and include Excel phrase modules", () => {
  const raw = fs.readFileSync(path.join(root, "public/data/phrases.json"), "utf8");
  const data = JSON.parse(raw);
  assert.ok(data.phrases.length >= 1280, `expected at least 1280 phrases, got ${data.phrases.length}`);
  assert.equal(Number(data.count), data.phrases.length);
  assert.match(String(data.version || ""), /^phrase-layer-v\d+/);
  const withPhonetic = data.phrases.filter((phrase) => String(phrase.phonetic || "").trim()).length;
  assert.ok(withPhonetic >= 1200, `expected most phrases to have phonetics, got ${withPhonetic}`);
});

test("listening-reading paraphrases has 600 entries", () => {
  const data = JSON.parse(fs.readFileSync(path.join(root, "public/data/listening-reading-paraphrases.json"), "utf8"));
  assert.equal(data.count, 600);
  assert.equal(data.entries.length, 600);
  const gate = runParaphraseGates(data.entries, 250);
  assert.equal(gate.ok, true, gate.errors.slice(0, 10).join("; "));
  assert.equal(gate.sampleSize, 250);
});

test("supplementary words pass complete field and content gates", () => {
  const data = JSON.parse(fs.readFileSync(path.join(root, ".static-export-cache/words.json"), "utf8"));
  const supplementaryWords = data.words.filter((entry) => (
    entry.normalizedHeadword &&
    entry.candidateSource &&
    entry.sourceType !== "gt-complete-corpus-patch"
  ));
  const gate = runNewWordGates(supplementaryWords);
  assert.equal(gate.ok, true, gate.errors.slice(0, 10).join("; "));
});

test("strict paraphrase gate rejects historical numbering and runaway sentences", () => {
  const data = JSON.parse(fs.readFileSync(path.join(root, "public/data/listening-reading-paraphrases.json"), "utf8"));
  const numbered = structuredClone(data.entries);
  numbered[0].questionExpression = "submit the form [441]";
  assert.equal(BANNED_PARAPHRASE.test(JSON.stringify(numbered[0])), true);
  assert.equal(runParaphraseGates(numbered, 250).ok, false);

  const runaway = structuredClone(data.entries);
  runaway[1].questionSentence = `Please submit the form ${"and check the notice ".repeat(20)}`;
  assert.equal(runParaphraseGates(runaway, 250).ok, false);
});

test("home page exposes paraphrase study tab", () => {
  const page = fs.readFileSync(path.join(root, "app/page.jsx"), "utf8");
  assert.match(page, /听力阅读同义替换/);
  assert.match(page, /LrParaphrasePanel/);
  assert.match(page, /flashStudyMode === "paraphrase"/);
});

test("vocab API payload metadata is consistent", () => {
  const raw = fs.readFileSync(path.join(root, ".static-export-cache/words.json"), "utf8");
  const source = JSON.parse(raw);
  const words = source.words || source;
  const payload = buildVocabDataPayload(raw);
  assert.equal(payload.ok, true);
  assert.equal(payload.count, words.length);
  assert.ok(payload.lexiconHash);
  assert.ok(payload.wordsHash);
  assert.ok(payload.fileHash);
});

test("the imported 1179-word list is fully eligible for Listening Priority", async () => {
  const candidates = [
    process.env.IELTS_LISTENING_1179_JSON,
    path.join(root, "fixtures", "ielts-listening-final-merged-1179-5-7band.json"),
    path.join(root, "public", "data", "fixtures", "ielts-listening-final-merged-1179-5-7band.json"),
    path.join(process.env.USERPROFILE || "", "Downloads", "ielts-listening-final-merged-1179-5-7band.json")
  ].filter(Boolean);

  const sourcePath = candidates.find((filePath) => fs.existsSync(filePath));
  if (!sourcePath) {
    // Optional fixture: skip when the external import source is not present.
    return;
  }

  const source = fs.readFileSync(sourcePath, "utf8");
  const imported = new Set(
    [...source.matchAll(/"word"\s*:\s*"([A-Za-z][A-Za-z'-]*)"/g)].map((match) => normalizeHeadword(match[1]))
  );
  const data = JSON.parse(fs.readFileSync(path.join(root, ".static-export-cache/words.json"), "utf8"));
  const { matchSpellingCategory } = await import("../../spelling/spelling-categories.mjs");
  const matching = data.words.filter((entry) => imported.has(normalizeHeadword(entry.word)));
  assert.equal(imported.size, 1179);
  assert.equal(matching.length, 1179);
  assert.equal(matching.filter((entry) => matchSpellingCategory(entry, "lr_high_frequency", "listening")).length, 1179);
});
