import test from "node:test";
import assert from "node:assert/strict";
import {
  backfillReadingWordsIntoMain,
  buildReadingSynonymDisplay,
  ensureReadingWordMainEntry,
  mergeAiProfileIntoMainEntry,
  needsReadingAiProcessing,
  reconcileReadingImportsWithMain,
  suggestCanonicalReadingHeadword
} from "../main-lexicon-sync.mjs";

test("legacy reading words missing from the formal lexicon are backfilled once", () => {
  const readingWords = [
    {
      id: "reading-airmail",
      word: "Airmail",
      meaning: "航空邮件",
      importCount: 2
    },
    {
      id: "reading-retain",
      word: "retain",
      meaning: "保留"
    }
  ];
  const mainWords = [{
    id: "main-retain",
    wordId: "main-retain",
    word: "retain",
    pos: "verb",
    status: "不熟"
  }];

  const first = backfillReadingWordsIntoMain(readingWords, mainWords, {
    now: "2026-07-29T00:00:00.000Z"
  });
  const second = backfillReadingWordsIntoMain(first.words, first.mainWords, {
    now: "2026-07-30T00:00:00.000Z"
  });

  assert.equal(first.addedToMain, 1);
  assert.equal(first.mainWords.length, 2);
  assert.equal(first.mainWords[0].id, "main-retain");
  assert.equal(first.mainWords[0].status, "不熟");
  assert.equal(first.mainWords[1].id, "reading-airmail");
  assert.equal(first.mainWords[1].source, "personal-reading");
  assert.equal(first.mainWords[1].supplemental, false);
  assert.equal(first.mainWords[1].readingImportCount, 2);
  assert.equal(first.words[0].mainWordId, "reading-airmail");
  assert.equal(first.words[1].mainWordId, "main-retain");
  assert.equal(second.addedToMain, 0);
  assert.equal(second.mainChanged, false);
  assert.equal(second.mainWords.length, 2);
});

test("a high-confidence missing-first-letter reading word reuses the canonical main entry", () => {
  const mainWords = [{
    id: "main-ancestors",
    wordId: "main-ancestors",
    word: "ancestors",
    pos: "noun",
    meaning: "祖先",
    definition: "people from whom one is descended",
    example: "We study our ancestors.",
    exampleCn: "我们研究祖先。",
    ieltsUse: ["Reading"],
    topics: ["历史"],
    difficulty: "基础高频"
  }];
  const readingWord = {
    id: "reading-ncestors",
    wordId: "reading-ncestors",
    word: "ncestors",
    pos: "noun",
    meaning: "祖先",
    definition: "people from whom one is descended",
    example: "We study our ancestors.",
    exampleCn: "我们研究祖先。",
    forms: [],
    formsReviewed: true,
    wordFamily: [],
    wordFamilyReviewed: true,
    synonyms: [],
    synonymsReviewed: true
  };

  const suggestion = suggestCanonicalReadingHeadword("ncestors", mainWords, readingWord);
  const result = backfillReadingWordsIntoMain([readingWord], mainWords, {
    now: "2026-08-02T00:00:00.000Z"
  });

  assert.equal(suggestion.corrected, true);
  assert.equal(suggestion.word, "ancestors");
  assert.equal(result.addedToMain, 0);
  assert.equal(result.correctedHeadwords, 1);
  assert.equal(result.readingChanged, true);
  assert.equal(result.words[0].word, "ancestors");
  assert.equal(result.words[0].correctedFrom, "ncestors");
  assert.equal(result.words[0].mainWordId, "main-ancestors");
  assert.equal(result.mainWords.length, 1);
  assert.equal(needsReadingAiProcessing(readingWord, {}, mainWords), true);
});

test("canonical correction does not replace a trusted word or a word with a different meaning", () => {
  const mainWords = [
    { id: "main-rate", word: "rate", meaning: "比率", source: "curated" },
    { id: "main-irate", word: "irate", meaning: "愤怒的", source: "curated" },
    { id: "main-cart", word: "cart", meaning: "手推车", source: "curated" }
  ];

  assert.equal(
    suggestCanonicalReadingHeadword("rate", mainWords, { word: "rate", meaning: "比率" }).corrected,
    false
  );
  assert.equal(
    suggestCanonicalReadingHeadword("art", mainWords, { word: "art", meaning: "艺术" }).corrected,
    false
  );
});

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

test("new reading word becomes a formal main-lexicon headword and repeated imports become high frequency", () => {
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
  assert.equal(first.mainWords[0].supplemental, false);
  assert.equal(first.mainWords[0].entryType, "headword");
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

test("AI can create a missing formal main entry before writing classification", () => {
  const result = ensureReadingWordMainEntry(
    {
      id: "reading-airmail",
      wordId: "reading-airmail",
      word: "Airmail",
      meaning: "航空邮件",
      pos: "noun"
    },
    [{ id: "main-existing", word: "atlas" }],
    { now: "2026-07-29T00:00:00.000Z" }
  );

  assert.equal(result.added, true);
  assert.equal(result.mainIndex, 1);
  assert.equal(result.mainEntry.id, "reading-airmail");
  assert.equal(result.mainEntry.word, "Airmail");
  assert.equal(result.mainEntry.meaning, "航空邮件");
  assert.equal(result.mainWords.length, 2);

  const classified = mergeAiProfileIntoMainEntry(result.mainEntry, {
    ieltsUse: ["阅读"],
    topics: ["通信"],
    difficulty: "基础高频"
  });
  assert.deepEqual(classified.ieltsUse, ["阅读"]);
  assert.deepEqual(classified.topics, ["通信"]);
  assert.equal(classified.difficulty, "基础高频");
});

test("synonym display uses the formal main-entry meaning", () => {
  assert.deepEqual(
    buildReadingSynonymDisplay("broad", { word: "broad", meaning: "广泛的；宽的" }),
    { word: "broad", meaning: "广泛的；宽的" }
  );
});
