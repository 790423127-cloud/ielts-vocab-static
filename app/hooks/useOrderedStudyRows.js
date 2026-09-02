"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useWordStudyOrdering } from "./useWordStudyOrdering.js";
import {
  WORD_STUDY_ORDER_MODE,
  createWordStudyOrderSnapshot,
  isFixedWordStudyOrderMode,
  orderStudyWordIndices,
  reconcileWordStudyOrderSnapshot,
  updateWordStudyOrderSnapshotCursor,
  wordStudyOrderSnapshotKey
} from "../lib/vocab/word-study-ordering.mjs";
import {
  WORD_STUDY_DIFFICULTY_MODE,
  createWordInternalDifficultyProfile,
  normalizeWordStudyDifficultyMode
} from "../lib/vocab/word-internal-difficulty.mjs";

export function useOrderedStudyRows({
  orderKey,
  rows,
  pool,
  currentIndex,
  enabled = true,
  difficultyEnabled = true,
  idictation = false
}) {
  const {
    mode,
    difficultyMode,
    seed,
    snapshots,
    setMode,
    setDifficultyMode,
    saveSnapshot,
    saveCursor
  } = useWordStudyOrdering(orderKey);
  const baseRows = useMemo(
    () => (Array.isArray(rows) ? rows : []),
    [rows]
  );
  const baseIndices = useMemo(
    () => baseRows.map((row) => row.originalIndex),
    [baseRows]
  );
  const difficultyProfile = useMemo(() => {
    if (!difficultyEnabled || !baseIndices.length) return null;
    const words = baseIndices.map((sourceIndex) => {
      if (idictation) {
        return pool?.find((word) => word?.originalIndex === sourceIndex) || null;
      }
      return pool?.[sourceIndex] || null;
    }).filter(Boolean);
    return createWordInternalDifficultyProfile(words);
  }, [baseIndices, difficultyEnabled, idictation, pool]);
  const activeDifficultyMode = difficultyEnabled
    ? difficultyMode
    : WORD_STUDY_DIFFICULTY_MODE.DEFAULT;
  const snapshotKey = wordStudyOrderSnapshotKey(mode, activeDifficultyMode);
  const activeSnapshot = snapshots[snapshotKey] || null;
  const reusableSnapshot = useMemo(() => {
    if (
      !enabled
      || baseIndices.length === 0
      || !isFixedWordStudyOrderMode(mode, activeDifficultyMode)
      || !activeSnapshot
    ) {
      return null;
    }
    const candidate = reconcileWordStudyOrderSnapshot(
      activeSnapshot,
      baseIndices,
      pool,
      { idictation, fallbackOrder: baseIndices }
    );
    return candidate.changed ? null : candidate;
  }, [
    activeDifficultyMode,
    activeSnapshot,
    baseIndices,
    enabled,
    idictation,
    mode,
    pool
  ]);
  const generatedIndices = useMemo(
    () => reusableSnapshot?.indices || orderStudyWordIndices(baseIndices, pool, {
      mode: enabled ? mode : WORD_STUDY_ORDER_MODE.CURRENT,
      difficultyMode: enabled && difficultyEnabled
        ? difficultyMode
        : WORD_STUDY_DIFFICULTY_MODE.DEFAULT,
      difficultyEnabled,
      difficultyProfile,
      seed,
      idictation
    }),
    [
      baseIndices,
      difficultyEnabled,
      difficultyProfile,
      difficultyMode,
      enabled,
      idictation,
      mode,
      pool,
      reusableSnapshot,
      seed
    ]
  );
  const reconciled = useMemo(() => {
    if (
      !enabled
      || baseIndices.length === 0
      || !isFixedWordStudyOrderMode(mode, activeDifficultyMode)
      || !activeSnapshot
    ) {
      return null;
    }
    if (reusableSnapshot) return reusableSnapshot;
    return reconcileWordStudyOrderSnapshot(activeSnapshot, generatedIndices, pool, {
      idictation,
      fallbackOrder: generatedIndices
    });
  }, [
    activeDifficultyMode,
    activeSnapshot,
    baseIndices.length,
    enabled,
    generatedIndices,
    idictation,
    mode,
    pool,
    reusableSnapshot
  ]);
  const orderedIndices = reconciled?.indices || generatedIndices;
  const rowByIndex = useMemo(
    () => new Map(baseRows.map((row) => [row.originalIndex, row])),
    [baseRows]
  );
  const orderedRows = useMemo(
    () => orderedIndices.map((index) => rowByIndex.get(index)).filter(Boolean),
    [orderedIndices, rowByIndex]
  );

  useEffect(() => {
    if (!reconciled?.changed) return;
    saveSnapshot(snapshotKey, reconciled.snapshot);
  }, [reconciled, saveSnapshot, snapshotKey]);

  useEffect(() => {
    if (
      !enabled
      || baseIndices.length === 0
      || !isFixedWordStudyOrderMode(mode, activeDifficultyMode)
      || !activeSnapshot
    ) {
      return;
    }
    const currentWord = idictation
      ? pool?.find((word) => word?.originalIndex === currentIndex)
      : pool?.[currentIndex];
    const nextSnapshot = updateWordStudyOrderSnapshotCursor(
      activeSnapshot,
      currentWord,
      currentIndex,
      { idictation }
    );
    if (nextSnapshot !== activeSnapshot) {
      saveCursor(snapshotKey, nextSnapshot.cursorKey);
    }
  }, [
    activeDifficultyMode,
    activeSnapshot,
    baseIndices.length,
    currentIndex,
    enabled,
    idictation,
    mode,
    pool,
    saveCursor,
    snapshotKey
  ]);

  const activateCombination = useCallback((nextMode, nextDifficultyMode) => {
    // Still allow preference changes while row emission is frozen (e.g. delete burst).
    const normalizedDifficultyMode = difficultyEnabled
      ? normalizeWordStudyDifficultyMode(nextDifficultyMode)
      : WORD_STUDY_DIFFICULTY_MODE.DEFAULT;
    if (nextMode === WORD_STUDY_ORDER_MODE.RANDOM) {
      const nextSeed = Date.now();
      const nextOrder = orderStudyWordIndices(baseIndices, pool, {
        mode: nextMode,
        difficultyMode: normalizedDifficultyMode,
        difficultyEnabled,
        difficultyProfile,
        seed: nextSeed,
        idictation
      });
      setMode(nextMode, { seed: nextSeed });
      setDifficultyMode(normalizedDifficultyMode);
      return nextOrder[0] ?? null;
    }
    const nextSnapshotKey = wordStudyOrderSnapshotKey(
      nextMode,
      normalizedDifficultyMode
    );
    if (isFixedWordStudyOrderMode(nextMode, normalizedDifficultyMode)) {
      const existing = snapshots[nextSnapshotKey];
      if (existing) {
        const reusable = reconcileWordStudyOrderSnapshot(existing, baseIndices, pool, {
          idictation,
          fallbackOrder: baseIndices
        });
        const next = reusable.changed ? (() => {
          const freshOrder = orderStudyWordIndices(baseIndices, pool, {
            mode: nextMode,
            difficultyMode: normalizedDifficultyMode,
            difficultyEnabled,
            difficultyProfile,
            idictation
          });
          return reconcileWordStudyOrderSnapshot(existing, freshOrder, pool, {
            idictation,
            fallbackOrder: freshOrder
          });
        })() : reusable;
        saveSnapshot(nextSnapshotKey, next.snapshot);
        saveCursor(nextSnapshotKey, next.snapshot.cursorKey);
        setMode(nextMode);
        setDifficultyMode(normalizedDifficultyMode);
        return next.cursorIndex ?? next.indices[0] ?? null;
      }
      const freshOrder = orderStudyWordIndices(baseIndices, pool, {
        mode: nextMode,
        difficultyMode: normalizedDifficultyMode,
        difficultyEnabled,
        difficultyProfile,
        idictation
      });
      const snapshot = createWordStudyOrderSnapshot(freshOrder, pool, {
        idictation,
        cursorIndex: freshOrder[0]
      });
      saveSnapshot(nextSnapshotKey, snapshot);
      saveCursor(nextSnapshotKey, snapshot.cursorKey);
      setMode(nextMode);
      setDifficultyMode(normalizedDifficultyMode);
      return freshOrder[0] ?? null;
    }
    setMode(nextMode);
    setDifficultyMode(normalizedDifficultyMode);
    return baseIndices.includes(currentIndex) ? currentIndex : baseIndices[0] ?? null;
  }, [
    baseIndices,
    currentIndex,
    difficultyEnabled,
    difficultyProfile,
    idictation,
    pool,
    saveCursor,
    saveSnapshot,
    setDifficultyMode,
    setMode,
    snapshots
  ]);

  const changeMode = useCallback(
    (nextMode) => activateCombination(nextMode, activeDifficultyMode),
    [activateCombination, activeDifficultyMode]
  );
  const changeDifficultyMode = useCallback(
    (nextDifficultyMode) => activateCombination(mode, nextDifficultyMode),
    [activateCombination, mode]
  );

  const difficultyAvailable = useMemo(
    () => difficultyEnabled && Boolean(difficultyProfile?.available),
    [difficultyEnabled, difficultyProfile]
  );

  return {
    // Always expose the real preference values. Masking them as CURRENT/DEFAULT when
    // `enabled` is false caused consumers (e.g. reading-g delete freeze) to think the
    // mode changed and clear their stable study queue mid-delete.
    mode,
    difficultyMode: activeDifficultyMode,
    rows: enabled ? orderedRows : baseRows,
    cursorIndex: reconciled?.cursorIndex ?? null,
    changeMode,
    changeDifficultyMode,
    difficultyAvailable,
    difficultyProfile
  };
}
