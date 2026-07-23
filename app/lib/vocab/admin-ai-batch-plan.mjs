import {
  hasHeadwordRepair,
  isLikelyWrongAiWord,
  normalizeWord
} from "./page-word-helpers.mjs";
import { isInflectedReferenceWord } from "./word-study-eligibility.mjs";
import {
  getUnifiedQualityQueue,
  isMissingAiFields,
  isMissingClassification
} from "./word-quality-status.mjs";

export const PAID_AI_LIMITS = Object.freeze({
  clean: 100,
  generateMissing: 100,
  oneByOne: 20,
  slow: 10,
  wrongRepair: 100,
  fast: 100,
  classification: 100,
  batchSize: 10,
  concurrency: 5
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
    const missing = isMissingAiFields(w);
    const wrong = isLikelyWrongAiWord(w) || hasHeadwordRepair(w.word);

    if (wrong && repairWrong) wrongTargets.push({ w, i, missing: false, wrong: true });
    else if (!wrong && missing) missingTargets.push({ w, i, missing: true, wrong: false });
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
      missing: isMissingAiFields(w),
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
  const targets = selectIndexedWords(words, isLikelyWrongAiWord, PAID_AI_LIMITS.wrongRepair);
  return buildPlan(targets, {
    batchSize: PAID_AI_LIMITS.batchSize,
    concurrency: Math.min(2, PAID_AI_LIMITS.concurrency)
  });
}

export function buildBulkCompletionPlan(words, options = {}) {
  const maxTargets = resolveTargetLimit(options.maxTargets, PAID_AI_LIMITS.fast);
  const excludedWordKeys = options.excludeWordKeys instanceof Set
    ? options.excludeWordKeys
    : new Set(options.excludeWordKeys || []);
  const targets = selectIndexedWords(
    words,
    (word) => (
      !excludedWordKeys.has(normalizeWord(word.word)) &&
      getUnifiedQualityQueue(word, {
        needsRepair: isLikelyWrongAiWord(word) || hasHeadwordRepair(word.word)
      }) === "completion"
    ),
    maxTargets
  );
  return buildPlan(targets, { batchSize: PAID_AI_LIMITS.batchSize, concurrency: PAID_AI_LIMITS.concurrency });
}

// Compatibility alias for the existing UI. One call processes one bounded round.
export function buildFastCompletionPlan(words, options = {}) {
  return buildBulkCompletionPlan(words, options);
}

export function buildClassificationPlan(words, options = {}) {
  const maxTargets = resolveTargetLimit(options.maxTargets, PAID_AI_LIMITS.classification);
  const targets = selectIndexedWords(
    words,
    (word) => getUnifiedQualityQueue(word, {
      needsRepair: isLikelyWrongAiWord(word) || hasHeadwordRepair(word.word)
    }) === "classification",
    maxTargets
  );
  return buildPlan(targets, { batchSize: PAID_AI_LIMITS.batchSize, concurrency: PAID_AI_LIMITS.concurrency });
}
