#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { isReadingGMeaningCoverageCandidate } from "../app/lib/reading-g-vocab/ai-completion.mjs";
import { isReadingGContentIncomplete } from "../app/lib/reading-g-vocab/content-completeness.mjs";
import { getMultiPosSenseCoverage } from "../app/lib/vocab/multi-pos-sense-coverage.mjs";
import {
  MEANING_COVERAGE_PENDING_FLAG,
  MEANING_COVERAGE_REVIEWED_FLAG
} from "../app/lib/vocab/meaning-coverage-audit.mjs";
import { atomicWriteReadingGJson } from "../app/lib/reading-g-vocab/write-lock.server.mjs";

const PROJECT_ROOT = process.cwd();
const VOCAB_PATH = path.join(PROJECT_ROOT, "public", "data", "reading-g-vocab.json");
const BACKUP_DIR = path.join(PROJECT_ROOT, "backups");
const SHOULD_APPLY = process.argv.includes("--apply");
const VERSION = "manual-false-multi-pos-adverb-repair-v1";

const EDITORIAL_REPAIRS = Object.freeze({
  conversely: {
    meaning: "adv. 相反地；反过来说",
    meaningDetailZh: "用于引出与前述情况方向相反、逻辑相对的观点，相当于“反过来说”。它强调对应关系，不只是一般转折。",
    definition: "used to introduce a statement that has an opposite or contrasting relationship to what was just said",
    example: "Some people prefer cold climates; conversely, others prefer warm ones.",
    exampleCn: "有些人喜欢寒冷气候；相反，另一些人更喜欢温暖气候。"
  },
  merely: {
    meaning: "adv. 仅仅；不过",
    meaningDetailZh: "表示数量、程度或身份仅限于所说内容，即“仅仅、不过”；常用于降低或限制强调。",
    definition: "used to emphasize that something is small in amount, degree, or importance and nothing more",
    example: "It is merely a suggestion.",
    exampleCn: "这仅仅是一个建议。"
  }
});

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function timestampForFile(value) {
  return value.replaceAll(":", "-").replaceAll(".", "-");
}

function repairEntry(entry, spec, reviewedAt) {
  const { meaningCoverageLastFailure: _lastFailure, ...entryWithoutLastFailure } = entry;
  const flags = unique([
    ...(Array.isArray(entry.qualityFlags) ? entry.qualityFlags : [])
      .filter((flag) => flag !== MEANING_COVERAGE_PENDING_FLAG),
    MEANING_COVERAGE_REVIEWED_FLAG,
    VERSION
  ]);

  return {
    ...entryWithoutLastFailure,
    pos: "adverb",
    primaryPos: "adverb",
    meaning: spec.meaning,
    meaningZh: spec.meaning,
    primaryMeaningZh: spec.meaning,
    definition: spec.definition,
    meaningDetailZh: spec.meaningDetailZh,
    meaningDetailSource: VERSION,
    meaningDetailReviewedAt: reviewedAt,
    example: spec.example,
    exampleCn: spec.exampleCn,
    otherMeanings: [],
    senses: [{
      senseId: `${entry.id}_adverb_01`,
      pos: "adverb",
      meaningZh: spec.meaning,
      definition: spec.definition,
      example: spec.example,
      exampleZh: spec.exampleCn,
      isPrimary: true,
      readingCommon: true,
      sourceFiles: unique([...(Array.isArray(entry.sourceFiles) ? entry.sourceFiles : []), VERSION]),
      editorialSource: VERSION
    }],
    meaningCoveragePending: false,
    meaningCoverageReviewed: true,
    meaningCoverageAuditStatus: "reviewed",
    meaningCoverageReviewSource: VERSION,
    meaningCoverageReviewedAt: reviewedAt,
    meaningCoveragePromptVersion: VERSION,
    qualityFlags: flags,
    updatedAt: reviewedAt
  };
}

const vocab = JSON.parse(fs.readFileSync(VOCAB_PATH, "utf8"));
const reviewedAt = new Date().toISOString();
const targetWords = Object.keys(EDITORIAL_REPAIRS);
const found = new Map(vocab.items.map((entry) => [String(entry.word || "").toLowerCase(), entry]));

for (const word of targetWords) {
  const entry = found.get(word);
  if (!entry) throw new Error(`Missing target entry: ${word}`);
  const alreadyRepaired = entry.meaningCoverageReviewSource === VERSION;
  if (!isReadingGMeaningCoverageCandidate(entry) && !alreadyRepaired) {
    throw new Error(`Target is no longer a meaning-coverage candidate: ${word}`);
  }
  const coverage = getMultiPosSenseCoverage(entry);
  if (!alreadyRepaired && (!coverage.isMultiPos || !coverage.declaredPosTokens.includes("verb") || !coverage.declaredPosTokens.includes("adverb"))) {
    throw new Error(`Target no longer has the expected false verb/adverb declaration: ${word}`);
  }
}

const repairedByWord = new Map(targetWords.map((word) => [
  word,
  repairEntry(found.get(word), EDITORIAL_REPAIRS[word], reviewedAt)
]));
const nextItems = vocab.items.map((entry) => repairedByWord.get(String(entry.word || "").toLowerCase()) || entry);

for (const word of targetWords) {
  const repaired = repairedByWord.get(word);
  const coverage = getMultiPosSenseCoverage(repaired);
  if (repaired.id !== found.get(word).id) throw new Error(`Stable ID changed for ${word}`);
  if (coverage.isMultiPos || !coverage.complete || coverage.declaredPosTokens.join("/") !== "adverb") {
    throw new Error(`Part-of-speech repair did not validate for ${word}`);
  }
  if (isReadingGMeaningCoverageCandidate(repaired) || isReadingGContentIncomplete(repaired)) {
    throw new Error(`Repaired entry remains incomplete: ${word}`);
  }
}

const nextVocab = {
  ...vocab,
  items: nextItems,
  falseMultiPosAdverbRepair: {
    version: 1,
    reviewedAt,
    words: targetWords,
    policy: "修正来源词性误标；保留稳定 ID、学习状态及其他既有教学字段。"
  },
  updatedAt: reviewedAt
};

if (SHOULD_APPLY) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, `reading-g-vocab-before-${VERSION}-${timestampForFile(reviewedAt)}.json`);
  atomicWriteReadingGJson(backupPath, vocab);
  atomicWriteReadingGJson(VOCAB_PATH, nextVocab);
  console.log(JSON.stringify({ applied: targetWords, backupPath }, null, 2));
} else {
  console.log(JSON.stringify({ dryRun: true, targets: targetWords }, null, 2));
}
