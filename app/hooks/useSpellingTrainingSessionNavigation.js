"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { getWordId, normalizeSpellingAnswer } from "../lib/spelling/word-id.mjs";
import {
  resolvePersonalWrongNavigationWordId,
  writeSpellingPosition
} from "../lib/spelling/spelling-training-page-helpers.mjs";

export function resolveSpellingWordKey(word) {
  return getWordId(word) || String(word?.wordId || word?.id || "").trim();
}

export function isSpellingWordNavigationBlocked(spellingState) {
  return spellingState?.uiState === "inputting";
}

export function normalizeCircularBatchIndex(targetIndex, total) {
  if (!Number.isInteger(total) || total <= 0) return -1;
  return ((targetIndex % total) + total) % total;
}

export function buildBatchNavigationWordIds({ batchWordIds, personalWrongNavigationUnits }) {
  if (personalWrongNavigationUnits.length) {
    return personalWrongNavigationUnits
      .map((unit) => unit.writeWordIds[0])
      .map((id) => String(id || "").trim())
      .filter(Boolean);
  }
  return batchWordIds;
}

export function findCurrentBatchNavigationIndex({
  current,
  batchNavigationWordIds,
  personalWrongNavigationUnits,
  spellingEntries
}) {
  if (!current || !batchNavigationWordIds.length) return -1;

  const key = resolveSpellingWordKey(current);
  if (personalWrongNavigationUnits.length) {
    return personalWrongNavigationUnits.findIndex((unit) => unit.writeWordIds.includes(key));
  }

  const byId = batchNavigationWordIds.indexOf(key);
  if (byId >= 0) return byId;

  const answer = normalizeSpellingAnswer(
    current.expectedAnswer || current.displayText || current.word || ""
  );
  return spellingEntries.findIndex((entry) => {
    const entryAnswer = normalizeSpellingAnswer(
      entry.expectedAnswer || entry.word || entry.displayText || ""
    );
    return entryAnswer === answer;
  });
}

