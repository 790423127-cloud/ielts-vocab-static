/**
 * Stage 1–4 study presets for G reading (filter builders).
 * phrases400 stays one layer; phraseStudyStage 1|2 splits queue only.
 */
import { normalizeReadingGKey } from "./normalize.mjs";

export const STAGE_PRESETS = {
  stage1: {
    id: "stage1",
    title: "阶段1：基础保分",
    desc: "priority1500 + answerCore250 + logic120 + 词组前200",
    filter: { type: "pathStage", value: "1" }
  },
  stage2: {
    id: "stage2",
    title: "阶段2：扩大覆盖",
    desc: "tierB1200 + 词组后200（同义300另计）",
    filter: { type: "pathStage", value: "2" }
  },
  stage3: {
    id: "stage3",
    title: "阶段3：同义与Section3强化",
    desc: "paraCore600 + tierC800 + paraExt500（识别，非自动同义题）",
    filter: { type: "pathStage", value: "3" }
  },
  stage4: {
    id: "stage4",
    title: "阶段4：参考查阅",
    desc: "reference701 只查阅，不进默认待学",
    filter: { type: "pathStage", value: "4" }
  }
};

export const STAGE1_WORD_LAYERS = ["priority1500", "answerCore250", "logic120"];
export const STAGE2_WORD_LAYERS = ["tierB1200"];
export const STAGE3_LAYERS = ["paraCore600", "tierC800", "paraExt500"];

/**
 * Whether item belongs to a path stage (vocab items only; paraphrases separate).
 */
export function itemMatchesPathStage(item, stageValue) {
  if (!item) return false;
  const layers = Array.isArray(item.layers) ? item.layers : [];
  const stage = String(stageValue || "");

  if (stage === "1") {
    // words/layers core
    if (STAGE1_WORD_LAYERS.some((l) => layers.includes(l))) {
      if (item.studyMode === "reference") return false;
      return true;
    }
    // phrases400 front 200 only
    if (layers.includes("phrases400") && item.studyMode !== "reference") {
      return Number(item.phraseStudyStage) === 1;
    }
    return false;
  }

  if (stage === "2") {
    if (item.studyMode === "reference") return false;
    if (STAGE2_WORD_LAYERS.some((l) => layers.includes(l))) return true;
    if (layers.includes("phrases400") && Number(item.phraseStudyStage) === 2) return true;
    return false;
  }

  if (stage === "3") {
    if (item.studyMode === "reference") return false;
    return STAGE3_LAYERS.some((l) => layers.includes(l));
  }

  if (stage === "4") {
    return item.studyMode === "reference" || layers.includes("reference701");
  }

  return false;
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
