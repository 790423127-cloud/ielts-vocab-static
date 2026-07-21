import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyMorphologyCleanup } from "../../../../scripts/apply-vocab-morphology-v1.mjs";
import {
  buildFilteredWordIndices,
  buildStudyWordIndices,
  wordMatchesFilter
} from "../word-flashcard-study-pool.mjs";
import {
  persistWordFlashSession,
  resolveWordStudyIndex
} from "../word-flashcard-session.mjs";
import {
  isBrushableWord,
  isInflectedReferenceWord,
  resolveInflectedReferenceIndex
} from "../word-study-eligibility.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CACHE = path.join(ROOT, ".static-export-cache", "words.json");
const AUDIT = path.join(ROOT, "data", "vocab-morphology", "audit");
const normalizeWord = (value) => String(value || "").trim().toLowerCase();
const filterKey = (filter) => filter?.type === "all" ? "all" : `${filter?.type}:${filter?.value || ""}`;

function createAppliedWords() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "brushable-words-"));
  const tempWords = path.join(dir, "words.json");
  fs.copyFileSync(CACHE, tempWords);
  const report = applyMorphologyCleanup({
    sourcePath: tempWords,
    auditPath: AUDIT,
    apply: true,
    writePaths: [tempWords],
    baselinePath: null
  });
  assert.deepEqual(report.errors, []);
  const payload = JSON.parse(fs.readFileSync(tempWords, "utf8"));
  fs.rmSync(dir, { recursive: true, force: true });
  return Array.isArray(payload) ? payload : payload.words;
}

test("full lexicon exposes the real 13,587-word brushable total", () => {
  const fullWords = createAppliedWords();
  const physicalTotal = fullWords.length;
  const inflectedReferenceTotal = fullWords.filter(isInflectedReferenceWord).length;
  const brushableTotal = fullWords.filter(isBrushableWord).length;
  const everythingIndices = buildStudyWordIndices(fullWords, { type: "everything", value: "" });

  assert.equal(physicalTotal, 13757);
  assert.equal(inflectedReferenceTotal, 170);
  assert.equal(brushableTotal, 13587);
  assert.equal(everythingIndices.length, 13587);
  assert.ok(everythingIndices.every((index) => isBrushableWord(fullWords[index])));
});

test("merged inflections are excluded from every normal brush filter", () => {
  const conducted = {
    word: "conducted",
    entryType: "inflected-form",
    studyMode: "reference",
    baseWord: "conduct",
    relationType: "past_or_participle",
    status: "",
    topics: ["G类完整学习计划·阶段4"],
    ieltsUse: ["Reading"],
    difficulty: "中级核心"
  };

  for (const filter of [
    { type: "all", value: "" },
    { type: "everything", value: "" },
    { type: "ielts", value: "Reading" },
    { type: "topic", value: "G类完整学习计划·阶段4" },
    { type: "difficulty", value: "中级核心" },
    { type: "status", value: "不熟" }
  ]) {
    assert.equal(wordMatchesFilter(conducted, filter), false, JSON.stringify(filter));
  }
});

test("searching an inflected form opens its base word instead of a standalone card", () => {
  const pool = [
    { word: "conduct", entryType: "headword", status: "", difficulty: "中级核心" },
    {
      word: "conducted",
      entryType: "inflected-form",
      studyMode: "reference",
      baseWord: "conduct",
      redirectToWord: "conduct",
      relationType: "past_or_participle",
      status: "",
      difficulty: "中级核心"
    },
    { word: "meeting", entryType: "headword", status: "", difficulty: "中级核心" }
  ];

  assert.equal(resolveInflectedReferenceIndex(pool, 1), 0);
  assert.deepEqual(
    buildFilteredWordIndices(pool, { type: "everything", value: "" }, "conducted"),
    [0]
  );
  assert.deepEqual(
    buildStudyWordIndices(pool, { type: "everything", value: "" }),
    [0, 2]
  );
});

test("old saved sessions on an inflected form restore and persist the base word", () => {
  const words = [
    { word: "conduct", entryType: "headword", status: "" },
    {
      word: "conducted",
      entryType: "inflected-form",
      studyMode: "reference",
      baseWord: "conduct",
      redirectToWord: "conduct",
      relationType: "past_or_participle",
      status: ""
    }
  ];

  const restored = resolveWordStudyIndex(words, {
    session: { wordKey: "conducted", index: 1, filter: { type: "everything", value: "" } },
    entryPositions: {},
    filter: { type: "everything", value: "" },
    wordMatchesFilter,
    filterKey,
    normalizeWord
  });
  assert.equal(restored.index, 0);
  assert.equal(restored.reason, "inflectedFormRedirect");

  const store = new Map();
  const persisted = persistWordFlashSession({
    words,
    index: 1,
    filter: { type: "everything", value: "" },
    entryPositions: {},
    filterKey,
    normalizeWord,
    storageSet: (key, value) => {
      store.set(key, value);
      return true;
    }
  });
  assert.equal(persisted.session.index, 0);
  assert.equal(persisted.session.wordKey, "conduct");
});

test("lexicalized -ing words remain independent brush cards", () => {
  const meeting = { word: "meeting", entryType: "headword", studyMode: "", status: "" };
  assert.equal(isInflectedReferenceWord(meeting), false);
  assert.equal(isBrushableWord(meeting), true);
  assert.equal(wordMatchesFilter(meeting, { type: "everything", value: "" }), true);
});
