export const runtime = "nodejs";

import { requireLocalAdmin } from "../../lib/api/local-admin-guard.mjs";

import { existsSync, readdirSync, statSync, unlinkSync } from "fs";
import path from "path";
import {
  REAL_AUDIO_CACHE_VERSION,
  audioIndexPath,
  cacheDir,
  ensureRealVoiceAudio,
  isValidCachedRealAudioEntry,
  normalizeAudioKey,
  readJson,
  safeSpeechText,
  writeJson
} from "../../lib/vocab-audio-source.mjs";

const AUDIO_FILE_RE = /\.(mp3|ogg|oga|wav|webm)$/i;

function listAudioFiles() {
  const dir = cacheDir();
  return readdirSync(dir)
    .filter((name) => AUDIO_FILE_RE.test(name))
    .map((name) => {
      const filepath = path.join(dir, name);
      let size = 0;
      try {
        size = statSync(filepath).size || 0;
      } catch {}

      return {
        name,
        filepath,
        size,
        real: name.startsWith("real-")
      };
    });
}

function readAudioIndex() {
  return readJson(audioIndexPath(), {});
}

function summarizeAudioCache() {
  const files = listAudioFiles();
  const index = readAudioIndex();
  const entries = Object.values(index || {});
  const referenced = new Set(
    entries
      .map((entry) => String(entry?.filename || ""))
      .filter(Boolean)
  );

  const realFiles = files.filter((file) => file.real);
  const fallbackFiles = files.filter((file) => !file.real);
  const unreferencedFallbackFiles = fallbackFiles.filter((file) => !referenced.has(file.name));
  const indexedReal = entries.filter((entry) => entry?.realAudio && entry?.hasAudio);
  const indexedFallback = entries.filter((entry) => entry?.hasAudio && entry?.filename && !entry?.realAudio);
  const realUnavailable = entries.filter((entry) => entry?.realAudioUnavailable);

  return {
    ok: true,
    version: REAL_AUDIO_CACHE_VERSION,
    files: {
      total: files.length,
      real: realFiles.length,
      fallback: fallbackFiles.length,
      unreferencedFallback: unreferencedFallbackFiles.length
    },
    index: {
      total: Object.keys(index || {}).length,
      real: indexedReal.length,
      fallback: indexedFallback.length,
      realUnavailable: realUnavailable.length
    },
    bytes: {
      total: files.reduce((sum, file) => sum + file.size, 0),
      real: realFiles.reduce((sum, file) => sum + file.size, 0),
      fallback: fallbackFiles.reduce((sum, file) => sum + file.size, 0)
    },
    samples: {
      fallback: indexedFallback.slice(0, 10).map((entry) => ({
        text: entry.text || "",
        kind: entry.kind || "word",
        source: entry.source || "",
        filename: entry.filename || ""
      })),
      realUnavailable: realUnavailable.slice(0, 10).map((entry) => ({
        text: entry.text || "",
        kind: entry.kind || "word",
        source: entry.source || ""
      }))
    }
  };
}

function deleteFileInsideCache(filename, failures = []) {
  const cleanName = path.basename(String(filename || ""));
  if (!cleanName || cleanName.startsWith("real-") || !AUDIO_FILE_RE.test(cleanName)) return 0;

  const filepath = path.join(cacheDir(), cleanName);
  if (!existsSync(filepath)) return 0;

  let size = 0;
  try {
    size = statSync(filepath).size || 0;
    unlinkSync(filepath);
  } catch {
    failures.push({ filename: cleanName, reason: "locked-or-permission-denied" });
    return 0;
  }
  return size;
}

