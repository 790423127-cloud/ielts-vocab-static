import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getReadingGContentIssues,
  isReadingGContentComplete,
  isReadingGContentIncomplete,
  isReadingGPlaceholderContent
} from "../content-completeness.mjs";
import { normalizeReadingGItem } from "../load-reading-g.mjs";
import { buildRgStudyList, getRgFilterLabel } from "../storage.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function completeEntry(overrides = {}) {
  return {
    id: "rg_word_complete",
    entryType: "word",
    word: "complete",
    phonetic: "/kəmˈpliːt/",
    primaryPos: "adjective",
    primaryMeaningZh: "完整的",
    definition: "having all necessary parts",
    example: "The record is complete.",
    exampleCn: "这条记录是完整的。",
    senses: [],
    primaryLayer: "questionBankActive",
    studyMode: "active",
    qualityFlags: [],
    ...overrides
  };
}

test("G-reading content completeness checks visible teaching fields, not layer tags", () => {
  const complete = completeEntry();
  const placeholder = completeEntry({
    word: "gum-digging",
    phonetic: "",
    primaryPos: "word",
    primaryMeaningZh: "全题库阅读词汇（总词库待补）",
    definition: "",
    example: "",
    exampleCn: ""
  });

  assert.equal(isReadingGContentComplete(complete), true);
  assert.equal(isReadingGContentIncomplete(complete), false);
  assert.deepEqual(getReadingGContentIssues(placeholder), [
    "phonetic",
    "pos",
    "meaning",
    "definition",
    "example",
    "exampleZh"
  ]);
  assert.equal(isReadingGPlaceholderContent(placeholder.primaryMeaningZh), true);
  assert.equal(isReadingGPlaceholderContent("未知的；不熟悉的"), false);
});

test("G-reading complete and incomplete filters use the same field-based rule as their counts", () => {
  const complete = completeEntry();
  const incompleteActive = completeEntry({
    id: "rg_word_incomplete_active",
    word: "incomplete-active",
    phonetic: ""
  });
  const incompletePending = completeEntry({
    id: "rg_word_incomplete_pending",
    word: "incomplete-pending",
    phonetic: "",
    primaryLayer: "questionBankPending",
    studyMode: "reference",
    qualityFlags: ["missing_master_lexicon"]
  });
  const phrase = completeEntry({
    id: "rg_phrase_complete",
    entryType: "phrase",
    word: "a complete record",
    phonetic: "",
    primaryPos: ""
  });
  const items = [complete, incompleteActive, incompletePending, phrase];

  assert.deepEqual(
    buildRgStudyList(items, { type: "questionBankComplete", value: "" }, {})
      .map((row) => row.entry.id),
    [complete.id]
  );
  assert.deepEqual(
    buildRgStudyList(items, { type: "contentIncomplete", value: "" }, {})
      .map((row) => row.entry.id),
    [incompleteActive.id, incompletePending.id]
  );
  assert.equal(getRgFilterLabel({ type: "questionBankComplete", value: "" }), "新增完整词（按实际字段）");
  assert.equal(getRgFilterLabel({ type: "contentIncomplete", value: "" }), "待补词（按实际字段）");
});

test("current G-reading data exposes every actually incomplete word in the pending-content queue", () => {
  const vocab = JSON.parse(fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"), "utf8"));
  const words = vocab.items
    .map((entry, index) => normalizeReadingGItem(entry, index))
    .filter((entry) => entry?.entryType === "word");
  const incomplete = words.filter(isReadingGContentIncomplete);
  const filtered = buildRgStudyList(words, { type: "contentIncomplete", value: "" }, {});
  const explicitAiPending = words.filter((entry) => (
    entry.primaryLayer === "questionBankPending" &&
    entry.studyMode === "reference" &&
    (entry.qualityFlags || []).includes("missing_master_lexicon")
  ));
  const gumDigging = words.find((entry) => entry.word === "gum-digging");

  assert.equal(incomplete.length, 592);
  assert.equal(filtered.length, incomplete.length);
  assert.equal(explicitAiPending.length, 13);
  assert.ok(explicitAiPending.every(isReadingGContentIncomplete));
  assert.equal(isReadingGContentIncomplete(gumDigging), true);
  assert.ok(filtered.some((row) => row.entry.id === gumDigging.id));
  assert.equal(
    words.filter((entry) => (
      entry.primaryLayer === "questionBankActive" && isReadingGContentComplete(entry)
    )).length,
    1324
  );
});
