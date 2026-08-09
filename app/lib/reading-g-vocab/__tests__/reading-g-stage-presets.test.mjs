import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { countPhraseStages, countStageUniques, itemMatchesPathStage } from "../stages.mjs";
import { buildRgStudyList } from "../storage.mjs";
import { normalizeReadingGItem } from "../load-reading-g.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const vocabPath = path.join(root, "public/data/reading-g-vocab.json");

function loadItems() {
  const data = JSON.parse(fs.readFileSync(vocabPath, "utf8"));
  return (data.items || []).map((e, i) => normalizeReadingGItem(e, i)).filter(Boolean);
}

test("phrases400 count stays 400; stage 1/2 = 200/200", () => {
  const items = loadItems();
  const c = countPhraseStages(items);
  assert.equal(c.phrases400Count, 400);
  assert.equal(c.phraseStage1Count, 200);
  assert.equal(c.phraseStage2Count, 200);
});

test("stage1 uses front 200 phrases only", () => {
  const items = loadItems();
  // phraseStudyStage split is exactly 200/200 on phrases400 layer
  const s1 = items.filter(
    (it) => (it.layers || []).includes("phrases400") && Number(it.phraseStudyStage) === 1
  );
  const s2 = items.filter(
    (it) => (it.layers || []).includes("phrases400") && Number(it.phraseStudyStage) === 2
  );
  assert.equal(s1.length, 200);
  assert.equal(s2.length, 200);
  // path stage1 must include all stage-1 phrases
  for (const p of s1) {
    assert.equal(itemMatchesPathStage(p, "1"), true);
  }
  // stage-2-only phrases (no other stage1 word layers) must not enter stage1 solely via phrases400
  for (const p of s2) {
    const layers = p.layers || [];
    const hasOtherS1 =
      layers.includes("priority1500") ||
      layers.includes("answerCore250") ||
      layers.includes("logic120");
    if (!hasOtherS1) {
      assert.equal(itemMatchesPathStage(p, "1"), false);
      assert.equal(itemMatchesPathStage(p, "2"), true);
    }
  }
});

test("stage4 is reference-only consult; not default active queue", () => {
  const items = loadItems();
  const s4 = items.filter((it) => itemMatchesPathStage(it, "4"));
  assert.ok(s4.length > 0);
  for (const it of s4) {
    assert.equal(it.studyMode, "reference");
  }
  // default active filter must not include pure reference-only
  const active = buildRgStudyList(items, { type: "active", value: "" }, {});
  for (const row of active) {
    assert.notEqual(row.entry.studyMode, "reference");
  }
});

test("stage route partitions the whole dataset without overlap", () => {
  const items = loadItems();
  const u = countStageUniques(items);
  assert.ok(u.stage1 > 1000);
  assert.ok(u.stage2 > 500);
  assert.ok(u.stage3 > 500);
  assert.ok(u.stage4 > 100);

  const stageHits = items.map((item) =>
    ["1", "2", "3", "4"].filter((stage) => itemMatchesPathStage(item, stage))
  );
  assert.ok(stageHits.every((hits) => hits.length === 1));
  assert.equal(u.stage1 + u.stage2 + u.stage3 + u.stage4, items.length);
});

test("reading stages use reading difficulty and article evidence instead of source order", () => {
  const base = {
    entryType: "word",
    studyMode: "active",
    normalizedKey: "stage-test",
    layers: []
  };
  const readingCore = {
    ...base,
    word: "core",
    difficulty: "中级核心",
    layers: ["priority1500", "questionBankActive"]
  };
  const coverage = {
    ...base,
    word: "coverage",
    difficulty: "中级核心",
    layers: ["tierB1200"]
  };
  const articleTarget = {
    ...base,
    word: "target",
    difficulty: "中级核心",
    layers: ["questionBankActive"]
  };
  const advanced = {
    ...base,
    word: "advanced",
    difficulty: "高级加分",
    layers: ["priority1500"]
  };
  const basic = {
    ...base,
    word: "basic",
    difficulty: "基础高频",
    layers: ["questionBankActive"]
  };
  const reference = {
    ...base,
    word: "reference",
    difficulty: "中级核心",
    studyMode: "reference",
    layers: ["priority1500"]
  };

  assert.equal(itemMatchesPathStage(readingCore, "1"), true);
  assert.equal(itemMatchesPathStage(coverage, "2"), true);
  assert.equal(itemMatchesPathStage(articleTarget, "3"), true);
  assert.equal(itemMatchesPathStage(advanced, "3"), true);
  assert.equal(itemMatchesPathStage(basic, "1"), true);
  assert.equal(itemMatchesPathStage(reference, "4"), true);
});

test("a reading core layer does not override advanced difficulty", () => {
  const item = {
    word: "advanced-overlap",
    entryType: "word",
    studyMode: "active",
    normalizedKey: "advanced-overlap",
    difficulty: "高级加分",
    layers: ["priority1500", "tierB1200", "tierC800", "questionBankActive"]
  };

  assert.equal(itemMatchesPathStage(item, "1"), false);
  assert.equal(itemMatchesPathStage(item, "2"), false);
  assert.equal(itemMatchesPathStage(item, "3"), true);
  assert.equal(itemMatchesPathStage(item, "4"), false);
});
