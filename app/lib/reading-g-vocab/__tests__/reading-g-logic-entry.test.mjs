import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildRgStudyList,
  getRgLogicFrequency,
  getRgFilterLabel,
  RG_LEARNING_ENTRIES
} from "../storage.mjs";
import { isMeaningDetailInformative } from "../../vocab/meaning-display.mjs";
import { getMultiPosSenseCoverage } from "../../vocab/multi-pos-sense-coverage.mjs";
import { isReadingGMeaningCoverageCandidate } from "../ai-completion.mjs";
import { isReadingGContentComplete } from "../content-completeness.mjs";
import {
  LOGIC_DETAIL_OVERRIDES,
  LOGIC_DETAIL_PATCHES
} from "../../../../scripts/data/reading-g-logic-editorial-review.mjs";
import {
  LOGIC_EXISTING_PHRASES,
  LOGIC_NEW_PHRASES,
  LOGIC_RULE_CATEGORIES,
  LOGIC_RULE_GATES,
  LOGIC_RULE_VERSION
} from "../../../../scripts/data/reading-g-logic-rule-supplement.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const logicFilter = { type: "layer", value: "logic120" };

test("G-reading learning range exposes the logic-transition layer", () => {
  const logicEntry = RG_LEARNING_ENTRIES
    .flatMap((group) => group.items)
    .find((entry) => entry.filter.type === "layer" && entry.filter.value === "logic120");

  assert.deepEqual(logicEntry, {
    title: "逻辑转换（完整词书）",
    desc: "因果、条件、对比、数量程度、语气强度、时间与文章衔接逻辑词",
    filter: logicFilter
  });
  assert.equal(getRgFilterLabel(logicFilter), "逻辑转换（完整词书）");

  const data = JSON.parse(
    fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"), "utf8")
  );
  const studyRows = buildRgStudyList(data.items, logicFilter, {});
  assert.equal(studyRows.length, 298);
  assert.deepEqual(
    studyRows.slice(0, 12).map(({ entry }) => entry.word),
    [
      "also",
      "first",
      "as...as",
      "only",
      "before",
      "such as",
      "during",
      "because",
      "while",
      "however",
      "including",
      "as well"
    ]
  );
  assert.ok(
    studyRows.every((row, index) => {
      if (index === 0) return true;
      const previous = getRgLogicFrequency(studyRows[index - 1].entry);
      const current = getRgLogicFrequency(row.entry);
      return previous.articleCount > current.articleCount
        || (
          previous.articleCount === current.articleCount
          && previous.occurrenceCount >= current.occurrenceCount
        );
    }),
    "logic-transition current order must put wider article coverage and more occurrences first"
  );
  assert.ok(
    studyRows.every(({ entry }) => entry.layers.includes("logic120")),
    "logic-transition range must not leak entries from other layers"
  );
  const studyPositions = new Map(
    studyRows.map(({ entry }, index) => [entry.word.toLowerCase(), index])
  );
  for (const word of ["have to", "both...and", "either or", "be required to", "a range of"]) {
    assert.ok(studyPositions.has(word), `logic-transition range must include ${word}`);
  }
  const studyWords = new Set(studyRows.map(({ entry }) => entry.word.toLowerCase()));
  for (const word of [
    "alternatively",
    "particularly",
    "specifically",
    "similarly",
    "firstly",
    "initially",
    "lastly"
  ]) {
    assert.ok(studyWords.has(word), `logic-transition range must include ${word}`);
  }
  assert.ok(studyWords.has("otherwise"), "workbook logic items must be learnable");
  for (const word of ["in order to", "based on", "as soon as", "if necessary", "whilst"]) {
    assert.ok(studyWords.has(word), `logic-transition range must include corpus connector ${word}`);
  }
  for (const word of [
    "when necessary",
    "every year",
    "annually",
    "per annum",
    "more than",
    "less than",
    "all-year-round",
    "as soon as possible",
    "up-to-date",
    "as a first step",
    "in no time",
    "ahead of schedule"
  ]) {
    assert.ok(studyWords.has(word), `AI-coach question evidence must add ${word}`);
  }
  for (const word of ["investment", "teacher", "money", "company", "owe to"]) {
    assert.equal(studyWords.has(word), false, `${word} must leave the logic-transition range`);
  }
});

