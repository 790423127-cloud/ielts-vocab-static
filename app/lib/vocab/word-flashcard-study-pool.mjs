import { getIdictationSource } from "../spelling/idictation-frequency.mjs";
import {
  IDICTATION_FLASH_INDEX_OFFSET,
  isIdictationFlashFilter as isIdictationFlashSessionFilter
} from "./word-flashcard-session.mjs";
import {
  isBrushableWord,
  isInflectedReferenceWord,
  resolveInflectedReferenceIndex
} from "./word-study-eligibility.mjs";

function normalizePhraseItems(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "string") {
        return { phrase: item, chinese: "" };
      }

      return {
        phrase: item?.phrase || item?.text || item?.collocation || "",
        chinese: item?.chinese || item?.translation || item?.meaning || ""
      };
    })
    .filter((item) => item.phrase);
}

export function normalizeStudyWordKey(word) {
  return String(word || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "")
    .replace(/\s+/g, " ");
}

function isMissingAiFields(word) {
  return (
    !word.meaning ||
    !word.pos ||
    !word.example ||
    !normalizePhraseItems(word.collocations).length ||
    !normalizePhraseItems(word.phraseCollocations).length
  );
}

function isMissingClassification(word) {
  return !word.ieltsUse?.length || !word.topics?.length || !word.difficulty;
}

export const IDICTATION_FLASH_FILTERS = [
  { value: "listening", title: "爱听写听力", desc: "按听力答案词和出现频率整理的独立刷词入口。" },
  { value: "reading", title: "爱听写阅读", desc: "按阅读高频答案词和出现频率整理的独立刷词入口。" }
];

export function isIdictationFlashFilter(filter) {
  return isIdictationFlashSessionFilter(filter);
}

export function buildLibraryWordMap(libraryWords = []) {
  const wordMap = new Map();

  for (const word of Array.isArray(libraryWords) ? libraryWords : []) {
    const key = normalizeStudyWordKey(word?.word);
    if (key && !wordMap.has(key)) wordMap.set(key, word);
  }

  return wordMap;
}

export function findIdictationLibraryWord(entry = {}, libraryWordMap = new Map()) {
  const candidates = [
    entry.word,
    entry.expectedAnswer,
    ...(Array.isArray(entry.acceptedAnswers) ? entry.acceptedAnswers : [])
  ]
    .map(normalizeStudyWordKey)
    .filter(Boolean);

  for (const key of candidates) {
    const matched = libraryWordMap.get(key);
    if (matched) return matched;
  }

  return null;
}

export function buildIdictationFlashWords(sourceKey, libraryWords = [], libraryWordMap = null) {
  const source = getIdictationSource(sourceKey);
  if (!source?.entries?.length) return [];
  const lookup = libraryWordMap || buildLibraryWordMap(libraryWords);

  return source.entries.map((entry, sourceIndex) => {
    const libraryWord = findIdictationLibraryWord(entry, lookup);
    const answerText = Array.isArray(entry.acceptedAnswers) && entry.acceptedAnswers.length
      ? entry.acceptedAnswers.join(" / ")
      : entry.expectedAnswer || "";
    const frequencyLabel = entry.frequencyGroupLabel || `${entry.frequency || 0}次`;

    return {
      id: entry.id,
      word: entry.word,
      phonetic: entry.phonetic || libraryWord?.phonetic || "",
      pos: libraryWord?.pos || "word",
      meaning: entry.meaning || libraryWord?.meaning || answerText || frequencyLabel,
      definition: libraryWord?.definition || answerText || entry.meaning || "",
      example: entry.example || libraryWord?.example || `${entry.word} is from ${entry.sourceLabel || "爱听写"}.`,
      exampleCn: entry.exampleCn || libraryWord?.exampleCn || [frequencyLabel, answerText].filter(Boolean).join(" · "),
      collocations: normalizePhraseItems(libraryWord?.collocations),
      phraseCollocations: normalizePhraseItems(libraryWord?.phraseCollocations),
      ieltsUse: libraryWord?.ieltsUse?.length ? libraryWord.ieltsUse : [entry.sourceLabel].filter(Boolean),
      topics: libraryWord?.topics?.length ? libraryWord.topics : [frequencyLabel].filter(Boolean),
      difficulty: libraryWord?.difficulty || frequencyLabel,
      category: libraryWord?.category || entry.sourceLabel || "爱听写",
      status: "",
      favorite: false,
      forms: libraryWord?.forms?.length ? libraryWord.forms : [],
      wordFamily: libraryWord?.wordFamily || [],
      frequency: entry.frequency || 0,
      sourceWorkbook: entry.sourceWorkbook || "",
      sourceSheet: entry.sourceSheet || "",
      sourceLibraryWord: libraryWord?.word || "",
      originalIndex: IDICTATION_FLASH_INDEX_OFFSET + sourceIndex,
      __idictationFlash: true
    };
  });
}

