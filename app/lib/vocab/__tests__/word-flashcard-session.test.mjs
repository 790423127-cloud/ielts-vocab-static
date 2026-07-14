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

const pagePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../page.jsx");
const pageSource = fs.readFileSync(pagePath, "utf8");

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

test("home page imports the runtime quality helpers used after vocab hydration", () => {
  const helperImport = pageSource.match(/import\s*\{([\s\S]*?)\}\s*from\s*["']\.\/lib\/vocab\/page-word-helpers\.mjs["']/)?.[1] || "";
  assert.match(helperImport, /\bisMissingAiFields\b/);
  assert.match(helperImport, /\bisMissingClassification\b/);
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
