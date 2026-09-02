import { getWordId, normalizeSpellingAnswer } from "./word-id.mjs";

function resolveAttemptWordId(entry) {
  return getWordId(entry)
    || String(entry?.wordId || entry?.id || entry?.expectedAnswer || entry?.displayText || "").trim();
}

/**
 * Captures the exact question and normalized answer that an automatic submit
 * is allowed to submit. A pending timer must never submit a later edit or a
 * different question.
 */
export function createSpellingAutoSubmitAttempt(entry, inputValue) {
  const wordId = resolveAttemptWordId(entry);
  const answer = normalizeSpellingAnswer(inputValue);
  if (!wordId || !answer) return null;
  return { wordId, answer };
}

export function isSpellingAutoSubmitAttemptCurrent(attempt, entry, inputValue) {
  if (!attempt?.wordId || !attempt?.answer) return false;
  const current = createSpellingAutoSubmitAttempt(entry, inputValue);
  return Boolean(
    current
    && current.wordId === attempt.wordId
    && current.answer === attempt.answer
  );
}
