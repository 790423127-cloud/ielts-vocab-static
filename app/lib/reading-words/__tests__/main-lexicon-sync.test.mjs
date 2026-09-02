import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMainEntryToReadingWord,
  backfillReadingWordsIntoMain,
  buildReadingMainLookup,
  shouldKeepReadingWordLocal,
  buildReadingSynonymDisplay,
  ensureReadingWordMainEntry,
  mergeAiProfileIntoMainEntry,
  needsReadingAiProcessing,
  reconcileReadingImportsWithMain,
  resolveReadingMainEntry,
  suggestCanonicalReadingHeadword
} from "../main-lexicon-sync.mjs";

test("prebuilt main lookup preserves reading-word resolution and canonical correction", () => {
  const mainWords = [
    { id: "main-disqualify", wordId: "main-disqualify", word: "disqualify", pos: "verb" },
    {
      id: "legacy-disqualified",
      word: "disqualified",
      source: "personal-reading",
      addedFromReadingWords: true
    },
    { id: "main-ancestors", wordId: "main-ancestors", word: "ancestors", meaning: "祖先" }
  ];
  const inflected = {
    word: "disqualified",
    pos: "verb",
    definition: "past participle of disqualify"
  };
  const fragment = { word: "ncestors", meaning: "祖先" };
  const lookup = buildReadingMainLookup(mainWords);

  assert.deepEqual(
    resolveReadingMainEntry(inflected, mainWords, lookup),
    resolveReadingMainEntry(inflected, mainWords)
  );
  assert.deepEqual(
    suggestCanonicalReadingHeadword("ncestors", mainWords, fragment, { mainLookup: lookup }),
    suggestCanonicalReadingHeadword("ncestors", mainWords, fragment)
  );
});

test("confirmed person names and captured sentences stay in the reading notebook only", () => {
  const readingWords = [
    { id: "reading-stuart", word: "stuart", meaning: "人名" },
    {
      id: "reading-sentence",
      word: "He explains that other females can ensure the genes they share are passed on by helping to raise their brothers and sisters. ‘It makes cooperation much stronger.’",
      meaning: ""
    },
    { id: "reading-airmail", word: "Airmail", meaning: "航空邮件" }
  ];
  const result = backfillReadingWordsIntoMain(readingWords, [], {
    now: "2026-08-29T00:00:00.000Z"
  });

  assert.equal(shouldKeepReadingWordLocal(readingWords[0]), true);
  assert.equal(shouldKeepReadingWordLocal(readingWords[1]), true);
  assert.equal(shouldKeepReadingWordLocal(readingWords[2]), false);
  assert.equal(result.addedToMain, 1);
  assert.equal(result.mainWords.map((entry) => entry.word).join(","), "Airmail");
  assert.equal(result.words[0].mainWordId, undefined);
  assert.equal(result.words[2].mainWordId, "reading-airmail");
});

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

test("a selection fragment is repaired from the original reading sentence instead of its wrong AI gloss", () => {
  const mainWords = [
    {
      id: "main-campus",
      word: "campus",
      meaning: "校园",
      definition: "the grounds and buildings of a university"
    },
    {
      id: "reading-cam",
      word: "cam",
      meaning: "凸轮",
      source: "personal-reading",
      addedFromReadingWords: true
    }
  ];
  const readingWord = {
    id: "reading-cam",
    word: "cam",
    meaning: "凸轮",
    readingSources: [{ sentence: "We also offer bike storage on campus." }]
  };

  const suggestion = suggestCanonicalReadingHeadword("cam", mainWords, readingWord);

  assert.equal(suggestion.corrected, true);
  assert.equal(suggestion.word, "campus");
  assert.equal(suggestion.mainEntry.id, "main-campus");
});

