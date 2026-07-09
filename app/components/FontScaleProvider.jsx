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

    window.addEventListener("storage", handleStorage);
    window.addEventListener(FONT_SCALE_CHANGE_EVENT, handleCustom);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(FONT_SCALE_CHANGE_EVENT, handleCustom);
    };
  }, []);

  return null;
}