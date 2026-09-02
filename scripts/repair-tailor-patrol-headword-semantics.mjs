#!/usr/bin/env node

/**
 * Repair two headwords whose stored part-of-speech structure did not cover
 * their common noun and verb uses. Local editorial data only; no network/API.
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
const version = "manual-tailor-patrol-headword-semantic-repair-v1-20260812";

const patches = Object.freeze({
  tailor: {
    pos: "noun / verb",
    primaryPos: "noun",
    meaning: "裁缝；定制；调整以适应",
    primaryMeaningZh: "裁缝",
    detail: "作名词最常指制作、修改衣服的裁缝；作动词表示为特定对象或目的量身定制、调整。tailor something to someone's needs 是常见结构。",
    example: "The tailor adjusted the suit to fit him perfectly.",
    exampleCn: "裁缝修改了西装，使它非常合身。",
    otherMeanings: [
      {
        pos: "verb",
        meaningZh: "定制；调整以适应",
        definitionEn: "to make or adapt something for a particular person, purpose, or need",
        example: "The course is tailored to your needs.",
        exampleCn: "这门课程是根据你的需要量身定制的。"
      }
    ],
    senses: [
      {
        pos: "noun",
        meaningZh: "裁缝",
        definition: "以制作或修改衣服为职业的人，尤其指制作男装的人。",
        example: "The tailor adjusted the suit to fit him perfectly.",
        exampleZh: "裁缝修改了西装，使它非常合身。"
      },
      {
        pos: "verb",
        meaningZh: "定制；调整以适应",
        definition: "为特定的人、目的或需要制作或调整某物。",
        example: "The course is tailored to your needs.",
        exampleZh: "这门课程是根据你的需要量身定制的。"
      }
    ]
  },
  patrol: {
    pos: "noun / verb",
    primaryPos: "noun",
    meaning: "巡逻；巡查",
    primaryMeaningZh: "巡逻；巡查",
    detail: "作名词指为保障安全而进行的定期巡逻，或执行巡逻任务的一组人员；作动词表示在某区域来回巡查。on patrol 表示正在巡逻，patrol an area 表示巡查某区域。",
    example: "The police increased their patrols in the area at night.",
    exampleCn: "警方增加了夜间在该地区的巡逻。",
    otherMeanings: [
      {
        pos: "verb",
        meaningZh: "巡逻；巡查",
        definitionEn: "to move regularly around an area in order to keep it safe",
        example: "Security guards patrol the building at night.",
        exampleCn: "保安夜间在大楼内巡逻。"
      }
    ],
    senses: [
      {
        pos: "noun",
        meaningZh: "巡逻；巡逻队",
        definition: "为保障安全而进行的定期巡查，或执行巡查任务的一组人员。",
        example: "The police increased their patrols in the area at night.",
        exampleZh: "警方增加了夜间在该地区的巡逻。"
      },
      {
        pos: "verb",
        meaningZh: "巡逻；巡查",
        definition: "为保障安全而在某一区域定期来回检查。",
        example: "Security guards patrol the building at night.",
        exampleZh: "保安夜间在大楼内巡逻。"
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

function repairMasterEntry(entry, patch, repairedAt) {
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
  return {
    ...entry,
    pos: patch.pos,
    primaryPos: patch.primaryPos,
    primaryMeaningZh: patch.primaryMeaningZh,
    meaning: patch.meaning,
    meaningZh: patch.meaning,
    definition: patch.meaning,
    meaningDetailZh: patch.detail,
    example: patch.example,
    exampleCn: patch.exampleCn,
    otherMeanings: patch.otherMeanings,
    senses: patch.senses.map((sense, index) => ({
      senseId: `${entry.id}_${sense.pos}_${String(index + 1).padStart(2, "0")}`,
      ...sense,
      isPrimary: index === 0,
      readingCommon: true,
      sourceFiles: [version],
      editorialSource: "manual-semantic-repair"
    })),
    meaningCoverageReviewSource: "manual-semantic-repair",
    meaningCoverageReviewedAt: repairedAt,
    updatedAt: repairedAt
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
    return repairMasterEntry(entry, patch, repairedAt);
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
  const completionResult = repairCompletion(completion, repairedAt);
  if (completionResult.repaired !== 1) throw new Error(`Expected one completion cache entry, got ${completionResult.repaired}.`);
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

  const backupDirectory = path.join(root, "backups", "tailor-patrol-headword-semantic-repair", repairedAt.replace(/[:.]/g, "-"));
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
