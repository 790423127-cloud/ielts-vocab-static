import {
  hasHeadwordRepair,
  isCompleteAiWord,
  isLikelyWrongAiWord,
  isMissingAiFields,
  isMissingClassification
} from "./page-word-helpers.mjs";

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

function selectIndexedWords(words, predicate) {
  return words.reduce((targets, w, i) => {
    if (predicate(w)) targets.push({ w, i });
    return targets;
  }, []);
}

export function buildCleanWordsPlan(words) {
  const targets = words.reduce((result, word, i) => {
    if (word?.word && word.word.trim()) {
      result.push({ id: String(i), text: word.word, i });
    }
    return result;
  }, []);

  return buildPlan(targets, { batchSize: 100, concurrency: 5 });
}

export function buildGenerateMissingPlan(words, options = {}) {
  const repairWrong = options.repairWrong !== false;
  const onlyWrong = Boolean(options.onlyWrong);
  const wrongTargets = [];
  const missingTargets = [];

  words.forEach((w, i) => {
    const missing = !isCompleteAiWord(w);
    const wrong = repairWrong && isLikelyWrongAiWord(w);
    const target = { w, i, missing, wrong };

    if (wrong) {
      wrongTargets.push(target);
    } else if (missing) {
      missingTargets.push(target);
    }
  });

  const targets = onlyWrong ? wrongTargets : [...wrongTargets, ...missingTargets];
  const basePlan = buildPlan(targets, { batchSize: 20, concurrency: 5 });

  return {
    ...basePlan,
    chunks: basePlan.chunks.map((items) => ({
      items,
      force: onlyWrong || items.some((item) => item.wrong)
    }))
  };
}

export function buildOneByOneCompletionPlan(words) {
  const targets = words.reduce((result, w, i) => {
    const target = {
      w,
      i,
      missing: isMissingAiFields(w),
      unclassified: isMissingClassification(w),
      wrong: isLikelyWrongAiWord(w),
      truncated: hasHeadwordRepair(w.word)
    };

    if (target.missing || target.unclassified || target.wrong || target.truncated) {
      result.push(target);
    }

    return result;
  }, []);

  return { targets };
}

export function buildSlowCompletionPlan(words) {
  const targets = selectIndexedWords(
    words,
    (word) => isMissingAiFields(word) || isLikelyWrongAiWord(word) || hasHeadwordRepair(word.word)
  );

  return buildPlan(targets, { batchSize: 10, concurrency: 1 });
}

export function buildWrongRepairPlan(words) {
  const targets = selectIndexedWords(words, isLikelyWrongAiWord);
  return buildPlan(targets, { batchSize: 10, concurrency: 2 });
}

export function buildFastCompletionPlan(words) {
  const targets = selectIndexedWords(words, isMissingAiFields);
  return buildPlan(targets, { batchSize: 100, concurrency: 5 });
}

export function buildClassificationPlan(words) {
  const targets = selectIndexedWords(words, isMissingClassification);
  return buildPlan(targets, { batchSize: 20, concurrency: 5 });
}
