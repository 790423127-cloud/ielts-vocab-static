import { isBrushableWord } from "./word-study-eligibility.mjs";

export const LEXICON_TIDY_AUDIT_VERSION = 1;
export const LEXICON_TIDY_FILTER_TYPE = "tidy";
export const LEXICON_TIDY_FILTERS = { REVIEW: "review", BASIC: "basic", ISSUES: "issues" };
export const MAX_REMOVABLE_WORD_CANDIDATES = 1500;

const LOW_VALUE_NOUN_HINT = /专名|人名|地名|城市|国家|星期|月份|数字|序数|颜色|动物|食物|衣服|家居|物品|职业|身体|天气|计量|单位/;
const FIRST_TIER_HINT = /问候|礼貌|基础应答|人称|指示|疑问词|数字|序数|星期|月份|颜色|冠词|数量/;
const SECOND_TIER_HINT = /家庭|人物|身体|学校|家|食物|衣服|动物|交通|方向|天气|季节|购物|地点/;

export function normalizeTidyWordKey(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ");
}

export function getTidyAuditKey(word, index = -1) {
  const stableId = String(word?.wordId || word?.id || "").trim();
  if (stableId) return `main:${stableId}`;
  const key = normalizeTidyWordKey(word?.word);
  return key ? `main:word:${key}` : `main:index:${Number.isInteger(index) ? index : "unknown"}`;
}

export function createEmptyLexiconTidyAudit() {
  return { version: LEXICON_TIDY_AUDIT_VERSION, updatedAt: 0, records: {} };
}

export function normalizeLexiconTidyAudit(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    version: LEXICON_TIDY_AUDIT_VERSION,
    updatedAt: Number(source.updatedAt) || 0,
    records: { ...(source.records && typeof source.records === "object" ? source.records : {}) }
  };
}

