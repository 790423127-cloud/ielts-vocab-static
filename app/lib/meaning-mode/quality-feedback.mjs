// quality-feedback.mjs -- User feedback storage for Meaning Mode question quality.
// Uses dedicated localStorage key. Does not modify learning progress or spelling data.

const FEEDBACK_KEY = "ielts_meaning_4500_quality_feedback_v1";
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

export const FEEDBACK_REASONS = [
  { code: "multi-answer", label: "两个或多个答案都合理" },
  { code: "unrelated-distractor", label: "干扰项完全无关" },
  { code: "inaccurate-meaning", label: "中文释义不准确或不够清楚" },
  { code: "mismatch", label: "英文和中文疑似错位" },
  { code: "wrong-correct", label: "正确答案本身有问题" },
  { code: "other", label: "其他", allowNote: true },
];

export function loadFeedbackHistory() {
  try {
    const raw = localStorage.getItem(FEEDBACK_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) { return []; }
}

export function saveFeedback(feedback) {
  const history = loadFeedbackHistory();
  const cutoff = Date.now() - DEDUP_WINDOW_MS;
  const duplicate = history.find(f =>
    f.optionHash === feedback.optionHash &&
    f.reasonCode === feedback.reasonCode &&
    new Date(f.createdAt).getTime() > cutoff
  );
  if (duplicate) return { saved: false, reason: "duplicate-within-24h" };
  history.push(feedback);
  if (history.length > 500) history.splice(0, history.length - 500);
  localStorage.setItem(FEEDBACK_KEY, JSON.stringify(history));
  return { saved: true };
}

export function createFeedbackPayload(snapshot, reasonCode, note, userSelectedIndex, userWasCorrect) {
  return {
    feedbackId: "fb_" + Date.now() + "_" + Math.random().toString(36).slice(2,8),
    createdAt: new Date().toISOString(),
    reasonCode,
    note: note || "",
    target: snapshot.target,
    options: snapshot.options,
    optionHash: snapshot.optionHash,
    correctOptionIndex: snapshot.correctOptionIndex,
    userSelectedOptionIndex: userSelectedIndex,
    userWasCorrect,
    appVersion: "meaning-stage7"
  };
}