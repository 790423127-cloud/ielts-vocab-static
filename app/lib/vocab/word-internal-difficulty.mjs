import {
  WORD_INTERNAL_DIFFICULTY_BY_WORD,
  WORD_INTERNAL_DIFFICULTY_VERSION
} from "./word-internal-difficulty.generated.mjs";

export const WORD_INTERNAL_DIFFICULTY_PROFILE_VERSION =
  `${WORD_INTERNAL_DIFFICULTY_VERSION}-word-only-v4-20260804`;

export const WORD_STUDY_DIFFICULTY_TIER = Object.freeze({
  EASIER: "easier",
  STANDARD: "standard",
  HARDER: "harder"
});

export const WORD_STUDY_DIFFICULTY_MODE = Object.freeze({
  DEFAULT: "default",
  EASY_TO_HARD: "easy-to-hard",
  HARD_TO_EASY: "hard-to-easy",
  EASIER_ONLY: "easier-only",
  STANDARD_ONLY: "standard-only",
  HARDER_ONLY: "harder-only"
});

export const WORD_STUDY_DIFFICULTY_MODES = Object.freeze([
  { value: WORD_STUDY_DIFFICULTY_MODE.DEFAULT, label: "难度默认" },
  { value: WORD_STUDY_DIFFICULTY_MODE.EASY_TO_HARD, label: "简单→困难" },
  { value: WORD_STUDY_DIFFICULTY_MODE.HARD_TO_EASY, label: "困难→简单" },
  { value: WORD_STUDY_DIFFICULTY_MODE.EASIER_ONLY, label: "只刷相对较易" },
  { value: WORD_STUDY_DIFFICULTY_MODE.STANDARD_ONLY, label: "只刷常规" },
  { value: WORD_STUDY_DIFFICULTY_MODE.HARDER_ONLY, label: "只刷相对较难" }
]);

const EMPTY_COUNTS = Object.freeze({
  easier: 0,
  standard: 0,
  harder: 0,
  total: 0
});
const INTRINSIC_DIFFICULTY_CACHE = new Map();
const INTERNAL_DIFFICULTY_CACHE = new Map();

