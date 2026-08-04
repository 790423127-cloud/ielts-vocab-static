import {
  READING_G_DAILY_KEY,
  READING_G_PARA_COVERAGE_KEY,
  READING_G_PARA_REVIEW_KEY,
  READING_G_PARA_SESSION_KEY,
  READING_G_PARAPHRASE_STATUS_KEY,
  READING_G_POSITIONS_KEY,
  READING_G_SESSION_KEY,
  READING_G_STATUS_KEY,
  PROGRESS_SCHEMA_VERSION
} from "./keys.mjs";
import { emptyCoverageState, normalizeCoverageState } from "./paraphrase-cycle.mjs";
import { emptyParaphraseReviewState, normalizeParaphraseReviewState } from "./paraphrase-review.mjs";
import { normalizeParaphraseSession } from "./paraphrase-session.mjs";
import { itemMatchesPathStage } from "./stages.mjs";
import { normalizeReadingGKey } from "./normalize.mjs";
import {
  isReadingGContentComplete,
  isReadingGContentIncomplete
} from "./content-completeness.mjs";
import { isInflectedReferenceWord } from "../vocab/word-study-eligibility.mjs";

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

function safeRemove(key) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export const RG_STATUS = {
  PENDING: "",
  UNFAMILIAR: "不熟",
  FAMILIAR: "熟悉"
};

export const RG_LEARN_MODE = {
  MEANING: "meaning",
  PHRASE: "phrase",
  PARAPHRASE: "paraphrase"
};

function emptyStatusEntry() {
  return {
    meaningStatus: "unlearned",
    phraseStatus: "unlearned",
    paraphraseStatus: "unlearned",
    status: "",
    favorite: false
  };
}

function legacyUiStatus(code) {
  if (code === "familiar") return RG_STATUS.FAMILIAR;
  if (code === "unfamiliar") return RG_STATUS.UNFAMILIAR;
  return RG_STATUS.PENDING;
}

function codeFromUi(status) {
  if (status === RG_STATUS.FAMILIAR) return "familiar";
  if (status === RG_STATUS.UNFAMILIAR) return "unfamiliar";
  return "unlearned";
}

export function normalizeStatusEntry(entry) {
  if (!entry) return emptyStatusEntry();
  if (typeof entry === "string") {
    return {
      meaningStatus:
        entry === "熟悉" ? "familiar" : entry === "不熟" ? "unfamiliar" : "unlearned",
      phraseStatus: "unlearned",
      paraphraseStatus: "unlearned",
      status: entry,
      favorite: false
    };
  }
  const status = entry.status || "";
  return {
    meaningStatus:
      entry.meaningStatus ||
      (status === "熟悉" ? "familiar" : status === "不熟" ? "unfamiliar" : "unlearned"),
    phraseStatus: entry.phraseStatus || "unlearned",
    paraphraseStatus: entry.paraphraseStatus || "unlearned",
    status,
    favorite: Boolean(entry.favorite)
  };
}

/**
 * Stable progress key for a vocab entry.
 * Prefer id; else entryType::normalizedKey.
 */
export function getEntryProgressKey(item) {
  if (!item) return "";
  if (item.id && String(item.id).trim()) return String(item.id).trim();
  const entryType =
    item.entryType === "phrase" || /\s/.test(String(item.word || "")) ? "phrase" : "word";
  const nk = normalizeReadingGKey(item.normalizedKey || item.word || "");
  if (!nk) return "";
  return `${entryType}::${nk}`;
}

/** Resolve mode for status read/write */
export function resolveLearnMode(mode, item, filter) {
  if (mode === RG_LEARN_MODE.PARAPHRASE || filter?.type === "paraphrase" || filter?.type === "paraphraseQuiz") {
    return RG_LEARN_MODE.PARAPHRASE;
  }
  if (mode === RG_LEARN_MODE.PHRASE || filter?.type === "entryType" && filter?.value === "phrase") {
    return RG_LEARN_MODE.PHRASE;
  }
  if (mode === RG_LEARN_MODE.MEANING) return RG_LEARN_MODE.MEANING;
  if (item?.entryType === "phrase" || /\s/.test(String(item?.word || ""))) {
    return RG_LEARN_MODE.PHRASE;
  }
  return RG_LEARN_MODE.MEANING;
}

/**
 * Normalize stored status map into flat entries keyed by stable key.
 * Supports:
 * - v4 { progressSchemaVersion, entries }
 * - flat map keyed by id / entryType::key / normalized word
 */
