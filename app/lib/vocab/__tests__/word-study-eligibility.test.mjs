import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildFilteredWordIndices,
  buildStudyWordIndices,
  wordMatchesFilter
} from "../word-flashcard-study-pool.mjs";
import {
  isBrushableWord,
  isInflectedReferenceWord,
  resolveInflectedReferenceIndex
} from "../word-study-eligibility.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const payload = JSON.parse(fs.readFileSync(path.join(ROOT, ".static-export-cache", "words.json"), "utf8"));
const fullWords = Array.isArray(payload) ? payload : payload.words;

test("full lexicon exposes the real 13,587-word brushable total", () => {
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

test("lexicalized -ing words remain independent brush cards", () => {
  const meeting = { word: "meeting", entryType: "headword", studyMode: "", status: "" };
  assert.equal(isInflectedReferenceWord(meeting), false);
  assert.equal(isBrushableWord(meeting), true);
  assert.equal(wordMatchesFilter(meeting, { type: "everything", value: "" }), true);
});
