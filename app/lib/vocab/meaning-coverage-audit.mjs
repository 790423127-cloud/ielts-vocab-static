import {
  isDefinedOtherMeaning,
  normalizeAiGeneratedEntry,
  normalizeOtherMeanings
} from "./admin-ai-content-profile.mjs";
import {
  describeMeaningDetailIssue,
  isMeaningDetailInformative
} from "./meaning-display.mjs";

export const MEANING_COVERAGE_PENDING_FLAG = "meaning_coverage_ai_pending";
export const MEANING_COVERAGE_REVIEWED_FLAG = "meaning_coverage_ai_reviewed";

function text(value) {
  return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
}

function key(value) {
  return text(value).toLowerCase().replace(/[；;，,。.!！?？、\s]+/g, "");
}

/**
 * A short dictionary gloss is useful for the card, but it is not evidence that
 * everyday / IELTS-reading senses have been reviewed.  This deliberately
 * identifies only a conservative, reviewable set; it does not demand a fixed
 * number of senses from AI.
 */
export function isMeaningDetailShallow(entry = {}) {
  return !isMeaningDetailInformative({
    ...entry,
    meaningDetailZh: entry?.meaningDetailZh || entry?.main_meaning_detail_zh,
    meaning: entry?.meaning || entry?.meaningZh || entry?.primaryMeaningZh
  });
}

export function isMeaningCoveragePending(entry = {}) {
  return entry?.meaningCoveragePending === true ||
    text(entry?.meaningCoverageAuditStatus) === "pending" ||
    (Array.isArray(entry?.qualityFlags) && entry.qualityFlags.includes(MEANING_COVERAGE_PENDING_FLAG));
}

export function isMeaningCoverageReviewed(entry = {}) {
  return entry?.meaningCoverageReviewed === true ||
    text(entry?.meaningCoverageAuditStatus) === "reviewed" ||
    (Array.isArray(entry?.qualityFlags) && entry.qualityFlags.includes(MEANING_COVERAGE_REVIEWED_FLAG));
}

export function needsMeaningCoverageReview(entry = {}) {
  if (!text(entry?.word)) return false;
  if (isMeaningCoveragePending(entry)) return true;
  if (isMeaningDetailShallow(entry)) return true;
  if (isMeaningCoverageReviewed(entry)) return false;
  return Array.isArray(entry?.otherMeanings) && entry.otherMeanings.some((sense) => !isDefinedOtherMeaning(sense));
}

function mergeOtherMeanings(existing, generated, primaryMeaning, primaryPos) {
  const result = [];
  const seen = new Set();
  for (const sense of [
    ...normalizeOtherMeanings(existing, primaryMeaning, primaryPos),
    ...normalizeOtherMeanings(generated, primaryMeaning, primaryPos)
  ]) {
    const senseKey = `${key(sense.pos)}::${key(sense.meaningZh)}`;
    if (!senseKey || senseKey === "::" || seen.has(senseKey)) continue;
    seen.add(senseKey);
    result.push(sense);
  }
  return result;
}

export function normalizeMeaningCoverageProfile(profile = {}, fallbackWord = "") {
  return normalizeAiGeneratedEntry(profile, fallbackWord);
}

export function isMeaningCoverageProfileUsable(profile = {}, fallbackWord = "") {
  const normalized = normalizeMeaningCoverageProfile(profile, fallbackWord);
  return Boolean(
    hasMeaningCoverageProfileHint(normalized, fallbackWord) &&
    Array.isArray(normalized.otherMeanings) &&
    normalized.otherMeanings.every(isDefinedOtherMeaning)
  );
}

/**
 * Keep the learner-facing reason specific to this lightweight review mode.
 * The full-profile validator mentions examples, forms, and collocations, but
 * none of those are required for a common-sense review and would be misleading
 * in the UI.
 */
export function describeMeaningCoverageProfileIssue(profile = {}, fallbackWord = "") {
  const normalized = normalizeMeaningCoverageProfile(profile, fallbackWord);
  if (!text(normalized.word)) return "AI 没有返回对应单词";
  if (isMeaningDetailShallow(normalized)) {
    return describeMeaningDetailIssue(normalized);
  }
  if (!Array.isArray(normalized.otherMeanings)) return "额外常见义格式不是列表";
  const incompleteSense = normalized.otherMeanings.find((sense) => !isDefinedOtherMeaning(sense));
  if (incompleteSense) {
    if (!text(incompleteSense.pos)) return "额外常见义缺少词性";
    if (!text(incompleteSense.meaningZh || incompleteSense.meaning)) return "额外常见义缺少中文释义";
    return "额外常见义缺少英文定义";
  }
  return "常见义资料未通过校验";
}

