export const runtime = "nodejs";

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { requireLocalAdmin } from "../../../lib/api/local-admin-guard.mjs";
import {
  AiProfileError,
  isUsableGMainAiProfile,
  isUsableMeaningCoverageAiProfile,
  isProfileSensePriorityCompatible,
  mergeProfileCache,
  normalizeProfileKey,
  readProfileCache,
  requestDeepseekProfiles
} from "../../../lib/ai/deepseek-word-profile.server.mjs";
import {
  READING_G_AI_COMPLETION_SOURCE,
  buildReadingGAiCompletedEntry,
  buildReadingGMeaningCoverageCompletedEntry,
  isReadingGAiCompletionCandidate,
  isReadingGMeaningCoverageCandidate
} from "../../../lib/reading-g-vocab/ai-completion.mjs";
import { resolveReadingGAiTargets } from "../../../lib/reading-g-vocab/ai-target-resolution.mjs";
import { isReadingGContentIncomplete } from "../../../lib/reading-g-vocab/content-completeness.mjs";
import { normalizeReadingGKey } from "../../../lib/reading-g-vocab/normalize.mjs";
import {
  atomicWriteReadingGJson,
  withReadingGVocabWriteLock
} from "../../../lib/reading-g-vocab/write-lock.server.mjs";
import { syncReadingGAiCompletedEntriesToMaster } from "../../../lib/reading-g-vocab/master-content-sync.server.mjs";

// Keep the G-main completion cadence aligned with synonym verification:
// one round accepts 120 entries and sends at most three 40-entry requests.
const MAX_BATCH_WORDS = 120;
const AI_REQUEST_BATCH_SIZE = 40;
const MAX_CONCURRENT_AI_REQUESTS = 3;
const COMPLETION_MODE = Object.freeze({
  G_MAIN: "g-main",
  MEANING_COVERAGE: "meaning-coverage"
});
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

function cleanPromptText(value, max = 4000) {
  return String(value || "").normalize("NFC").trim().replace(/\s+/g, " ").slice(0, max);
}

function buildProfileRequest(entry, mode) {
  const word = cleanPromptText(entry?.word, 200);
  const existingMeaning = cleanPromptText(
    entry?.primaryMeaningZh || entry?.meaningZh || entry?.meaning,
    500
  );
  const existingPos = cleanPromptText(entry?.primaryPos || entry?.pos, 200);
  const contextSentence = cleanPromptText(entry?.example, 4000);
  const contextLabel = cleanPromptText(
    [entry?.category, entry?.domain, entry?.primaryLayer].filter(Boolean).join(" · "),
    500
  );
  const signature = JSON.stringify({ mode, existingMeaning, existingPos, contextSentence });
  const contextHash = createHash("sha256").update(signature, "utf8").digest("hex").slice(0, 24);
  return {
    inputId: entry.id,
    word,
    existingMeaning,
    existingPos,
    contextSentence,
    contextLabel,
    cacheKey: `${normalizeProfileKey(word)}::reading-g-context::${contextHash}`
  };
}

function resolvePendingTargets(vocab, requestedIds, mode) {
  const isEligible = mode === COMPLETION_MODE.MEANING_COVERAGE
    ? isReadingGMeaningCoverageCandidate
    : isReadingGAiCompletionCandidate;
  return resolveReadingGAiTargets(vocab, requestedIds, {
    isEligible,
    maxTargets: MAX_BATCH_WORDS
  });
}

function createFailureRecord(mode, reason, recordedAt) {
  return {
    mode,
    reason: String(reason || "AI 未返回可写入的复核结果").trim(),
    source: "ai-response",
    recordedAt
  };
}

function hasSameFailure(previous, failure) {
  return previous?.mode === failure.mode &&
    previous?.reason === failure.reason &&
    previous?.source === failure.source;
}

