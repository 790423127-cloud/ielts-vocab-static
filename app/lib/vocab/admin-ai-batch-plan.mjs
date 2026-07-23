import {
  hasHeadwordRepair,
  isLikelyWrongAiWord,
  isMissingClassification
} from "./page-word-helpers.mjs";
import { isAiContentProfileMissing } from "./admin-ai-content-profile.mjs";
import { isInflectedReferenceWord } from "./word-study-eligibility.mjs";

export const PAID_AI_LIMITS = Object.freeze({
  clean: 100,
  generateMissing: Infinity,
  oneByOne: 20,
  slow: 10,
  wrongRepair: 100,
  fast: Infinity,
  classification: Infinity,
  batchSize: 10,
  concurrency: 1
});

function chunkTargets(targets, batchSize) {
  const chunks = [];
  for (let start = 0; start < targets.length; start += batchSize) {
    chunks.push(targets.slice(start, start + batchSize));
  }
  return chunks;
}

function buildPlan(targets, { batchSize, concurrency }) {
  const chunks = chunkTargets(targets, batchSize);
  return {
    targets,
    chunks,
    workerCount: Math.min(concurrency, chunks.length)
  };
}

function isPaidAiEligibleWord(word) {
  return Boolean(word?.word && String(word.word).trim()) && !isInflectedReferenceWord(word);
}

function selectIndexedWords(words, predicate, limit = Infinity) {
  const targets = [];
  for (let i = 0; i < words.length && targets.length < limit; i += 1) {
    const w = words[i];
    if (isPaidAiEligibleWord(w) && predicate(w)) targets.push({ w, i });
  }
  return targets;
}

function resolveTargetLimit(value, fallback = Infinity) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Infinity;
  return Math.max(0, Math.floor(parsed));
}

export function buildCleanWordsPlan(words) {
  const targets = [];
  for (let i = 0; i < words.length && targets.length < PAID_AI_LIMITS.clean; i += 1) {
    const word = words[i];
    if (isPaidAiEligibleWord(word)) targets.push({ id: String(i), text: word.word, i });
  }
  return buildPlan(targets, { batchSize: PAID_AI_LIMITS.batchSize, concurrency: PAID_AI_LIMITS.concurrency });
}

export function buildGenerateMissingPlan(words, options = {}) {
  const repairWrong = options.repairWrong !== false;
  const onlyWrong = Boolean(options.onlyWrong);
  const maxTargets = resolveTargetLimit(options.maxTargets, PAID_AI_LIMITS.generateMissing);
  const wrongTargets = [];
  const missingTargets = [];

  words.forEach((w, i) => {
    if (!isPaidAiEligibleWord(w)) return;
    const missing = isAiContentProfileMissing(w);
    const wrong = repairWrong && isLikelyWrongAiWord(w);
    const target = { w, i, missing, wrong };

    if (wrong) wrongTargets.push(target);
    else if (missing) missingTargets.push(target);
  });

  const targets = (onlyWrong ? wrongTargets : [...wrongTargets, ...missingTargets]).slice(0, maxTargets);
  const basePlan = buildPlan(targets, { batchSize: PAID_AI_LIMITS.batchSize, concurrency: PAID_AI_LIMITS.concurrency });

  return {
    ...basePlan,
    chunks: basePlan.chunks.map((items) => ({
      items,
      force: onlyWrong || items.some((item) => item.wrong)
    }))
  };
}

export function buildOneByOneCompletionPlan(words) {
  const targets = [];
  for (let i = 0; i < words.length && targets.length < PAID_AI_LIMITS.oneByOne; i += 1) {
    const w = words[i];
    if (!isPaidAiEligibleWord(w)) continue;
    const target = {
      w,
      i,
      missing: isAiContentProfileMissing(w),
      unclassified: isMissingClassification(w),
      wrong: isLikelyWrongAiWord(w),
      truncated: hasHeadwordRepair(w.word)
    };
    if (target.missing || target.unclassified || target.wrong || target.truncated) targets.push(target);
  }
  return { targets };
}

export function buildAnomalyRepairPlan(words, options = {}) {
  const maxTargets = resolveTargetLimit(options.maxTargets, PAID_AI_LIMITS.wrongRepair);
  const targets = selectIndexedWords(
    words,
    (word) => isLikelyWrongAiWord(word) || hasHeadwordRepair(word.word),
    maxTargets
  );
  return buildPlan(targets, { batchSize: PAID_AI_LIMITS.batchSize, concurrency: PAID_AI_LIMITS.concurrency });
}

// Compatibility alias for the old slow button: it now repairs anomalous headwords only.
export function buildSlowCompletionPlan(words) {
  return buildAnomalyRepairPlan(words, { maxTargets: PAID_AI_LIMITS.slow });
}

export function buildWrongRepairPlan(words) {
  return buildAnomalyRepairPlan(words);
}

export function buildBulkCompletionPlan(words, options = {}) {
  const maxTargets = resolveTargetLimit(options.maxTargets, PAID_AI_LIMITS.fast);
  const targets = selectIndexedWords(words, isAiContentProfileMissing, maxTargets);
  return buildPlan(targets, { batchSize: PAID_AI_LIMITS.batchSize, concurrency: PAID_AI_LIMITS.concurrency });
}

// Compatibility alias for the existing UI. Unlike the old implementation, this scans the whole lexicon.
export function buildFastCompletionPlan(words) {
  return buildBulkCompletionPlan(words);
}

export function buildClassificationPlan(words, options = {}) {
  const maxTargets = resolveTargetLimit(options.maxTargets, PAID_AI_LIMITS.classification);
  const targets = selectIndexedWords(words, isMissingClassification, maxTargets);
  return buildPlan(targets, { batchSize: PAID_AI_LIMITS.batchSize, concurrency: PAID_AI_LIMITS.concurrency });
}