/** A safe partial cache hit can still improve the primary explanation, but it
 * must not clear the queue until every additional sense is fully evidenced. */
export function hasMeaningCoverageProfileHint(profile = {}, fallbackWord = "") {
  const normalized = normalizeMeaningCoverageProfile(profile, fallbackWord);
  return Boolean(
    text(normalized.word) &&
    !isMeaningDetailShallow(normalized)
  );
}

/**
 * Keep the learner's existing primary gloss and all unrelated teaching fields.
 * Only an empty/template primary explanation is upgraded; additional senses
 * are merged by part of speech + Chinese sense rather than replaced.
 */
export function applyMeaningCoverageReview(entry = {}, profile = {}, {
  source = "ai-cache",
  reviewedAt = new Date().toISOString(),
  replacePrimaryMeaning = false
} = {}) {
  const normalized = normalizeMeaningCoverageProfile(profile, entry.word);
  if (!isMeaningCoverageProfileUsable(normalized, entry.word)) {
    throw new Error(`语义资料不足，不能确认常见义覆盖：${text(entry.word) || "(empty)"}`);
  }
  const primaryMeaning = replacePrimaryMeaning
    ? text(normalized.meaning)
    : text(entry.meaning || entry.meaningZh || entry.primaryMeaningZh || normalized.meaning);
  const nextDetail = replacePrimaryMeaning
    ? normalized.meaningDetailZh
    : isMeaningDetailShallow(entry)
    ? normalized.meaningDetailZh
    : text(entry.meaningDetailZh);
  const { meaningCoverageLastFailure: _lastFailure, ...entryWithoutLastFailure } = entry;
  return {
    ...entryWithoutLastFailure,
    ...(replacePrimaryMeaning ? {
      meaning: primaryMeaning,
      meaningZh: primaryMeaning,
      primaryMeaningZh: primaryMeaning,
      pos: text(normalized.pos) || text(entry.pos),
      primaryPos: text(normalized.pos) || text(entry.primaryPos || entry.pos),
      definition: text(normalized.definition) || text(entry.definition)
    } : {}),
    meaningDetailZh: nextDetail,
    otherMeanings: mergeOtherMeanings(
      entry.otherMeanings,
      normalized.otherMeanings,
      primaryMeaning,
      normalized.pos || entry.primaryPos || entry.pos
    ),
    meaningCoveragePending: false,
    meaningCoverageReviewed: true,
    meaningCoverageAuditStatus: "reviewed",
    meaningCoverageReviewSource: source,
    meaningCoverageReviewedAt: reviewedAt,
    meaningCoveragePromptVersion: text(profile?.aiContentProfile || normalized.aiContentProfile),
    updatedAt: text(entry.updatedAt) || reviewedAt
  };
}

export function applyMeaningCoverageCacheHint(entry = {}, profile = {}) {
  const normalized = normalizeMeaningCoverageProfile(profile, entry.word);
  if (!hasMeaningCoverageProfileHint(normalized, entry.word)) {
    throw new Error(`缓存缺少可用的主释义说明：${text(entry.word) || "(empty)"}`);
  }
  const primaryMeaning = text(entry.meaning || entry.meaningZh || entry.primaryMeaningZh || normalized.meaning);
  const detailedGeneratedSenses = normalized.otherMeanings.filter(isDefinedOtherMeaning);
  return {
    ...entry,
    meaningDetailZh: isMeaningDetailShallow(entry)
      ? normalized.meaningDetailZh
      : text(entry.meaningDetailZh),
    otherMeanings: mergeOtherMeanings(
      entry.otherMeanings,
      detailedGeneratedSenses,
      primaryMeaning,
      normalized.pos || entry.primaryPos || entry.pos
    )
  };
}

export function markMeaningCoveragePending(entry = {}) {
  if (!text(entry?.word)) return entry;
  return {
    ...entry,
    meaningCoveragePending: true,
    meaningCoverageReviewed: false,
    meaningCoverageAuditStatus: "pending",
    meaningCoverageReviewSource: "",
    meaningCoverageReviewedAt: ""
  };
}
