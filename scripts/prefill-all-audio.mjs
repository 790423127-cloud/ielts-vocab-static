import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  REAL_AUDIO_CACHE_VERSION,
  audioIndexPath,
  cacheDir,
  ensureEdgeAudio,
  ensureRealVoiceAudio,
  getReadableRealAudioEntry,
  isSimpleDictionaryWord,
  isValidCachedRealAudioEntry,
  normalizeAudioKey,
  readJson,
  safeSpeechText,
  shouldRetryRealAudio,
  writeJson
} from "../app/lib/vocab-audio-source.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROGRESS_FILE = path.join(root, "reports", "prefill-all-audio-progress.json");
const REPORT_FILE = path.join(root, "reports", "prefill-all-audio-report.json");
const LOG_FILE = path.join(root, "reports", "prefill-all-audio.log");

const args = new Set(process.argv.slice(2));
const REAL_ONLY = args.has("--real-only");
// Product default: Edge fallback only (words + sentences share one rule).
const EDGE_ONLY = !REAL_ONLY && (args.has("--edge-only") || !args.has("--real-first"));
const WORDS_ONLY = args.has("--words-only");
const RESET = args.has("--reset");
const FORCE = args.has("--force");
const CONCURRENCY = Math.max(1, Math.min(Number(process.env.AUDIO_PREFILL_CONCURRENCY || 4) || 4, 6));

const EDGE_VOICE = "en-US-AriaNeural";
const EDGE_RATE = "-10%";

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  writeFileSync(LOG_FILE, `${line}\n`, { encoding: "utf8", flag: "a" });
}

function normalizeWord(word) {
  return String(word || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "")
    .replace(/\s+/g, " ");
}

function normalizePhraseItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (typeof item === "string") return { phrase: item };
      return {
        phrase: item?.phrase || item?.word || "",
        chinese: item?.meaning || item?.chinese || item?.cn || ""
      };
    })
    .filter((item) => String(item.phrase || "").trim());
}

function loadWords() {
  const candidates = [
    path.join(root, ".static-export-cache", "words.json"),
    path.join(root, "public", "data", "words.json")
  ];

  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const payload = JSON.parse(readFileSync(file, "utf8"));
    const words = Array.isArray(payload) ? payload : payload.words || [];
    if (words.length) return { words, source: file };
  }

  throw new Error("No words.json found");
}

function collectTargets(words, scope = "word-example") {
  const map = new Map();

  function add(text, kind = "word") {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean || clean === "完成") return;

    const key = normalizeWord(clean);
    if (!key || map.has(key)) return;

    map.set(key, { key, text: clean, kind });
  }

  for (const word of words) {
    add(word.word, isSimpleDictionaryWord(word.word) ? "word" : "phrase");

    if (scope === "all") {
      add(word.example, "sentence");
      normalizePhraseItems(word.collocations).forEach((item) => add(item.phrase, "phrase"));
      normalizePhraseItems(word.phraseCollocations).forEach((item) => add(item.phrase, "phrase"));

      if (Array.isArray(word.forms)) {
        word.forms.forEach((form) => add(form?.word, isSimpleDictionaryWord(form?.word) ? "word" : "phrase"));
      }

      if (Array.isArray(word.wordFamily)) {
        word.wordFamily.forEach((family) =>
          add(family?.word, isSimpleDictionaryWord(family?.word) ? "word" : "phrase")
        );
      }
    } else if (scope === "word-example") {
      add(word.example, "sentence");
    }
  }

  return Array.from(map.values());
}

function hasCachedAudio(indexed = {}) {
  if (!indexed?.hasAudio || !indexed?.filename) return false;
  return existsSync(path.join(cacheDir(), indexed.filename));
}

function hasValidEdgeCache(indexed = {}) {
  return Boolean(
    indexed?.hasAudio &&
    indexed?.filename &&
    !indexed?.realAudio &&
    hasCachedAudio(indexed)
  );
}

