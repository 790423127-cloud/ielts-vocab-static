"use client";
/**
 * Home lexicon admin composer (local + AI + IO).
 * Split in v2026-07-10.3 for maintainability.
 */
import { sanitizeAiWordCollocations } from "../lib/vocab/admin-ai-content-profile.mjs";
import { createLocalOps } from "./useHomeLexiconAdmin.local.js";

const AI_OP_NAMES = [
  "cleanWordList",
  "generateForIndex",
  "generateCurrent",
  "aiRepairCurrentWordSymbol",
  "generateMissingBatch",
  "aiCompletePendingAndUnclassifiedOneByOne",
  "aiSlowCompleteMissing10x1",
  "aiStableRepairWrongWords10x2",
  "generateHundredByFiveBatch",
  "completeMeaningAndAudio",
  "categorizeWords",
  "aiDedupe"
];

const IO_OP_NAMES = [
  "importWords",
  "importFromText",
  "handleFile",
  "clearAll",
  "exportStaticSite",
  "applyRecoveredWords",
  "recoverWordsFromLocalFiles",
  "recoverWordsFromTencentCloud",
  "cleanBrowserStorageNow",
  "downloadBlankVocabTemplateJson",
  "downloadBlankVocabTemplateCsv",
  "importTemplateVocabFile",
  "downloadVocabBackup",
  "downloadEnglishOnlyTxt",
  "importVocabBackup",
  "exportJSON"
];

let aiFactoryPromise = null;
let ioFactoryPromise = null;

function createLazyOps(names, loadFactory, context) {
  return Object.fromEntries(names.map((name) => [
    name,
    async (...args) => {
      try {
        const factory = await loadFactory();
        const operation = factory(context)[name];
        return await operation?.(...args);
      } catch (error) {
        context.setToast?.(error?.message || "工具加载失败，请重试");
        return undefined;
      }
    }
  ]));
}

async function publishAiSnapshot(context, snapshot) {
  await context.persistWordsImmediately?.(snapshot);

  const response = await fetch("/api/export-cache", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      words: snapshot,
      savedAt: new Date().toISOString(),
      version: context.cacheMetaRef?.current?.version || undefined,
      lexiconHash: context.cacheMetaRef?.current?.lexiconHash || "",
      source: "paid-ai-checkpoint",
      forceRefresh: true
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.ok === false) {
    throw new Error(result?.detail || result?.error || `HTTP ${response.status}`);
  }
  return result;
}

function sanitizeAiSnapshot(words) {
  if (!Array.isArray(words)) return words;
  let changed = false;
  const next = words.map((word) => {
    const sanitized = sanitizeAiWordCollocations(word);
    if (sanitized !== word) changed = true;
    return sanitized;
  });
  return changed ? next : words;
}

function createPersistingAiSetWords(context) {
  let latestSnapshot = null;
  let flushTimer = null;
  let persistQueue = Promise.resolve();

  function schedulePersist(nextWords) {
    latestSnapshot = nextWords;
    if (flushTimer !== null) return;

    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      const snapshot = latestSnapshot;
      latestSnapshot = null;

      persistQueue = persistQueue
        .then(async () => {
          await publishAiSnapshot(context, snapshot);
        })
        .catch((error) => {
          context.setToast?.(`AI结果已生成，但自动保存失败：${error?.message || "未知错误"}`);
        });
    }, 0);
  }

  return (updater) => context.setWords((previousWords) => {
    const rawNextWords = typeof updater === "function" ? updater(previousWords) : updater;
    const nextWords = sanitizeAiSnapshot(rawNextWords);
    if (Array.isArray(nextWords)) schedulePersist(nextWords);
    return nextWords;
  });
}

function loadAiFactory() {
  if (!aiFactoryPromise) {
    aiFactoryPromise = import("./useHomeLexiconAdmin.ai.js").then((module) => module.createAiOps);
  }
  return aiFactoryPromise;
}

function loadIoFactory() {
  if (!ioFactoryPromise) {
    ioFactoryPromise = import("./useHomeLexiconAdmin.io.js").then((module) => module.createIoOps);
  }
  return ioFactoryPromise;
}

export function useHomeLexiconAdmin(ctx) {
  const local = createLocalOps(ctx);
  const aiContext = {
    ...ctx,
    ...local,
    setWords: createPersistingAiSetWords(ctx)
  };
  const ai = createLazyOps(AI_OP_NAMES, loadAiFactory, aiContext);
  const io = createLazyOps(IO_OP_NAMES, loadIoFactory, { ...aiContext, ...ai });
  const confirmAiCost = (actionName) => window.confirm(
    `${actionName}\n\n这个操作会调用 DeepSeek API，可能产生费用。\n\n` +
    "系统会排除纯词形参考，每次最多发送10个词、单路连续处理，关闭自动付费重试，并在每批成功后自动保存到本地主词库。\n\n" +
    "确定继续吗？"
  );
  return { ...local, ...ai, ...io, confirmAiCost };
}
