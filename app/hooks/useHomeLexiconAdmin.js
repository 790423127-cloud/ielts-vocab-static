"use client";
/**
 * Home lexicon admin composer (local + AI + IO).
 * Split in v2026-07-10.3 for maintainability.
 */
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
  const aiContext = { ...ctx, ...local };
  const ai = createLazyOps(AI_OP_NAMES, loadAiFactory, aiContext);
  const io = createLazyOps(IO_OP_NAMES, loadIoFactory, { ...aiContext, ...ai });
  const confirmAiCost = (actionName) => window.confirm(
    `${actionName}\n\n这个操作会调用 DeepSeek API，可能产生费用。\n\n` +
    "建议：平时优先使用“一键本地优化 / 本地归并词形 / 修改当前单词 / 继续补全全部音频”。\n\n" +
    "确定继续吗？"
  );
  return { ...local, ...ai, ...io, confirmAiCost };
}
