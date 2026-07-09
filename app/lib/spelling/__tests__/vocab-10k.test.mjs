import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import {
  IELTS_GT_10K_CATEGORIES,
  analyzeIeltsGt10kVocabulary,
  buildIeltsGt10kPlan
} from "../../vocab/ielts-gt-10k-plan.mjs";

test("10k vocabulary plan defines required categories with targets and examples", () => {
  const plan = buildIeltsGt10kPlan();

  assert.equal(plan.targetHeadwordCount, 10_000);
  assert.equal(plan.categories.length, IELTS_GT_10K_CATEGORIES.length);
  assert.equal(plan.categories.reduce((sum, item) => sum + item.targetCount, 0), 10_000);
  assert.ok(plan.categories.every((item) => item.examples.length === 20));
});

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const wordsFile = path.join(projectRoot, ".static-export-cache", "words.json");

test("current words.json can be analyzed without mutation under strict 10k rules", () => {
  const raw = fs.readFileSync(wordsFile, "utf8");
  const before = raw;
  const wordsJson = JSON.parse(raw);
  const report = analyzeIeltsGt10kVocabulary(wordsJson);
  const expectedCount = Number(wordsJson?.count || report.rawCount || 0);
  const actualUniqueHeadwords = new Set(
    wordsJson.words.map((entry) => String(entry.word || "").trim().toLowerCase())
  );

  assert.equal(report.targetHeadwordCount, 10_000);
  assert.equal(report.rawCount, expectedCount);
  assert.equal(actualUniqueHeadwords.size, expectedCount);
  assert.equal(report.validHeadwordCount, expectedCount - report.invalidCount);
  assert.ok(report.invalidSamples.some((entry) => entry.word === "one"));
  assert.ok(report.invalidSamples.some((entry) => entry.word === "two"));
  assert.ok(report.invalidSamples.some((entry) => entry.word === "three"));
  assert.ok(report.invalidSamples.every((entry) => entry.reason === "not_strict_headword"));
  assert.ok(expectedCount >= 10_500);
  assert.equal(report.gapToTarget, 0);
  assert.ok(report.categories.every((item) => typeof item.currentCount === "number"));
  assert.equal(fs.readFileSync(wordsFile, "utf8"), before);
});
