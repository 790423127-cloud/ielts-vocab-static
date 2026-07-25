"use client";
/**
 * Home lexicon admin composer (local + AI + IO).
 * Split in v2026-07-10.3 for maintainability.
 */
import { mergeAiSnapshotWithExisting } from "../lib/vocab/ai-write-merge.mjs";
import { recoverFromStaleChunk } from "../lib/vocab/lazy-chunk-recovery.mjs";
import { stripWordUserState } from "../lib/vocab/word-cache-meta.mjs";
import { yieldToBrowserMainThread } from "../lib/vocab/word-store.mjs";
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
  "startContinuousAiCompletion",
  "stopContinuousAiCompletion",
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

export async function buildAiSnapshotRequestBody(snapshot, metadata = {}, options = {}) {
  const list = Array.isArray(snapshot) ? snapshot : [];
  const chunkSize = Math.max(1, Number(options.chunkSize) || 250);
  const yieldControl = options.yieldControl || yieldToBrowserMainThread;
  const parts = ['{"words":['];

  for (let start = 0; start < list.length; start += chunkSize) {
    const contentChunk = list
      .slice(start, start + chunkSize)
      .map(stripWordUserState);
    const serialized = JSON.stringify(contentChunk);
    if (start > 0) parts.push(",");
    parts.push(serialized.slice(1, -1));
    if (start + chunkSize < list.length) await yieldControl();
  }

  parts.push("]");
  const metadataText = JSON.stringify(metadata);
  if (metadataText.length > 2) parts.push(",", metadataText.slice(1, -1));
  parts.push("}");

  if (options.asText === true || typeof Blob === "undefined") {
    return parts.join("");
  }
  return new Blob(parts, { type: "application/json" });
}

export function createLatestSnapshotPublisher(options = {}) {
  const publish = options.publish;
  const onError = options.onError || (() => {});
  const schedule = options.schedule || ((callback) => globalThis.setTimeout(callback, 0));
  let latestSnapshot = null;
  let scheduled = false;
  let running = false;
  let idleResolvers = [];

  function resolveIdle() {
    if (scheduled || running || latestSnapshot !== null) return;
    const resolvers = idleResolvers;
    idleResolvers = [];
    for (const resolve of resolvers) resolve();
  }

  async function drain() {
    scheduled = false;
    if (running) return;
    running = true;

    try {
      while (latestSnapshot !== null) {
        const snapshot = latestSnapshot;
        latestSnapshot = null;
        try {
          await publish(snapshot);
        } catch (error) {
          onError(error);
        }
      }
    } finally {
      running = false;
      if (latestSnapshot !== null && !scheduled) {
        scheduled = true;
        schedule(drain);
      } else {
        resolveIdle();
      }
    }
  }

  return {
    enqueue(snapshot) {
      latestSnapshot = snapshot;
      if (!running && !scheduled) {
        scheduled = true;
        schedule(drain);
      }
    },
    whenIdle() {
      if (!scheduled && !running && latestSnapshot === null) return Promise.resolve();
      return new Promise((resolve) => idleResolvers.push(resolve));
    }
  };
}

function createLazyOps(names, loadFactory, context) {
  return Object.fromEntries(names.map((name) => [
    name,
    async (...args) => {
      try {
        const factory = await loadFactory();
        const operation = factory(context)[name];
        return await operation?.(...args);
      } catch (error) {
        const recovery = recoverFromStaleChunk(error);
        if (!recovery.reloading) {
          context.setToast?.(
            recovery.stale
              ? "AI工具前端文件已更新，但浏览器仍在使用旧缓存。请刷新页面后再试。"
              : (error?.message || "工具加载失败，请重试")
          );
        }
        return undefined;
      }
    }
  ]));
}

export async function publishAiSnapshot(context, snapshot) {
  if (typeof context.persistWordsImmediately !== "function") {
    const error = new Error("本地保存入口不可用，服务器发布已停止");
    error.code = "LOCAL_SAVE_UNAVAILABLE";
    error.status = "local-save-failed";
    throw error;
  }

  const result = await context.persistWordsImmediately(snapshot);
  if (!result?.ok || result.serverPublished === false) {
    const error = new Error(result?.serverResult?.detail || result?.serverResult?.error || result?.error?.message || "正式主词库发布失败");
    error.code = result?.localSaved ? "SERVER_PUBLISH_FAILED" : "LOCAL_SAVE_FAILED";
    error.status = result?.localSaved ? "server-publish-failed" : "local-save-failed";
    error.localSaved = Boolean(result?.localSaved);
    error.serverPublished = false;
    throw error;
  }
  return result;
}

function createPersistingAiSetWords(context) {
  const publisher = createLatestSnapshotPublisher({
    publish: (snapshot) => publishAiSnapshot(context, snapshot),
    schedule: (callback) => window.setTimeout(callback, 0),
    onError(error) {
      if (error?.status === "local-save-failed") {
        context.setToast?.(`AI结果已生成，但本地保存失败，服务器未发布：${error.message}`);
      } else if (error?.status === "server-publish-failed") {
        context.setToast?.(`AI结果已在本地保存，但服务器未发布：${error.message}`);
      } else {
        context.setToast?.(`AI结果已生成，但自动保存失败：${error?.message || "未知错误"}`);
      }
    }
  });

  return (updater) => context.setWords((previousWords) => {
    let nextWords;
    try {
      const rawNextWords = typeof updater === "function" ? updater(previousWords) : updater;
      nextWords = mergeAiSnapshotWithExisting(previousWords, rawNextWords);
    } catch (error) {
      context.setToast?.(error?.message || "AI写回身份冲突，已停止写入");
      return previousWords;
    }
    if (Array.isArray(nextWords)) {
      context.markContentSnapshot?.(nextWords);
      publisher.enqueue(nextWords);
    }
    return nextWords;
  });
}

function loadAiFactory() {
  if (!aiFactoryPromise) {
    aiFactoryPromise = import("./useHomeLexiconAdmin.ai.js")
      .then((module) => module.createAiOps)
      .catch((error) => {
        aiFactoryPromise = null;
        throw error;
      });
  }
  return aiFactoryPromise;
}

function loadIoFactory() {
  if (!ioFactoryPromise) {
    ioFactoryPromise = import("./useHomeLexiconAdmin.io.js")
      .then((module) => module.createIoOps)
      .catch((error) => {
        ioFactoryPromise = null;
        throw error;
      });
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
  const io = createLazyOps(IO_OP_NAMES, loadIoFactory, { ...ctx, ...local, ...ai });
  const confirmAiCost = (actionName) => window.confirm(
    `${actionName}\n\n这个操作会调用 DeepSeek API，可能产生费用。\n\n` +
    "系统会排除纯词形参考；每个请求最多发送10个词，并在每轮成功后保存检查点。连续模式可以手动停止，错误率过高时会自动熔断。\n\n" +
    "确定继续吗？"
  );
  return { ...local, ...ai, ...io, confirmAiCost };
}