export function normalizeStatusMap(raw) {
  if (!raw || typeof raw !== "object") return {};
  if (raw.entries && typeof raw.entries === "object") {
    const out = {};
    for (const [k, v] of Object.entries(raw.entries)) {
      out[k] = normalizeStatusEntry(v);
    }
    return out;
  }
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "progressSchemaVersion" || k === "paraphrases") continue;
    out[k] = normalizeStatusEntry(v);
  }
  return out;
}

export function serializeStatusMap(flatEntries, paraphrases = null) {
  const payload = {
    progressSchemaVersion: PROGRESS_SCHEMA_VERSION,
    entries: flatEntries && typeof flatEntries === "object" ? flatEntries : {}
  };
  if (paraphrases && typeof paraphrases === "object") {
    payload.paraphrases = paraphrases;
  }
  return payload;
}

export function readRgStatusMap() {
  const raw = safeGet(READING_G_STATUS_KEY, {});
  return normalizeStatusMap(raw);
}

export function writeRgStatusMap(map, paraphrases = null) {
  const flat = normalizeStatusMap(map);
  // also merge separate paraphrase key if not provided
  let para = paraphrases;
  if (!para) {
    const existing = safeGet(READING_G_STATUS_KEY, {});
    if (existing?.paraphrases) para = existing.paraphrases;
  }
  return safeSet(READING_G_STATUS_KEY, serializeStatusMap(flat, para));
}

function lookupEntry(statusMap, item) {
  const flat = normalizeStatusMap(statusMap);
  const stable = getEntryProgressKey(item);
  if (stable && flat[stable]) return flat[stable];
  const nk = normalizeReadingGKey(item?.normalizedKey || item?.word || "");
  if (nk && flat[nk]) return flat[nk];
  const entryType =
    item?.entryType === "phrase" || /\s/.test(String(item?.word || "")) ? "phrase" : "word";
  const mk = `${entryType}::${nk}`;
  if (flat[mk]) return flat[mk];
  if (item?.id && flat[item.id]) return flat[item.id];
  return emptyStatusEntry();
}

/**
 * UI status for current learn mode.
 */
export function getRgStatus(item, statusMap = {}, mode = RG_LEARN_MODE.MEANING) {
  const entry = lookupEntry(statusMap, item);
  if (mode === RG_LEARN_MODE.PHRASE) return legacyUiStatus(entry.phraseStatus);
  if (mode === RG_LEARN_MODE.PARAPHRASE) return legacyUiStatus(entry.paraphraseStatus);
  // meaning
  if (entry.status) return entry.status;
  return legacyUiStatus(entry.meaningStatus);
}

export function getModeStatusCode(item, statusMap = {}, mode = RG_LEARN_MODE.MEANING) {
  const entry = lookupEntry(statusMap, item);
  if (mode === RG_LEARN_MODE.PHRASE) return entry.phraseStatus || "unlearned";
  if (mode === RG_LEARN_MODE.PARAPHRASE) return entry.paraphraseStatus || "unlearned";
  return entry.meaningStatus || "unlearned";
}

export function isRgFavorite(item, statusMap = {}) {
  return Boolean(lookupEntry(statusMap, item).favorite);
}

/**
 * Patch only the fields for the active mode.
 * never writes all three statuses from one legacy status unless mode is meaning.
 */
export function patchRgStatus(statusMap, item, patch, mode = RG_LEARN_MODE.MEANING) {
  const key = getEntryProgressKey(item);
  if (!key) return normalizeStatusMap(statusMap);

  const flat = normalizeStatusMap(statusMap);
  const base = normalizeStatusEntry(flat[key] || lookupEntry(statusMap, item));
  const next = { ...base };

  if (patch.favorite !== undefined) next.favorite = Boolean(patch.favorite);

  // explicit field patches
  if (patch.meaningStatus !== undefined) {
    next.meaningStatus = patch.meaningStatus;
    next.status = legacyUiStatus(patch.meaningStatus);
  }
  if (patch.phraseStatus !== undefined) next.phraseStatus = patch.phraseStatus;
  if (patch.paraphraseStatus !== undefined) next.paraphraseStatus = patch.paraphraseStatus;

  // legacy UI buttons: status familiar/unfamiliar → only current mode field
  if (patch.status !== undefined) {
    const code = codeFromUi(patch.status);
    if (mode === RG_LEARN_MODE.PHRASE) {
      next.phraseStatus = code;
    } else if (mode === RG_LEARN_MODE.PARAPHRASE) {
      next.paraphraseStatus = code;
    } else {
      next.meaningStatus = code;
      next.status = patch.status;
    }
  }

  return {
    ...flat,
    [key]: next
  };
}

