import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeReadingGKey } from "../normalize.mjs";
import { getReadingGPathStage } from "../stages.mjs";
import { getRgFilterLabel, RG_LEARNING_ENTRIES } from "../storage.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const vocab = JSON.parse(
  fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"), "utf8")
);
const source = JSON.parse(
  fs.readFileSync(path.join(root, "scripts/data/reading-g-part12-phrases-150.json"), "utf8")
);
const layerId = "gtPart12Phrases150";
const layerItems = vocab.items.filter((item) => (item.layers || []).includes(layerId));
const byKey = new Map(vocab.items.map((item) => [
  `${item.entryType || "word"}::${normalizeReadingGKey(item.word)}`,
  item
]));

test("Part1-2 source keeps 150 unique reviewed phrases and the declared 75/40/35 tiers", () => {
  assert.equal(source.count, 150);
  assert.equal(source.rows.length, 150);
  assert.equal(new Set(source.rows.map((row) => normalizeReadingGKey(row.phrase))).size, 150);
  assert.deepEqual(source.tierCounts, { S: 75, A: 40, B: 35 });
});

test("Part1-2 import represents all source rows without duplicate flashcards", () => {
  assert.equal(layerItems.length, 150);
  const mergeKeys = vocab.items.map((item) => (
    `${item.entryType || "word"}::${normalizeReadingGKey(item.word)}`
  ));
  assert.equal(new Set(mergeKeys).size, mergeKeys.length);
  for (const row of source.rows) {
    const sourceKey = normalizeReadingGKey(row.phrase);
    const item = layerItems.find((entry) => (
      (entry.acceptedAnswers || []).some((answer) => normalizeReadingGKey(answer) === sourceKey)
    ));
    assert.ok(item, `unrepresented source phrase: ${row.phrase}`);
  }
});

test("101 new Part1-2 cards contain real manual teaching content", () => {
  const created = layerItems.filter((item) => (
    (item.qualityFlags || []).includes("manual_editorial_phrase_content_v1")
  ));
  assert.equal(created.length, 101);
  for (const item of created) {
    assert.match(item.phonetic, /^\/[^/]+\/$/, `${item.word}: phonetic`);
    assert.ok(item.primaryPos, `${item.word}: primaryPos`);
    assert.match(item.primaryMeaningZh, /[\u3400-\u9fff]/u, `${item.word}: meaning`);
    assert.match(item.example, /[A-Za-z]/u, `${item.word}: example`);
    assert.match(item.exampleCn, /[\u3400-\u9fff]/u, `${item.word}: exampleCn`);
    assert.ok((item.meaningDetailZh.match(/[\u3400-\u9fff]/gu) || []).length >= 12, `${item.word}: detail`);
    assert.doesNotMatch(item.meaningDetailZh, /^(?:在当前例句中|当前例句中|在本句中)/u, `${item.word}: context-only detail`);
  }
});

test("all 150 represented cards have complete visible phrase teaching fields", () => {
  for (const item of layerItems) {
    assert.ok(item.phonetic, `${item.word}: phonetic`);
    assert.doesNotMatch(item.primaryPos || item.pos, /^(?:phrase|connector\/expression)$/iu, `${item.word}: generic pos`);
    assert.match(item.primaryMeaningZh, /[\u3400-\u9fff]/u, `${item.word}: meaning`);
    assert.match(item.meaningDetailZh, /[\u3400-\u9fff]/u, `${item.word}: detail`);
    assert.match(item.example, /[A-Za-z]/u, `${item.word}: example`);
    assert.match(item.exampleCn || item.exampleZh, /[\u3400-\u9fff]/u, `${item.word}: exampleCn`);
  }
});

test("dynamic learning menu exposes the dedicated 150-phrase filter", () => {
  const entry = RG_LEARNING_ENTRIES
    .flatMap((group) => group.items)
    .find((candidate) => candidate.filter?.type === "layer" && candidate.filter?.value === layerId);
  assert.ok(entry);
  assert.equal(entry.title, "G4-G21 Part1-2考试短语150");
  assert.equal(getRgFilterLabel(entry.filter), entry.title);
  assert.equal(layerItems.length, 150);
});

test("source priority controls new-card stages while existing cards keep stronger established placement", () => {
  assert.equal(getReadingGPathStage(byKey.get("phrase::active travel")).stage, "1");
  assert.equal(getReadingGPathStage(byKey.get("phrase::get in touch")).stage, "2");
  assert.equal(getReadingGPathStage(byKey.get("phrase::bank holidays")).stage, "2");
  assert.equal(getReadingGPathStage(byKey.get("phrase::annual leave")).stage, "1");
  assert.equal(getReadingGPathStage(byKey.get("phrase::look into")).stage, "2");
});

test("reference and retirement cases are restored explicitly without changing stable ids", () => {
  const takeOver = byKey.get("phrase::take over");
  assert.ok(takeOver);
  assert.equal(takeOver.id, "rg_phrase_take_over");
  assert.equal(takeOver.studyMode, "active");
  assert.equal(takeOver.promotedFromReferenceBy, "reading-g-part12-phrases-150-v1");

  const healthAndSafety = byKey.get("phrase::health and safety");
  assert.ok(healthAndSafety);
  assert.equal(healthAndSafety.restoredFromRetirementBy, "reading-g-part12-phrases-150-v1");
});

test("grammar and formatting variants reuse their canonical cards", () => {
  const mappings = [
    ["first-come first-served", "first come first served"],
    ["eligible for", "be eligible for"],
    ["likely to", "be likely to"],
    ["required to", "be required to"],
    ["allowed to", "be allowed to"],
    ["involved in", "be involved in"],
    ["sign up for", "sign up"]
  ];
  for (const [variant, canonical] of mappings) {
    assert.equal(byKey.has(`phrase::${variant}`), false, `${variant}: should not be independent`);
    const item = byKey.get(`phrase::${canonical}`);
    assert.ok(item, `${canonical}: missing canonical`);
    assert.ok(
      (item.acceptedAnswers || []).some((answer) => normalizeReadingGKey(answer) === variant),
      `${variant}: missing accepted form`
    );
  }
});
