import {
  DATASET_VERSION,
  READING_G_DATA_URL,
  READING_G_QUESTION_EVIDENCE_URL,
  READING_G_VOCAB_CACHE_KEY,
  READING_G_PARAPHRASES_URL
} from "./keys.mjs";
import { normalizeReadingGKey } from "./normalize.mjs";
import { normalizeReadingGQuestionEvidence } from "./question-evidence.mjs";
import { displayCategoryName } from "./stages.mjs";
import {
  cleanExampleCnField,
  cleanExampleField
} from "../vocab/example-clean.mjs";
import { getPosDisplay } from "../vocab/pos-display.mjs";
import {
  clearSessionJson,
  clearSessionValue,
  loadSessionJson,
  loadSessionValue
} from "../browser-json-cache.mjs";

export { normalizeReadingGKey } from "./normalize.mjs";
export { displayCategoryName } from "./stages.mjs";

let readingGVocabMemory = null;
let readingGVocabRevision = "";
let readingGVocabInflight = null;
let readingGVocabCacheGeneration = 0;

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
    synthesizeIfEmpty: false,
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
    rawPos: String(entry.primaryPos || entry.pos || "").trim(),
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
    forms: Array.isArray(entry.forms) ? entry.forms : [],
    wordFamily: Array.isArray(entry.wordFamily) ? entry.wordFamily : [],
    synonyms: Array.isArray(entry.synonyms) ? entry.synonyms : [],
    synonymDetails: Array.isArray(entry.synonymDetails) ? entry.synonymDetails : [],
    formsReviewed: entry.formsReviewed === true,
    wordFamilyReviewed: entry.wordFamilyReviewed === true,
    synonymsReviewed: entry.synonymsReviewed === true,
    synonymsReviewSource: String(entry.synonymsReviewSource || "").trim(),
    synonymsReviewedAt: String(entry.synonymsReviewedAt || "").trim(),
    synonymsReviewPolicy: String(entry.synonymsReviewPolicy || "").trim(),
    mergedAliases: Array.isArray(entry.mergedAliases) ? entry.mergedAliases : [],
    mergedEntries: Array.isArray(entry.mergedEntries) ? entry.mergedEntries : [],
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
    part12PhraseTier: String(entry.part12PhraseTier || "").trim(),
    part12ExamTag: String(entry.part12ExamTag || "").trim(),
    part12ExamSource: String(entry.part12ExamSource || "").trim(),
    part12SourcePhrase: String(entry.part12SourcePhrase || "").trim(),
    acceptedAnswers: Array.isArray(entry.acceptedAnswers) ? entry.acceptedAnswers : [],
    part12ArticleFrequency: entry.part12ArticleFrequency && typeof entry.part12ArticleFrequency === "object"
      ? {
        articleCount: Number(entry.part12ArticleFrequency.articleCount) || 0,
        occurrenceCount: Number(entry.part12ArticleFrequency.occurrenceCount) || 0,
        part1ArticleCount: Number(entry.part12ArticleFrequency.part1ArticleCount) || 0,
        part2ArticleCount: Number(entry.part12ArticleFrequency.part2ArticleCount) || 0,
        part3ArticleCount: Number(entry.part12ArticleFrequency.part3ArticleCount) || 0,
        surfaces: Array.isArray(entry.part12ArticleFrequency.surfaces)
          ? entry.part12ArticleFrequency.surfaces.map((value) => String(value || "").trim()).filter(Boolean)
          : []
      }
      : null,
    aiCoachQuestionFrequency: entry.aiCoachQuestionFrequency && typeof entry.aiCoachQuestionFrequency === "object"
      ? {
        occurrenceCount: Number(entry.aiCoachQuestionFrequency.occurrenceCount) || 0,
        questionCount: Number(entry.aiCoachQuestionFrequency.questionCount) || 0,
        testCount: Number(entry.aiCoachQuestionFrequency.testCount) || 0
      }
      : null,
    studyMode: entry.studyMode === "reference" ? "reference" : "active",
    sourceFiles: Array.isArray(entry.sourceFiles) ? entry.sourceFiles : [],
    qualityFlags: Array.isArray(entry.qualityFlags) ? entry.qualityFlags : [],
    alternateMeanings: Array.isArray(entry.alternateMeanings)
      ? entry.alternateMeanings
      : [],
    auditScore: Number(entry.auditScore) || 0,
    phoneticSource: String(entry.phoneticSource || "").trim(),
    sourceWordId: String(entry.sourceWordId || "").trim(),
    meaningDetailZh: String(entry.meaningDetailZh || "").trim(),
    otherMeanings: Array.isArray(entry.otherMeanings) ? entry.otherMeanings : [],
    meaningCoveragePending: entry.meaningCoveragePending === true,
    meaningCoverageReviewed: entry.meaningCoverageReviewed === true,
    meaningCoverageAuditStatus: String(entry.meaningCoverageAuditStatus || "").trim(),
    meaningCoverageReviewSource: String(entry.meaningCoverageReviewSource || "").trim(),
    meaningCoverageReviewedAt: String(entry.meaningCoverageReviewedAt || "").trim(),
    meaningCoveragePromptVersion: String(entry.meaningCoveragePromptVersion || "").trim(),
    meaningCoverageLastFailure: entry.meaningCoverageLastFailure && typeof entry.meaningCoverageLastFailure === "object"
      ? {
        mode: String(entry.meaningCoverageLastFailure.mode || "").trim(),
        reason: String(entry.meaningCoverageLastFailure.reason || "").trim(),
        source: String(entry.meaningCoverageLastFailure.source || "").trim(),
        recordedAt: String(entry.meaningCoverageLastFailure.recordedAt || "").trim()
      }
      : null,
    aiCompletionLastFailure: entry.aiCompletionLastFailure && typeof entry.aiCompletionLastFailure === "object"
      ? {
        mode: String(entry.aiCompletionLastFailure.mode || "").trim(),
        reason: String(entry.aiCompletionLastFailure.reason || "").trim(),
        source: String(entry.aiCompletionLastFailure.source || "").trim(),
        recordedAt: String(entry.aiCompletionLastFailure.recordedAt || "").trim()
      }
      : null,
    audio: String(entry.audio || "").trim(),
    exampleAudio: String(entry.exampleAudio || "").trim()
  };
}

