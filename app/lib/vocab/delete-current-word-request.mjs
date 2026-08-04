/**
 * Shared delete request for the main word flash surface.
 * Prefer a CustomEvent over synthesizing a Delete KeyboardEvent — synthetic
 * key events are not always delivered consistently to capture listeners.
 */
export const DELETE_CURRENT_WORD_EVENT = "ielts-vocab:delete-current-word";

export function requestCurrentWordDeletion() {
  if (typeof window === "undefined") return false;
  window.dispatchEvent(new CustomEvent(DELETE_CURRENT_WORD_EVENT, { bubbles: true }));
  return true;
}
