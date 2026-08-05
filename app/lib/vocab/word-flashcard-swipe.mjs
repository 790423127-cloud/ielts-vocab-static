export const WORD_CARD_SWIPE_THRESHOLD = 48;
export const WORD_CARD_SWIPE_DOMINANCE = 1.2;
export const WORD_CARD_SWIPE_EVENT = "ielts:word-card-swipe";

export function resolveWordCardSwipe({
  startX,
  startY,
  endX,
  endY,
  threshold = WORD_CARD_SWIPE_THRESHOLD,
  dominance = WORD_CARD_SWIPE_DOMINANCE
} = {}) {
  const deltaX = Number(endX) - Number(startX);
  const deltaY = Number(endY) - Number(startY);
  if (![deltaX, deltaY].every(Number.isFinite)) return "";

  const horizontal = Math.abs(deltaX);
  const vertical = Math.abs(deltaY);
  if (horizontal < threshold || horizontal <= vertical * dominance) return "";

  return deltaX < 0 ? "next" : "previous";
}
