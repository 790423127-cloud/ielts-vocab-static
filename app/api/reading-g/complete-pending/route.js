export const runtime = "nodejs";

import fs from "node:fs";
import path from "node:path";
import { requireLocalAdmin } from "../../../lib/api/local-admin-guard.mjs";
import {
  AiProfileError,
  isUsableAiProfile,
  mergeProfileCache,
  normalizeProfileKey,
  readProfileCache,
  requestDeepseekProfiles
} from "../../../lib/ai/deepseek-word-profile.server.mjs";
import {
  READING_G_AI_COMPLETION_SOURCE,
  buildReadingGAiCompletedEntry,
  isReadingGAiCompletionCandidate
} from "../../../lib/reading-g-vocab/ai-completion.mjs";
import { isReadingGContentIncomplete } from "../../../lib/reading-g-vocab/content-completeness.mjs";
import { normalizeReadingGKey } from "../../../lib/reading-g-vocab/normalize.mjs";
import {
  atomicWriteReadingGJson,
  withReadingGVocabWriteLock
} from "../../../lib/reading-g-vocab/write-lock.server.mjs";

const MAX_BATCH_WORDS = 10;
const PROJECT_ROOT = process.cwd();
const VOCAB_PATH = path.join(PROJECT_ROOT, "public", "data", "reading-g-vocab.json");
const COMPLETION_PATH = path.join(PROJECT_ROOT, READING_G_AI_COMPLETION_SOURCE);
const BACKUP_DIR = path.join(PROJECT_ROOT, "backups", "reading-g-ai");

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function resolvePendingTargets(vocab, requestedIds) {
  const ids = [...new Set(requestedIds.map((value) => String(value || "").trim()).filter(Boolean))]
    .slice(0, MAX_BATCH_WORDS);
  const byId = new Map((vocab.items || []).map((entry) => [entry.id, entry]));
  return ids.map((id) => {
    const entry = byId.get(id);
    if (!entry) throw new Error(`G类词库中没有找到待补词：${id}`);
    if (!isReadingGAiCompletionCandidate(entry)) {
      throw new Error(`只允许处理音标、词性、释义、例句或词族缺失的G类单词：${entry.word || id}`);
    }
    return entry;
  });
}

