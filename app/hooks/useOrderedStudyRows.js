"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useWordStudyOrdering } from "./useWordStudyOrdering.js";
import {
  WORD_STUDY_ORDER_MODE,
  createWordStudyOrderSnapshot,
  hasWordStudyInternalDifficulty,
  isFixedWordStudyOrderMode,
  orderStudyWordIndices,
  reconcileWordStudyOrderSnapshot,
  updateWordStudyOrderSnapshotCursor,
  wordStudyOrderSnapshotKey
} from "../lib/vocab/word-study-ordering.mjs";
import {
  WORD_STUDY_DIFFICULTY_MODE,
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
  const generatedIndices = useMemo(
    () => orderStudyWordIndices(baseIndices, pool, {
      mode: enabled ? mode : WORD_STUDY_ORDER_MODE.CURRENT,
      difficultyMode: enabled && difficultyEnabled
        ? difficultyMode
        : WORD_STUDY_DIFFICULTY_MODE.DEFAULT,
      difficultyEnabled,
      seed,
      idictation
    }),
    [
      baseIndices,
      difficultyEnabled,
      difficultyMode,
      enabled,
      idictation,
      mode,
      pool,
      seed
    ]
  );
  const activeDifficultyMode = difficultyEnabled
    ? difficultyMode
    : WORD_STUDY_DIFFICULTY_MODE.DEFAULT;
  const snapshotKey = wordStudyOrderSnapshotKey(mode, activeDifficultyMode);
  const activeSnapshot = snapshots[snapshotKey] || null;
  const reconciled = useMemo(() => {
    if (
      !enabled
      || baseIndices.length === 0
      || !isFixedWordStudyOrderMode(mode, activeDifficultyMode)
      || !activeSnapshot
    ) {
      return null;
    }
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
    pool
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
    if (!enabled) return null;
    const normalizedDifficultyMode = difficultyEnabled
      ? normalizeWordStudyDifficultyMode(nextDifficultyMode)
      : WORD_STUDY_DIFFICULTY_MODE.DEFAULT;
    if (nextMode === WORD_STUDY_ORDER_MODE.RANDOM) {
      const nextSeed = Date.now();
      const nextOrder = orderStudyWordIndices(baseIndices, pool, {
        mode: nextMode,
        difficultyMode: WORD_STUDY_DIFFICULTY_MODE.DEFAULT,
        difficultyEnabled: false,
        seed: nextSeed,
        idictation
      });
      setMode(nextMode, { seed: nextSeed });
      return nextOrder[0] ?? null;
    }
    const nextSnapshotKey = wordStudyOrderSnapshotKey(
      nextMode,
      normalizedDifficultyMode
    );
    if (isFixedWordStudyOrderMode(nextMode, normalizedDifficultyMode)) {
      const freshOrder = orderStudyWordIndices(baseIndices, pool, {
        mode: nextMode,
        difficultyMode: normalizedDifficultyMode,
        difficultyEnabled,
        idictation
      });
      const existing = snapshots[nextSnapshotKey];
      if (existing) {
        const next = reconcileWordStudyOrderSnapshot(existing, freshOrder, pool, {
          idictation,
          fallbackOrder: freshOrder
        });
        saveSnapshot(nextSnapshotKey, next.snapshot);
        saveCursor(nextSnapshotKey, next.snapshot.cursorKey);
        setMode(nextMode);
        setDifficultyMode(normalizedDifficultyMode);
        return next.cursorIndex ?? next.indices[0] ?? null;
      }
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
    enabled,
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
    () => difficultyEnabled && hasWordStudyInternalDifficulty(
      baseIndices,
      pool,
      { idictation }
    ),
    [baseIndices, difficultyEnabled, idictation, pool]
  );

  return {
    mode: enabled ? mode : WORD_STUDY_ORDER_MODE.CURRENT,
    difficultyMode: enabled
      ? activeDifficultyMode
      : WORD_STUDY_DIFFICULTY_MODE.DEFAULT,
    rows: enabled ? orderedRows : baseRows,
    changeMode,
    changeDifficultyMode,
    difficultyAvailable
  };
}
