import {
  BASIC_FLASH_DAILY_KEY,
  BASIC_FLASH_POSITIONS_KEY,
  BASIC_FLASH_SESSION_KEY,
  BASIC_FLASH_STATUS_KEY
} from "./keys.mjs";
import { normalizeBasicWordKey } from "./load-basic-words.mjs";
import { isBrushableWord } from "../vocab/word-study-eligibility.mjs";

function safeGet(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
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

export const BASIC_STATUS = {
  PENDING: "",
  UNFAMILIAR: "不熟",
  FAMILIAR: "熟悉"
};

export function readBasicStatusMap() {
  const raw = safeGet(BASIC_FLASH_STATUS_KEY, {});
  return raw && typeof raw === "object" ? raw : {};
}

export function writeBasicStatusMap(map) {
  return safeSet(BASIC_FLASH_STATUS_KEY, map && typeof map === "object" ? map : {});
}

export function getBasicWordStatus(word, statusMap = {}) {
  const key = normalizeBasicWordKey(word?.word || word);
  if (!key) return BASIC_STATUS.PENDING;
  const entry = statusMap[key];
  if (!entry) return BASIC_STATUS.PENDING;
  if (typeof entry === "string") return entry;
  return entry.status || BASIC_STATUS.PENDING;
}

export function isBasicFavorite(word, statusMap = {}) {
  const key = normalizeBasicWordKey(word?.word || word);
  if (!key) return false;
  const entry = statusMap[key];
  if (!entry || typeof entry === "string") return false;
  return Boolean(entry.favorite);
}

export function patchBasicWordStatus(statusMap, word, patch) {
  const key = normalizeBasicWordKey(word?.word || word);
  if (!key) return statusMap;

  const prev = statusMap[key];
  const base =
    typeof prev === "string"
      ? { status: prev, favorite: false }
      : prev && typeof prev === "object"
        ? { status: prev.status || "", favorite: Boolean(prev.favorite) }
        : { status: "", favorite: false };

  return {
    ...statusMap,
    [key]: {
      status: patch.status !== undefined ? patch.status : base.status,
      favorite: patch.favorite !== undefined ? Boolean(patch.favorite) : base.favorite
    }
  };
}

export function readBasicSession() {
  const raw = safeGet(BASIC_FLASH_SESSION_KEY, null);
  return raw && typeof raw === "object" ? raw : null;
}

export function writeBasicSession(payload) {
  return safeSet(BASIC_FLASH_SESSION_KEY, payload && typeof payload === "object" ? payload : null);
}

export function readBasicPositions() {
  const raw = safeGet(BASIC_FLASH_POSITIONS_KEY, {});
  return raw && typeof raw === "object" ? raw : {};
}

export function writeBasicPositions(map) {
  return safeSet(BASIC_FLASH_POSITIONS_KEY, map && typeof map === "object" ? map : {});
}

export function readBasicDailyCount() {
  const raw = safeGet(BASIC_FLASH_DAILY_KEY, null);
  const today = new Date().toISOString().slice(0, 10);
  if (!raw || raw.date !== today) return 0;
  return Number(raw.count) || 0;
}

export function writeBasicDailyCount(count) {
  return safeSet(BASIC_FLASH_DAILY_KEY, {
    date: new Date().toISOString().slice(0, 10),
    count: Number(count) || 0
  });
}

export function filterKey(filter) {
  if (!filter || typeof filter !== "object") return "all";
  if (filter.type === "all") return "all";
  if (filter.type === "everything") return "everything";
  return `${filter.type}:${filter.value || ""}`;
}

export function wordMatchesBasicFilter(word, filter, statusMap) {
  if (!isBrushableWord(word)) return false;
  const status = getBasicWordStatus(word, statusMap);
  const favorite = isBasicFavorite(word, statusMap);

  if (filter.type === "everything") return true;

  if (filter.type === "status") {
    if (filter.value === "不熟") return status === BASIC_STATUS.UNFAMILIAR;
    if (filter.value === "熟悉") return status === BASIC_STATUS.FAMILIAR;
    if (filter.value === "收藏") return favorite && status !== BASIC_STATUS.FAMILIAR;
  }

  if (status === BASIC_STATUS.FAMILIAR) return false;

  if (filter.type === "topic") return Array.isArray(word.topics) && word.topics.includes(filter.value);
  if (filter.type === "ielts") return Array.isArray(word.ieltsUse) && word.ieltsUse.includes(filter.value);

  // default: all pending / non-familiar
  return true;
}

export function buildBasicStudyList(words, filter, statusMap) {
  const list = [];
  for (let i = 0; i < words.length; i += 1) {
    if (wordMatchesBasicFilter(words[i], filter, statusMap)) {
      list.push({ entry: words[i], originalIndex: i });
    }
  }
  return list;
}

export function getBasicFilterLabel(filter) {
  if (filter.type === "all") return "全部待学";
  if (filter.type === "everything") return "全部零基础词";
  if (filter.type === "status" && filter.value === "不熟") return "不熟词";
  if (filter.type === "status" && filter.value === "熟悉") return "熟悉词";
  if (filter.type === "status" && filter.value === "收藏") return "收藏词";
  if (filter.type === "topic") return `主题：${filter.value}`;
  if (filter.type === "ielts") return `用途：${filter.value}`;
  return "零基础词库";
}

export const BASIC_LEARNING_ENTRIES = [
  {
    group: "今天优先",
    items: [
      { title: "全部待学", desc: "零基础词库中未标记熟悉的词。", filter: { type: "all", value: "" } },
      { title: "不熟词", desc: "已标记不熟，优先复习。", filter: { type: "status", value: "不熟" } },
      { title: "收藏词", desc: "收藏的启蒙重点词。", filter: { type: "status", value: "收藏" } },
      { title: "全部零基础词", desc: "含熟悉词在内的完整独立词库。", filter: { type: "everything", value: "" } }
    ]
  },
  {
    group: "按主题学",
    items: [
      { title: "问候礼貌", desc: "hello / please / thank you 等。", filter: { type: "topic", value: "问候" } },
      { title: "人称指示", desc: "I / you / this / that 等。", filter: { type: "topic", value: "人称" } },
      { title: "数字", desc: "one 到 hundred、序数。", filter: { type: "topic", value: "数字" } },
      { title: "颜色", desc: "red / blue / green 等。", filter: { type: "topic", value: "颜色" } },
      { title: "时间星期", desc: "day / Monday / morning 等。", filter: { type: "topic", value: "时间" } },
      { title: "家庭人物", desc: "family / mother / friend 等。", filter: { type: "topic", value: "家庭" } },
      { title: "身体", desc: "head / hand / eye 等。", filter: { type: "topic", value: "身体" } },
      { title: "学校学习", desc: "school / book / teacher 等。", filter: { type: "topic", value: "学校" } },
      { title: "家与物品", desc: "home / door / phone 等。", filter: { type: "topic", value: "家" } },
      { title: "食物饮料", desc: "water / apple / rice 等。", filter: { type: "topic", value: "食物" } },
      { title: "衣服", desc: "shirt / shoes / wear 等。", filter: { type: "topic", value: "衣服" } },
      { title: "地点交通", desc: "school / bus / left 等。", filter: { type: "topic", value: "地点" } },
      { title: "天气自然", desc: "sun / rain / hot 等。", filter: { type: "topic", value: "天气" } },
      { title: "动物", desc: "dog / cat / panda 等。", filter: { type: "topic", value: "动物" } },
      { title: "常用动词", desc: "go / come / eat / like 等。", filter: { type: "topic", value: "动词" } },
      { title: "介词连接", desc: "in / on / and / because 等。", filter: { type: "topic", value: "介词" } },
      { title: "购物金钱", desc: "buy / price / cash 等。", filter: { type: "topic", value: "购物" } },
      { title: "健康医疗", desc: "doctor / fever / medicine 等。", filter: { type: "topic", value: "健康" } },
      { title: "科技手机", desc: "phone / internet / email 等。", filter: { type: "topic", value: "科技" } },
      { title: "职业工作", desc: "teacher / doctor / job 等。", filter: { type: "topic", value: "职业" } },
      { title: "生存会话", desc: "thank you / how are you 等。", filter: { type: "topic", value: "生存会话" } }
    ]
  }
];
