#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { renderMasterLexiconBaseline } from "../app/lib/vocab/master-lexicon-baseline-io.mjs";
import { computeIntegrityHash, computeLexiconHash } from "../app/lib/vocab/lexicon-guard.mjs";
import { USER_STATE_FIELDS } from "../app/lib/vocab/word-cache-meta.mjs";

const root = process.cwd();
const shouldApply = process.argv.includes("--apply");
const publicPath = path.join(root, "public", "data", "words.json");
const staticPath = path.join(root, ".static-export-cache", "words.json");
const baselinePath = path.join(root, "app", "lib", "vocab", "master-lexicon-baseline.mjs");
const readingGPath = path.join(root, "public", "data", "reading-g-vocab.json");
const synonymPath = path.join(root, "public", "data", "reading-g-synonym-completions.json");
const version = "manual-interest-headword-semantic-repair-v1-20260812";

const patch = Object.freeze({
  pos: "noun / verb",
  meaning: "兴趣；关注；利益；利息；使感兴趣",
  detail: "作名词首先指想了解、关注某事的兴趣，也可指个人或团体的利益，以及借款产生的利息；作动词表示使某人感兴趣。have an interest in 表示对……有兴趣，interest rate 表示利率。",
  definition: "兴趣；关注；利益；利息；使感兴趣",
  example: "She has a strong interest in environmental issues.",
  exampleCn: "她对环境问题有浓厚兴趣。",
  otherMeanings: [
    { pos: "noun", meaningZh: "利益；好处", definitionEn: "an advantage or benefit for a person or group", example: "We must protect the interests of local residents.", exampleCn: "我们必须保护当地居民的利益。" },
    { pos: "noun", meaningZh: "利息", definitionEn: "money paid for borrowing money or earned from savings", example: "The bank pays interest on this account.", exampleCn: "银行为这个账户支付利息。" },
    { pos: "verb", meaningZh: "使感兴趣", definitionEn: "to make someone want to know more about something", example: "The course may interest students who enjoy science.", exampleCn: "这门课程可能会吸引喜欢科学的学生。" }
  ],
  collocations: [
    { phrase: "strong interest", chinese: "浓厚兴趣" },
    { phrase: "public interest", chinese: "公共利益" },
    { phrase: "interest rate", chinese: "利率" }
  ],
  phraseCollocations: [
    { phrase: "have an interest in", chinese: "对……有兴趣" },
    { phrase: "show interest in", chinese: "对……表现出兴趣" },
    { phrase: "in someone's interests", chinese: "符合某人的利益" }
  ]
});

function atomicWrite(filePath, content) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, content, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stateSnapshot(entry = {}) {
  return Object.fromEntries(USER_STATE_FIELDS
    .filter((field) => Object.prototype.hasOwnProperty.call(entry, field))
    .map((field) => [field, entry[field]]));
}

function masterInterest(entry, repairedAt) {
  return {
    ...entry,
    pos: patch.pos,
    posOriginal: patch.pos,
    declaredPos: patch.pos,
    primaryPos: "noun",
    meaning: patch.meaning,
    definition: patch.definition,
    meaningOriginal: patch.meaning,
    primaryMeaningZh: "兴趣；关注",
    meaningDetailZh: patch.detail,
    meaningDetailSource: "manual-common-meaning-review",
    meaningDetailReviewedAt: repairedAt,
    meaningDetailedZh: patch.detail,
    example: patch.example,
    exampleCn: patch.exampleCn,
    exampleStatus: "editorial_example",
    otherMeanings: patch.otherMeanings,
    collocations: patch.collocations,
    phraseCollocations: patch.phraseCollocations,
    meaningsZh: [
      { gloss: "兴趣；关注；利益；利息", posFamily: "noun", label: "核心义", confidence: "manual-reviewed", evidence: [version] },
      { gloss: "使感兴趣", posFamily: "verb", label: "常见义", confidence: "manual-reviewed", evidence: [version] }
    ],
    quizSenses: [
      { senseId: `${entry.id}-quiz-noun`, quizMeaningZh: "兴趣；关注；利益；利息", meaningDetailedZh: patch.detail, posFamily: "noun", confidence: "manual-reviewed", generatedAt: repairedAt },
      { senseId: `${entry.id}-quiz-verb`, quizMeaningZh: "使感兴趣", meaningDetailedZh: "使某人想进一步了解或关注某事。", posFamily: "verb", confidence: "manual-reviewed", generatedAt: repairedAt }
    ],
    senses: [
      { senseId: `${entry.id}_noun_01`, pos: "noun", meaningZh: "兴趣；关注；利益；利息", definition: patch.definition, example: patch.example, exampleZh: patch.exampleCn, isPrimary: true, readingCommon: true, sourceFiles: [version], editorialSource: "manual-semantic-repair" },
      { senseId: `${entry.id}_verb_02`, pos: "verb", meaningZh: "使感兴趣", definition: "使某人想进一步了解或关注某事。", example: patch.otherMeanings[2].example, exampleZh: patch.otherMeanings[2].exampleCn, sourceFiles: [version], editorialSource: "manual-semantic-repair" }
    ],
    multiPosSenseReview: { version, reviewedAt: repairedAt, primaryPolicy: "common independent headword meaning first", origin: "manual-semantic-repair" },
    updatedAt: repairedAt
  };
}

