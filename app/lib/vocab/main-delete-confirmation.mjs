/**
 * Keep the destructive main-lexicon delete acknowledgement scoped to one open
 * learning page. A refresh creates a new ref and therefore asks again.
 */
export function confirmMainLexiconDeletionOnce(stateRef, message, confirmAction = globalThis.confirm) {
  if (stateRef?.current === true) return true;
  if (typeof confirmAction !== "function" || !confirmAction(message)) return false;
  if (stateRef) stateRef.current = true;
  return true;
}
