#!/usr/bin/env node

/**
 * Apply human-reviewed repairs for truncated or semantically mismatched
 * master-lexicon examples. Local-only: no network or paid AI calls.
 *
 * Usage:
 *   node scripts/apply-manual-main-example-repairs.mjs --dry-run
 *   node scripts/apply-manual-main-example-repairs.mjs --apply
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { normalizeProfileKey } from "../app/lib/ai/deepseek-word-profile.server.mjs";
import { renderMasterLexiconBaseline } from "../app/lib/vocab/master-lexicon-baseline-io.mjs";
import { computeIntegrityHash, computeLexiconHash } from "../app/lib/vocab/lexicon-guard.mjs";
import { USER_STATE_FIELDS } from "../app/lib/vocab/word-cache-meta.mjs";
import { MANUAL_MAIN_EXAMPLE_REPAIRS } from "./data/main-example-manual-repairs.mjs";

const root = process.cwd();
const shouldApply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run") || !shouldApply;
const now = new Date().toISOString();
const publicPath = path.join(root, "public", "data", "words.json");
const staticPath = path.join(root, ".static-export-cache", "words.json");
const baselinePath = path.join(root, "app", "lib", "vocab", "master-lexicon-baseline.mjs");

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

const TRANSIENT_FILE_LOCK_CODES = new Set(["EBUSY", "EPERM", "EACCES", "UNKNOWN"]);

function wait(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function withTransientFileLockRetry(operation, description) {
  const delays = [25, 50, 100, 200, 400, 800];
  for (let attempt = 0; ; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      if (!TRANSIENT_FILE_LOCK_CODES.has(error?.code) || attempt >= delays.length) {
        error.message = `${description}: ${error.message}`;
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
    withTransientFileLockRetry(
      () => fs.renameSync(temporaryPath, filePath),
      `Unable to replace ${path.relative(root, filePath)}`
    );
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
  }
}

function restoreBackup(source, destination) {
  withTransientFileLockRetry(
    () => fs.copyFileSync(source, destination),
    `Unable to restore ${path.relative(root, destination)}`
  );
}

function protectedSnapshot(entry = {}) {
  const snapshot = { id: entry.id, wordId: entry.wordId, word: entry.word };
  for (const field of USER_STATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(entry, field)) snapshot[field] = entry[field];
  }
  return snapshot;
}

function text(value) {
  return String(value == null ? "" : value).normalize("NFC").trim();
}

function resolveSenseExampleRepairs(entry, word, configuredRepairs) {
  const senses = Array.isArray(entry.senses) ? entry.senses : [];
  const resolved = [];
  for (const patch of Array.isArray(configuredRepairs) ? configuredRepairs : []) {
    const from = text(patch?.from);
    const example = text(patch?.example);
    const exampleZh = text(patch?.exampleZh || patch?.exampleCn);
    if (!from || !example || !exampleZh || !/[.!?]$/u.test(example)) {
      throw new Error(`Invalid nested sense example repair: ${word}`);
    }
    const sourceIndexes = senses
      .map((sense, index) => text(sense?.example) === from ? index : -1)
      .filter((index) => index >= 0);
    const completedIndexes = senses
      .map((sense, index) => (
        text(sense?.example) === example
        && text(sense?.exampleZh || sense?.exampleCn) === exampleZh
          ? index
          : -1
      ))
      .filter((index) => index >= 0);
    if (sourceIndexes.length === 1 && completedIndexes.length === 0) {
      resolved.push({ index: sourceIndexes[0], example, exampleZh });
      continue;
    }
    if (sourceIndexes.length === 0 && completedIndexes.length === 1) continue;
    throw new Error(
      `Nested sense example repair must match exactly one source or completed row: ${word}; ` +
      `source=${sourceIndexes.length}; completed=${completedIndexes.length}`
    );
  }
  return resolved;
}

function validateAndResolve(words) {
  const indexesByKey = new Map();
  words.forEach((entry, index) => {
    const key = normalizeProfileKey(entry.word);
    if (!indexesByKey.has(key)) indexesByKey.set(key, []);
    indexesByKey.get(key).push(index);
  });
  const resolved = new Map();
  const alreadyRepaired = [];
  for (const [word, patch] of Object.entries(MANUAL_MAIN_EXAMPLE_REPAIRS)) {
    const indexes = indexesByKey.get(normalizeProfileKey(word)) || [];
    if (indexes.length !== 1) throw new Error(`Example repair must match exactly one entry: ${word}; matched=${indexes.length}`);
    const entry = words[indexes[0]];
    const topLevelAlreadyRepaired = (
      text(entry.example) === text(patch.example)
      && text(entry.exampleCn) === text(patch.exampleCn)
    );
    if (!topLevelAlreadyRepaired && text(entry.example) !== text(patch.from)) {
      throw new Error(`Example repair source changed for ${word}: expected=${JSON.stringify(patch.from)} actual=${JSON.stringify(entry.example)}`);
    }
    const example = text(patch.example);
    const exampleCn = text(patch.exampleCn);
    if (!example || !exampleCn || !/[.!?]$/u.test(example)) throw new Error(`Invalid repaired example: ${word}`);
    const senseRepairs = resolveSenseExampleRepairs(entry, word, patch.senseExampleRepairs);
    if (topLevelAlreadyRepaired && senseRepairs.length === 0) {
      alreadyRepaired.push(word);
      continue;
    }
    resolved.set(indexes[0], {
      topLevel: topLevelAlreadyRepaired ? null : { example, exampleCn },
      senseRepairs
    });
  }
  return { resolved, alreadyRepaired };
}

function main() {
  if (shouldApply && dryRun) throw new Error("--apply and --dry-run cannot be used together");
  const publicRaw = fs.readFileSync(publicPath);
  const staticRaw = fs.readFileSync(staticPath);
  if (!publicRaw.equals(staticRaw)) throw new Error("The two authoritative master lexicon files differ; write stopped.");
  const payload = JSON.parse(publicRaw.toString("utf8"));
  if (!Array.isArray(payload.words) || payload.words.length !== Number(payload.count)) {
    throw new Error("Master lexicon words/count mismatch; write stopped.");
  }
  const { resolved: repairs, alreadyRepaired } = validateAndResolve(payload.words);
  const changed = [];
  const nextWords = payload.words.map((entry, index) => {
    const repair = repairs.get(index);
    if (!repair) return entry;
    let next = entry;
    if (repair.topLevel) {
      next = {
        ...next,
        example: repair.topLevel.example,
        exampleCn: repair.topLevel.exampleCn,
        exampleSource: "manual-truncated-example-repair",
        exampleReviewedAt: now
      };
    }
    if (repair.senseRepairs.length) {
      const senseRepairByIndex = new Map(repair.senseRepairs.map((item) => [item.index, item]));
      next = {
        ...next,
        senses: (Array.isArray(entry.senses) ? entry.senses : []).map((sense, senseIndex) => {
          const senseRepair = senseRepairByIndex.get(senseIndex);
          if (!senseRepair) return sense;
          const chineseField = Object.prototype.hasOwnProperty.call(sense, "exampleCn")
            ? "exampleCn"
            : "exampleZh";
          return {
            ...sense,
            example: senseRepair.example,
            [chineseField]: senseRepair.exampleZh
          };
        })
      };
    }
    next = { ...next, updatedAt: now };
    if (JSON.stringify(protectedSnapshot(entry)) !== JSON.stringify(protectedSnapshot(next))) {
      throw new Error(`Protected identity or user state changed: ${entry.word}`);
    }
    changed.push({
      word: entry.word,
      topLevel: Boolean(repair.topLevel),
      nestedSenseRows: repair.senseRepairs.length,
      before: entry.example,
      after: repair.topLevel?.example || entry.example
    });
    return next;
  });
  if (changed.length !== repairs.size || nextWords.length !== payload.words.length) {
    throw new Error("Not every example repair was applied exactly once; write stopped.");
  }
  const nextPayload = {
    ...payload,
    words: nextWords,
    count: nextWords.length,
    savedAt: now,
    lexiconHash: computeLexiconHash(nextWords),
    integrityHash: computeIntegrityHash(nextWords)
  };
  const content = `${JSON.stringify(nextPayload, null, 2)}\n`;
  const report = {
    mode: shouldApply ? "apply" : "dry-run",
    networkCalls: 0,
    paidAiCalls: 0,
    repairedExamples: changed.length,
    alreadyRepaired: alreadyRepaired.length,
    stableIdsChanged: 0,
    userStateFieldsChanged: 0,
    preview: changed.slice(0, 25)
  };
  if (!shouldApply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const stamp = now.replace(/[:.]/g, "-");
  const backupDirectory = path.join(root, "backups", "main-example-repair", stamp);
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backups = [
    [publicPath, path.join(backupDirectory, "words.json")],
    [staticPath, path.join(backupDirectory, "cache-words.json")],
    [baselinePath, path.join(backupDirectory, "master-lexicon-baseline.mjs")]
  ];
  for (const [source, destination] of backups) fs.copyFileSync(source, destination);
  const baselineContent = renderMasterLexiconBaseline({
    count: nextPayload.count,
    version: nextPayload.version,
    fileHash: sha256(content)
  });
  try {
    atomicWrite(publicPath, content);
    atomicWrite(staticPath, content);
    atomicWrite(baselinePath, baselineContent);
  } catch (error) {
    for (const [destination, source] of backups) restoreBackup(source, destination);
    throw error;
  }
  report.backupDirectory = path.relative(root, backupDirectory).replaceAll("\\", "/");
  console.log(JSON.stringify(report, null, 2));
}

main();
