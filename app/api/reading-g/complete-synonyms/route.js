export const runtime = "nodejs";

import fs from "node:fs";
import path from "node:path";
import { requireLocalAdmin } from "../../../lib/api/local-admin-guard.mjs";
import { AiProfileError, normalizeProfileKey } from "../../../lib/ai/deepseek-word-profile.server.mjs";
import {
  mergeReadingGSynonymCache,
  readReadingGSynonymCache,
  requestDeepseekSynonymReviews
} from "../../../lib/ai/deepseek-synonym-review.server.mjs";
import {
  buildReadingGSynonymCompletedEntry,
  isReadingGSynonymCompletionCandidate,
  isReadingGSynonymSupportedEntry,
  READING_G_SYNONYM_COMPLETION_SOURCE
} from "../../../lib/reading-g-vocab/synonym-completion.mjs";
import {
  getReadingGSynonymStatus,
  normalizeReadingGSynonymDetails,
  READING_G_SYNONYM_STATUS
} from "../../../lib/reading-g-vocab/synonym-relations.mjs";
import { normalizeReadingGKey } from "../../../lib/reading-g-vocab/normalize.mjs";
import {
  atomicWriteReadingGJson,
  withReadingGVocabWriteLock
} from "../../../lib/reading-g-vocab/write-lock.server.mjs";

const MAX_BATCH_WORDS = 120;
const AI_REQUEST_BATCH_SIZE = 40;
const MAX_CONCURRENT_AI_REQUESTS = 3;
const PROJECT_ROOT = process.cwd();
const VOCAB_PATH = path.join(PROJECT_ROOT, "public", "data", "reading-g-vocab.json");
const MASTER_PATH = path.join(PROJECT_ROOT, "public", "data", "words.json");
const COMPLETION_PATH = path.join(PROJECT_ROOT, READING_G_SYNONYM_COMPLETION_SOURCE);
const BACKUP_DIR = path.join(PROJECT_ROOT, "backups", "reading-g-synonym-ai");

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function masterItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.words)) return payload.words;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function masterSynonymDetail(word, entry) {
  return {
    word,
    pos: String(entry?.primaryPos || entry?.pos || "").trim(),
    meaningZh: String(entry?.primaryMeaningZh || entry?.meaningZh || entry?.meaning || "").trim()
  };
}

function withMasterSynonymDetails(review, masterByKey) {
  const existing = normalizeReadingGSynonymDetails(review.synonymDetails, review.word, review.synonyms);
  const existingByKey = new Map(existing.map((detail) => [normalizeReadingGKey(detail.word), detail]));
  const synonyms = getReadingGSynonymStatus({
    word: review.word,
    synonyms: review.synonyms
  }).words;
  return {
    ...review,
    synonyms,
    synonymDetails: synonyms.map((word) => {
      const master = masterByKey.get(normalizeReadingGKey(word));
      return master
        ? masterSynonymDetail(word, master)
        : existingByKey.get(normalizeReadingGKey(word)) || { word, pos: "", meaningZh: "" };
    })
  };
}

function resolveTargets(vocab, requestedIds) {
  const ids = [...new Set(requestedIds.map((value) => String(value || "").trim()).filter(Boolean))]
    .slice(0, MAX_BATCH_WORDS);
  const byId = new Map((vocab.items || []).map((entry) => [entry.id, entry]));
  return ids.map((id) => {
    const entry = byId.get(id);
    if (!entry) throw new Error(`G类词库中没有找到同义待补词：${id}`);
    if (!isReadingGSynonymCompletionCandidate(entry)) {
      throw new Error(`只允许处理同义替换待补的G类单词：${entry.word || id}`);
    }
    return entry;
  });
}

