import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildBatchNavigationWordIds,
  findCurrentBatchNavigationIndex,
  isSpellingWordNavigationBlocked,
  normalizeCircularBatchIndex,
  resolveSpellingWordKey
} from "../../../hooks/useSpellingTrainingSessionNavigation.js";

test("navigation helpers normalize circular movement and block only active input judgment", () => {
  assert.equal(normalizeCircularBatchIndex(-1, 3), 2);
  assert.equal(normalizeCircularBatchIndex(3, 3), 0);
  assert.equal(normalizeCircularBatchIndex(0, 0), -1);
  assert.equal(isSpellingWordNavigationBlocked({ uiState: "inputting" }), true);
  assert.equal(isSpellingWordNavigationBlocked({ uiState: "show_question" }), false);
});

test("personal wrong navigation uses one stable representative per writing unit", () => {
  const personalWrongNavigationUnits = [
    { writeWordIds: ["write-a", "write-a-plural"] },
    { writeWordIds: ["write-b"] }
  ];

  assert.deepEqual(buildBatchNavigationWordIds({
    batchWordIds: ["engine-a", "engine-b", "engine-c"],
    personalWrongNavigationUnits
  }), ["write-a", "write-b"]);
});

test("current navigation index falls back to normalized answer when ids differ", () => {
  const spellingEntries = [
    { wordId: "entry-a", expectedAnswer: "Alpha" },
    { wordId: "entry-b", expectedAnswer: "Beta" }
  ];

  assert.equal(resolveSpellingWordKey({ wordId: "entry-a", expectedAnswer: "Alpha" }), "entry-a");
  assert.equal(findCurrentBatchNavigationIndex({
    current: { wordId: "runtime-b", expectedAnswer: " beta " },
    batchNavigationWordIds: ["entry-a", "entry-b"],
    personalWrongNavigationUnits: [],
    spellingEntries
  }), 1);
});

test("spelling page delegates batch navigation coordination to the session hook", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const page = fs.readFileSync(path.join(root, "app/components/SpellingTrainingPage.jsx"), "utf8");
  const hook = fs.readFileSync(path.join(root, "app/hooks/useSpellingTrainingSessionNavigation.js"), "utf8");

  assert.match(page, /useSpellingTrainingSessionNavigation\(\{/);
  assert.doesNotMatch(page, /const navigateToBatchWord = useCallback/);
  assert.doesNotMatch(page, /const handleGoToPreviousWord = useCallback/);
  assert.doesNotMatch(page, /const handleGoToNextWord = useCallback/);
  assert.match(hook, /writeSpellingPosition\(scope, \{/);
  assert.match(hook, /resolvePersonalWrongNavigationWordId/);
  assert.match(hook, /restoredPositionBatchRef\.current = ""/);
});
