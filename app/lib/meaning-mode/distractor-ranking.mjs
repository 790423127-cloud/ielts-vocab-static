// distractor-ranking.mjs v5 -- Phase 5: sense-relation-based distractor selection.
// Uses conceptAxis/conceptValue relations instead of micro-category labels.

import { getQuizMeaning, glossesCollide } from "./collision-check.mjs";
import {
  scoreCandidatesByRelation, getCatalogStats
} from "./sense-relation-engine.mjs";
import { getWordBankIndex } from "./runtime-indexes.mjs";

const GLOBAL_FREQ = new Map();
let GLOBAL_TOTAL_COMBOS = 0;
const MAX_PCT = 2;
const MAX_ABS = 90;

function _incrFreq(wordId) {
  const c = (GLOBAL_FREQ.get(wordId) || 0) + 1;
  GLOBAL_FREQ.set(wordId, c);
  return c;
}
function _getFreqPct(wordId) {
  if (GLOBAL_TOTAL_COMBOS === 0) return 0;
  return (GLOBAL_FREQ.get(wordId) || 0) / GLOBAL_TOTAL_COMBOS * 100;
}

function frequencyPenalty(wordId) {
  const abs = GLOBAL_FREQ.get(wordId) || 0;
  const pct = _getFreqPct(wordId);
  return abs + (pct > MAX_PCT ? 1000 : pct * 10);
}

const SESSION_DISTRACTOR_FREQ = new Map();
const SESSION_TARGET_PAIRS = new Map();
const CANDIDATE_POOLS_BY_BANK = new WeakMap();
const SCORED_CANDIDATES_BY_BANK = new WeakMap();

export function resetGlobalFrequency() {
  GLOBAL_FREQ.clear();
  GLOBAL_TOTAL_COMBOS = 0;
  SESSION_DISTRACTOR_FREQ.clear();
  SESSION_TARGET_PAIRS.clear();
}

export function resetSessionState() {
  SESSION_DISTRACTOR_FREQ.clear();
  SESSION_TARGET_PAIRS.clear();
}

function checkSessionLimits(tId, dId, qCount) {
  if (qCount <= 30) {
    if ((SESSION_DISTRACTOR_FREQ.get(dId) || 0) >= 1) return false;
  }
  if (qCount <= 100 && SESSION_TARGET_PAIRS.has(tId + "||" + dId)) return false;
  return true;
}

function recordSessionChoice(tId, dIds) {
  for (const did of dIds) {
    SESSION_DISTRACTOR_FREQ.set(did, (SESSION_DISTRACTOR_FREQ.get(did) || 0) + 1);
    SESSION_TARGET_PAIRS.set(tId + "||" + did, true);
  }
}