function hasValidLlWavCache(indexed = {}, text = "", kind = "word") {
  return Boolean(
    indexed?.realAudio &&
    indexed?.hasAudio &&
    indexed.realAudioVersion === REAL_AUDIO_CACHE_VERSION &&
    isValidCachedRealAudioEntry(indexed, text, kind) &&
    hasCachedAudio(indexed)
  );
}

async function ensureEdgeOnlyAudio(text, audioIndex, options = {}) {
  const kind = options.kind || "word";
  const key = normalizeAudioKey(text);
  const indexed = audioIndex[key];

  if (hasValidEdgeCache(indexed)) {
    return { ok: true, source: indexed.source || "edge-cache", realAudio: false, cacheHit: true };
  }

  const edge = await ensureEdgeAudio(text, audioIndex, {
    kind,
    voice: EDGE_VOICE,
    rate: EDGE_RATE
  });

  return {
    ok: edge.ok,
    source: edge.source,
    realAudio: false,
    cacheHit: false
  };
}

async function ensureRealFirstAudio(text, audioIndex, options = {}) {
  if (EDGE_ONLY) {
    return ensureEdgeOnlyAudio(text, audioIndex, options);
  }

  const kind = options.kind || "word";
  const key = normalizeAudioKey(text);
  const indexed = audioIndex[key];

  if (hasValidLlWavCache(indexed, text, kind)) {
    return { ok: true, source: indexed.source || "real-cache", realAudio: true, cacheHit: true };
  }

  const shouldFetchReal = REAL_ONLY || FORCE || shouldRetryRealAudio(indexed, kind);
  if (shouldFetchReal) {
    const real = await ensureRealVoiceAudio(text, audioIndex, { kind });
    if (real.ok) {
      return { ok: true, source: real.source, realAudio: true, cacheHit: false };
    }

    if (REAL_ONLY) {
      const preserved = getReadableRealAudioEntry(key, audioIndex);
      if (preserved) {
        return { ok: true, source: preserved.source || "real-cache", realAudio: true, cacheHit: true };
      }
      return { ok: false, source: real.source || "real-miss", realAudio: false, cacheHit: false };
    }
  }

  const latest = audioIndex[key];
  if (hasValidLlWavCache(latest, text, kind)) {
    return { ok: true, source: latest.source || "real-cache", realAudio: true, cacheHit: true };
  }

  if (hasValidEdgeCache(latest)) {
    return { ok: true, source: latest.source || "edge-cache", realAudio: false, cacheHit: true };
  }

  return ensureEdgeOnlyAudio(text, audioIndex, options);
}

function summarizeIndex(index = {}) {
  const entries = Object.values(index);
  return {
    total: entries.length,
    real: entries.filter((entry) => entry?.realAudio && entry?.hasAudio).length,
    fallback: entries.filter((entry) => entry?.hasAudio && entry?.filename && !entry?.realAudio).length,
    realUnavailable: entries.filter((entry) => entry?.realAudioUnavailable).length
  };
}

function saveProgress(progress) {
  mkdirSync(path.dirname(PROGRESS_FILE), { recursive: true });
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), "utf8");
}

