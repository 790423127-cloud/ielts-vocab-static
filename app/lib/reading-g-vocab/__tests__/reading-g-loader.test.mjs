import test from "node:test";
import assert from "node:assert/strict";
import { normalizeReadingGItem } from "../load-reading-g.mjs";

test("loader maps primaryMeaningZh to meaning", () => {
  const item = normalizeReadingGItem({
    id: "rg_word_x",
    word: "however",
    entryType: "word",
    primaryMeaningZh: "然而",
    layers: ["logic120"],
    primaryLayer: "logic120",
    studyMode: "active",
    senses: [{ senseId: "s1", pos: "adverb", meaningZh: "然而" }]
  });
  assert.equal(item.meaning, "然而");
  assert.equal(item.studyMode, "active");
  assert.deepEqual(item.layers, ["logic120"]);
});
