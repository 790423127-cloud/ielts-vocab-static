"use client";

import { startTransition, useEffect, useRef } from "react";
import {
  getFilterName,
  wordMatchesFilter
} from "../lib/vocab/word-flashcard-study-pool.mjs";

/**
 * Word flashcard navigation: markStatus, prev/next, shuffle, keyboard shortcuts.
 */
export function useWordFlashNavigation({
  flashStudyMode,
  flashStudyModeRef,
  studySessionRef,
  latestStateRef,
  studyWords,
  words,
  setWords,
  index,
  setIndex,
  filter,
  setToast,
  item,
  isExternalIdictationItem,
  idictationFlashSourceKey,
  persistWordFlashSessionNow,
  speakWord,
  speakExample,
  deleteCurrentWord
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

    setWords((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function nextWord() {
    studySessionRef.current.userAdjusted = true;
    studySessionRef.current.restoreTargetIndex = null;
    studySessionRef.current.persistBlocked = false;
    const latest = latestStateRef.current;
    if (!latest.studyWords?.length) return;

    let position = latest.studyWords.findIndex((word) => word.originalIndex === latest.index);
    if (position < 0) position = 0;
    const next = latest.studyWords[(position + 1) % latest.studyWords.length];
    const nextIndex = next.originalIndex;

    latest.index = nextIndex;
    startTransition(() => setIndex(nextIndex));
  }

  function prevWord() {
    studySessionRef.current.userAdjusted = true;
    studySessionRef.current.restoreTargetIndex = null;
    studySessionRef.current.persistBlocked = false;
    const latest = latestStateRef.current;
    if (!latest.studyWords?.length) return;

    let position = latest.studyWords.findIndex((word) => word.originalIndex === latest.index);
    if (position < 0) position = 0;
    const prev = latest.studyWords[(position - 1 + latest.studyWords.length) % latest.studyWords.length];
    const prevIndex = prev.originalIndex;

    latest.index = prevIndex;
    startTransition(() => setIndex(prevIndex));
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

    const oldStudyWords = latest.studyWords?.length ? latest.studyWords : studyWords;
    const oldPosition = Math.max(
      0,
      oldStudyWords.findIndex((word) => word.originalIndex === currentOriginalIndex)
    );

    const simulatedStudyWords = oldStudyWords
      .map((word) => (word.originalIndex === currentOriginalIndex ? { ...word, status: nextStatus } : word))
      .filter((word) => wordMatchesFilter(word, filter));
    const stillVisiblePosition = simulatedStudyWords.findIndex(
      (word) => word.originalIndex === currentOriginalIndex
    );
    const candidateStudyWords = nextStatus === "熟悉"
      ? simulatedStudyWords.filter((word) => word.originalIndex !== currentOriginalIndex)
      : simulatedStudyWords;

    let targetIndex = currentOriginalIndex;
    if (candidateStudyWords.length) {
      let targetPosition;
      if (nextStatus === "熟悉" || stillVisiblePosition < 0) {
        targetPosition = Math.min(oldPosition, candidateStudyWords.length - 1);
      } else {
        targetPosition = (stillVisiblePosition + 1) % candidateStudyWords.length;
      }
      targetIndex = candidateStudyWords[targetPosition].originalIndex;
    }

    studySessionRef.current.userAdjusted = true;
    studySessionRef.current.restoreTargetIndex = null;
    studySessionRef.current.persistBlocked = false;

    startTransition(() => {
      setWords((prev) => {
        const word = prev[currentOriginalIndex];
        if (!word) return prev;
        if (word.status === nextStatus) return prev;
        return prev.toSpliced(currentOriginalIndex, 1, { ...word, status: nextStatus });
      });

      if (targetIndex !== currentOriginalIndex) {
        latestStateRef.current.index = targetIndex;
        setIndex(targetIndex);
      }
    });

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

  function shuffleStudyWords() {
    studySessionRef.current.userAdjusted = true;
    studySessionRef.current.restoreTargetIndex = null;
    studySessionRef.current.persistBlocked = false;

    if (idictationFlashSourceKey) {
      if (studyWords.length < 2) {
        setToast("当前范围单词太少，无法随机");
        return;
      }

      const random = studyWords[Math.floor(Math.random() * studyWords.length)];
      latestStateRef.current.index = random.originalIndex;
      setIndex(random.originalIndex);
      persistWordFlashSessionNow(random.originalIndex);
      setToast(`${getFilterName(filter)} 已随机跳转；表格顺序保持不变`);
      return;
    }

    const currentMatches = words
      .map((word, originalIndex) => ({ word, originalIndex }))
      .filter(({ word }) => wordMatchesFilter(word, filter));

    if (currentMatches.length < 2) {
      setToast("当前范围单词太少，无法随机");
      return;
    }

    const targetIndices = currentMatches.map((entry) => entry.originalIndex);
    const shuffledWords = currentMatches.map((entry) => entry.word);

    for (let i = shuffledWords.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledWords[i], shuffledWords[j]] = [shuffledWords[j], shuffledWords[i]];
    }

    setWords((prev) => {
      const next = [...prev];
      targetIndices.forEach((targetIndex, orderIndex) => {
        next[targetIndex] = shuffledWords[orderIndex];
      });
      return next;
    });

    const randomIndex = targetIndices[0];
    latestStateRef.current.index = randomIndex;
    setIndex(randomIndex);
    persistWordFlashSessionNow(randomIndex);
    setToast(`${getFilterName(filter)} 已随机打乱`);
  }

  markStatusRef.current = markStatus;
  nextWordRef.current = nextWord;
  prevWordRef.current = prevWord;
  speakWordRef.current = speakWord;
  speakExampleRef.current = speakExample;

  // 0/1 mark status + Delete current word
  useEffect(() => {
    function handleQuickStatus(event) {
      if (flashStudyModeRef.current !== "word") return;

      const target = event.target;
      const tagName = target?.tagName?.toLowerCase();

      if (
        tagName === "input" ||
        tagName === "textarea" ||
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
      const isDelete = key === "Delete" || code === "Delete" || event.keyCode === 46 || event.which === 46;

      if (isDelete) {
        event.preventDefault();
        event.stopPropagation();

        const latest = latestStateRef.current;

        if (latest.loading || latest.isStudyEmpty || quickStatusLockRef.current) {
          return;
        }

        quickStatusLockRef.current = true;
        if (typeof deleteCurrentWord === "function") {
          deleteCurrentWord();
        }

        window.setTimeout(() => {
          quickStatusLockRef.current = false;
        }, 180);

        return;
      }

      const isZero = key === "0" || code === "Digit0" || code === "Numpad0";
      const isOne = key === "1" || code === "Digit1" || code === "Numpad1";

      if (!isZero && !isOne) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const latest = latestStateRef.current;

      if (latest.loading || latest.isStudyEmpty || quickStatusLockRef.current) {
        return;
      }

      quickStatusLockRef.current = true;
      const quickStatus = isZero ? "熟悉" : "不熟";

      if (typeof markStatusRef.current === "function") {
        markStatusRef.current(quickStatus);
      }

      window.setTimeout(() => {
        quickStatusLockRef.current = false;
      }, 90);
    }

    window.addEventListener("keydown", handleQuickStatus, true);

    return () => {
      window.removeEventListener("keydown", handleQuickStatus, true);
    };
  }, [deleteCurrentWord, flashStudyModeRef, latestStateRef]);

  // Tab/Space/arrows
  useEffect(() => {
    function isTypingTarget(target) {
      const tag = target?.tagName?.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
    }

    function handleKeyDown(event) {
      if (flashStudyMode !== "word") return;
      if (isTypingTarget(event.target)) return;

      if (event.key === "Tab") {
        if (event.repeat) return;
        event.preventDefault();
        speakWordRef.current(true);
      }

      if (event.key === " " || event.code === "Space" || event.key === "Spacebar") {
        if (event.repeat) return;
        event.preventDefault();
        speakExampleRef.current();
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        nextWordRef.current();
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        prevWordRef.current();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [flashStudyMode]);

  return {
    markStatus,
    nextWord,
    prevWord,
    toggleFavorite,
    shuffleStudyWords,
    updateCurrent
  };
}
