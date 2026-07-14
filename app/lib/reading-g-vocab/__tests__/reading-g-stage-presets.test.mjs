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
    assert.ok(it.studyMode === "reference" || (it.layers || []).includes("reference701"));
  }
  // default active filter must not include pure reference-only
  const active = buildRgStudyList(items, { type: "active", value: "" }, {});
  for (const row of active) {
    assert.notEqual(row.entry.studyMode, "reference");
  }
});

test("stage unique counts are positive and ordered sensibly", () => {
  const items = loadItems();
  const u = countStageUniques(items);
  assert.ok(u.stage1 > 1000);
  assert.ok(u.stage2 > 500);
  assert.ok(u.stage3 > 500);
  assert.ok(u.stage4 > 500);
});
