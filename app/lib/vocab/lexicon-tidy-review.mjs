import { isBrushableWord } from "./word-study-eligibility.mjs";

export const LEXICON_TIDY_AUDIT_VERSION = 1;
export const LEXICON_TIDY_FILTER_TYPE = "tidy";
export const LEXICON_TIDY_FILTERS = { REVIEW: "review", BASIC: "basic", ISSUES: "issues" };

const KEPT_DECISIONS = new Set(["keep", "keep_by_familiar"]);

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

function reasonLabel(code) {
  if (code === "removable_basic") return "常见基础词";
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

export function buildLexiconTidyReview(words, options = {}) {
  const list = Array.isArray(words) ? words : [];
  const audit = normalizeLexiconTidyAudit(options.audit);
  const removableKeys = options.removableKeys instanceof Set ? options.removableKeys : new Set();
  const duplicateCounts = new Map();

  for (const word of list) {
    if (!isBrushableWord(word)) continue;
    const key = normalizeTidyWordKey(word?.word);
    if (key) duplicateCounts.set(key, (duplicateCounts.get(key) || 0) + 1);
  }

  const candidateByIndex = new Map();
  const candidateByAuditKey = new Map();
  const autoKeepRecords = [];
  const counts = {
    review: 0,
    basic: 0,
    issues: 0,
    simpleDetected: 0,
    issueDetected: 0,
    autoKeptFamiliar: 0,
    manuallyKept: 0,
    deleted: 0
  };

  for (const record of Object.values(audit.records)) {
    if (record?.decision === "keep") counts.manuallyKept += 1;
    if (record?.decision === "keep_by_familiar") counts.autoKeptFamiliar += 1;
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
    if (KEPT_DECISIONS.has(existing?.decision) || existing?.decision === "deleted" || !reasonCodes.length) continue;

    if (word?.status === "熟悉" && isSimple && !hasDataIssue) {
      counts.autoKeptFamiliar += 1;
      if (!existing) autoKeepRecords.push({
        auditKey,
        record: {
          sourceLexicon: "main",
          wordId: word?.wordId || word?.id || "",
          word: word?.word || "",
          decision: "keep_by_familiar",
          reasonCodes: ["removable_basic"],
          reviewedAt: Date.now()
        }
      });
      continue;
    }

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
      hasDataIssue
    };

    candidateByIndex.set(index, candidate);
    candidateByAuditKey.set(auditKey, candidate);
    counts.review += 1;
    if (isSimple) counts.basic += 1;
    if (hasDataIssue) counts.issues += 1;
  }

  return { candidateByIndex, candidateByAuditKey, autoKeepRecords, counts, audit };
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
