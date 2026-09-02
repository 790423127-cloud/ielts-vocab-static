/**
 * Reconcile G-reading cards with the master lexicon's reference-only forms.
 *
 * A master entry such as affairs -> affair is intentionally retained for
 * search/history, but must never remain as a standalone G flashcard.  This
 * script creates the canonical G headword when needed, compacts the old card
 * into it, and persists the alias/id mapping for progress migration.
 *
 * Usage:
 *   node scripts/reconcile-reading-g-master-reference-forms.mjs
 *   node scripts/reconcile-reading-g-master-reference-forms.mjs --apply
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyReadingGCompaction } from "../app/lib/reading-g-vocab/compaction.mjs";
import { prepareReadingGMasterReferenceForms } from "../app/lib/reading-g-vocab/master-reference-forms.mjs";
import { normalizeReadingGKey } from "../app/lib/reading-g-vocab/normalize.mjs";
import { READING_G_RETIREMENTS_SOURCE } from "../app/lib/reading-g-vocab/retirements.mjs";
import {
  buildEligibilityWordMap,
  isReferenceWord
} from "../app/lib/vocab/word-study-eligibility.mjs";
import { buildMasterBackedEntry } from "./expand-reading-g-question-bank.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const VOCAB_PATH = path.join(ROOT, "public", "data", "reading-g-vocab.json");
const REPORT_PATH = path.join(ROOT, "public", "data", "reading-g-import-report.json");
const COMPACTION_PATH = path.join(ROOT, "public", "data", "reading-g-word-family-compaction.json");
const MASTER_PATH = path.join(ROOT, "public", "data", "words.json");
const MASTER_CACHE_PATH = path.join(ROOT, ".static-export-cache", "words.json");
const QUESTION_BANK_PATH = path.join(ROOT, "scripts", "data", "reading-g-question-bank-3109.json");
const RETIREMENTS_PATH = path.join(ROOT, READING_G_RETIREMENTS_SOURCE);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeJsonAtomically(filePath, value) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function copyToBackup(filePath, backupDir) {
  fs.copyFileSync(filePath, path.join(backupDir, path.basename(filePath)));
}

function validateMasterSources() {
  const publicRaw = fs.readFileSync(MASTER_PATH, "utf8");
  const cacheRaw = fs.readFileSync(MASTER_CACHE_PATH, "utf8");
  const publicData = JSON.parse(publicRaw);
  const cacheData = JSON.parse(cacheRaw);
  const publicWords = Array.isArray(publicData.words) ? publicData.words : [];
  const cacheWords = Array.isArray(cacheData.words) ? cacheData.words : [];
  if (
    publicWords.length !== cacheWords.length
    || digest(JSON.stringify(publicWords)) !== digest(JSON.stringify(cacheWords))
    || (publicData.lexiconHash && cacheData.lexiconHash && publicData.lexiconHash !== cacheData.lexiconHash)
  ) {
    throw new Error("正式主词库与静态缓存不一致，已停止写入 G 阅读词库。");
  }
  return publicData;
}

function referenceCardAudit(items, masterWords) {
  const masterByKey = buildEligibilityWordMap(masterWords);
  return items.filter((item) => (
    (item?.entryType || "word") === "word"
    && isReferenceWord(masterByKey.get(normalizeReadingGKey(item?.normalizedKey || item?.word)))
  ));
}

function nextReport(report, vocab, planStats, compactionStats, timestamp) {
  const next = structuredClone(report || {});
  next.masterReferenceFormReconciliation = {
    version: "reading-g-master-reference-forms-v1",
    source: "public/data/words.json",
    reconciledAt: timestamp,
    ...planStats,
    removedIndependentWordCount: compactionStats.removedIndependentWordCount,
    appliedFamilyCount: compactionStats.appliedFamilyCount
  };
  next.summary = {
    ...(next.summary || {}),
    itemCount: vocab.items.length,
    wordCount: vocab.items.filter((item) => (item.entryType || "word") === "word").length,
    phraseCount: vocab.items.filter((item) => item.entryType === "phrase").length,
    activeCount: vocab.items.filter((item) => item.studyMode === "active").length,
    referenceOnlyCount: vocab.items.filter((item) => item.studyMode === "reference").length
  };
  return next;
}

export function buildReadingGMasterReferenceReconciliation({
  vocab,
  report,
  compactionPayload,
  retirementPayload = {},
  masterData,
  sourceWords,
  timestamp = new Date().toISOString()
} = {}) {
  if (!vocab || !Array.isArray(vocab.items)) throw new Error("G 阅读词库格式无效。");
  const masterWords = Array.isArray(masterData?.words) ? masterData.words : [];
  const beforeReferenceCards = referenceCardAudit(vocab.items, masterWords);
  const prepared = prepareReadingGMasterReferenceForms({
    items: vocab.items,
    masterWords,
    additionalWords: sourceWords,
    compactionPayload,
    retirementPayload,
    createBaseEntry: (masterEntry) => buildMasterBackedEntry(masterEntry.word, masterEntry)
  });
  const compacted = applyReadingGCompaction(prepared.items, prepared.compactionPayload);
  const nextVocab = {
    ...structuredClone(vocab),
    items: compacted.items,
    count: compacted.items.length,
    wordCount: compacted.items.filter((item) => (item.entryType || "word") === "word").length,
    phraseCount: compacted.items.filter((item) => item.entryType === "phrase").length,
    activeCount: compacted.items.filter((item) => item.studyMode === "active").length,
    referenceCount: compacted.items.filter((item) => item.studyMode === "reference").length,
    masterReferenceFormReconciliation: {
      version: "reading-g-master-reference-forms-v1",
      source: "public/data/words.json",
      reconciledAt: timestamp,
      ...prepared.stats,
      removedIndependentWordCount: compacted.stats.removedIndependentWordCount,
      appliedFamilyCount: compacted.stats.appliedFamilyCount
    }
  };
  const afterReferenceCards = referenceCardAudit(nextVocab.items, masterWords);
  if (afterReferenceCards.length) {
    throw new Error(`仍有 ${afterReferenceCards.length} 个纯变形独立 G 卡未合并。`);
  }
  const nextReportValue = nextReport(
    report,
    nextVocab,
    prepared.stats,
    compacted.stats,
    timestamp
  );
  return {
    vocab: nextVocab,
    report: nextReportValue,
    compactionPayload: prepared.compactionPayload,
    stats: {
      beforeIndependentReferenceCardCount: beforeReferenceCards.length,
      afterIndependentReferenceCardCount: afterReferenceCards.length,
      ...prepared.stats,
      removedIndependentWordCount: compacted.stats.removedIndependentWordCount,
      appliedFamilyCount: compacted.stats.appliedFamilyCount
    }
  };
}

export function run({ apply = false } = {}) {
  const masterData = validateMasterSources();
  const vocab = readJson(VOCAB_PATH);
  const report = readJson(REPORT_PATH);
  const compactionPayload = readJson(COMPACTION_PATH);
  const retirementPayload = readJson(RETIREMENTS_PATH);
  const sourceWords = readJson(QUESTION_BANK_PATH).words;
  const result = buildReadingGMasterReferenceReconciliation({
    vocab,
    report,
    compactionPayload,
    retirementPayload,
    masterData,
    sourceWords
  });

  if (!apply) {
    return { applied: false, ...result.stats };
  }

  const backupDir = path.join(
    ROOT,
    "backups",
    "reading-g-master-reference-form-reconcile",
    new Date().toISOString().replace(/[:.]/g, "-")
  );
  fs.mkdirSync(backupDir, { recursive: true });
  for (const filePath of [VOCAB_PATH, REPORT_PATH, COMPACTION_PATH]) {
    copyToBackup(filePath, backupDir);
  }
  writeJsonAtomically(VOCAB_PATH, result.vocab);
  writeJsonAtomically(REPORT_PATH, result.report);
  writeJsonAtomically(COMPACTION_PATH, result.compactionPayload);
  return { applied: true, backupDir, ...result.stats };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const result = run({ apply: process.argv.includes("--apply") });
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
