/**
 * Definition upgrade quality gates for 10500-word lexicon.
 */
import crypto from "node:crypto";
import { normalizeHeadword, entryIntegrityFingerprint } from "../../app/lib/vocab/lexicon-guard-shared.mjs";
import { findTruncatedHeadwordEntries } from "../../app/lib/spelling/truncated-headword.mjs";
import { auditCoreVocab, VALID_DIFFICULTIES } from "../core-vocab-quality-audit.mjs";
import { isPollutedMeaning } from "./gt-meaning-zh.mjs";
import {
  BANNED_DETAIL_PATTERNS,
  TEMPLATE_MEANING_PATTERNS,
  isDetailMeaningValid,
  isTemplateMeaning,
  normDetailKey
} from "./gt-detail-meaning.mjs";

const OLD_COUNT = 9909;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hasTargetInExample(entry) {
  const example = normalizeHeadword(entry?.example);
  const targets = [entry?.word, ...(entry?.forms || []).map((item) => item?.word)]
    .map(normalizeHeadword)
    .filter(Boolean);
  return targets.some((target) => {
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(example);
  });
}

export function auditFullWordSystem(payload, { oldBefore = null } = {}) {
  const words = Array.isArray(payload?.words) ? payload.words : [];
  const issues = [];
  const seen = new Map();
  const meaningKeys = new Map();
  const detailKeys = new Map();

  for (let i = 0; i < words.length; i += 1) {
    const entry = words[i];
    const word = normalizeHeadword(entry.word);
    const id = String(entry.id || entry.wordId || "");

    if (!word) issues.push({ id, word: entry.word, issueType: "empty_headword", index: i });
    if (!String(entry.meaning || "").trim()) issues.push({ id, word: entry.word, issueType: "empty_meaningZh", index: i });
    if (!String(entry.meaningDetailZh || "").trim()) {
      issues.push({ id, word: entry.word, issueType: "empty_meaningDetailZh", index: i });
    }

    for (const pat of TEMPLATE_MEANING_PATTERNS) {
      if (pat.test(String(entry.meaning || ""))) {
        issues.push({ id, word: entry.word, issueType: "template_meaning", index: i, value: entry.meaning });
      }
    }
    for (const pat of BANNED_DETAIL_PATTERNS) {
      if (pat.test(String(entry.meaningDetailZh || ""))) {
        issues.push({ id, word: entry.word, issueType: "template_detail", index: i });
      }
    }

    if (entry.meaningDetailZh && !isDetailMeaningValid(entry.meaningDetailZh, entry)) {
      issues.push({ id, word: entry.word, issueType: "invalid_detail", index: i });
    }

    if (entry.answer && entry.word && normalizeHeadword(entry.answer) !== normalizeHeadword(entry.word)) {
      issues.push({ id, word: entry.word, issueType: "word_answer_mismatch", index: i });
    }

    if (isTemplateMeaning(entry.meaning) || isPollutedMeaning(entry.meaning)) {
      issues.push({ id, word: entry.word, issueType: "polluted_meaning", index: i });
    }

    if (entry.example && !hasTargetInExample(entry)) {
      issues.push({ id, word: entry.word, issueType: "example_missing_target", index: i });
    }

    const pos = String(entry.pos || "").toLowerCase();
    const def = String(entry.definition || "").trim();
    if ((pos === "noun" || pos === "n") && /^to\s+[a-z]/i.test(def)) {
      issues.push({ id, word: entry.word, issueType: "pos_definition_mismatch", index: i });
    }

    if (seen.has(word)) {
      issues.push({ id, word: entry.word, issueType: "duplicate_headword", index: i, first: seen.get(word) });
    } else {
      seen.set(word, id);
    }

    const mk = normDetailKey(entry.meaning);
    meaningKeys.set(mk, (meaningKeys.get(mk) || 0) + 1);
    const dk = normDetailKey(entry.meaningDetailZh);
    if (dk) detailKeys.set(dk, (detailKeys.get(dk) || 0) + 1);
  }

  const truncated = findTruncatedHeadwordEntries(words);
  const coreAudit = auditCoreVocab(payload);

  let oldIntegrity = { ok: true, errors: [] };
  if (oldBefore) {
    oldIntegrity = verifyOldZoneIntegrity(oldBefore, words.slice(0, OLD_COUNT));
  }

  const meaningDupes = [...meaningKeys.entries()].filter(([, c]) => c > 8).map(([k, c]) => ({ key: k, count: c }));
  const detailDupes = [...detailKeys.entries()].filter(([, c]) => c > 5).map(([k, c]) => ({ key: k, count: c }));

  return {
    summary: {
      totalWords: words.length,
      issueCount: issues.length,
      truncatedCount: truncated.length,
      templateMeaningCount: issues.filter((i) => i.issueType === "template_meaning").length,
      emptyMeaningCount: issues.filter((i) => i.issueType === "empty_meaningZh").length,
      emptyDetailCount: issues.filter((i) => i.issueType === "empty_meaningDetailZh").length,
      pollutedMeaningCount: issues.filter((i) => i.issueType === "polluted_meaning").length,
      duplicateCount: issues.filter((i) => i.issueType === "duplicate_headword").length,
      exampleMismatchCount: issues.filter((i) => i.issueType === "example_missing_target").length,
      wordAnswerMismatchCount: issues.filter((i) => i.issueType === "word_answer_mismatch").length,
      oldIntegrityOk: oldIntegrity.ok,
      coreAuditSummary: coreAudit.summary
    },
    truncated,
    issues,
    meaningNormalizationDupes: meaningDupes.slice(0, 50),
    detailNormalizationDupes: detailDupes.slice(0, 50),
    oldIntegrity,
    coreAudit
  };
}