function buildReadingGVocabPayload(data, revision = "") {
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
    updatedAt: String(data?.updatedAt || data?.expandedAt || data?.generatedAt || ""),
    revision: String(revision || ""),
    items
  };
}

function getResponseRevision(response) {
  const headers = response?.headers;
  if (!headers || typeof headers.get !== "function") return "";
  return String(
    headers.get("etag") ||
    headers.get("last-modified") ||
    headers.get("content-length") ||
    ""
  ).trim();
}

function withRevisionCheck(url) {
  const separator = String(url || "").includes("?") ? "&" : "?";
  return `${url}${separator}revisionCheck=${Date.now()}`;
}

/**
 * Load independent IELTS G Reading lexicon (words + phrases + layers).
 */
export async function loadReadingGVocab(fetchImpl = fetch, options = {}) {
  const useMemory = fetchImpl === fetch && !options?.cacheBust;
  if (useMemory && readingGVocabMemory) {
    // G 类词库可在学习过程中删除或由 AI 补全。复用已标准化的
    // 24 MB 数据前只做一次轻量 HEAD 校验，版本变化时仍立即重读。
    const latestRevision = await loadReadingGVocabRevision(fetchImpl).catch(() => "");
    if (!latestRevision || latestRevision === readingGVocabRevision) {
      return readingGVocabMemory;
    }
    readingGVocabMemory = null;
    readingGVocabRevision = "";
  }
  if (useMemory && readingGVocabInflight) return readingGVocabInflight;

  const url = options?.cacheBust ? withRevisionCheck(READING_G_DATA_URL) : READING_G_DATA_URL;
  const generation = readingGVocabCacheGeneration;
  const task = (async () => {
    const response = await fetchImpl(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`G类阅读提升词库加载失败：HTTP ${response.status}`);
    }
    const data = await response.json();
    const revision = getResponseRevision(response);
    const payload = buildReadingGVocabPayload(data, revision);
    if (useMemory && generation === readingGVocabCacheGeneration) {
      readingGVocabMemory = payload;
      readingGVocabRevision = revision;
    }
    return payload;
  })().finally(() => {
    if (readingGVocabInflight === task) readingGVocabInflight = null;
  });

  if (useMemory) readingGVocabInflight = task;
  return task;
}