export function generateDistractorCombinations(wordBank, correctWordId, correctMeaning, targetCombos, qualityCache) {
  targetCombos = targetCombos || 5;
  const correctEntry = getWordBankIndex(wordBank).byWordId.get(correctWordId);
  if (!correctEntry) return { combinations: [], totalAvailable: 0, reason: "target-not-found" };
  const correctPosFamily = correctEntry._posFamily || "unknown";
  const allCandidates = getRankedByRelation(wordBank, correctEntry);
  if (allCandidates.length < 3) return { combinations: [], totalAvailable: allCandidates.length, reason: "insufficient-candidates" };
  const usable = allCandidates
    .filter(c => c.usable && (c.qualityClass === "P1" || c.qualityClass === "P2") && (c.qualityTier === "A" || c.qualityTier === "B"))
    .sort((a, b) => {
      if (a.qualityClass !== b.qualityClass) return a.qualityClass === "P1" ? -1 : 1;
      if (a.qualityTier !== b.qualityTier) return a.qualityTier === "A" ? -1 : 1;
      const freqDiff = frequencyPenalty(a.wordId) - frequencyPenalty(b.wordId);
      if (freqDiff !== 0) return freqDiff;
      return (b.score || 0) - (a.score || 0);
    });
  if (usable.length < 3) return { combinations: [], totalAvailable: usable.length, totalRanked: allCandidates.length, reason: "insufficient-after-relation-filter" };
  const combinations = [];
  const seenHashes = new Set();
  const correctNorm = (correctMeaning || "").trim();
  const totalU = usable.length;
  const strategies = [];
  for (let step = 1; step <= 4; step++) {
    for (let start = 0; start < Math.min(totalU, 20); start += 5) strategies.push({ start, step });
  }
  const seededStart = makeDeterministicIndex(correctWordId, Math.max(1, totalU - 10));
  for (let ri = 0; ri < 10; ri++) {
    strategies.push({ start: (seededStart + ri * 7) % Math.max(1, totalU - 10), step: 1 });
  }
  for (const strat of strategies) {
    if (combinations.length >= targetCombos) break;
    const picks = [];
    const pickIds = new Set();
    for (let i = strat.start; i < usable.length && picks.length < 3; i += strat.step) {
      const c = usable[i];
      if (!c || c.wordId === correctWordId || pickIds.has(c.wordId)) continue;
      if (glossesCollide(correctNorm, (c.meaningZh || "").trim())) continue;
      const _absFreq = GLOBAL_FREQ.get(c.wordId) || 0;
      if (_absFreq >= MAX_ABS) continue;
      if (_getFreqPct(c.wordId) > MAX_PCT) continue;
            // QualityCache frequency checks (for test audit compatibility)
      if (qualityCache) {
        if (qualityCache.recentDistractorWordIds && qualityCache.recentDistractorWordIds.length > 0) {
          const windowSize = Math.min(30, qualityCache.recentDistractorWordIds.length);
          const recentWin = qualityCache.recentDistractorWordIds.slice(-windowSize);
          const recentCnt = recentWin.filter(id => id === c.wordId).length;
          if (recentCnt >= 2) continue;
        }
        if (qualityCache.targetDistractorHistory && qualityCache.targetDistractorHistory[correctWordId]) {
          const tHist = qualityCache.targetDistractorHistory[correctWordId];
          const recent5 = tHist.slice(-5);
          const inRecent5 = recent5.filter(entry => entry.includes(c.wordId)).length;
          if (inRecent5 >= 2) continue;
        }
      }
      if (!checkSessionLimits(correctWordId, c.wordId, GLOBAL_TOTAL_COMBOS)) continue;
      picks.push(c);
      pickIds.add(c.wordId);
    }
    if (picks.length < 3) continue;
    const meanings = [correctNorm, ...picks.map(p => (p.meaningZh || "").trim())].sort();
    const optionHash = meanings.join("||");
    if (seenHashes.has(optionHash)) continue;
    seenHashes.add(optionHash);
    const score = picks.reduce((sum, p) => sum + (p.score || 0), 0);
    combinations.push({
      distractors: picks.map(p => ({
        meaningZh: p.quizMeaningZh || p.meaningZh,
        quizMeaningZh: p.quizMeaningZh || p.meaningZh,
        meaningDetailedZh: p.meaningDetailedZh || p.quizMeaningZh || p.meaningZh,
        sourceWordId: p.wordId,
        sourceHeadword: p.word || p.displayEnglish,
        displayEnglish: p.displayEnglish || p.word,
        isCorrect: false,
        posFamily: p.posFamily,
        relation: p.relation,
        relationType: p.relationType || p.relation,
        relationReason: p.relationReason || p.reason,
        learnerDistinctionZh: p.learnerDistinctionZh,
        relationEvidence: p.relationEvidence,
        qualityClass: p.qualityClass,
        qualityTier: p.qualityTier,
        relationConfidence: p.confidence,
        senseKey: p.senseKey,
        candidateAxis: p.candidateAxis,
        sourceEvidence: p.sourceEvidence || []
      })),
      hash: optionHash, score, strategy: "relation-ranked"
    });
  }
  combinations.sort((a, b) => b.score - a.score);
  GLOBAL_TOTAL_COMBOS++;
  if (combinations.length > 0) {
    const best = combinations[0];
    for (const d of best.distractors) _incrFreq(d.sourceWordId);
    recordSessionChoice(correctWordId, best.distractors.map(d => d.sourceWordId));
    // Also feed into qualityCache for external tracking
    // qualityCache populated externally by recordDistractorsUsed
  }
  return { combinations, totalAvailable: usable.length, totalRanked: allCandidates.length, correctPosFamily };
}

function makeDeterministicIndex(value, modulo) {
  if (modulo <= 1) return 0;
  let hash = 2166136261;
  const text = String(value || "");
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % modulo;
}
function getRankedByRelation(wordBank, correctEntry) {
  const correctWordId = correctEntry.wordId;
  const correctPosFamily = correctEntry._posFamily || "unknown";
  let scoresByTarget = SCORED_CANDIDATES_BY_BANK.get(wordBank);
  if (!scoresByTarget) {
    scoresByTarget = new Map();
    SCORED_CANDIDATES_BY_BANK.set(wordBank, scoresByTarget);
  }
  const cached = scoresByTarget.get(correctWordId);
  if (cached) return cached;

  let poolsByPos = CANDIDATE_POOLS_BY_BANK.get(wordBank);
  if (!poolsByPos) {
    poolsByPos = new Map();
    CANDIDATE_POOLS_BY_BANK.set(wordBank, poolsByPos);
  }
  let candidates = poolsByPos.get(correctPosFamily);
  if (!candidates) {
    const entries = getWordBankIndex(wordBank).byPosFamily.get(correctPosFamily) || [];
    candidates = [];
    for (const item of entries) {
      const meaningZh = getQuizMeaning(item);
      if (!meaningZh) continue;
      candidates.push({
        wordId: item.wordId,
        word: item.word,
        meaningZh,
        displayEnglish: item.word,
        posFamily: correctPosFamily
      });
    }
    poolsByPos.set(correctPosFamily, candidates);
  }

  const scored = scoreCandidatesByRelation(correctWordId, candidates, false);
  scoresByTarget.set(correctWordId, scored);
  return scored;
}


