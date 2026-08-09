export const runtime = "nodejs";

import fs from "node:fs";
import path from "node:path";
import { requireLocalAdmin } from "../../../lib/api/local-admin-guard.mjs";
import {
  READING_G_RETIREMENTS_SOURCE,
  getReadingGRetirementKey,
  normalizeReadingGRetirements
} from "../../../lib/reading-g-vocab/retirements.mjs";
import {
  atomicWriteReadingGJson,
  withReadingGVocabWriteLock
} from "../../../lib/reading-g-vocab/write-lock.server.mjs";

const PROJECT_ROOT = process.cwd();
const VOCAB_PATH = path.join(PROJECT_ROOT, "public", "data", "reading-g-vocab.json");
const RETIREMENTS_PATH = path.join(PROJECT_ROOT, READING_G_RETIREMENTS_SOURCE);
const BACKUP_DIR = path.join(PROJECT_ROOT, "backups", "reading-g-delete");

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function recomputeVocabTotals(items) {
  const list = Array.isArray(items) ? items : [];
  let wordCount = 0;
  let phraseCount = 0;
  let activeCount = 0;
  let referenceCount = 0;
  for (const item of list) {
    if ((item?.entryType || "word") === "phrase") phraseCount += 1;
    else wordCount += 1;
    if (item?.studyMode === "reference") referenceCount += 1;
    else activeCount += 1;
  }
  return {
    count: list.length,
    wordCount,
    phraseCount,
    activeCount,
    referenceCount
  };
}

function normalizeEntryIds(body = {}) {
  const raw = [];
  if (Array.isArray(body.entryIds)) raw.push(...body.entryIds);
  if (body.entryId != null) raw.push(body.entryId);
  const seen = new Set();
  const ids = [];
  for (const value of raw) {
    const id = String(value || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Batch fast-path delete for continuous UI deletes:
 * one disk read/write for many ids (no full question-bank re-expand).
 */
function deleteReadingGEntries(entryIds) {
  const ids = normalizeEntryIds({ entryIds });
  if (!ids.length) throw new Error("entryId or entryIds is required");

  const vocab = readJson(VOCAB_PATH);
  if (!vocab || !Array.isArray(vocab.items)) throw new Error("G类阅读词库无法读取");
  const originalRetirements = readJson(RETIREMENTS_PATH, {
    version: "reading-g-retirements-v1",
    updatedAt: "",
    count: 0,
    entries: []
  });

  const idSet = new Set(ids);
  const deletedAt = new Date().toISOString();
  const removed = [];
  const nextItems = [];
  for (const item of vocab.items) {
    if (item?.id && idSet.has(item.id)) removed.push(item);
    else nextItems.push(item);
  }

  const alreadyDeleted = ids
    .filter((id) => !removed.some((entry) => entry.id === id))
    .map((id) => {
      const retired = normalizeReadingGRetirements(originalRetirements).find((entry) => entry.id === id);
      return {
        id,
        word: retired?.word || "",
        entryType: retired?.entryType || "word",
        alreadyDeleted: true
      };
    });

  if (!removed.length) {
    return {
      ok: true,
      deleted: alreadyDeleted,
      deletedCount: 0,
      alreadyDeletedCount: alreadyDeleted.length,
      totals: recomputeVocabTotals(vocab.items),
      retirementCount: normalizeReadingGRetirements(originalRetirements).length,
      fastPath: true,
      batched: true
    };
  }

  const previousEntries = normalizeReadingGRetirements(originalRetirements);
  const retirementByKey = new Map(previousEntries.map((entry) => [entry.key, entry]));
  for (const entry of removed) {
    const key = getReadingGRetirementKey(entry);
    if (!key) continue;
    retirementByKey.set(key, {
      key,
      id: entry.id,
      word: entry.word,
      entryType: entry.entryType === "phrase" ? "phrase" : "word",
      deletedAt
    });
  }
  const nextRetirements = {
    version: "reading-g-retirements-v1",
    updatedAt: deletedAt,
    count: retirementByKey.size,
    entries: [...retirementByKey.values()]
  };

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(
    BACKUP_DIR,
    `reading-g-delete-batch-${timestampForFile()}-${removed.length}.json`
  );
  // Small backup: only removed rows, not the entire prior lexicon.
  atomicWriteReadingGJson(backupPath, {
    version: "reading-g-delete-batch-backup-v1",
    deletedAt,
    removed: removed.map((entry) => ({
      id: entry.id,
      word: entry.word,
      entryType: entry.entryType || "word"
    })),
    fastPath: true,
    batched: true
  });

  const totals = recomputeVocabTotals(nextItems);
  const nextVocab = {
    ...vocab,
    ...totals,
    items: nextItems
  };
  if (vocab.questionBankExpansion && typeof vocab.questionBankExpansion === "object") {
    const pendingCount = nextItems.filter((item) => item?.primaryLayer === "questionBankPending").length;
    nextVocab.questionBankExpansion = {
      ...vocab.questionBankExpansion,
      pendingCount,
      retiredCount: (Number(vocab.questionBankExpansion.retiredCount) || 0) + removed.length,
      referenceCount: pendingCount
    };
  }

  try {
    atomicWriteReadingGJson(RETIREMENTS_PATH, nextRetirements);
    atomicWriteReadingGJson(VOCAB_PATH, nextVocab, { pretty: false });
    const remainingIds = new Set(nextVocab.items.map((item) => item.id));
    if (removed.some((entry) => remainingIds.has(entry.id))) {
      throw new Error("G类词条批量删除校验失败，已回退");
    }
    return {
      ok: true,
      deleted: [
        ...removed.map((entry) => ({
          id: entry.id,
          word: entry.word,
          entryType: entry.entryType || "word",
          alreadyDeleted: false
        })),
        ...alreadyDeleted
      ],
      deletedCount: removed.length,
      alreadyDeletedCount: alreadyDeleted.length,
      totals,
      backupPath,
      retirementCount: nextRetirements.count,
      fastPath: true,
      batched: true
    };
  } catch (error) {
    atomicWriteReadingGJson(RETIREMENTS_PATH, originalRetirements);
    atomicWriteReadingGJson(VOCAB_PATH, vocab, { pretty: false });
    throw error;
  }
}

export async function POST(req) {
  const guard = requireLocalAdmin(req, { allowLocalhostAlways: true });
  if (guard) return guard;

  try {
    const body = await req.json();
    const entryIds = normalizeEntryIds(body);
    if (!entryIds.length) {
      return Response.json({ ok: false, error: "entryId or entryIds is required" }, { status: 400 });
    }
    const result = await withReadingGVocabWriteLock(() => deleteReadingGEntries(entryIds));
    return Response.json(result);
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : "删除当前G类词条失败"
    }, { status: 500 });
  }
}
