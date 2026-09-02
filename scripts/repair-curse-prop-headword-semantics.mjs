#!/usr/bin/env node

/**
 * Repair two entries whose stored part of speech disagreed with their own
 * examples/common headword uses. Local editorial data only; no network/API.
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
const readingGPath = path.join(root, "public", "data", "reading-g-vocab.json");
const completionPath = path.join(root, "public", "data", "reading-g-ai-completions.json");
const version = "manual-curse-prop-headword-semantic-repair-v1-20260812";

const patches = Object.freeze({
  curse: {
    pos: "noun / verb",
    primaryPos: "noun",
    meaning: "诅咒；祸害；咒骂",
    primaryMeaningZh: "诅咒；祸害",
    detail: "作名词可指希望坏事降临某人的诅咒，也可比喻长期造成痛苦的祸害；作动词表示诅咒或用粗话咒骂。curse under one's breath 指低声咒骂。",
    example: "They believed the old house was under a curse.",
    exampleCn: "他们认为那栋老房子受到了诅咒。",
    otherMeanings: [
      {
        pos: "verb",
        meaningZh: "诅咒；咒骂",
        definitionEn: "to swear at someone or say that something bad should happen to them",
        example: "He cursed under his breath.",
        exampleCn: "他低声咒骂。"
      }
    ],
    senses: [
      {
        pos: "noun",
        meaningZh: "诅咒；祸害",
        definition: "希望坏事降临某人的话语，或长期造成痛苦和损害的事物。",
        example: "They believed the old house was under a curse.",
        exampleZh: "他们认为那栋老房子受到了诅咒。"
      },
      {
        pos: "verb",
        meaningZh: "诅咒；咒骂",
        definition: "诅咒某人，或生气时使用粗鲁、冒犯性的语言。",
        example: "He cursed under his breath.",
        exampleZh: "他低声咒骂。"
      }
    ]
  },
  prop: {
    pos: "noun / verb",
    primaryPos: "noun",
    meaning: "支撑物；道具；支撑",
    primaryMeaningZh: "支撑物；道具",
    detail: "作名词可指支柱、支撑物，也常指戏剧或电影中的道具；作动词表示撑住、使保持某姿势。prop up 还可比喻勉强维持。",
    example: "Use a prop to hold the door open.",
    exampleCn: "用一个支撑物把门撑开。",
    otherMeanings: [
      {
        pos: "noun",
        meaningZh: "道具",
        definitionEn: "an object used by actors in a play, film, or television production",
        example: "The sword was only a stage prop.",
        exampleCn: "那把剑只是一件舞台道具。"
      },
      {
        pos: "verb",
        meaningZh: "支撑；撑住",
        definitionEn: "to support something or keep it in a particular position",
        example: "She propped the door open with a chair.",
        exampleCn: "她用一把椅子把门撑开。"
      }
    ],
    senses: [
      {
        pos: "noun",
        meaningZh: "支撑物；支柱",
        definition: "用于托住某物或使其保持特定位置的物体。",
        example: "Use a prop to hold the door open.",
        exampleZh: "用一个支撑物把门撑开。"
      },
      {
        pos: "noun",
        meaningZh: "道具",
        definition: "戏剧、电影或电视制作中由演员使用的物品。",
        example: "The sword was only a stage prop.",
        exampleZh: "那把剑只是一件舞台道具。"
      },
      {
        pos: "verb",
        meaningZh: "支撑；撑住",
        definition: "托住某物，或使其保持特定的位置、姿势。",
        example: "She propped the door open with a chair.",
        exampleZh: "她用一把椅子把门撑开。"
      }
    ]
  }
});

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
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

function repairEntry(entry, patch, repairedAt) {
  return {
    ...entry,
    pos: patch.pos,
    posOriginal: patch.pos,
    declaredPos: patch.pos,
    primaryPos: patch.primaryPos,
    meaning: patch.meaning,
    definition: patch.meaning,
    meaningOriginal: patch.meaning,
    primaryMeaningZh: patch.primaryMeaningZh,
    meaningDetailZh: patch.detail,
    meaningDetailedZh: patch.detail,
    meaningDetailSource: "manual-common-meaning-review",
    meaningDetailReviewedAt: repairedAt,
    example: patch.example,
    exampleCn: patch.exampleCn,
    exampleStatus: "editorial_example",
    otherMeanings: patch.otherMeanings,
    meaningsZh: patch.senses.map((sense, index) => ({
      gloss: sense.meaningZh,
      posFamily: sense.pos,
      label: index === 0 ? "核心义" : "常见义",
      confidence: "manual-reviewed",
      evidence: [version]
    })),
    quizSenses: patch.senses.map((sense, index) => ({
      senseId: `${entry.id}-quiz-${sense.pos}-${index + 1}`,
      quizMeaningZh: sense.meaningZh,
      meaningDetailedZh: sense.definition,
      posFamily: sense.pos,
      confidence: "manual-reviewed",
      generatedAt: repairedAt
    })),
    senses: patch.senses.map((sense, index) => ({
      senseId: `${entry.id}_${sense.pos}_${String(index + 1).padStart(2, "0")}`,
      ...sense,
      isPrimary: index === 0,
      readingCommon: true,
      sourceFiles: [version],
      editorialSource: "manual-semantic-repair"
    })),
    multiPosSenseReview: {
      version,
      reviewedAt: repairedAt,
      primaryPolicy: "common independent headword meaning first",
      origin: "manual-semantic-repair"
    },
    updatedAt: repairedAt
  };
}

function repairReadingGEntry(entry, patch, repairedAt) {
  const repaired = repairEntry(entry, patch, repairedAt);
  return {
    ...repaired,
    meaningZh: patch.meaning,
    meaningCoverageReviewSource: "manual-semantic-repair",
    meaningCoverageReviewedAt: repairedAt
  };
}

function repairCompletion(payload, repairedAt) {
  const next = structuredClone(payload);
  let repaired = 0;
  for (const [word, patch] of Object.entries(patches)) {
    const entry = next.entries?.[word];
    if (!entry?.profile) continue;
    entry.profile = {
      ...entry.profile,
      pos: patch.primaryPos,
      meaning: patch.primaryMeaningZh,
      meaningDetailZh: patch.detail,
      definition: patch.senses[0].definition,
      example: patch.example,
      exampleCn: patch.exampleCn,
      otherMeanings: patch.otherMeanings,
      editorialReviewSource: version,
      editorialReviewedAt: repairedAt
    };
    repaired += 1;
  }
  next.updatedAt = repairedAt;
  return { payload: next, repaired };
}

function main() {
  const publicRaw = fs.readFileSync(publicPath);
  const staticRaw = fs.readFileSync(staticPath);
  if (!publicRaw.equals(staticRaw)) throw new Error("The two authoritative master lexicon files differ; repair stopped.");

  const baselineRaw = fs.readFileSync(baselinePath);
  const readingGRaw = fs.readFileSync(readingGPath);
  const completionRaw = fs.readFileSync(completionPath);
  const master = JSON.parse(publicRaw.toString("utf8"));
  const readingG = JSON.parse(readingGRaw.toString("utf8"));
  const completion = JSON.parse(completionRaw.toString("utf8"));
  const repairedAt = new Date().toISOString();

  const masterCoverage = Object.fromEntries(Object.keys(patches).map((word) => [word, 0]));
  const nextWords = master.words.map((entry) => {
    const patch = patches[entry.word];
    if (!patch) return entry;
    masterCoverage[entry.word] += 1;
    return repairEntry(entry, patch, repairedAt);
  });
  if (Object.values(masterCoverage).some((count) => count !== 1)) {
    throw new Error(`Unexpected master coverage: ${JSON.stringify(masterCoverage)}`);
  }
  if (nextWords.length !== master.words.length) throw new Error("Master word count changed; repair stopped.");
  for (let index = 0; index < master.words.length; index += 1) {
    if (JSON.stringify(protectedSnapshot(master.words[index])) !== JSON.stringify(protectedSnapshot(nextWords[index]))) {
      throw new Error(`Protected identity or user state changed at master index ${index}; repair stopped.`);
    }
  }

  let readingGRepaired = 0;
  const nextReadingG = {
    ...readingG,
    items: readingG.items.map((entry) => {
      const patch = patches[entry.word];
      if (!patch) return entry;
      readingGRepaired += 1;
      return repairReadingGEntry(entry, patch, repairedAt);
    }),
    updatedAt: repairedAt
  };
  if (readingGRepaired !== 1) throw new Error(`Expected one G entry, got ${readingGRepaired}.`);

  const completionResult = repairCompletion(completion, repairedAt);
  if (completionResult.repaired !== 1) {
    throw new Error(`Expected one G completion cache entry, got ${completionResult.repaired}.`);
  }

  const nextMaster = {
    ...master,
    words: nextWords,
    count: nextWords.length,
    savedAt: repairedAt,
    lexiconHash: computeLexiconHash(nextWords),
    integrityHash: computeIntegrityHash(nextWords)
  };
  const masterContent = `${JSON.stringify(nextMaster, null, 2)}\n`;
  const readingGContent = `${JSON.stringify(nextReadingG, null, 2)}\n`;
  const completionContent = `${JSON.stringify(completionResult.payload, null, 2)}\n`;
  const baselineContent = renderMasterLexiconBaseline({
    count: nextMaster.count,
    version: nextMaster.version,
    fileHash: sha256(masterContent)
  });

  const report = {
    mode: shouldApply ? "apply" : "dry-run",
    version,
    masterCoverage,
    readingGRepaired,
    completionCacheRepaired: completionResult.repaired,
    stableIdsChanged: 0,
    userStateFieldsChanged: 0,
    networkCalls: 0,
    paidAiCalls: 0
  };
  if (!shouldApply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const backupDirectory = path.join(root, "backups", "curse-prop-headword-semantic-repair", repairedAt.replace(/[:.]/g, "-"));
  fs.mkdirSync(backupDirectory, { recursive: true });
  const sources = [publicPath, staticPath, baselinePath, readingGPath, completionPath];
  for (const filePath of sources) {
    const relativeName = path.relative(root, filePath).replaceAll("\\", "__").replaceAll("/", "__");
    fs.copyFileSync(filePath, path.join(backupDirectory, relativeName));
  }

  try {
    atomicWrite(publicPath, masterContent);
    atomicWrite(staticPath, masterContent);
    atomicWrite(baselinePath, baselineContent);
    atomicWrite(readingGPath, readingGContent);
    atomicWrite(completionPath, completionContent);
  } catch (error) {
    atomicWrite(publicPath, publicRaw);
    atomicWrite(staticPath, staticRaw);
    atomicWrite(baselinePath, baselineRaw);
    atomicWrite(readingGPath, readingGRaw);
    atomicWrite(completionPath, completionRaw);
    throw error;
  }

  report.backupDirectory = path.relative(root, backupDirectory).replaceAll("\\", "/");
  console.log(JSON.stringify(report, null, 2));
}

main();
