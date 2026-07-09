/**
 * Keep public/data/words.json in sync with the authoritative cache lexicon.
 * Usage: node scripts/sync-master-lexicon.mjs [--check]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { MASTER_LEXICON_EXPECTED_COUNT } from "../app/lib/vocab/master-lexicon-baseline.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_PATH = path.join(ROOT, ".static-export-cache", "words.json");
const PUBLIC_PATH = path.join(ROOT, "public", "data", "words.json");

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readMeta(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const payload = JSON.parse(raw);
  const words = Array.isArray(payload?.words) ? payload.words : Array.isArray(payload) ? payload : [];
  return {
    raw,
    payload,
    count: Number(payload?.count || words.length),
    wordsLength: words.length,
    version: String(payload?.version || ""),
    lexiconHash: String(payload?.lexiconHash || ""),
    fileHash: sha256File(filePath)
  };
}

function main() {
  const checkOnly = process.argv.includes("--check");
  if (!fs.existsSync(CACHE_PATH)) {
    console.error(JSON.stringify({ ok: false, error: "missing cache lexicon", path: CACHE_PATH }, null, 2));
    process.exitCode = 1;
    return;
  }

  const cache = readMeta(CACHE_PATH);
  const errors = [];
  if (cache.wordsLength !== cache.count) errors.push("cache count metadata mismatch");
  if (cache.wordsLength !== MASTER_LEXICON_EXPECTED_COUNT) {
    errors.push(`cache count ${cache.wordsLength} !== baseline ${MASTER_LEXICON_EXPECTED_COUNT}`);
  }

  if (checkOnly) {
    if (!fs.existsSync(PUBLIC_PATH)) {
      errors.push("public/data/words.json missing");
    } else {
      const pub = readMeta(PUBLIC_PATH);
      if (pub.fileHash !== cache.fileHash) errors.push("public words.json hash differs from cache");
      if (pub.wordsLength !== cache.wordsLength) errors.push("public words.json count differs from cache");
    }
    const ok = errors.length === 0;
    console.log(JSON.stringify({ ok, mode: "check", cacheCount: cache.wordsLength, errors }, null, 2));
    if (!ok) process.exitCode = 1;
    return;
  }

  if (errors.length) {
    console.error(JSON.stringify({ ok: false, error: "cache lexicon failed baseline checks", errors }, null, 2));
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(path.dirname(PUBLIC_PATH), { recursive: true });
  fs.copyFileSync(CACHE_PATH, PUBLIC_PATH);
  const pub = readMeta(PUBLIC_PATH);
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "sync",
        count: pub.wordsLength,
        version: pub.version,
        lexiconHash: pub.lexiconHash,
        cachePath: path.relative(ROOT, CACHE_PATH).replace(/\\/g, "/"),
        publicPath: path.relative(ROOT, PUBLIC_PATH).replace(/\\/g, "/"),
        fileHash: pub.fileHash
      },
      null,
      2
    )
  );
}

main();