test("static G-reading panel exposes the same logic-transition entry", () => {
  const staticSource = fs.readFileSync(
    path.join(root, "public/assets/reading-g.js"),
    "utf8"
  );
  assert.match(
    staticSource,
    /label:\s*["']逻辑转换（完整词书）["'][\s\S]*?type:\s*["']layer["'][\s\S]*?value:\s*["']logic120["']/
  );
  assert.match(staticSource, /logic120:\s*["']逻辑转换（完整词书）["']/);
  assert.match(staticSource, /study\s*=\s*sortDefaultFrequencyIndices\(study\)/);
  assert.match(staticSource, /filter\.type === "part12OnlyHighFrequency"/);
  assert.match(staticSource, /filter\.value === "logic120" \|\| filter\.value === "part12ArticleHighFrequency"/);
});

test("logic-transition range imports the complete workbook and keeps the reviewed connector subset", () => {
  const data = JSON.parse(
    fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"), "utf8")
  );
  const logicRows = data.items.filter((item) => item.layers?.includes("logic120"));

  assert.equal(logicRows.length, 298);
  assert.equal(data.logicWorkbookImport?.sourceWorkbookId, "582696");
  assert.equal(data.logicWorkbookImport?.sourceRowCount, 213);
  assert.equal(data.logicWorkbookImport?.uniqueSourceWordCount, 211);
  assert.equal(data.logicWorkbookImport?.taggedExisting, 138);
  assert.equal(data.logicWorkbookImport?.promotedReference, 17);
  assert.equal(data.logicWorkbookImport?.added, 47);
  assert.equal(data.logicWorkbookImport?.finalLogicLayerCount, 298);
  assert.equal(data.logicLayerCorpusAudit?.version, 1);
  assert.equal(data.logicLayerCorpusAudit?.articleCount, 280);
  assert.equal(data.logicLayerCorpusAudit?.untaggedCount, 97);
  assert.equal(data.logicLayerCorpusAudit?.taggedExistingCount, 24);
  assert.equal(data.logicLayerCorpusAudit?.addedCount, 16);
  assert.equal(data.logicLayerCorpusAudit?.promotedReferenceCount, 1);
  assert.equal(data.logicLayerCorpusAudit?.finalLogicLayerCount, 298);
  assert.equal(data.aiCoachLogicLayerAudit?.taggedExistingCount, 9);
  assert.equal(data.aiCoachLogicLayerAudit?.addedCount, 3);
  assert.equal(data.aiCoachLogicLayerAudit?.finalLogicLayerCount, 298);
  assert.equal(data.aiCoachLogicLayerAudit?.version, 2);
  assert.equal(data.aiCoachLogicLayerAudit?.ruleVersion, LOGIC_RULE_VERSION);
  assert.deepEqual(data.logicRuleSupplement?.gates, LOGIC_RULE_GATES);
  assert.deepEqual(data.logicRuleSupplement?.categories, LOGIC_RULE_CATEGORIES);
  assert.equal(data.logicRuleSupplement?.existingPhraseTargetCount, LOGIC_EXISTING_PHRASES.length);
  assert.equal(data.logicRuleSupplement?.newPhraseTargetCount, LOGIC_NEW_PHRASES.length);
  assert.equal(data.logicRuleSupplement?.finalLogicLayerCount, 298);
  assert.equal(data.logicRuleSupplement?.paidAiCalls, 0);
  for (const spec of [...LOGIC_EXISTING_PHRASES, ...LOGIC_NEW_PHRASES]) {
    const item = data.items.find((row) => row.word.toLowerCase() === spec.word.toLowerCase());
    assert.ok(item, `logic-rule supplement must retain ${spec.word}`);
    assert.ok(item.layers.includes("logic120"), `${spec.word} must enter logic120`);
    assert.equal(item.studyMode, "active", `${spec.word} must be learnable`);
    assert.equal(item.logicRuleCategory, spec.category);
    assert.equal(item.logicRuleVersion, LOGIC_RULE_VERSION);
    const articleCount = Number(item.part12ArticleFrequency?.articleCount || 0)
      + Number(item.part12ArticleFrequency?.part3ArticleCount || 0);
    assert.ok(
      Number(item.aiCoachQuestionFrequency?.questionCount || 0) > 0 || articleCount > 0,
      `${spec.word} must keep real question or article evidence`
    );
  }
  const degreePhrase = data.items.find((item) => item.word.toLowerCase() === "a degree of");
  assert.equal(degreePhrase?.aiCoachQuestionFrequency?.questionCount, 1);
  assert.match(degreePhrase?.meaningDetailZh || "", /程度/u);
  assert.ok(data.items.some((item) => item.word.toLowerCase() === "investment"));
  assert.ok(data.items.some((item) => item.word.toLowerCase() === "teacher"));
  assert.equal(
    data.items.find((item) => item.word.toLowerCase() === "investment")?.layers?.includes("logic120"),
    false
  );
  assert.ok(logicRows.every((item) => item.studyMode === "active"));
  assert.ok(
    logicRows
      .filter((item) => (item.entryType || "word") === "word")
      .every(isReadingGContentComplete)
  );

  const reviewedRows = logicRows.filter(
    (item) => item.meaningDetailSource === "manual-common-meaning-review"
  );
  assert.equal(reviewedRows.length, 123);
  assert.equal(data.logicConnectorEditorialReview?.version, 3);
  assert.equal(data.logicConnectorEditorialReview?.reviewedCount, 123);
  assert.equal(data.logicConnectorEditorialReview?.standardizedDetailCount, 123);
  assert.equal(data.logicConnectorEditorialReview?.layerAdditionCount, 7);
  assert.equal(data.logicConnectorEditorialReview?.addedDetailCount, 62);
  assert.equal(data.logicConnectorEditorialReview?.enhancedDetailCount, 61);
  assert.equal(data.logicConnectorEditorialReview?.repairedExampleCount, 19);
  assert.equal(
    data.logicConnectorEditorialReview?.detailStandard,
    "manual-common-meaning-review"
  );

  const reviewedDetails = new Map(
    Object.entries({ ...LOGIC_DETAIL_PATCHES, ...LOGIC_DETAIL_OVERRIDES })
  );
  assert.equal(reviewedDetails.size, reviewedRows.length);
  assert.ok(reviewedRows.every(isMeaningDetailInformative));
  assert.ok(reviewedRows.every((item) => item.meaningDetailReviewedAt === "2026-08-12"));
  assert.ok(
    reviewedRows.every((item) =>
      item.qualityFlags?.includes("logic_connector_manual_meaning_review_v3")
    )
  );
  assert.ok(
    reviewedRows.every((item) => item.meaningDetailZh === reviewedDetails.get(item.word.toLowerCase())),
    "every logic row must use the explicitly reviewed detail"
  );
  assert.ok(
    reviewedRows.every((item) => [...item.meaningDetailZh].length >= 45),
    "a paraphrased short gloss is not a detailed meaning"
  );
  assert.ok(
    reviewedRows.every((item) => (item.meaningDetailZh.match(/[。！？]/gu) || []).length >= 2),
    "each detail must explain both the semantic function and a useful boundary"
  );
  assert.ok(reviewedRows.every((item) => /[.!?]$/u.test(item.example || "")));
  assert.ok(reviewedRows.every((item) => /[\u3400-\u9fff]/u.test(item.exampleCn || "")));
  assert.ok(reviewedRows.every((item) => !/\s[.!?]/u.test(item.example || "")));
  assert.ok(reviewedRows.every((item) => !/,\s*(?:as a result|therefore|thus)\b/iu.test(item.example || "")));
});

test("conversely and merely keep their actual single-adverb part of speech", () => {
  const data = JSON.parse(
    fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"), "utf8")
  );

  for (const word of ["conversely", "merely"]) {
    const entry = data.items.find((item) => item.word.toLowerCase() === word);
    assert.ok(entry, `${word} must exist in the G-reading vocabulary`);
    assert.equal(entry.pos, "adverb");
    assert.equal(entry.primaryPos, "adverb");
    assert.deepEqual(entry.senses.map((sense) => sense.pos), ["adverb"]);
    assert.deepEqual(entry.otherMeanings, []);
    assert.equal(entry.meaningCoveragePending, false);
    assert.equal(entry.meaningCoverageAuditStatus, "reviewed");
    assert.equal(Object.hasOwn(entry, "meaningCoverageLastFailure"), false);
    assert.equal(isReadingGMeaningCoverageCandidate(entry), false);
    assert.equal(getMultiPosSenseCoverage(entry).complete, true);
  }
});
