import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  classifySurfaceInflection
} from "../../vocab/word-surface-morphology.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const vocab = JSON.parse(fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"), "utf8"));
const compaction = JSON.parse(fs.readFileSync(
  path.join(root, "public/data/reading-g-word-family-compaction.json"),
  "utf8"
));
const words = vocab.items.filter((entry) => (entry?.entryType || "word") === "word");
const byKey = new Map(words.map((entry) => [entry.normalizedKey || entry.word.toLowerCase(), entry]));

test("G-reading compaction contains only direct word-surface inflections", () => {
  const activeRules = compaction.rules.filter((rule) => !rule.suppressionOnly);
  const aliases = activeRules.flatMap((rule) => (
    (rule.aliases || []).map((alias) => ({ base: rule.canonicalKey, alias }))
  ));

  assert.equal(compaction.scope, "reading-g-direct-inflections-only-word-derived-no-family-compaction");
  assert.equal(aliases.length, vocab.wordOnlyInflectionReview.keptMergedInflectionCount);
  assert.equal(aliases.every(({ base, alias }) => (
    alias.relationType === "form"
    && Boolean(classifySurfaceInflection(base, alias.key))
  )), true);
});

test("lexicalised forms and derivations stay independently brushable", () => {
  for (const word of [
    "accounting", "graphics", "publishing", "training", "engineering",
    "recording", "thinking", "standing", "clothes", "customs", "premises",
    "savings", "trousers", "killer", "lastly", "little"
  ]) {
    assert.ok(byKey.has(word), `${word} should be a standalone G-reading word`);
    assert.notEqual(byKey.get(word).studyMode, "reference", `${word} should be brushable`);
  }
});

test("plain regular forms remain merged and do not become duplicate cards", () => {
  for (const word of ["accounts", "publishes", "trains", "offered", "funded"]) {
    assert.equal(byKey.has(word), false, `${word} should stay merged into its base word`);
  }
  assert.equal(byKey.has("seek"), true);
  assert.equal(byKey.has("sought"), false);
  assert.equal(byKey.get("seek").mergedAliases.some((alias) => alias.key === "sought"), true);
});

test("review preserves phrases and publishes the verified totals", () => {
  const phrases = vocab.items.filter((entry) => entry?.entryType === "phrase");
  assert.equal(vocab.wordCount, words.length);
  assert.equal(vocab.phraseCount, phrases.length);
  assert.equal(vocab.count, vocab.items.length);
  assert.equal(
    vocab.wordOnlyInflectionReview.restoredStandaloneCount,
    vocab.wordOnlyInflectionReview.standaloneDecisionCount
  );
  assert.ok(vocab.wordOnlyInflectionReview.keptMergedInflectionCount > 0);
});
