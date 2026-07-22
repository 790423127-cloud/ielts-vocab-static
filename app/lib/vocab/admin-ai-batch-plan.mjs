import {
  hasHeadwordRepair,
  isCompleteAiWord,
  isLikelyWrongAiWord,
  isMissingAiFields,
  isMissingClassification
} from "./page-word-helpers.mjs";
import { isInflectedReferenceWord } from "./word-study-eligibility.mjs";

export const PAID_AI_LIMITS = Object.freeze({
  clean: 100,
  generateMissing: 100,
  oneByOne: 20,
  slow: 10,
  wrongRepair: 20,
  fast: 100,
  classification: 100,
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
  const maxTargets = Math.max(1, Number(options.maxTargets || PAID_AI_LIMITS.generateMissing));
  const wrongTargets = [];
  const missingTargets = [];

  words.forEach((w, i) => {
    if (!isPaidAiEligibleWord(w)) return;
    const missing = !isCompleteAiWord(w);
    const wrong = repairWrong && isLikelyWrongAiWord(w);
    const target = { w, i, missing, wrong };

    if (wrong) {
      wrongTargets.push(target);
    } else if (missing) {
      missingTargets.push(target);
    }
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

export function buildSlowCompletionPlan(words) {
  const targets = selectIndexedWords(
    words,
    (word) => isMissingAiFields(word) || isLikelyWrongAiWord(word) || hasHeadwordRepair(word.word),
    PAID_AI_LIMITS.slow
  );

  return buildPlan(targets, { batchSize: PAID_AI_LIMITS.batchSize, concurrency: PAID_AI_LIMITS.concurrency });
}

export function buildWrongRepairPlan(words) {
  const targets = selectIndexedWords(words, isLikelyWrongAiWord, PAID_AI_LIMITS.wrongRepair);
  return buildPlan(targets, { batchSize: PAID_AI_LIMITS.batchSize, concurrency: PAID_AI_LIMITS.concurrency });
}

export function buildFastCompletionPlan(words) {
  const targets = selectIndexedWords(words, isMissingAiFields, PAID_AI_LIMITS.fast);
  return buildPlan(targets, { batchSize: PAID_AI_LIMITS.batchSize, concurrency: PAID_AI_LIMITS.concurrency });
}

export function buildClassificationPlan(words) {
  const targets = selectIndexedWords(words, isMissingClassification, PAID_AI_LIMITS.classification);
  return buildPlan(targets, { batchSize: PAID_AI_LIMITS.batchSize, concurrency: PAID_AI_LIMITS.concurrency });
}
