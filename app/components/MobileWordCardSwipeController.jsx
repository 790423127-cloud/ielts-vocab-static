"use client";

import { useEffect, useRef } from "react";
import {
  resolveWordCardSwipe,
  WORD_CARD_SWIPE_EVENT
} from "../lib/vocab/word-flashcard-swipe.mjs";

const INTERACTIVE_SELECTOR = "button, a, input, select, textarea, summary, details, [contenteditable='true']";

export default function MobileWordCardSwipeController() {
  const swipeStartRef = useRef(null);

  useEffect(() => {
    function handlePointerDown(event) {
      if (event.pointerType === "mouse") return;
      const target = event.target;
      const card = target?.closest?.(".word-study-card");
      if (!card || target.closest?.(INTERACTIVE_SELECTOR)) return;

      swipeStartRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        card
      };
    }

    function handlePointerUp(event) {
      const start = swipeStartRef.current;
      swipeStartRef.current = null;
      if (!start || start.pointerId !== event.pointerId) return;

      const direction = resolveWordCardSwipe({
        startX: start.startX,
        startY: start.startY,
        endX: event.clientX,
        endY: event.clientY
      });
      if (!direction) return;

      window.dispatchEvent(new CustomEvent(WORD_CARD_SWIPE_EVENT, {
        detail: { card: start.card, direction }
      }));
    }

    function cancelSwipe() {
      swipeStartRef.current = null;
    }

    function closeRangeMenuAfterSelection(event) {
      const entryButton = event.target?.closest?.(".word-study-menu .entry-btn");
      if (!entryButton) return;
      const menu = entryButton.closest("details");
      window.requestAnimationFrame(() => {
        if (menu) menu.open = false;
      });
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("pointerup", handlePointerUp, true);
    document.addEventListener("pointercancel", cancelSwipe, true);
    document.addEventListener("click", closeRangeMenuAfterSelection, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("pointercancel", cancelSwipe, true);
      document.removeEventListener("click", closeRangeMenuAfterSelection, true);
    };
  }, []);

  return <style>{`.word-study-card { touch-action: pan-y; }`}</style>;
}