test("source-fragment repair is not applied when the source has no unique curated completion", () => {
  const mainWords = [
    { id: "reading-cam", word: "cam", meaning: "凸轮", source: "personal-reading" },
    { id: "main-camp", word: "camp", meaning: "营地" },
    { id: "main-campus", word: "campus", meaning: "校园" }
  ];
  const readingWord = {
    word: "cam",
    meaning: "凸轮",
    readingSources: [{ sentence: "The camp near the campus is open." }]
  };

  assert.equal(suggestCanonicalReadingHeadword("cam", mainWords, readingWord).corrected, false);
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

test("a passage inflection links to its curated lemma without renaming the reading card", () => {
  const mainWords = [
    {
      id: "main-disqualify",
      wordId: "main-disqualify",
      word: "disqualify",
      pos: "verb",
      meaning: "使不合格；取消资格",
      forms: [
        { word: "disqualifies", type: "third-person singular" },
        { word: "disqualified", type: "past tense / past participle" },
        { word: "disqualifying", type: "present participle / gerund" }
      ]
    },
    {
      id: "legacy-disqualified",
      word: "disqualified",
      pos: "verb",
      source: "personal-reading",
      addedFromReadingWords: true,
      forms: [{ word: "disqualifies", type: "third-person singular" }]
    }
  ];
  const readingWord = {
    id: "reading-disqualified",
    word: "disqualified",
    pos: "verb",
    meaning: "被取消资格",
    definition: "past participle of disqualify",
    meaningDetailZh: "disqualified 是 disqualify 的过去分词。",
    forms: [{ word: "disqualifies", type: "third-person singular" }]
  };

  const resolved = resolveReadingMainEntry(readingWord, mainWords);
  const result = reconcileReadingImportsWithMain([], [readingWord], mainWords, {
    now: "2026-08-13T00:00:00.000Z"
  });

  assert.equal(resolved.entry.word, "disqualify");
  assert.equal(resolved.relationType, "past-or-past-participle");
  assert.equal(result.addedToMain, 0);
  assert.equal(result.words[0].word, "disqualified");
  assert.equal(result.words[0].mainWordId, "main-disqualify");
  assert.equal(result.words[0].baseWord, "disqualify");
  assert.equal(result.words[0].relationType, "past-or-past-participle");
  assert.deepEqual(result.words[0].forms.map(({ word, type }) => ({ word, type })), [
    { word: "disqualify", type: "base-form" }
  ]);
  assert.equal(result.words[0].formsReviewed, true);
});

test("a stale mainWordId that points to the old reference resolves through to the lemma", () => {
  const mainWords = [
    { id: "main-disqualify", word: "disqualify", pos: "verb" },
    {
      id: "legacy-disqualified",
      word: "disqualified",
      entryType: "inflected-form",
      studyMode: "reference",
      baseWord: "disqualify",
      baseWordId: "main-disqualify",
      redirectToWord: "disqualify",
      relationType: "past participle"
    }
  ];
  const readingWord = {
    word: "disqualified",
    mainWordId: "legacy-disqualified",
    definition: "past participle of disqualify"
  };

  const resolved = resolveReadingMainEntry(readingWord, mainWords);

  assert.equal(resolved.entry.word, "disqualify");
  assert.equal(resolved.index, 0);
  assert.equal(resolved.redirected, true);
});

test("an independently lexicalised participle is not auto-linked without grammatical evidence", () => {
  const mainWords = [{ id: "main-engage", word: "engage", pos: "verb" }];
  const engaging = {
    id: "reading-engaging",
    word: "engaging",
    pos: "adjective",
    meaning: "吸引人的",
    definition: "charming and attractive"
  };

  assert.equal(resolveReadingMainEntry(engaging, mainWords), null);
});

test("a persisted validated base relation remains linked even when its gloss omits grammar wording", () => {
  const mainWords = [{ id: "main-integrate", word: "integrate", pos: "verb" }];
  const integrating = {
    id: "reading-integrating",
    word: "integrating",
    pos: "verb",
    meaning: "整合",
    definition: "combining different parts",
    mainWordId: "main-integrate",
    baseWord: "integrate",
    baseWordId: "main-integrate",
    relationType: "present participle"
  };

  assert.equal(resolveReadingMainEntry(integrating, mainWords)?.entry.word, "integrate");
});

test("reviewed reading context is not overwritten by the global dictionary sense", () => {
  const reading = {
    id: "reading-stroke",
    word: "stroke",
    pos: "verb",
    meaning: "抚摸；轻抚",
    readingMeaning: "抚摸；轻抚",
    readingContextReviewed: true,
    senses: [],
    otherMeanings: [{ pos: "noun", meaningZh: "中风" }],
    synonyms: [],
    synonymsReviewed: true,
    forms: [],
    formsReviewed: true,
    wordFamily: [],
    wordFamilyReviewed: true
  };
  const main = {
    id: "main-stroke",
    word: "stroke",
    pos: "noun / verb",
    meaning: "中风；抚摸；笔画",
    meaningDetailZh: "作为名词可指脑部血流中断造成的中风。",
    senses: [{ pos: "noun / verb", meaningZh: "中风；抚摸；笔画" }],
    otherMeanings: [{ pos: "noun", meaningZh: "中风；笔画" }],
    synonyms: ["apoplexy", "seizure"],
    forms: [{ word: "stroking", type: "present participle / gerund" }]
  };
  const merged = applyMainEntryToReadingWord(reading, main);

  assert.equal(merged.meaning, "抚摸；轻抚");
  assert.equal(merged.pos, "verb");
  assert.equal(merged.meaningDetailZh || "", "");
  assert.deepEqual(merged.senses, []);
  assert.deepEqual(merged.otherMeanings, [{ pos: "noun", meaningZh: "中风" }]);
  assert.deepEqual(merged.synonyms, []);
  assert.deepEqual(merged.forms, []);
});

test("a passage-specific detail cannot replace the formal lexicon's different primary sense", () => {
  const main = {
    id: "main-stroke",
    word: "stroke",
    meaning: "中风",
    meaningDetailZh: ""
  };
  const merged = mergeAiProfileIntoMainEntry(main, {
    word: "stroke",
    meaning: "抚摸；轻抚",
    meaningDetailZh: "指用手在动物表面轻柔移动，常用于人与动物互动的场景。"
  });

  assert.equal(merged.meaning, "中风");
  assert.equal(merged.meaningDetailZh, "");
});

test("new imported reading contexts remain AI candidates after main-lexicon hydration", () => {
  assert.equal(needsReadingAiProcessing({
    word: "stroke",
    readingContextPending: true,
    pos: "noun / verb",
    meaning: "中风；抚摸；笔画",
    definition: "dictionary entry",
    example: "He had a stroke last year.",
    exampleCn: "他去年中风了。",
    forms: [],
    formsReviewed: true,
    wordFamily: [],
    wordFamilyReviewed: true,
    synonyms: [],
    synonymsReviewed: true
  }, {
    word: "stroke",
    ieltsUse: ["Reading"],
    topics: ["健康"],
    difficulty: "基础高频"
  }), true);
});

test("read-only notebook completion ignores main classification after reusable content is complete", () => {
  const readingWord = {
    word: "proactive",
    pos: "adjective",
    meaning: "积极主动的",
    meaningDetailZh: "指在问题发生前主动判断并采取行动，而不是被动等待问题出现。",
    definition: "taking action before a problem occurs",
    example: "Employers should take a proactive approach.",
    exampleCn: "雇主应采取积极主动的方法。",
    forms: [],
    formsReviewed: true,
    wordFamily: [],
    wordFamilyReviewed: true,
    synonyms: [],
    synonymsReviewed: true
  };

  assert.equal(needsReadingAiProcessing(readingWord, {}, [], {
    requireMainClassification: false
  }), false);
  assert.equal(needsReadingAiProcessing(readingWord, {}, []), true);
});

test("read-only imports reuse every available main entry and keep future missing words local", () => {
  const mainWords = [{
    id: "main-proactive",
    wordId: "main-proactive",
    word: "proactive",
    pos: "adjective",
    meaning: "积极主动的",
    definition: "taking action before a problem occurs"
  }];
  const result = reconcileReadingImportsWithMain(
    [],
    [{ word: "proactive" }, { word: "futurelocalword" }],
    mainWords,
    {
      now: "2026-08-14T00:00:00.000Z",
      allowMainWrites: false,
      readingIdFactory: (word) => `reading-${word}`
    }
  );

  assert.equal(result.localOnly, true);
  assert.equal(result.mainChanged, false);
  assert.equal(result.addedToMain, 0);
  assert.equal(result.reusedMain, 1);
  assert.equal(result.missingMain, 1);
  assert.deepEqual(result.mainWords, mainWords);
  assert.equal(result.words.find((word) => word.word === "proactive").meaning, "积极主动的");
  assert.equal(result.words.find((word) => word.word === "proactive").mainWordId, "main-proactive");
  assert.equal(result.words.find((word) => word.word === "futurelocalword").mainWordId, "");
});
