import {
  DATASET_VERSION,
  READING_G_DATA_URL,
  READING_G_PARAPHRASES_URL
} from "./keys.mjs";
import { normalizeReadingGKey } from "./normalize.mjs";
import { displayCategoryName } from "./stages.mjs";
import {
  cleanExampleCnField,
  cleanExampleField
} from "../vocab/example-clean.mjs";
import { getPosDisplay } from "../vocab/pos-display.mjs";

export { normalizeReadingGKey } from "./normalize.mjs";
export { displayCategoryName } from "./stages.mjs";

/**
 * Normalize one vocab item for flashcard UI + layer filters.
 */
export function normalizeReadingGItem(entry, index = 0) {
  if (!entry || typeof entry !== "object") return null;
  const word = String(entry.word || "").trim();
  if (!word) return null;

  const entryType =
    entry.entryType === "phrase" || /\s/.test(word) ? "phrase" : "word";
  const normalizedKey =
    entry.normalizedKey || normalizeReadingGKey(word);
  const primaryMeaningZh = String(
    entry.primaryMeaningZh || entry.meaning || entry.meaningZh || entry.definition || ""
  ).trim();
  const layers = Array.isArray(entry.layers) ? entry.layers.slice() : [];
  const senses = Array.isArray(entry.senses) ? entry.senses : [];

  const cleanedExample = cleanExampleField(entry.example || "", word, {
    entryType,
    meaningZh: primaryMeaningZh,
    synthesizeIfEmpty: true,
    maxWords: 32
  });

  const rawCategory = String(entry.category || "IELTS G类 · 阅读核心").trim();
  const phraseStudyStage = Number(entry.phraseStudyStage) || 0;

  return {
    id: entry.id || `rg_${entryType}_${index}_${normalizedKey.replace(/[^a-z0-9]+/g, "_")}`,
    entryType,
    word,
    normalizedKey,
    phonetic: String(entry.phonetic || "").trim(),
    pos: getPosDisplay(
      String(entry.primaryPos || entry.pos || (entryType === "phrase" ? "phrase" : "")).trim()
    ),
    primaryPos: String(entry.primaryPos || entry.pos || "").trim(),
    primaryMeaningZh,
    meaning: primaryMeaningZh,
    meaningZh: primaryMeaningZh,
    definition: String(entry.definition || primaryMeaningZh).trim(),
    example: cleanedExample.example,
    exampleCn: cleanExampleCnField(entry.exampleCn || entry.exampleZh || ""),
    senses,
    collocations: Array.isArray(entry.collocations) ? entry.collocations : [],
    phraseCollocations: Array.isArray(entry.phraseCollocations)
      ? entry.phraseCollocations
      : [],
    wordFamily: Array.isArray(entry.wordFamily) ? entry.wordFamily : [],
    ieltsUse: Array.isArray(entry.ieltsUse)
      ? entry.ieltsUse
      : entry.ieltsUse
        ? [String(entry.ieltsUse)]
        : [],
    topics: Array.isArray(entry.topics) ? entry.topics : [],
    difficulty: String(entry.difficulty || "中级核心").trim() || "中级核心",
    // keep raw category; UI maps via displayCategoryName
    category: rawCategory,
    categoryDisplay: displayCategoryName(rawCategory),
    domain: String(entry.domain || "阅读通用").trim() || "阅读通用",
    layers,
    primaryLayer: String(entry.primaryLayer || layers[0] || "").trim(),
    layerRank: Number(entry.layerRank) || 99,
    phraseStudyStage: phraseStudyStage === 1 || phraseStudyStage === 2 ? phraseStudyStage : 0,
    studyMode: entry.studyMode === "reference" ? "reference" : "active",
    sourceFiles: Array.isArray(entry.sourceFiles) ? entry.sourceFiles : [],
    qualityFlags: Array.isArray(entry.qualityFlags) ? entry.qualityFlags : [],
    alternateMeanings: Array.isArray(entry.alternateMeanings)
      ? entry.alternateMeanings
      : [],
    auditScore: Number(entry.auditScore) || 0,
    phoneticSource: String(entry.phoneticSource || "").trim()
  };
}

/**
 * Load independent IELTS G Reading lexicon (words + phrases + layers).
 */
export async function loadReadingGVocab(fetchImpl = fetch) {
  const response = await fetchImpl(READING_G_DATA_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`G类阅读提升词库加载失败：HTTP ${response.status}`);
  }

  const data = await response.json();
  const rawList = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.words)
      ? data.words
      : Array.isArray(data)
        ? data
        : [];

  const items = rawList
    .map((entry, index) => normalizeReadingGItem(entry, index))
    .filter(Boolean);

  const activeCount = items.filter((x) => x.studyMode === "active").length;
  const referenceCount = items.filter((x) => x.studyMode === "reference").length;

  return {
    version: String(data?.version || data?.datasetVersion || DATASET_VERSION),
    datasetVersion: String(data?.datasetVersion || data?.version || DATASET_VERSION),
    dataSchemaVersion: Number(data?.dataSchemaVersion) || 3,
    count: Number.isFinite(data?.count) ? data.count : items.length,
    wordCount: Number.isFinite(data?.wordCount)
      ? data.wordCount
      : items.filter((x) => x.entryType === "word").length,
    phraseCount: Number.isFinite(data?.phraseCount)
      ? data.phraseCount
      : items.filter((x) => x.entryType === "phrase").length,
    activeCount: Number.isFinite(data?.activeCount) ? data.activeCount : activeCount,
    referenceCount: Number.isFinite(data?.referenceCount)
      ? data.referenceCount
      : referenceCount,
    multiSenseCount: Number.isFinite(data?.multiSenseCount)
      ? data.multiSenseCount
      : items.filter((x) => (x.senses || []).length > 1).length,
    layerStats: data?.layerStats || {},
    note: String(data?.note || ""),
    items
  };
}

/**
 * Load verified paraphrase relation groups.
 */
export async function loadReadingGParaphrases(fetchImpl = fetch) {
  const response = await fetchImpl(READING_G_PARAPHRASES_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`G类阅读提升同义关系加载失败：HTTP ${response.status}`);
  }
  const data = await response.json();
  const groups = Array.isArray(data?.groups)
    ? data.groups
    : Array.isArray(data?.pairs)
      ? data.pairs
      : [];
  return {
    version: String(data?.version || ""),
    count: Number.isFinite(data?.count) ? data.count : groups.length,
    highConfidenceCount: Number.isFinite(data?.highConfidenceCount)
      ? data.highConfidenceCount
      : groups.filter((g) => g.confidence === "high").length,
    policy: data?.policy || {},
    groups
  };
}

/**
 * Stage-1 composite layers (word layers; phrases400 uses phraseStudyStage=1 only at filter time).
 */
export const STAGE1_LAYERS = [
  "priority1500",
  "answerCore250",
  "logic120",
  "phrases400"
];

export const LAYER_META = [
  { id: "priority1500", label: "优先核心1500" },
  { id: "answerCore250", label: "答案词强化250" },
  { id: "logic120", label: "逻辑连接120" },
  { id: "phrases400", label: "高频词组400" },
  { id: "tierB1200", label: "B层1200" },
  { id: "paraCore600", label: "表达识别核心" },
  { id: "tierC800", label: "C层800" },
  { id: "paraExt500", label: "表达识别扩展" },
  { id: "reference701", label: "参考701" }
];
