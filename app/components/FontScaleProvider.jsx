"use client";

import { useEffect } from "react";
import {
  FONT_SCALE_CHANGE_EVENT,
  applyFontScale,
  readStoredFontScale
} from "../lib/ui/font-scale.mjs";

export default function FontScaleProvider() {
  useEffect(() => {
    applyFontScale(readStoredFontScale());

    function handleStorage(event) {
      if (event.key && event.key !== "ielts-vocab-font-scale") return;
      applyFontScale(readStoredFontScale());
    }

    function handleCustom(event) {
      const scale = event?.detail?.scale;
      if (typeof scale === "number") applyFontScale(scale);
    }

    function handleResize() {
      applyFontScale(readStoredFontScale());
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener(FONT_SCALE_CHANGE_EVENT, handleCustom);
    window.addEventListener("resize", handleResize, { passive: true });
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(FONT_SCALE_CHANGE_EVENT, handleCustom);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return null;
}
