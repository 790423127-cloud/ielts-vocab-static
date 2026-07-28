import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  IDICTATION_FLASH_INDEX_OFFSET,
  resolveWordStudyIndex,
  persistWordFlashSession
} from "../word-flashcard-session.mjs";
import {
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet
} from "../page-word-helpers.mjs";
import {
  buildWordStudyOverviewModel,
  getWordStudyProgressLabel
} from "../word-study-overview.mjs";
import {
  getReadingWordMissingFields,
  isReadingWordIncomplete,
  mergeReadingWordAiProfile,
  normalizeReadingSynonyms,
  normalizeReadingWord
} from "../../reading-words/storage.mjs";
import {
  applyMainEntryToReadingWord,
  mergeAiProfileIntoMainEntry,
  needsReadingAiProcessing
} from "../../reading-words/main-lexicon-sync.mjs";

const pagePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../page.jsx");
const pageSource = fs.readFileSync(pagePath, "utf8");
const readingWordsSource = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../reading-words/page.jsx"), "utf8");

const words = [
  { word: "alpha", status: "" },
  { word: "beta", status: "熟悉" },
  { word: "gamma", status: "" }
];

test("page word storage wrappers are safe before browser hydration", () => {
  assert.equal(safeLocalStorageGet("test-key"), null);
  assert.equal(safeLocalStorageSet("test-key", "value"), false);
  assert.doesNotThrow(() => safeLocalStorageRemove("test-key"));
});

