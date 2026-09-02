import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getReadingGCompleteness,
  getReadingGContentIssues,
  isReadingGContentComplete,
  isReadingGContentIncomplete,
  isReadingGContextOnlyMeaningDetail,
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
    meaningDetailZh: "表示具有所需的全部部分，没有缺失或尚未完成的内容。",
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
    meaningDetailZh: "",
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
    "exampleZh",
    "meaningDetail"
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
  assert.deepEqual(
    buildRgStudyList(items, { type: "active", value: "" }, {})
      .map((row) => row.entry.id),
    [complete.id, phrase.id]
  );
  assert.equal(getRgFilterLabel({ type: "questionBankComplete", value: "" }), "新增完整词（按实际字段）");
  assert.equal(getRgFilterLabel({ type: "contentIncomplete", value: "" }), "待补词（按实际字段）");
});

test("G-reading completion queue accepts exact one-character glosses but catches unusable short meanings and unsplit multi-POS entries", () => {
  const exactShort = completeEntry({
    id: "rg_word_bear",
    word: "bear",
    primaryPos: "noun",
    primaryMeaningZh: "熊"
  });
  const tooShort = completeEntry({
    id: "rg_word_brief",
    word: "brief",
    primaryPos: "adjective",
    primaryMeaningZh: "x"
  });
  const unsplit = completeEntry({
    id: "rg_word_record",
    word: "record",
    primaryPos: "noun/verb",
    pos: "noun/verb",
    primaryMeaningZh: "记录；录制",
    senses: []
  });
  const split = completeEntry({
    id: "rg_word_split_record",
    word: "record",
    primaryPos: "noun/verb",
    pos: "noun/verb",
    primaryMeaningZh: "记录",
    senses: [
      { pos: "noun", meaningZh: "记录", definition: "a written account", example: "Keep a record.", exampleZh: "保留记录。" },
      { pos: "verb", meaningZh: "录制", definition: "to store sound", example: "Record the talk.", exampleZh: "录下这场谈话。" }
    ]
  });

  assert.equal(getReadingGContentIssues(exactShort).includes("meaningTooShort"), false);
  assert.ok(getReadingGContentIssues(tooShort).includes("meaningTooShort"));
  assert.ok(getReadingGContentIssues(unsplit).includes("multiPosNeedsSplit"));
  assert.equal(getReadingGContentIssues(split).includes("multiPosNeedsSplit"), false);
  assert.equal(getReadingGCompleteness(tooShort).isLearningBlocked, true);
});

test("G-reading rejects a sentence-specific detail even when the text itself is long enough", () => {
  const contextualOnly = completeEntry({
    word: "inside",
    primaryPos: "preposition",
    primaryMeaningZh: "在……里面",
    meaningDetailZh: "在当前例句中作介词，后接 the drawer，表示钥匙位于抽屉里面。"
  });
  const commonSense = completeEntry({
    word: "inside",
    primaryPos: "preposition",
    primaryMeaningZh: "在……里面",
    meaningDetailZh: "可作介词或副词表示在……里面，也可作名词指内部；作形容词时表示内部的。"
  });

  assert.equal(isReadingGContextOnlyMeaningDetail(contextualOnly), true);
  assert.ok(getReadingGContentIssues(contextualOnly).includes("meaningDetail"));
  assert.equal(isReadingGContextOnlyMeaningDetail(commonSense), false);
  assert.equal(getReadingGContentIssues(commonSense).includes("meaningDetail"), false);
});

test("G-reading completeness score covers all seven requested dimensions", () => {
  const fullyDocumented = completeEntry({
    forms: [{ word: "completes", type: "third-person" }],
    wordFamily: [{ word: "completion", pos: "noun" }],
    synonyms: [{ word: "entire" }],
    difficulty: "中级核心"
  });
  const score = getReadingGCompleteness(fullyDocumented);

  assert.equal(score.completedCount, 7);
  assert.equal(score.totalCount, 7);
  assert.equal(score.percent, 100);
  assert.equal(score.isLearningBlocked, false);
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

  assert.equal(filtered.length, incomplete.length);
  assert.ok(explicitAiPending.every(isReadingGContentIncomplete));
  assert.ok(words.some((entry) => (
    entry.primaryLayer === "questionBankActive" && isReadingGContentComplete(entry)
  )));
});
