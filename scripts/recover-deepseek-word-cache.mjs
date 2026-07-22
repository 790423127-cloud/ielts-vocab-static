#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildDeepseekCacheRecoveryPlan } from "../app/lib/vocab/deepseek-cache-recovery.mjs";
import { computeIntegrityHash, computeLexiconHash } from "../app/lib/vocab/lexicon-guard.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CACHE_PATH = path.join(ROOT, ".ai-cache", "deepseek-word-cache.json");
const MASTER_PATH = path.join(ROOT, ".static-export-cache", "words.json");
const PUBLIC_PATH = path.join(ROOT, "public", "data", "words.json");
const REPORT_DIR = path.join(ROOT, "reports", "deepseek-cache-recovery");

function parseArgs(argv) {
  const options = { apply: false, cachePath: DEFAULT_CACHE_PATH, since: "" };
  for (const arg of argv) {
    if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
    else if (arg.startsWith("--cache=")) options.cachePath = path.resolve(ROOT, arg.slice("--cache=".length));
    else if (arg.startsWith("--since=")) options.since = arg.slice("--since=".length).trim();
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function timestampForPath() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function escapeTsv(value) {
  if (Array.isArray(value)) value = value.join("|");
  if (value && typeof value === "object") value = JSON.stringify(value);
  return String(value ?? "").replace(/[\t\r\n]+/g, " ");
}

function writeTsv(filePath, rows, fields) {
  const lines = [fields.join("\t")];
  for (const row of rows) lines.push(fields.map((field) => escapeTsv(row[field])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function printHelp() {
  console.log("Usage:\n  node scripts/recover-deepseek-word-cache.mjs [--dry-run] [--apply] [--cache=PATH] [--since=YYYY-MM-DD]\n\nDefaults to dry-run. This script never calls an AI API or any network endpoint.");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();

  for (const required of [MASTER_PATH, options.cachePath]) {
    if (!fs.existsSync(required)) throw new Error(`Missing required file: ${path.relative(ROOT, required)}`);
  }

  const masterPayload = readJson(MASTER_PATH);
  const originalWords = Array.isArray(masterPayload?.words) ? masterPayload.words : Array.isArray(masterPayload) ? masterPayload : [];
  const cacheObject = readJson(options.cachePath);
  if (!originalWords.length) throw new Error("Master lexicon contains no words");
  if (!cacheObject || Array.isArray(cacheObject) || typeof cacheObject !== "object") throw new Error("DeepSeek cache must be an object keyed by word");

  const beforeIds = originalWords.map((entry) => String(entry?.id || entry?.wordId || ""));
  const plan = buildDeepseekCacheRecoveryPlan(originalWords, cacheObject, { since: options.since });
  const afterIds = plan.words.map((entry) => String(entry?.id || entry?.wordId || ""));
  if (plan.words.length !== originalWords.length) throw new Error("Recovery changed physical word count");
  if (JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) throw new Error("Recovery changed stable IDs");

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const byStatus = (status) => plan.results.filter((item) => item.status === status);
  const summary = {
    ok: true,
    mode: options.apply ? "apply" : "dry-run",
    cachePath: path.relative(ROOT, options.cachePath).replace(/\\/g, "/"),
    cacheEntries: Object.keys(cacheObject).length,
    since: options.since || null,
    masterPath: path.relative(ROOT, MASTER_PATH).replace(/\\/g, "/"),
    physicalWordsBefore: originalWords.length,
    physicalWordsAfter: plan.words.length,
    matchedCanFill: plan.counts.MATCHED_CAN_FILL || 0,
    matchedNoChange: plan.counts.MATCHED_NO_CHANGE || 0,
    matchedConflict: plan.counts.MATCHED_CONFLICT || 0,
    skippedInflectedReference: plan.counts.SKIP_INFLECTED_REFERENCE || 0,
    notFound: plan.counts.NOT_FOUND || 0,
    invalidCacheEntry: plan.counts.INVALID_CACHE_ENTRY || 0,
    changedWords: plan.changedWords,
    changedFields: plan.changedFields,
    stableIdChanges: 0,
    apiCalls: 0,
    estimatedCost: 0,
    applied: false,
    backupDir: null
  };

  writeTsv(path.join(REPORT_DIR, "matched-can-fill.tsv"), byStatus("MATCHED_CAN_FILL"), ["word", "id", "changedFields", "generatedAt", "cachedAt", "cacheKey"]);
  writeTsv(path.join(REPORT_DIR, "no-change.tsv"), byStatus("MATCHED_NO_CHANGE"), ["word", "id", "cacheKey"]);
  writeTsv(path.join(REPORT_DIR, "conflicts.tsv"), byStatus("MATCHED_CONFLICT"), ["word", "id", "reason", "cacheKey"]);
  writeTsv(path.join(REPORT_DIR, "skipped-inflected-reference.tsv"), byStatus("SKIP_INFLECTED_REFERENCE"), ["word", "id", "cacheKey"]);
  writeTsv(path.join(REPORT_DIR, "not-found.tsv"), byStatus("NOT_FOUND"), ["word", "cacheKey"]);
  writeTsv(path.join(REPORT_DIR, "invalid-cache.tsv"), byStatus("INVALID_CACHE_ENTRY"), ["cacheKey", "reason"]);

  if (options.apply && plan.changedWords > 0) {
    const backupDir = path.join(ROOT, "backup", `deepseek-cache-recovery-${timestampForPath()}`);
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(MASTER_PATH, path.join(backupDir, "words.cache.before.json"));
    if (fs.existsSync(PUBLIC_PATH)) fs.copyFileSync(PUBLIC_PATH, path.join(backupDir, "words.public.before.json"));
    fs.copyFileSync(options.cachePath, path.join(backupDir, "deepseek-word-cache.before.json"));

    const savedAt = new Date().toISOString();
    const payload = {
      ...(Array.isArray(masterPayload) ? {} : masterPayload),
      words: plan.words,
      count: plan.words.length,
      savedAt,
      lexiconHash: computeLexiconHash(plan.words),
      integrityHash: computeIntegrityHash(plan.words)
    };
    const payloadText = `${JSON.stringify(payload, null, 2)}\n`;
    fs.writeFileSync(MASTER_PATH, payloadText, "utf8");
    fs.mkdirSync(path.dirname(PUBLIC_PATH), { recursive: true });
    fs.writeFileSync(PUBLIC_PATH, payloadText, "utf8");

    const rereadMaster = readJson(MASTER_PATH);
    const rereadPublic = readJson(PUBLIC_PATH);
    if (rereadMaster.words.length !== originalWords.length || rereadPublic.words.length !== originalWords.length) {
      throw new Error("Post-write word count verification failed");
    }
    if (sha256File(MASTER_PATH) !== sha256File(PUBLIC_PATH)) throw new Error("Master and public lexicon copies differ after recovery");

    summary.applied = true;
    summary.backupDir = path.relative(ROOT, backupDir).replace(/\\/g, "/");
    summary.outputSha256 = sha256File(MASTER_PATH);
  }

  fs.writeFileSync(path.join(REPORT_DIR, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error), apiCalls: 0, estimatedCost: 0 }, null, 2));
  process.exitCode = 1;
}
