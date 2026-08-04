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
  isReadingGPendingAiEntry
} from "../../../lib/reading-g-vocab/ai-completion.mjs";
import { normalizeReadingGKey } from "../../../lib/reading-g-vocab/normalize.mjs";
import { runReadingGQuestionBankExpansion } from "../../../../scripts/expand-reading-g-question-bank.mjs";

const MAX_BATCH_WORDS = 10;
const PROJECT_ROOT = process.cwd();
const VOCAB_PATH = path.join(PROJECT_ROOT, "public", "data", "reading-g-vocab.json");
const COMPLETION_PATH = path.join(PROJECT_ROOT, READING_G_AI_COMPLETION_SOURCE);
const BACKUP_DIR = path.join(PROJECT_ROOT, "backups", "reading-g-ai");

let writeQueue = Promise.resolve();

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function atomicWriteJson(filePath, value) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function serializeWrite(task) {
  const run = writeQueue.then(task, task);
  writeQueue = run.catch(() => {});
  return run;
}

function resolvePendingTargets(vocab, requestedIds) {
  const ids = [...new Set(requestedIds.map((value) => String(value || "").trim()).filter(Boolean))]
    .slice(0, MAX_BATCH_WORDS);
  const byId = new Map((vocab.items || []).map((entry) => [entry.id, entry]));
  return ids.map((id) => {
    const entry = byId.get(id);
    if (!entry) throw new Error(`G类词库中没有找到待补词：${id}`);
    if (!isReadingGPendingAiEntry(entry)) {
      throw new Error(`只允许处理“全题库待补资料”：${entry.word || id}`);
    }
    return entry;
  });
}

async function completePendingEntries(requestedIds) {
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
  if (toGenerate.length) {
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
  for (const entry of targets) {
    const result = resolved.get(entry.id);
    if (!result) continue;
    nextPayload.entries[normalizeReadingGKey(entry.word)] = {
      word: entry.word,
      source: result.source,
      completedAt,
      profile: result.profile
    };
  }
  nextPayload.updatedAt = completedAt;
  nextPayload.count = Object.keys(nextPayload.entries).length;

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, `reading-g-ai-completions-${timestampForFile()}.json`);
  atomicWriteJson(backupPath, originalPayload);

  try {
    atomicWriteJson(COMPLETION_PATH, nextPayload);
    const expanded = runReadingGQuestionBankExpansion({ projectRoot: PROJECT_ROOT });
    const updatedById = new Map(expanded.vocab.items.map((entry) => [entry.id, entry]));
    const updatedEntries = [...resolved.keys()].map((id) => updatedById.get(id)).filter(Boolean);
    return {
      ok: true,
      updatedEntries,
      totals: {
        count: expanded.vocab.count,
        wordCount: expanded.vocab.wordCount,
        phraseCount: expanded.vocab.phraseCount,
        activeCount: expanded.vocab.activeCount,
        referenceCount: expanded.vocab.referenceCount,
        aiCompletedCount: expanded.vocab.questionBankExpansion?.aiCompletedCount || 0,
        pendingCount:
          expanded.vocab.questionBankExpansion?.pendingIndependentCount
          ?? expanded.vocab.questionBankExpansion?.pendingCount
          ?? 0
      },
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
  } catch (error) {
    atomicWriteJson(COMPLETION_PATH, originalPayload);
    runReadingGQuestionBankExpansion({ projectRoot: PROJECT_ROOT });
    throw error;
  }
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
    const result = await serializeWrite(() => completePendingEntries(body.entryIds));
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