test("paid AI start remains clickable so it can explain missing confirmation", () => {
  assert.match(readingWordsSource, /if \(!aiConfirmed\) \{/);
  assert.match(readingWordsSource, /请先勾选付费确认/);
  assert.match(readingWordsSource, /disabled=\{aiRunning \|\| !aiTargetWords\.length \|\| !mainReady\}/);
  assert.doesNotMatch(readingWordsSource, /disabled=\{!aiConfirmed \|\|/);
});

test("reading synonyms exclude formatting and British/American variants of the headword", () => {
  assert.deepEqual(normalizeReadingSynonyms(["air mail", "air-mail", "airpost"], "Airmail"), ["airpost"]);
  assert.deepEqual(normalizeReadingSynonyms(["encyclopedia", "compendium"], "Encyclopaedia"), ["compendium"]);
  assert.deepEqual(normalizeReadingSynonyms(["e-mail", "message"], "Email"), ["message"]);
});

test("legacy reading records are cleaned on normalization without another AI call", () => {
  const normalized = normalizeReadingWord({
    word: "Airmail",
    synonyms: ["air mail", "airpost"],
    synonymsReviewed: true,
    synonymsReviewSource: "reading-ai"
  });
  assert.deepEqual(normalized.synonyms, ["airpost"]);
  assert.equal(normalized.synonymsReviewed, true);
});

test("reading relations stay pending until data exists or an AI review marker is stored", () => {
  const word = normalizeReadingWord({
    word: "brochure",
    pos: "noun",
    meaning: "小册子",
    definition: "a small book containing information",
    example: "Please pick up a travel brochure at the counter.",
    exampleCn: "请在柜台拿一份旅行小册子。"
  });
  const completeMain = {
    word: "brochure",
    ieltsUse: ["Reading"],
    topics: ["旅行"],
    difficulty: "基础"
  };

  assert.deepEqual(getReadingWordMissingFields(word), ["forms", "wordFamily", "synonyms"]);
  assert.equal(isReadingWordIncomplete(word), true);
  assert.equal(needsReadingAiProcessing(word, completeMain), true);
});

test("any single unreviewed empty relation keeps the word in the AI queue", () => {
  const base = {
    word: "brochure",
    pos: "noun",
    meaning: "小册子",
    definition: "a small book containing information",
    example: "Please pick up a travel brochure at the counter.",
    exampleCn: "请在柜台拿一份旅行小册子。",
    forms: [{ word: "brochures", type: "plural" }],
    wordFamily: [{ word: "brochure", pos: "noun" }],
    synonyms: ["leaflet"]
  };
  const completeMain = {
    word: "brochure",
    ieltsUse: ["Reading"],
    topics: ["旅行"],
    difficulty: "基础"
  };

  for (const field of ["forms", "wordFamily", "synonyms"]) {
    const word = normalizeReadingWord({ ...base, [field]: [] });
    assert.deepEqual(getReadingWordMissingFields(word), [field]);
    assert.equal(needsReadingAiProcessing(word, completeMain), true);
  }
});

test("AI only marks a relation reviewed when that field is explicitly returned", () => {
  const word = normalizeReadingWord({
    word: "brochure",
    pos: "noun",
    meaning: "小册子",
    definition: "a small book containing information",
    example: "Please pick up a travel brochure at the counter.",
    exampleCn: "请在柜台拿一份旅行小册子。"
  });
  const partial = mergeReadingWordAiProfile(word, { forms: [] });

  assert.equal(partial.formsReviewed, true);
  assert.equal(partial.wordFamilyReviewed, false);
  assert.equal(partial.synonymsReviewed, false);
  assert.deepEqual(getReadingWordMissingFields(partial), ["wordFamily", "synonyms"]);
});

test("successful AI review marks empty relation sections so they are not processed repeatedly", () => {
  const word = normalizeReadingWord({
    word: "brochure",
    pos: "noun",
    meaning: "小册子",
    definition: "a small book containing information",
    example: "Please pick up a travel brochure at the counter.",
    exampleCn: "请在柜台拿一份旅行小册子。"
  });
  const reviewedWord = mergeReadingWordAiProfile(word, {
    forms: [],
    wordFamily: [],
    synonyms: []
  });
  const reviewedMain = mergeAiProfileIntoMainEntry({
    word: "brochure",
    ieltsUse: ["Reading"],
    topics: ["旅行"],
    difficulty: "基础"
  }, {
    forms: [],
    wordFamily: [],
    synonyms: []
  }, { now: "2026-07-27T00:00:00.000Z" });

  assert.equal(reviewedWord.formsReviewed, true);
  assert.equal(reviewedWord.wordFamilyReviewed, true);
  assert.equal(reviewedWord.synonymsReviewed, true);
  assert.deepEqual(getReadingWordMissingFields(reviewedWord), []);
  assert.equal(reviewedMain.formsReviewed, true);
  assert.equal(reviewedMain.wordFamilyReviewed, true);
  assert.equal(reviewedMain.synonymsReviewed, true);
  assert.equal(needsReadingAiProcessing(reviewedWord, reviewedMain), false);
});

test("existing relation data counts as complete before review markers are added", () => {
  const word = normalizeReadingWord({
    word: "brochure",
    pos: "noun",
    meaning: "小册子",
    definition: "a small book containing information",
    example: "Please pick up a travel brochure at the counter.",
    exampleCn: "请在柜台拿一份旅行小册子。",
    forms: [{ word: "brochures", type: "plural" }],
    wordFamily: [{ word: "brochure", pos: "noun" }],
    synonyms: ["leaflet"]
  });

  assert.deepEqual(getReadingWordMissingFields(word), []);
});

test("reviewed empty reading relations are shown with explicit labels", () => {
  assert.match(readingWordsSource, /已审核 · 无变形/);
  assert.match(readingWordsSource, /已审核 · 无词族/);
  assert.match(readingWordsSource, /已审核 · 无可替换/);
  assert.match(readingWordsSource, /待 AI 检查变形/);
  assert.match(readingWordsSource, /待 AI 检查词族/);
  assert.match(readingWordsSource, /待 AI 检查同义替换/);
});


test("legacy or main-lexicon review flags do not mark a reading word complete", () => {
  const legacy = normalizeReadingWord({
    word: "brochure",
    pos: "noun",
    meaning: "小册子",
    definition: "a small book containing information",
    example: "Please pick up a travel brochure at the counter.",
    exampleCn: "请在柜台拿一份旅行小册子。",
    formsReviewed: true,
    wordFamilyReviewed: true,
    synonymsReviewed: true
  });
  const linked = applyMainEntryToReadingWord(legacy, {
    word: "brochure",
    forms: [],
    wordFamily: [],
    synonyms: [],
    formsReviewed: true,
    wordFamilyReviewed: true,
    synonymsReviewed: true
  });

  assert.equal(linked.formsReviewed, false);
  assert.equal(linked.wordFamilyReviewed, false);
  assert.equal(linked.synonymsReviewed, false);
  assert.deepEqual(getReadingWordMissingFields(linked), ["forms", "wordFamily", "synonyms"]);
});

test("reading AI review provenance survives normalization and avoids repeat processing", () => {
  const base = normalizeReadingWord({
    word: "brochure",
    pos: "noun",
    meaning: "小册子",
    definition: "a small book containing information",
    example: "Please pick up a travel brochure at the counter.",
    exampleCn: "请在柜台拿一份旅行小册子。"
  });
  const reviewed = mergeReadingWordAiProfile(base, {
    forms: [],
    wordFamily: [],
    synonyms: []
  });
  const reloaded = normalizeReadingWord(reviewed);

  assert.equal(reloaded.formsReviewed, true);
  assert.equal(reloaded.formsReviewSource, "reading-ai");
  assert.equal(reloaded.wordFamilyReviewed, true);
  assert.equal(reloaded.wordFamilyReviewSource, "reading-ai");
  assert.equal(reloaded.synonymsReviewed, true);
  assert.equal(reloaded.synonymsReviewSource, "reading-ai");
  assert.deepEqual(getReadingWordMissingFields(reloaded), []);
});

test("reading AI results fill missing main-lexicon fields without overwriting existing content", () => {
  const merged = mergeAiProfileIntoMainEntry({
    word: "brochure",
    meaning: "已有释义",
    forms: [],
    wordFamily: [],
    synonyms: [],
    ieltsUse: [],
    topics: [],
    difficulty: ""
  }, {
    meaning: "AI 新释义",
    forms: [{ word: "brochures", type: "plural" }],
    wordFamily: [],
    synonyms: ["leaflet"],
    ieltsUse: ["Reading"],
    topics: ["旅行"],
    difficulty: "基础高频"
  });

  assert.equal(merged.meaning, "已有释义");
  assert.deepEqual(merged.forms, [{ word: "brochures", type: "plural" }]);
  assert.deepEqual(merged.wordFamily, []);
  assert.deepEqual(merged.synonyms, ["leaflet"]);
  assert.deepEqual(merged.ieltsUse, ["Reading"]);
  assert.deepEqual(merged.topics, ["旅行"]);
  assert.equal(merged.difficulty, "基础高频");
  assert.equal(merged.formsReviewed, true);
  assert.equal(merged.wordFamilyReviewed, true);
  assert.equal(merged.synonymsReviewed, true);
});

test("home page imports the unified quality queue used after vocab hydration", () => {
  const helperImport = pageSource.match(/import\s*\{([\s\S]*?)\}\s*from\s*["']\.\/lib\/vocab\/page-word-helpers\.mjs["']/)?.[1] || "";
  assert.match(helperImport, /\bhasHeadwordRepair\b/);
  assert.match(helperImport, /\bisLikelyWrongAiWord\b/);
  assert.match(pageSource, /\bgetWordQualityEvaluation\b/);
});

function wordMatchesFilter(word, filter) {
  if (filter.type === "everything") return true;
  if (word.status === "熟悉") return false;
  return true;
}

function filterKey(filter) {
  if (filter.type === "all") return "all";
  return `${filter.type}:${filter.value || ""}`;
}

function normalizeWord(value) {
  return String(value || "").trim().toLowerCase();
}

test("resolveWordStudyIndex prefers wordKey inside filter", () => {
  const result = resolveWordStudyIndex(words, {
    session: { wordKey: "gamma", index: 0, filter: { type: "all", value: "" } },
    entryPositions: {},
    filter: { type: "all", value: "" },
    wordMatchesFilter,
    filterKey,
    normalizeWord
  });

  assert.equal(result.index, 2);
  assert.equal(result.reason, "wordKey");
});

test("resolveWordStudyIndex restores familiar word without jumping to first", () => {
  const result = resolveWordStudyIndex(words, {
    session: { wordKey: "beta", index: 1, filter: { type: "all", value: "" } },
    entryPositions: {},
    filter: { type: "all", value: "" },
    wordMatchesFilter,
    filterKey,
    normalizeWord
  });

  assert.equal(result.index, 1);
  assert.equal(result.reason, "wordKeyOutOfFilter");
});

test("resolveWordStudyIndex does not fallback to first study word", () => {
  const result = resolveWordStudyIndex(words, {
    session: { wordKey: "missing", index: 99, filter: { type: "all", value: "" } },
    entryPositions: {},
    filter: { type: "all", value: "" },
    wordMatchesFilter,
    filterKey,
    normalizeWord
  });

  assert.equal(result.restored, false);
  assert.equal(result.index, -1);
});

test("persistWordFlashSession keeps latest index after rapid navigation", () => {
  const store = new Map();
  const storageSet = (key, value) => {
    store.set(key, value);
    return true;
  };

  for (const index of [0, 1, 2, 1, 2]) {
    persistWordFlashSession({
      words,
      index,
      filter: { type: "all", value: "" },
      entryPositions: {},
      filterKey,
      normalizeWord,
      storageSet
    });
  }

  const saved = JSON.parse(store.get("ielts_vocab_session_v1"));
  assert.equal(saved.index, 2);
  assert.equal(saved.wordKey, "gamma");
});

const idictationPool = [
  { word: "Alpha", originalIndex: IDICTATION_FLASH_INDEX_OFFSET, __idictationFlash: true },
  { word: "Beta", originalIndex: IDICTATION_FLASH_INDEX_OFFSET + 1, __idictationFlash: true },
  { word: "Gamma", originalIndex: IDICTATION_FLASH_INDEX_OFFSET + 2, __idictationFlash: true }
];

function idictationWordMatchesFilter(word, filter) {
  return filter.type === "idictation" && Boolean(word.__idictationFlash);
}

test("resolveWordStudyIndex restores idictation virtual index by wordKey", () => {
  const result = resolveWordStudyIndex([], {
    session: {
      wordKey: "beta",
      index: IDICTATION_FLASH_INDEX_OFFSET,
      filter: { type: "idictation", value: "listening" }
    },
    entryPositions: {},
    filter: { type: "idictation", value: "listening" },
    wordMatchesFilter: idictationWordMatchesFilter,
    filterKey,
    normalizeWord,
    studyPool: idictationPool
  });

  assert.equal(result.index, IDICTATION_FLASH_INDEX_OFFSET + 1);
  assert.equal(result.reason, "wordKey");
});

test("resolveWordStudyIndex restores idictation by sourceIndex when wordKey missing", () => {
  const result = resolveWordStudyIndex([], {
    session: {
      wordKey: "",
      index: IDICTATION_FLASH_INDEX_OFFSET + 2,
      idictationSourceIndex: 2,
      filter: { type: "idictation", value: "reading" }
    },
    entryPositions: {},
    filter: { type: "idictation", value: "reading" },
    wordMatchesFilter: idictationWordMatchesFilter,
    filterKey,
    normalizeWord,
    studyPool: idictationPool
  });

  assert.equal(result.index, IDICTATION_FLASH_INDEX_OFFSET + 2);
  assert.equal(result.reason, "idictationSourceIndex");
});

test("resolveWordStudyIndex rejects out-of-range lexicon index for idictation sessions", () => {
  const result = resolveWordStudyIndex(words, {
    session: {
      wordKey: "",
      index: IDICTATION_FLASH_INDEX_OFFSET + 99,
      filter: { type: "idictation", value: "listening" }
    },
    entryPositions: {},
    filter: { type: "idictation", value: "listening" },
    wordMatchesFilter: idictationWordMatchesFilter,
    filterKey,
    normalizeWord,
    studyPool: idictationPool
  });

  assert.equal(result.restored, false);
  assert.equal(result.index, -1);
});

test("persistWordFlashSession writes idictation wordKey and sourceIndex", () => {
  const store = new Map();
  const result = persistWordFlashSession({
    words: [],
    index: IDICTATION_FLASH_INDEX_OFFSET + 1,
    filter: { type: "idictation", value: "listening" },
    entryPositions: {},
    filterKey,
    normalizeWord,
    studyPool: idictationPool,
    storageSet: (key, value) => {
      store.set(key, value);
      return true;
    }
  });

  assert.equal(result.saved, true);
  assert.equal(result.session.wordKey, "beta");
  assert.equal(result.session.idictationSourceIndex, 1);
  assert.equal(JSON.parse(store.get("ielts_vocab_entry_positions_v1"))["idictation:listening"], "beta");
});

test("persistWordFlashSession dual-writes progress schema keys", () => {
  const store = new Map();
  persistWordFlashSession({
    words: [{ word: "alpha", status: "" }],
    index: 0,
    filter: { type: "all", value: "" },
    entryPositions: {},
    filterKey: (filter) => (filter.type === "all" ? "all" : filter.type),
    normalizeWord: (value) => String(value || "").trim().toLowerCase(),
    storageSet: (key, value) => {
      store.set(key, value);
      return true;
    }
  });

  assert.ok(store.has("ielts_vocab_session_v1"));
  assert.ok(store.has("ielts-vocab:progress:v1:flashcard:word:session"));
  assert.ok(store.has("ielts_vocab_entry_positions_v1"));
  assert.ok(store.has("ielts-vocab:progress:v1:flashcard:word:positions"));
  const saved = JSON.parse(store.get("ielts_vocab_session_v1"));
  assert.equal(saved.progressSchemaVersion, 1);
});

test("persistWordFlashSession writes session and positions", () => {
  const store = new Map();
  const result = persistWordFlashSession({
    words,
    index: 2,
    filter: { type: "all", value: "" },
    entryPositions: {},
    filterKey,
    normalizeWord,
    storageSet: (key, value) => {
      store.set(key, value);
      return true;
    }
  });

  assert.equal(result.saved, true);
  assert.equal(result.session.wordKey, "gamma");
  assert.equal(JSON.parse(store.get("ielts_vocab_entry_positions_v1")).all, "gamma");
});

test("word flashcard restore blocks persist until restored index is applied", () => {
  const pageSource = fs.readFileSync(pagePath, "utf8");
  const sessionHook = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../hooks/useWordFlashSession.js"),
    "utf8"
  );

  assert.match(sessionHook, /studySessionRef = useRef\(/);
  assert.match(sessionHook, /useLayoutEffect\(\(\) => \{/);
  assert.match(sessionHook, /shouldBlockStudyIndexPersist\(studySessionRef\.current, index\)/);
  assert.match(pageSource, /shouldBlockStudyIndexPersist\(sessionState, index\)/);
  assert.match(sessionHook, /sessionState\.restoreTargetIndex = result\.index >= 0 \? result\.index : null/);
  assert.match(pageSource, /effectiveStudyIndex\(studySessionRef\.current, index\)/);
});

test("word flashcard restore is not skipped by vocab cache hydration", () => {
  const pageSource = fs.readFileSync(pagePath, "utf8");
  const sessionHook = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../hooks/useWordFlashSession.js"),
    "utf8"
  );
  const bootstrapHook = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../hooks/useHomeVocabBootstrap.js"),
    "utf8"
  );
  const combined = `${pageSource}\n${sessionHook}\n${bootstrapHook}`;

  assert.doesNotMatch(
    combined,
    /isWordCacheCurrent\(cachedMeta \|\| \{\}, apiMeta\)\)[\s\S]{0,220}sessionRestoredRef\.current = true/
  );
  assert.match(pageSource, /resolveCurrentStudyItem\(/);
  assert.match(pageSource, /studySessionRef\.current\.userAdjusted/);
  assert.match(sessionHook, /shouldReResolveStudyIndex\(sessionState, pending/);
  assert.doesNotMatch(
    combined,
    /if \(!storageReadyRef\.current \|\| sessionRestoredRef\.current \|\| !words\.length\) return;/
  );
});

test("persistWordFlashSession writes schema version", () => {
  const store = new Map();
  const result = persistWordFlashSession({
    words: [{ word: "alpha", status: "" }],
    index: 0,
    filter: { type: "all", value: "" },
    entryPositions: {},
    filterKey: (filter) => (filter.type === "all" ? "all" : filter.type),
    normalizeWord: (value) => String(value || "").trim().toLowerCase(),
    storageSet: (key, value) => {
      store.set(key, value);
      return true;
    }
  });

  assert.equal(result.session.v, 2);
});

test("free browsing reports position and explicit marks instead of mastery", () => {
  const overview = buildWordStudyOverviewModel({
    filter: { type: "all", value: "" },
    studyWords: [
      { word: "alpha", status: "" },
      { word: "beta", status: "模糊" },
      { word: "gamma", status: "不熟", favorite: true }
    ],
    currentPosition: 1,
    wordLibraryStats: { todayReviewed: 2 }
  });

  assert.equal(overview.title, "待学词浏览");
  assert.equal(overview.ringLabel, "浏览位置");
  assert.equal(overview.progressPercent, 67);
  assert.deepEqual(overview.metrics.map(({ label, value }) => [label, value]), [
    ["当前范围", 3],
    ["未标记", 1],
    ["模糊", 1],
    ["不熟", 1]
  ]);
  assert.match(overview.note, /翻页只代表浏览/);
});

test("overview clamps a stale queue position after status filtering", () => {
  const overview = buildWordStudyOverviewModel({
    filter: { type: "status", value: "不熟" },
    studyWords: Array.from({ length: 6 }, (_, index) => ({ word: `word-${index}`, status: "不熟" })),
    currentPosition: 8,
    wordLibraryStats: { unfamiliar: 6, todayReviewed: 3 }
  });

  assert.equal(overview.title, "不熟词复习");
  assert.equal(overview.progressPercent, 100);
  assert.equal(overview.progressAria, "当前位置 6/6");
  assert.equal(overview.metrics.find((entry) => entry.label === "当前位置")?.value, "6/6");
});

test("idictation overview states that browsing does not rewrite master status", () => {
  const overview = buildWordStudyOverviewModel({
    filter: { type: "idictation", value: "listening" },
    studyWords: [{ word: "alpha" }, { word: "beta" }],
    currentPosition: 0,
    isExternalIdictationItem: true
  });

  assert.equal(overview.title, "听写词表浏览");
  assert.equal(overview.facts.find((entry) => entry.label === "主词库状态")?.value, "不改写");
  assert.match(overview.note, /不会自动标记主词库/);
});

test("progress labels follow the active learning mode", () => {
  assert.equal(getWordStudyProgressLabel({ type: "all", value: "" }), "浏览进度");
  assert.equal(getWordStudyProgressLabel({ type: "status", value: "模糊" }), "复习进度");
  assert.equal(getWordStudyProgressLabel({ type: "status", value: "不熟" }), "复习进度");
  assert.equal(getWordStudyProgressLabel({ type: "status", value: "熟悉" }), "回顾进度");
  assert.equal(getWordStudyProgressLabel({ type: "idictation", value: "listening" }), "词表进度");
});
