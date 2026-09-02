/**
 * Conservatively reuse missing G-reading teaching fields from the master lexicon.
 *
 * Usage:
 *   node scripts/reuse-reading-g-master-content.mjs
 *   node scripts/reuse-reading-g-master-content.mjs --apply
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isReadingGAiCompletionCandidate } from "../app/lib/reading-g-vocab/ai-completion.mjs";
import { buildReadingGMasterReusePlan } from "../app/lib/reading-g-vocab/master-content-reuse.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const G_PATH = path.join(ROOT, "public", "data", "reading-g-vocab.json");
const MASTER_PATH = path.join(ROOT, "public", "data", "words.json");
const STATIC_MASTER_PATH = path.join(ROOT, ".static-export-cache", "words.json");
const BACKUP_ROOT = path.join(ROOT, "backups", "reading-g-master-content-reuse");
const apply = process.argv.includes("--apply");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function atomicWriteJson(filePath, value) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, value, "utf8");
  fs.renameSync(tempPath, filePath);
}

function serializeLikeSource(value, sourceRaw) {
  const lineBreakCount = (sourceRaw.match(/\n/g) || []).length;
  return lineBreakCount <= 2
    ? `${JSON.stringify(value)}\n`
    : `${JSON.stringify(value, null, 2)}\n`;
}

const gRaw = fs.readFileSync(G_PATH, "utf8");
const masterRaw = fs.readFileSync(MASTER_PATH, "utf8");
const staticMasterRaw = fs.readFileSync(STATIC_MASTER_PATH, "utf8");
if (sha256(masterRaw) !== sha256(staticMasterRaw)) {
  throw new Error("主词库与静态缓存不一致，已停止复用。");
}

const gPayload = JSON.parse(gRaw);
const masterPayload = JSON.parse(masterRaw);
const beforePending = gPayload.items.filter(isReadingGAiCompletionCandidate).length;
const plan = buildReadingGMasterReusePlan(gPayload, masterPayload);
const reusedAt = new Date().toISOString();
const nextPayload = plan.changed
  ? {
      ...plan.payload,
      updatedAt: reusedAt,
      masterContentReuse: {
        source: "public/data/words.json",
        reusedAt,
        ...plan.report
      }
    }
  : plan.payload;
const nextRaw = serializeLikeSource(nextPayload, gRaw);
const afterPending = nextPayload.items.filter(isReadingGAiCompletionCandidate).length;
const report = {
  mode: apply ? "apply" : "dry-run",
  masterSourcesMatch: true,
  beforePending,
  afterPending,
  resolvedPending: beforePending - afterPending,
  ...plan.report,
  sha256Before: sha256(gRaw),
  sha256After: sha256(nextRaw)
};

if (apply && plan.changed) {
  const stamp = reusedAt.replace(/[:.]/g, "-");
  const backupDir = path.join(BACKUP_ROOT, stamp);
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, "reading-g-vocab.before.json");
  fs.copyFileSync(G_PATH, backupPath);
  if (sha256(fs.readFileSync(backupPath)) !== sha256(gRaw)) {
    throw new Error("写入前备份校验失败，已停止复用。");
  }
  atomicWriteJson(G_PATH, nextRaw);
  if (sha256(fs.readFileSync(G_PATH)) !== sha256(nextRaw)) {
    atomicWriteJson(G_PATH, gRaw);
    throw new Error("写入后校验失败，已自动恢复原文件。");
  }
  report.backupPath = path.relative(ROOT, backupPath).replace(/\\/g, "/");
}

console.log(JSON.stringify(report, null, 2));