/**
 * Pre-allocate default combinations for all target words with global 2% frequency enforcement.
 * Sorts words by posFamily to distribute distractor usage evenly across categories.
 * Returns { combinations, stats } where stats includes maxFrequency and any violations.
 */
export function preallocateGlobalCombinations(wordBank) {
  resetGlobalFrequency();
  const results = [];
  const sorted = [...wordBank].sort((a, b) => {
    const pfA = a._posFamily || 'unknown';
    const pfB = b._posFamily || 'unknown';
    if (pfA !== pfB) return pfA.localeCompare(pfB);
    return (b.score || 0) - (a.score || 0);
  });

  for (const entry of sorted) {
    const result = generateDistractorCombinations(wordBank, entry.wordId, entry.meaningZh, 7, null);
    if (result.combinations && result.combinations.length > 0) {
      const best = result.combinations[0];
      results.push({
        wordId: entry.wordId,
        word: entry.word,
        posFamily: entry._posFamily || 'unknown',
        distractors: best.distractors.map(d => ({
          sourceWordId: d.sourceWordId,
          displayEnglish: d.displayEnglish,
          meaningZh: d.meaningZh,
          qualityClass: d.qualityClass,
          qualityTier: d.qualityTier
        }))
      });
    } else {
      results.push({
        wordId: entry.wordId,
        word: entry.word,
        posFamily: entry._posFamily || 'unknown',
        reason: result.reason || 'no-combinations',
        distractors: []
      });
    }
  }

  const freqStats = new Map();
  for (const r of results) {
    for (const d of r.distractors) {
      const id = d.sourceWordId;
      freqStats.set(id, (freqStats.get(id) || 0) + 1);
    }
  }

  let maxFreq = 0;
  let maxFreqId = null;
  const overLimit = [];
  for (const [id, count] of freqStats) {
    if (count > maxFreq) { maxFreq = count; maxFreqId = id; }
    if (count > MAX_ABS) overLimit.push({ wordId: id, count });
  }

  const allDistractorIds = [...freqStats.keys()];
  const totalSlots = results.reduce((s, r) => s + r.distractors.length, 0);

  return {
    combinations: results,
    totalTargetWords: results.length,
    totalDistractorSlots: totalSlots,
    uniqueDistractorsUsed: freqStats.size,
    maxFrequency: maxFreq,
    maxFrequencyWordId: maxFreqId,
    maxFrequencyPct: totalSlots > 0 ? (maxFreq / totalSlots * 100).toFixed(2) : '0',
    overLimit,
    overLimitCount: overLimit.length,
    distractorUsage: [...freqStats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50).map(([id, count]) => ({
      wordId: id,
      count,
      pct: (count / totalSlots * 100).toFixed(2)
    }))
  };
}
export function selectBestCombination(combinations, antiMemCache) {
  if (!combinations || combinations.length === 0) return { combination: null, status: "no_combinations" };
  const history = antiMemCache ? [...antiMemCache.correctPositionHistory] : [];
  for (const combo of combinations) {
    if (antiMemCache && antiMemCache.usedOptionHashes.has(combo.hash)) continue;
    const startPos = antiMemCache ? (antiMemCache.questionOrdinal || 0) % 4 : Math.floor(Math.random() * 4);
    for (let offset = 0; offset < 4; offset++) {
      const posIdx = (startPos + offset) % 4;
      if (wouldRepeatThree(history, posIdx)) continue;
      return { combination: { ...combo, recommendedCorrectPosition: posIdx }, status: "best_match" };
    }
  }
  if (antiMemCache && antiMemCache.usedOptionHashes.size > 0) {
    for (const combo of combinations) {
      for (let posIdx = 0; posIdx < 4; posIdx++) {
        if (!wouldRepeatThree(history, posIdx)) return { combination: { ...combo, recommendedCorrectPosition: posIdx }, status: "antiMemoryFallback" };
      }
    }
    return { combination: { ...combinations[0], recommendedCorrectPosition: 0 }, status: "antiMemoryCollision" };
  }
  return { combination: { ...combinations[0], recommendedCorrectPosition: Math.floor(Math.random() * 4) }, status: "no_cache" };
}

function wouldRepeatThree(history, newIndex) {
  if (history.length < 2) return false;
  return history[history.length-2] === newIndex && history[history.length-1] === newIndex;
}

export { getRankedByRelation as getRankedCandidates, getCatalogStats as getRelationStats };
