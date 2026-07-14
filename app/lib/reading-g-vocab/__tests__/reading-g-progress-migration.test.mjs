import test from "node:test";
import assert from "node:assert/strict";
import { buildItemKeyIndex } from "../migration.mjs";
import { normalizeReadingGKey } from "../normalize.mjs";

test("buildItemKeyIndex matches by normalized word", () => {
  const items = [
    { id: "rg_word_issue", word: "issue", entryType: "word", normalizedKey: "issue" },
    {
      id: "rg_phrase_in_advance",
      word: "in advance",
      entryType: "phrase",
      normalizedKey: "in advance"
    }
  ];
  const idx = buildItemKeyIndex(items);
  assert.equal(idx.byNormSingle.get("issue").id, "rg_word_issue");
  assert.equal(idx.byMerge.get("phrase::in advance").id, "rg_phrase_in_advance");
  assert.equal(normalizeReadingGKey("Issue"), "issue");
});
