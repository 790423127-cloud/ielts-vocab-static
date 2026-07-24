"use client";

import { useEffect, useRef } from "react";
import {
  getFilterName,
  wordMatchesFilter
} from "../lib/vocab/word-flashcard-study-pool.mjs";
import { resolveMissingQueuePosition } from "../lib/vocab/word-navigation-index.mjs";

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

    // 爱听写使用 10 亿偏移后的虚拟索引，必须保留 studyWords 中的 originalIndex。
    if (visibleStudyWords.some((word) => word?.__idictationFlash)) {
      return visibleStudyWords
        .map((word) => word?.originalIndex)
        .filter((value) => Number.isInteger(value));
    }

    // 普通主词库直接由最新 words + filter 生成数字索引队列。
    // 不依赖派生单词对象上的 originalIndex，避免大词库渲染时索引丢失。
    const sourceWords = Array.isArray(latest?.words) ? latest.words : [];
    const activeFilter = latest?.filter || filter;
    const indices = [];

    for (let sourceIndex = 0; sourceIndex < sourceWords.length; sourceIndex += 1) {
      if (wordMatchesFilter(sourceWords[sourceIndex], activeFilter)) {
        indices.push(sourceIndex);
      }
    }

    if (indices.length) return indices;

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
      if (wordMatchesFilter(simulatedWords[wordIndex], filter)) candidateIndices.push(wordIndex);
    }

    let targetIndex = currentOriginalIndex;
    if (candidateIndices.length) {
      const currentCandidatePosition = candidateIndices.indexOf(currentOriginalIndex);
      const targetPosition =
        nextStatus === "熟悉" || currentCandidatePosition < 0
          ? Math.min(oldPosition, candidateIndices.length - 1)
          : (currentCandidatePosition + 1) % candidateIndices.length;
      targetIndex = candidateIndices[targetPosition];
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

  function shuffleStudyWords() {
    studySessionRef.current.userAdjusted = true;
    studySessionRef.current.restoreTargetIndex = null;
    studySessionRef.current.persistBlocked = false;
    studySessionRef.current.settling = false;

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

  // 1/2/3 mark status + Delete current word
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
        studySessionRef.current.userAdjusted = true;
        studySessionRef.current.restoreTargetIndex = null;
        studySessionRef.current.persistBlocked = false;
        studySessionRef.current.settling = false;

        if (typeof deleteCurrentWord === "function") {
          deleteCurrentWord();
        }

        window.setTimeout(() => {
          quickStatusLockRef.current = false;
        }, 180);

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

    window.addEventListener("keydown", handleQuickStatus, true);

    return () => {
      window.removeEventListener("keydown", handleQuickStatus, true);
    };
  }, [deleteCurrentWord, flashStudyModeRef, latestStateRef, studySessionRef]);

  // Tab plays the word; Space and arrows navigate.
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
        nextWordRef.current();
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