async function completePendingEntriesUnsafe(requestedIds, options = {}) {
  const allowPaid = options.allowPaid !== false;
  const vocab = readJson(VOCAB_PATH);
  if (!vocab || !Array.isArray(vocab.items)) throw new Error("G类阅读词库无法读取");
  const targets = resolvePendingTargets(vocab, requestedIds);
  if (!targets.length) throw new Error("没有选择待补单词");

  const cache = readProfileCache();
  const resolved = new Map();
  const toGenerate = [];
  let cacheHit = 0;

  for (const entry of targets) {
    const key = normalizeProfileKey(entry.word);
    const cached = cache[key];
    if (isUsableAiProfile(cached)) {
      resolved.set(entry.id, { profile: cached, source: "ai-cache" });
      cacheHit += 1;
    } else {
      toGenerate.push({ inputId: entry.id, word: entry.word });
    }
  }

  let usage = null;
  let invalid = [];
  if (toGenerate.length && allowPaid) {
    const generated = await requestDeepseekProfiles(toGenerate, {
      timeoutMs: 75000,
      maxTokens: 14000,
      maxSplitDepth: 0,
      profileQuality: "full"
    });
    usage = generated.usage;
    invalid = generated.invalid;
    const cacheUpdates = new Map();
    for (const input of toGenerate) {
      const profile = generated.entries.get(input.inputId);
      if (!profile) continue;
      if (normalizeProfileKey(profile.word) !== normalizeProfileKey(input.word)) {
        invalid.push({ inputId: input.inputId, word: input.word, reason: "AI返回主词不一致" });
        continue;
      }
      resolved.set(input.inputId, { profile, source: "deepseek" });
      cacheUpdates.set(normalizeProfileKey(input.word), profile);
    }
    if (cacheUpdates.size) await mergeProfileCache(cacheUpdates);
  }

  if (!resolved.size) {
    return {
      ok: false,
      updatedEntries: [],
      stats: { requested: targets.length, completed: 0, cacheHit, deepseek: 0, failed: targets.length, invalid, usage }
    };
  }

  const originalPayload = readJson(COMPLETION_PATH, {
    version: "reading-g-ai-completions-v1",
    updatedAt: "",
    count: 0,
    entries: {}
  });
  const nextPayload = structuredClone(originalPayload);
  nextPayload.entries = nextPayload.entries && typeof nextPayload.entries === "object"
    ? nextPayload.entries
    : {};
  const completedAt = new Date().toISOString();
  const nextVocab = structuredClone(vocab);
  const nextIndexById = new Map(nextVocab.items.map((entry, index) => [entry.id, index]));
  const updatedEntries = [];
  for (const entry of targets) {
    const result = resolved.get(entry.id);
    if (!result) continue;
    let completed;
    try {
      completed = buildReadingGAiCompletedEntry(entry, result.profile, {
        aiSource: result.source,
        generatedAt: completedAt
      });
    } catch {
      invalid.push({
        inputId: entry.id,
        word: entry.word,
        reason: "缓存资料未满足G类完整度要求，已保留在待补队列"
      });
      continue;
    }
    const targetIndex = nextIndexById.get(entry.id);
    if (targetIndex == null) throw new Error(`写回前找不到G类词条：${entry.word}`);
    nextVocab.items[targetIndex] = completed;
    updatedEntries.push(completed);
    nextPayload.entries[normalizeReadingGKey(entry.word)] = {
      word: entry.word,
      source: result.source,
      completedAt,
      profile: result.profile
    };
  }
  if (updatedEntries.length) nextPayload.updatedAt = completedAt;
  nextPayload.count = Object.keys(nextPayload.entries).length;
  const remainingIncomplete = nextVocab.items.filter(isReadingGContentIncomplete).length;
  const contentAiCompletedCount = nextVocab.items.filter((entry) => (
    (entry.qualityFlags || []).includes("reading_g_ai_completed")
  )).length;
  const questionBankAiCompletedCount = nextVocab.items.filter((entry) => (
    (entry.layers || []).includes("questionBankAiCompleted")
    && (entry.qualityFlags || []).includes("question_bank_5262_expansion")
    && !(entry.qualityFlags || []).some((flag) => [
      "grok_full_bank_true_missing_supplement_v1",
      "grok_excel_part1_2_missing_supplement_v1"
    ].includes(flag))
    && !(entry.layers || []).some((layer) => [
      "grokFullBankSupplement",
      "grokExcelPart12Supplement"
    ].includes(layer))
  )).length;
  const totals = {
    count: nextVocab.items.length,
    wordCount: nextVocab.items.filter((entry) => (entry.entryType || "word") === "word").length,
    phraseCount: nextVocab.items.filter((entry) => entry.entryType === "phrase").length,
    activeCount: nextVocab.items.filter((entry) => entry.studyMode === "active").length,
    referenceCount: nextVocab.items.filter((entry) => entry.studyMode === "reference").length,
    aiCompletedCount: contentAiCompletedCount,
    pendingCount: remainingIncomplete
  };
  let backupPath = null;

  if (updatedEntries.length) {
    nextVocab.updatedAt = completedAt;
    nextVocab.count = totals.count;
    nextVocab.wordCount = totals.wordCount;
    nextVocab.phraseCount = totals.phraseCount;
    nextVocab.activeCount = totals.activeCount;
    nextVocab.referenceCount = totals.referenceCount;
    nextVocab.multiSenseCount = nextVocab.items.filter((entry) => (entry.senses || []).length > 1).length;
    nextVocab.questionBankExpansion = {
      ...(nextVocab.questionBankExpansion || {}),
      aiCompletedCount: questionBankAiCompletedCount,
      contentAiCompletedCount,
      contentIncompleteCount: remainingIncomplete
    };

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backupStamp = timestampForFile();
    const completionBackupPath = path.join(BACKUP_DIR, `reading-g-ai-completions-${backupStamp}.json`);
    const vocabBackupPath = path.join(BACKUP_DIR, `reading-g-vocab-${backupStamp}.json`);
    atomicWriteReadingGJson(completionBackupPath, originalPayload);
    atomicWriteReadingGJson(vocabBackupPath, vocab);

    try {
      atomicWriteReadingGJson(COMPLETION_PATH, nextPayload);
      atomicWriteReadingGJson(VOCAB_PATH, nextVocab);
      backupPath = {
        completions: completionBackupPath,
        vocab: vocabBackupPath
      };
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

export function completePendingEntries(requestedIds, options = {}) {
  return withReadingGVocabWriteLock(() => completePendingEntriesUnsafe(requestedIds, options));
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
      return Response.json({ ok: false, error: "至少选择一个待补词" }, { status: 400 });
    }
    const result = await completePendingEntries(body.entryIds);
    return Response.json(result, { status: result.ok ? 200 : 502 });
  } catch (error) {
    const status = error instanceof AiProfileError ? error.status : 500;
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : "G类待补词AI补全失败",
      code: error?.code || "",
      detail: error?.detail || ""
    }, { status });
  }
}
