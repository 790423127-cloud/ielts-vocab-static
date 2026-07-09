// Meaning Mode distractor quality tracker — session-level quality cache.
// Never writes to localStorage; purely in-memory session state.

const MAX_RECENT_DISTRACTORS = 60;
const MAX_DISTRACTOR_APPEARANCES_IN_30 = 2;
const MAX_TARGET_REPEAT_DISTRACTORS = 1;

export function createQualityCache() {
  return {
    // Rolling window of recent distractor wordIds
    recentDistractorWordIds: [],
    // Rolling window of recent distractor meaningZh keys
    recentDistractorMeaningKeys: [],
    // Per-distractor usage counts in recent window
    distractorUsageCount: {},
    // Per-target-word distractor history: { targetWordId: [[distractorId, ...], ...] }
    targetDistractorHistory: {},
    // Rolling window of recent semantic groups chosen
    recentSemanticGroups: [],
    // Count of quality-deferred words
    qualityDeferredCount: 0,
    // Words deferred this session
    deferredWordIds: new Set()
  };
}

/**
 * Record distractors used in a question.
 */
export function recordDistractorsUsed(cache, targetWordId, distractors, semanticGroup) {
  const ids = distractors.map(d => d.sourceWordId);
  const keys = distractors.map(d => (d.meaningZh || "").trim());

  // Update recent lists (FIFO, max size)
  cache.recentDistractorWordIds.push(...ids);
  if (cache.recentDistractorWordIds.length > MAX_RECENT_DISTRACTORS) {
    const removed = cache.recentDistractorWordIds.splice(0, cache.recentDistractorWordIds.length - MAX_RECENT_DISTRACTORS);
    for (const id of removed) {
      cache.distractorUsageCount[id] = Math.max(0, (cache.distractorUsageCount[id] || 0) - 1);
    }
  }

  cache.recentDistractorMeaningKeys.push(...keys);
  if (cache.recentDistractorMeaningKeys.length > MAX_RECENT_DISTRACTORS) {
    cache.recentDistractorMeaningKeys.splice(0, cache.recentDistractorMeaningKeys.length - MAX_RECENT_DISTRACTORS);
  }

  // Update counts
  for (const id of ids) {
    cache.distractorUsageCount[id] = (cache.distractorUsageCount[id] || 0) + 1;
  }

  // Update target history
  if (!cache.targetDistractorHistory[targetWordId]) {
    cache.targetDistractorHistory[targetWordId] = [];
  }
  cache.targetDistractorHistory[targetWordId].push([...ids]);
  if (cache.targetDistractorHistory[targetWordId].length > 10) {
    cache.targetDistractorHistory[targetWordId] = cache.targetDistractorHistory[targetWordId].slice(-10);
  }

  // Track semantic groups
  if (semanticGroup) {
    cache.recentSemanticGroups.push(semanticGroup);
    if (cache.recentSemanticGroups.length > 30) {
      cache.recentSemanticGroups = cache.recentSemanticGroups.slice(-30);
    }
  }
}

/**
 * Check if a candidate distractor violates quality rules.
 * Returns { allowed: boolean, reason: string }
 */
export function checkDistractorQuality(cache, candidateWordId, candidateMeaningKey, targetWordId) {
  // Rule 1: Same distractor max 2x in last 30 questions
  const count30 = cache.recentDistractorWordIds.slice(-30).filter(id => id === candidateWordId).length;
  if (count30 >= MAX_DISTRACTOR_APPEARANCES_IN_30) {
    return { allowed: false, reason: "too-frequent:" + candidateWordId };
  }

  // Rule 2: Same distractor meaning key max 2x in last 30
  const keyCount30 = cache.recentDistractorMeaningKeys.slice(-30).filter(k => k === candidateMeaningKey).length;
  if (keyCount30 >= MAX_DISTRACTOR_APPEARANCES_IN_30) {
    return { allowed: false, reason: "meaning-too-frequent:" + candidateMeaningKey };
  }

  // Rule 3: Same distractor not in last 1 question (consecutive)
  const lastId = cache.recentDistractorWordIds[cache.recentDistractorWordIds.length - 1];
  if (lastId === candidateWordId) {
    return { allowed: false, reason: "consecutive:" + candidateWordId };
  }

  // Rule 4: Target word repeat — max 1 same distractor in last 5 appearances
  if (targetWordId && cache.targetDistractorHistory[targetWordId]) {
    const history = cache.targetDistractorHistory[targetWordId];
    const recent5 = history.slice(-5);
    let repeatCount = 0;
    for (const entry of recent5) {
      if (entry.includes(candidateWordId)) repeatCount++;
    }
    if (repeatCount >= MAX_TARGET_REPEAT_DISTRACTORS + 1) {
      return { allowed: false, reason: "target-repeat:" + candidateWordId };
    }
  }

  return { allowed: true };
}

/**
 * Mark a word as quality-deferred (can't generate enough quality distractors).
 */
export function deferWord(cache, wordId) {
  cache.qualityDeferredCount++;
  cache.deferredWordIds.add(wordId);
}

/**
 * Check if a word was previously deferred.
 */
export function isWordDeferred(cache, wordId) {
  return cache.deferredWordIds.has(wordId);
}

/**
 * Get quality stats.
 */
export function getQualityStats(cache) {
  return {
    qualityDeferredCount: cache.qualityDeferredCount,
    deferredWordCount: cache.deferredWordIds.size,
    recentDistractorCount: cache.recentDistractorWordIds.length,
    uniqueRecentDistractors: new Set(cache.recentDistractorWordIds.slice(-30)).size
  };
}