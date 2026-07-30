import {
  WORD_INTERNAL_DIFFICULTY_BY_WORD,
  WORD_INTERNAL_DIFFICULTY_VERSION
} from "./word-internal-difficulty.generated.mjs";

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

function normalizeWord(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function countParts(value, pattern) {
  return String(value || "").split(pattern).map((item) => item.trim()).filter(Boolean).length;
}

function fallbackDifficultyScore(word) {
  const key = normalizeWord(word?.word);
  const letters = key.replace(/[^a-z]/g, "");
  const syllables = Math.max(1, (letters.replace(/e$/, "").match(/[aeiouy]+/g) || []).length);
  const posParts = Math.max(1, countParts(word?.pos, /[/,;|]+|\s+or\s+/i));
  const meaningParts = Math.max(1, countParts(word?.meaning, /[;；,，、/]+/));
  const familySize = Array.isArray(word?.wordFamily) ? word.wordFamily.length : 0;
  let score = 31;

  score += Math.max(0, Math.min(13, (letters.length - 4) * 1.3));
  score += Math.max(0, Math.min(9, (syllables - 1) * 2.25));
  score += Math.max(0, Math.min(6, (posParts - 1) * 2));
  score += Math.max(0, Math.min(7, (meaningParts - 1) * 1.4));
  if (/[\s-]/.test(key)) score += 4;
  if (familySize > 0) score -= 3;
  return Math.round(clamp(score));
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
  const generated = WORD_INTERNAL_DIFFICULTY_BY_WORD[normalizeWord(word?.word)];
  return Number.isFinite(generated) ? generated : fallbackDifficultyScore(word);
}

function percentile(sortedScores, ratio) {
  if (!sortedScores.length) return 0;
  const index = Math.min(
    sortedScores.length - 1,
    Math.max(0, Math.floor((sortedScores.length - 1) * ratio))
  );
  return sortedScores[index];
}

export function createWordInternalDifficultyProfile(words) {
  const list = Array.isArray(words) ? words : [];
  const scores = list.map(wordInternalDifficultyScore).sort((left, right) => left - right);
  const available = scores.length >= 6 && new Set(scores).size >= 3;

  return {
    version: WORD_INTERNAL_DIFFICULTY_VERSION,
    available,
    easierMax: percentile(scores, 0.3),
    harderMin: percentile(scores, 0.7)
  };
}

export function wordInternalDifficultyTier(word, profile) {
  const score = wordInternalDifficultyScore(word);
  if (!profile?.available) return WORD_STUDY_DIFFICULTY_TIER.STANDARD;
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