export function verifyOldZoneIntegrity(oldBefore, oldAfter) {
  const errors = [];
  if (oldBefore.length !== oldAfter.length) errors.push("old count changed");
  for (let i = 0; i < oldBefore.length; i += 1) {
    if (oldBefore[i].id !== oldAfter[i].id) errors.push(`id changed at ${i}`);
    if (oldBefore[i].word !== oldAfter[i].word) errors.push(`word changed at ${i}: ${oldBefore[i].word}`);
    if (oldBefore[i].answer !== oldAfter[i].answer) errors.push(`answer changed at ${i}`);
  }
  return { ok: errors.length === 0, errors };
}

export function runDefinitionQualityGates(payload, { oldBefore = null, phrasesHash = null, phrasesBaselineHash = null } = {}) {
  const words = Array.isArray(payload?.words) ? payload.words : [];
  const errors = [];
  const stats = {
    total: words.length,
    withMeaningZh: 0,
    withMeaningDetailZh: 0,
    manualReviewRemaining: 0,
    templateMeanings: 0,
    templateDetails: 0,
    emptyMeanings: 0,
    emptyDetails: 0,
    truncatedRemaining: 0,
    wordAnswerMismatch: 0,
    posDefinitionMismatch: 0,
    exampleMissingTarget: 0,
    duplicateHeadwords: 0,
    unauthorizedOldChanges: 0
  };

  const audit = auditFullWordSystem(payload, { oldBefore });

  for (const entry of words) {
    if (String(entry.meaning || "").trim()) stats.withMeaningZh += 1;
    else stats.emptyMeanings += 1;
    if (String(entry.meaningDetailZh || "").trim()) stats.withMeaningDetailZh += 1;
    else stats.emptyDetails += 1;
    if (entry.manualReviewReason) stats.manualReviewRemaining += 1;

    for (const pat of TEMPLATE_MEANING_PATTERNS) {
      if (pat.test(String(entry.meaning || ""))) stats.templateMeanings += 1;
    }
    for (const pat of BANNED_DETAIL_PATTERNS) {
      if (pat.test(String(entry.meaningDetailZh || ""))) stats.templateDetails += 1;
    }
  }

  stats.truncatedRemaining = audit.truncated.length;
  stats.wordAnswerMismatch = audit.issues.filter((i) => i.issueType === "word_answer_mismatch").length;
  stats.posDefinitionMismatch = audit.issues.filter((i) => i.issueType === "pos_definition_mismatch").length;
  stats.exampleMissingTarget = audit.issues.filter((i) => i.issueType === "example_missing_target").length;
  stats.duplicateHeadwords = audit.issues.filter((i) => i.issueType === "duplicate_headword").length;

  if (words.length !== 10500) errors.push(`count=${words.length}, expected 10500`);
  if (stats.emptyMeanings > 0) errors.push(`empty meaningZh: ${stats.emptyMeanings}`);
  if (stats.emptyDetails > stats.manualReviewRemaining) {
    errors.push(`empty meaningDetailZh without manual review: ${stats.emptyDetails - stats.manualReviewRemaining}`);
  }
  if (stats.templateMeanings > 0) errors.push(`template meanings: ${stats.templateMeanings}`);
  if (stats.templateDetails > 0) errors.push(`template details: ${stats.templateDetails}`);
  if (stats.truncatedRemaining > 0) errors.push(`truncated headwords: ${stats.truncatedRemaining}`);
  if (stats.wordAnswerMismatch > 0) errors.push(`word/answer mismatch: ${stats.wordAnswerMismatch}`);
  if (stats.duplicateHeadwords > 0) errors.push(`duplicate headwords: ${stats.duplicateHeadwords}`);
  if (!payload.version || !payload.savedAt || !payload.lexiconHash) errors.push("metadata incomplete");
  if (Number(payload.count) !== words.length) errors.push("count metadata mismatch");

  if (oldBefore) {
    const integrity = verifyOldZoneIntegrity(oldBefore, words.slice(0, OLD_COUNT));
    if (!integrity.ok) {
      stats.unauthorizedOldChanges = integrity.errors.length;
      errors.push(...integrity.errors.map((e) => `old integrity: ${e}`));
    }
  }

  if (phrasesHash && phrasesBaselineHash && phrasesHash !== phrasesBaselineHash) {
    errors.push("phrases hash changed");
  }

  const invalidDifficulty = words.filter((e) => !VALID_DIFFICULTIES.has(e.difficulty));
  if (invalidDifficulty.length) errors.push(`invalid difficulty: ${invalidDifficulty.length}`);

  return {
    ok: errors.length === 0,
    errors,
    stats,
    audit,
    wordsHash: sha256(JSON.stringify(words))
  };
}

