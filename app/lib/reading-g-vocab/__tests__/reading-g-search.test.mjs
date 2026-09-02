import assert from "node:assert/strict";
import test from "node:test";

import {
  getReadingGEntrySearchRank,
  readingGEntryMatchesSearch
} from "../search.mjs";

test("a compacted plural searches its canonical G-reading headword", () => {
  const rack = {
    word: "rack",
    meaning: "架子；搁物架",
    forms: [{ word: "racks", type: "merged-form" }],
    mergedAliases: [{ key: "racks", id: "rg_word_racks" }]
  };

  assert.equal(readingGEntryMatchesSearch(rack, "rack"), true);
  assert.equal(readingGEntryMatchesSearch(rack, "racks"), true);
  assert.equal(readingGEntryMatchesSearch(rack, "搁物架"), true);
  assert.equal(readingGEntryMatchesSearch(rack, "customs"), false);
});

test("an exact compacted form ranks ahead of a broad substring match", () => {
  const rack = { word: "rack", forms: [{ word: "racks" }] };
  const track = { word: "track", forms: [{ word: "tracks" }] };

  assert.equal(getReadingGEntrySearchRank(rack, "racks"), 1);
  assert.equal(getReadingGEntrySearchRank(track, "racks"), 5);
});