export function buildStudyPoolForFilter(nextFilter, libraryWords = []) {
  if (!isIdictationFlashFilter(nextFilter)) return null;
  return buildIdictationFlashWords(
    nextFilter.value,
    libraryWords,
    buildLibraryWordMap(libraryWords)
  );
}

export function isLifeWorkWord(word) {
  const uses = Array.isArray(word?.ieltsUse) ? word.ieltsUse : [];
  const topics = Array.isArray(word?.topics) ? word.topics : [];

  return (
    uses.includes("生活高频") ||
    uses.includes("工作高频") ||
    topics.some((topic) => ["工作", "住房", "交通", "健康", "消费", "旅行", "社区", "公共服务"].includes(topic))
  );
}

export function wordMatchesFilter(word, filter) {
  if (isIdictationFlashFilter(filter)) return Boolean(word.__idictationFlash);
  if (!isBrushableWord(word)) return false;
  if (filter.type === "everything") return true;
  if (word.studyMode === "reference" && !(filter.type === "topic" && filter.value === "G类完整学习计划·阶段4")) return false;

  if (filter.type === "status") {
    if (filter.value === "不熟") return word.status === "不熟";
    if (filter.value === "熟悉") return word.status === "熟悉";
    if (filter.value === "收藏") return word.status !== "熟悉" && word.favorite;
    if (filter.value === "待补全") return word.status !== "熟悉" && isMissingAiFields(word);
    if (filter.value === "待归纳") return word.status !== "熟悉" && isMissingClassification(word);
  }

  if (word.status === "熟悉") return false;

  if (filter.type === "custom" && filter.value === "life-work") return isLifeWorkWord(word);
  if (filter.type === "ielts" || filter.type === "ieltsUse") return word.ieltsUse?.includes(filter.value);
  if (filter.type === "topic") return word.topics?.includes(filter.value);
  if (filter.type === "difficulty") return word.difficulty === filter.value;

  return true;
}

export function getFilterName(filter) {
  if (filter.type === "all") return "今日任务 / 全部待学";
  if (filter.type === "everything") return "全部可刷词";
  if (filter.type === "custom" && filter.value === "life-work") return "生活/工作高频";
  if (isIdictationFlashFilter(filter)) return getIdictationSource(filter.value)?.label || "爱听写";
  if (filter.type === "ielts" || filter.type === "ieltsUse") return `IELTS 用途：${filter.value}`;
  if (filter.type === "topic") return `主题分类：${filter.value}`;
  if (filter.type === "difficulty") return `难度分类：${filter.value}`;
  if (filter.type === "status" && filter.value === "不熟") return "不熟词库";
  if (filter.type === "status" && filter.value === "熟悉") return "熟悉词库";
  if (filter.type === "status" && filter.value === "收藏") return "收藏词";
  if (filter.type === "status") return `状态：${filter.value}`;
  return "待学习单词";
}

