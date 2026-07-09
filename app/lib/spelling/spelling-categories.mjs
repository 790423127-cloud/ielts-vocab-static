import { SPELLING_REPAIR_CONFIG } from "./config.mjs";
import { getSpellingExpectedAnswer, resolveSpellingEntryType } from "./normalize-spelling-entry.mjs";

export const SPELLING_BATCH_SIZE = 400;

export const SPELLING_SCOPE_OPTIONS = [
  { value: "word", label: "单词" },
  { value: "phrase", label: "短语" }
];

export const SPELLING_PRACTICE_SOURCES = [
  { value: "category", label: "词库分类" },
  { value: "personal_wrong_book", label: "做题错词" },
  { value: "error_bank", label: "错词本" },
  { value: "srs_review", label: "SRS 复习" }
];

export const SPELLING_DIFFICULTY_OPTIONS = [
  { value: "基础高频", label: "基础必会" },
  { value: "中级核心", label: "核心高频" },
  { value: "高级加分", label: "高级认识" },
  { value: "低频认识即可", label: "低频认识" }
];

export const SPELLING_TOPIC_OPTIONS = [
  "教育", "工作", "住房", "交通", "健康", "环境", "科技", "政府",
  "社会", "消费", "旅行", "社区", "法律", "家庭", "公共服务"
];

export const SPELLING_IELTS_USE_OPTIONS = [
  { value: "Speaking", label: "口语 Speaking" },
  { value: "Listening", label: "听力 Listening" },
  { value: "Reading", label: "阅读 Reading" },
  { value: "Writing", label: "写作 Writing" },
  { value: "Task 2", label: "Task 2" },
  { value: "G类书信", label: "G类书信" },
  { value: "生活高频", label: "生活高频" },
  { value: "工作高频", label: "工作高频" },
  { value: "Writing Task 2", label: "Writing Task 2" },
  { value: "写作 Task 2", label: "写作 Task 2" }
];

export const SPELLING_LISTENING_READING_OPTIONS = [
  { value: "listening", label: "听力高频" },
  { value: "listening_reading", label: "听读高频" },
  { value: "reading", label: "阅读高频" },
  { value: "writing", label: "写作高频" },
  { value: "task2", label: "Task2 写作" },
  { value: "speaking", label: "口语高频" },
  { value: "life_work", label: "生活工作" }
];

const HIGH_FREQUENCY_DIFFICULTIES = new Set(["基础高频", "中级核心"]);
const PHRASE_ARTICLE_DISTINCTION_KEYS = new Set([
  "number of"
]);

function isReliableHighFrequencyEntry(entry = {}) {
  const quality = String(readEntryField(entry, "entryQuality") || "").trim().toLowerCase();
  return !quality.includes("needs_editorial_review");
}

export const SPELLING_CATEGORY_TYPES = [
  { value: "difficulty", label: "难度分类" },
  { value: "lr_high_frequency", label: "训练重点" },
  { value: "topic", label: "主题分类" },
  { value: "all", label: "全库顺序" }
];

export const SPELLING_PHRASE_CATEGORY_TYPES = listSpellingCategoryTypes("phrase");

export const SPELLING_SRS_INTERVALS_DAYS = SPELLING_REPAIR_CONFIG.longTermIntervalsDays;

function readEntryField(entry, field) {
  return entry?.[field] ?? entry?.sourceWord?.[field];
}

export function resolveSpellingEntryScope(entry = {}) {
  const source = entry?.sourceWord || entry;
  const expectedAnswer = getSpellingExpectedAnswer(entry);
  return resolveSpellingEntryType(source, expectedAnswer) === "phrase" ? "phrase" : "word";
}

export function listSpellingCategoryTypes(scopeKind = "word") {
  const types = [
    { value: "difficulty", label: "难度分类" }
  ];

  types.push({ value: "lr_high_frequency", label: "训练重点" });

  types.push({ value: "topic", label: "主题分类" });

  if (scopeKind === "phrase") {
    types.push({ value: "ielts_use", label: "雅思场景" });
  }

  types.push({
    value: "all",
    label: scopeKind === "phrase" ? "全部短语" : "全部单词"
  });

  return types;
}

