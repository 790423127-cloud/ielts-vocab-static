/**
 * Reading-only stage presets for G reading.
 *
 * Stages describe how a reader encounters vocabulary in an article. They do
 * not use listening, speaking, or writing labels, and never remove a word
 * from the route: every G-reading entry belongs to exactly one stage.
 */
import { normalizeReadingGKey } from "./normalize.mjs";

export const STAGE_PRESETS = {
  stage1: {
    id: "stage1",
    title: "阶段1：基础保分",
    desc: "基础高频词 + 阅读必懂逻辑与核心词",
    filter: { type: "pathStage", value: "1" }
  },
  stage2: {
    id: "stage2",
    title: "阶段2：扩大覆盖",
    desc: "常见中级阅读词 + 常用阅读词组",
    filter: { type: "pathStage", value: "2" }
  },
  stage3: {
    id: "stage3",
    title: "阶段3：文章强化",
    desc: "文章定位词 + 进阶、低频与主题词",
    filter: { type: "pathStage", value: "3" }
  },
  stage4: {
    id: "stage4",
    title: "阶段4：参考查阅",
    desc: "全部 reference 词条，只查阅，不进默认待学",
    filter: { type: "pathStage", value: "4" }
  }
};

const READING_CORE_LAYERS = new Set(["priority1500", "answerCore250", "logic120"]);
const ARTICLE_REINFORCEMENT_LAYERS = new Set([
  "tierC800",
  "paraExt500",
  "questionBankActive",
  "questionBankAiCompleted"
]);

const DIFFICULTY = Object.freeze({
  BASIC: "基础高频",
  CORE: "中级核心",
  ADVANCED: "高级加分",
  EXTENSION: "阅读扩展",
  LOW_FREQUENCY: "低频认识即可"
});

function hasAnyLayer(layers, candidates) {
  return [...candidates].some((layer) => layers.includes(layer));
}

function isArticleReinforcement(layers) {
  return hasAnyLayer(layers, ARTICLE_REINFORCEMENT_LAYERS);
}

/**
 * Explain the route assignment so the UI and future audits can show why an
 * entry is in a stage without relying on its importing source order.
 */
export function getReadingGPathStage(item) {
  if (!item) return { stage: null, reason: "missing" };

  const layers = Array.isArray(item.layers) ? item.layers : [];
  const difficulty = String(item.difficulty || "").trim();

  if (item.studyMode === "reference") {
    return { stage: "4", reason: "reference" };
  }

  // Every basic reading word remains visible in the route. It is not skipped,
  // hidden, or treated as already familiar.
  if (difficulty === DIFFICULTY.BASIC) {
    return { stage: "1", reason: "basic-reading" };
  }

  if (item.entryType === "phrase" || /\s/.test(item.word || "")) {
    if (
      layers.includes("logic120") ||
      (layers.includes("phrases400") && Number(item.phraseStudyStage) === 1)
    ) {
      return { stage: "1", reason: "reading-foundation-phrase" };
    }
    if (layers.includes("phrases400") && Number(item.phraseStudyStage) === 2) {
      return { stage: "2", reason: "reading-coverage-phrase" };
    }
    if (layers.includes("gtPart12Phrases150")) {
      return String(item.part12PhraseTier || "").toUpperCase() === "S"
        ? { stage: "1", reason: "gt-part12-priority-phrase" }
        : { stage: "2", reason: "gt-part12-coverage-phrase" };
    }
    return isArticleReinforcement(layers)
      ? { stage: "3", reason: "article-phrase" }
      : { stage: "2", reason: "reading-phrase" };
  }

  if (
    difficulty === DIFFICULTY.ADVANCED ||
    difficulty === DIFFICULTY.EXTENSION ||
    difficulty === DIFFICULTY.LOW_FREQUENCY
  ) {
    return { stage: "3", reason: "article-extension" };
  }

  if (difficulty === DIFFICULTY.CORE) {
    if (hasAnyLayer(layers, READING_CORE_LAYERS)) {
      return { stage: "1", reason: "reading-core" };
    }
    if (isArticleReinforcement(layers)) {
      return { stage: "3", reason: "article-target" };
    }
    return { stage: "2", reason: "reading-coverage" };
  }

  // Unknown or legacy difficulty labels stay in the visible coverage stage;
  // they are never silently skipped.
  return { stage: "2", reason: "reading-coverage" };
}

/**
 * Whether an item belongs to a reading-only path stage.
 */
export function itemMatchesPathStage(item, stageValue) {
  return getReadingGPathStage(item).stage === String(stageValue || "");
}

/**
 * Unique counts for stages (for reports / panels).
 */
export function countStageUniques(items) {
  const sets = { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() };
  for (const it of items || []) {
    const key = `${it.entryType || "word"}::${it.normalizedKey || normalizeReadingGKey(it.word)}`;
    for (const s of ["1", "2", "3", "4"]) {
      if (itemMatchesPathStage(it, s)) sets[s].add(key);
    }
  }
  return {
    stage1: sets[1].size,
    stage2: sets[2].size,
    stage3: sets[3].size,
    stage4: sets[4].size
  };
}

export function countPhraseStages(items) {
  let s1 = 0;
  let s2 = 0;
  let total400 = 0;
  for (const it of items || []) {
    const layers = it.layers || [];
    if (!layers.includes("phrases400")) continue;
    total400 += 1;
    if (Number(it.phraseStudyStage) === 1) s1 += 1;
    else if (Number(it.phraseStudyStage) === 2) s2 += 1;
  }
  return { phraseStage1Count: s1, phraseStage2Count: s2, phrases400Count: total400 };
}

/** UI display name for category field (do not rewrite data). */
export function displayCategoryName(raw) {
  const s = String(raw || "").trim();
  if (!s) return "G类阅读提升";
  if (/IELTS\s*G类|阅读核心|G类阅读/i.test(s)) return "G类阅读提升";
  return s;
}
