export const PARA_SELF_RATING = Object.freeze({
  UNKNOWN: "unknown",
  KNOW: "know",
  UNCERTAIN: "uncertain",
  DONT_KNOW: "dontKnow"
});

export const PARA_DIRECTION = Object.freeze({
  ANCHOR_TO_MEMBER: "anchorToMember",
  MEMBER_TO_ANCHOR: "memberToAnchor"
});

const DAY_MS = 24 * 60 * 60 * 1000;

export function emptyParaphraseReviewState() {
  return { version: 1, groups: {}, updatedAt: 0 };
}

export function emptyParaphraseReviewEntry() {
  return {
    seenCount: 0,
    recallAttemptCount: 0,
    correctCount: 0,
    wrongCount: 0,
    correctStreak: 0,
    selfRating: PARA_SELF_RATING.UNKNOWN,
    anchorToMemberCorrect: 0,
    memberToAnchorCorrect: 0,
    previewCompleted: false,
    lastReviewedAt: null,
    nextReviewAt: null,
    lastResult: null
  };
}

export function normalizeParaphraseReviewState(raw) {
  const state = emptyParaphraseReviewState();
  if (!raw || typeof raw !== "object") return state;
  const groups = {};
  for (const [groupId, value] of Object.entries(raw.groups || {})) {
    if (!value || typeof value !== "object") continue;
    groups[groupId] = { ...emptyParaphraseReviewEntry(), ...value };
  }
  return {
    version: 1,
    groups,
    updatedAt: Math.max(0, Number(raw.updatedAt) || 0)
  };
}

export function getParaphraseReviewEntry(state, groupId) {
  return {
    ...emptyParaphraseReviewEntry(),
    ...(state?.groups?.[groupId] || {})
  };
}

function patchEntry(stateIn, groupId, patch, now = Date.now()) {
  const state = normalizeParaphraseReviewState(stateIn);
  const current = getParaphraseReviewEntry(state, groupId);
  return {
    ...state,
    groups: {
      ...state.groups,
      [groupId]: { ...current, ...patch }
    },
    updatedAt: now
  };
}

export function markParaphrasePreviewCompleted(state, groupId, now = Date.now()) {
  const current = getParaphraseReviewEntry(state, groupId);
  return patchEntry(state, groupId, {
    previewCompleted: true,
    seenCount: current.seenCount + 1,
    lastReviewedAt: now
  }, now);
}

export function recordParaphraseRecall(state, groupId, rating, now = Date.now()) {
  const allowed = new Set(Object.values(PARA_SELF_RATING));
  const selfRating = allowed.has(rating) ? rating : PARA_SELF_RATING.UNKNOWN;
  const current = getParaphraseReviewEntry(state, groupId);
  const needsSoon = selfRating === PARA_SELF_RATING.UNCERTAIN || selfRating === PARA_SELF_RATING.DONT_KNOW;
  return patchEntry(state, groupId, {
    recallAttemptCount: current.recallAttemptCount + 1,
    selfRating,
    lastReviewedAt: now,
    nextReviewAt: needsSoon ? now + DAY_MS : current.nextReviewAt
  }, now);
}

function intervalDaysForStreak(streak) {
  if (streak <= 1) return 1;
  if (streak === 2) return 3;
  if (streak === 3) return 7;
  return 14;
}

export function recordParaphraseQuizResult(state, groupId, result, now = Date.now()) {
  const current = getParaphraseReviewEntry(state, groupId);
  const correct = Boolean(result?.correct);
  const direction = result?.direction || PARA_DIRECTION.ANCHOR_TO_MEMBER;
  const nextStreak = correct ? current.correctStreak + 1 : 0;
  const directionPatch = correct && direction === PARA_DIRECTION.MEMBER_TO_ANCHOR
    ? { memberToAnchorCorrect: current.memberToAnchorCorrect + 1 }
    : correct
      ? { anchorToMemberCorrect: current.anchorToMemberCorrect + 1 }
      : {};
  return patchEntry(state, groupId, {
    ...directionPatch,
    correctCount: current.correctCount + (correct ? 1 : 0),
    wrongCount: current.wrongCount + (correct ? 0 : 1),
    correctStreak: nextStreak,
    lastResult: correct ? "correct" : "wrong",
    lastReviewedAt: now,
    nextReviewAt: now + (correct ? intervalDaysForStreak(nextStreak) : 1) * DAY_MS
  }, now);
}

export function getLegalQuizDirections(group) {
  const explicit = group?.direction || group?.quizDirection || "";
  if (explicit === "both" || group?.isBidirectional === true) {
    return [PARA_DIRECTION.ANCHOR_TO_MEMBER, PARA_DIRECTION.MEMBER_TO_ANCHOR];
  }
  if (explicit === "member_to_anchor") return [PARA_DIRECTION.MEMBER_TO_ANCHOR];
  return [PARA_DIRECTION.ANCHOR_TO_MEMBER];
}

export function getRecallDirections(group) {
  return group?.members?.length
    ? [PARA_DIRECTION.ANCHOR_TO_MEMBER, PARA_DIRECTION.MEMBER_TO_ANCHOR]
    : [PARA_DIRECTION.ANCHOR_TO_MEMBER];
}

export function chooseRecallDirection(group, entry, rng = Math.random) {
  const directions = getRecallDirections(group);
  if (directions.length === 1) return directions[0];
  if ((entry?.seenCount || 0) % 2 === 1) return PARA_DIRECTION.MEMBER_TO_ANCHOR;
  return rng() < 0.5 ? PARA_DIRECTION.ANCHOR_TO_MEMBER : PARA_DIRECTION.MEMBER_TO_ANCHOR;
}

export function canMarkParaphraseFamiliar(entry, legalDirections, pendingReinsert = false) {
  const current = { ...emptyParaphraseReviewEntry(), ...(entry || {}) };
  if (!current.previewCompleted || current.recallAttemptCount < 1) return false;
  if (current.correctCount < 1 || current.lastResult !== "correct" || pendingReinsert) return false;
  return (legalDirections || [PARA_DIRECTION.ANCHOR_TO_MEMBER]).every((direction) =>
    direction === PARA_DIRECTION.MEMBER_TO_ANCHOR
      ? current.memberToAnchorCorrect > 0
      : current.anchorToMemberCorrect > 0
  );
}

export function isParaphraseDue(entry, now = Date.now()) {
  const value = Number(entry?.nextReviewAt || 0);
  return value > 0 && value <= now;
}

export function getParaphraseReviewPriorities(state, eligibleIds, now = Date.now()) {
  const wrong = [];
  const uncertain = [];
  const due = [];
  for (const id of eligibleIds) {
    const entry = getParaphraseReviewEntry(state, id);
    if (entry.lastResult === "wrong" || entry.selfRating === PARA_SELF_RATING.DONT_KNOW) wrong.push(id);
    else if (entry.selfRating === PARA_SELF_RATING.UNCERTAIN) uncertain.push(id);
    else if (isParaphraseDue(entry, now)) due.push(id);
  }
  return { wrong, uncertain, due };
}
