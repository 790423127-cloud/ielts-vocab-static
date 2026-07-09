import { normalizePhraseKey } from "./load-phrases.mjs";

export const PHRASE_STUDY_STATUS = {
  FAMILIAR: "熟悉",
  UNFAMILIAR: "不熟"
};

export const PHRASE_FILTER_STATUS = {
  UNFAMILIAR: "不熟",
  FAMILIAR: "熟悉",
  FAVORITE: "收藏"
};

/** Legacy mojibake values written by an earlier broken encoding pass. */
export const LEGACY_PHRASE_STATUS_VALUES = {
  "鐔熸倝": PHRASE_STUDY_STATUS.FAMILIAR,
  "涓嶇啛": PHRASE_STUDY_STATUS.UNFAMILIAR,
  "鏀惰棌": PHRASE_FILTER_STATUS.FAVORITE
};

export function normalizePhraseStatusValue(value = "") {
  const text = String(value || "").trim();
  return LEGACY_PHRASE_STATUS_VALUES[text] || text;
}

export function migratePhraseStatusMap(statusMap = {}) {
  if (!statusMap || typeof statusMap !== "object") return {};

  let changed = false;
  const next = {};

  for (const [key, entry] of Object.entries(statusMap)) {
    if (!entry || typeof entry !== "object") continue;
    const status = normalizePhraseStatusValue(entry.status);
    if (status !== entry.status) changed = true;
    next[key] = {
      ...entry,
      status
    };
  }

  return changed ? next : statusMap;
}

export function migratePhraseEntryPositions(entryPositions = {}) {
  if (!entryPositions || typeof entryPositions !== "object") return entryPositions;

  let changed = false;
  const next = {};

  for (const [filterKey, wordKey] of Object.entries(entryPositions)) {
    const normalized = String(wordKey || "").trim().toLowerCase();
    if (normalized !== wordKey) changed = true;
    next[filterKey] = normalized || wordKey;
  }

  return changed ? next : entryPositions;
}

export const PHRASE_PRIORITY_FILTERS = [
  {
    title: "口语模板",
    desc: "Part 1/2/3 可直接替换进回答的表达。",
    filter: { type: "ielts", value: "Speaking" }
  },
  {
    title: "写作高频",
    desc: "Task 1/Task 2 和书信里可复用的表达。",
    filter: { type: "ielts", value: "Writing" }
  },
  {
    title: "Task 2 论证",
    desc: "观点、原因、让步、总结等作文骨架短语。",
    filter: { type: "ielts", value: "Task 2" }
  },
  {
    title: "G类书信",
    desc: "投诉、申请、预约、感谢、解释等书信场景。",
    filter: { type: "ielts", value: "G类书信" }
  },
  {
    title: "听读短语",
    desc: "听力和阅读里常见的搭配与替换表达。",
    filter: { type: "ielts", value: "Listening" }
  }
];

export function phraseFilterKey(filter = { type: "all", value: "" }) {
  return `${filter.type}::${filter.value || ""}`;
}

export function getPhraseStatus(entry, statusMap = {}) {
  const key = normalizePhraseKey(entry);
  const override = statusMap[key];
  return {
    status: override?.status ?? entry?.status ?? "",
    favorite: Boolean(override?.favorite ?? entry?.favorite)
  };
}

export function phraseMatchesFilter(entry, filter, statusMap = {}) {
  const { status, favorite } = getPhraseStatus(entry, statusMap);
  const type = filter?.type || "all";
  const value = filter?.value || "";

  if (type === "all") {
    return status !== PHRASE_STUDY_STATUS.FAMILIAR;
  }

  if (type === "everything") {
    return true;
  }

  if (type === "status") {
    if (value === PHRASE_FILTER_STATUS.FAVORITE) return favorite;
    return status === normalizePhraseStatusValue(value);
  }

  if (type === "ielts") {
    return Array.isArray(entry?.ieltsUse) && entry.ieltsUse.includes(value);
  }

  if (type === "topic") {
    return Array.isArray(entry?.topics) && entry.topics.includes(value);
  }

  if (type === "difficulty") {
    return String(entry?.difficulty || "") === value;
  }

  return true;
}

export function collectPhraseFilterOptions(phrases = []) {
  const ieltsUse = new Set();
  const topics = new Set();
  const difficulties = new Set();

  phrases.forEach((entry) => {
    (entry?.ieltsUse || []).forEach((v) => ieltsUse.add(v));
    (entry?.topics || []).forEach((v) => topics.add(v));
    if (entry?.difficulty) difficulties.add(entry.difficulty);
  });

  return {
    ieltsUse: [...ieltsUse].sort(),
    topics: [...topics].sort(),
    difficulties: [...difficulties].sort()
  };
}

export function buildPhraseStudyList(phrases = [], filter, statusMap = {}) {
  return phrases
    .map((entry, originalIndex) => ({ entry, originalIndex }))
    .filter(({ entry }) => phraseMatchesFilter(entry, filter, statusMap));
}

export function getPhraseFilterLabel(filter = { type: "all", value: "" }) {
  const type = filter?.type || "all";
  const value = filter?.value || "";

  if (type === "all") return "全部待学词组";
  if (type === "everything") return "全部词组";
  if (type === "status") return value || "状态";
  if (type === "ielts") return `IELTS · ${value}`;
  if (type === "topic") return `主题 · ${value}`;
  if (type === "difficulty") return `难度 · ${value}`;
  return "词组";
}