export async function completePendingSynonyms(requestedIds, options = {}) {
  const allowPaid = options.allowPaid !== false;
  const vocab = readJson(VOCAB_PATH);
  if (!vocab || !Array.isArray(vocab.items)) throw new Error("G类阅读词库无法读取");
  const masterByKey = new Map(masterItems(readJson(MASTER_PATH, {})).flatMap((entry) => {
    const key = normalizeReadingGKey(entry?.word);
    return key ? [[key, entry]] : [];
  }));
  const targets = resolveTargets(vocab, requestedIds);
  if (!targets.length) throw new Error("没有选择同义替换待补词");

  const cache = readReadingGSynonymCache();
  const resolved = new Map();
  const toGenerate = [];
  let cacheHit = 0;
  for (const entry of targets) {
    const key = normalizeProfileKey(entry.word);
    const cached = cache[key];
    if (cached && normalizeProfileKey(cached.word) === key && Array.isArray(cached.synonyms)) {
      resolved.set(entry.id, { review: cached, source: "ai-cache" });
      cacheHit += 1;
    } else {
      toGenerate.push({
        inputId: entry.id,
        word: entry.word,
        entryType: entry.entryType || "word",
        pos: entry.primaryPos || entry.pos,
        meaning: entry.primaryMeaningZh || entry.meaning
      });
    }
  }

  let usage = null;
  let invalid = [];
  if (toGenerate.length && allowPaid) {
    const requestBatches = [];
    for (let startIndex = 0; startIndex < toGenerate.length; startIndex += AI_REQUEST_BATCH_SIZE) {
      requestBatches.push(toGenerate.slice(startIndex, startIndex + AI_REQUEST_BATCH_SIZE));
    }
    const generatedBatches = await Promise.allSettled(
      requestBatches.slice(0, MAX_CONCURRENT_AI_REQUESTS).map((requestBatch) =>
        requestDeepseekSynonymReviews(requestBatch, {
          timeoutMs: 90000,
          maxTokens: 6000
        })
      )
    );
    const usageByRequest = [];
    const cacheUpdates = new Map();
    let firstRequestError = null;
    for (const [requestIndex, result] of generatedBatches.entries()) {
      const requestBatch = requestBatches[requestIndex];
      if (result.status === "rejected") {
        firstRequestError ||= result.reason;
        const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
        invalid.push(...requestBatch.map((input) => ({
          inputId: input.inputId,
          word: input.word,
          reason
        })));
        continue;
      }
      const generated = result.value;
      invalid.push(...generated.invalid);
      if (generated.usage) usageByRequest.push(generated.usage);
      for (const input of requestBatch) {
        const review = generated.entries.get(input.inputId);
        if (!review) continue;
        resolved.set(input.inputId, { review, source: "deepseek" });
        cacheUpdates.set(normalizeProfileKey(input.word), review);
      }
    }
    usage = usageByRequest.length === 1 ? usageByRequest[0] : usageByRequest.length ? usageByRequest : null;
    if (cacheUpdates.size) await mergeReadingGSynonymCache(cacheUpdates);
    if (!resolved.size && firstRequestError) throw firstRequestError;
  }

  if (!resolved.size) {
    return {
      ok: false,
      updatedEntries: [],
      stats: { requested: targets.length, completed: 0, cacheHit, deepseek: 0, failed: targets.length, invalid, usage }
    };
  }

  const originalPayload = readJson(COMPLETION_PATH, {
    version: "reading-g-synonym-completions-v1",
    updatedAt: "",
    count: 0,
    entries: {}
  });
  const nextPayload = structuredClone(originalPayload);
  nextPayload.entries = nextPayload.entries && typeof nextPayload.entries === "object"
    ? nextPayload.entries
    : {};
  const reviewedAt = new Date().toISOString();
  const nextVocab = structuredClone(vocab);
  const nextIndexById = new Map(nextVocab.items.map((entry, index) => [entry.id, index]));
  const updatedEntries = [];
  for (const entry of targets) {
    const result = resolved.get(entry.id);
    if (!result) continue;
    let completed;
    try {
      completed = buildReadingGSynonymCompletedEntry(entry, withMasterSynonymDetails(result.review, masterByKey), {
        source: result.source,
        reviewedAt
      });
    } catch (error) {
      invalid.push({
        inputId: entry.id,
        word: entry.word,
        reason: error instanceof Error ? error.message : "同义替换校验失败"
      });
      continue;
    }
    const targetIndex = nextIndexById.get(entry.id);
    if (targetIndex == null) throw new Error(`写回前找不到G类词条：${entry.word}`);
    nextVocab.items[targetIndex] = completed;
    updatedEntries.push(completed);
    nextPayload.entries[normalizeReadingGKey(entry.word)] = {
      word: entry.word,
      synonyms: completed.synonyms,
      synonymDetails: completed.synonymDetails,
      state: completed.synonyms.length ? "available" : "reviewed-none",
      source: result.source,
      reviewedAt
    };
  }

  const statuses = nextVocab.items
    .filter(isReadingGSynonymSupportedEntry)
    .map(getReadingGSynonymStatus);
  const totals = {
    pendingCount: statuses.filter((status) => status.state === READING_G_SYNONYM_STATUS.PENDING).length,
    availableCount: statuses.filter((status) => status.state === READING_G_SYNONYM_STATUS.AVAILABLE).length,
    reviewedNoneCount: statuses.filter((status) => status.state === READING_G_SYNONYM_STATUS.REVIEWED_NONE).length
  };
  let backupPath = null;
  if (updatedEntries.length) {
    nextPayload.updatedAt = reviewedAt;
    nextPayload.count = Object.keys(nextPayload.entries).length;
    nextVocab.updatedAt = reviewedAt;
    nextVocab.synonymEnrichment = {
      ...(nextVocab.synonymEnrichment || {}),
      ai: {
        updatedAt: reviewedAt,
        ...totals
      }
    };
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = timestampForFile();
    const vocabBackupPath = path.join(BACKUP_DIR, `reading-g-vocab-${stamp}.json`);
    const completionBackupPath = path.join(BACKUP_DIR, `reading-g-synonym-completions-${stamp}.json`);
    atomicWriteReadingGJson(vocabBackupPath, vocab);
    atomicWriteReadingGJson(completionBackupPath, originalPayload);
    try {
      atomicWriteReadingGJson(COMPLETION_PATH, nextPayload);
      atomicWriteReadingGJson(VOCAB_PATH, nextVocab);
      backupPath = { vocab: vocabBackupPath, completions: completionBackupPath };
    } catch (error) {
      atomicWriteReadingGJson(COMPLETION_PATH, originalPayload);
      atomicWriteReadingGJson(VOCAB_PATH, vocab);
      throw error;
    }
  }

  return {
    ok: true,
    updatedEntries,
    totals,
    stats: {
      requested: targets.length,
      completed: updatedEntries.length,
      cacheHit,
      deepseek: [...resolved.values()].filter((item) => item.source === "deepseek").length,
      failed: targets.length - updatedEntries.length,
      invalid,
      usage
    },
    backupPath
  };
}

export async function POST(req) {
  const guard = requireLocalAdmin(req, { allowLocalhostAlways: true });
  if (guard) return guard;
  try {
    const body = await req.json();
    if (!Array.isArray(body?.entryIds)) {
      return Response.json({ ok: false, error: "entryIds must be an array" }, { status: 400 });
    }
    if (!body.entryIds.some((value) => String(value || "").trim())) {
      return Response.json({ ok: false, error: "至少选择一个同义替换待补词" }, { status: 400 });
    }
    const result = await withReadingGVocabWriteLock(() => completePendingSynonyms(body.entryIds));
    return Response.json(result, { status: result.ok ? 200 : 502 });
  } catch (error) {
    const status = error instanceof AiProfileError ? error.status : 500;
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : "G类同义替换AI补全失败",
      code: error?.code || "",
      detail: error?.detail || ""
    }, { status });
  }
}
