import { analyzeCandidateBreakdown } from "./candidate-breakdown.mjs";
import {
  getAcceptedAnswers,
  getSpellingExpectedAnswer,
  resolveSpellingEntryType
} from "./normalize-spelling-entry.mjs";

export function buildSpellingCandidates(words = [], flashcardState = {}, options = {}) {
  return buildSpellingCandidatesWithBreakdown(words, flashcardState, options).candidates;
}

export function buildSpellingCandidatesWithBreakdown(words = [], flashcardState = {}, options = {}) {
  const breakdown = analyzeCandidateBreakdown(words, flashcardState, options);

  return {
    candidates: breakdown.sessionCandidates,
    breakdown
  };
}

export { getSpellingExpectedAnswer, resolveSpellingEntryType, getAcceptedAnswers };