function readingGInterest(entry, repairedAt) {
  return {
    ...entry,
    pos: patch.pos,
    primaryPos: "noun",
    meaning: patch.meaning,
    meaningZh: patch.meaning,
    primaryMeaningZh: "兴趣；关注",
    definition: patch.definition,
    meaningDetailZh: patch.detail,
    example: patch.example,
    exampleCn: patch.exampleCn,
    otherMeanings: patch.otherMeanings,
    collocations: patch.collocations,
    phraseCollocations: patch.phraseCollocations,
    senses: [
      { senseId: `${entry.id}_noun_01`, pos: "noun", meaningZh: "兴趣；关注；利益；利息", definition: patch.definition, example: patch.example, exampleZh: patch.exampleCn, isPrimary: true, sourceFiles: [version] },
      { senseId: `${entry.id}_verb_02`, pos: "verb", meaningZh: "使感兴趣", definition: "使某人想进一步了解或关注某事。", example: patch.otherMeanings[2].example, exampleZh: patch.otherMeanings[2].exampleCn, sourceFiles: [version] }
    ],
    meaningCoverageReviewSource: "manual-semantic-repair",
    meaningCoverageReviewedAt: repairedAt,
    updatedAt: repairedAt
  };
}

function repairInterestReferences(value, repairedAt) {
  if (Array.isArray(value)) return value.map((item) => repairInterestReferences(item, repairedAt));
  if (!value || typeof value !== "object") return value;
  if (value.id === "rg_word_interest" && value.word === "interest") return readingGInterest(value, repairedAt);
  const next = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, repairInterestReferences(item, repairedAt)]));
  if (next.word === "interest" && ("meaning" in next || "meaningZh" in next || "pos" in next)) {
    if ("pos" in next) next.pos = patch.pos;
    if ("meaning" in next) next.meaning = "兴趣；关注；利益；使感兴趣";
    if ("meaningZh" in next) next.meaningZh = "兴趣；关注；利益；使感兴趣";
  }
  return next;
}

function main() {
  const publicRaw = fs.readFileSync(publicPath);
  const staticRaw = fs.readFileSync(staticPath);
  if (!publicRaw.equals(staticRaw)) throw new Error("The two authoritative master lexicon files differ; repair stopped.");
  const baselineRaw = fs.readFileSync(baselinePath);
  const readingGRaw = fs.readFileSync(readingGPath);
  const synonymRaw = fs.readFileSync(synonymPath);
  const master = JSON.parse(publicRaw.toString("utf8"));
  const readingG = JSON.parse(readingGRaw.toString("utf8"));
  const synonyms = JSON.parse(synonymRaw.toString("utf8"));
  const repairedAt = new Date().toISOString();
  const indexes = master.words.map((entry, index) => entry.word === "interest" ? index : -1).filter((index) => index >= 0);
  if (indexes.length !== 1) throw new Error(`Expected one interest master entry, got ${indexes.length}.`);
  const index = indexes[0];
  const beforeState = JSON.stringify(stateSnapshot(master.words[index]));
  const nextWords = master.words.map((entry, currentIndex) => currentIndex === index ? masterInterest(entry, repairedAt) : entry);
  if (JSON.stringify(stateSnapshot(nextWords[index])) !== beforeState) throw new Error("Interest user state changed; repair stopped.");
  const nextMaster = { ...master, words: nextWords, count: nextWords.length, savedAt: repairedAt, lexiconHash: computeLexiconHash(nextWords), integrityHash: computeIntegrityHash(nextWords) };
  const masterContent = `${JSON.stringify(nextMaster, null, 2)}\n`;
  const baselineContent = renderMasterLexiconBaseline({ count: nextMaster.count, version: nextMaster.version, fileHash: sha256(masterContent) });
  const nextReadingG = repairInterestReferences(readingG, repairedAt);
  nextReadingG.updatedAt = repairedAt;
  const nextSynonyms = repairInterestReferences(synonyms, repairedAt);
  nextSynonyms.updatedAt = repairedAt;
  const readingGContent = `${JSON.stringify(nextReadingG, null, 2)}\n`;
  const synonymContent = `${JSON.stringify(nextSynonyms, null, 2)}\n`;
  const report = { mode: shouldApply ? "apply" : "dry-run", version, masterEntries: 1, readingGEntries: nextReadingG.items.filter((entry) => entry.word === "interest").length, stableIdsChanged: 0, userStateFieldsChanged: 0, paidAiCalls: 0 };
  if (!shouldApply) return console.log(JSON.stringify(report, null, 2));
  const backupDirectory = path.join(root, "backups", "interest-headword-semantic-repair", repairedAt.replace(/[:.]/g, "-"));
  fs.mkdirSync(backupDirectory, { recursive: true });
  for (const filePath of [publicPath, staticPath, baselinePath, readingGPath, synonymPath]) fs.copyFileSync(filePath, path.join(backupDirectory, path.basename(filePath)));
  try {
    atomicWrite(publicPath, masterContent);
    atomicWrite(staticPath, masterContent);
    atomicWrite(baselinePath, baselineContent);
    atomicWrite(readingGPath, readingGContent);
    atomicWrite(synonymPath, synonymContent);
  } catch (error) {
    atomicWrite(publicPath, publicRaw);
    atomicWrite(staticPath, staticRaw);
    atomicWrite(baselinePath, baselineRaw);
    atomicWrite(readingGPath, readingGRaw);
    atomicWrite(synonymPath, synonymRaw);
    throw error;
  }
  console.log(JSON.stringify({ ...report, backupDirectory: path.relative(root, backupDirectory).replaceAll("\\", "/") }, null, 2));
}

main();
