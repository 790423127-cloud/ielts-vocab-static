import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeReadingGKey } from "../app/lib/reading-g-vocab/normalize.mjs";
import { fillReadingGRelationMeanings } from "../app/lib/reading-g-vocab/relation-meaning-fill.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vocabPath = path.join(root, "public/data/reading-g-vocab.json");
const masterPath = path.join(root, "public/data/words.json");
const apply = process.argv.includes("--apply");
const backupArgIndex = process.argv.indexOf("--backup-dir");
const backupDir = backupArgIndex >= 0
  ? path.resolve(process.argv[backupArgIndex + 1] || "")
  : "";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function atomicWrite(filePath, content) {
  const temporaryPath = `${filePath}.relation-meaning-tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, content, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

const originalRaw = fs.readFileSync(vocabPath, "utf8");
const vocab = JSON.parse(originalRaw);
const masterPayload = readJson(masterPath);
const masterItems = Array.isArray(masterPayload) ? masterPayload : masterPayload.words;
const masterByKey = new Map(
  masterItems.map((entry) => [normalizeReadingGKey(entry.word), entry])
);
const beforeIdentities = vocab.items.map((entry) => `${entry.id || entry.wordId}::${entry.word}`);
const result = fillReadingGRelationMeanings(vocab.items, masterByKey);
const afterIdentities = result.items.map((entry) => `${entry.id || entry.wordId}::${entry.word}`);
if (JSON.stringify(beforeIdentities) !== JSON.stringify(afterIdentities)) {
  throw new Error("词形词族释义补全改变了 G 词库数量、顺序、词头或稳定 ID，已停止写入。");
}

const nextVocab = {
  ...vocab,
  enrichment: {
    ...(vocab.enrichment || {}),
    relationMeanings: result.stats.entriesChanged
      ? result.stats
      : vocab.enrichment?.relationMeanings || result.stats
  },
  items: result.items
};
const contentAiCompletedCount = result.items.filter((entry) => (
  (entry.qualityFlags || []).includes("reading_g_ai_completed")
)).length;
const questionBankAiCompletedCount = result.items.filter((entry) => (
  (entry.layers || []).includes("questionBankAiCompleted")
  && (entry.qualityFlags || []).includes("question_bank_5262_expansion")
  && !(entry.qualityFlags || []).some((flag) => [
    "grok_full_bank_true_missing_supplement_v1",
    "grok_excel_part1_2_missing_supplement_v1"
  ].includes(flag))
  && !(entry.layers || []).some((layer) => [
    "grokFullBankSupplement",
    "grokExcelPart12Supplement"
  ].includes(layer))
)).length;
nextVocab.questionBankExpansion = {
  ...(nextVocab.questionBankExpansion || {}),
  aiCompletedCount: questionBankAiCompletedCount,
  contentAiCompletedCount
};
const nextRaw = `${JSON.stringify(nextVocab)}\n`;
const report = {
  mode: apply ? "apply" : "dry-run",
  count: nextVocab.items.length,
  stableIdsChanged: 0,
  relationsRemoved: 0,
  stats: result.stats,
  sha256Before: sha256(originalRaw),
  sha256After: sha256(nextRaw)
};

if (apply) {
  if (!backupDir) throw new Error("写入前必须通过 --backup-dir 指定现有备份目录。");
  if (!fs.existsSync(backupDir)) throw new Error(`备份目录不存在：${backupDir}`);
  const backupStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `reading-g-vocab.before-relation-meaning-fill-${backupStamp}.json`);
  fs.copyFileSync(vocabPath, backupPath);
  if (sha256(fs.readFileSync(backupPath)) !== sha256(originalRaw)) {
    throw new Error("G 词库备份校验失败，已停止写入。");
  }
  atomicWrite(vocabPath, nextRaw);
  report.backupPath = backupPath;
}

console.log(JSON.stringify(report, null, 2));
