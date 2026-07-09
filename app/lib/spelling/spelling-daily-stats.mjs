export const ACTIVE_LEARNING_IDLE_MS = 30_000;
export const MAX_INITIAL_READING_MS = 8_000;
export const RESUME_LEARNING_ACTION_MS = 1_000;
export const MAX_COMPLETION_TAIL_MS = 5_000;

export function toLocalDayKey(now = Date.now()) {
  const date = new Date(now);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createSpellingDailyStats(options = {}) {
  return {
    date: options.date ?? toLocalDayKey(options.now),
    learnedWordIds: [],
    wrongWordIds: [],
    totalAttempts: 0,
    correctAttempts: 0,
    activeMs: 0
  };
}

export function normalizeSpellingDailyStats(stats, options = {}) {
  const date = options.date || toLocalDayKey(options.now);
  if (!stats || stats.date !== date) return createSpellingDailyStats({ date });

  return {
    date,
    learnedWordIds: [...new Set((stats.learnedWordIds || []).filter(Boolean))],
    wrongWordIds: [...new Set((stats.wrongWordIds || []).filter(Boolean))],
    totalAttempts: Math.max(0, Number(stats.totalAttempts || 0)),
    correctAttempts: Math.max(0, Number(stats.correctAttempts || 0)),
    activeMs: Math.max(0, Number(stats.activeMs || 0))
  };
}

export function recordSpellingDailyAttempt(stats, attempt = {}, options = {}) {
  const next = normalizeSpellingDailyStats(stats, options);
  const wordId = String(attempt.wordId || "").trim();
  if (!wordId || attempt.skipped) return next;

  const learnedWordIds = new Set(next.learnedWordIds);
  const wrongWordIds = new Set(next.wrongWordIds);
  learnedWordIds.add(wordId);
  if (attempt.isCorrect === false) wrongWordIds.add(wordId);

  return {
    ...next,
    learnedWordIds: [...learnedWordIds],
    wrongWordIds: [...wrongWordIds],
    totalAttempts: next.totalAttempts + 1,
    correctAttempts: next.correctAttempts + (attempt.isCorrect ? 1 : 0),
    activeMs: next.activeMs + Math.max(0, Number(attempt.activeMs || 0))
  };
}

export function recordSpellingDailyActiveTime(stats, activeMs = 0, options = {}) {
  const next = normalizeSpellingDailyStats(stats, options);
  return {
    ...next,
    activeMs: next.activeMs + Math.max(0, Number(activeMs || 0))
  };
}

export function createLearningActivity(options = {}) {
  return {
    questionShownAt: Number(options.now ?? Date.now()),
    lastActivityAt: 0,
    activeMs: 0,
    engaged: false,
    activityEvents: 0
  };
}

export function recordLearningActivity(activity, options = {}) {
  const now = Number(options.now ?? Date.now());
  const current = activity || createLearningActivity({ now });
  if (options.meaningful === false) return current;

  const gap = current.lastActivityAt ? Math.max(0, now - current.lastActivityAt) : 0;
  let incrementMs = 0;

  if (!current.engaged) {
    const sinceQuestionShown = Math.max(0, now - Number(current.questionShownAt || now));
    incrementMs = sinceQuestionShown <= ACTIVE_LEARNING_IDLE_MS
      ? Math.min(sinceQuestionShown, MAX_INITIAL_READING_MS)
      : RESUME_LEARNING_ACTION_MS;
    incrementMs = Math.max(RESUME_LEARNING_ACTION_MS, incrementMs);
  } else if (gap <= ACTIVE_LEARNING_IDLE_MS) {
    incrementMs = gap;
  } else {
    incrementMs = RESUME_LEARNING_ACTION_MS;
  }

  return {
    ...current,
    lastActivityAt: now,
    activeMs: current.activeMs + incrementMs,
    engaged: true,
    activityEvents: Math.max(0, Number(current.activityEvents || 0)) + 1
  };
}

export function finishLearningActivity(activity, options = {}) {
  const now = Number(options.now ?? Date.now());
  const current = activity || createLearningActivity({ now });
  const gap = current.lastActivityAt ? Math.max(0, now - current.lastActivityAt) : 0;
  const tailMs = !current.engaged
    ? 0
    : gap <= ACTIVE_LEARNING_IDLE_MS
      ? Math.min(gap, MAX_COMPLETION_TAIL_MS)
      : RESUME_LEARNING_ACTION_MS;
  const measuredMs = current.activeMs + tailMs;

  return {
    activeMs: current.engaged ? measuredMs : 0,
    next: createLearningActivity({ now })
  };
}

export function formatActiveLearningTime(activeMs = 0) {
  const milliseconds = Math.max(0, Number(activeMs || 0));
  const totalSeconds = milliseconds > 0 ? Math.max(1, Math.round(milliseconds / 1_000)) : 0;
  if (!totalSeconds) return "0 秒";
  if (totalSeconds < 60) return `${totalSeconds} 秒`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分钟`;
}
