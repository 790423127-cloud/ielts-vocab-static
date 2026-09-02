#!/usr/bin/env node

/**
 * Retire the invalid back-formation "unidentify" from active study without
 * deleting its stable record. The valid headword "unidentified" already
 * exists, so the old row becomes a reversible reference alias.
 */
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
const version = "manual-unidentify-reference-alias-v3-20260812";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function atomicWrite(filePath, content) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, content, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function stateSnapshot(entry = {}) {
  return Object.fromEntries(USER_STATE_FIELDS
    .filter((field) => Object.prototype.hasOwnProperty.call(entry, field))
    .map((field) => [field, entry[field]]));
}

function main() {
  const publicRaw = fs.readFileSync(publicPath);
  const staticRaw = fs.readFileSync(staticPath);
  if (!publicRaw.equals(staticRaw)) throw new Error("The two authoritative master lexicon files differ; repair stopped.");

  const baselineRaw = fs.readFileSync(baselinePath);
  const payload = JSON.parse(publicRaw.toString("utf8"));
  const badIndexes = payload.words.map((entry, index) => entry.word === "unidentify" ? index : -1).filter((index) => index >= 0);
  const targetEntries = payload.words.filter((entry) => entry.word === "unidentified");
  if (badIndexes.length !== 1 || targetEntries.length !== 1) {
    throw new Error(`Expected one source and one target, got ${badIndexes.length}/${targetEntries.length}.`);
  }

  const repairedAt = new Date().toISOString();
  const sourceIndex = badIndexes[0];
  const source = payload.words[sourceIndex];
  const target = targetEntries[0];
  const sourceState = JSON.stringify(stateSnapshot(source));
  const nextSource = {
    ...source,
    studyMode: "reference",
    entryType: "word-reference",
    isReferenceOnly: true,
    deprecatedHeadword: true,
    baseWord: target.word,
    baseWordId: target.id,
    redirectToWord: target.word,
    relationType: "import typo",
    canonicalWord: target.word,
    canonicalWordId: target.id,
    referenceReason: "invalid-backformation-duplicate-of-valid-headword",
    phonetic: "",
    pos: "reference",
    meaning: "参见 unidentified（身份不明的；未确认的）",
    definition: "参见 unidentified（身份不明的；未确认的）",
    meaningDetailZh: "unidentify 不是本词库采用的标准学习词形；需要表达‘身份不明的、未确认的’时使用 unidentified。本记录仅保留为旧导入别名，并会自动跳转到 unidentified。",
    meaningDetailSource: "manual-structural-reference-repair",
    example: "An unidentified object was found near the shore.",
    exampleCn: "海岸附近发现了一个身份不明的物体。",
    exampleStatus: "editorial_reference_example",
    collocations: [],
    phraseCollocations: [],
    forms: [],
    wordFamily: [],
    answer: target.word,
    acceptedAnswers: [target.word],
    difficulty: "不进入学习",
    category: "参考别名 · 非标准反向构词",
    ieltsUse: [],
    topics: ["来源词形待核", "参考别名"],
    readingPriority: false,
    gtPlanStage: 4,
    aiGenerated: false,
    entryStatus: "canonical_reference_only",
    structuralRepair: { version, repairedAt, action: "retained-as-reference-alias" },
    qualityFlags: [...new Set([...(source.qualityFlags || []), "invalid_headword_retired", "canonical_reference_retained"])],
    updatedAt: repairedAt
  };
  if (JSON.stringify(stateSnapshot(nextSource)) !== sourceState) throw new Error("User state changed; repair stopped.");

  const nextWords = payload.words.map((entry, index) => index === sourceIndex ? nextSource : entry);
  if (nextWords.length !== payload.words.length || nextSource.id !== source.id || nextSource.wordId !== source.wordId) {
    throw new Error("Word count or stable identity changed; repair stopped.");
  }
  const nextPayload = {
    ...payload,
    words: nextWords,
    count: nextWords.length,
    savedAt: repairedAt,
    lexiconHash: computeLexiconHash(nextWords),
    integrityHash: computeIntegrityHash(nextWords)
  };
  const content = `${JSON.stringify(nextPayload, null, 2)}\n`;
  const baseline = renderMasterLexiconBaseline({ count: nextPayload.count, version: nextPayload.version, fileHash: sha256(content) });
  const report = {
    mode: shouldApply ? "apply" : "dry-run",
    version,
    source: { word: source.word, id: source.id },
    target: { word: target.word, id: target.id },
    action: "retained-as-reference-alias",
    deletedEntries: 0,
    stableIdsChanged: 0,
    userStateFieldsChanged: 0,
    networkCalls: 0,
    paidAiCalls: 0
  };
  if (!shouldApply) return console.log(JSON.stringify(report, null, 2));

  const backupDirectory = path.join(root, "backups", "unidentify-reference-alias", repairedAt.replace(/[:.]/g, "-"));
  fs.mkdirSync(backupDirectory, { recursive: true });
  fs.copyFileSync(publicPath, path.join(backupDirectory, "public__data__words.json"));
  fs.copyFileSync(staticPath, path.join(backupDirectory, "static-export-cache__words.json"));
  fs.copyFileSync(baselinePath, path.join(backupDirectory, "master-lexicon-baseline.mjs"));
  try {
    atomicWrite(publicPath, content);
    atomicWrite(staticPath, content);
    atomicWrite(baselinePath, baseline);
  } catch (error) {
    atomicWrite(publicPath, publicRaw);
    atomicWrite(staticPath, staticRaw);
    atomicWrite(baselinePath, baselineRaw);
    throw error;
  }
  report.backupDirectory = path.relative(root, backupDirectory).replaceAll("\\", "/");
  console.log(JSON.stringify(report, null, 2));
}

main();
