#!/usr/bin/env node

/**
 * Repair two human-reviewed sense/example mismatches wherever the active
 * learning sources reuse them. Historical backups are intentionally left
 * untouched. This script is local-only and never calls an AI service.
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
const activePaths = [publicPath, staticPath, readingGPath, completionPath];
const repairedAt = new Date().toISOString();
const version = "manual-stroke-ideal-sense-example-repair-v1-20260812";

const strokeOldExample = "He won the race by a stroke of luck.";
const strokeOldChinese = "他靠运气赢得了比赛。";
const strokeExample = "Each stroke of the oar moved the boat forward.";
const strokeChinese = "船桨每划一下，船就向前移动。";
const idealExample = "She has high ideals about social justice.";
const idealOldChinese = "她对社会主义有很高的理想。";
const idealChinese = "她对社会正义抱有崇高理想。";

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

function repairValue(value, stats) {
  if (Array.isArray(value)) return value.map((item) => repairValue(item, stats));
  if (!value || typeof value !== "object") return value;
  const next = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, repairValue(item, stats)]));

  if (
    next.example === strokeOldExample
    && (next.exampleCn === strokeOldChinese || next.exampleZh === strokeOldChinese)
  ) {
    next.example = strokeExample;
    if (Object.prototype.hasOwnProperty.call(next, "exampleCn")) next.exampleCn = strokeChinese;
    if (Object.prototype.hasOwnProperty.call(next, "exampleZh")) next.exampleZh = strokeChinese;
    stats.stroke += 1;
  }

  if (
    next.example === idealExample
    && (next.exampleCn === idealOldChinese || next.exampleZh === idealOldChinese)
  ) {
    if (Object.prototype.hasOwnProperty.call(next, "exampleCn")) next.exampleCn = idealChinese;
    if (Object.prototype.hasOwnProperty.call(next, "exampleZh")) next.exampleZh = idealChinese;
    if (next.pos === "noun" && next.meaningZh === "完美的") next.meaningZh = "理想，典范";
    stats.ideal += 1;
  }
  return next;
}

function main() {
  const publicRaw = fs.readFileSync(publicPath);
  const staticRaw = fs.readFileSync(staticPath);
  if (!publicRaw.equals(staticRaw)) throw new Error("The two authoritative master lexicon files differ; repair stopped.");

  const rawByPath = new Map(activePaths.map((filePath) => [filePath, fs.readFileSync(filePath)]));
  const nextByPath = new Map();
  const statsByPath = {};
  for (const filePath of activePaths) {
    const stats = { stroke: 0, ideal: 0 };
    const payload = JSON.parse(rawByPath.get(filePath).toString("utf8"));
    let nextPayload = repairValue(payload, stats);
    if (filePath === publicPath || filePath === staticPath) {
      nextPayload = {
        ...nextPayload,
        count: nextPayload.words.length,
        savedAt: repairedAt,
        lexiconHash: computeLexiconHash(nextPayload.words),
        integrityHash: computeIntegrityHash(nextPayload.words)
      };
    } else {
      nextPayload.updatedAt = repairedAt;
    }
    nextByPath.set(filePath, `${JSON.stringify(nextPayload, null, 2)}\n`);
    statsByPath[path.relative(root, filePath).replaceAll("\\", "/")] = stats;
  }

  if (statsByPath["public/data/words.json"].stroke !== 2 || statsByPath["public/data/words.json"].ideal !== 3) {
    throw new Error(`Unexpected master repair coverage: ${JSON.stringify(statsByPath["public/data/words.json"])}`);
  }
  if (statsByPath[".static-export-cache/words.json"].stroke !== 2 || statsByPath[".static-export-cache/words.json"].ideal !== 3) {
    throw new Error(`Unexpected static master repair coverage: ${JSON.stringify(statsByPath[".static-export-cache/words.json"])}`);
  }
  if (statsByPath["public/data/reading-g-vocab.json"].stroke !== 2 || statsByPath["public/data/reading-g-vocab.json"].ideal !== 2) {
    throw new Error(`Unexpected G vocabulary repair coverage: ${JSON.stringify(statsByPath["public/data/reading-g-vocab.json"])}`);
  }
  if (statsByPath["public/data/reading-g-ai-completions.json"].stroke !== 1 || statsByPath["public/data/reading-g-ai-completions.json"].ideal !== 1) {
    throw new Error(`Unexpected cache repair coverage: ${JSON.stringify(statsByPath["public/data/reading-g-ai-completions.json"])}`);
  }

  const beforeMaster = JSON.parse(publicRaw.toString("utf8"));
  const afterMaster = JSON.parse(nextByPath.get(publicPath));
  if (beforeMaster.words.length !== afterMaster.words.length) throw new Error("Master word count changed; repair stopped.");
  for (let index = 0; index < beforeMaster.words.length; index += 1) {
    if (JSON.stringify(protectedSnapshot(beforeMaster.words[index])) !== JSON.stringify(protectedSnapshot(afterMaster.words[index]))) {
      throw new Error(`Protected identity or user state changed at master index ${index}; repair stopped.`);
    }
  }

  const report = {
    mode: shouldApply ? "apply" : "dry-run",
    version,
    statsByPath,
    stableIdsChanged: 0,
    userStateFieldsChanged: 0,
    networkCalls: 0,
    paidAiCalls: 0
  };
  if (!shouldApply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const baselineRaw = fs.readFileSync(baselinePath);
  const stamp = repairedAt.replace(/[:.]/g, "-");
  const backupDirectory = path.join(root, "backups", "stroke-ideal-sense-example-repair", stamp);
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backupPairs = activePaths.map((filePath) => [filePath, path.join(backupDirectory, path.basename(filePath))]);
  backupPairs.push([baselinePath, path.join(backupDirectory, path.basename(baselinePath))]);
  for (const [source, destination] of backupPairs) fs.copyFileSync(source, destination);

  const nextMaster = JSON.parse(nextByPath.get(publicPath));
  const baselineContent = renderMasterLexiconBaseline({
    count: nextMaster.count,
    version: nextMaster.version,
    fileHash: sha256(nextByPath.get(publicPath))
  });
  try {
    for (const [filePath, content] of nextByPath) atomicWrite(filePath, content);
    atomicWrite(baselinePath, baselineContent);
  } catch (error) {
    for (const [filePath, raw] of rawByPath) atomicWrite(filePath, raw);
    atomicWrite(baselinePath, baselineRaw);
    throw error;
  }
  report.backupDirectory = path.relative(root, backupDirectory).replaceAll("\\", "/");
  console.log(JSON.stringify(report, null, 2));
}

main();