async function completePendingEntriesUnsafe(requestedIds, options = {}) {
  const allowPaid = options.allowPaid !== false;
  const mode = options.mode === COMPLETION_MODE.MEANING_COVERAGE
    ? COMPLETION_MODE.MEANING_COVERAGE
    : COMPLETION_MODE.G_MAIN;
  const isMeaningCoverageMode = mode === COMPLETION_MODE.MEANING_COVERAGE;
  const isEligible = isMeaningCoverageMode
    ? isReadingGMeaningCoverageCandidate
    : isReadingGAiCompletionCandidate;
  const vocab = readJson(VOCAB_PATH);
  if (!vocab || !Array.isArray(vocab.items)) throw new Error("G类阅读词库无法读取");
  const targetResolution = resolvePendingTargets(vocab, requestedIds, mode);
  const targets = targetResolution.targets;
  if (!targets.length) {
    const totals = {
      count: vocab.items.length,
      wordCount: vocab.items.filter((entry) => (entry.entryType || "word") === "word").length,
      phraseCount: vocab.items.filter((entry) => entry.entryType === "phrase").length,
      activeCount: vocab.items.filter((entry) => entry.studyMode === "active").length,
      referenceCount: vocab.items.filter((entry) => entry.studyMode === "reference").length,
      aiCompletedCount: vocab.items.filter((entry) => (
        (entry.qualityFlags || []).includes("reading_g_ai_completed")
      )).length,
      pendingCount: vocab.items.filter(isEligible).length
    };
    return {
      ok: true,
      completionMode: mode,
      updatedEntries: [],
      statusUpdatedEntries: [],
      totals,
      stats: {
        requested: targetResolution.requestedIds.length,
        accepted: 0,
        skipped: targetResolution.skipped.length,
        remapped: targetResolution.remapped.length,
        completed: 0,
        cacheHit: 0,
        deepseek: 0,
        failed: 0,
        invalid: [],
        usage: null
      },
      targetResolution: {
        remapped: targetResolution.remapped,
        skipped: targetResolution.skipped
      },
      backupPath: null
    };
  }

  const cache = readProfileCache();
  const resolved = new Map();
  const toGenerate = [];
  const requestById = new Map();
  let cacheHit = 0;

  for (const entry of targets) {
    const request = buildProfileRequest(entry, mode);
    requestById.set(entry.id, request);
    const cached = cache[request.cacheKey];
    if (
      (isMeaningCoverageMode ? isUsableMeaningCoverageAiProfile : isUsableGMainAiProfile)(cached)
      && isProfileSensePriorityCompatible(cached, "common")
    ) {
      try {
        // Generic cache validity is not enough for entry-specific defects such
        // as an unresolved noun/verb split. Never let a structurally unusable
        // cache entry create a permanent cache-hit -> write-failure loop.
        (isMeaningCoverageMode
          ? buildReadingGMeaningCoverageCompletedEntry
          : buildReadingGAiCompletedEntry)(entry, cached, {
          aiSource: "ai-cache",
          generatedAt: new Date().toISOString()
        });
        resolved.set(entry.id, { profile: cached, source: "ai-cache" });
        cacheHit += 1;
      } catch {
        toGenerate.push(request);
      }
    } else {
      toGenerate.push(request);
    }
  }

  let usage = null;
  let invalid = [];
  const cacheUpdates = new Map();
  if (toGenerate.length && allowPaid) {
    const requestBatches = [];
    for (let startIndex = 0; startIndex < toGenerate.length; startIndex += AI_REQUEST_BATCH_SIZE) {
      requestBatches.push(toGenerate.slice(startIndex, startIndex + AI_REQUEST_BATCH_SIZE));
    }
    const generatedBatches = await Promise.allSettled(
      requestBatches.slice(0, MAX_CONCURRENT_AI_REQUESTS).map((requestBatch) =>
        requestDeepseekProfiles(requestBatch, {
          timeoutMs: 75000,
          maxTokens: 14000,
          // Preserve the previous no-auto-retry policy for this paid operation.
          maxSplitDepth: 0,
          profileQuality: "full",
          profileKind: mode,
          sensePriority: "common"
        })
      )
    );
    const usageByRequest = [];
    for (const [requestIndex, result] of generatedBatches.entries()) {
      const requestBatch = requestBatches[requestIndex];
      if (result.status === "rejected") {
        const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
        invalid.push(...requestBatch.map((input) => ({ inputId: input.inputId, word: input.word, reason })));
        continue;
      }
      const generated = result.value;
      invalid.push(...generated.invalid);
      if (generated.usage) usageByRequest.push(generated.usage);
      for (const input of requestBatch) {
        const profile = generated.entries.get(input.inputId);
        if (!profile) continue;
        if (normalizeProfileKey(profile.word) !== normalizeProfileKey(input.word)) {
          invalid.push({ inputId: input.inputId, word: input.word, reason: "AI返回主词不一致" });
          continue;
        }
        resolved.set(input.inputId, { profile, source: "deepseek" });
      }
    }
    usage = usageByRequest.length === 1 ? usageByRequest[0] : usageByRequest.length ? usageByRequest : null;
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
  const statusUpdatedEntries = [];
  const completedIds = new Set();
  for (const entry of targets) {
    const result = resolved.get(entry.id);
    if (!result) continue;
    let completed;
    try {
      completed = (isMeaningCoverageMode
        ? buildReadingGMeaningCoverageCompletedEntry
        : buildReadingGAiCompletedEntry)(entry, result.profile, {
        aiSource: result.source,
        generatedAt: completedAt
      });
    } catch (error) {
      invalid.push({
        inputId: entry.id,
        word: entry.word,
        reason: error instanceof Error
          ? error.message
          : "缓存资料未满足G类完整度要求，已保留在待补队列"
      });
      continue;
    }
    const targetIndex = nextIndexById.get(entry.id);
    if (targetIndex == null) throw new Error(`写回前找不到G类词条：${entry.word}`);
    nextVocab.items[targetIndex] = completed;
    updatedEntries.push(completed);
    completedIds.add(entry.id);
    if (result.source === "deepseek") {
      const request = requestById.get(entry.id);
      if (request?.cacheKey) cacheUpdates.set(request.cacheKey, result.profile);
    }
    nextPayload.entries[normalizeReadingGKey(entry.word)] = {
      word: entry.word,
      source: result.source,
      completedAt,
      profile: result.profile
    };
  }
  // Cache only profiles that have passed the entry-specific write-back
  // validator. This prevents a paid but unusable response from poisoning every
  // later repair attempt for the same word and context.
  if (cacheUpdates.size) await mergeProfileCache(cacheUpdates);
  const invalidReasonById = new Map(
    invalid.map((item) => [String(item.inputId || "").trim(), item.reason])
  );
  for (const entry of targets) {
    if (completedIds.has(entry.id)) continue;
    const targetIndex = nextIndexById.get(entry.id);
    if (targetIndex == null) continue;
    const reason = invalidReasonById.get(entry.id) || "AI 未返回可写入的复核结果";
    const failure = createFailureRecord(mode, reason, completedAt);
    const current = nextVocab.items[targetIndex];
    const failureField = isMeaningCoverageMode
      ? "meaningCoverageLastFailure"
      : "aiCompletionLastFailure";
    if (hasSameFailure(current?.[failureField], failure)) continue;
    const next = { ...current, [failureField]: failure };
    nextVocab.items[targetIndex] = next;
    statusUpdatedEntries.push(next);
  }
  if (updatedEntries.length) nextPayload.updatedAt = completedAt;
  nextPayload.count = Object.keys(nextPayload.entries).length;
  const remainingIncomplete = nextVocab.items.filter(isReadingGContentIncomplete).length;
  const remainingQueueCount = nextVocab.items.filter(isEligible).length;
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
    pendingCount: remainingQueueCount
  };
  let backupPath = null;

  if (updatedEntries.length || statusUpdatedEntries.length) {
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
    completionMode: mode,
    updatedEntries,
    statusUpdatedEntries,
    totals,
    stats: {
      requested: targetResolution.requestedIds.length,
      accepted: targets.length,
      skipped: targetResolution.skipped.length,
      remapped: targetResolution.remapped.length,
      completed: updatedEntries.length,
      cacheHit,
      deepseek: [...resolved.values()].filter((item) => item.source === "deepseek").length,
      failed: targets.length - completedIds.size,
      invalid,
      usage
    },
    targetResolution: {
      remapped: targetResolution.remapped,
      skipped: targetResolution.skipped
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
    const requestedMode = body?.mode == null ? COMPLETION_MODE.G_MAIN : String(body.mode).trim();
    if (!Object.values(COMPLETION_MODE).includes(requestedMode)) {
      return Response.json({ ok: false, error: "不支持的AI补全模式" }, { status: 400 });
    }
    const result = await completePendingEntries(body.entryIds, { mode: requestedMode });
    let masterSync = {
      ok: true,
      mode: "skipped",
      updatedCount: 0,
      addedCount: 0,
      reason: "no-completed-entries"
    };
    if (result.ok && result.updatedEntries.length) {
      try {
        masterSync = await syncReadingGAiCompletedEntriesToMaster(result.updatedEntries);
      } catch (syncError) {
        // The G entry is already atomically saved. Return the sync failure clearly
        // instead of reporting the AI completion itself as failed or hiding data loss.
        masterSync = {
          ok: false,
          mode: "failed",
          updatedCount: 0,
          addedCount: 0,
          error: syncError instanceof Error ? syncError.message : "主词库安全同步失败"
        };
      }
    }
    return Response.json({ ...result, masterSync }, { status: result.ok ? 200 : 502 });
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
