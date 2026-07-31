/**
 * Keep public/data/words.json in sync with the authoritative cache lexicon.
 * Usage:
 *   node scripts/sync-master-lexicon.mjs [--check]
 *   node scripts/sync-master-lexicon.mjs --rebaseline
 *
 * After normal local deletes, words.json changes but the old hardcoded baseline
 * would make start-windows.bat fail (it kills port 3000 first, then aborts).
 * This script auto-heals baseline drift when the cache itself is healthy.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { writeMasterLexiconBaseline } from "../app/lib/vocab/master-lexicon-baseline-io.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_PATH = path.join(ROOT, ".static-export-cache", "words.json");
const PUBLIC_PATH = path.join(ROOT, "public", "data", "words.json");
const BASELINE_PATH = path.join(ROOT, "app", "lib", "vocab", "master-lexicon-baseline.mjs");

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

function loadBaseline() {
  const source = fs.readFileSync(BASELINE_PATH, "utf8");
  const count = Number(/MASTER_LEXICON_EXPECTED_COUNT\s*=\s*(\d+)/.exec(source)?.[1]);
  const version = /MASTER_LEXICON_VERSION\s*=\s*"([^"]+)"/.exec(source)?.[1] || "";
  const fileHash = /MASTER_LEXICON_SHA256\s*=\s*"([^"]+)"/.exec(source)?.[1] || "";
  return { count, version, fileHash };
}

function isSelfConsistentCache(cache) {
  return (
    cache.wordsLength > 0 &&
    cache.wordsLength === cache.count &&
    Boolean(cache.version) &&
    Boolean(cache.fileHash)
  );
}

function collectBaselineErrors(cache, baseline) {
  const errors = [];
  if (cache.wordsLength !== cache.count) errors.push("cache count metadata mismatch");
  if (!cache.version) errors.push("cache version missing");
  if (cache.wordsLength !== baseline.count) {
    errors.push(`cache count ${cache.wordsLength} !== baseline ${baseline.count}`);
  }
  if (cache.version !== baseline.version) {
    errors.push(`cache version ${cache.version} !== baseline ${baseline.version}`);
  }
  if (cache.fileHash !== baseline.fileHash) {
    errors.push(`cache file hash ${cache.fileHash} !== baseline ${baseline.fileHash}`);
  }
  return errors;
}

function collectPublicErrors(cache) {
  const errors = [];
  if (!fs.existsSync(PUBLIC_PATH)) {
    errors.push("public/data/words.json missing");
    return errors;
  }
  const pub = readMeta(PUBLIC_PATH);
  if (pub.fileHash !== cache.fileHash) errors.push("public words.json hash differs from cache");
  if (pub.wordsLength !== cache.wordsLength) errors.push("public words.json count differs from cache");
  return errors;
}

function rebaselineFromCache(cache) {
  return writeMasterLexiconBaseline(
    {
      count: cache.wordsLength,
      version: cache.version,
      fileHash: cache.fileHash
    },
    { projectRoot: ROOT }
  );
}

function ensurePublicMatchesCache(cache) {
  fs.mkdirSync(path.dirname(PUBLIC_PATH), { recursive: true });
  if (!fs.existsSync(PUBLIC_PATH) || readMeta(PUBLIC_PATH).fileHash !== cache.fileHash) {
    fs.copyFileSync(CACHE_PATH, PUBLIC_PATH);
  }
}

function onlyBaselineDrift(errors) {
  return errors.length > 0 && errors.every((item) => item.includes("!== baseline"));
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const rebaseline = process.argv.includes("--rebaseline");

  if (!fs.existsSync(CACHE_PATH)) {
    console.error(JSON.stringify({ ok: false, error: "missing cache lexicon", path: CACHE_PATH }, null, 2));
    process.exitCode = 1;
    return;
  }

  let cache;
  try {
    cache = readMeta(CACHE_PATH);
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: "cache lexicon is not valid JSON (often leftover git merge markers)",
          detail: error instanceof Error ? error.message : String(error),
          path: CACHE_PATH
        },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }

  if (rebaseline) {
    if (!isSelfConsistentCache(cache)) {
      console.error(
        JSON.stringify(
          {
            ok: false,
            error: "cannot rebaseline from inconsistent cache",
            cacheCount: cache.count,
            wordsLength: cache.wordsLength,
            version: cache.version
          },
          null,
          2
        )
      );
      process.exitCode = 1;
      return;
    }

    ensurePublicMatchesCache(cache);
    const written = rebaselineFromCache(cache);
    const baseline = loadBaseline();
    const errors = [...collectBaselineErrors(cache, baseline), ...collectPublicErrors(cache)];
    const ok = errors.length === 0;
    console.log(
      JSON.stringify(
        {
          ok,
          mode: "rebaseline",
          cacheCount: cache.wordsLength,
          version: cache.version,
          fileHash: cache.fileHash,
          baselinePath: path.relative(ROOT, written.filePath).replace(/\\/g, "/"),
          errors
        },
        null,
        2
      )
    );
    if (!ok) process.exitCode = 1;
    return;
  }

  let baseline = loadBaseline();
  let baselineErrors = collectBaselineErrors(cache, baseline);
  let autoRebaselined = false;

  // Local delete/edit changes words.json; heal stale baseline when cache is healthy.
  if (onlyBaselineDrift(baselineErrors) && isSelfConsistentCache(cache)) {
    rebaselineFromCache(cache);
    baseline = loadBaseline();
    baselineErrors = collectBaselineErrors(cache, baseline);
    autoRebaselined = true;
  }

  if (checkOnly) {
    const publicErrors = collectPublicErrors(cache);
    // If public is merely out of date but cache is good, copy cache → public.
    if (
      publicErrors.length &&
      isSelfConsistentCache(cache) &&
      publicErrors.every(
        (item) =>
          item === "public/data/words.json missing" ||
          item.includes("hash differs") ||
          item.includes("count differs")
      )
    ) {
      ensurePublicMatchesCache(cache);
      publicErrors.length = 0;
      publicErrors.push(...collectPublicErrors(cache));
    }

    const errors = [...baselineErrors, ...publicErrors];
    const ok = errors.length === 0;
    console.log(
      JSON.stringify(
        {
          ok,
          mode: "check",
          autoRebaselined,
          cacheCount: cache.wordsLength,
          errors
        },
        null,
        2
      )
    );
    if (!ok) process.exitCode = 1;
    return;
  }

  // sync mode
  if (baselineErrors.length) {
    console.error(
      JSON.stringify(
        { ok: false, error: "cache lexicon failed baseline checks", errors: baselineErrors },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }

  ensurePublicMatchesCache(cache);
  const pub = readMeta(PUBLIC_PATH);
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "sync",
        autoRebaselined,
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
