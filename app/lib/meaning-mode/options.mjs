// Meaning Mode distractor generation v4 — posFamily-first, semantic-group-second.
// Zero cross-pos distractors. Zero random fallback. Quality-defer when insufficient.

// Heavy semantic-distractor-index is loaded only via runtime-indexes ensureMeaningRuntimeIndexes().
import { checkDistractorQuality } from "./distractor-quality.mjs";

const OPTION_BANK_INDEX_CACHE = new WeakMap();
const DISTRACTOR_TIERS_CACHE = new WeakMap();

/**
 * Seeded PRNG (mulberry32).
 */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(arr, seed) {
  const rng = mulberry32(seed);
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Option hash: sorted meaningZh joined with "||".
 */
export function hashOptionSet(options) {
  const normalized = options.map(o => (o.meaningZh || "").trim()).sort();
  return normalized.join("||");
}

/**
 * Heuristic similarity — based on posFamily + semanticGroup overlap.
 * NOT semantic distance — purely heuristic.
 */
export function heuristicSimilarityScore(semEntryA, semEntryB) {
  if (!semEntryA || !semEntryB) return 0;
  let score = 0;

  // Same posFamily: +40
  if (semEntryA._posFamily && semEntryA._posFamily === semEntryB._posFamily) {
    score += 40;
  }

  // Shared semantic groups: +30 each
  const groupsA = semEntryA._semanticGroups || [];
  const groupsB = semEntryB._semanticGroups || [];
  const sharedGroups = groupsA.filter(g => groupsB.includes(g)).length;
  score += sharedGroups * 30;

  // Shared tags: +10 each
  const tagsA = semEntryA.tags || [];
  const tagsB = semEntryB.tags || [];
  const sharedTags = tagsA.filter(t => tagsB.includes(t)).length;
  score += sharedTags * 10;

  // Same difficulty: +5
  if (semEntryA.difficulty && semEntryA.difficulty === semEntryB.difficulty) {
    score += 5;
  }

  return Math.min(score, 100);
}

/**
 * Normalize POS to simple family.
 */
function normalizePosFamily(pos) {
  if (!pos) return "unknown";
  const p = String(pos).trim().toLowerCase();
  if (p.startsWith("noun") || p === "n" || p === "n.") return "noun";
  if (p.startsWith("verb") || p === "v" || p === "v.") return "verb";
  if (p.startsWith("adjectiv") || p === "adj" || p === "adj.") return "adjective";
  if (p.startsWith("adverb") || p === "adv" || p === "adv.") return "adverb";
  if (p.includes("noun")) return "noun";
  if (p.includes("verb")) return "verb";
  if (p.includes("adj")) return "adjective";
  if (p.includes("adv")) return "adverb";
  return "other";
}

/**
 * Pick N quality distractors with posFamily enforcement.
 *
 * Priority tiers (all within same posFamily):
 * 1. Same posFamily + same semanticGroup + different semanticSubgroup
 * 2. Same posFamily + adjacent semanticGroup
 * 3. Same posFamily + any semanticGroup
 * 4. Same posFamily + no semanticGroup requirement (last resort within posFamily)
 *
 * Returns { distractors: [...], qualitySufficient: boolean }
 */
export function pickDistractors(wordBank, correctWordId, correctMeaning, count = 3, qualityCache = null) {
  const bankIndex = getOptionBankIndex(wordBank);
  const correctEntry = bankIndex.byWordId.get(correctWordId);
  if (!correctEntry) return { distractors: [], qualitySufficient: false };

  const correctPosFamily = correctEntry._posFamily || normalizePosFamily(correctEntry.pos);
  const correctGroups = correctEntry._semanticGroups || [];

  let tiersByTarget = DISTRACTOR_TIERS_CACHE.get(wordBank);
  if (!tiersByTarget) {
    tiersByTarget = new Map();
    DISTRACTOR_TIERS_CACHE.set(wordBank, tiersByTarget);
  }
  let cachedTiers = tiersByTarget.get(correctWordId);
  if (!cachedTiers) {
    const samePosCandidates = (bankIndex.byPosFamily.get(correctPosFamily) || [])
      .filter(item => item.wordId !== correctWordId)
      .map(item => ({
      wordId: item.wordId,
      meaningZh: item.meaningZh,
      displayEnglish: item.word,
      posFamily: correctPosFamily,
      semanticGroups: item._semanticGroups || [],
      confidence: item._confidence || "low",
      item
      }));

    // Classify by semantic proximity
    const sameGroup = [];
    const adjacentGroup = [];
    const samePosOnly = [];

    const correctGroupSet = new Set(correctGroups);
    for (const candidate of samePosCandidates) {
      const sharesGroup = candidate.semanticGroups.some(group => correctGroupSet.has(group));
      if (sharesGroup) {
        sameGroup.push(candidate);
      } else if (candidate.semanticGroups.length > 0) {
        adjacentGroup.push(candidate);
      } else {
        samePosOnly.push(candidate);
      }
    }

    const sortFn = (a, b) => (
      heuristicSimilarityScore(correctEntry, b.item)
      - heuristicSimilarityScore(correctEntry, a.item)
    );
    sameGroup.sort(sortFn);
    adjacentGroup.sort(sortFn);
    samePosOnly.sort(sortFn);
    cachedTiers = { samePosCandidates, sameGroup, adjacentGroup, samePosOnly };
    tiersByTarget.set(correctWordId, cachedTiers);
  }

  const { samePosCandidates, sameGroup, adjacentGroup, samePosOnly } = cachedTiers;

  const chosen = [];
  const chosenMeanings = new Set();
  const chosenIds = new Set();

  function tryAdd(sourceList) {
    for (const c of sourceList) {
      if (chosen.length >= count) break;
      const m = (c.meaningZh || "").trim();
      if (!m) continue;
      if (chosenMeanings.has(m)) continue;
      if (m === correctMeaning) continue;
      if (chosenIds.has(c.wordId)) continue;

      // Quality check
      if (qualityCache) {
        const check = checkDistractorQuality(qualityCache, c.wordId, m, correctWordId);
        if (!check.allowed) continue;
      }

      chosen.push({
        meaningZh: m,
        sourceWordId: c.wordId,
        displayEnglish: c.displayEnglish,
        isCorrect: false,
        posFamily: c.posFamily,
        semanticGroups: c.semanticGroups,
        confidence: c.confidence
      });
      chosenMeanings.add(m);
      chosenIds.add(c.wordId);
    }
  }

  // Try tiers sequentially
  tryAdd(sameGroup);
  tryAdd(adjacentGroup);

  // Only use samePosOnly as last resort within posFamily
  if (chosen.length < count) {
    tryAdd(samePosOnly);
  }

  const qualitySufficient = chosen.length >= count;

  return {
    distractors: chosen.slice(0, count),
    qualitySufficient,
    stats: {
      totalSamePos: samePosCandidates.length,
      sameGroup: sameGroup.length,
      adjacentGroup: adjacentGroup.length,
      samePosOnly: samePosOnly.length,
      chosen
    }
  };
}

function getOptionBankIndex(wordBank) {
  const cached = OPTION_BANK_INDEX_CACHE.get(wordBank);
  if (cached) return cached;

  const byWordId = new Map();
  const byPosFamily = new Map();
  for (const item of wordBank) {
    byWordId.set(item.wordId, item);
    const posFamily = item._posFamily || normalizePosFamily(item.pos);
    let bucket = byPosFamily.get(posFamily);
    if (!bucket) {
      bucket = [];
      byPosFamily.set(posFamily, bucket);
    }
    bucket.push(item);
  }
  const index = { byWordId, byPosFamily };
  OPTION_BANK_INDEX_CACHE.set(wordBank, index);
  return index;
}

/**
 * Session-level anti-memorization cache.
 */
export class AntiMemorizationCache {
  constructor() {
    this.usedOptionHashes = new Set();
    this.correctPositionHistory = [];
    this.questionOrdinal = 0;
  }

  checkRules(options, correctOptionIndex) {
    const issues = [];
    const hash = hashOptionSet(options);
    if (this.usedOptionHashes.has(hash)) {
      issues.push("duplicate option hash");
    }
    if (wouldRepeatThree(this.correctPositionHistory, correctOptionIndex)) {
      issues.push("correct position repeated 3 times");
    }
    return { valid: issues.length === 0, issues };
  }

  record(options, correctOptionIndex) {
    this.usedOptionHashes.add(hashOptionSet(options));
    this.correctPositionHistory.push(correctOptionIndex);
    if (this.correctPositionHistory.length > 300) {
      this.correctPositionHistory = this.correctPositionHistory.slice(-300);
    }
    this.questionOrdinal++;
  }

  wouldRepeatThree(newIndex) {
    return wouldRepeatThree(this.correctPositionHistory, newIndex);
  }

  getRecentOptionSetCount() {
    return this.usedOptionHashes.size;
  }

  debug() {
    return {
      recentOptionSetCount: this.usedOptionHashes.size,
      correctPositionHistory: [...this.correctPositionHistory].slice(-10),
      questionOrdinal: this.questionOrdinal
    };
  }
}

function wouldRepeatThree(history, newIndex) {
  if (history.length < 2) return false;
  const last2 = history.slice(-2);
  return last2[0] === newIndex && last2[1] === newIndex;
}
