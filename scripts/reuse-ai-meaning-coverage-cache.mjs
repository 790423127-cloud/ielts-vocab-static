#!/usr/bin/env node

/**
 * Reuse only locally stored, validated AI profiles for the semantic-coverage
 * audit.  It never invokes DeepSeek.  Entries without an eligible cache record
 * stay in a visible pending state for the normal, user-confirmed AI workflow.
 *
 * Usage:
 *   node scripts/reuse-ai-meaning-coverage-cache.mjs --dry-run
 *   node scripts/reuse-ai-meaning-coverage-cache.mjs --apply
 *   node scripts/reuse-ai-meaning-coverage-cache.mjs --compact-g
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  normalizeProfileKey,
  readProfileCache
} from "../app/lib/ai/deepseek-word-profile.server.mjs";
import {
  buildReadingGMeaningCoverageCompletedEntry,
  isReadingGMeaningCoverageCandidate
} from "../app/lib/reading-g-vocab/ai-completion.mjs";
import {
  applyMeaningCoverageReview,
  applyMeaningCoverageCacheHint,
  hasMeaningCoverageProfileHint,
  isMeaningCoverageProfileUsable,
  markMeaningCoveragePending,
  needsMeaningCoverageReview,
  MEANING_COVERAGE_PENDING_FLAG,
  MEANING_COVERAGE_REVIEWED_FLAG
} from "../app/lib/vocab/meaning-coverage-audit.mjs";
import { buildStaticReadingWordsPublishSnapshot } from "../app/lib/reading-words/static-publish.mjs";

const root = process.cwd();
const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run") || !apply;
const compactGOnly = process.argv.includes("--compact-g");
const now = new Date().toISOString();
const readingGPath = path.join(root, "public", "data", "reading-g-vocab.json");
const readingWordsPath = path.join(root, "public", "data", "personal-reading-words.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, payload, { compact = false } = {}) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, compact ? 0 : 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function contentHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function assertStableIds(before, after, label) {
  const beforeIds = before.map((entry) => String(entry?.id || entry?.wordId || "")).join("\n");
  const afterIds = after.map((entry) => String(entry?.id || entry?.wordId || "")).join("\n");
  if (before.length !== after.length || beforeIds !== afterIds) {
    throw new Error(`${label} 的词条数量或稳定 ID 发生变化，已停止写入。`);
  }
}

function isWordEntry(entry = {}) {
  return (entry.entryType || "word") === "word" && Boolean(String(entry.word || "").trim());
}

function withCoverageFlag(entry, reviewed) {
  const existingFlags = Array.isArray(entry.qualityFlags) ? entry.qualityFlags : [];
  const qualityFlags = [...new Set(existingFlags.filter((flag) => (
    flag !== MEANING_COVERAGE_PENDING_FLAG && flag !== MEANING_COVERAGE_REVIEWED_FLAG
  )))];
  if (reviewed) qualityFlags.push(MEANING_COVERAGE_REVIEWED_FLAG);
  else qualityFlags.push(MEANING_COVERAGE_PENDING_FLAG);
  return { ...entry, qualityFlags };
}

function resolveCachedProfile(cache, entry) {
  const cached = cache[normalizeProfileKey(entry.word)];
  if (!cached || typeof cached !== "object") return null;
  if (normalizeProfileKey(cached.word) !== normalizeProfileKey(entry.word)) return null;
  // A partial cache hint is still useful for a shallow primary explanation.
  // Only a fully evidenced profile is allowed to clear the AI queue.
  if (!hasMeaningCoverageProfileHint(cached, entry.word)) return null;
  return cached;
}

function auditEntries(entries, cache, {
  includeQualityFlags = false,
  isEligible = (entry) => isWordEntry(entry) && needsMeaningCoverageReview(entry),
  applyReviewed = (entry, cached) => applyMeaningCoverageReview(entry, cached, {
    source: "ai-cache",
    reviewedAt: now
  })
} = {}) {
  const stats = {
    total: entries.length,
    candidates: 0,
    cacheReused: 0,
    cacheFullyReviewed: 0,
    cachePartialHint: 0,
    queuedForAi: 0,
    unchanged: 0
  };
  const next = entries.map((entry) => {
    if (!isEligible(entry)) {
      stats.unchanged += 1;
      return entry;
    }
    stats.candidates += 1;
    const cached = resolveCachedProfile(cache, entry);
    if (cached) {
      stats.cacheReused += 1;
      if (isMeaningCoverageProfileUsable(cached, entry.word)) {
        const reviewed = applyReviewed(entry, cached);
        stats.cacheFullyReviewed += 1;
        return {
          ...(includeQualityFlags ? withCoverageFlag(reviewed, true) : reviewed),
          updatedAt: now
        };
      }
      stats.cachePartialHint += 1;
      stats.queuedForAi += 1;
      const enhancedButPending = markMeaningCoveragePending(
        applyMeaningCoverageCacheHint(entry, cached)
      );
      return includeQualityFlags ? withCoverageFlag(enhancedButPending, false) : enhancedButPending;
    }
    stats.queuedForAi += 1;
    const pending = markMeaningCoveragePending(entry);
    return includeQualityFlags ? withCoverageFlag(pending, false) : pending;
  });
  return { entries: next, stats };
}

function createBackupDirectory() {
  const stamp = now.replace(/[:.]/g, "-");
  const directory = path.join(root, "backups", "meaning-coverage-ai", stamp);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function main() {
  if (apply && dryRun) throw new Error("--apply 与 --dry-run 不能同时使用。");
  const readingG = readJson(readingGPath);
  const readingWordsPayload = readJson(readingWordsPath);
  if (!Array.isArray(readingG?.items)) throw new Error("无法读取 G 类阅读词库 items。");
  if (!Array.isArray(readingWordsPayload?.transfer?.readingWords)) {
    throw new Error("无法读取阅读生词本跨设备迁移包。");
  }
  if (compactGOnly) {
    if (apply) throw new Error("--compact-g 不能与 --apply 同时使用。");
    writeJsonAtomic(readingGPath, readingG, { compact: true });
    console.log(JSON.stringify({
      mode: "format-only",
      file: "public/data/reading-g-vocab.json",
      wordCount: readingG.items.length,
      networkCalls: 0,
      paidAiCalls: 0
    }, null, 2));
    return;
  }

  const cache = readProfileCache();
  const gAudit = auditEntries(readingG.items, cache, {
    includeQualityFlags: true,
    isEligible: isReadingGMeaningCoverageCandidate,
    applyReviewed: (entry, cached) => buildReadingGMeaningCoverageCompletedEntry(entry, cached, {
      aiSource: "ai-cache",
      generatedAt: now
    })
  });
  const notebookAudit = auditEntries(readingWordsPayload.transfer.readingWords, cache);
  assertStableIds(readingG.items, gAudit.entries, "G 类阅读词库");
  assertStableIds(readingWordsPayload.transfer.readingWords, notebookAudit.entries, "阅读生词本");

  const report = {
    mode: apply ? "apply" : "dry-run",
    networkCalls: 0,
    paidAiCalls: 0,
    cacheEntries: Object.keys(cache).length,
    readingG: gAudit.stats,
    readingWords: notebookAudit.stats,
    totals: {
      candidates: gAudit.stats.candidates + notebookAudit.stats.candidates,
      cacheReused: gAudit.stats.cacheReused + notebookAudit.stats.cacheReused,
      queuedForAi: gAudit.stats.queuedForAi + notebookAudit.stats.queuedForAi
    }
  };

  if (!apply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const nextG = {
    ...readingG,
    items: gAudit.entries,
    multiSenseCount: gAudit.entries.filter((entry) => Array.isArray(entry?.senses) && entry.senses.length > 1).length,
    updatedAt: now,
    meaningCoverageAudit: {
      version: 1,
      reviewedAt: now,
      source: "local-ai-cache-only",
      candidates: gAudit.stats.candidates,
      cacheReused: gAudit.stats.cacheReused,
      queuedForAi: gAudit.stats.queuedForAi
    }
  };
  const nextReadingSnapshot = buildStaticReadingWordsPublishSnapshot({
    ...readingWordsPayload.transfer,
    readingWords: notebookAudit.entries
  }, { sourceUpdatedAt: now, publishedAt: now });
  assertStableIds(readingG.items, nextG.items, "G 类阅读词库");
  assertStableIds(readingWordsPayload.transfer.readingWords, nextReadingSnapshot.transfer.readingWords, "阅读生词本");

  const backupDirectory = createBackupDirectory();
  const gBackupPath = path.join(backupDirectory, "reading-g-vocab.json");
  const notebookBackupPath = path.join(backupDirectory, "personal-reading-words.json");
  fs.copyFileSync(readingGPath, gBackupPath);
  fs.copyFileSync(readingWordsPath, notebookBackupPath);
  try {
    writeJsonAtomic(readingGPath, nextG, { compact: true });
    writeJsonAtomic(readingWordsPath, nextReadingSnapshot);
  } catch (error) {
    fs.copyFileSync(gBackupPath, readingGPath);
    fs.copyFileSync(notebookBackupPath, readingWordsPath);
    throw error;
  }
  report.backupDirectory = path.relative(root, backupDirectory).replace(/\\/g, "/");
  report.after = {
    readingGHash: contentHash(nextG.items),
    readingWordsRevision: nextReadingSnapshot.revision,
    wordCounts: {
      readingG: nextG.items.length,
      readingWords: nextReadingSnapshot.wordCount
    }
  };
  writeJsonAtomic(path.join(backupDirectory, "report.json"), report);
  console.log(JSON.stringify(report, null, 2));
}

main();
