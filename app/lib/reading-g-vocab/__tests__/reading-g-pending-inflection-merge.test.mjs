import assert from "node:assert/strict";
import test from "node:test";

import { buildPendingInflectionMergePlan } from "../../../../scripts/merge-reading-g-pending-inflections.mjs";

function main(word, pos, meaning = "有效释义") {
  return {
    id: `main-${word}`,
    entryType: "word",
    word,
    normalizedKey: word,
    primaryPos: pos,
    primaryMeaningZh: meaning,
    studyMode: "active",
    primaryLayer: "tierB1200",
    qualityFlags: []
  };
}

function pending(word) {
  return {
    id: `pending-${word}`,
    entryType: "word",
    word,
    normalizedKey: word,
    primaryPos: "",
    primaryMeaningZh: "全题库阅读词汇（总词库待补）",
    studyMode: "reference",
    primaryLayer: "questionBankPending",
    qualityFlags: ["missing_master_lexicon"]
  };
}

test("G-only pending merge accepts real inflections and keeps unsafe independent words", () => {
  const plan = buildPendingInflectionMergePlan([
    main("argue", "verb"),
    main("artistic", "adjective"),
    main("uncomfortable", "adjective"),
    main("care", "noun"),
    main("cool", "adjective"),
    main("even", "adjective"),
    pending("argued"),
    pending("artistically"),
    pending("uncomfortably"),
    pending("career"),
    pending("cooler"),
    pending("evenings")
  ]);

  assert.deepEqual(
    plan.mappings.map((row) => [row.ownerKey, row.aliasKey]),
    [
      ["argue", "argued"],
      ["artistic", "artistically"],
      ["uncomfortable", "uncomfortably"]
    ]
  );
  assert.deepEqual(plan.reviewWords, ["evenings"]);
  assert.equal(plan.conflicts.length, 0);
});
