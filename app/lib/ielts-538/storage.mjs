import {
  IELTS_538_DAILY_KEY,
  IELTS_538_POSITIONS_KEY,
  IELTS_538_SESSION_KEY,
  IELTS_538_STATUS_KEY
} from "./keys.mjs";
import { getIelts538ProgressKey } from "./load-ielts-538.mjs";

function safeGet(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key, value) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const IELTS_538_STATUS = {
  PENDING: "",
  UNFAMILIAR: "不熟",
  FAMILIAR: "熟悉"
};

export function readIelts538StatusMap() {
  const raw = safeGet(IELTS_538_STATUS_KEY, {});
  return raw && typeof raw === "object" ? raw : {};
}

export function writeIelts538StatusMap(map) {
  return safeSet(IELTS_538_STATUS_KEY, map && typeof map === "object" ? map : {});
}

export function getIelts538WordStatus(word, statusMap = {}) {
  const entry = statusMap[getIelts538ProgressKey(word)];
  if (!entry) return IELTS_538_STATUS.PENDING;
  if (typeof entry === "string") return entry;
  return entry.status || IELTS_538_STATUS.PENDING;
}

export function isIelts538Favorite(word, statusMap = {}) {
  const entry = statusMap[getIelts538ProgressKey(word)];
  return Boolean(entry && typeof entry === "object" && entry.favorite);
}

export function patchIelts538WordStatus(statusMap, word, patch) {
  const key = getIelts538ProgressKey(word);
  if (!key) return statusMap;
  const previous = statusMap[key];
  const base = typeof previous === "string"
    ? { status: previous, favorite: false }
    : previous && typeof previous === "object"
      ? { status: previous.status || "", favorite: Boolean(previous.favorite) }
      : { status: "", favorite: false };

  return {
    ...statusMap,
    [key]: {
      status: patch.status !== undefined ? patch.status : base.status,
      favorite: patch.favorite !== undefined ? Boolean(patch.favorite) : base.favorite
    }
  };
}

export function readIelts538Session() {
  const raw = safeGet(IELTS_538_SESSION_KEY, null);
  return raw && typeof raw === "object" ? raw : null;
}

export function writeIelts538Session(payload) {
  return safeSet(IELTS_538_SESSION_KEY, payload && typeof payload === "object" ? payload : null);
}

export function readIelts538Positions() {
  const raw = safeGet(IELTS_538_POSITIONS_KEY, {});
  return raw && typeof raw === "object" ? raw : {};
}

export function writeIelts538Positions(map) {
  return safeSet(IELTS_538_POSITIONS_KEY, map && typeof map === "object" ? map : {});
}

export function readIelts538DailyCount() {
  const raw = safeGet(IELTS_538_DAILY_KEY, null);
  const today = new Date().toISOString().slice(0, 10);
  if (!raw || raw.date !== today) return 0;
  return Number(raw.count) || 0;
}

export function writeIelts538DailyCount(count) {
  return safeSet(IELTS_538_DAILY_KEY, {
    date: new Date().toISOString().slice(0, 10),
    count: Number(count) || 0
  });
}

export function ielts538FilterKey(filter) {
  if (!filter || typeof filter !== "object") return "all";
  if (filter.type === "all" || filter.type === "everything") return filter.type;
  return `${filter.type}:${filter.value || ""}`;
}

export function wordMatchesIelts538Filter(word, filter, statusMap) {
  const status = getIelts538WordStatus(word, statusMap);
  const favorite = isIelts538Favorite(word, statusMap);
  if (filter.type === "everything") return true;

  if (filter.type === "status") {
    if (filter.value === "不熟") return status === IELTS_538_STATUS.UNFAMILIAR;
    if (filter.value === "熟悉") return status === IELTS_538_STATUS.FAMILIAR;
    if (filter.value === "收藏") return favorite && status !== IELTS_538_STATUS.FAMILIAR;
  }

  if (status === IELTS_538_STATUS.FAMILIAR) return false;
  if (filter.type === "category") return word.category === filter.value;
  if (filter.type === "group") {
    return `${word.sourceCategory}:${word.sourceGroup}` === filter.value;
  }
  return true;
}

export function buildIelts538StudyList(words, filter, statusMap) {
  return words.reduce((list, entry, originalIndex) => {
    if (wordMatchesIelts538Filter(entry, filter, statusMap)) {
      list.push({ entry, originalIndex });
    }
    return list;
  }, []);
}

export function getIelts538FilterLabel(filter) {
  if (filter.type === "all") return "全部待学";
  if (filter.type === "everything") return "全部 376 词";
  if (filter.type === "status" && filter.value === "不熟") return "不熟词";
  if (filter.type === "status" && filter.value === "熟悉") return "熟悉词";
  if (filter.type === "status" && filter.value === "收藏") return "收藏词";
  if (filter.type === "category") return filter.value;
  if (filter.type === "group") {
    const [category, group] = String(filter.value).split(":");
    return `第${category}类 · 第${group}组`;
  }
  return "538考点";
}

export const IELTS_538_LEARNING_ENTRIES = [
  {
    group: "今天优先",
    items: [
      { title: "全部待学", desc: "未标记熟悉的 538 考点词。", filter: { type: "all", value: "" } },
      { title: "不熟词", desc: "已标记不熟，优先复习。", filter: { type: "status", value: "不熟" } },
      { title: "收藏词", desc: "收藏的重点词。", filter: { type: "status", value: "收藏" } },
      { title: "全部 376 词", desc: "包含熟悉词的完整独立词库。", filter: { type: "everything", value: "" } }
    ]
  },
  {
    group: "按原书分组",
    items: [
      { title: "第1类 · 第1组", desc: "原网页第 1 类考点词。", filter: { type: "group", value: "1:1" } },
      { title: "第2类 · 第1组", desc: "原网页第 2 类考点词。", filter: { type: "group", value: "2:1" } },
      { title: "第2类 · 第2组", desc: "原网页第 2 类考点词。", filter: { type: "group", value: "2:2" } },
      { title: "第3类 · 第1组", desc: "原网页第 3 类考点词。", filter: { type: "group", value: "3:1" } },
      { title: "第3类 · 第2组", desc: "原网页第 3 类考点词。", filter: { type: "group", value: "3:2" } },
      { title: "第3类 · 第3组", desc: "原网页第 3 类考点词。", filter: { type: "group", value: "3:3" } },
      { title: "第3类 · 第4组", desc: "原网页第 3 类考点词。", filter: { type: "group", value: "3:4" } },
      { title: "第3类 · 第5组", desc: "原网页第 3 类考点词。", filter: { type: "group", value: "3:5" } }
    ]
  }
];