function entryOrderKey(entry = {}) {
  return String(
    entry?.wordId || entry?.id || entry?.word || entry?.answer || entry?.expectedAnswer || entry?.displayText || ""
  ).toLowerCase();
}

function normalizePhrasePracticeKey(entry = {}) {
  const raw = String(
    getSpellingExpectedAnswer(entry)
    || entry?.word
    || entry?.phrase
    || entry?.text
    || entry?.answer
    || entry?.displayText
    || ""
  )
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[''\u2018\u2019\u201A\u2032`]/g, "'")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!raw) return "";

  const articleStripped = raw
    .replace(/\b(?:a|an|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    articleStripped &&
    articleStripped !== raw &&
    !PHRASE_ARTICLE_DISTINCTION_KEYS.has(articleStripped)
  ) {
    return articleStripped;
  }

  return raw;
}

export function dedupePhrasePracticeEntries(entries = []) {
  const seen = new Set();
  const deduped = [];

  for (const entry of Array.isArray(entries) ? entries : []) {
    const key = normalizePhrasePracticeKey(entry);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }

  return deduped;
}

function alphabeticalSortEntries(entries = []) {
  return [...entries].sort((left, right) => {
    const leftKey = String(left?.word || left?.answer || left?.expectedAnswer || left?.displayText || "").toLowerCase();
    const rightKey = String(right?.word || right?.answer || right?.expectedAnswer || right?.displayText || "").toLowerCase();
    return leftKey.localeCompare(rightKey);
  });
}

function hashSeed(value = "") {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicShuffle(entries = [], seed = "spelling-v1") {
  const shuffled = [...entries];
  let state = hashSeed(`${seed}:${shuffled.map(entryOrderKey).join("|")}`) || 1;

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const target = (state >>> 0) % (index + 1);
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }

  return shuffled;
}

function listeningReadingPriorityScore(entry = {}, mode = "listening") {
  const difficulty = readEntryField(entry, "difficulty");
  const uses = new Set(
    (readEntryField(entry, "ieltsUse") || []).map((use) => String(use || "").trim().toLowerCase())
  );
  let score = difficulty === "基础高频" ? 100 : 55;

  if (mode === "listening_reading") {
    if (uses.has("listening")) score += 35;
    if (uses.has("reading")) score += 25;
  }
  if (mode === "writing") {
    if (readEntryField(entry, "writingPriority") === true) score += 45;
    if (uses.has("writing")) score += 35;
    if (uses.has("writing task 2") || uses.has("task 2") || uses.has("task2")) score += 30;
    if (uses.has("g类书信") || uses.has("写作g类书信")) score += 25;
  }
  if (mode === "task2") {
    if (uses.has("writing task 2") || uses.has("task 2") || uses.has("task2") || uses.has("写作task 2") || uses.has("写作task2")) score += 60;
    if (uses.has("writing")) score += 20;
  }
  if (mode === "speaking") {
    if (uses.has("speaking")) score += 55;
  }
  if (mode === "life_work") {
    if (uses.has("生活高频")) score += 45;
    if (uses.has("工作高频")) score += 45;
  }
  if (uses.has("生活高频".toLowerCase())) score += 35;
  if (uses.has("工作高频".toLowerCase())) score += 30;
  if (uses.has("g类书信")) score += 25;
  if (uses.has("speaking")) score += 12;
  if (uses.has("listening") && uses.has("reading")) score += 8;

  return score;
}

function orderListeningReadingEntries(entries = [], mode = "listening", seed = "lr-high-frequency-v1") {
  return [...entries].sort((left, right) => {
    const scoreDifference = listeningReadingPriorityScore(right, mode)
      - listeningReadingPriorityScore(left, mode);
    if (scoreDifference) return scoreDifference;

    const leftHash = hashSeed(`${seed}:${mode}:${entryOrderKey(left)}`);
    const rightHash = hashSeed(`${seed}:${mode}:${entryOrderKey(right)}`);
    if (leftHash !== rightHash) return leftHash - rightHash;
    return entryOrderKey(left).localeCompare(entryOrderKey(right));
  });
}

export function orderSpellingEntries(entries = [], options = {}) {
  const list = Array.isArray(entries) ? entries : [];
  if (options.preserveSourceOrder) return [...list];

  const alphabetical = alphabeticalSortEntries(list);
  const protectedCount = Math.min(
    alphabetical.length,
    Math.max(0, Number(options.protectedFirstBatchSize ?? SPELLING_BATCH_SIZE))
  );
  const protectedBatch = alphabetical.slice(0, protectedCount);
  const remaining = alphabetical.slice(protectedCount);
  const seed = options.shuffleSeed || "ielts-spelling-order-v1";

  return [...protectedBatch, ...deterministicShuffle(remaining, seed)];
}

export function filterBySpellingScope(entries = [], scopeKind = "word") {
  const list = Array.isArray(entries) ? entries : [];
  const scope = String(scopeKind || "word").trim();

  if (scope === "all") return list;
  if (scope !== "word" && scope !== "phrase") return list;
  return list.filter((entry) => resolveSpellingEntryScope(entry) === scope);
}

export function matchSpellingCategory(entry, categoryType = "all", categoryValue = "") {
  const type = String(categoryType || "all").trim();
  const value = String(categoryValue || "").trim();

  if (type === "all") return true;

  if (type === "difficulty") {
    if (!value) return true;
    return readEntryField(entry, "difficulty") === value;
  }

  if (type === "topic") {
    if (!value) return true;
    const topics = readEntryField(entry, "topics");
    return Array.isArray(topics) && topics.includes(value);
  }

  if (type === "lr_high_frequency") {
    const difficulty = readEntryField(entry, "difficulty");
    const explicitlyListeningPriority = readEntryField(entry, "listeningPriority") === true;
    const explicitlyWritingPriority = readEntryField(entry, "writingPriority") === true;
    if (!explicitlyListeningPriority &&
        !explicitlyWritingPriority &&
        (!HIGH_FREQUENCY_DIFFICULTIES.has(difficulty) || !isReliableHighFrequencyEntry(entry))) return false;

    const uses = readEntryField(entry, "ieltsUse");
    const normalizedUses = new Set(
      (Array.isArray(uses) ? uses : []).map((use) => String(use || "").trim().toLowerCase())
    );
    const isListening = explicitlyListeningPriority || normalizedUses.has("listening");
    const isReading = normalizedUses.has("reading");
    const isWriting = explicitlyWritingPriority ||
      normalizedUses.has("writing") ||
      normalizedUses.has("写作") ||
      normalizedUses.has("writing task 2") ||
      normalizedUses.has("task 2") ||
      normalizedUses.has("task2") ||
      normalizedUses.has("写作task 2") ||
      normalizedUses.has("写作task2") ||
      normalizedUses.has("写作g类书信") ||
      normalizedUses.has("g类书信");
    const isTask2 = normalizedUses.has("task 2") ||
      normalizedUses.has("task2") ||
      normalizedUses.has("writing task 2") ||
      normalizedUses.has("写作task 2") ||
      normalizedUses.has("写作task2");
    const isSpeaking = normalizedUses.has("speaking") || normalizedUses.has("口语");
    const topics = readEntryField(entry, "topics");
    const normalizedTopics = new Set(
      (Array.isArray(topics) ? topics : []).map((topic) => String(topic || "").trim().toLowerCase())
    );
    const isLifeWork = normalizedUses.has("生活高频") ||
      normalizedUses.has("工作高频") ||
      ["工作", "住房", "交通", "健康", "消费", "旅行", "社区", "公共服务"].some((topic) => normalizedTopics.has(topic.toLowerCase()));

    if (value === "reading") return isReading;
    if (value === "writing") return isWriting;
    if (value === "task2") return isTask2;
    if (value === "speaking") return isSpeaking;
    if (value === "life_work") return isLifeWork;
    if (value === "listening_reading") return isListening || isReading;
    return isListening;
  }

  if (type === "ielts_use") {
    if (!value) return true;
    const uses = readEntryField(entry, "ieltsUse");
    return Array.isArray(uses) && uses.includes(value);
  }

  return true;
}

export function filterBySpellingCategory(entries = [], categoryType = "all", categoryValue = "", scopeKind = "", options = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const scoped = scopeKind ? filterBySpellingScope(list, scopeKind) : list;
  const filteredRaw = scoped.filter((entry) => matchSpellingCategory(entry, categoryType, categoryValue));
  const filtered = scopeKind === "phrase" ? dedupePhrasePracticeEntries(filteredRaw) : filteredRaw;
  const shuffleSeed = `${options.shuffleSeed || "ielts-spelling-order-v1"}:${scopeKind}:${categoryType}:${categoryValue}`;

  if (categoryType === "lr_high_frequency") {
    return orderListeningReadingEntries(filtered, categoryValue, shuffleSeed);
  }

  return orderSpellingEntries(filtered, {
    preserveSourceOrder: options.preserveSourceOrder,
    protectedFirstBatchSize: options.protectedFirstBatchSize,
    shuffleSeed
  });
}

export function splitSpellingBatches(entries = [], batchSize = SPELLING_BATCH_SIZE) {
  const list = Array.isArray(entries) ? entries : [];
  const size = Math.max(1, Number(batchSize) || SPELLING_BATCH_SIZE);
  const batches = [];

  for (let index = 0; index < list.length; index += size) {
    batches.push(list.slice(index, index + size));
  }

  return batches.length ? batches : [[]];
}

export function selectSpellingBatch(entries = [], options = {}) {
  const scopeKind = options.scopeKind || "";
  const categoryType = options.categoryType || "all";
  const categoryValue = options.categoryValue || "";
  const batchIndex = Math.max(0, Number(options.batchIndex) || 0);
  const batchSize = Number(options.batchSize) || SPELLING_BATCH_SIZE;

  const filtered = filterBySpellingCategory(entries, categoryType, categoryValue, scopeKind, options);
  const batches = splitSpellingBatches(filtered, batchSize);
  const safeIndex = Math.min(batchIndex, Math.max(0, batches.length - 1));
  const batchEntries = batches[safeIndex] || [];

  return {
    entries: batchEntries,
    scopeKind,
    categoryType,
    categoryValue,
    batchIndex: safeIndex,
    batchSize,
    totalInCategory: filtered.length,
    batchCount: batches.length,
    batchEntryCount: batchEntries.length
  };
}

export function listSpellingBatchOptions(entries = [], options = {}) {
  const scopeKind = options.scopeKind || "";
  const categoryType = options.categoryType || "all";
  const categoryValue = options.categoryValue || "";
  const filtered = filterBySpellingCategory(entries, categoryType, categoryValue, scopeKind, options);
  const batches = splitSpellingBatches(filtered);

  return batches.map((batch, index) => ({
    value: index,
    label: `第 ${index + 1} 批 · ${batch.length} 词`,
    count: batch.length
  }));
}

export function countEntriesBySpellingCategory(entries = [], categoryType = "difficulty", scopeKind = "") {
  const list = scopeKind ? filterBySpellingScope(entries, scopeKind) : (Array.isArray(entries) ? entries : []);
  const counts = new Map();

  if (categoryType === "difficulty") {
    for (const option of SPELLING_DIFFICULTY_OPTIONS) {
      counts.set(option.value, 0);
    }
  }

  if (categoryType === "ielts_use") {
    for (const option of SPELLING_IELTS_USE_OPTIONS) {
      counts.set(option.value, 0);
    }
  }

  if (categoryType === "lr_high_frequency") {
    for (const option of SPELLING_LISTENING_READING_OPTIONS) {
      counts.set(option.value, 0);
    }
  }

  for (const entry of list) {
    if (categoryType === "difficulty") {
      const value = readEntryField(entry, "difficulty");
      if (value) counts.set(value, (counts.get(value) || 0) + 1);
      continue;
    }

    if (categoryType === "topic") {
      const topics = readEntryField(entry, "topics");
      if (!Array.isArray(topics)) continue;
      for (const topic of topics) {
        counts.set(topic, (counts.get(topic) || 0) + 1);
      }
      continue;
    }

    if (categoryType === "ielts_use") {
      const uses = readEntryField(entry, "ieltsUse");
      if (!Array.isArray(uses)) continue;
      for (const use of uses) {
        counts.set(use, (counts.get(use) || 0) + 1);
      }
      continue;
    }

    if (categoryType === "lr_high_frequency") {
      for (const option of SPELLING_LISTENING_READING_OPTIONS) {
        if (matchSpellingCategory(entry, categoryType, option.value)) {
          counts.set(option.value, (counts.get(option.value) || 0) + 1);
        }
      }
    }
  }

  return counts;
}

export function countEntriesBySpellingCategories(entries = [], categoryTypes = [], scopeKind = "") {
  const requested = new Set(Array.isArray(categoryTypes) ? categoryTypes : []);
  const list = scopeKind ? filterBySpellingScope(entries, scopeKind) : (Array.isArray(entries) ? entries : []);
  const counts = {};

  if (requested.has("difficulty")) {
    counts.difficulty = new Map(SPELLING_DIFFICULTY_OPTIONS.map((option) => [option.value, 0]));
  }
  if (requested.has("topic")) {
    counts.topic = new Map();
  }
  if (requested.has("ielts_use")) {
    counts.ielts_use = new Map(SPELLING_IELTS_USE_OPTIONS.map((option) => [option.value, 0]));
  }
  if (requested.has("lr_high_frequency")) {
    counts.lr_high_frequency = new Map(SPELLING_LISTENING_READING_OPTIONS.map((option) => [option.value, 0]));
  }

  for (const entry of list) {
    if (counts.difficulty) {
      const value = readEntryField(entry, "difficulty");
      if (value) counts.difficulty.set(value, (counts.difficulty.get(value) || 0) + 1);
    }

    if (counts.topic) {
      const topics = readEntryField(entry, "topics");
      if (Array.isArray(topics)) {
        for (const topic of topics) {
          counts.topic.set(topic, (counts.topic.get(topic) || 0) + 1);
        }
      }
    }

    if (counts.ielts_use) {
      const uses = readEntryField(entry, "ieltsUse");
      if (Array.isArray(uses)) {
        for (const use of uses) {
          counts.ielts_use.set(use, (counts.ielts_use.get(use) || 0) + 1);
        }
      }
    }

    if (counts.lr_high_frequency) {
      for (const option of SPELLING_LISTENING_READING_OPTIONS) {
        if (matchSpellingCategory(entry, "lr_high_frequency", option.value)) {
          counts.lr_high_frequency.set(option.value, (counts.lr_high_frequency.get(option.value) || 0) + 1);
        }
      }
    }
  }

  return counts;
}

export function spellingScopeLabel(scopeKind = "word") {
  return SPELLING_SCOPE_OPTIONS.find((item) => item.value === scopeKind)?.label || "单词";
}

export function spellingCategoryLabel(categoryType = "all", categoryValue = "", options = {}) {
  const scopeKind = options.scopeKind || "";

  if (categoryType === "difficulty") {
    const match = SPELLING_DIFFICULTY_OPTIONS.find((item) => item.value === categoryValue);
    return match?.label || categoryValue || "全部难度";
  }

  if (categoryType === "topic") {
    return categoryValue || "全部主题";
  }

  if (categoryType === "ielts_use") {
    const match = SPELLING_IELTS_USE_OPTIONS.find((item) => item.value === categoryValue);
    return match?.label || categoryValue || "全部场景";
  }

  if (categoryType === "lr_high_frequency") {
    const match = SPELLING_LISTENING_READING_OPTIONS.find((item) => item.value === categoryValue);
    return match?.label || "听力优先";
  }

  if (scopeKind === "phrase") return "全部短语";
  return "全库顺序";
}

export function buildSpellingCategoryScopeKey(scope = {}) {
  return JSON.stringify(scope);
}
