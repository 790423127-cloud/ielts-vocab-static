import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LOGIC_DETAIL_OVERRIDES,
  LOGIC_DETAIL_PATCHES,
  LOGIC_EXAMPLE_PATCHES,
  LOGIC_LAYER_ADDITIONS,
  LOGIC_REVIEW_SOURCES
} from "./data/reading-g-logic-editorial-review.mjs";
import {
  describeMeaningDetailIssue,
  isMeaningDetailInformative
} from "../app/lib/vocab/meaning-display.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const vocabPath = path.join(root, "public", "data", "reading-g-vocab.json");
const apply = process.argv.includes("--apply");
const expectedReviewedCount = 123;
const reviewVersion = 3;
const reviewFlag = "logic_connector_manual_meaning_review_v3";
const reviewFlagHistory = new Set([
  "logic_connector_human_review_v1",
  "logic_connector_manual_meaning_review_v2",
  reviewFlag
]);
const reviewSource = "manual-common-meaning-review";
const reviewedAt = "2026-08-12";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function atomicWrite(filePath, value) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function normalize(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase();
}

function exampleContainsTarget(example, target) {
  const normalizedExample = normalize(example);
  const normalizedTarget = normalize(target);
  if (!normalizedTarget) return true;
  if (normalizedExample.includes(normalizedTarget)) return true;
  if (normalizedTarget === "not only but also") {
    return /\bnot only\b[\s\S]*\bbut also\b/iu.test(normalizedExample);
  }
  return false;
}

function validateExample(item) {
  const example = String(item.example || "").trim();
  const exampleCn = String(item.exampleCn || "").trim();
  const word = normalize(item.word);
  const normalizedExample = normalize(example);
  const issues = [];
  if (!example || !/[.!?]$/u.test(example)) issues.push("英文例句缺失或没有句末标点");
  if (!exampleCn || !/[\u3400-\u9fff]/u.test(exampleCn)) issues.push("中文例句缺失");
  if (word && !exampleContainsTarget(normalizedExample, word)) issues.push("英文例句未包含目标词");
  if (/\s[.!?]/u.test(example)) issues.push("英文例句含残缺空位");
  if (/,\s*(?:as a result|therefore|thus)\b/iu.test(example)) issues.push("连接两个完整句时使用了逗号拼接");
  return issues;
}

function protectedSnapshot(vocab) {
  return (vocab.items || []).map((item) => ({
    id: item.id,
    word: item.word,
    wordId: item.wordId,
    studyMode: item.studyMode
  }));
}

function layerSnapshot(vocab) {
  return (vocab.items || []).map((item) => ({
    id: item.id,
    word: item.word,
    layers: [...(item.layers || [])]
  }));
}

function addReviewedLogicLayers(vocab) {
  const entriesById = new Map((vocab.items || []).map((item) => [item.id, item]));
  let added = 0;
  for (const [id, expectedWord] of Object.entries(LOGIC_LAYER_ADDITIONS)) {
    const item = entriesById.get(id);
    if (!item || normalize(item.word) !== normalize(expectedWord)) {
      throw new Error(`Logic-layer addition does not match stable entry: ${id} / ${expectedWord}`);
    }
    if (item.studyMode !== "active") {
      throw new Error(`Logic-layer addition is not an active study row: ${item.word}`);
    }
    if (!(item.layers || []).includes("logic120")) {
      item.layers = [...(item.layers || []), "logic120"];
      added += 1;
    }
  }
  return added;
}

function validateLayerChanges(before, after) {
  if (before.length !== after.length) throw new Error("Editorial review changed item count");
  for (let index = 0; index < before.length; index += 1) {
    const previous = before[index];
    const next = after[index];
    if (previous.id !== next.id || previous.word !== next.word) {
      throw new Error(`Editorial review changed item order at index ${index}`);
    }
    if (JSON.stringify(previous.layers) === JSON.stringify(next.layers)) continue;
    const expectedWord = LOGIC_LAYER_ADDITIONS[previous.id];
    const expectedLayers = [...previous.layers, "logic120"];
    if (
      normalize(previous.word) !== normalize(expectedWord)
      || previous.layers.includes("logic120")
      || JSON.stringify(next.layers) !== JSON.stringify(expectedLayers)
    ) {
      throw new Error(`Unexpected layer change: ${previous.word}`);
    }
  }
}

