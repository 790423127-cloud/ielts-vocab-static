import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  buildReadingGAiMasterSyncPlan,
  buildReadingGMasterDeletionPlan
} from "./master-content-sync.mjs";
import { computeIntegrityHash, computeLexiconHash } from "../vocab/lexicon-guard.mjs";
import { renderMasterLexiconBaseline } from "../vocab/master-lexicon-baseline-io.mjs";
import { buildLexiconRetirementPayload } from "../vocab/lexicon-delete-intent.mjs";
import { atomicReplaceFileSync } from "./atomic-write.server.mjs";

const PROJECT_ROOT = process.cwd();
const PUBLIC_MASTER_PATH = path.join(PROJECT_ROOT, "public", "data", "words.json");
const STATIC_MASTER_PATH = path.join(PROJECT_ROOT, ".static-export-cache", "words.json");
const BASELINE_PATH = path.join(PROJECT_ROOT, "app", "lib", "vocab", "master-lexicon-baseline.mjs");
const RETIREMENT_PATH = path.join(PROJECT_ROOT, "app", "lib", "vocab", "master-lexicon-retirements.json");
const BACKUP_ROOT = path.join(PROJECT_ROOT, "backups", "reading-g-ai-master-sync");
const DELETE_BACKUP_ROOT = path.join(PROJECT_ROOT, "backups", "reading-g-master-delete");

let writeQueue = Promise.resolve();

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function readRequired(filePath, label) {
  if (!fs.existsSync(filePath)) throw new Error(`${label}不存在，已停止同步。`);
  return fs.readFileSync(filePath);
}

function atomicWrite(filePath, content) {
  atomicReplaceFileSync(filePath, content);
}

function timestampForFile(value = new Date().toISOString()) {
  return String(value).replace(/[:.]/g, "-");
}

function buildMasterContent(payload, words, savedAt) {
  const nextPayload = {
    ...payload,
    count: words.length,
    savedAt,
    lexiconHash: computeLexiconHash(words),
    integrityHash: computeIntegrityHash(words),
    words
  };
  return {
    payload: nextPayload,
    content: `${JSON.stringify(nextPayload, null, 2)}\n`
  };
}

function assertPreparedMaster(payload) {
  if (!Array.isArray(payload?.words) || payload.words.length !== Number(payload?.count)) {
    throw new Error("待写入主词库数量元数据不一致，已停止同步。");
  }
  if (payload.lexiconHash !== computeLexiconHash(payload.words)) {
    throw new Error("待写入主词库 lexiconHash 校验失败，已停止同步。");
  }
  if (payload.integrityHash !== computeIntegrityHash(payload.words)) {
    throw new Error("待写入主词库 integrityHash 校验失败，已停止同步。");
  }
}

function applyMasterSync(entries, options = {}) {
  const publicRaw = readRequired(PUBLIC_MASTER_PATH, "public/data/words.json");
  const staticRaw = readRequired(STATIC_MASTER_PATH, ".static-export-cache/words.json");
  if (!publicRaw.equals(staticRaw)) {
    throw new Error("两个正式主词库文件不一致，已停止同步。请先恢复一致后再操作。");
  }
  const retirementRaw = readRequired(RETIREMENT_PATH, "主词库退役记录");
  const payload = JSON.parse(publicRaw.toString("utf8"));
  const retirementPayload = JSON.parse(retirementRaw.toString("utf8"));
  const savedAt = options.savedAt || new Date().toISOString();
  const plan = buildReadingGAiMasterSyncPlan(payload, entries, {
    now: savedAt,
    retiredEntries: retirementPayload?.entries
  });
  const report = {
    ok: true,
    mode: options.apply === false ? "dry-run" : "apply",
    masterSourcesMatch: true,
    ...plan.report,
    backupDir: ""
  };
  if (!plan.changed || options.apply === false) return report;

  const prepared = buildMasterContent(payload, plan.nextWords, savedAt);
  assertPreparedMaster(prepared.payload);
  const baselineContent = renderMasterLexiconBaseline({
    count: prepared.payload.count,
    version: prepared.payload.version,
    fileHash: sha256(prepared.content)
  });
  const baselineRaw = readRequired(BASELINE_PATH, "主词库基线文件");
  const backupDir = path.join(BACKUP_ROOT, timestampForFile(savedAt));
  fs.mkdirSync(backupDir, { recursive: true });
  const backups = [
    [PUBLIC_MASTER_PATH, path.join(backupDir, "words.json")],
    [STATIC_MASTER_PATH, path.join(backupDir, "cache-words.json")],
    [BASELINE_PATH, path.join(backupDir, "master-lexicon-baseline.mjs")]
  ];
  for (const [source, backup] of backups) fs.copyFileSync(source, backup);
  if (!fs.readFileSync(path.join(backupDir, "words.json")).equals(publicRaw)) {
    throw new Error("主词库备份校验失败，已停止同步。");
  }

  try {
    atomicWrite(PUBLIC_MASTER_PATH, prepared.content);
    atomicWrite(STATIC_MASTER_PATH, prepared.content);
    atomicWrite(BASELINE_PATH, baselineContent);
  } catch (error) {
    atomicWrite(PUBLIC_MASTER_PATH, publicRaw);
    atomicWrite(STATIC_MASTER_PATH, staticRaw);
    atomicWrite(BASELINE_PATH, baselineRaw);
    throw error;
  }

  report.backupDir = backupDir;
  report.savedAt = savedAt;
  report.lexiconHash = prepared.payload.lexiconHash;
  report.integrityHash = prepared.payload.integrityHash;
  return report;
}

