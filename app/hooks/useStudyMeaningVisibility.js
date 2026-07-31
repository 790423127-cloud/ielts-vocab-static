"use client";

import { useCallback, useEffect, useState } from "react";
import {
  STUDY_MEANING_VISIBILITY_EVENT,
  STUDY_MEANING_VISIBILITY_KEY,
  readStudyMeaningsHidden,
  writeStudyMeaningsHidden
} from "../lib/vocab/study-meaning-visibility.mjs";

function browserHiddenState() {
  if (typeof document === "undefined") return false;
  if (document.documentElement.dataset.studyMeaningsHidden === "true") return true;
  return readStudyMeaningsHidden((key) => window.localStorage.getItem(key));
}

function applyBrowserHiddenState(hidden) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.studyMeaningsHidden = hidden ? "true" : "false";
  writeStudyMeaningsHidden(
    hidden,
    (key, value) => window.localStorage.setItem(key, value)
  );
  window.dispatchEvent(new CustomEvent(STUDY_MEANING_VISIBILITY_EVENT, {
    detail: { hidden }
  }));
}

export function useStudyMeaningVisibility() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(browserHiddenState());

    const handleVisibility = (event) => {
      setHidden(Boolean(event.detail?.hidden));
    };
    const handleStorage = (event) => {
      if (event.key !== STUDY_MEANING_VISIBILITY_KEY) return;
      const nextHidden = event.newValue === "1";
      document.documentElement.dataset.studyMeaningsHidden = nextHidden ? "true" : "false";
      setHidden(nextHidden);
    };

    window.addEventListener(STUDY_MEANING_VISIBILITY_EVENT, handleVisibility);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(STUDY_MEANING_VISIBILITY_EVENT, handleVisibility);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const toggle = useCallback(() => {
    const nextHidden = !browserHiddenState();
    applyBrowserHiddenState(nextHidden);
  }, []);

  return { hidden, toggle };
}
