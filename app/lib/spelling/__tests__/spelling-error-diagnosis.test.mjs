import test from "node:test";
import assert from "node:assert/strict";

import { diagnoseSpellingError, formatSpellingErrorDiagnosis } from "../spelling-error-diagnosis.mjs";

test("diagnoseSpellingError detects missing letters", () => {
  const result = diagnoseSpellingError("abandn", "abandon");
  assert.equal(result.isCorrect, false);
  assert.deepEqual(result.missingLetters, ["o"]);
  assert.match(result.summary, /缺字母/);
  assert.equal(result.submittedAnswer, "abandn");
  assert.equal(result.expectedAnswer, "abandon");
});

test("diagnoseSpellingError detects extra letters", () => {
  const result = diagnoseSpellingError("abandons", "abandon");
  assert.equal(result.isCorrect, false);
  assert.deepEqual(result.extraLetters, ["s"]);
  assert.match(result.summary, /多字母/);
});

test("diagnoseSpellingError detects adjacent transposition", () => {
  const result = diagnoseSpellingError("abnadon", "abandon");
  assert.equal(result.transposition, true);
  assert.equal(result.orderError, true);
  assert.match(result.summary, /顺序错误/);
});

test("diagnoseSpellingError reports correct answers", () => {
  const result = diagnoseSpellingError("abandon", "abandon");
  assert.equal(result.isCorrect, true);
  assert.equal(formatSpellingErrorDiagnosis(result), "");
});

test("diagnoseSpellingError detects split-input mistakes for short words", () => {
  const split = diagnoseSpellingError("a h", "ah");
  assert.equal(split.isCorrect, false);
  assert.match(split.summary, /不应拆开输入/);

  const joined = diagnoseSpellingError("ah", "a h");
  assert.equal(joined.isCorrect, false);
  assert.match(joined.summary, /缺少连写/);
});

test("diagnoseSpellingError detects short-word transposition", () => {
  const result = diagnoseSpellingError("ha", "ah");
  assert.equal(result.transposition, true);
  assert.match(result.summary, /顺序错误/);
});

test("diagnoseSpellingError avoids misleading prefix confusion hints", () => {
  const result = diagnoseSpellingError("aha", "ah");
  assert.equal(result.isCorrect, false);
  assert.match(result.summary, /多写了字母或音节/);
  assert.doesNotMatch(result.summary, /缺字母：a/);
});

test("diagnosis compares against the closest accepted spelling variant", () => {
  const result = diagnoseSpellingError("organis", "organize", ["organise"]);
  assert.equal(result.expectedAnswer, "organise");
  assert.deepEqual(result.missingLetters, ["e"]);
  assert.match(result.summary, /缺字母：e/);
});

test("diagnosis labels missing punctuation as a symbol instead of a letter", () => {
  const result = diagnoseSpellingError("parttime", "part-time");
  assert.match(result.summary, /缺少符号：-/);
  assert.doesNotMatch(result.summary, /缺字母：-/);
});

test("diagnosis detects non-adjacent letter reordering", () => {
  const result = diagnoseSpellingError("aelb", "able");
  assert.equal(result.orderError, true);
  assert.equal(result.generalLetterOrderIssue, true);
  assert.match(result.summary, /^字母顺序错误$/);
});
