import test from "node:test";
import assert from "node:assert/strict";
import { normalizeReadingGKey, mergeKey, stableReadingGId } from "../normalize.mjs";

test("normalize collapses spaces and quotes", () => {
  assert.equal(normalizeReadingGKey("  Book  In  Advance "), "book in advance");
  assert.equal(normalizeReadingGKey("didn’t know"), "didn't know");
});

test("does not merge motor and mortar", () => {
  assert.notEqual(normalizeReadingGKey("motor"), normalizeReadingGKey("mortar"));
});

test("stable id deterministic", () => {
  const a = stableReadingGId("word", "issue");
  const b = stableReadingGId("word", "issue");
  assert.equal(a, b);
  assert.equal(a, "rg_word_issue");
});

test("merge key separates word and phrase", () => {
  assert.notEqual(mergeKey("word", "in advance"), mergeKey("phrase", "in advance"));
});
