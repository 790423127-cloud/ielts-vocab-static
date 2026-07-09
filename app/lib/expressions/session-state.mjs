// Expressions Mode — session-level memory state.
// Never writes to localStorage.

export function createSessionState() {
  return {
    questionOrdinal: 0,
    recentCorrectIndices: [],
    usedOptionHashes: new Set(),
    sessionId: "expr_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8)
  };
}

export function recordQuestion(sessionState, { phraseId, correctOptionIndex, optionHash }) {
  sessionState.questionOrdinal++;
  if (correctOptionIndex !== undefined && correctOptionIndex !== null) {
    sessionState.recentCorrectIndices.push(correctOptionIndex);
    if (sessionState.recentCorrectIndices.length > 300) {
      sessionState.recentCorrectIndices = sessionState.recentCorrectIndices.slice(-300);
    }
  }
  if (optionHash) {
    sessionState.usedOptionHashes.add(optionHash);
  }
}

export function wouldRepeatThreeConsecutive(sessionState, newIndex) {
  const history = sessionState.recentCorrectIndices;
  if (history.length < 2) return false;
  const last2 = history.slice(-2);
  return last2[0] === newIndex && last2[1] === newIndex;
}

export function isOptionHashUsed(sessionState, hash) {
  return sessionState.usedOptionHashes.has(hash);
}