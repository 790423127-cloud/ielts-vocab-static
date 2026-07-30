import assert from "node:assert/strict";
import test from "node:test";
import {
  STUDY_MEANING_VISIBILITY_KEY,
  readStudyMeaningsHidden,
  writeStudyMeaningsHidden
} from "../study-meaning-visibility.mjs";

test("meaning visibility uses one shared browser preference across learning pages", () => {
  const values = new Map();
  const get = (key) => values.get(key) ?? null;
  const set = (key, value) => values.set(key, value);

  assert.equal(readStudyMeaningsHidden(get), false);
  assert.equal(writeStudyMeaningsHidden(true, set), true);
  assert.equal(values.get(STUDY_MEANING_VISIBILITY_KEY), "1");
  assert.equal(readStudyMeaningsHidden(get), true);

  assert.equal(writeStudyMeaningsHidden(false, set), true);
  assert.equal(readStudyMeaningsHidden(get), false);
});

test("storage failures keep learning pages usable", () => {
  assert.equal(readStudyMeaningsHidden(() => {
    throw new Error("blocked");
  }), false);
  assert.equal(writeStudyMeaningsHidden(true, () => {
    throw new Error("blocked");
  }), false);
});
