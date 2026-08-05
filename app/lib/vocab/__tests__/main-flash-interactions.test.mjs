import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveFilterSwitchIndex } from "../study-session.mjs";
import { resolveWordStudyIndex } from "../word-flashcard-session.mjs";
import { resolveWordCardSwipe } from "../word-flashcard-swipe.mjs";

const words = [
  { word: "alpha", difficulty: "A" },
  { word: "beta", difficulty: "B" }
];
const filterKey = (filter) => `${filter.type}:${filter.value || ""}`;
const normalizeWord = (value) => String(value || "").trim().toLowerCase();
const wordMatchesFilter = (word, filter) => word.difficulty === filter.value;

test("manual category switch rejects a saved word outside the new category", () => {
  const filter = { type: "difficulty", value: "B" };
  const result = resolveFilterSwitchIndex(resolveWordStudyIndex, {
    words,
    entryPositions: { [filterKey(filter)]: "alpha" },
    filter,
    filterKey,
    wordMatchesFilter,
    normalizeWord,
    findFirstInFilter: () => 1
  });

  assert.equal(result.index, 1);
  assert.equal(result.reason, "filterFirst");
});

test("manual category switch restores a saved word only when it belongs to the category", () => {
  const filter = { type: "difficulty", value: "B" };
  const result = resolveFilterSwitchIndex(resolveWordStudyIndex, {
    words,
    entryPositions: { [filterKey(filter)]: "beta" },
    filter,
    filterKey,
    wordMatchesFilter,
    normalizeWord,
    findFirstInFilter: () => 1
  });

  assert.equal(result.index, 1);
  assert.equal(result.reason, "entryPosition");
});

test("word card swipe distinguishes horizontal navigation from vertical scrolling", () => {
  assert.equal(resolveWordCardSwipe({ startX: 200, startY: 100, endX: 120, endY: 110 }), "next");
  assert.equal(resolveWordCardSwipe({ startX: 100, startY: 100, endX: 180, endY: 110 }), "previous");
  assert.equal(resolveWordCardSwipe({ startX: 100, startY: 100, endX: 115, endY: 190 }), "");
  assert.equal(resolveWordCardSwipe({ startX: 100, startY: 100, endX: 135, endY: 105 }), "");
});

test("root layout mounts mobile swipe support and range selections close their menu", () => {
  const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const layoutSource = fs.readFileSync(path.join(appRoot, "layout.jsx"), "utf8");
  const controllerSource = fs.readFileSync(path.join(appRoot, "components/MobileWordCardSwipeController.jsx"), "utf8");
  const wordFlashcardSource = fs.readFileSync(path.join(appRoot, "components/WordFlashcardView.jsx"), "utf8");
  const satelliteSource = fs.readFileSync(path.join(appRoot, "components/SatelliteLexiconFlashcard.jsx"), "utf8");

  assert.match(layoutSource, /<MobileWordCardSwipeController \/>/);
  assert.match(controllerSource, /touch-action: pan-y/);
  assert.match(controllerSource, /new CustomEvent\(WORD_CARD_SWIPE_EVENT/);
  assert.match(wordFlashcardSource, /window\.addEventListener\(WORD_CARD_SWIPE_EVENT, handleWordCardSwipe\)/);
  assert.match(satelliteSource, /window\.addEventListener\(WORD_CARD_SWIPE_EVENT, handleWordCardSwipe\)/);
  assert.match(controllerSource, /\.word-study-menu \.entry-btn/);
  assert.match(controllerSource, /menu\.open = false/);
});