export function sampleManualReview(words, sampleSize = 600) {
  const buckets = {
    noun: [], verb: [], adjective: [], adverb: [], other: [],
    old: [], new: [], templateFixed: [], truncated: []
  };
  for (let i = 0; i < words.length; i += 1) {
    const e = words[i];
    const pos = String(e.pos || "").toLowerCase();
    if (pos.includes("noun")) buckets.noun.push(e);
    else if (pos.includes("verb")) buckets.verb.push(e);
    else if (pos.includes("adj")) buckets.adjective.push(e);
    else if (pos.includes("adv")) buckets.adverb.push(e);
    else buckets.other.push(e);
    if (i < OLD_COUNT) buckets.old.push(e);
    else buckets.new.push(e);
    if (e._templateFixed) buckets.templateFixed.push(e);
    if (e.manualReviewReason?.includes("truncated")) buckets.truncated.push(e);
  }

  const sample = [];
  const pick = (arr, n) => {
    if (!arr.length) return;
    const step = Math.max(1, Math.floor(arr.length / n));
    for (let i = 0; i < arr.length && sample.length < sampleSize; i += step) {
      sample.push(arr[i]);
    }
  };

  pick(buckets.noun, 150);
  pick(buckets.verb, 120);
  pick(buckets.adjective, 100);
  pick(buckets.adverb, 60);
  pick(buckets.other, 70);
  pick(buckets.new, 80);
  pick(buckets.templateFixed, 20);
  pick(buckets.truncated, 10);

  const seen = new Set();
  return sample.filter((e) => {
    const k = e.id || e.word;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, sampleSize).map((e) => ({
    id: e.id,
    word: e.word,
    pos: e.pos,
    meaning: e.meaning,
    meaningDetailZh: e.meaningDetailZh,
    manualReviewReason: e.manualReviewReason || "",
    qualityChecksPassed: Boolean(e.meaning && e.meaningDetailZh)
  }));
}