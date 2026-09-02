import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReadingWordsTransferPackage,
  importReadingWordsTransferPackage
} from "../transfer.mjs";

test("cross-device package round-trips reading counts, stable ids, supplements and user state", () => {
  const sourceReading = [{
    id: "reading-rare",
    wordId: "reading-rare",
    mainWordId: "reading-rare",
    word: "microhabitat",
    meaning: "微生境",
    importCount: 3,
    highFrequency: true,
    status: "不熟",
    favorite: true
  }];
  const sourceMain = [{
    id: "reading-rare",
    wordId: "reading-rare",
    word: "microhabitat",
    meaning: "微生境",
    source: "personal-reading",
    supplemental: true,
    addedFromReadingWords: true,
    status: "模糊",
    favorite: true,
    reviewCount: 4
  }];
  const payload = buildReadingWordsTransferPackage(sourceReading, sourceMain, {
    version: "v1",
    lexiconHash: "hash"
  });
  const restored = importReadingWordsTransferPackage(payload, [], [], {
    now: "2026-07-27T00:00:00.000Z"
  });

  assert.equal(restored.readingAdded, 1);
  assert.equal(restored.mainAdded, 1);
  assert.equal(restored.words[0].id, "reading-rare");
  assert.equal(restored.words[0].mainWordId, "reading-rare");
  assert.equal(restored.words[0].importCount, 3);
  assert.equal(restored.words[0].highFrequency, true);
  assert.equal(restored.words[0].status, "不熟");
  assert.equal(restored.mainWords[0].reviewCount, 4);
  assert.equal(restored.mainWords[0].favorite, true);
});

test("cross-device package excludes main-lexicon-only display fields", () => {
  const payload = buildReadingWordsTransferPackage([{
    id: "reading-alpha",
    word: "alpha",
    meaning: "阿尔法",
    synonyms: ["beginning"],
    synonymDetails: [{ word: "beginning", pos: "noun", meaningZh: "开端" }],
    collocations: [{ phrase: "alpha version", chinese: "初始版本" }],
    phraseCollocations: [{ phrase: "the alpha and omega", chinese: "始终" }]
  }], []);

  assert.deepEqual(payload.readingWords[0].synonymDetails, [
    { word: "beginning", pos: "noun", meaningZh: "开端" }
  ]);
  assert.equal(Object.hasOwn(payload.readingWords[0], "collocations"), false);
  assert.equal(Object.hasOwn(payload.readingWords[0], "phraseCollocations"), false);
});

test("cross-device package includes a lemma linked by mainWordId", () => {
  const payload = buildReadingWordsTransferPackage([{
    id: "reading-disqualified",
    word: "disqualified",
    mainWordId: "main-disqualify",
    baseWord: "disqualify",
    baseWordId: "main-disqualify",
    relationType: "past-or-past-participle"
  }], [{
    id: "main-disqualify",
    word: "disqualify",
    status: "不熟"
  }]);

  assert.equal(payload.linkedMainEntries.length, 1);
  assert.equal(payload.linkedMainEntries[0].word, "disqualify");
});

test("cross-device import merges by word without increasing frequency or overwriting target progress", () => {
  const payload = {
    type: "ielts-reading-words-transfer",
    version: 1,
    readingWords: [{
      id: "source-reading-id",
      word: "retain",
      importCount: 2,
      highFrequency: true,
      status: "不熟"
    }],
    linkedMainEntries: [{
      id: "source-main-id",
      word: "retain",
      transferType: "user-state",
      status: "不熟",
      reviewCount: 2
    }]
  };
  const restored = importReadingWordsTransferPackage(
    payload,
    [{ id: "target-reading-id", word: "retain", importCount: 1, status: "熟悉" }],
    [{ id: "target-main-id", word: "retain", pos: "verb", status: "熟悉", reviewCount: 6 }],
    { now: "2026-07-27T00:00:00.000Z" }
  );

  assert.equal(restored.words[0].id, "target-reading-id");
  assert.equal(restored.words[0].mainWordId, "target-main-id");
  assert.equal(restored.words[0].importCount, 2);
  assert.equal(restored.words[0].status, "熟悉");
  assert.equal(restored.mainWords[0].id, "target-main-id");
  assert.equal(restored.mainWords[0].status, "熟悉");
  assert.equal(restored.mainWords[0].reviewCount, 6);
});

test("cross-device import keeps the generated main id when a supplement id conflicts", () => {
  const payload = {
    type: "ielts-reading-words-transfer",
    version: 1,
    readingWords: [{ id: "reading-new", word: "microhabitat" }],
    linkedMainEntries: [{
      id: "main-existing",
      wordId: "main-existing",
      word: "microhabitat",
      transferType: "supplement",
      source: "personal-reading",
      addedFromReadingWords: true
    }]
  };

  const restored = importReadingWordsTransferPackage(
    payload,
    [],
    [{ id: "main-existing", wordId: "main-existing", word: "retain" }],
    {
      now: "2026-07-27T00:00:00.000Z",
      mainIdFactory: () => "main-generated"
    }
  );

  assert.equal(restored.mainWords[1].id, "main-generated");
  assert.equal(restored.mainWords[1].wordId, "main-generated");
  assert.equal(restored.words[0].mainWordId, "main-generated");
});

test("cross-device import preserves the latest ISO review timestamp", () => {
  const payload = {
    type: "ielts-reading-words-transfer",
    version: 1,
    readingWords: [{ id: "reading-retain", word: "retain" }],
    linkedMainEntries: [{
      id: "source-main",
      word: "retain",
      transferType: "user-state",
      lastReviewedAt: "2026-07-27T08:30:00.000Z"
    }]
  };

  const restored = importReadingWordsTransferPackage(
    payload,
    [],
    [{
      id: "target-main",
      word: "retain",
      lastReviewedAt: "2026-07-26T08:30:00.000Z"
    }],
    { now: "2026-07-27T09:00:00.000Z" }
  );

  assert.equal(restored.mainWords[0].lastReviewedAt, "2026-07-27T08:30:00.000Z");
});
