import test from "node:test";
import assert from "node:assert/strict";
import {
  enrichReadingWordsSynonymDetails,
  hasCompleteReadingSynonymDetails,
  normalizeReadingSynonymDetails
} from "../synonym-details.mjs";

test("reading synonym meaning reuses the formal main lexicon when available", () => {
  const result = enrichReadingWordsSynonymDetails(
    [{ id: "reading-1", word: "extensive", synonyms: ["broad"] }],
    { mainWords: [{ word: "broad", pos: "adjective", meaning: "广泛的；宽的" }] }
  );

  assert.equal(result.changed, true);
  assert.deepEqual(result.words[0].synonymDetails, [
    { word: "broad", pos: "adjective", meaningZh: "广泛的；宽的" }
  ]);
  assert.equal(hasCompleteReadingSynonymDetails(result.words[0]), true);
});

test("British and American headword variants share reviewed synonym details", () => {
  const result = enrichReadingWordsSynonymDetails(
    [{ id: "reading-2", word: "Encyclopaedia", synonyms: ["compendium"] }],
    {
      completionEntries: {
        encyclopedia: {
          word: "encyclopedia",
          synonymDetails: [{ word: "compendium", pos: "noun", meaningZh: "概要" }]
        }
      }
    }
  );

  assert.deepEqual(result.words[0].synonymDetails, [
    { word: "compendium", pos: "noun", meaningZh: "概要" }
  ]);
});

test("a synonym remains incomplete when no reliable meaning source exists", () => {
  const entry = { word: "dry", synonyms: ["most parched"], synonymDetails: [] };
  assert.equal(hasCompleteReadingSynonymDetails(entry), false);
  assert.deepEqual(normalizeReadingSynonymDetails([], entry.synonyms, entry.word), []);
});
