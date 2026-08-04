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
    desc: "阶段1之外的 tierB1200 + 词组后200（同义300另计）",
    filter: { type: "pathStage", value: "2" }
  },
  stage3: {
    id: "stage3",
    title: "阶段3：同义与Section3强化",
    desc: "前两阶段之外的全部 active 词条",
    filter: { type: "pathStage", value: "3" }
  },
  stage4: {
    id: "stage4",
    title: "阶段4：参考查阅",
    desc: "全部 reference 词条，只查阅，不进默认待学",
    filter: { type: "pathStage", value: "4" }
  }
};

export const STAGE1_WORD_LAYERS = ["priority1500", "answerCore250", "logic120"];
export const STAGE2_WORD_LAYERS = ["tierB1200"];
export const STAGE3_LAYERS = [
  "paraCore600",
  "tierC800",
  "paraExt500",
  "questionBankActive",
  "questionBankAiCompleted"
];

function matchesStage1Content(item, layers) {
  if (STAGE1_WORD_LAYERS.some((layer) => layers.includes(layer))) return true;
  return layers.includes("phrases400") && Number(item.phraseStudyStage) === 1;
}

function matchesStage2Content(item, layers) {
  if (STAGE2_WORD_LAYERS.some((layer) => layers.includes(layer))) return true;
  return layers.includes("phrases400") && Number(item.phraseStudyStage) === 2;
}

/**
 * Whether item belongs to a path stage (vocab items only; paraphrases separate).
 */
export function itemMatchesPathStage(item, stageValue) {
  if (!item) return false;
  const layers = Array.isArray(item.layers) ? item.layers : [];
  const stage = String(stageValue || "");

  // The route is a partition, not four independent layer filters. A word is
  // assigned once, to the earliest stage that introduces it.
  if (stage === "4") return item.studyMode === "reference";
  if (item.studyMode !== "active") return false;

  const inStage1 = matchesStage1Content(item, layers);
  const inStage2 = !inStage1 && matchesStage2Content(item, layers);

  if (stage === "1") {
    return inStage1;
  }

  if (stage === "2") {
    return inStage2;
  }

  if (stage === "3") {
    // Stage 3 is the final active stage, so it owns every active entry not
    // already introduced by stages 1 or 2 (including compacted family heads).
    return !inStage1 && !inStage2;
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
