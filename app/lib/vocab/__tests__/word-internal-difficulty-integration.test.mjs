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
  wordInternalDifficultySortKey
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
    const sortKeys = easyToHard.map((index) => wordInternalDifficultySortKey(words[index]));
    assert.ok(sortKeys.every((sortKey, index) => index === 0 || sortKeys[index - 1] <= sortKey));
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

test("word-order controls release focus and focused toolbar controls keep horizontal arrows", () => {
  const controls = fs.readFileSync(
    path.join(ROOT, "app", "components", "WordStudyOrderControls.jsx"),
    "utf8"
  );
  const navigation = fs.readFileSync(
    path.join(ROOT, "app", "hooks", "useWordFlashNavigation.js"),
    "utf8"
  );
  const staticExport = fs.readFileSync(
    path.join(ROOT, "app", "api", "export-static", "route.js"),
    "utf8"
  );
  const globalStyles = fs.readFileSync(path.join(ROOT, "app", "globals.css"), "utf8");

  assert.match(controls, /control\.blur\(\)/);
  assert.match(navigation, /getStudyKeyboardAction\(event\)/);
  assert.match(staticExport, /if\(isTyping\|\|e\.ctrlKey/);
  assert.match(staticExport, /completeToolbarSelectAction\(e\.target\)/);
  assert.match(staticExport, /document\.activeElement===control/);
  assert.match(globalStyles, /\.word-difficulty-select/);
  assert.match(globalStyles, /\.word-order-controls\s*\{[\s\S]*flex:\s*0 0 auto/);
});

test("an unloaded pool cannot erase a saved fixed-order snapshot and random is isolated", () => {
  const orderedRowsHook = fs.readFileSync(
    path.join(ROOT, "app", "hooks", "useOrderedStudyRows.js"),
    "utf8"
  );
  const mainPage = fs.readFileSync(path.join(ROOT, "app", "page.jsx"), "utf8");
  const readingGPage = fs.readFileSync(path.join(ROOT, "app", "reading-g", "page.jsx"), "utf8");
  const staticReadingG = fs.readFileSync(path.join(ROOT, "public", "assets", "reading-g.js"), "utf8");
  const staticExport = fs.readFileSync(
    path.join(ROOT, "app", "api", "export-static", "route.js"),
    "utf8"
  );

  assert.match(
    orderedRowsHook,
    /baseIndices\.length\s*===\s*0[\s\S]*!isFixedWordStudyOrderMode/
  );
  assert.match(orderedRowsHook, /cursorIndex:\s*reconciled\?\.cursorIndex\s*\?\?\s*null/);
  assert.match(readingGPage, /wordOrdering\.cursorIndex/);
  assert.match(readingGPage, /focusedId[\s\S]*studyList\.some/);
  assert.match(staticReadingG, /function saveSession\(\)/);
  assert.match(staticReadingG, /function restoreSession\(\)/);
  assert.match(
    mainPage,
    /!baseStudyWordIndices\.length[\s\S]*!isFixedWordStudyOrderMode/
  );
  assert.doesNotMatch(
    mainPage,
    /setWordOrderMode\(nextMode,\s*\{\s*seed\s*\}\);[\s\S]*setWordDifficultyMode\(WORD_STUDY_DIFFICULTY_MODE\.DEFAULT\)/
  );
  assert.doesNotMatch(
    orderedRowsHook,
    /setMode\(nextMode,\s*\{\s*seed:\s*nextSeed\s*\}\);[\s\S]*setDifficultyMode\(WORD_STUDY_DIFFICULTY_MODE\.DEFAULT\)/
  );
  assert.match(
    staticExport,
    /saveWordOrderPreference\(filter,nextMode,previous\.difficultyMode,\{seed:seed\}\)/
  );
});