export function countStatusByMode(items, statusMap) {
  let meaningFamiliar = 0;
  let phraseFamiliar = 0;
  let meaningUnfamiliar = 0;
  let phraseUnfamiliar = 0;
  for (const it of items || []) {
    const e = lookupEntry(statusMap, it);
    if (e.meaningStatus === "familiar") meaningFamiliar += 1;
    if (e.meaningStatus === "unfamiliar") meaningUnfamiliar += 1;
    if (e.phraseStatus === "familiar") phraseFamiliar += 1;
    if (e.phraseStatus === "unfamiliar") phraseUnfamiliar += 1;
  }
  return { meaningFamiliar, phraseFamiliar, meaningUnfamiliar, phraseUnfamiliar };
}

// ——— paraphrase group status (by groupId) ———

export function readRgParaphraseStatusMap() {
  // prefer nested in status payload
  const rawStatus = safeGet(READING_G_STATUS_KEY, {});
  if (rawStatus?.paraphrases && typeof rawStatus.paraphrases === "object") {
    return rawStatus.paraphrases;
  }
  const raw = safeGet(READING_G_PARAPHRASE_STATUS_KEY, {});
  return raw && typeof raw === "object" ? raw : {};
}

export function writeRgParaphraseStatusMap(map) {
  const para = map && typeof map === "object" ? map : {};
  safeSet(READING_G_PARAPHRASE_STATUS_KEY, para);
  // also nest into status payload
  const flat = readRgStatusMap();
  return safeSet(READING_G_STATUS_KEY, serializeStatusMap(flat, para));
}

export function readRgParaCoverage() {
  const raw = safeGet(READING_G_PARA_COVERAGE_KEY, null);
  return normalizeCoverageState(raw);
}

export function writeRgParaCoverage(coverage) {
  const next = normalizeCoverageState(coverage);
  return safeSet(READING_G_PARA_COVERAGE_KEY, next || emptyCoverageState());
}

export function readRgParaphraseReview() {
  return normalizeParaphraseReviewState(safeGet(READING_G_PARA_REVIEW_KEY, null));
}

export function writeRgParaphraseReview(review) {
  return safeSet(READING_G_PARA_REVIEW_KEY, normalizeParaphraseReviewState(review) || emptyParaphraseReviewState());
}

export function readRgParaphraseSession() {
  return normalizeParaphraseSession(safeGet(READING_G_PARA_SESSION_KEY, null));
}

export function writeRgParaphraseSession(session) {
  const normalized = normalizeParaphraseSession(session);
  if (!normalized) return safeRemove(READING_G_PARA_SESSION_KEY);
  return safeSet(READING_G_PARA_SESSION_KEY, normalized);
}

export function clearRgParaphraseSession() {
  return safeRemove(READING_G_PARA_SESSION_KEY);
}

export function getParaphraseStatus(groupId, paraMap = {}) {
  if (!groupId) return "unlearned";
  const e = paraMap[groupId];
  if (!e) return "unlearned";
  if (typeof e === "string") return e;
  if (e.paraphraseStatus) return e.paraphraseStatus;
  if (e.mastered === true) return "familiar";
  if (e.mastered === false) return "unfamiliar";
  return "unlearned";
}

export function patchParaphraseStatus(paraMap, groupId, statusCode) {
  if (!groupId) return paraMap;
  return {
    ...paraMap,
    [groupId]: {
      paraphraseStatus: statusCode,
      mastered: statusCode === "familiar",
      at: new Date().toISOString()
    }
  };
}

export function countParaphraseStatus(paraMap = {}) {
  let familiar = 0;
  let unfamiliar = 0;
  let unlearned = 0;
  for (const id of Object.keys(paraMap || {})) {
    const s = getParaphraseStatus(id, paraMap);
    if (s === "familiar") familiar += 1;
    else if (s === "unfamiliar") unfamiliar += 1;
    else unlearned += 1;
  }
  return { familiar, unfamiliar, unlearned };
}

export function readRgSession() {
  const raw = safeGet(READING_G_SESSION_KEY, null);
  return raw && typeof raw === "object" ? raw : null;
}

export function writeRgSession(payload) {
  return safeSet(READING_G_SESSION_KEY, payload && typeof payload === "object" ? payload : null);
}

export function readRgPositions() {
  const raw = safeGet(READING_G_POSITIONS_KEY, {});
  return raw && typeof raw === "object" ? raw : {};
}

export function writeRgPositions(map) {
  return safeSet(READING_G_POSITIONS_KEY, map && typeof map === "object" ? map : {});
}