function normalizeWord(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function countPatternMatches(value, pattern) {
  return (String(value || "").match(pattern) || []).length;
}

/**
 * Secondary signal for stable ordering when primary scores tie.
 * Lower = relatively easier within the same primary score.
 */
export function wordInternalDifficultySecondary(word) {
  return wordIntrinsicDifficultyScore(word);
}

/**
 * Learning complexity derived from the English surface form itself.
 * It deliberately ignores Chinese meaning length and administrative labels.
 */
export function wordIntrinsicDifficultyScore(word) {
  const key = normalizeWord(word?.word);
  if (INTRINSIC_DIFFICULTY_CACHE.has(key)) {
    return INTRINSIC_DIFFICULTY_CACHE.get(key);
  }
  const letters = key.replace(/[^a-z]/g, "");
  if (!letters) return 50;
  const syllables = Math.max(1, (letters.replace(/e$/, "").match(/[aeiouy]+/g) || []).length);
  const tokenCount = key.split(/[\s-]+/).filter(Boolean).length;
  const rareLetterCount = countPatternMatches(letters, /[jqxz]/g);
  const longConsonantClusters = letters.match(/[bcdfghjklmnpqrstvwxyz]{3,}/g) || [];
  const clusterLoad = longConsonantClusters.reduce(
    (sum, cluster) => sum + Math.max(1, cluster.length - 2),
    0
  );
  const opaquePatternCount = countPatternMatches(
    letters,
    /(?:ough|augh|eigh|queue|sch|tch|dge|ph|rh|ps|mn|gn|kn|wr|eau)/g
  );
  const longDerivationalEnding = /(?:tion|sion|ation|isation|ization|ology|ologist|graphy|metry|phobia|cracy|ence|ance|ment|ness|ity|ative|ively|ically|ability|ibility)$/i.test(letters);
  const prefixedLongWord = letters.length >= 9
    && /^(?:anti|counter|dis|inter|micro|mis|multi|non|over|post|pre|re|sub|super|trans|un)/i.test(letters);

  let score = 6;
  score += Math.max(0, Math.min(42, (letters.length - 2) * 4));
  score += Math.max(0, Math.min(20, (syllables - 1) * 5));
  score += Math.max(0, Math.min(14, (tokenCount - 1) * 7));
  if (key.includes("-")) score += 3;
  score += Math.max(0, Math.min(6, rareLetterCount * 1.5));
  score += Math.max(0, Math.min(8, clusterLoad * 2));
  score += Math.max(0, Math.min(9, opaquePatternCount * 3));
  if (longDerivationalEnding) score += 4;
  if (prefixedLongWord) score += 3;
  const result = Math.round(clamp(score));
  INTRINSIC_DIFFICULTY_CACHE.set(key, result);
  return result;
}

export function normalizeWordStudyDifficultyMode(value) {
  return WORD_STUDY_DIFFICULTY_MODES.some((mode) => mode.value === value)
    ? value
    : WORD_STUDY_DIFFICULTY_MODE.DEFAULT;
}

export function isFixedWordStudyDifficultyMode(value) {
  return normalizeWordStudyDifficultyMode(value) !== WORD_STUDY_DIFFICULTY_MODE.DEFAULT;
}

export function wordInternalDifficultyScore(word) {
  const explicit = Number(word?.studyDifficultyScore);
  if (Number.isFinite(explicit)) return Math.round(clamp(explicit));
  const key = normalizeWord(word?.word);
  if (INTERNAL_DIFFICULTY_CACHE.has(key)) {
    return INTERNAL_DIFFICULTY_CACHE.get(key);
  }
  const intrinsic = wordIntrinsicDifficultyScore(word);
  const generated = WORD_INTERNAL_DIFFICULTY_BY_WORD[key];
  if (Number.isFinite(generated)) {
    // 80% comes from the word itself. Corpus/commonness is only a correction so
    // a short but rare word is not treated exactly like a familiar short word.
    const result = Math.round(clamp(intrinsic * 0.8 + generated * 0.2));
    INTERNAL_DIFFICULTY_CACHE.set(key, result);
    return result;
  }
  INTERNAL_DIFFICULTY_CACHE.set(key, intrinsic);
  return intrinsic;
}

/**
 * Fine-grained sort key for progressive difficulty (easy→hard / hard→easy).
 *
 * Layers (high → low impact):
 * 1. Intrinsic spelling/morphology complexity
 * 2. Blended internal score (80% word shape + 20% commonness)
 * 3. Original queue order only when both word-derived signals are identical
 *
 * A visibly shorter/simpler word shape always sorts first. The blended score
 * (including a serialized studyDifficultyScore in static export) only breaks
 * ties inside the same intrinsic word-shape band.
 */
export function wordInternalDifficultySortKey(word) {
  const primary = wordInternalDifficultyScore(word);
  const intrinsic = wordInternalDifficultySecondary(word);
  return intrinsic * 1000 + Math.min(999, primary);
}

/**
 * Compare two words for easy→hard (direction=1) or hard→easy (direction=-1).
 * Stable: multi-layer sort key, then original list order.
 */
export function compareWordInternalDifficulty(leftWord, rightWord, direction = 1, leftOrder = 0, rightOrder = 0) {
  const dir = direction < 0 ? -1 : 1;
  const leftKey = wordInternalDifficultySortKey(leftWord);
  const rightKey = wordInternalDifficultySortKey(rightWord);
  if (leftKey !== rightKey) return (leftKey - rightKey) * dir;
  return (leftOrder - rightOrder) * dir;
}

function percentile(sortedScores, ratio) {
  if (!sortedScores.length) return 0;
  const index = Math.min(
    sortedScores.length - 1,
    Math.max(0, Math.floor((sortedScores.length - 1) * ratio))
  );
  return sortedScores[index];
}

function scoreGroupBounds(sortedScores) {
  const groups = [];
  for (let index = 0; index < sortedScores.length; index += 1) {
    const score = sortedScores[index];
    const last = groups[groups.length - 1];
    if (last && last.score === score) {
      last.end = index;
      last.size += 1;
    } else {
      groups.push({ score, start: index, end: index, size: 1 });
    }
  }
  return groups;
}

/**
 * Assign tiers with score-group cohesion so equal scores stay in one band,
 * then rebalance empty/near-empty bands when the pool allows.
 */
function assignTiersFromSortedScores(sortedScores) {
  const n = sortedScores.length;
  if (!n) {
    return {
      easierMax: 0,
      harderMin: 0,
      tiers: [],
      counts: { ...EMPTY_COUNTS }
    };
  }

  let easierMax = percentile(sortedScores, 0.3);
  let harderMin = percentile(sortedScores, 0.7);

  // Degenerate spread: expand cuts using score groups.
  if (easierMax >= harderMin) {
    const unique = [...new Set(sortedScores)];
    if (unique.length >= 3) {
      easierMax = unique[Math.max(0, Math.floor((unique.length - 1) * 0.3))];
      harderMin = unique[Math.min(unique.length - 1, Math.ceil((unique.length - 1) * 0.7))];
    } else if (unique.length === 2) {
      easierMax = unique[0];
      harderMin = unique[1];
    }
  }

  let tiers = sortedScores.map((score) => {
    if (score <= easierMax) return WORD_STUDY_DIFFICULTY_TIER.EASIER;
    if (score >= harderMin) return WORD_STUDY_DIFFICULTY_TIER.HARDER;
    return WORD_STUDY_DIFFICULTY_TIER.STANDARD;
  });

  const recount = () => {
    const counts = { easier: 0, standard: 0, harder: 0, total: n };
    tiers.forEach((tier) => {
      counts[tier] += 1;
    });
    return counts;
  };

  let counts = recount();
  const groups = scoreGroupBounds(sortedScores);
  const minBand = Math.max(1, Math.floor(n * 0.12));

  // If easier band is empty/too thin, pull the next lowest score group into easier.
  if (counts.easier < minBand) {
    const nextGroup = groups.find((group) => group.score > easierMax);
    if (nextGroup && counts.standard + counts.harder > minBand) {
      easierMax = nextGroup.score;
      tiers = sortedScores.map((score) => {
        if (score <= easierMax) return WORD_STUDY_DIFFICULTY_TIER.EASIER;
        if (score >= harderMin && harderMin > easierMax) return WORD_STUDY_DIFFICULTY_TIER.HARDER;
        return WORD_STUDY_DIFFICULTY_TIER.STANDARD;
      });
      counts = recount();
    }
  }

  // If harder band is empty/too thin, pull the previous highest score group into harder.
  if (counts.harder < minBand) {
    const prevGroup = [...groups].reverse().find((group) => group.score < harderMin);
    if (prevGroup && prevGroup.score > easierMax && counts.easier + counts.standard > minBand) {
      harderMin = prevGroup.score;
      tiers = sortedScores.map((score) => {
        if (score <= easierMax) return WORD_STUDY_DIFFICULTY_TIER.EASIER;
        if (score >= harderMin) return WORD_STUDY_DIFFICULTY_TIER.HARDER;
        return WORD_STUDY_DIFFICULTY_TIER.STANDARD;
      });
      counts = recount();
    }
  }

  // Keep equal scores cohesive if a threshold split a single score across bands.
  // (Should not happen with score thresholds, but re-assert after rebalance.)
  groups.forEach((group) => {
    const slice = tiers.slice(group.start, group.end + 1);
    const uniqueTiers = [...new Set(slice)];
    if (uniqueTiers.length <= 1) return;
    const preferred = uniqueTiers.sort((left, right) => {
      const rank = {
        [WORD_STUDY_DIFFICULTY_TIER.EASIER]: 0,
        [WORD_STUDY_DIFFICULTY_TIER.STANDARD]: 1,
        [WORD_STUDY_DIFFICULTY_TIER.HARDER]: 2
      };
      return rank[left] - rank[right];
    })[Math.floor((uniqueTiers.length - 1) / 2)];
    for (let index = group.start; index <= group.end; index += 1) {
      tiers[index] = preferred;
    }
  });
  counts = recount();

  return { easierMax, harderMin, tiers, counts };
}

export function createWordInternalDifficultyProfile(words) {
  const list = Array.isArray(words) ? words : [];
  const scored = list.map((word, order) => ({
    word,
    order,
    key: normalizeWord(word?.word),
    score: wordInternalDifficultyScore(word),
    secondary: wordInternalDifficultySecondary(word)
  }));

  scored.sort((left, right) => (
    left.score - right.score
    || left.secondary - right.secondary
    || left.order - right.order
  ));

  const scores = scored.map((item) => item.score);
  const uniqueScoreCount = new Set(scores).size;
  const available = scores.length >= 6 && uniqueScoreCount >= 3;

  if (!available) {
    return {
      version: WORD_INTERNAL_DIFFICULTY_PROFILE_VERSION,
      available: false,
      easierMax: 0,
      harderMin: 0,
      counts: {
        easier: 0,
        standard: scores.length,
        harder: 0,
        total: scores.length
      },
      // Word-key → tier for O(1) lookups when ranking is available.
      tierByWord: Object.freeze(Object.create(null))
    };
  }

  const assignment = assignTiersFromSortedScores(scores);
  const tierByWord = Object.create(null);
  scored.forEach((item, index) => {
    if (!item.key) return;
    // First occurrence wins for duplicate headwords in a pool.
    if (tierByWord[item.key] == null) {
      tierByWord[item.key] = assignment.tiers[index];
    }
  });

  return {
    version: WORD_INTERNAL_DIFFICULTY_PROFILE_VERSION,
    available: true,
    easierMax: assignment.easierMax,
    harderMin: assignment.harderMin,
    counts: assignment.counts,
    tierByWord: Object.freeze(tierByWord)
  };
}

export function wordInternalDifficultyTier(word, profile) {
  if (!profile?.available) return WORD_STUDY_DIFFICULTY_TIER.STANDARD;

  const key = normalizeWord(word?.word);
  if (key && profile.tierByWord && profile.tierByWord[key]) {
    return profile.tierByWord[key];
  }

  const score = wordInternalDifficultyScore(word);
  if (score <= profile.easierMax) return WORD_STUDY_DIFFICULTY_TIER.EASIER;
  if (score >= profile.harderMin) return WORD_STUDY_DIFFICULTY_TIER.HARDER;
  return WORD_STUDY_DIFFICULTY_TIER.STANDARD;
}

export function difficultyModeTier(value) {
  const mode = normalizeWordStudyDifficultyMode(value);
  if (mode === WORD_STUDY_DIFFICULTY_MODE.EASIER_ONLY) {
    return WORD_STUDY_DIFFICULTY_TIER.EASIER;
  }
  if (mode === WORD_STUDY_DIFFICULTY_MODE.STANDARD_ONLY) {
    return WORD_STUDY_DIFFICULTY_TIER.STANDARD;
  }
  if (mode === WORD_STUDY_DIFFICULTY_MODE.HARDER_ONLY) {
    return WORD_STUDY_DIFFICULTY_TIER.HARDER;
  }
  return "";
}

export function difficultyModeDirection(value) {
  const mode = normalizeWordStudyDifficultyMode(value);
  if (mode === WORD_STUDY_DIFFICULTY_MODE.HARD_TO_EASY) return -1;
  if (mode === WORD_STUDY_DIFFICULTY_MODE.EASY_TO_HARD) return 1;
  return 0;
}

/**
 * Filter words by relative tier. If the requested band is empty after a tiny
 * pool rebalance failure, expand one score step toward the center so the
 * learner is never left with a blank queue after choosing a tier.
 */
export function filterWordsByDifficultyTier(words, profile, tier) {
  const list = Array.isArray(words) ? words : [];
  if (!tier || !profile?.available) return list;

  const matched = list.filter((word) => wordInternalDifficultyTier(word, profile) === tier);
  if (matched.length) return matched;

  // Soft expansion: include nearest scores toward the middle band.
  const scored = list
    .map((word, order) => ({ word, order, score: wordInternalDifficultyScore(word) }))
    .sort((left, right) => left.score - right.score || left.order - right.order);

  if (!scored.length) return list;

  if (tier === WORD_STUDY_DIFFICULTY_TIER.EASIER) {
    const limit = scored[Math.max(0, Math.floor((scored.length - 1) * 0.35))].score;
    return scored.filter((item) => item.score <= limit).map((item) => item.word);
  }
  if (tier === WORD_STUDY_DIFFICULTY_TIER.HARDER) {
    const limit = scored[Math.min(scored.length - 1, Math.ceil((scored.length - 1) * 0.65))].score;
    return scored.filter((item) => item.score >= limit).map((item) => item.word);
  }

  const low = scored[Math.max(0, Math.floor((scored.length - 1) * 0.25))].score;
  const high = scored[Math.min(scored.length - 1, Math.ceil((scored.length - 1) * 0.75))].score;
  const mid = scored.filter((item) => item.score >= low && item.score <= high).map((item) => item.word);
  return mid.length ? mid : list;
}

export function difficultyModeOptionLabel(mode, counts = null) {
  const base = WORD_STUDY_DIFFICULTY_MODES.find((item) => item.value === mode)?.label
    || WORD_STUDY_DIFFICULTY_MODES[0].label;
  if (!counts || !counts.total) return base;

  if (mode === WORD_STUDY_DIFFICULTY_MODE.EASIER_ONLY) {
    return `${base}（${counts.easier}）`;
  }
  if (mode === WORD_STUDY_DIFFICULTY_MODE.STANDARD_ONLY) {
    return `${base}（${counts.standard}）`;
  }
  if (mode === WORD_STUDY_DIFFICULTY_MODE.HARDER_ONLY) {
    return `${base}（${counts.harder}）`;
  }
  if (
    mode === WORD_STUDY_DIFFICULTY_MODE.EASY_TO_HARD
    || mode === WORD_STUDY_DIFFICULTY_MODE.HARD_TO_EASY
  ) {
    return `${base}（${counts.total}）`;
  }
  return `${base}（${counts.total}）`;
}

export function listWordStudyDifficultyModeOptions(profile = null) {
  const counts = profile?.available ? profile.counts : null;
  return WORD_STUDY_DIFFICULTY_MODES.map((option) => ({
    value: option.value,
    label: difficultyModeOptionLabel(option.value, counts),
    count: counts
      ? option.value === WORD_STUDY_DIFFICULTY_MODE.EASIER_ONLY
        ? counts.easier
        : option.value === WORD_STUDY_DIFFICULTY_MODE.STANDARD_ONLY
          ? counts.standard
          : option.value === WORD_STUDY_DIFFICULTY_MODE.HARDER_ONLY
            ? counts.harder
            : counts.total
      : null
  }));
}
