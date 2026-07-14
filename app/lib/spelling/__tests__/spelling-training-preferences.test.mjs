import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCategoryPrefsPatch,
  applyIdictationPrefsPatch,
  applyStoredPrefsPatch,
  normalizeSpellingUxPrefs
} from "../../../hooks/useSpellingTrainingPreferences.js";

test("spelling UX preferences preserve product defaults", () => {
  assert.deepEqual(normalizeSpellingUxPrefs({}), {
    turboMode: false,
    autoNextOnCorrect: true,
    listenOnlyMode: false,
    showMeaning: true,
    showExample: false,
    statsSidebarOpen: false,
    soundEffectsEnabled: true
  });
});

test("stored and category patches keep the spelling preference schema", () => {
  const base = applyStoredPrefsPatch({}, { practiceSource: "category" }, "word");
  const patched = applyCategoryPrefsPatch(base, { categoryType: "difficulty", categoryValue: "中级核心", batchIndex: 2 }, "word");

  assert.equal(patched.practiceSource, "category");
  assert.equal(patched.category.categoryType, "difficulty");
  assert.equal(patched.category.categoryValue, "中级核心");
  assert.equal(patched.category.batchIndex, 2);
});

test("idictation patches stay isolated by source", () => {
  const listening = applyIdictationPrefsPatch({}, "listening", {
    groupKey: "chapter-1",
    batchIndex: 1
  });
  const reading = applyIdictationPrefsPatch(listening, "reading", {
    groupKey: "chapter-2",
    batchIndex: 2
  });

  assert.equal(reading.idictation.listening.groupKey, "chapter-1");
  assert.equal(reading.idictation.reading.groupKey, "chapter-2");
});
