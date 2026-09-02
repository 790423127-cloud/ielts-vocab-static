import fs from "node:fs";
import path from "node:path";
import { requireLocalAdmin } from "../../../lib/api/local-admin-guard.mjs";
import {
  describeMeaningCoverageProfileIssue
} from "../../../lib/vocab/meaning-coverage-audit.mjs";
import {
  buildReadingGMeaningCoverageCompletedEntry,
  isReadingGMeaningCoverageCandidate,
  resolveReadingGMeaningCoverageProfile
} from "../../../lib/reading-g-vocab/ai-completion.mjs";
import { normalizeProfileKey, readProfileCache } from "../../../lib/ai/deepseek-word-profile.server.mjs";
import {
  atomicWriteReadingGJson,
  withReadingGVocabWriteLock
} from "../../../lib/reading-g-vocab/write-lock.server.mjs";

const PROJECT_ROOT = process.cwd();
const VOCAB_PATH = path.join(PROJECT_ROOT, "public", "data", "reading-g-vocab.json");
const BACKUP_DIR = path.join(PROJECT_ROOT, "backups", "reading-g-ai");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function buildTotals(vocab) {
  const items = Array.isArray(vocab.items) ? vocab.items : [];
  return {
    count: items.length,
    wordCount: items.filter((entry) => (entry.entryType || "word") === "word").length,
    phraseCount: items.filter((entry) => entry.entryType === "phrase").length,
    activeCount: items.filter((entry) => entry.studyMode === "active").length,
    referenceCount: items.filter((entry) => entry.studyMode === "reference").length,
    pendingCount: items.filter(isReadingGMeaningCoverageCandidate).length
  };
}

function sameFailure(previous, next) {
  return previous?.mode === next.mode &&
    previous?.reason === next.reason &&
    previous?.source === next.source;
}

async function reconcileMeaningCoverageUnsafe() {
  const vocab = readJson(VOCAB_PATH);
  if (!vocab || !Array.isArray(vocab.items)) throw new Error("G 类阅读词库无法读取");

  const now = new Date().toISOString();
  const cache = readProfileCache();
  const nextVocab = structuredClone(vocab);
  const updatedEntries = [];
  const statusUpdatedEntries = [];
  const failureDetails = [];
  let reconciled = 0;

  nextVocab.items = nextVocab.items.map((entry) => {
    if (!isReadingGMeaningCoverageCandidate(entry)) return entry;

    const cached = cache[normalizeProfileKey(entry.word)];
    const resolved = resolveReadingGMeaningCoverageProfile(entry, cached);

    if (resolved) {
      const completed = buildReadingGMeaningCoverageCompletedEntry(entry, resolved.profile, {
        aiSource: resolved.aiSource,
        generatedAt: now
      });
      reconciled += 1;
      updatedEntries.push(completed);
      return completed;
    }

    const source = cached ? "existing-cache" : "current-entry";
    const reason = cached
      ? describeMeaningCoverageProfileIssue(cached, entry.word)
      : describeMeaningCoverageProfileIssue(entry, entry.word);
    const failure = {
      mode: "meaning-coverage",
      reason,
      source,
      recordedAt: now
    };
    failureDetails.push({ id: entry.id, word: entry.word, ...failure });
    if (sameFailure(entry.meaningCoverageLastFailure, failure)) {
      statusUpdatedEntries.push(entry);
      return entry;
    }
    const next = { ...entry, meaningCoverageLastFailure: failure };
    updatedEntries.push(next);
    statusUpdatedEntries.push(next);
    return next;
  });

  const totals = buildTotals(nextVocab);
  if (updatedEntries.length) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backupPath = path.join(BACKUP_DIR, `reading-g-vocab-meaning-reconcile-${timestampForFile()}.json`);
    atomicWriteReadingGJson(backupPath, vocab);
    nextVocab.updatedAt = now;
    atomicWriteReadingGJson(VOCAB_PATH, nextVocab);
    return {
      ok: true,
      updatedEntries,
      statusUpdatedEntries,
      failureDetails,
      totals,
      stats: { inspected: failureDetails.length + reconciled, reconciled, retained: failureDetails.length },
      backupPath
    };
  }

  return {
    ok: true,
    updatedEntries: [],
    statusUpdatedEntries,
    failureDetails,
    totals,
    stats: { inspected: failureDetails.length, reconciled: 0, retained: failureDetails.length },
    backupPath: null
  };
}

export async function POST(req) {
  const guard = requireLocalAdmin(req, { allowLocalhostAlways: true });
  if (guard) return guard;

  try {
    return Response.json(await withReadingGVocabWriteLock(reconcileMeaningCoverageUnsafe));
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : "常见义状态对账失败"
    }, { status: 500 });
  }
}
