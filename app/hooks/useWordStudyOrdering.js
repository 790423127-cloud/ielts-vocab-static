"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  WORD_STUDY_ORDER_MODE,
  normalizeWordStudyOrderMode,
  readWordStudyOrderPreferences,
  writeWordStudyOrderPreferences
} from "../lib/vocab/word-study-ordering.mjs";

function readBrowserPreferences() {
  if (typeof window === "undefined") return {};
  return readWordStudyOrderPreferences((key) => window.localStorage.getItem(key));
}

function writeBrowserPreferences(preferences) {
  if (typeof window === "undefined") return false;
  return writeWordStudyOrderPreferences(
    preferences,
    (key, value) => window.localStorage.setItem(key, value)
  );
}

export function useWordStudyOrdering(orderKey) {
  const [preferences, setPreferences] = useState({});

  useEffect(() => {
    setPreferences(readBrowserPreferences());
  }, []);

  const active = useMemo(() => {
    const stored = preferences?.[orderKey] || {};
    return {
      mode: normalizeWordStudyOrderMode(stored.mode),
      seed: Number.isFinite(Number(stored.seed)) ? Number(stored.seed) : 0
    };
  }, [orderKey, preferences]);

  const setMode = useCallback((nextMode) => {
    const normalizedMode = normalizeWordStudyOrderMode(nextMode);
    setPreferences((current) => {
      const previous = current?.[orderKey] || {};
      const next = {
        ...(current || {}),
        [orderKey]: {
          mode: normalizedMode,
          seed: normalizedMode === WORD_STUDY_ORDER_MODE.RANDOM
            ? Date.now()
            : Number(previous.seed) || 0
        }
      };
      writeBrowserPreferences(next);
      return next;
    });
  }, [orderKey]);

  return {
    mode: active.mode,
    seed: active.seed,
    setMode
  };
}