function isStrictStandaloneHeadword(value) {
  const key = normalizeTidyWordKey(value);
  return Boolean(key && /^[a-z][a-z'-]*$/.test(key));
}

function isLowValueNounCandidate(word) {
  const pos = String(word?.pos || "").trim().toLowerCase();
  const isNoun = /(^|[\s/;,])(proper\s+)?noun\b/.test(pos) || pos.includes("名词");
  if (!isNoun) return false;

  // “低频认识即可”只是学习优先级，不能代表词条没有价值。
  const labels = [word?.category, ...(Array.isArray(word?.topics) ? word.topics : [])].filter(Boolean).join(" ");
  return LOW_VALUE_NOUN_HINT.test(labels);
}

function referenceTier(item) {
  const key = normalizeTidyWordKey(item?.word);
  const labels = [item?.category, item?.pos, ...(Array.isArray(item?.topics) ? item.topics : [])].filter(Boolean).join(" ");
  if (FIRST_TIER_HINT.test(labels) || key.length <= 4) return 0;
  if (SECOND_TIER_HINT.test(labels) || key.length <= 7) return 1;
  return 2;
}

function compareReferenceItems(a, b) {
  return referenceTier(a.item) - referenceTier(b.item)
    || normalizeTidyWordKey(a.item?.word).length - normalizeTidyWordKey(b.item?.word).length
    || a.index - b.index;
}

export function buildRemovableWordKeySet(referenceData, mainWords, limit = MAX_REMOVABLE_WORD_CANDIDATES) {
  const requestedLimit = Number(limit);
  const max = Math.max(0, Math.min(MAX_REMOVABLE_WORD_CANDIDATES, Number.isFinite(requestedLimit) ? requestedLimit : MAX_REMOVABLE_WORD_CANDIDATES));
  const list = (Array.isArray(mainWords) ? mainWords : []).filter(isBrushableWord);
  const mainKeys = new Set(list.map((word) => normalizeTidyWordKey(word?.word)).filter(Boolean));
  const selected = [];
  const seen = new Set();
  const add = (value) => {
    const key = normalizeTidyWordKey(value);
    if (!key || !mainKeys.has(key) || seen.has(key) || selected.length >= max) return;
    seen.add(key);
    selected.push(key);
  };

  const referenceWords = (Array.isArray(referenceData?.words) ? referenceData.words : [])
    .map((item, index) => ({ item, index }))
    .sort(compareReferenceItems);
  for (const { item } of referenceWords) add(item?.word);

  const lowValueNouns = list
    .filter(isLowValueNounCandidate)
    .sort((a, b) => normalizeTidyWordKey(a?.word).length - normalizeTidyWordKey(b?.word).length);
  for (const word of lowValueNouns) add(word?.word);

  return new Set(selected);
}

function reasonLabel(code) {
  if (code === "removable_basic") return "基础常见词或低价值名词";
  if (code === "duplicate_headword") return "主词库里有同名单词";
  if (code === "invalid_headword") return "单词本身含异常字符或不是独立词头";
  return code;
}

export function matchesTidyScope(candidate, scope = LEXICON_TIDY_FILTERS.REVIEW) {
  if (!candidate) return false;
  if (scope === LEXICON_TIDY_FILTERS.BASIC) return candidate.isSimple;
  if (scope === LEXICON_TIDY_FILTERS.ISSUES) return candidate.hasDataIssue;
  return true;
}

export function findTidyCandidate(review, word, index = -1) {
  if (!review || !word) return null;
  return review.candidateByAuditKey?.get(getTidyAuditKey(word, index)) || null;
}

export function sortTidyWordIndices(indices, words, review) {
  const list = Array.isArray(words) ? words : [];
  return [...(Array.isArray(indices) ? indices : [])].sort((left, right) => {
    const leftWord = list[left];
    const rightWord = list[right];
    const leftCandidate = findTidyCandidate(review, leftWord, left);
    const rightCandidate = findTidyCandidate(review, rightWord, right);
    return (leftCandidate?.sortRank ?? Number.MAX_SAFE_INTEGER) - (rightCandidate?.sortRank ?? Number.MAX_SAFE_INTEGER)
      || normalizeTidyWordKey(leftWord?.word).length - normalizeTidyWordKey(rightWord?.word).length
      || normalizeTidyWordKey(leftWord?.word).localeCompare(normalizeTidyWordKey(rightWord?.word))
      || left - right;
  });
}

export function buildLexiconTidyReview(words, options = {}) {
  const list = Array.isArray(words) ? words : [];
  const audit = normalizeLexiconTidyAudit(options.audit);
  const removableKeys = options.removableKeys instanceof Set ? options.removableKeys : new Set();
  const removableRank = new Map([...removableKeys].map((key, rank) => [key, rank]));
  const duplicateCounts = new Map();

  for (const word of list) {
    if (!isBrushableWord(word)) continue;
    const key = normalizeTidyWordKey(word?.word);
    if (key) duplicateCounts.set(key, (duplicateCounts.get(key) || 0) + 1);
  }

  const candidateByIndex = new Map();
  const candidateByAuditKey = new Map();
  const counts = {
    review: 0,
    basic: 0,
    issues: 0,
    simpleDetected: 0,
    issueDetected: 0,
    manuallyKept: 0,
    deleted: 0
  };

  for (const record of Object.values(audit.records)) {
    if (record?.decision === "keep") counts.manuallyKept += 1;
    if (record?.decision === "deleted") counts.deleted += 1;
  }

  for (let index = 0; index < list.length; index += 1) {
    const word = list[index];
    if (!isBrushableWord(word)) continue;

    const auditKey = getTidyAuditKey(word, index);
    const existing = audit.records[auditKey];
    const key = normalizeTidyWordKey(word?.word);
    const isSimple = removableKeys.has(key);
    const reasonCodes = [];
    if (isSimple) reasonCodes.push("removable_basic");
    if (key && (duplicateCounts.get(key) || 0) > 1) reasonCodes.push("duplicate_headword");
    if (!isStrictStandaloneHeadword(word?.word)) reasonCodes.push("invalid_headword");

    const hasDataIssue = reasonCodes.some((code) => code !== "removable_basic");
    if (isSimple) counts.simpleDetected += 1;
    if (hasDataIssue) counts.issueDetected += 1;
    if (existing?.decision === "keep" || !reasonCodes.length) continue;

    const candidate = {
      auditKey,
      index,
      word: word?.word || "",
      reasonCodes,
      reasons: reasonCodes.map(reasonLabel),
      isSimple,
      simpleScore: isSimple ? 1 : 0,
      matchedBase: isSimple ? key : "",
      basicOverlap: isSimple,
      hasDataIssue,
      sortRank: isSimple ? removableRank.get(key) : Number.MAX_SAFE_INTEGER
    };

    candidateByIndex.set(index, candidate);
    candidateByAuditKey.set(auditKey, candidate);
    counts.review += 1;
    if (isSimple) counts.basic += 1;
    if (hasDataIssue) counts.issues += 1;
  }

  return { candidateByIndex, candidateByAuditKey, counts, audit };
}

export function mergeTidyAuditRecords(audit, entries = []) {
  const current = normalizeLexiconTidyAudit(audit);
  if (!Array.isArray(entries) || !entries.length) return current;
  const records = { ...current.records };
  for (const entry of entries) {
    if (entry?.auditKey && entry?.record) records[entry.auditKey] = { ...(records[entry.auditKey] || {}), ...entry.record };
  }
  return { version: LEXICON_TIDY_AUDIT_VERSION, updatedAt: Date.now(), records };
}
