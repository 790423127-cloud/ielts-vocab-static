"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  WORD_STUDY_ORDER_MODE,
  normalizeWordStudyOrderMode,
  readWordStudyOrderCursors,
  readWordStudyOrderPreferences,
  writeWordStudyOrderCursors,
  writeWordStudyOrderPreferences
} from "../lib/vocab/word-study-ordering.mjs";
import {
  WORD_STUDY_DIFFICULTY_MODE,
  normalizeWordStudyDifficultyMode
} from "../lib/vocab/word-internal-difficulty.mjs";

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

function readBrowserCursors() {
  if (typeof window === "undefined") return {};
  return readWordStudyOrderCursors((key) => window.localStorage.getItem(key));
}

function writeBrowserCursors(cursors) {
  if (typeof window === "undefined") return false;
  return writeWordStudyOrderCursors(
    cursors,
    (key, value) => window.localStorage.setItem(key, value)
  );
}

export function useWordStudyOrdering(orderKey) {
  const [preferences, setPreferences] = useState({});
  const [cursorsHydrated, setCursorsHydrated] = useState(false);
  const cursorsRef = useRef({});

  useLayoutEffect(() => {
    setPreferences(readBrowserPreferences());
    const nextCursors = readBrowserCursors();
    cursorsRef.current = nextCursors;
    setCursorsHydrated(true);
  }, []);

  const active = useMemo(() => {
    const stored = preferences?.[orderKey] || {};
    const storedCursors = cursorsHydrated ? cursorsRef.current : {};
    const legacyDifficultyMode = stored.mode === WORD_STUDY_ORDER_MODE.EASY_TO_HARD
      ? WORD_STUDY_DIFFICULTY_MODE.EASY_TO_HARD
      : stored.mode === WORD_STUDY_ORDER_MODE.HARD_TO_EASY
        ? WORD_STUDY_DIFFICULTY_MODE.HARD_TO_EASY
        : WORD_STUDY_DIFFICULTY_MODE.DEFAULT;
    return {
      mode: normalizeWordStudyOrderMode(stored.mode),
      difficultyMode: normalizeWordStudyDifficultyMode(
        stored.difficultyMode || legacyDifficultyMode
      ),
      seed: Number.isFinite(Number(stored.seed)) ? Number(stored.seed) : 0,
      snapshots: Object.fromEntries(
        Object.entries(
          stored.snapshots && typeof stored.snapshots === "object" ? stored.snapshots : {}
        ).map(([mode, snapshot]) => [
          mode,
          {
            ...snapshot,
            cursorKey: storedCursors?.[orderKey]?.[mode] || snapshot?.cursorKey || ""
          }
        ])
      )
    };
  }, [cursorsHydrated, orderKey, preferences]);

  const setMode = useCallback((nextMode, options = {}) => {
    const normalizedMode = normalizeWordStudyOrderMode(nextMode);
    const requestedSeed = Number(options.seed);
    const randomSeed = Number.isFinite(requestedSeed) && requestedSeed > 0
      ? requestedSeed
      : Date.now();
    setPreferences((current) => {
      const previous = current?.[orderKey] || {};
      const next = {
        ...(current || {}),
        [orderKey]: {
          ...previous,
          mode: normalizedMode,
          seed: normalizedMode === WORD_STUDY_ORDER_MODE.RANDOM
            ? randomSeed
            : Number(previous.seed) || 0
        }
      };
      writeBrowserPreferences(next);
      return next;
    });
    return {
      mode: normalizedMode,
      seed: normalizedMode === WORD_STUDY_ORDER_MODE.RANDOM ? randomSeed : active.seed
    };
  }, [active.seed, orderKey]);

  const setDifficultyMode = useCallback((nextMode) => {
    const normalizedMode = normalizeWordStudyDifficultyMode(nextMode);
    setPreferences((current) => {
      const previous = current?.[orderKey] || {};
      const next = {
        ...(current || {}),
        [orderKey]: {
          ...previous,
          difficultyMode: normalizedMode
        }
      };
      writeBrowserPreferences(next);
      return next;
    });
    return normalizedMode;
  }, [orderKey]);

  const saveSnapshot = useCallback((snapshotKey, snapshot) => {
    if (!snapshotKey || !snapshot) return;
    setPreferences((current) => {
      const previous = current?.[orderKey] || {};
      const previousSnapshots = previous.snapshots && typeof previous.snapshots === "object"
        ? previous.snapshots
        : {};
      if (previousSnapshots[snapshotKey] === snapshot) return current;
      const next = {
        ...(current || {}),
        [orderKey]: {
          ...previous,
          snapshots: {
            ...previousSnapshots,
            [snapshotKey]: snapshot
          }
        }
      };
      writeBrowserPreferences(next);
      return next;
    });
  }, [orderKey]);

  const saveCursor = useCallback((snapshotKey, cursorKey) => {
    if (!snapshotKey || !cursorKey) return;
    const current = cursorsRef.current || {};
    const previousEntry = current?.[orderKey] || {};
    if (previousEntry[snapshotKey] === cursorKey) return;
    const next = {
      ...current,
      [orderKey]: {
        ...previousEntry,
        [snapshotKey]: cursorKey
      }
    };
    cursorsRef.current = next;
    writeBrowserCursors(next);
  }, [orderKey]);

  return {
    mode: active.mode,
    difficultyMode: active.difficultyMode,
    seed: active.seed,
    snapshots: active.snapshots,
    setMode,
    setDifficultyMode,
    saveSnapshot,
    saveCursor
  };
}