function reviewVocabulary(vocab) {
  const addedLogicLayers = addReviewedLogicLayers(vocab);
  const reviewedRows = (vocab.items || []).filter((item) =>
    Array.isArray(item.layers)
    && item.layers.includes("logic120")
    && item.meaningDetailSource === reviewSource
  );
  if (reviewedRows.length !== expectedReviewedCount) {
    throw new Error(`Expected ${expectedReviewedCount} logic120 rows, found ${reviewedRows.length}`);
  }

  const missingBefore = reviewedRows.filter((item) => !isMeaningDetailInformative(item));
  const expectedMissingWords = new Set(Object.keys(LOGIC_DETAIL_PATCHES));
  const actualMissingWords = new Set(missingBefore.map((item) => normalize(item.word)));
  const missingPatchWords = [...actualMissingWords].filter((word) => !expectedMissingWords.has(word));
  const unexpectedPatchWords = [...expectedMissingWords].filter((word) => !actualMissingWords.has(word));
  const previouslyReviewed = Number(vocab.logicConnectorEditorialReview?.version || 0) >= 1
    && reviewedRows.some((item) =>
      (item.qualityFlags || []).some((flag) => reviewFlagHistory.has(flag))
    );
  if (missingPatchWords.length || (!previouslyReviewed && unexpectedPatchWords.length)) {
    throw new Error(
      `Detail patch coverage mismatch. Missing patches: ${missingPatchWords.join(", ") || "none"}; ` +
      `unexpected patches: ${unexpectedPatchWords.join(", ") || "none"}`
    );
  }

  const targetWords = new Set(reviewedRows.map((item) => normalize(item.word)));
  for (const collection of [LOGIC_DETAIL_OVERRIDES, LOGIC_EXAMPLE_PATCHES]) {
    const unknownWords = Object.keys(collection).filter((word) => !targetWords.has(normalize(word)));
    if (unknownWords.length) throw new Error(`Review contains unknown logic120 rows: ${unknownWords.join(", ")}`);
  }

  let addedDetails = 0;
  let enhancedDetails = 0;
  let repairedExamples = 0;
  let stampedReviewProvenance = 0;
  for (const item of reviewedRows) {
    const word = normalize(item.word);
    const oldExample = String(item.example || "");
    if (LOGIC_DETAIL_PATCHES[word]) {
      if (item.meaningDetailZh !== LOGIC_DETAIL_PATCHES[word]) addedDetails += 1;
      item.meaningDetailZh = LOGIC_DETAIL_PATCHES[word];
    } else if (LOGIC_DETAIL_OVERRIDES[word]) {
      if (item.meaningDetailZh !== LOGIC_DETAIL_OVERRIDES[word]) enhancedDetails += 1;
      item.meaningDetailZh = LOGIC_DETAIL_OVERRIDES[word];
    }

    const examplePatch = LOGIC_EXAMPLE_PATCHES[word];
    if (examplePatch) {
      if (item.example !== examplePatch.example || item.exampleCn !== examplePatch.exampleCn) {
        repairedExamples += 1;
      }
      item.example = examplePatch.example;
      item.exampleCn = examplePatch.exampleCn;
      for (const sense of Array.isArray(item.senses) ? item.senses : []) {
        if (String(sense?.example || "") !== oldExample) continue;
        sense.example = examplePatch.example;
        if (Object.hasOwn(sense, "exampleZh")) sense.exampleZh = examplePatch.exampleCn;
        if (Object.hasOwn(sense, "exampleCn")) sense.exampleCn = examplePatch.exampleCn;
      }
    }

    if (
      item.meaningDetailSource !== reviewSource
      || item.meaningDetailReviewedAt !== reviewedAt
      || !(item.qualityFlags || []).includes(reviewFlag)
    ) {
      stampedReviewProvenance += 1;
    }
    item.meaningDetailSource = reviewSource;
    item.meaningDetailReviewedAt = reviewedAt;
    item.qualityFlags = [...new Set([...(item.qualityFlags || []), reviewFlag])];
  }

  const uninformative = reviewedRows.filter((item) => !isMeaningDetailInformative(item));
  if (uninformative.length) {
    throw new Error(
      `Uninformative details remain: ${uninformative.map((item) =>
        `${item.word}（${describeMeaningDetailIssue(item)}）`
      ).join("、")}`
    );
  }
  const exampleIssues = reviewedRows.flatMap((item) =>
    validateExample(item).map((issue) => `${item.word}: ${issue}`)
  );
  if (exampleIssues.length) throw new Error(`Example validation failed: ${exampleIssues.join("; ")}`);

  const controlledDetailWords = new Set([
    ...Object.keys(LOGIC_DETAIL_PATCHES),
    ...Object.keys(LOGIC_DETAIL_OVERRIDES)
  ]);
  if (controlledDetailWords.size !== reviewedRows.length) {
    throw new Error(
      `Manual detail review must control all ${reviewedRows.length} rows; found ${controlledDetailWords.size}`
    );
  }

  const previousReview = vocab.logicConnectorEditorialReview || {};
  if (
    previousReview.version !== reviewVersion
    || addedDetails
    || enhancedDetails
    || repairedExamples
    || addedLogicLayers
    || stampedReviewProvenance
  ) {
    vocab.logicConnectorEditorialReview = {
      version: reviewVersion,
      reviewedAt,
      layer: "logic120",
      reviewedCount: reviewedRows.length,
      standardizedDetailCount: controlledDetailWords.size,
      layerAdditionCount: Math.max(
        Number(previousReview.layerAdditionCount || 0),
        Object.keys(LOGIC_LAYER_ADDITIONS).length
      ),
      addedDetailCount: Math.max(Number(previousReview.addedDetailCount || 0), addedDetails),
      enhancedDetailCount: Number(previousReview.enhancedDetailCount || 0) + enhancedDetails,
      repairedExampleCount: Number(previousReview.repairedExampleCount || 0) + repairedExamples,
      detailStandard: reviewSource,
      standardDecision: "详细释义必须解释语义范围，并按需补充句法框架、语体、常见义或易错边界；短释义改写、词形标签、搭配罗列和例句复述均不算完成。",
      breadthDecision: "该人工释义复核仅覆盖 123 条连接词子集；完整逻辑词书由独立导入记录维护，不覆盖既有释义。",
      sources: [...LOGIC_REVIEW_SOURCES]
    };
  }

  return {
    reviewedCount: reviewedRows.length,
    addedLogicLayers,
    missingBefore: missingBefore.length,
    addedDetails,
    enhancedDetails,
    repairedExamples,
    stampedReviewProvenance,
    informativeAfter: reviewedRows.length - uninformative.length,
    exampleIssuesAfter: exampleIssues.length
  };
}

const vocab = readJson(vocabPath);
if (!Array.isArray(vocab.items)) throw new Error("reading-g-vocab.json missing items");
const beforeProtected = protectedSnapshot(vocab);
const beforeLayers = layerSnapshot(vocab);
const stats = reviewVocabulary(vocab);
const afterProtected = protectedSnapshot(vocab);
const afterLayers = layerSnapshot(vocab);
if (JSON.stringify(beforeProtected) !== JSON.stringify(afterProtected)) {
  throw new Error("Editorial review changed an id, word, wordId or studyMode");
}
validateLayerChanges(beforeLayers, afterLayers);

if (apply) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(root, "backups", `reading-g-logic-review-${timestamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, "reading-g-vocab.json.before");
  fs.copyFileSync(vocabPath, backupPath);
  atomicWrite(vocabPath, vocab);
  console.log(JSON.stringify({ ok: true, applied: true, backupPath, stats }, null, 2));
} else {
  console.log(JSON.stringify({ ok: true, applied: false, stats }, null, 2));
}
