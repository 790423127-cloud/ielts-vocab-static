import test from "node:test";
import assert from "node:assert/strict";

import { normalizeSpellingEntry } from "../normalize-spelling-entry.mjs";
import {
  formatExampleForPrompt,
  getSpellingPromptView,
  getSpellingTypeLabel,
  isPhoneticPendingReview,
  maskTargetWordInExample
} from "../spelling-display.mjs";

test("phrase prompt uses friendly type label instead of raw pos", () => {
  const current = normalizeSpellingEntry({
    word: "opposite the bank",
    pos: "phrase",
    meaning: "银行对面",
    entryType: "phrase",
    isPhrase: true
  });

  const prompt = getSpellingPromptView(current);

  assert.equal(getSpellingTypeLabel(current), "短语");
  assert.equal(prompt.typeLabel, "短语");
  assert.equal(prompt.meaning, "银行对面");
  assert.equal(prompt.charCount, "opposite the bank".length);
  assert.notEqual(prompt.typeLabel, "phrase");
});

test("prompt rejects a headword echoed as its meaning and exposes missing phonetics", () => {
  const prompt = getSpellingPromptView({
    expectedAnswer: "exclusively",
    meaning: "exclusively",
    sourceWord: {
      word: "exclusively",
      meaning: "exclusively",
      definition: "only; without others"
    }
  });

  assert.equal(prompt.meaning, "only; without others");
  assert.equal(prompt.phonetic, "");
  assert.equal(prompt.phoneticMissing, true);
});

test("prompt hides unverified phonetics and editorial examples", () => {
  const current = normalizeSpellingEntry({
    word: "instalment",
    meaning: "分期付款的一期",
    phonetic: "/legacy/",
    phoneticStatus: "pending_review",
    example: "Legacy example",
    exampleCn: "旧例句",
    exampleStatus: "needs_editorial_example"
  });
  const prompt = getSpellingPromptView(current);

  assert.equal(prompt.phonetic, "");
  assert.equal(prompt.phoneticPendingReview, true);
  assert.equal(prompt.example, "");
  assert.equal(prompt.exampleCn, "");
  assert.equal(prompt.examplePendingReview, true);
});

test("all unverified phonetic sources stay hidden pending review", () => {
  assert.equal(isPhoneticPendingReview({ phoneticStatus: "legacy_unverified" }), true);
  assert.equal(isPhoneticPendingReview({ phoneticStatus: "editorial_curated", pronunciationVerified: false }), true);
  assert.equal(isPhoneticPendingReview({ phoneticStatus: "dictionary_verified" }), false);
  assert.equal(isPhoneticPendingReview({ phoneticStatus: "verified_cmudict_us" }), false);
  assert.equal(isPhoneticPendingReview({ phoneticStatus: "deepseek_verified" }), false);
});

test("formatExampleForPrompt masks only the target word", () => {
  const masked = formatExampleForPrompt("There is a vacancy for a receptionist.", {
    targetWord: "vacancy"
  });
  assert.equal(masked, "There is a _______ for a receptionist.");
});

test("maskTargetWordInExample masks capitalized target at sentence start", () => {
  const masked = maskTargetWordInExample("Vacancy notices are posted online.", {
    targetWord: "vacancy"
  });
  assert.equal(masked, "_______ notices are posted online.");
});

test("maskTargetWordInExample shows full sentence when target is missing", () => {
  const example = "The office opens at nine.";
  const masked = maskTargetWordInExample(example, { targetWord: "vacancy" });
  assert.equal(masked, example);
});

test("maskTargetWordInExample shows full sentence when target is empty", () => {
  const example = "There is a vacancy for a receptionist.";
  const masked = maskTargetWordInExample(example, { targetWord: "" });
  assert.equal(masked, example);
});

test("maskTargetWordInExample preserves punctuation", () => {
  const masked = maskTargetWordInExample("Is there a vacancy, or not?", {
    targetWord: "vacancy"
  });
  assert.equal(masked, "Is there a _______, or not?");
});

test("formatExampleForPrompt no longer masks every English word", () => {
  const masked = formatExampleForPrompt("The post office is opposite the bank.", {
    targetWord: "bank"
  });
  assert.equal(masked, "The post office is opposite the ____.");
});

test("formatExampleForPrompt masks common inflected forms", () => {
  assert.equal(
    formatExampleForPrompt("Each plan has its own merits.", { targetWord: "merit" }),
    "Each plan has its own ______."
  );
  assert.equal(
    formatExampleForPrompt("Exercise stimulates blood circulation.", { targetWord: "stimulate" }),
    "Exercise __________ blood circulation."
  );
  assert.equal(
    formatExampleForPrompt("Politicians should serve the public.", { targetWord: "politician" }),
    "___________ should serve the public."
  );
});

test("formatExampleForPrompt hides examples that would leak the answer", () => {
  const masked = formatExampleForPrompt("The office opens at nine.", { targetWord: "vacancy" });
  assert.equal(masked, "The office opens at nine.");

  const leaked = formatExampleForPrompt("There is a vacancy for a receptionist.", { targetWord: "vacancy" });
  assert.equal(leaked, "There is a _______ for a receptionist.");
});

test("formatExampleForPrompt hides examples when the answer is embedded in another word", () => {
  assert.equal(
    formatExampleForPrompt("The law was declared unconstitutional.", { targetWord: "constitutional" }),
    ""
  );
  assert.equal(
    formatExampleForPrompt("He injured his foot while playing football.", { targetWord: "foot" }),
    ""
  );
});