export const LEARNING_ENTRIES = [
  {
    group: "今天优先",
    items: [
      { title: "今日任务", desc: "快速扫待学词 + 复习不熟词。", filter: { type: "all", value: "" } },
      { title: "不熟词", desc: "所有标记不熟的词，优先复习。", filter: { type: "status", value: "不熟" } },
      { title: "收藏词", desc: "写作、口语、书信可直接用的重点词。", filter: { type: "status", value: "收藏" } }
    ]
  },
  {
    group: "爱听写独立入口",
    items: IDICTATION_FLASH_FILTERS.map((entry) => ({
      title: entry.title,
      desc: entry.desc,
      filter: { type: "idictation", value: entry.value }
    }))
  },
  {
    group: "IELTS G 类用途",
    items: [
      { title: "G类书信", desc: "投诉、申请、预约、感谢、道歉、解释。", filter: { type: "ielts", value: "G类书信" } },
      { title: "Listening", desc: "听力生活场景词，优先听音频反应。", filter: { type: "ielts", value: "Listening" } },
      { title: "Speaking", desc: "口语可用表达，适合造句。", filter: { type: "ielts", value: "Speaking" } },
      { title: "Reading", desc: "阅读识别为主，不要求全会写。", filter: { type: "ielts", value: "Reading" } },
      { title: "Task 2", desc: "社会、教育、环境、科技观点词。", filter: { type: "ielts", value: "Task 2" } },
      { title: "生活/工作高频", desc: "住房、交通、健康、消费、工作。", filter: { type: "custom", value: "life-work" } }
    ]
  },
  {
    group: "G类完整学习计划",
    items: [
      {
        title: "阶段1 · 核心理解",
        desc: "G类阅读核心词和本轮真题精补词，目标是1至2秒内认出。",
        filter: { type: "topic", value: "G类完整学习计划·阶段1" }
      },
      {
        title: "阶段2 · 扩展识别",
        desc: "Section 2和Section 3扩展词，以阅读识别为主。",
        filter: { type: "topic", value: "G类完整学习计划·阶段2" }
      },
      {
        title: "阶段4 · 专业参考",
        desc: "真题专业词、专名和低频词，只需结合原文识别。",
        filter: { type: "topic", value: "G类完整学习计划·阶段4" }
      }
    ]
  },
  {
    group: "难度层级",
    items: [
      { title: "基础必会", desc: "必须快速认出，适合每天扫。", filter: { type: "difficulty", value: "基础高频" } },
      { title: "核心高频", desc: "雅思主力词，优先变熟悉。", filter: { type: "difficulty", value: "中级核心" } },
      { title: "高级认识", desc: "认识即可，不要花太久。", filter: { type: "difficulty", value: "高级加分" } },
      { title: "全部可刷词", desc: "包含熟悉词，不包含已归并到基词的纯词形。", filter: { type: "everything", value: "" } }
    ]
  }
];

export function filterKey(filter) {
  if (!filter || typeof filter !== "object") return "all";
  if (filter.type === "all") return "all";
  if (filter.type === "everything") return "everything";
  return `${filter.type}:${filter.value || ""}`;
}

export function isSameFilter(a, b) {
  return filterKey(a) === filterKey(b);
}

export function buildStudyWordIndices(pool, filter, { idictation = false } = {}) {
  if (idictation) {
    return pool
      .filter((word) => wordMatchesFilter(word, filter))
      .map((word) => word.originalIndex);
  }

  const indices = [];
  for (let i = 0; i < pool.length; i += 1) {
    if (wordMatchesFilter(pool[i], filter)) indices.push(i);
  }
  return indices;
}

export function buildFilteredWordIndices(pool, filter, search, { idictation = false } = {}) {
  const q = search.trim().toLowerCase();

  if (idictation) {
    return pool
      .filter((word) => {
        if (q && !word.word.toLowerCase().includes(q)) return false;
        return wordMatchesFilter(word, filter);
      })
      .map((word) => word.originalIndex);
  }

  const indices = [];
  const seen = new Set();
  const addIndex = (index) => {
    if (!Number.isInteger(index) || index < 0 || seen.has(index)) return;
    seen.add(index);
    indices.push(index);
  };

  for (let i = 0; i < pool.length; i += 1) {
    const word = pool[i];
    const wordText = String(word?.word || "").toLowerCase();
    if (q && !wordText.includes(q)) continue;

    if (isInflectedReferenceWord(word)) {
      if (!q) continue;
      const baseIndex = resolveInflectedReferenceIndex(pool, i, normalizeStudyWordKey);
      if (baseIndex >= 0 && wordMatchesFilter(pool[baseIndex], filter)) addIndex(baseIndex);
      continue;
    }

    if (wordMatchesFilter(word, filter)) addIndex(i);
  }

  return indices;
}

export function resolveStudyWordEntry(pool, poolIndex, wordByIndex) {
  if (poolIndex === undefined || poolIndex === null || poolIndex < 0) return null;
  if (wordByIndex) return wordByIndex.get(poolIndex) || null;

  const word = pool[poolIndex];
  if (!word) return null;
  if (Number.isInteger(word.originalIndex)) return word;
  return { ...word, originalIndex: poolIndex };
}
