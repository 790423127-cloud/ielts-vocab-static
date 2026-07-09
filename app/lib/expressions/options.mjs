// Expressions Mode — distractor/option generation.
// All distractors come from speaking-writing-phrases-700.json only.
// Heuristic similarity based on skillTags / usageTags / register overlap.

/**
 * Seeded PRNG (mulberry32) for deterministic shuffle.
 */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic shuffle with seed.
 */
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
 * Option hash: sorted sourcePhraseIds joined with "||".
 * This is the definitive dedup key for final rendered questions.
 */
export function hashOptionSet(options) {
  const ids = options.map(o => o.sourcePhraseId || "").sort();
  return ids.join("||");
}

/**
 * Heuristic similarity score based ONLY on tag overlap.
 * NOT semantic distance — purely heuristic.
 */
export function heuristicSimilarityScore(entryA, entryB) {
  if (!entryA || !entryB) return 0;
  let score = 0;

  // Shared skillTags: +35 each
  const sA = entryA.skillTags || [];
  const sB = entryB.skillTags || [];
  const sharedSkills = sA.filter(t => sB.includes(t)).length;
  score += sharedSkills * 35;

  // Shared usageTags: +20 each
  const uA = entryA.usageTags || [];
  const uB = entryB.usageTags || [];
  const sharedUsage = uA.filter(t => uB.includes(t)).length;
  score += sharedUsage * 20;

  // Same register: +10
  if (entryA.register && entryA.register === entryB.register) {
    score += 10;
  }

  return Math.min(score, 100);
}

/**
 * Pick N unique distractors from the phrase bank.
 * Returns array of { meaningZh, sourcePhraseId, displayPhrase, similarityScore } objects.
 */
export function pickDistractors(phraseBank, correctPhraseId, correctMeaning, count = 3, recentDistractorIds = []) {
  const correctEntry = phraseBank.find(item => item.id === correctPhraseId);
  const recentSet = new Set(recentDistractorIds || []);

  // Build candidates with similarity scores
  const candidates = phraseBank
    .filter(item => item.id !== correctPhraseId)
    .map(item => ({
      phraseId: item.id,
      meaningZh: item.meaningZh,
      phrase: item.phrase,
      similarityScore: heuristicSimilarityScore(correctEntry, item)
    }));

  // Sort by similarity (high to low) for natural distractors
  candidates.sort((a, b) => b.similarityScore - a.similarityScore);

  const chosen = [];
  const chosenMeanings = new Set();
  const chosenIds = new Set();

  for (const c of candidates) {
    if (chosen.length >= count) break;
    const m = (c.meaningZh || "").trim();
    if (!m) continue;
    if (chosenMeanings.has(m)) continue;
    if (m === correctMeaning) continue;
    if (recentSet.has(c.phraseId)) continue;

    chosen.push({
      meaningZh: m,
      sourcePhraseId: c.phraseId,
      displayPhrase: c.phrase,
      similarityScore: c.similarityScore
    });
    chosenMeanings.add(m);
    chosenIds.add(c.phraseId);
    recentSet.add(c.phraseId);
  }

  // Fallback: any valid candidate
  for (const c of candidates) {
    if (chosen.length >= count) break;
    const m = (c.meaningZh || "").trim();
    if (!m) continue;
    if (chosenMeanings.has(m)) continue;
    if (m === correctMeaning) continue;

    chosen.push({
      meaningZh: m,
      sourcePhraseId: c.phraseId,
      displayPhrase: c.phrase,
      similarityScore: c.similarityScore
    });
    chosenMeanings.add(m);
    chosenIds.add(c.phraseId);
  }

  return chosen;
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