function cleanupFallbackAudio() {
  const indexFile = audioIndexPath();
  const index = readJson(indexFile, {});
  const files = listAudioFiles();
  let removedFiles = 0;
  let savedBytes = 0;
  let updatedIndex = 0;
  const deletionFailures = [];

  for (const [key, entry] of Object.entries(index || {})) {
    if (!entry?.hasAudio || entry?.realAudio) continue;

    const deletedBytes = deleteFileInsideCache(entry.filename, deletionFailures);
    if (deletedBytes > 0) {
      removedFiles += 1;
      savedBytes += deletedBytes;
    }

    index[key] = {
      ...entry,
      filename: "",
      hasAudio: false,
      realAudio: false,
      fallbackCleared: true,
      source: "fallback-cleared",
      contentType: "",
      cleanedAt: Date.now(),
      updatedAt: Date.now()
    };
    updatedIndex += 1;
  }

  for (const file of files) {
    if (file.real) continue;
    const deletedBytes = deleteFileInsideCache(file.name, deletionFailures);
    if (deletedBytes > 0) {
      removedFiles += 1;
      savedBytes += deletedBytes;
    }
  }

  writeJson(indexFile, index);

  return {
    ...summarizeAudioCache(),
    action: "cleanupFallback",
    removedFiles,
    savedBytes,
    updatedIndex,
    deletionFailures: deletionFailures.slice(0, 20)
  };
}

function normalizeRetryItems(rawItems = []) {
  const items = Array.isArray(rawItems) ? rawItems : [];
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const kind = String(item?.kind || "word");
    const text = safeSpeechText(item?.word || item?.text || item?.phrase || item || "", kind === "sentence" ? 500 : 160);
    const key = normalizeAudioKey(text);

    if (!text || !key || seen.has(`${kind}:${key}`)) continue;
    seen.add(`${kind}:${key}`);
    result.push({ text, kind, key });
  }

  return result;
}

async function retryRealAudio(rawItems = [], options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 200) || 200, 500));
  const items = normalizeRetryItems(rawItems).slice(0, limit);
  const indexFile = audioIndexPath();
  const index = readJson(indexFile, {});
  let attempted = 0;
  let skipped = 0;
  let realFound = 0;
  let realMissing = 0;
  let replacedFallback = 0;
  let removedFallbackBytes = 0;
  const samples = [];
  const results = [];

  for (const item of items) {
    const before = index[item.key] || {};
    if (
      before.realAudio &&
      before.hasAudio &&
      before.realAudioVersion === REAL_AUDIO_CACHE_VERSION &&
      isValidCachedRealAudioEntry(before, item.text, item.kind) &&
      options.force !== true
    ) {
      skipped += 1;
      const cachedResult = {
        text: item.text,
        kind: item.kind,
        source: before.source || "real-cache",
        provider: before.provider || "",
        phonetic: before.phonetic || "",
        ok: true,
        skipped: true,
        realAudio: true
      };
      results.push(cachedResult);
      if (samples.length < 20) samples.push(cachedResult);
      continue;
    }

    attempted += 1;
    const previousFallback = before?.hasAudio && !before?.realAudio ? before.filename : "";
    const result = await ensureRealVoiceAudio(item.text, index, { kind: item.kind });
    const latest = index[item.key] || {};

    if (result.ok) {
      realFound += 1;
      if (previousFallback) {
        const bytes = deleteFileInsideCache(previousFallback);
        if (bytes > 0) {
          replacedFallback += 1;
          removedFallbackBytes += bytes;
        }
      }
    } else {
      realMissing += 1;
    }

    const entryResult = {
      text: item.text,
      kind: item.kind,
      source: result.ok ? (result.source || latest.source || "real-cache") : (result.source || latest.source || "real-miss"),
      provider: latest.provider || "",
      phonetic: latest.phonetic || result.phonetic || "",
      ok: Boolean(result.ok),
      skipped: false,
      realAudio: Boolean(result.ok)
    };
    results.push(entryResult);

    if (samples.length < 20) {
      samples.push(entryResult);
    }
  }

  writeJson(indexFile, index);

  return {
    ...summarizeAudioCache(),
    action: "retryReal",
    requested: items.length,
    attempted,
    skipped,
    realFound,
    realMissing,
    replacedFallback,
    removedFallbackBytes,
    results,
    retrySamples: samples
  };
}

export async function GET() {
  try {
    return Response.json(summarizeAudioCache());
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: "读取发音缓存统计失败",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  const guard = requireLocalAdmin(req);
  if (guard) return guard;

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "stats");

    if (action === "cleanupFallback") {
      return Response.json(cleanupFallbackAudio());
    }

    if (action === "retryReal") {
      return Response.json(await retryRealAudio(body.items || [], body));
    }

    return Response.json(summarizeAudioCache());
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: "发音缓存操作失败",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
