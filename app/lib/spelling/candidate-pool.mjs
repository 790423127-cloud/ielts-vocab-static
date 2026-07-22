import { buildSpellingCandidatesWithBreakdown } from "./candidate-builder.mjs";
import { shouldAllowRepeatedAnswerCandidates } from "./candidate-breakdown.mjs";
import { normalizeSpellingKey } from "./error-bank-dedupe.mjs";
import { enrichPersonalWrongBreakdown } from "./personal-wrong-progress.mjs";
import { normalizeSpellingScope } from "./spelling-scope.mjs";

export const CANDIDATE_CACHE_KEY_PREFIX = "ielts_spelling_candidate_cache_v2";

function duplicateKeyForCandidate(candidate = {}) {
  return normalizeSpellingKey(
    candidate.expectedAnswer || candidate.displayText || candidate.word || ""
  );
}

export function getCandidateCacheKey(scope = "word") {
  return `${CANDIDATE_CACHE_KEY_PREFIX}:${normalizeSpellingScope(scope)}`;
}

export function clearCandidateCache(scope = "word") {
  if (typeof sessionStorage === "undefined") return;

  try {
    sessionStorage.removeItem(getCandidateCacheKey(scope));
  } catch {
    // ignore quota / privacy mode
  }
}

export function dedupeCandidates(candidates = [], options = {}) {
  const allowRepeatedAnswers = shouldAllowRepeatedAnswerCandidates(options, candidates);
  const seenWordIds = new Set();
  const seenAnswers = new Set();
  const deduped = [];
  let duplicateCount = 0;

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const wordId = String(candidate?.wordId || "").trim();
    const answerKey = duplicateKeyForCandidate(candidate);

    if (wordId && seenWordIds.has(wordId)) {
      duplicateCount += 1;
      continue;
    }

    if (!allowRepeatedAnswers && answerKey && seenAnswers.has(answerKey)) {
      duplicateCount += 1;
      continue;
    }

    if (wordId) seenWordIds.add(wordId);
    if (!allowRepeatedAnswers && answerKey) seenAnswers.add(answerKey);
    deduped.push(candidate);
  }

  return { candidates: deduped, duplicateCount };
}

export function findCandidateDuplicates(candidates = []) {
  const seenWordIds = new Map();
  const seenAnswers = new Map();
  const seenHeadwords = new Map();
  const duplicateWordIds = [];
  const duplicateAnswers = [];
  const duplicateHeadwords = [];

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const wordId = String(candidate?.wordId || "").trim();
    const answerKey = duplicateKeyForCandidate(candidate);
    const headwordKey = String(candidate?.displayText || candidate?.word || "").trim().toLowerCase();

    if (wordId) {
      if (seenWordIds.has(wordId)) duplicateWordIds.push(wordId);
      else seenWordIds.set(wordId, true);
    }

    if (answerKey) {
      if (seenAnswers.has(answerKey)) duplicateAnswers.push(answerKey);
      else seenAnswers.set(answerKey, true);
    }

    if (headwordKey) {
      if (seenHeadwords.has(headwordKey)) duplicateHeadwords.push(headwordKey);
      else seenHeadwords.set(headwordKey, true);
    }
  }

  return { duplicateWordIds, duplicateAnswers, duplicateHeadwords };
}

export function buildCurrentBatchCandidates(words = [], flashcardState = {}, options = {}) {
  const scope = normalizeSpellingScope(options.scope || "word");
  clearCandidateCache(scope);

  const { candidates, breakdown } = buildSpellingCandidatesWithBreakdown(words, flashcardState, options);
  const { candidates: dedupedCandidates, duplicateCount } = dedupeCandidates(candidates, options);
  const duplicateReport = findCandidateDuplicates(dedupedCandidates);

  const enrichedBreakdown = enrichPersonalWrongBreakdown(dedupedCandidates, {
    ...breakdown,
    candidateTotal: dedupedCandidates.length,
    sessionTotal: dedupedCandidates.length,
    sessionCandidates: dedupedCandidates,
    sessionWordIds: dedupedCandidates.map((candidate) => candidate.wordId).filter(Boolean),
    filteredByDuplicate: Number(breakdown.filteredByDuplicate || 0) + duplicateCount,
    filteredOutTotal: Number(breakdown.rawBatchTotal || 0) - dedupedCandidates.length,
    duplicateCount,
    scope,
    source: options.source || options.practiceSource || "current-batch",
    mode: breakdown.currentMode || options.entryMode || options.mode || "",
    category: options.category || "",
    batch: options.currentBatchId || options.batchId || breakdown.currentBatchId || ""
  }, options);

  const nextBreakdown = {
    ...enrichedBreakdown,
    sessionCandidates: dedupedCandidates,
    sessionWordIds: dedupedCandidates.map((candidate) => candidate.wordId).filter(Boolean)
  };

  return {
    candidates: dedupedCandidates,
    breakdown: nextBreakdown,
    duplicateReport
  };
}

export function writeCandidateCacheSnapshot(snapshot = {}) {
  if (typeof sessionStorage === "undefined") return;

  const scope = normalizeSpellingScope(snapshot.scope || "word");

  try {
    sessionStorage.setItem(getCandidateCacheKey(scope), JSON.stringify({
      ...snapshot,
      scope,
      updatedAt: Date.now()
    }));
  } catch {
    // ignore quota / privacy mode
  }
}

export function readCandidateCacheSnapshot(scope = "word") {
  if (typeof sessionStorage === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(getCandidateCacheKey(scope));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