function applyMasterDeletion(entries, options = {}) {
  const publicRaw = readRequired(PUBLIC_MASTER_PATH, "public/data/words.json");
  const staticRaw = readRequired(STATIC_MASTER_PATH, ".static-export-cache/words.json");
  if (!publicRaw.equals(staticRaw)) {
    throw new Error("两个正式主词库文件不一致，已停止联动删除。请先恢复一致后再操作。");
  }
  const baselineRaw = readRequired(BASELINE_PATH, "主词库基线文件");
  const retirementRaw = readRequired(RETIREMENT_PATH, "主词库退役记录");
  const payload = JSON.parse(publicRaw.toString("utf8"));
  const currentRetirements = JSON.parse(retirementRaw.toString("utf8"));
  const plan = buildReadingGMasterDeletionPlan(payload, entries);
  const report = {
    ok: true,
    mode: options.apply === false ? "dry-run" : "apply",
    masterSourcesMatch: true,
    ...plan.report,
    backupDir: ""
  };
  if (!plan.changed || options.apply === false) return report;

  const savedAt = options.savedAt || new Date().toISOString();
  const prepared = buildMasterContent(payload, plan.nextWords, savedAt);
  assertPreparedMaster(prepared.payload);
  const baselineContent = renderMasterLexiconBaseline({
    count: prepared.payload.count,
    version: prepared.payload.version,
    fileHash: sha256(prepared.content)
  });
  const nextRetirements = buildLexiconRetirementPayload(
    currentRetirements,
    plan.report.deletedEntries,
    { version: prepared.payload.version, savedAt }
  );
  const retirementContent = `${JSON.stringify(nextRetirements, null, 2)}\n`;
  const backupDir = path.join(DELETE_BACKUP_ROOT, timestampForFile(savedAt));
  fs.mkdirSync(backupDir, { recursive: true });
  const backups = [
    [PUBLIC_MASTER_PATH, path.join(backupDir, "words.json")],
    [STATIC_MASTER_PATH, path.join(backupDir, "cache-words.json")],
    [BASELINE_PATH, path.join(backupDir, "master-lexicon-baseline.mjs")],
    [RETIREMENT_PATH, path.join(backupDir, "master-lexicon-retirements.json")]
  ];
  for (const [source, backup] of backups) fs.copyFileSync(source, backup);
  if (
    !fs.readFileSync(path.join(backupDir, "words.json")).equals(publicRaw)
    || !fs.readFileSync(path.join(backupDir, "master-lexicon-retirements.json")).equals(retirementRaw)
  ) {
    throw new Error("联动删除备份校验失败，已停止写入。");
  }

  try {
    atomicWrite(PUBLIC_MASTER_PATH, prepared.content);
    atomicWrite(STATIC_MASTER_PATH, prepared.content);
    atomicWrite(BASELINE_PATH, baselineContent);
    atomicWrite(RETIREMENT_PATH, retirementContent);
  } catch (error) {
    atomicWrite(PUBLIC_MASTER_PATH, publicRaw);
    atomicWrite(STATIC_MASTER_PATH, staticRaw);
    atomicWrite(BASELINE_PATH, baselineRaw);
    atomicWrite(RETIREMENT_PATH, retirementRaw);
    throw error;
  }

  report.backupDir = backupDir;
  report.savedAt = savedAt;
  report.lexiconHash = prepared.payload.lexiconHash;
  report.integrityHash = prepared.payload.integrityHash;
  report.retirementCount = nextRetirements.count;
  return report;
}

/**
 * Serializes main-lexicon writes from G AI completion requests. Existing words
 * only receive missing fields; complete missing headwords are appended safely.
 */
export function syncReadingGAiCompletedEntriesToMaster(entries, options = {}) {
  const task = writeQueue.then(() => applyMasterSync(entries, options));
  writeQueue = task.catch(() => {});
  return task;
}

export function syncReadingGDeletedEntriesToMaster(entries, options = {}) {
  const task = writeQueue.then(() => applyMasterDeletion(entries, options));
  writeQueue = task.catch(() => {});
  return task;
}