export async function loadReadingGVocabRevision(fetchImpl = fetch) {
  const response = await fetchImpl(withRevisionCheck(READING_G_DATA_URL), {
    method: "HEAD",
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`G类阅读提升词库版本检查失败：HTTP ${response.status}`);
  }
  return getResponseRevision(response);
}

export function invalidateReadingGVocabCache() {
  readingGVocabCacheGeneration += 1;
  readingGVocabMemory = null;
  readingGVocabRevision = "";
  readingGVocabInflight = null;
  clearSessionJson(READING_G_DATA_URL);
  clearSessionValue("reading-g-vocab:normalized");
  clearSessionValue(READING_G_VOCAB_CACHE_KEY);
}

/**
 * Load verified paraphrase relation groups.
 */
export async function loadReadingGParaphrases(fetchImpl = fetch) {
  const useMemory = fetchImpl === fetch;
  return loadSessionValue(
    "reading-g-paraphrases:normalized",
    async () => {
      let data;
      if (useMemory) {
        data = await loadSessionJson(READING_G_PARAPHRASES_URL, fetchImpl, { cache: "force-cache" });
      } else {
        const response = await fetchImpl(READING_G_PARAPHRASES_URL, { cache: "force-cache" });
        if (!response.ok) {
          throw new Error(`G类阅读提升同义关系加载失败：HTTP ${response.status}`);
        }
        data = await response.json();
      }
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
    },
    { useMemory }
  );
}

export async function loadReadingGQuestionEvidence(fetchImpl = fetch) {
  const useMemory = fetchImpl === fetch;
  return loadSessionValue(
    "reading-g-question-evidence:normalized",
    async () => {
      let data;
      if (useMemory) {
        data = await loadSessionJson(READING_G_QUESTION_EVIDENCE_URL, fetchImpl, { cache: "force-cache" });
      } else {
        const response = await fetchImpl(READING_G_QUESTION_EVIDENCE_URL, { cache: "force-cache" });
        if (!response.ok) {
          throw new Error(`G类阅读真题证据加载失败：HTTP ${response.status}`);
        }
        data = await response.json();
      }
      return normalizeReadingGQuestionEvidence(data);
    },
    { useMemory }
  );
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
  { id: "part12ArticleHighFrequency", label: "剑雅5–21文章高频（Part 1–3）" },
  { id: "priority1500", label: "优先核心1500" },
  { id: "answerCore250", label: "答案词强化250" },
  { id: "logic120", label: "逻辑转换（完整词书）" },
  { id: "phrases400", label: "高频词组400" },
  { id: "gtPart12Phrases150", label: "G4-G21 Part1-2考试短语150" },
  { id: "tierB1200", label: "B层1200" },
  { id: "paraCore600", label: "表达识别核心" },
  { id: "tierC800", label: "C层800" },
  { id: "paraExt500", label: "表达识别扩展" },
  { id: "reference701", label: "参考701" },
  { id: "questionBankActive", label: "全题库补充（已有资料）" },
  { id: "questionBankAiCompleted", label: "全题库补充（AI已补全）" },
  { id: "questionBankPending", label: "全题库待补资料" }
];
