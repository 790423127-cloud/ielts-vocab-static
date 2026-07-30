import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  orderStudyWordIndices
} from "../word-study-ordering.mjs";
import {
  WORD_STUDY_DIFFICULTY_MODE,
  wordInternalDifficultyScore
} from "../word-internal-difficulty.mjs";
import {
  LEARNING_ENTRIES
} from "../word-flashcard-study-pool.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const payload = JSON.parse(
  fs.readFileSync(path.join(ROOT, "public", "data", "words.json"), "utf8")
    .replace(/^\uFEFF/, "")
);
const words = Array.isArray(payload) ? payload : payload.words || [];
const brushableIndices = words
  .map((word, index) => ({ word, index }))
  .filter(({ word }) => !(word?.entryType === "inflected-form" && word?.studyMode === "reference"))
  .map(({ index }) => index);

test("every main lexicon level is split relatively without leaking words from another entry", () => {
  for (const difficulty of ["基础高频", "中级核心", "高级加分", "低频认识即可"]) {
    const indices = brushableIndices.filter((index) => words[index]?.difficulty === difficulty);
    assert.ok(indices.length >= 6, `${difficulty} should contain a usable study pool`);

    const easier = orderStudyWordIndices(indices, words, {
      difficultyMode: WORD_STUDY_DIFFICULTY_MODE.EASIER_ONLY
    });
    const standard = orderStudyWordIndices(indices, words, {
      difficultyMode: WORD_STUDY_DIFFICULTY_MODE.STANDARD_ONLY
    });
    const harder = orderStudyWordIndices(indices, words, {
      difficultyMode: WORD_STUDY_DIFFICULTY_MODE.HARDER_ONLY
    });
    const combined = [...easier, ...standard, ...harder];

    assert.equal(new Set(combined).size, indices.length);
    assert.ok(combined.every((index) => words[index]?.difficulty === difficulty));

    const easyToHard = orderStudyWordIndices(indices, words, {
      difficultyMode: WORD_STUDY_DIFFICULTY_MODE.EASY_TO_HARD
    });
    const scores = easyToHard.map((index) => wordInternalDifficultyScore(words[index]));
    assert.ok(scores.every((score, index) => index === 0 || scores[index - 1] <= score));
  }
});

test("entry menu is reorganized without changing the protected iDictation entrances", () => {
  assert.deepEqual(
    LEARNING_ENTRIES.map((group) => group.group),
    ["今日学习", "保留专项词库", "按使用场景", "主词库学习层级", "词库整理"]
  );
  const protectedTitles = LEARNING_ENTRIES
    .find((group) => group.group === "保留专项词库")
    ?.items.map((item) => item.title);
  assert.deepEqual(protectedTitles, ["爱听写听力", "爱听写阅读"]);
  assert.equal(
    LEARNING_ENTRIES.some((group) => group.group === "G类完整学习计划"),
    false
  );
});

test("538 and iDictation keep their original classification behavior", () => {
  const basicPage = fs.readFileSync(path.join(ROOT, "app", "basic", "page.jsx"), "utf8");
  const mainPage = fs.readFileSync(path.join(ROOT, "app", "page.jsx"), "utf8");

  assert.match(basicPage, /difficultyEnabled:\s*lexicon\s*!==\s*"ielts538"/);
  assert.match(mainPage, /wordOrderDifficultyEnabled\s*=\s*!idictationFlashSourceKey/);
});
