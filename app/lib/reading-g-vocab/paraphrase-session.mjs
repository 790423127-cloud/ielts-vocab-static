import { PARA_SESSION_SIZE } from "./paraphrase-cycle.mjs";

export const PARA_LEARNING_STAGE = Object.freeze({
  PREVIEW: "preview",
  RECALL: "recall",
  QUIZ: "quiz",
  FEEDBACK: "feedback",
  SUMMARY: "summary"
});

export function emptyParaphraseSession() {
  return {
    version: 1,
    mode: "guided",
    sessionId: "",
    currentSessionGroupIds: [],
    sessionTaskKinds: [],
    baseGroupCount: 0,
    currentIndex: 0,
    currentLearningStage: PARA_LEARNING_STAGE.PREVIEW,
    currentDirection: "anchorToMember",
    currentCycleIndex: 0,
    wrongReinsertQueue: [],
    uncertainReinsertQueue: [],
    sessionResults: [],
    currentQuestion: null,
    selectedIndex: null,
    startedAt: 0,
    updatedAt: 0,
    completed: false
  };
}

export function normalizeParaphraseSession(raw) {
  if (!raw || typeof raw !== "object") return null;
  const mode = ["guided", "quick", "full", "wrongReview"].includes(raw.mode)
    ? raw.mode
    : "guided";
  const ids = Array.isArray(raw.currentSessionGroupIds)
    ? raw.currentSessionGroupIds.map(String)
    : [];
  if (!ids.length || raw.completed) return null;
  return {
    ...emptyParaphraseSession(),
    ...raw,
    version: 1,
    mode,
    currentSessionGroupIds: ids,
    sessionTaskKinds: Array.isArray(raw.sessionTaskKinds)
      ? raw.sessionTaskKinds.map(String)
      : ids.map(() => "new"),
    baseGroupCount: Math.max(1, Number(raw.baseGroupCount) || Math.min(ids.length, PARA_SESSION_SIZE[mode] || ids.length)),
    currentIndex: Math.min(Math.max(0, Number(raw.currentIndex) || 0), ids.length - 1),
    wrongReinsertQueue: Array.isArray(raw.wrongReinsertQueue) ? raw.wrongReinsertQueue.map(String) : [],
    uncertainReinsertQueue: Array.isArray(raw.uncertainReinsertQueue) ? raw.uncertainReinsertQueue.map(String) : [],
    sessionResults: Array.isArray(raw.sessionResults) ? raw.sessionResults : [],
    startedAt: Number(raw.startedAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now()
  };
}

export function createParaphraseSession(batch, mode = "guided", now = Date.now()) {
  const ids = (batch?.sessionIds || []).map(String);
  return {
    ...emptyParaphraseSession(),
    mode,
    sessionId: `para-${now}-${Math.random().toString(36).slice(2, 8)}`,
    currentSessionGroupIds: ids,
    sessionTaskKinds: (batch?.sessionKinds || ids.map(() => "new")).slice(),
    baseGroupCount: ids.length,
    currentLearningStage: mode === "guided" ? PARA_LEARNING_STAGE.PREVIEW : PARA_LEARNING_STAGE.QUIZ,
    currentCycleIndex: Number(batch?.coverage?.currentCycleIndex) || 0,
    startedAt: now,
    updatedAt: now
  };
}

export function restartParaphraseSession(sessionIn, now = Date.now()) {
  const session = normalizeParaphraseSession(sessionIn);
  if (!session) return null;
  return {
    ...session,
    currentIndex: 0,
    currentLearningStage: session.mode === "guided" ? PARA_LEARNING_STAGE.PREVIEW : PARA_LEARNING_STAGE.QUIZ,
    currentDirection: "anchorToMember",
    wrongReinsertQueue: [],
    uncertainReinsertQueue: [],
    sessionResults: [],
    currentQuestion: null,
    selectedIndex: null,
    startedAt: now,
    updatedAt: now,
    completed: false
  };
}

export function appendParaphraseSessionResult(sessionIn, result, now = Date.now()) {
  const session = normalizeParaphraseSession(sessionIn);
  if (!session) return null;
  return {
    ...session,
    sessionResults: [...session.sessionResults, { ...result, at: now }],
    updatedAt: now
  };
}

export function scheduleParaphraseReinsert(sessionIn, groupId, type, offset = 3, now = Date.now()) {
  const session = normalizeParaphraseSession(sessionIn);
  if (!session || !groupId) return session;
  const repeatCount = session.sessionTaskKinds.filter((kind) => kind === "wrong" || kind === "uncertain").length;
  const repeatLimit = Math.max(1, Math.floor(session.baseGroupCount / 2));
  if (repeatCount >= repeatLimit) return session;
  const insertAt = Math.min(session.currentSessionGroupIds.length, session.currentIndex + Math.max(2, offset) + 1);
  const ids = session.currentSessionGroupIds.slice();
  const kinds = session.sessionTaskKinds.slice();
  ids.splice(insertAt, 0, groupId);
  kinds.splice(insertAt, 0, type);
  const queueKey = type === "uncertain" ? "uncertainReinsertQueue" : "wrongReinsertQueue";
  return {
    ...session,
    currentSessionGroupIds: ids,
    sessionTaskKinds: kinds,
    [queueKey]: [...new Set([...(session[queueKey] || []), groupId])],
    updatedAt: now
  };
}

export function hasPendingParaphraseReinsert(session, groupId) {
  if (!session || !groupId) return false;
  const later = session.currentSessionGroupIds.slice(session.currentIndex + 1);
  return later.includes(groupId) || session.wrongReinsertQueue.includes(groupId) || session.uncertainReinsertQueue.includes(groupId);
}

export function advanceParaphraseSession(sessionIn, now = Date.now()) {
  const session = normalizeParaphraseSession(sessionIn);
  if (!session) return null;
  if (session.currentIndex + 1 >= session.currentSessionGroupIds.length) {
    return { ...session, currentLearningStage: PARA_LEARNING_STAGE.SUMMARY, completed: true, currentQuestion: null, selectedIndex: null, updatedAt: now };
  }
  return {
    ...session,
    currentIndex: session.currentIndex + 1,
    currentLearningStage: session.mode === "guided" ? PARA_LEARNING_STAGE.PREVIEW : PARA_LEARNING_STAGE.QUIZ,
    currentQuestion: null,
    selectedIndex: null,
    updatedAt: now
  };
}

export function summarizeParaphraseSession(session) {
  const results = session?.sessionResults || [];
  const uniqueIds = new Set((session?.currentSessionGroupIds || []).slice(0, session?.baseGroupCount || 0));
  const correct = results.filter((row) => row.type === "quiz" && row.correct).length;
  const wrong = results.filter((row) => row.type === "quiz" && !row.correct).length;
  const uncertain = results.filter((row) => row.type === "recall" && row.rating === "uncertain").length;
  const recallPassed = results.filter((row) => row.type === "recall" && row.rating === "know").length;
  const firstMastered = new Set(results.filter((row) => row.type === "mastery" && row.firstMastered).map((row) => row.groupId)).size;
  const legalDirectionsCompleted = new Set(results.filter((row) => row.type === "mastery" && row.legalDirectionsCompleted).map((row) => row.groupId)).size;
  return {
    groupCount: uniqueIds.size,
    previewCompleted: new Set(results.filter((row) => row.type === "preview").map((row) => row.groupId)).size,
    recallPassed,
    correct,
    wrong,
    uncertain,
    firstMastered,
    legalDirectionsCompleted,
    correctRate: correct + wrong ? Math.round((correct / (correct + wrong)) * 100) : 0,
    reviewCount: new Set([...session.wrongReinsertQueue, ...session.uncertainReinsertQueue]).size,
    focusGroupIds: [...new Set(results.filter((row) => row.correct === false || row.rating === "uncertain" || row.rating === "dontKnow").map((row) => row.groupId))].slice(0, 5)
  };
}
