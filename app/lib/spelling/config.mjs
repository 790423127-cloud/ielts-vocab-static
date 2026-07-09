export const SPELLING_REPAIR_CONFIG = {
  repairStreakRequired: 2,
  repairStreakRequiredHighError: 2,
  highErrorThreshold: 2,
  repairMinOtherWords: 5,
  repairMinMinutes: 3,
  forceRepairReviewAfterOtherWords: 20,
  forceRepairReviewAfterMinutes: 15,
  longTermIntervalsDays: [1, 3, 7, 15, 30, 60]
};

export const SPELLING_DB_CONFIG = {
  dbName: "ielts_vocab_spelling_v2",
  version: 1,
  stores: {
    wordSpellingProgress: "word-spelling-progress",
    wordErrorBank: "word-error-bank",
    wordTodayRepairQueue: "word-today-repair-queue",
    wordSrs: "word-srs",
    phraseSpellingProgress: "phrase-spelling-progress",
    phraseErrorBank: "phrase-error-bank",
    phraseTodayRepairQueue: "phrase-today-repair-queue",
    phraseSrs: "phrase-srs"
  }
};

export const MS_PER_MINUTE = 60 * 1000;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;