export function readRgDailyCount() {
  const raw = safeGet(READING_G_DAILY_KEY, null);
  const today = new Date().toISOString().slice(0, 10);
  if (!raw || raw.date !== today) return 0;
  return Number(raw.count) || 0;
}

export function writeRgDailyCount(count) {
  return safeSet(READING_G_DAILY_KEY, {
    date: new Date().toISOString().slice(0, 10),
    count: Number(count) || 0
  });
}

export function filterKey(filter) {
  if (!filter || typeof filter !== "object") return "stage1";
  if (filter.type === "all") return "all";
  if (filter.type === "everything") return "everything";
  if (filter.type === "stage1") return "stage1";
  if (filter.type === "pathStage") return `pathStage:${filter.value || ""}`;
  if (filter.type === "active") return "active";
  if (filter.type === "reference") return "reference";
  if (filter.type === "paraphrase") return "paraphrase";
  if (filter.type === "paraphraseQuiz") return "paraphraseQuiz";
  if (filter.type === "learnMode") return `learnMode:${filter.value || ""}`;
  return `${filter.type}:${filter.value || ""}`;
}

/**
 * @param {object} filter
 * @param {object} statusMap
 * @param {string} [learnMode] current mode for status filters
 */
export function itemMatchesRgFilter(item, filter, statusMap, learnMode = RG_LEARN_MODE.MEANING) {
  if (isInflectedReferenceWord(item)) return false;
  const mode = resolveLearnMode(learnMode, item, filter);
  const status = getRgStatus(item, statusMap, mode);
  const favorite = isRgFavorite(item, statusMap);
  const layers = Array.isArray(item.layers) ? item.layers : [];

  if (!filter || typeof filter !== "object") {
    filter = { type: "stage1", value: "" };
  }

  if (filter.type === "everything") return true;

  if (filter.type === "contentIncomplete") {
    return isReadingGContentIncomplete(item);
  }
  if (filter.type === "questionBankComplete") {
    return item.primaryLayer === "questionBankActive" && isReadingGContentComplete(item);
  }

  if (filter.type === "status") {
    if (filter.value === "不熟") return status === RG_STATUS.UNFAMILIAR;
    if (filter.value === "熟悉") return status === RG_STATUS.FAMILIAR;
    if (filter.value === "收藏") return favorite && status !== RG_STATUS.FAMILIAR;
  }

  // default study queues hide familiar for current mode
  if (
    status === RG_STATUS.FAMILIAR &&
    filter.type !== "status" &&
    filter.type !== "everything" &&
    filter.type !== "paraphrase" &&
    filter.type !== "paraphraseQuiz" &&
    filter.type !== "reference" &&
    filter.type !== "primaryLayer" &&
    !(filter.type === "pathStage" && filter.value === "4")
  ) {
    return false;
  }

  if (filter.type === "active") return item.studyMode === "active";
  if (filter.type === "reference") return item.studyMode === "reference";
  if (filter.type === "stage1" || (filter.type === "pathStage" && filter.value === "1")) {
    return itemMatchesPathStage(item, "1");
  }
  if (filter.type === "pathStage") {
    return itemMatchesPathStage(item, filter.value);
  }
  if (filter.type === "learnMode") {
    if (filter.value === "meaning") {
      return item.studyMode === "active" && item.entryType !== "phrase" && !/\s/.test(item.word || "");
    }
    if (filter.value === "phrase") {
      return item.studyMode === "active" && (item.entryType === "phrase" || /\s/.test(item.word || ""));
    }
    return false;
  }
  if (filter.type === "layer") return layers.includes(filter.value);
  if (filter.type === "primaryLayer") return item.primaryLayer === filter.value;
  if (filter.type === "entryType") return item.entryType === filter.value;
  if (filter.type === "domain") return item.domain === filter.value;
  if (filter.type === "topic") return Array.isArray(item.topics) && item.topics.includes(filter.value);
  if (filter.type === "difficulty") return item.difficulty === filter.value;
  if (filter.type === "all") return item.studyMode === "active";

  return item.studyMode === "active";
}

export function buildRgStudyList(items, filter, statusMap, learnMode = RG_LEARN_MODE.MEANING) {
  const list = [];
  for (let i = 0; i < items.length; i += 1) {
    if (itemMatchesRgFilter(items[i], filter, statusMap, learnMode)) {
      list.push({ entry: items[i], originalIndex: i });
    }
  }
  return list;
}