async function main() {
  const startedAt = Date.now();
  mkdirSync(cacheDir(), { recursive: true });

  const { words, source } = loadWords();
  const scope = WORDS_ONLY ? "word" : args.has("--all") ? "all" : "word-example";
  const finalTargets = collectTargets(words, scope);

  const indexFile = audioIndexPath();
  const audioIndex = readJson(indexFile, {});
  const before = summarizeIndex(audioIndex);

  function targetNeedsWork(target) {
    const indexed = audioIndex[normalizeAudioKey(target.text)];

    // Edge-only: only skip when a valid Edge (non-real) cache file exists.
    if (EDGE_ONLY) {
      if (FORCE) return true;
      return !hasValidEdgeCache(indexed);
    }

    if (hasValidLlWavCache(indexed, target.text, target.kind || "word")) {
      return false;
    }

    if (FORCE) return true;
    return !hasCachedAudio(indexed);
  }

  const pendingTargets = finalTargets.filter((target) => targetNeedsWork(target));
  const alreadyCached = finalTargets.length - pendingTargets.length;

  const progress = {
    total: finalTargets.length,
    pendingTotal: pendingTargets.length,
    scope,
    realOnly: REAL_ONLY,
    edgeOnly: EDGE_ONLY,
    force: FORCE,
    concurrency: CONCURRENCY,
    startedAt: new Date().toISOString()
  };
  saveProgress(progress);

  log(
    `Start prefill: words=${words.length} targets=${finalTargets.length} pending=${pendingTargets.length} alreadyCached=${alreadyCached} scope=${scope} edgeOnly=${EDGE_ONLY} realOnly=${REAL_ONLY} force=${FORCE} concurrency=${CONCURRENCY} source=${source}`
  );

  const stats = {
    processed: 0,
    cacheHits: 0,
    realFound: 0,
    fallbackGenerated: 0,
    failed: 0,
    skippedAlreadyCached: 0
  };
  const failures = [];

  stats.skippedAlreadyCached = alreadyCached;

  let completed = 0;
  let nextIndex = 0;

  async function processTarget(target) {
    const result = await ensureRealFirstAudio(target.text, audioIndex, { kind: target.kind });
    stats.processed += 1;
    if (result.cacheHit) stats.cacheHits += 1;
    if (result.realAudio) stats.realFound += 1;
    else if (result.ok) stats.fallbackGenerated += 1;
    else stats.failed += 1;

    if (!result.ok && failures.length < 50) {
      failures.push({ text: target.text, kind: target.kind, source: result.source || "failed" });
    }
  }

  async function worker(workerId) {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= pendingTargets.length) return;

      const target = pendingTargets[index];
      try {
        await processTarget(target);
      } catch (error) {
        stats.failed += 1;
        if (failures.length < 50) {
          failures.push({
            text: target.text,
            kind: target.kind,
            source: "error",
            detail: error instanceof Error ? error.message : String(error)
          });
        }
      }

      completed += 1;
      if (completed % 25 === 0 || completed === pendingTargets.length) {
        writeJson(indexFile, audioIndex);
        progress.completed = completed;
        progress.updatedAt = new Date().toISOString();
        progress.stats = { ...stats };
        saveProgress(progress);
        log(
          `Progress ${completed}/${pendingTargets.length} pending (${alreadyCached + completed}/${finalTargets.length} overall) | worker=${workerId} real=${stats.realFound} fallback=${stats.fallbackGenerated} failed=${stats.failed}`
        );
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, workerId) => worker(workerId + 1)));

  writeJson(indexFile, audioIndex);
  const after = summarizeIndex(audioIndex);
  const elapsedMs = Date.now() - startedAt;

  const byKind = { word: 0, phrase: 0, sentence: 0 };
  for (const target of finalTargets) {
    byKind[target.kind] = (byKind[target.kind] || 0) + 1;
  }

  const report = {
    ok: stats.failed === 0,
    finishedAt: new Date().toISOString(),
    elapsedMs,
    elapsedMinutes: Math.round((elapsedMs / 60000) * 10) / 10,
    mode: {
      scope,
      edgeOnly: EDGE_ONLY,
      realOnly: REAL_ONLY,
      wordsOnly: WORDS_ONLY,
      force: FORCE
    },
    sourceFile: source,
    libraryWords: words.length,
    targets: {
      total: finalTargets.length,
      pending: pendingTargets.length,
      alreadyCached,
      byKind
    },
    runStats: stats,
    indexBefore: before,
    indexAfter: after,
    indexDelta: {
      real: after.real - before.real,
      fallback: after.fallback - before.fallback,
      total: after.total - before.total
    },
    failures,
    progressFile: PROGRESS_FILE,
    logFile: LOG_FILE
  };

  mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), "utf8");
  log(`Done. Report written to ${REPORT_FILE}`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  log(`Fatal: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});