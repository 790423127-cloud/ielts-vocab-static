#!/usr/bin/env node

/**
 * Apply human-reviewed, common-sense-first Chinese meaning details to the
 * master lexicon. This script is deliberately local-only: it never calls an
 * external API and it refuses to write unless both authoritative lexicon
 * copies are byte-identical.
 *
 * Usage:
 *   node scripts/apply-manual-main-meaning-details.mjs --dry-run
 *   node scripts/apply-manual-main-meaning-details.mjs --apply
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeProfileKey } from "../app/lib/ai/deepseek-word-profile.server.mjs";
import { renderMasterLexiconBaseline } from "../app/lib/vocab/master-lexicon-baseline-io.mjs";
import { isMeaningDetailInformative } from "../app/lib/vocab/meaning-display.mjs";
import { USER_STATE_FIELDS } from "../app/lib/vocab/word-cache-meta.mjs";
import { isLikelyWrongAiWord } from "../app/lib/vocab/page-word-helpers.mjs";
import { isBrushableWord } from "../app/lib/vocab/word-study-eligibility.mjs";
import { getWordQualityEvaluation } from "../app/lib/vocab/word-quality-status.mjs";
import { computeIntegrityHash, computeLexiconHash } from "../app/lib/vocab/lexicon-guard.mjs";

const root = process.cwd();
const shouldApply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run") || !shouldApply;
const now = new Date().toISOString();
const publicPath = path.join(root, "public", "data", "words.json");
const staticPath = path.join(root, ".static-export-cache", "words.json");
const baselinePath = path.join(root, "app", "lib", "vocab", "master-lexicon-baseline.mjs");
const manualDataDirectory = path.join(root, "scripts", "data");

async function loadManualMeaningDetails() {
  const filenames = fs.readdirSync(manualDataDirectory)
    .filter((filename) => /^main-meaning-detail-manual(?:-batch-\d+)?\.mjs$/u.test(filename))
    .sort();
  const combined = {};
  for (const filename of filenames) {
    const module = await import(pathToFileURL(path.join(manualDataDirectory, filename)).href);
    for (const records of Object.values(module)) {
      if (!records || typeof records !== "object" || Array.isArray(records)) continue;
      for (const [word, patch] of Object.entries(records)) {
        if (Object.prototype.hasOwnProperty.call(combined, word)) {
          throw new Error(`Duplicate manual detail record: ${word} (${filename})`);
        }
        combined[word] = patch;
      }
    }
  }
  return Object.freeze(combined);
}

const manualMeaningDetails = await loadManualMeaningDetails();

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
  const snapshot = {
    id: entry.id,
    wordId: entry.wordId,
    word: entry.word
  };
  for (const field of USER_STATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(entry, field)) snapshot[field] = entry[field];
  }
  return snapshot;
}

function sameProtectedFields(before, after) {
  return JSON.stringify(protectedSnapshot(before)) === JSON.stringify(protectedSnapshot(after));
}

function evaluate(entry, knownHeadwords) {
  return getWordQualityEvaluation(entry, {
    needsRepair: isLikelyWrongAiWord(entry),
    knownHeadwords
  });
}

function validateManualPatches(words) {
  const indexesByKey = new Map();
  words.forEach((entry, index) => {
    const key = normalizeProfileKey(entry.word);
    if (!indexesByKey.has(key)) indexesByKey.set(key, []);
    indexesByKey.get(key).push(index);
  });

  const patches = new Map();
  for (const [rawWord, patch] of Object.entries(manualMeaningDetails)) {
    const key = normalizeProfileKey(rawWord);
    const matches = indexesByKey.get(key) || [];
    if (matches.length !== 1) {
      throw new Error(`Manual patch must match exactly one master entry: ${rawWord} matched ${matches.length}`);
    }
    const detail = String(patch?.detail || "").normalize("NFC").trim();
    if (!detail) throw new Error(`Manual detail is empty: ${rawWord}`);
    const candidate = {
      ...words[matches[0]],
      ...(patch?.meaning ? { meaning: String(patch.meaning).normalize("NFC").trim() } : {}),
      meaningDetailZh: detail
    };
    if (!isMeaningDetailInformative(candidate)) {
      throw new Error(`Manual detail does not pass the informative-detail rule: ${rawWord}`);
    }
    patches.set(matches[0], {
      detail,
      meaning: String(patch?.meaning || "").normalize("NFC").trim()
    });
  }
  return patches;
}

function main() {
  if (shouldApply && dryRun) throw new Error("--apply and --dry-run cannot be used together");

  const publicRaw = fs.readFileSync(publicPath);
  const staticRaw = fs.readFileSync(staticPath);
  if (!publicRaw.equals(staticRaw)) {
    throw new Error("The two authoritative master lexicon files differ; manual write stopped.");
  }
  const payload = JSON.parse(publicRaw.toString("utf8"));
  if (!Array.isArray(payload.words) || payload.words.length !== Number(payload.count)) {
    throw new Error("Master lexicon words/count mismatch; manual write stopped.");
  }

  const knownHeadwords = new Set(payload.words.map((entry) => normalizeProfileKey(entry.word)).filter(Boolean));
  const patchesByIndex = validateManualPatches(payload.words);
  const countsBefore = { completion: 0, repair: 0, classification: 0, ready: 0 };
  const countsAfter = { completion: 0, repair: 0, classification: 0, ready: 0 };
  const applied = [];
  const skippedAlreadyComplete = [];
  const nextWords = payload.words.map((entry, index) => {
    if (!isBrushableWord(entry)) return entry;
    const before = evaluate(entry, knownHeadwords);
    countsBefore[before.lane] += 1;
    const patch = patchesByIndex.get(index);
    if (!patch) {
      countsAfter[before.lane] += 1;
      return entry;
    }
    const oldMeaning = String(entry.meaning || "").trim();
    const isChangedManualReview = entry.meaningDetailSource === "manual-common-meaning-review"
      && (
        String(entry.meaningDetailZh || "").trim() !== patch.detail
        || (patch.meaning && oldMeaning !== patch.meaning)
      );
    if (before.lane !== "completion" && !isChangedManualReview) {
      countsAfter[before.lane] += 1;
      skippedAlreadyComplete.push({ word: entry.word, lane: before.lane });
      return entry;
    }

    const oldDefinition = String(entry.definition || "").trim();
    const meaning = patch.meaning || oldMeaning;
    const shouldAlignDefinition = Boolean(
      patch.meaning
      && (!oldDefinition || oldDefinition === oldMeaning)
    );
    const next = {
      ...entry,
      ...(patch.meaning ? { meaning } : {}),
      ...(patch.meaning && Object.prototype.hasOwnProperty.call(entry, "meaningZh")
        ? { meaningZh: meaning }
        : {}),
      ...(shouldAlignDefinition ? { definition: meaning } : {}),
      meaningDetailZh: patch.detail,
      meaningDetailSource: "manual-common-meaning-review",
      meaningDetailReviewedAt: now,
      updatedAt: now
    };
    if (!sameProtectedFields(entry, next)) {
      throw new Error(`Protected identity or user state changed: ${entry.word}`);
    }
    const after = evaluate(next, knownHeadwords);
    if (after.lane === "completion" || after.lane === "repair") {
      throw new Error(
        `Manual patch did not produce a complete entry: ${entry.word}; lane=${after.lane}; missing=${after.missingContentFields?.join(",") || ""}`
      );
    }
    countsAfter[after.lane] += 1;
    applied.push({
      word: entry.word,
      oldMeaning,
      meaning,
      meaningChanged: meaning !== oldMeaning,
      manualReviewUpdate: isChangedManualReview,
      before: before.lane,
      after: after.lane
    });
    return next;
  });

  if (
    nextWords.length !== payload.words.length
    || nextWords.some((entry, index) => !sameProtectedFields(payload.words[index], entry))
  ) {
    throw new Error("Master lexicon count/order/stable identity/user state changed; manual write stopped.");
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
    manualPatchRecords: patchesByIndex.size,
    applied: applied.length,
    meaningCorrections: applied.filter((item) => item.meaningChanged).length,
    manualReviewUpdates: applied.filter((item) => item.manualReviewUpdate).length,
    skippedAlreadyComplete: skippedAlreadyComplete.length,
    resolved: applied.filter((item) => item.after !== "completion" && item.after !== "repair").length,
    countsBefore,
    countsAfter,
    stableIdsChanged: 0,
    userStateFieldsChanged: 0,
    preview: applied.slice(0, 100)
  };

  if (!shouldApply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const stamp = now.replace(/[:.]/g, "-");
  const backupDirectory = path.join(root, "backups", "main-manual-meaning-detail", stamp);
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

  report.backupDirectory = path.relative(root, backupDirectory).replace(/\\/g, "/");
  fs.writeFileSync(path.join(backupDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main();
