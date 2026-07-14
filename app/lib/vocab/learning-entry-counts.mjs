import { IDICTATION_FREQUENCY_META } from "../spelling/idictation-frequency.mjs";

function normalizePhraseItems(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value)
    .split(/[\n,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isMissingAiFields(word) {
  return (
    !word?.meaning ||
    !word?.pos ||
    !word?.example ||
    !normalizePhraseItems(word.collocations).length ||
    !normalizePhraseItems(word.phraseCollocations).length
  );
}

function isMissingClassification(word) {
  return !word?.ieltsUse?.length || !word?.topics?.length || !word?.difficulty;
}

function isLifeWorkWord(word) {
  const uses = Array.isArray(word?.ieltsUse) ? word.ieltsUse : [];
  const topics = Array.isArray(word?.topics) ? word.topics : [];

  return (
    uses.includes("生活高频") ||
    uses.includes("工作高频") ||
    topics.some((topic) => ["工作", "住房", "交通", "健康", "消费", "旅行", "社区", "公共服务"].includes(topic))
  );
}

function createFilterTallies() {
  return {
    everything: 0,
    all: 0,
    status: {
      不熟: 0,
      熟悉: 0,
      收藏: 0,
      待补全: 0,
      待归纳: 0
    },
    ielts: new Map(),
    topic: new Map(),
    difficulty: new Map(),
    lifeWork: 0
  };
}

function tallyWordForFilters(word, tallies) {
  const status = word?.status || "";
  const isFamiliar = status === "熟悉";

  tallies.everything += 1;

  if (status === "不熟") tallies.status["不熟"] += 1;
  if (isFamiliar) tallies.status["熟悉"] += 1;
  if (!isFamiliar && word?.favorite) tallies.status["收藏"] += 1;
  if (!isFamiliar && isMissingAiFields(word)) tallies.status["待补全"] += 1;
  if (!isFamiliar && isMissingClassification(word)) tallies.status["待归纳"] += 1;
  if (!isFamiliar) tallies.all += 1;

  if (isFamiliar) return;

  if (isLifeWorkWord(word)) tallies.lifeWork += 1;

  for (const use of word?.ieltsUse || []) {
    tallies.ielts.set(use, (tallies.ielts.get(use) || 0) + 1);
  }

  for (const topic of word?.topics || []) {
    tallies.topic.set(topic, (tallies.topic.get(topic) || 0) + 1);
  }

  if (word?.difficulty) {
    const key = word.difficulty;
    tallies.difficulty.set(key, (tallies.difficulty.get(key) || 0) + 1);
  }
}

function countFromTallies(filter, tallies) {
  if (!filter || typeof filter !== "object") return tallies.all;

  if (filter.type === "everything") return tallies.everything;
  if (filter.type === "all") return tallies.all;

  if (filter.type === "status") {
    return tallies.status[filter.value] || 0;
  }

  if (filter.type === "custom" && filter.value === "life-work") {
    return tallies.lifeWork;
  }

  if (filter.type === "ielts") {
    return tallies.ielts.get(filter.value) || 0;
  }

  if (filter.type === "topic") {
    return tallies.topic.get(filter.value) || 0;
  }

  if (filter.type === "difficulty") {
    return tallies.difficulty.get(filter.value) || 0;
  }

  return tallies.all;
}

function getIdictationEntryCount(sourceKey, getIdictationSource) {
  const source = getIdictationSource(sourceKey);
  if (source) return source.uniqueWords || source.entries?.length || 0;

  // The full frequency payload is lazy-loaded. Use its generated metadata so
  // the entry cards show the correct totals immediately instead of a stale 0.
  return IDICTATION_FREQUENCY_META.sources?.[sourceKey]?.uniqueWords || 0;
}

/**
 * Build learning-entry counts in one pass over the lexicon.
 * @param {Array} words
 * @param {Array} learningEntries
 * @param {{ filterKey: Function, isIdictationFlashFilter: Function, getIdictationSource: Function }} helpers
 */
export function buildLearningEntryCounts(words, learningEntries, {
  filterKey,
  isIdictationFlashFilter,
  getIdictationSource
}) {
  const counts = new Map();
  const tallies = createFilterTallies();

  for (const word of Array.isArray(words) ? words : []) {
    tallyWordForFilters(word, tallies);
  }

  for (const group of Array.isArray(learningEntries) ? learningEntries : []) {
    for (const entry of group.items || []) {
      const key = filterKey(entry.filter);

      if (isIdictationFlashFilter(entry.filter)) {
        counts.set(key, getIdictationEntryCount(entry.filter.value, getIdictationSource));
        continue;
      }

      counts.set(key, countFromTallies(entry.filter, tallies));
    }
  }

  return counts;
}
