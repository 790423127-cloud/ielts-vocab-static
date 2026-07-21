import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyMorphologyCleanup } from "../../../../scripts/apply-vocab-morphology-v1.mjs";
import { wordMatchesFilter } from "../word-flashcard-study-pool.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CACHE = path.join(ROOT, ".static-export-cache", "words.json");
const AUDIT = path.join(ROOT, "data", "vocab-morphology", "audit");

test("morphology audit has the reviewed five-way classification", () => {
  const report = applyMorphologyCleanup({ sourcePath: CACHE, auditPath: AUDIT, apply: false, writePaths: [], baselinePath: null });
  assert.equal(report.totalWords, 13757);
  assert.equal(report.auditRows, 2135);
  assert.deepEqual(report.actionCounts, {
    MANUAL_REVIEW_AMBIGUOUS: 714,
    KEEP_LEXICALIZED_LINK_FAMILY: 452,
    HIGH_CONFIDENCE_REVIEW_MERGE: 722,
    SAFE_FORM_MERGE: 170,
    HYBRID_FORM_KEEP_SENSE: 77
  });
  assert.equal(report.safeFormEntries.length, 170);
  assert.equal(report.hybridEntries.length, 77);
  assert.equal(report.lexicalizedEntries.length, 452);
  assert.equal(report.progressChanges, 0);
  assert.equal(report.idChanges, 0);
  assert.deepEqual(report.errors, []);
});

test("safe forms leave the default reading pool while search and independent senses remain", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vocab-morphology-"));
  const tempWords = path.join(dir, "words.json");
  fs.copyFileSync(CACHE, tempWords);

  const first = applyMorphologyCleanup({
    sourcePath: tempWords,
    auditPath: AUDIT,
    apply: true,
    writePaths: [tempWords],
    baselinePath: null
  });
  assert.deepEqual(first.errors, []);
  assert.equal(first.progressChanges, 0);
  assert.equal(first.idChanges, 0);

  const payload = JSON.parse(fs.readFileSync(tempWords, "utf8"));
  assert.equal(payload.words.length, 13757);
  const byWord = new Map(payload.words.map((entry) => [entry.word, entry]));

  const cried = byWord.get("cried");
  const cry = byWord.get("cry");
  assert.equal(cried.entryType, "inflected-form");
  assert.equal(cried.studyMode, "reference");
  assert.equal(cried.baseWord, "cry");
  assert.equal(cried.redirectToWord, "cry");
  assert.ok(cry.forms.some((form) => form.word === "cried" && form.sourceEntryId === cried.id));
  assert.equal(wordMatchesFilter(cried, { type: "all", value: "" }), false);
  assert.equal(wordMatchesFilter(cried, { type: "everything", value: "" }), true);

  const meeting = byWord.get("meeting");
  assert.notEqual(meeting.studyMode, "reference");
  assert.ok(meeting.wordFamily.some((item) => item.word === "meet" && item.relation === "derived-from-or-related-to"));

  const grown = byWord.get("grown");
  const grow = byWord.get("grow");
  assert.notEqual(grown.studyMode, "reference");
  assert.ok(grow.forms.some((form) => form.word === "grown" && form.sourceEntryId === grown.id));

  const second = applyMorphologyCleanup({
    sourcePath: tempWords,
    auditPath: AUDIT,
    apply: false,
    writePaths: [],
    baselinePath: null
  });
  assert.equal(second.changed, false);
  assert.equal(second.changedEntryIds.length, 0);
  assert.deepEqual(second.errors, []);
});
