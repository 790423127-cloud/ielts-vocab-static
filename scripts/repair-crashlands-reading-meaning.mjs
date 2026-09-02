#!/usr/bin/env node

/**
 * Repair the historical reading-context error where lowercase verb
 * "crashlands" was interpreted as the game title "Crashlands".
 * The entry IDs and all reading-learning state are preserved.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { renderMasterLexiconBaseline } from "../app/lib/vocab/master-lexicon-baseline-io.mjs";
import { computeIntegrityHash, computeLexiconHash } from "../app/lib/vocab/lexicon-guard.mjs";
import { USER_STATE_FIELDS } from "../app/lib/vocab/word-cache-meta.mjs";

const root = process.cwd();
const shouldApply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run") || !shouldApply;
const now = new Date().toISOString();
const masterPublicPath = path.join(root, "public", "data", "words.json");
const masterStaticPath = path.join(root, ".static-export-cache", "words.json");
const personalPath = path.join(root, "public", "data", "personal-reading-words.json");
const baselinePath = path.join(root, "app", "lib", "vocab", "master-lexicon-baseline.mjs");
const targetId = "reading-ca1ecfc6-d7f6-4b6b-b2d6-cef53d104a7d";

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function atomicWrite(filePath, content) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, content, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function protectedSnapshot(entry = {}) {
  const snapshot = { id: entry.id, wordId: entry.wordId, word: entry.word };
  for (const field of USER_STATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(entry, field)) snapshot[field] = entry[field];
  }
  return snapshot;
}

function isTarget(entry) {
  return Boolean(entry && typeof entry === "object")
    && String(entry.word || "").toLowerCase() === "crashlands"
    && (entry.id === targetId || entry.wordId === targetId);
}

function correctedContent(entry, { readingRecord = false } = {}) {
  return {
    ...entry,
    pos: "verb",
    primaryPos: "verb",
    meaning: "迫降；紧急着陆",
    meaningDetailZh: "是动词 crash-land 的第三人称单数形式，指飞机或航天器因事故、故障等被迫在非预定地点紧急着陆；也可比喻人或物突然、笨重地落下。",
    definition: "third-person singular of crash-land: to make an emergency landing, usually because of damage, danger, or mechanical failure",
    otherMeanings: [],
    example: "The spacecraft crashlands on an unfamiliar planet.",
    exampleCn: "这艘航天器迫降在一颗陌生的行星上。",
    forms: [{
      word: "crash-land",
      type: "base-form",
      pos: "verb",
      meaning: "迫降；紧急着陆",
      note: "crashlands 是 crash-land 的第三人称单数形式",
      source: "manual-reading-context-repair"
    }],
    wordFamily: [],
    synonyms: ["make an emergency landing"],
    synonymDetails: [{
      word: "make an emergency landing",
      pos: "verb phrase",
      meaningZh: "紧急着陆；迫降"
    }],
    collocations: [{ phrase: "crash-land safely", chinese: "安全迫降" }],
    phraseCollocations: [{ phrase: "crash-land on a planet", chinese: "迫降在一颗行星上" }],
    formsReviewed: true,
    formsReviewSource: "manual-reading-context-repair",
    wordFamilyReviewed: true,
    wordFamilyReviewSource: "manual-reading-context-repair",
    synonymsReviewed: true,
    synonymsReviewSource: "manual-reading-context-repair",
    ieltsUse: ["Reading", "旅行"],
    topics: ["航空", "太空"],
    difficulty: "高级加分",
    category: "IELTS 阅读 · 航空与太空",
    meaningDetailSource: "manual-reading-context-semantic-repair",
    meaningDetailReviewedAt: now,
    exampleSource: "manual-reading-context-semantic-repair",
    exampleReviewedAt: now,
    correctedFromMeaning: "（游戏名）《崩溃大陆》",
    contextSemanticRepairNote: "原句中的小写 crashlands 是动词 crash-land 的第三人称单数，并非游戏标题。",
    ...(readingRecord ? {
      readingMeaning: "（宇航员或航天器）迫降在某颗行星上",
      readingContextPending: false,
      readingContextReviewed: true,
      readingContextReviewSource: "manual-reading-context-semantic-repair",
      readingContextReviewedAt: now
    } : {}),
    updatedAt: now
  };
}

function rewritePersonalTree(value, state) {
  if (Array.isArray(value)) return value.map((item) => rewritePersonalTree(item, state));
  if (!value || typeof value !== "object") return value;
  let next = { ...value };
  if (isTarget(value)) {
    const readingRecord = Array.isArray(value.readingSources);
    next = correctedContent(next, { readingRecord });
    if (JSON.stringify(protectedSnapshot(value)) !== JSON.stringify(protectedSnapshot(next))) {
      throw new Error("Personal reading identity or learning state changed.");
    }
    state.matched += 1;
  }
  for (const [key, child] of Object.entries(next)) {
    if (child && typeof child === "object") next[key] = rewritePersonalTree(child, state);
  }
  return next;
}

function main() {
  if (shouldApply && dryRun) throw new Error("--apply and --dry-run cannot be used together");
  const publicRaw = fs.readFileSync(masterPublicPath);
  const staticRaw = fs.readFileSync(masterStaticPath);
  if (!publicRaw.equals(staticRaw)) throw new Error("The two authoritative master lexicon files differ; write stopped.");
  const master = JSON.parse(publicRaw.toString("utf8"));
  const personal = JSON.parse(fs.readFileSync(personalPath, "utf8"));
  const masterIndexes = master.words
    .map((entry, index) => isTarget(entry) ? index : -1)
    .filter((index) => index >= 0);
  if (masterIndexes.length !== 1) throw new Error(`Expected exactly one crashlands master entry; found ${masterIndexes.length}`);

  const masterIndex = masterIndexes[0];
  const masterBefore = master.words[masterIndex];
  const masterAfter = correctedContent(masterBefore);
  if (JSON.stringify(protectedSnapshot(masterBefore)) !== JSON.stringify(protectedSnapshot(masterAfter))) {
    throw new Error("Master identity or user state changed.");
  }
  const nextWords = [...master.words];
  nextWords[masterIndex] = masterAfter;
  const personalState = { matched: 0 };
  const nextPersonal = rewritePersonalTree(personal, personalState);
  if (personalState.matched < 1) throw new Error("No personal reading crashlands record was found.");

  const nextMaster = {
    ...master,
    words: nextWords,
    count: nextWords.length,
    savedAt: now,
    lexiconHash: computeLexiconHash(nextWords),
    integrityHash: computeIntegrityHash(nextWords)
  };
  const masterContent = `${JSON.stringify(nextMaster, null, 2)}\n`;
  const personalContent = `${JSON.stringify(nextPersonal, null, 2)}\n`;
  const report = {
    mode: shouldApply ? "apply" : "dry-run",
    networkCalls: 0,
    paidAiCalls: 0,
    masterEntriesRepaired: 1,
    personalOccurrencesRepaired: personalState.matched,
    stableIdsChanged: 0,
    userStateFieldsChanged: 0,
    before: { pos: masterBefore.pos, meaning: masterBefore.meaning, example: masterBefore.example },
    after: { pos: masterAfter.pos, meaning: masterAfter.meaning, example: masterAfter.example }
  };
  if (!shouldApply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const stamp = now.replace(/[:.]/g, "-");
  const backupDirectory = path.join(root, "backups", "crashlands-context-meaning-repair", stamp);
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backups = [
    [masterPublicPath, path.join(backupDirectory, "words.json")],
    [masterStaticPath, path.join(backupDirectory, "cache-words.json")],
    [personalPath, path.join(backupDirectory, "personal-reading-words.json")],
    [baselinePath, path.join(backupDirectory, "master-lexicon-baseline.mjs")]
  ];
  for (const [source, destination] of backups) fs.copyFileSync(source, destination);
  const baselineContent = renderMasterLexiconBaseline({
    count: nextMaster.count,
    version: nextMaster.version,
    fileHash: sha256(masterContent)
  });
  try {
    atomicWrite(masterPublicPath, masterContent);
    atomicWrite(masterStaticPath, masterContent);
    atomicWrite(personalPath, personalContent);
    atomicWrite(baselinePath, baselineContent);
  } catch (error) {
    for (const [destination, source] of backups) fs.copyFileSync(source, destination);
    throw error;
  }
  report.backupDirectory = path.relative(root, backupDirectory).replaceAll("\\", "/");
  console.log(JSON.stringify(report, null, 2));
}

main();
