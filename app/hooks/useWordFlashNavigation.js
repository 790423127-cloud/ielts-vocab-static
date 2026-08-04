"use client";

import { useEffect, useRef } from "react";
import {
  sortWordIndicesForFilter,
  wordMatchesFilter
} from "../lib/vocab/word-flashcard-study-pool.mjs";
import { orderStudyWordIndices } from "../lib/vocab/word-study-ordering.mjs";
import { resolveMissingQueuePosition } from "../lib/vocab/word-navigation-index.mjs";
import { getStudyKeyboardAction } from "../lib/vocab/study-keyboard-shortcuts.mjs";

/**
 * Word flashcard navigation: markStatus, prev/next, shuffle, keyboard shortcuts.
 */
export function useWordFlashNavigation({
  flashStudyMode,
  flashStudyModeRef,
  studySessionRef,
  latestStateRef,
  words,
  setWords,
  index,
  setIndex,
  filter,
  setToast,
  item,
  isExternalIdictationItem,
  persistWordFlashSessionNow,
  speakWord,
  speakExample,
  deleteCurrentWord,
  matchesStudyWord = wordMatchesFilter
}) {
  const quickStatusLockRef = useRef(false);
  const markStatusRef = useRef(null);
  const nextWordRef = useRef(() => {});
  const prevWordRef = useRef(() => {});
  const speakWordRef = useRef(() => {});
  const speakExampleRef = useRef(() => {});

  function updateCurrent(patch) {
    if (isExternalIdictationItem) {
      setToast("爱听写独立入口不写入总词库，请到总词库里编辑已有词。");
      return;
    }

    const currentIndex = latestStateRef.current?.index ?? index;
    setWords((prev) => {
      if (!Number.isInteger(currentIndex) || !prev[currentIndex]) return prev;
      const next = [...prev];
      next[currentIndex] = { ...next[currentIndex], ...patch };
      return next;
    });
  }

  function navigationIndices(latest) {
    const visibleStudyWords = Array.isArray(latest?.studyWords) ? latest.studyWords : [];
    const sourceWords = Array.isArray(latest?.words) ? latest.words : [];
    const activeFilter = latest?.filter || filter;

    // 页面已经按“现有 / 随机 / 词族 / 场景关联”生成稳定队列。
    // 所有导航都沿用这份队列，避免重新按主词库物理顺序计算。
    if (visibleStudyWords.length) {
      return visibleStudyWords
        .map((word) => word?.originalIndex)
        .filter((value) => Number.isInteger(value));
    }

    // 普通主词库直接由最新 words + filter 生成数字索引队列。
    // 不依赖派生单词对象上的 originalIndex，避免大词库渲染时索引丢失。
    const indices = [];
    for (let sourceIndex = 0; sourceIndex < sourceWords.length; sourceIndex += 1) {
      if (matchesStudyWord(sourceWords[sourceIndex], activeFilter, sourceIndex)) {
        indices.push(sourceIndex);
      }
    }

    if (indices.length) return sortWordIndicesForFilter(indices, sourceWords, activeFilter);

    // 兼容极短暂的词库加载阶段。
    return visibleStudyWords
      .map((word) => word?.originalIndex)
      .filter((value) => Number.isInteger(value));
  }

  function applyNavigationIndex(latest, nextIndex) {
    if (!Number.isInteger(nextIndex)) return false;

    studySessionRef.current.userAdjusted = true;
    studySessionRef.current.restoreTargetIndex = null;
    studySessionRef.current.persistBlocked = false;
    studySessionRef.current.settling = false;

    latest.index = nextIndex;
    setIndex(nextIndex);
    persistWordFlashSessionNow(nextIndex, latest.filter || filter, latest.words || words);
    return true;
  }

  function nextWord() {
    const latest = latestStateRef.current;
    const queue = navigationIndices(latest);
    if (!queue.length) return;

    const position = queue.indexOf(latest.index);
    const nextPosition = position < 0
      ? resolveMissingQueuePosition(queue, latest.index, "next")
      : (position + 1) % queue.length;
    applyNavigationIndex(latest, queue[nextPosition]);
  }

  function prevWord() {
    const latest = latestStateRef.current;
    const queue = navigationIndices(latest);
    if (!queue.length) return;

    const position = queue.indexOf(latest.index);
    const prevPosition = position < 0
      ? resolveMissingQueuePosition(queue, latest.index, "prev")
      : (position - 1 + queue.length) % queue.length;
    applyNavigationIndex(latest, queue[prevPosition]);
  }

  function markStatus(status) {
    if (isExternalIdictationItem) {
      nextWord();
      setToast("爱听写独立入口按表格练习，不改变总词库状态。");
      return;
    }

    const latest = latestStateRef.current;
    const currentOriginalIndex = latest.index;
    const currentWord = latest.words[currentOriginalIndex];
    if (!currentWord) return;

    const currentStatus = currentWord.status || "";
    const nextStatus = status === "不熟" && currentStatus === "不熟" ? "" : status;
    const reviewedAt = new Date().toISOString();
    const oldQueue = navigationIndices(latest);
    const oldPosition = Math.max(0, oldQueue.indexOf(currentOriginalIndex));

    const simulatedWords = latest.words.map((word, wordIndex) => (
      wordIndex === currentOriginalIndex ? { ...word, status: nextStatus, lastReviewedAt: reviewedAt } : word
    ));
    const candidateIndices = [];

    for (let wordIndex = 0; wordIndex < simulatedWords.length; wordIndex += 1) {
      if (nextStatus === "熟悉" && wordIndex === currentOriginalIndex) continue;
      if (matchesStudyWord(simulatedWords[wordIndex], filter, wordIndex)) candidateIndices.push(wordIndex);
    }

    const sortedCandidateIndices = orderStudyWordIndices(
      sortWordIndicesForFilter(candidateIndices, simulatedWords, filter),
      simulatedWords,
      {
        mode: latest.wordOrderMode,
        seed: latest.wordOrderSeed
      }
    );
    let targetIndex = currentOriginalIndex;
    if (sortedCandidateIndices.length) {
      const currentCandidatePosition = sortedCandidateIndices.indexOf(currentOriginalIndex);
      const targetPosition =
        nextStatus === "熟悉" || currentCandidatePosition < 0
          ? Math.min(oldPosition, sortedCandidateIndices.length - 1)
          : (currentCandidatePosition + 1) % sortedCandidateIndices.length;
      targetIndex = sortedCandidateIndices[targetPosition];
    }

    studySessionRef.current.userAdjusted = true;
    studySessionRef.current.restoreTargetIndex = null;
    studySessionRef.current.persistBlocked = false;
    studySessionRef.current.settling = false;

    setWords((prev) => {
      const word = prev[currentOriginalIndex];
      if (!word || word.status === nextStatus) return prev;
      return prev.toSpliced(currentOriginalIndex, 1, { ...word, status: nextStatus, lastReviewedAt: reviewedAt });
    });

    if (targetIndex !== currentOriginalIndex) {
      latestStateRef.current.index = targetIndex;
      setIndex(targetIndex);
      persistWordFlashSessionNow(targetIndex, latest.filter || filter, simulatedWords);
    }

    if (status === "熟悉") {
      setToast("已标记熟悉，并从所有学习词库隐藏");
    } else if (status === "不熟" && currentStatus === "不熟") {
      setToast("已取消不熟状态");
    } else if (status === "不熟") {
      setToast("已加入不熟词库");
    } else {
      setToast(`已标记：${status}`);
    }
  }

  function toggleFavorite() {
    if (isExternalIdictationItem) {
      setToast("爱听写独立入口不写入总词库收藏。");
      return;
    }

    updateCurrent({ favorite: !item.favorite });
    setToast(item.favorite ? "已取消收藏" : "已收藏");
  }

  markStatusRef.current = markStatus;
  nextWordRef.current = nextWord;
  prevWordRef.current = prevWord;
  speakWordRef.current = speakWord;
  speakExampleRef.current = speakExample;

  // 1/2/3 mark status + D/Delete current word
  useEffect(() => {
    const deleteFnRef = { current: deleteCurrentWord };

    function runDeleteCurrentWord() {
      const latest = latestStateRef.current || {};
      if (latest.loading || latest.isStudyEmpty || quickStatusLockRef.current) {
        return;
      }
      const deleteFn = deleteFnRef.current;
      if (typeof deleteFn !== "function") return;

      quickStatusLockRef.current = true;
      let deletionResult = null;
      try {
        deletionResult = deleteFn();
      } catch {
        deletionResult = null;
      }

      // confirm() cancel or guarded delete returns null — always release the lock.
      if (!deletionResult?.deleted) {
        quickStatusLockRef.current = false;
        return;
      }

      // Short lock: block only double-fire on the same keydown, not the next delete.
      window.setTimeout(() => {
        quickStatusLockRef.current = false;
      }, 40);
    }

    function handleQuickStatus(event) {
      if (flashStudyModeRef.current !== "word") return;

      const target = event.target;
      const tagName = target?.tagName?.toLowerCase();

      if (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target?.isContentEditable ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.repeat
      ) {
        return;
      }

      const key = event.key || "";
      const code = event.code || "";
      const isDeleteKey = key === "Delete" || code === "Delete" || event.keyCode === 46 || event.which === 46;
      // Handle real D directly (do not rely on synthetic Delete KeyboardEvents).
      const isDShortcut = key.toLowerCase() === "d" || code === "KeyD";

      if (isDeleteKey || isDShortcut) {
        event.preventDefault();
        event.stopPropagation();
        runDeleteCurrentWord();
        return;
      }

      const isOne = key === "1" || code === "Digit1" || code === "Numpad1";
      const isTwo = key === "2" || code === "Digit2" || code === "Numpad2";
      const isThree = key === "3" || code === "Digit3" || code === "Numpad3";

      if (!isOne && !isTwo && !isThree) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const latest = latestStateRef.current;

      if (latest.loading || latest.isStudyEmpty || quickStatusLockRef.current) {
        return;
      }

      quickStatusLockRef.current = true;
      const quickStatus = isOne ? "熟悉" : isTwo ? "模糊" : "不熟";

      if (typeof markStatusRef.current === "function") {
        markStatusRef.current(quickStatus);
      }

      window.setTimeout(() => {
        quickStatusLockRef.current = false;
      }, 90);
    }

    function handleDeleteRequest() {
      if (flashStudyModeRef.current !== "word") return;
      runDeleteCurrentWord();
    }

    deleteFnRef.current = deleteCurrentWord;
    window.addEventListener("keydown", handleQuickStatus, true);
    window.addEventListener("ielts-vocab:delete-current-word", handleDeleteRequest);

    return () => {
      window.removeEventListener("keydown", handleQuickStatus, true);
      window.removeEventListener("ielts-vocab:delete-current-word", handleDeleteRequest);
    };
  }, [deleteCurrentWord, flashStudyModeRef, latestStateRef]);

  // Tab = word audio; Space = example audio; arrows = navigate.
  useEffect(() => {
    function handleKeyDown(event) {
      if (flashStudyMode !== "word") return;
      const action = getStudyKeyboardAction(event);

      if (action === "word-audio") {
        event.preventDefault();
        speakWordRef.current(true);
        return;
      }

      if (action === "example-audio") {
        event.preventDefault();
        // Match UI: "快捷键空格" on the example speaker button.
        if (typeof speakExampleRef.current === "function") {
          speakExampleRef.current();
        }
        return;
      }

      if (action === "next") {
        event.preventDefault();
        nextWordRef.current();
        return;
      }

      if (action === "previous") {
        event.preventDefault();
        prevWordRef.current();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [flashStudyMode]);

  return {
    markStatus,
    nextWord,
    prevWord,
    toggleFavorite,
    updateCurrent
  };
}
