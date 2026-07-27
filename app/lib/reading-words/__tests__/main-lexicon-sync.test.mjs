import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeAiProfileIntoMainEntry,
  needsReadingAiProcessing,
  reconcileReadingImportsWithMain
} from "../main-lexicon-sync.mjs";

test("existing main entry supplies canonical pos, forms and family without changing its stable id", () => {
  const result = reconcileReadingImportsWithMain(
    [],
    [{ word: "retain", meaning: "保留" }],
    [{
      id: "main-retain",
      wordId: "main-retain",
      word: "retain",
      pos: "verb",
      forms: [{ word: "retained", type: "past" }],
      wordFamily: [{ word: "retention", pos: "noun" }]
    }],
    { now: "2026-07-27T00:00:00.000Z", readingIdFactory: () => "reading-retain" }
  );

  assert.equal(result.added, 1);
  assert.equal(result.reusedMain, 1);
  assert.equal(result.addedToMain, 0);
  assert.equal(result.words[0].mainWordId, "main-retain");
  assert.equal(result.words[0].pos, "verb");
  assert.deepEqual(result.words[0].forms, [{ word: "retained", type: "past" }]);
  assert.deepEqual(result.words[0].wordFamily, [{ word: "retention", pos: "noun" }]);
  assert.equal(result.mainWords[0].id, "main-retain");
});

test("new reading word becomes a personal main-lexicon supplement and repeated imports become high frequency", () => {
  const first = reconcileReadingImportsWithMain(
    [],
    [{ word: "microhabitat" }],
    [],
    {
      now: "2026-07-27T00:00:00.000Z",
      readingIdFactory: () => "reading-microhabitat"
    }
  );
  const second = reconcileReadingImportsWithMain(
    first.words,
    [{ word: "microhabitat" }, { word: "microhabitat" }],
    first.mainWords,
    { now: "2026-07-28T00:00:00.000Z" }
  );

  assert.equal(first.addedToMain, 1);
  assert.equal(first.mainWords[0].source, "personal-reading");
  assert.equal(first.mainWords[0].supplemental, true);
  assert.equal(first.mainWords[0].id, "reading-microhabitat");
  assert.equal(second.addedToMain, 0);
  assert.equal(second.duplicates, 2);
  assert.equal(second.words[0].importCount, 3);
  assert.equal(second.words[0].highFrequency, true);
  assert.equal(second.mainWords[0].readingImportCount, 3);
});

test("AI classification is written to main entry only and preserves ids and user state", () => {
  const before = {
    id: "main-1",
    wordId: "main-1",
    word: "microhabitat",
    meaning: "",
    status: "不熟",
    favorite: true
  };
  assert.equal(needsReadingAiProcessing({ word: "microhabitat", meaning: "微生境" }, before), true);

  const after = mergeAiProfileIntoMainEntry(before, {
    meaning: "微生境",
    ieltsUse: ["阅读"],
    topics: ["环境"],
    difficulty: "高级"
  }, { now: "2026-07-27T00:00:00.000Z" });

  assert.equal(after.id, "main-1");
  assert.equal(after.wordId, "main-1");
  assert.equal(after.status, "不熟");
  assert.equal(after.favorite, true);
  assert.deepEqual(after.ieltsUse, ["阅读"]);
  assert.deepEqual(after.topics, ["环境"]);
  assert.equal(after.difficulty, "高级");
});
