import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditSemanticVocabulary, isGenericMeaningDetail, normalizeText } from "../../../../scripts/lib/vocab-semantic-quality-v1.mjs";
import { applySemanticQualityV2 } from "../../../../scripts/apply-vocab-semantic-quality-v2.mjs";
import { getWordNetDefinition } from "../../../../scripts/lib/wordnet-definition-source.mjs";
import { wordMatchesFilter } from "../word-flashcard-study-pool.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CACHE = path.join(ROOT, ".static-export-cache", "words.json");
const PUBLIC = path.join(ROOT, "public", "data", "words.json");

function payload() {
  return JSON.parse(fs.readFileSync(CACHE, "utf8"));
}

test("WordNet adapter returns POS-aware offline definitions", () => {
  assert.match(getWordNetDefinition("account", "noun"), /record|business|bank|statement|arrangement/i);
  assert.match(getWordNetDefinition("mitigation", "noun"), /lessening|moderating|serious/i);
});

test("semantic quality V2 leaves no P0, P1, P2 or unresolved example relation", () => {
  const audit = auditSemanticVocabulary(payload());
  assert.equal(audit.summary.priorityCounts.P0, 0);
  assert.equal(audit.summary.priorityCounts.P1, 0);
  assert.equal(audit.summary.priorityCounts.P2, 0);
  assert.equal(audit.summary.targetAbsentAfterMorphology, 0);
  assert.equal(audit.summary.categoryCounts.controlled_template_example, 114);
});

test("semantic quality V2 uses real English definitions or structured Chinese fallback", () => {
  const words = payload().words;
  const english = words.filter((entry) => /[A-Za-z]{3}/.test(entry.definition || "") && !/[\u3400-\u9fff]/u.test(entry.definition || ""));
  const fallback = words.filter((entry) => entry.definitionSource === "legacy-chinese-fallback");
  assert.equal(english.length, 11778);
  assert.equal(fallback.length, 1979);
  assert.equal(fallback.every((entry) => entry.meaningsZh?.some((sense) => sense.confidence === "high")), true);
  assert.equal(words.some((entry) => entry.meaningDetailZh && isGenericMeaningDetail({ ...entry, meaningDetailedZh: "" })), false);
  assert.equal(words.some((entry) => normalizeText(entry.meaningDetailedZh) === normalizeText(entry.meaning) && entry.meaningDetailedZh), false);
});

test("semantic quality V2 is idempotent and preserves progress fields", () => {
  const report = applySemanticQualityV2({ apply: false });
  assert.equal(report.definitionRepairs.length, 0);
  assert.equal(report.structuredMeaningEntries.length, 0);
  assert.equal(report.quizSenseEntries.length, 0);
  assert.equal(report.removedGenericDetails.length, 0);
  assert.equal(report.removedCopiedDetails.length, 0);
  assert.equal(report.exampleRepairs.length, 0);
  assert.equal(report.relationForms.length, 0);
  assert.equal(report.referenceAliases.length, 0);
  assert.equal(report.progressChanges, 0);
  assert.deepEqual(report.errors, []);
});

test("reference aliases stay searchable but do not enter the default study queue", () => {
  const words = payload().words;
  for (const word of ["leed", "explosife", "lable", "mahy"]) {
    const entry = words.find((candidate) => candidate.word === word);
    assert.equal(entry.studyMode, "reference", word);
    assert.equal(wordMatchesFilter(entry, { type: "all", value: "" }), false, word);
    assert.equal(wordMatchesFilter(entry, { type: "everything", value: "" }), true, word);
  }
});

test("cache and public vocabulary stay byte-identical", () => {
  assert.equal(fs.readFileSync(CACHE, "utf8"), fs.readFileSync(PUBLIC, "utf8"));
});