export function useSpellingTrainingSessionNavigation({
  spelling,
  spellingEntries,
  current,
  practiceSource,
  personalWrongSessionReady,
  candidateBreakdown,
  batchProgress,
  activeBatchId,
  scope,
  categoryPrefs,
  sessionTotal,
  currentPosition,
  commitLearningActivity,
  setErrorAnalysisVisible,
  setActionNotice
}) {
  const restoredPositionBatchRef = useRef("");
  const restoringPositionRef = useRef(false);
  const spellingReady = spelling.ready;
  const getSessionWordIds = spelling.getSessionWordIds;

  useEffect(() => {
    restoredPositionBatchRef.current = "";
  }, [activeBatchId]);

  const batchWordIds = useMemo(() => {
    const engineIds = spellingReady && typeof getSessionWordIds === "function"
      ? getSessionWordIds()
      : [];
    if (Array.isArray(engineIds) && engineIds.length) {
      return engineIds.map((id) => String(id || "").trim()).filter(Boolean);
    }

    if (personalWrongSessionReady) return [];

    const breakdownIds = candidateBreakdown?.sessionWordIds;
    if (Array.isArray(breakdownIds) && breakdownIds.length) {
      return breakdownIds.map((id) => String(id || "").trim()).filter(Boolean);
    }

    return spellingEntries.map((entry) => getWordId(entry)).filter(Boolean);
  }, [
    practiceSource,
    personalWrongSessionReady,
    spellingReady,
    getSessionWordIds,
    candidateBreakdown?.sessionWordIds,
    spellingEntries
  ]);

  const personalWrongNavigationUnits = useMemo(() => {
    if (practiceSource !== "personal_wrong_book") return [];
    const units = batchProgress.personalWrongWordUnits || candidateBreakdown?.personalWrongWordUnits || [];
    return Array.isArray(units)
      ? units.filter((unit) => Array.isArray(unit?.writeWordIds) && unit.writeWordIds.length)
      : [];
  }, [
    practiceSource,
    batchProgress.personalWrongWordUnits,
    candidateBreakdown?.personalWrongWordUnits
  ]);

  const batchNavigationWordIds = useMemo(
    () => buildBatchNavigationWordIds({ batchWordIds, personalWrongNavigationUnits }),
    [batchWordIds, personalWrongNavigationUnits]
  );

  const currentBatchIndex = useMemo(
    () => findCurrentBatchNavigationIndex({
      current,
      batchNavigationWordIds,
      personalWrongNavigationUnits,
      spellingEntries
    }),
    [current, batchNavigationWordIds, personalWrongNavigationUnits, spellingEntries]
  );

  const navigateToBatchWord = useCallback(async (targetIndex) => {
    if (!spelling.ready) return null;

    if (isSpellingWordNavigationBlocked(spelling)) {
      setActionNotice("请等待拼写判定完成");
      return null;
    }
    if (!batchNavigationWordIds.length || currentBatchIndex < 0) {
      setActionNotice("当前词不在本批次列表中");
      return null;
    }
    if (batchNavigationWordIds.length === 1) {
      setActionNotice("当前批次只有一个单词");
      return null;
    }

    const normalizedIndex = normalizeCircularBatchIndex(targetIndex, batchNavigationWordIds.length);
    if (normalizedIndex === currentBatchIndex) {
      setActionNotice("当前批次只有一个可切换单词");
      return null;
    }

    const targetWordId = batchNavigationWordIds[normalizedIndex]
      || getWordId(spellingEntries[normalizedIndex]);
    if (!targetWordId) {
      setActionNotice("无法定位目标单词");
      return null;
    }

    commitLearningActivity();
    const result = await spelling.navigateToWord(targetWordId);
    if (!result?.currentWord) {
      setActionNotice("切换单词失败");
      return null;
    }

    if (activeBatchId) {
      const currentWordId = resolveSpellingWordKey(result.currentWord) || targetWordId;
      const navigationWordId = practiceSource === "personal_wrong_book"
        ? resolvePersonalWrongNavigationWordId(currentWordId, personalWrongNavigationUnits)
        : currentWordId;
      writeSpellingPosition(scope, {
        activeBatchId,
        wordId: currentWordId,
        navigationWordId,
        currentBatchIndex: normalizedIndex,
        practiceSource,
        category: categoryPrefs,
        savedAt: Date.now()
      });
    }

    setErrorAnalysisVisible(false);
    const label = result.currentWord.displayText || result.currentWord.expectedAnswer || "单词";
    const resultBatchProgress = result.sessionProgress?.batchProgress || {};
    const noticeTotal = Number(
      resultBatchProgress.sessionTotal || sessionTotal || batchNavigationWordIds.length
    ) || 0;
    const noticePosition = Math.max(
      1,
      Math.min(noticeTotal || 1, Number(resultBatchProgress.currentNumber || currentPosition || 1))
    );
    setActionNotice(`已切换到：${label}（${noticePosition}/${noticeTotal}）`);
    return result;
  }, [
    spelling,
    batchNavigationWordIds,
    spellingEntries,
    currentBatchIndex,
    commitLearningActivity,
    currentPosition,
    sessionTotal,
    activeBatchId,
    practiceSource,
    personalWrongNavigationUnits,
    scope,
    categoryPrefs,
    setErrorAnalysisVisible,
    setActionNotice
  ]);

  const handleGoToPreviousWord = useCallback(() => {
    if (currentBatchIndex < 0) {
      setActionNotice("当前词不在本批次列表中");
      return null;
    }
    return navigateToBatchWord(currentBatchIndex - 1);
  }, [currentBatchIndex, navigateToBatchWord, setActionNotice]);

  const handleGoToNextWord = useCallback(() => {
    if (currentBatchIndex < 0) {
      setActionNotice("当前词不在本批次列表中");
      return null;
    }
    return navigateToBatchWord(currentBatchIndex + 1);
  }, [currentBatchIndex, navigateToBatchWord, setActionNotice]);

  return {
    batchNavigationWordIds,
    personalWrongNavigationUnits,
    currentBatchIndex,
    canBrowseBatchWords: batchNavigationWordIds.length > 1 && currentBatchIndex >= 0,
    handleGoToPreviousWord,
    handleGoToNextWord,
    restoredPositionBatchRef,
    restoringPositionRef
  };
}
