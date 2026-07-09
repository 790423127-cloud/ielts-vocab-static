import { MS_PER_DAY, MS_PER_MINUTE, SPELLING_REPAIR_CONFIG } from "./config.mjs";
import {
  REPAIR_STATES,
  getRepairStreak,
  getRepairStreakRequired,
  isRepairRevisitEligible,
  isRepairRevisitForced,
  normalizeTodayRepairFields
} from "./repair-progress.mjs";
import { normalizeSpellingAnswer } from "./word-id.mjs";

export {
  isRepairRevisitEligible,
  isRepairRevisitForced,
  isRepairRevisitEligible as isWaitingSecondEligible,
  isRepairRevisitForced as isWaitingSecondForced
} from "./repair-progress.mjs";

export function toSessionDate(now = Date.now()) {
  const date = new Date(now);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function severityForWrongCount(count) {
  if (count >= 4) return "high";
  if (count >= 2) return "medium";
  return "low";
}

export function createSpellingRecord(wordId, options = {}) {
  const now = Number(options.now || Date.now());
  const sessionDate = options.sessionDate || toSessionDate(now);

  return {
    wordId: String(wordId || ""),
    spelling: {
      totalAttempts: 0,
      correctAttempts: 0,
      wrongAttempts: 0,
      lastAnswer: "",
      lastAttemptAt: 0,
      hintLevel: 0
    },
    today: {
      sessionDate,
      activeInTodayList: true,
      completedToday: false,
      repairState: REPAIR_STATES.NORMAL,
      repairStreak: 0,
      repairCorrectCount: 0,
      passedViaNew: false,
      passedViaRepair: false,
      repairLocked: false,
      nextEligibleAt: 0,
      minOtherWordsBeforeNext: 0,
      lastSeenSequence: 0,
      lastSeenAt: 0,
      currentErrorCount: 0
    },
    errorBank: {
      everWrong: false,
      totalWrongCount: 0,
      totalCorrectCount: 0,
      latestWrongAt: 0,
      lastWrongAnswer: "",
      active: false,
      severity: "low"
    },
    srs: {
      stage: 0,
      nextReviewAt: 0,
      lastReviewedAt: 0
    },
    updatedAt: now,
    revision: 0
  };
}

export function migrateLegacySpellingRecord(record, options = {}) {
  if (!record || typeof record !== "object") return { record, changed: false };

  const now = Number(options.now || Date.now());
  const next = clone(record);
  const repairState = normalizeTodayRepairFields(next.today || {}).repairState;
  const completed = repairState === REPAIR_STATES.MASTERED || Boolean(next.today?.completedToday);
  const needsErrorBankRetention = Boolean(next.errorBank?.everWrong && next.errorBank.active !== true);
  const needsSrsBootstrap = Boolean(next.errorBank?.everWrong && completed && !Number(next.srs?.nextReviewAt || 0));

  if (!needsErrorBankRetention && !needsSrsBootstrap) return { record: next, changed: false };

  if (next.errorBank?.everWrong) next.errorBank.active = true;
  next.srs = { stage: 0, nextReviewAt: 0, lastReviewedAt: 0, ...(next.srs || {}) };

  if (needsSrsBootstrap && !Number(next.srs.nextReviewAt || 0)) {
    const anchor = Number(next.today?.lastSeenAt || next.updatedAt || now);
    next.srs.stage = Math.max(1, Number(next.srs.stage || 0));
    next.srs.lastReviewedAt = Math.max(Number(next.srs.lastReviewedAt || 0), anchor);
    next.srs.nextReviewAt = anchor + SPELLING_REPAIR_CONFIG.longTermIntervalsDays[0] * MS_PER_DAY;
  }

  next.updatedAt = now;
  next.revision = Number(next.revision || 0) + 1;
  next.dirty = true;
  return { record: next, changed: true };
}

export function rolloverSpellingRecordForSession(record, options = {}) {
  if (!record || typeof record !== "object") return { record, changed: false };

  const now = Number(options.now || Date.now());
  const sessionDate = options.sessionDate || toSessionDate(now);
  const previousToday = normalizeTodayRepairFields(record.today || {});

  if (!previousToday.sessionDate || previousToday.sessionDate === sessionDate) {
    return { record, changed: false };
  }

  const next = clone(record);
  const pendingRepair = previousToday.repairState === REPAIR_STATES.IN_REPAIR;
  const freshToday = createSpellingRecord(next.wordId, { now, sessionDate }).today;

  next.today = pendingRepair
    ? {
        ...freshToday,
        repairState: REPAIR_STATES.IN_REPAIR,
        repairStreak: getRepairStreak({ today: previousToday }),
        repairCorrectCount: getRepairStreak({ today: previousToday }),
        repairLocked: Boolean(previousToday.repairLocked),
        nextEligibleAt: Number(previousToday.nextEligibleAt || 0),
        minOtherWordsBeforeNext: Number(previousToday.minOtherWordsBeforeNext || 0),
        currentErrorCount: Number(previousToday.currentErrorCount || 0)
      }
    : freshToday;

  if (next.errorBank?.everWrong) next.errorBank.active = true;
  next.updatedAt = now;
  next.revision = Number(next.revision || 0) + 1;
  next.dirty = true;

  return { record: next, changed: true };
}

function ensureRecord(record, options) {
  if (!record || typeof record !== "object") {
    return createSpellingRecord(options.wordId || "", options);
  }

  const base = createSpellingRecord(record.wordId || options.wordId || "", options);
  const merged = {
    ...base,
    ...clone(record),
    spelling: { ...base.spelling, ...(record.spelling || {}) },
    today: { ...base.today, ...(record.today || {}) },
    errorBank: { ...base.errorBank, ...(record.errorBank || {}) },
    srs: { ...base.srs, ...(record.srs || {}) }
  };

  merged.today = normalizeTodayRepairFields(merged.today);
  return rolloverSpellingRecordForSession(merged, options).record;
}

export function isSpellingAnswerCorrect(answer, expectedAnswer, acceptedAnswers = []) {
  const normalized = normalizeSpellingAnswer(answer);
  const accepted = [expectedAnswer, ...acceptedAnswers]
    .map(normalizeSpellingAnswer)
    .filter(Boolean);

  return accepted.includes(normalized);
}

function advanceSrsAfterCorrect(record, now) {
  const currentStage = Number(record.srs.stage || 0);
  const nextStage = Math.min(currentStage + 1, SPELLING_REPAIR_CONFIG.longTermIntervalsDays.length);
  const intervalDays = SPELLING_REPAIR_CONFIG.longTermIntervalsDays[Math.max(0, nextStage - 1)] || 0;

  record.srs = {
    stage: nextStage,
    lastReviewedAt: now,
    nextReviewAt: intervalDays ? now + intervalDays * MS_PER_DAY : 0
  };
}

function markMastered(record, now, sequence, options = {}) {
  record.today.repairState = REPAIR_STATES.MASTERED;
  record.today.completedToday = true;
  record.today.activeInTodayList = false;
  record.today.lastSeenSequence = sequence;
  record.today.lastSeenAt = now;
  record.today.currentErrorCount = 0;
  record.today.repairLocked = false;
  record.today.passedViaNew = Boolean(options.passedViaNew);
  record.today.passedViaRepair = Boolean(options.passedViaRepair);

  if (record.errorBank?.everWrong) {
    record.errorBank.active = true;
  }
}

function scheduleRepairRevisit(record, now, sequence) {
  record.today.nextEligibleAt = now + SPELLING_REPAIR_CONFIG.repairMinMinutes * MS_PER_MINUTE;
  record.today.minOtherWordsBeforeNext = SPELLING_REPAIR_CONFIG.repairMinOtherWords;
  record.today.lastSeenSequence = sequence;
  record.today.lastSeenAt = now;
}

function applyWrong(record, answer, now, sequence) {
  const nextErrorCount = Number(record.today.currentErrorCount || 0) + 1;
  const totalWrongCount = Number(record.errorBank.totalWrongCount || 0) + 1;

  record.spelling.totalAttempts += 1;
  record.spelling.wrongAttempts += 1;
  record.spelling.lastAnswer = String(answer || "");
  record.spelling.lastAttemptAt = now;
  record.spelling.hintLevel = nextErrorCount;

  record.today.activeInTodayList = true;
  record.today.completedToday = false;
  record.today.repairState = REPAIR_STATES.IN_REPAIR;
  record.today.repairStreak = 0;
  record.today.repairCorrectCount = 0;
  record.today.passedViaNew = false;
  record.today.passedViaRepair = false;
  record.today.nextEligibleAt = 0;
  record.today.minOtherWordsBeforeNext = 0;
  record.today.lastSeenSequence = sequence;
  record.today.lastSeenAt = now;
  record.today.currentErrorCount = nextErrorCount;
  record.today.repairLocked = true;

  record.errorBank.everWrong = true;
  record.errorBank.totalWrongCount = totalWrongCount;
  record.errorBank.latestWrongAt = now;
  record.errorBank.lastWrongAnswer = String(answer || "");
  record.errorBank.active = true;
  record.errorBank.severity = severityForWrongCount(totalWrongCount);

  record.srs.stage = 0;
  record.srs.nextReviewAt = 0;

  return { record, isCorrect: false, canAdvance: false };
}

function applyCorrect(record, now, sequence) {
  record.spelling.totalAttempts += 1;
  record.spelling.correctAttempts += 1;
  record.spelling.lastAttemptAt = now;
  record.spelling.hintLevel = 0;
  record.errorBank.totalCorrectCount += 1;

  const state = normalizeTodayRepairFields(record.today).repairState;

  if (state === REPAIR_STATES.IN_REPAIR) {
    const nextStreak = getRepairStreak(record) + 1;
    const required = getRepairStreakRequired(record);

    record.today.repairStreak = nextStreak;
    record.today.repairCorrectCount = nextStreak;

    if (nextStreak >= required) {
      markMastered(record, now, sequence, { passedViaRepair: true });
      advanceSrsAfterCorrect(record, now);
      return { record, isCorrect: true, canAdvance: true };
    }

    record.today.repairState = REPAIR_STATES.IN_REPAIR;
    record.today.activeInTodayList = true;
    record.today.completedToday = false;
    record.today.currentErrorCount = 0;
    record.today.repairLocked = false;
    scheduleRepairRevisit(record, now, sequence);
    return { record, isCorrect: true, canAdvance: true };
  }

  markMastered(record, now, sequence, { passedViaNew: true });

  if (record.srs.nextReviewAt && record.srs.nextReviewAt <= now) {
    advanceSrsAfterCorrect(record, now);
  }

  return { record, isCorrect: true, canAdvance: true };
}

export function markSpellingFamiliar(record, options = {}) {
  const now = Number(options.now || Date.now());
  const sequence = Number(options.sequence || 0);
  const current = ensureRecord(record, options);

  if (current.today.repairState === REPAIR_STATES.IN_REPAIR) {
    return { record: current, canAdvance: false };
  }

  current.today.sessionDate = options.sessionDate || current.today.sessionDate || toSessionDate(now);
  markMastered(current, now, sequence, { passedViaNew: true });
  current.updatedAt = now;
  current.revision = Number(current.revision || 0) + 1;

  return { record: current, canAdvance: true };
}

export function enqueueSpellingPriorityReview(record, options = {}) {
  const now = Number(options.now || Date.now());
  const sequence = Number(options.sequence || 0);
  const current = ensureRecord(record, options);
  const totalWrongCount = Math.max(1, Number(current.errorBank.totalWrongCount || 0));

  current.today.sessionDate = options.sessionDate || current.today.sessionDate || toSessionDate(now);
  current.today.activeInTodayList = true;
  current.today.completedToday = false;
  current.today.repairState = REPAIR_STATES.IN_REPAIR;
  current.today.repairStreak = 0;
  current.today.repairCorrectCount = 0;
  current.today.passedViaNew = false;
  current.today.passedViaRepair = false;
  current.today.currentErrorCount = Math.max(1, Number(current.today.currentErrorCount || 0));
  scheduleRepairRevisit(current, now, sequence);

  current.errorBank.everWrong = true;
  current.errorBank.totalWrongCount = totalWrongCount;
  current.errorBank.latestWrongAt = now;
  current.errorBank.lastWrongAnswer = String(options.note || "★重点复习");
  current.errorBank.active = true;
  current.errorBank.severity = severityForWrongCount(totalWrongCount);

  current.srs.stage = 0;
  current.srs.nextReviewAt = 0;
  current.updatedAt = now;
  current.revision = Number(current.revision || 0) + 1;

  return { record: current, canAdvance: true };
}

export function submitSpellingAnswer(record, options = {}) {
  const now = Number(options.now || Date.now());
  const sequence = Number(options.sequence || 0);
  const current = ensureRecord(record, options);
  const answer = String(options.answer || "");
  const correct = isSpellingAnswerCorrect(answer, options.expectedAnswer, options.acceptedAnswers);

  current.today.sessionDate = options.sessionDate || current.today.sessionDate || toSessionDate(now);
  current.updatedAt = now;
  current.revision = Number(current.revision || 0) + 1;
  current.spelling.lastAnswer = answer;

  const result = correct
    ? applyCorrect(current, now, sequence)
    : applyWrong(current, answer, now, sequence);

  return {
    ...result,
    record: current
  };
}

function chunkWord(word) {
  const text = String(word || "").trim();
  if (text.length <= 3) return text;

  const chunks = [];
  let i = 0;

  while (i < text.length) {
    const remaining = text.length - i;
    const size = remaining <= 2 ? remaining : remaining === 4 ? 2 : 3;
    chunks.push(text.slice(i, i + size));
    i += size;
  }

  return chunks.join(" · ");
}

export function getSpellingHint(word, hintLevel = 0) {
  const text = typeof word === "object" ? String(word.word || word.answer || "") : String(word || "");
  const manualHint = typeof word === "object" ? String(word.spellingHint || "").trim() : "";

  if (hintLevel <= 0) return "";
  if (hintLevel === 1) return "_ ".repeat(Math.max(1, text.length)).trim();
  if (manualHint) return manualHint;
  if (hintLevel === 2) return chunkWord(text);
  return text;
}
