#!/usr/bin/env node

/**
 * Reconcile reviewed master-lexicon content and structural metadata without
 * changing physical entries, stable IDs, headwords, or user learning state.
 *
 * Usage:
 *   node scripts/reconcile-master-lexicon-integrity.mjs --dry-run
 *   node scripts/reconcile-master-lexicon-integrity.mjs --apply
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { computeIntegrityHash, computeLexiconHash } from "../app/lib/vocab/lexicon-guard.mjs";
import { renderMasterLexiconBaseline } from "../app/lib/vocab/master-lexicon-baseline-io.mjs";
import { buildLocalOptimizeResult } from "../app/lib/vocab/page-word-helpers.mjs";
import { isBrushableWord, isReferenceWord } from "../app/lib/vocab/word-study-eligibility.mjs";
import { USER_STATE_FIELDS } from "../app/lib/vocab/word-cache-meta.mjs";

const root = process.cwd();
const shouldApply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run") || !shouldApply;
const now = new Date().toISOString();
const reviewVersion = "manual-morphology-audit-v9-20260812";
const senseReviewVersion = "manual-common-sense-order-v1-20260812";
const publicPath = path.join(root, "public", "data", "words.json");
const staticPath = path.join(root, ".static-export-cache", "words.json");
const meaningPath = path.join(root, "public", "data", "meaning-6000.json");
const retirementsPath = path.join(root, "app", "lib", "vocab", "master-lexicon-retirements.json");
const baselinePath = path.join(root, "app", "lib", "vocab", "master-lexicon-baseline.mjs");
const endings = ["s", "ed", "ing", "er", "est", "en", "ind"];
const transientCodes = new Set(["EBUSY", "EPERM", "EACCES", "UNKNOWN"]);

const MANUAL_SENSE_REPAIRS = Object.freeze({
  grave: {
    pos: "adjective/noun",
    senses: [["adjective", "严重的；严肃的"], ["noun", "坟墓"]]
  },
  latin: {
    pos: "noun/adjective",
    senses: [["noun", "拉丁语"], ["adjective", "拉丁的；拉丁文化的"]]
  },
  censor: {
    pos: "verb/noun",
    senses: [["verb", "审查；删改"], ["noun", "审查员"]]
  },
  alight: {
    pos: "verb/adjective",
    senses: [["verb", "降落；下车"], ["adjective", "燃烧着的；被照亮的"]]
  },
  bob: {
    pos: "verb/noun",
    senses: [["verb", "上下快速摆动"], ["noun", "齐颈短发；波波头"]]
  },
  beloved: {
    pos: "adjective/noun",
    senses: [["adjective", "心爱的；受人爱戴的"], ["noun", "心爱的人"]]
  },
  prerequisite: {
    pos: "noun/adjective",
    senses: [["noun", "先决条件"], ["adjective", "必备的"]]
  },
  rattle: {
    pos: "verb/noun",
    senses: [["verb", "发出咔嗒声；使紧张"], ["noun", "拨浪鼓；咔嗒声"]]
  },
  harness: {
    pos: "verb/noun",
    senses: [["verb", "利用；控制"], ["noun", "马具；安全带"]]
  },
  stitch: {
    pos: "noun/verb",
    example: "Each stitch must be neat and even.",
    exampleCn: "每一针都必须整齐均匀。",
    senses: [["noun", "针脚；缝线"], ["verb", "缝；缝合"]]
  },
  latino: {
    pos: "noun/adjective",
    example: "He is a Latino who grew up in this neighborhood.",
    exampleCn: "他是在这个社区长大的拉丁美洲裔人。",
    senses: [["noun", "拉丁美洲裔人"], ["adjective", "拉丁美洲裔的"]]
  },
  prop: {
    pos: "noun/verb",
    senses: [["noun", "支撑物；道具"], ["verb", "支撑；撑住"]]
  },
  scoop: {
    pos: "noun/verb",
    senses: [["noun", "勺；一勺；独家新闻"], ["verb", "舀取；抢先报道"]]
  },
  cardboard: {
    pos: "noun/adjective",
    senses: [["noun", "纸板；硬纸板"], ["adjective", "纸板制的"]]
  },
  chill: {
    pos: "noun/verb/adjective",
    senses: [["noun", "寒意；寒冷"], ["verb", "使冷却；放松"], ["adjective", "寒冷的；冷淡的"]]
  },
  narcotic: {
    pos: "noun/adjective",
    senses: [["noun", "麻醉性药物"], ["adjective", "麻醉性的；致昏睡的"]]
  },
  flex: {
    pos: "verb/noun",
    senses: [["verb", "弯曲；绷紧；炫耀"], ["noun", "弯曲动作；炫耀"]]
  },
  outright: {
    pos: "adverb/adjective",
    senses: [["adverb", "完全地；公然地"], ["adjective", "彻底的；完全的"]]
  },
  coping: {
    pos: "noun/verb",
    senses: [["noun", "应对；应对方式"], ["verb", "应付；处理"]]
  },
  modeling: {
    pos: "noun/verb",
    senses: [["noun", "建模；模特工作；塑造过程"], ["verb", "建模；塑造；当模特"]]
  },
  founding: {
    pos: "noun/adjective",
    senses: [["noun", "创立；成立"], ["adjective", "创建的；创始的"]]
  },
  begging: {
    pos: "noun/verb",
    senses: [["noun", "乞讨"], ["verb", "恳求；乞求"]]
  },
  longstay: {
    pos: "adjective/noun",
    senses: [["adjective", "长期停留的；长期停车的"], ["noun", "长期停留；长住"]]
  }
});

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function normalizeWord(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase();
}

function wait(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function retryFileLock(operation, label) {
  const delays = [25, 50, 100, 200, 400, 800];
  for (let attempt = 0; ; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      if (!transientCodes.has(error?.code) || attempt >= delays.length) {
        error.message = `${label}: ${error.message}`;
        throw error;
      }
      wait(delays[attempt]);
    }
  }
}

function atomicWrite(filePath, content) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temporaryPath, content, "utf8");
    retryFileLock(() => fs.renameSync(temporaryPath, filePath), `Unable to replace ${path.relative(root, filePath)}`);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
  }
}

function protectedSnapshot(entry = {}) {
  const snapshot = { id: entry.id, wordId: entry.wordId, word: entry.word };
  for (const field of USER_STATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(entry, field)) snapshot[field] = entry[field];
  }
  return snapshot;
}

function applySenseRepair(entry, repair) {
  const example = repair.example || entry.example;
  const exampleCn = repair.exampleCn || entry.exampleCn || entry.exampleZh;
  const previousSenses = Array.isArray(entry.senses) ? entry.senses : [];
  const senses = repair.senses.map(([pos, meaningZh], index) => {
    const previous = previousSenses[index] || {};
    const { isPrimary: _oldPrimary, readingCommon: _oldReadingCommon, ...rest } = previous;
    return {
      ...rest,
      senseId: previous.senseId || `${entry.id}_${pos}_${String(index + 1).padStart(2, "0")}`,
      pos,
      meaningZh,
      definition: index === 0 ? entry.definition : String(previous.definition || ""),
      example: index === 0 ? example : String(previous.example || ""),
      exampleZh: index === 0 ? exampleCn : String(previous.exampleZh || previous.exampleCn || ""),
      ...(index === 0 ? { isPrimary: true, readingCommon: true } : {}),
      sourceFiles: [...new Set([...(Array.isArray(previous.sourceFiles) ? previous.sourceFiles : []), senseReviewVersion])],
      editorialSource: "manual-common-sense-order"
    };
  });
  return {
    ...entry,
    pos: repair.pos,
    declaredPos: repair.pos,
    primaryPos: repair.senses[0][0],
    primaryMeaningZh: repair.senses[0][1],
    senses,
    ...(repair.example ? { example: repair.example, exampleCn: repair.exampleCn } : {}),
    multiPosSenseReview: {
      version: senseReviewVersion,
      reviewedAt: now,
      primaryPolicy: "common dictionary meaning first; reading context does not override the master entry",
      origin: "manual-semantic-self-check"
    },
    updatedAt: now
  };
}

function needsSenseRepair(entry, repair) {
  if (entry.pos !== repair.pos || entry.declaredPos !== repair.pos) return true;
  if (entry.primaryPos !== repair.senses[0][0] || entry.primaryMeaningZh !== repair.senses[0][1]) return true;
  if (repair.example && (entry.example !== repair.example || entry.exampleCn !== repair.exampleCn)) return true;
  if (entry.multiPosSenseReview?.version !== senseReviewVersion) return true;
  if (!Array.isArray(entry.senses) || entry.senses.length !== repair.senses.length) return true;
  return repair.senses.some(([pos, meaningZh], index) => (
    entry.senses[index]?.pos !== pos
    || entry.senses[index]?.meaningZh !== meaningZh
    || entry.senses[index]?.isPrimary !== (index === 0 ? true : undefined)
  ));
}

function main() {
  if (shouldApply && dryRun) throw new Error("--apply and --dry-run cannot be used together");
  const publicRaw = fs.readFileSync(publicPath);
  const staticRaw = fs.readFileSync(staticPath);
  if (!publicRaw.equals(staticRaw)) throw new Error("The two authoritative master lexicon files differ; reconciliation stopped.");

  const payload = JSON.parse(publicRaw.toString("utf8"));
  const meaningPayload = JSON.parse(fs.readFileSync(meaningPath, "utf8"));
  const retirements = JSON.parse(fs.readFileSync(retirementsPath, "utf8"));
  if (!Array.isArray(payload.words) || payload.words.length !== Number(payload.count)) {
    throw new Error("Master lexicon words/count mismatch; reconciliation stopped.");
  }

  const beforeWords = payload.words;
  const optimizeResult = buildLocalOptimizeResult(beforeWords);
  let meaningZhSynced = 0;
  let senseRepairsApplied = 0;
  const nextWords = optimizeResult.words.map((entry) => {
    let next = entry;
    const repair = MANUAL_SENSE_REPAIRS[normalizeWord(entry.word)];
    if (repair && needsSenseRepair(next, repair)) {
      next = applySenseRepair(next, repair);
      senseRepairsApplied += 1;
    }
    if (Object.prototype.hasOwnProperty.call(next, "meaningZh") && next.meaningZh !== next.meaning) {
      next = { ...next, meaningZh: next.meaning, updatedAt: now };
      meaningZhSynced += 1;
    }
    return next;
  });

  if (nextWords.length !== beforeWords.length) throw new Error("Physical word count changed; reconciliation stopped.");
  for (let index = 0; index < beforeWords.length; index += 1) {
    if (JSON.stringify(protectedSnapshot(beforeWords[index])) !== JSON.stringify(protectedSnapshot(nextWords[index]))) {
      throw new Error(`Stable identity, headword, or user state changed: ${beforeWords[index].word}`);
    }
  }
  const changedEntries = nextWords.reduce(
    (sum, entry, index) => sum + (JSON.stringify(entry) === JSON.stringify(beforeWords[index]) ? 0 : 1),
    0
  );

  const references = nextWords.filter(isReferenceWord);
  const brushable = nextWords.filter(isBrushableWord);
  const byWord = new Map(nextWords.map((entry) => [normalizeWord(entry.word), entry]));
  for (const reference of references) {
    const base = byWord.get(normalizeWord(reference.baseWord));
    if (!base || !reference.baseWordId || base.id !== reference.baseWordId || reference.redirectToWord !== reference.baseWord || !isBrushableWord(base)) {
      throw new Error(`Reference still does not resolve to one brushable base: ${reference.word}`);
    }
  }

  const storedFormLinks = nextWords.reduce((sum, entry) => sum + (Array.isArray(entry.forms) ? entry.forms.length : 0), 0);
  const suffixCandidates = nextWords.filter((entry) => endings.some((ending) => normalizeWord(entry.word).endsWith(ending))).length;
  const retiredSuffixCandidates = (retirements.entries || []).filter((entry) => (
    entry.morphologyAuditIncluded !== false
    && endings.some((ending) => normalizeWord(entry.word).endsWith(ending))
  )).length;
  const morphologyAuditValues = {
    ...payload.morphologyAudit,
    version: reviewVersion,
    rawSuffixHeadwordsReviewed: suffixCandidates + retiredSuffixCandidates,
    storedFormLinksReviewed: storedFormLinks,
    inflectedReferences: references.length,
    brushableHeadwords: brushable.length,
    meaningZhRepaired: Number(payload.morphologyAudit?.meaningZhRepaired || 0) + meaningZhSynced,
    referenceLinksRepaired: Number(payload.morphologyAudit?.referenceLinksRepaired || 0),
    wrongOwnerIdsRemoved: Number(payload.morphologyAudit?.wrongOwnerIdsRemoved || 0) + optimizeResult.stats.wrongOwnerLinksRemoved,
    danglingFormsRemoved: Number(payload.morphologyAudit?.danglingFormsRemoved || 0) + optimizeResult.stats.danglingFormsRemoved,
    emptyFormsRemoved: optimizeResult.stats.normalizedForms,
    senseRowsRepaired: Number(payload.morphologyAudit?.senseRowsRepaired || 0) + senseRepairsApplied,
  };
  const existingAuditComparable = { ...payload.morphologyAudit };
  const nextAuditComparable = { ...morphologyAuditValues };
  delete existingAuditComparable.reviewedAt;
  delete nextAuditComparable.reviewedAt;
  const morphologyAuditChanged = JSON.stringify(existingAuditComparable) !== JSON.stringify(nextAuditComparable);
  const morphologyAudit = morphologyAuditChanged
    ? { ...morphologyAuditValues, reviewedAt: now }
    : payload.morphologyAudit;
  const nextPayload = {
    ...payload,
    words: nextWords,
    count: nextWords.length,
    savedAt: changedEntries > 0 || morphologyAuditChanged ? now : payload.savedAt,
    morphologyAudit,
    lexiconHash: computeLexiconHash(nextWords),
    integrityHash: computeIntegrityHash(nextWords)
  };
  const wordsContent = `${JSON.stringify(nextPayload, null, 2)}\n`;
  const fileHash = sha256(wordsContent);
  const baselineContent = renderMasterLexiconBaseline({
    count: nextPayload.count,
    version: nextPayload.version,
    fileHash
  });
  const nextMeaningPayload = {
    ...meaningPayload,
    sourceLexiconVersion: nextPayload.version,
    sourceLexiconCount: nextWords.length,
    sourceLexiconSha256: fileHash
  };
  const meaningContent = `${JSON.stringify(nextMeaningPayload, null, 2)}\n`;
  const report = {
    mode: shouldApply ? "apply" : "dry-run",
    version: reviewVersion,
    physicalEntriesBefore: beforeWords.length,
    physicalEntriesAfter: nextWords.length,
    brushableEntries: brushable.length,
    referenceEntries: references.length,
    changedEntries,
    meaningZhSynced,
    senseRepairsApplied,
    formStats: optimizeResult.stats,
    storedFormLinksAfter: storedFormLinks,
    sourceLexiconSha256: fileHash,
    stableIdsChanged: 0,
    headwordsChanged: 0,
    userStateFieldsChanged: 0,
    networkCalls: 0,
    paidAiCalls: 0
  };

  if (!shouldApply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const backupDirectory = path.join(root, "backups", "master-lexicon-integrity-reconciliation", now.replace(/[:.]/g, "-"));
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backups = [
    [publicPath, path.join(backupDirectory, "public__data__words.json")],
    [staticPath, path.join(backupDirectory, "static-export-cache__words.json")],
    [meaningPath, path.join(backupDirectory, "public__data__meaning-6000.json")],
    [baselinePath, path.join(backupDirectory, "master-lexicon-baseline.mjs")]
  ];
  for (const [source, destination] of backups) fs.copyFileSync(source, destination);
  try {
    atomicWrite(publicPath, wordsContent);
    atomicWrite(staticPath, wordsContent);
    atomicWrite(meaningPath, meaningContent);
    atomicWrite(baselinePath, baselineContent);
  } catch (error) {
    for (const [destination, backup] of backups) {
      retryFileLock(() => fs.copyFileSync(backup, destination), `Unable to restore ${path.relative(root, destination)}`);
    }
    throw error;
  }
  report.backupDirectory = path.relative(root, backupDirectory).replaceAll("\\", "/");
  fs.writeFileSync(path.join(backupDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main();