export function getRgFilterLabel(filter) {
  if (!filter) return "阶段1：基础保分";
  if (filter.type === "stage1" || (filter.type === "pathStage" && filter.value === "1")) {
    return "阶段1：基础保分";
  }
  if (filter.type === "pathStage" && filter.value === "2") return "阶段2：扩大覆盖";
  if (filter.type === "pathStage" && filter.value === "3") return "阶段3：真题强化";
  if (filter.type === "pathStage" && filter.value === "4") return "阶段4：参考查阅";
  if (filter.type === "active") return "默认待学（全部active）";
  if (filter.type === "reference") return "参考701（查阅）";
  if (filter.type === "all") return "全部待学（active）";
  if (filter.type === "everything") return "全部（含参考）";
  if (filter.type === "paraphrase") return "真题高可信同义300";
  if (filter.type === "paraphraseQuiz") return "同义替换训练";
  if (filter.type === "learnMode" && filter.value === "meaning") return "词义学习";
  if (filter.type === "learnMode" && filter.value === "phrase") return "短语学习";
  if (filter.type === "status" && filter.value === "不熟") return "不熟";
  if (filter.type === "status" && filter.value === "熟悉") return "熟悉";
  if (filter.type === "status" && filter.value === "收藏") return "收藏";
  if (filter.type === "entryType" && filter.value === "word") return "仅单词";
  if (filter.type === "entryType" && filter.value === "phrase") return "仅词组";
  if (filter.type === "primaryLayer" && filter.value === "questionBankActive") {
    return "新增完整词（独立词条）";
  }
  if (filter.type === "questionBankComplete") {
    return "新增完整词（按实际字段）";
  }
  if (filter.type === "contentIncomplete") {
    return "待补词（按实际字段）";
  }
  if (filter.type === "primaryLayer" && filter.value === "questionBankPending") {
    return "待补词（独立词条）";
  }
  if (filter.type === "layer") {
    const map = {
      priority1500: "优先核心1500",
      answerCore250: "答案词强化250",
      logic120: "逻辑连接120",
      phrases400: "高频词组400",
      tierB1200: "B层1200",
      paraCore600: "表达识别核心",
      tierC800: "C层800",
      paraExt500: "表达识别扩展",
      reference701: "参考701",
      questionBankActive: "全题库补充（已有资料）",
      questionBankAiCompleted: "全题库补充（AI已补全）",
      questionBankPending: "全题库待补资料"
    };
    return map[filter.value] || `层：${filter.value}`;
  }
  if (filter.type === "domain") return `领域：${filter.value}`;
  if (filter.type === "topic") return `主题：${filter.value}`;
  return "G类阅读提升";
}

export const RG_LEARNING_ENTRIES = [
  {
    group: "常用入口",
    items: [
      {
        title: "阶段1：主线保分",
        desc: "优先核心、答案词、逻辑词与前200词组",
        filter: { type: "pathStage", value: "1" }
      },
      {
        title: "全部待学",
        desc: "所有可刷 active 词条",
        filter: { type: "active", value: "" }
      },
      {
        title: "不熟复习",
        desc: "优先回收标记为不熟的内容",
        filter: { type: "status", value: "不熟" }
      },
      {
        title: "收藏重点",
        desc: "只看手动收藏的词条",
        filter: { type: "status", value: "收藏" }
      }
    ]
  },
  {
    group: "训练方式",
    items: [
      {
        title: "词义学习",
        desc: "单词释义主训练",
        filter: { type: "learnMode", value: "meaning" }
      },
      {
        title: "短语学习",
        desc: "固定搭配与短语",
        filter: { type: "learnMode", value: "phrase" }
      },
      {
        title: "同义引导·10组",
        desc: "预览→回忆→四选一",
        filter: { type: "paraphraseQuiz", value: "", sessionMode: "guided" }
      },
      {
        title: "同义测验·20题",
        desc: "快速检查掌握度",
        filter: { type: "paraphraseQuiz", value: "", sessionMode: "quick" }
      }
    ]
  },
  {
    group: "阶段路线",
    items: [
      {
        title: "阶段1：基础保分",
        desc: "先把高收益词吃稳",
        filter: { type: "pathStage", value: "1" }
      },
      {
        title: "阶段2：扩大覆盖",
        desc: "阶段1之外的B层与后200词组",
        filter: { type: "pathStage", value: "2" }
      },
      {
        title: "阶段3：真题强化",
        desc: "前两阶段之外的全部可学习词",
        filter: { type: "pathStage", value: "3" }
      },
      {
        title: "阶段4：参考查阅",
        desc: "仅参考词，只查阅不打断主线",
        filter: { type: "pathStage", value: "4" }
      }
    ]
  }
];
