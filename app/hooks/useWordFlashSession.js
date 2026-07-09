"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import {
  buildStudyPoolForFilter,
  filterKey,
  isIdictationFlashFilter,
  wordMatchesFilter
} from "../lib/vocab/word-flashcard-study-pool.mjs";
import {
  clearWordStudySession,
  normalizeWordFlashFilter,
  persistWordFlashSession,
  readWordFlashEntryPositions,
  readWordFlashPendingSession,
  resolveCurrentStudyItem,
  resolveWordStudyIndex,
  restoreMessageForReason
} from "../lib/vocab/word-flashcard-session.mjs";
import {
  releaseStudyPersistBlock,
  shouldBlockStudyIndexPersist,
  shouldReResolveStudyIndex,
  shouldRunFullStudyRestore
} from "../lib/vocab/study-session.mjs";
import {
  normalizeWord,
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet
} from "../lib/vocab/page-word-helpers.mjs";

/**
 * Word flashcard session restore / debounced persist / pagehide flush.
 */
export function useWordFlashSession({
  words,
  index,
  setIndex,
  filter,
  setFilter,
  setToast,
  storageReadyRef,
  latestStateRef
}) {
  const studySessionRef = useRef({
    restored: false,
    userAdjusted: false,
    persistBlocked: true,
    restoreTargetIndex: null,
    settling: false,
    toastShown: false,
    wordsGeneration: 0
  });
  const sessionPersistTimerRef = useRef(null);
  const pendingSessionPersistRef = useRef(null);
  // Sync init on client so restore can see pending session before first words layout effect.
  const entryPositionsRef = useRef(null);
  const pendingSessionRef = useRef(null);
  const bootstrappedFilterRef = useRef(false);

  if (entryPositionsRef.current === null) {
    entryPositionsRef.current =
      typeof window !== "undefined" ? readWordFlashEntryPositions(safeLocalStorageGet) : {};
  }
  if (pendingSessionRef.current === null && typeof window !== "undefined") {
    pendingSessionRef.current = readWordFlashPendingSession(safeLocalStorageGet);
  }

  useLayoutEffect(() => {
    if (bootstrappedFilterRef.current) return;
    bootstrappedFilterRef.current = true;
    if (pendingSessionRef.current?.filter) {
      setFilter(normalizeWordFlashFilter(pendingSessionRef.current.filter));
    }
  }, [setFilter]);

  function resetWordStudySessionState({ resetIndex = true } = {}) {
    entryPositionsRef.current = {};
    pendingSessionRef.current = null;
    clearWordStudySession(safeLocalStorageRemove);
    studySessionRef.current = {
      restored: true,
      userAdjusted: true,
      persistBlocked: false,
      restoreTargetIndex: null,
      settling: false,
      toastShown: true,
      wordsGeneration: studySessionRef.current.wordsGeneration
    };
    if (resetIndex) {
      latestStateRef.current.index = 0;
      setIndex(0);
    }
  }

  function persistWordFlashSessionNow(nextIndex = index, nextFilter = filter, nextWords = words) {
    if (sessionPersistTimerRef.current) {
      clearTimeout(sessionPersistTimerRef.current);
      sessionPersistTimerRef.current = null;
    }
    pendingSessionPersistRef.current = null;

    if (!storageReadyRef.current || !studySessionRef.current.restored) return false;
    if (!Array.isArray(nextWords) || !nextWords.length) return false;

    const studyPool = buildStudyPoolForFilter(nextFilter, nextWords);
    if (isIdictationFlashFilter(nextFilter) && !studyPool?.length) return false;

    const result = persistWordFlashSession({
      words: nextWords,
      index: nextIndex,
      filter: nextFilter,
      entryPositions: entryPositionsRef.current,
      filterKey,
      normalizeWord,
      studyPool,
      storageSet: safeLocalStorageSet
    });

    entryPositionsRef.current = result.entryPositions;

    if (!result.saved) {
      setToast?.("学习位置保存失败，请检查浏览器存储空间");
    }

    return result.saved;
  }

  function queueWordFlashSessionPersist(nextIndex = index, nextFilter = filter, nextWords = words) {
    pendingSessionPersistRef.current = {
      index: nextIndex,
      filter: nextFilter,
      words: nextWords
    };

    if (sessionPersistTimerRef.current) {
      clearTimeout(sessionPersistTimerRef.current);
    }

    sessionPersistTimerRef.current = window.setTimeout(() => {
      const pending = pendingSessionPersistRef.current;
      if (!pending) return;

      persistWordFlashSessionNow(pending.index, pending.filter, pending.words);
    }, 280);
  }

  function flushQueuedWordFlashSessionPersist() {
    const pending = pendingSessionPersistRef.current;
    if (!pending) return false;

    return persistWordFlashSessionNow(pending.index, pending.filter, pending.words);
  }

  useLayoutEffect(() => {
    if (!storageReadyRef.current || !words.length) return;

    const sessionState = studySessionRef.current;
    sessionState.wordsGeneration += 1;

    if (sessionState.userAdjusted) {
      sessionState.restored = true;
      sessionState.persistBlocked = false;
      return;
    }

    const pending = pendingSessionRef.current || readWordFlashPendingSession(safeLocalStorageGet);

    if (!shouldRunFullStudyRestore(sessionState)) {
      if (!shouldReResolveStudyIndex(sessionState, pending || {})) return;

      const restoreFilter = normalizeWordFlashFilter(pending?.filter || filter);
      const studyPool = buildStudyPoolForFilter(restoreFilter, words);
      const result = resolveWordStudyIndex(words, {
        session: pending,
        entryPositions: entryPositionsRef.current,
        filter: restoreFilter,
        wordMatchesFilter,
        filterKey,
        normalizeWord,
        studyPool
      });

      if (result.index >= 0 && result.index !== index) {
        sessionState.restoreTargetIndex = result.index;
        sessionState.persistBlocked = true;
        sessionState.settling = true;
        latestStateRef.current.index = result.index;
        setIndex(result.index);
      }
      return;
    }

    if (!pending) {
      sessionState.restored = true;
      sessionState.persistBlocked = false;
      sessionState.restoreTargetIndex = null;
      return;
    }

    const restoreFilter = normalizeWordFlashFilter(pending?.filter || filter);
    const studyPool = buildStudyPoolForFilter(restoreFilter, words);

    const result = resolveWordStudyIndex(words, {
      session: pending,
      entryPositions: entryPositionsRef.current,
      filter: restoreFilter,
      wordMatchesFilter,
      filterKey,
      normalizeWord,
      studyPool
    });

    if (result.filter) {
      latestStateRef.current.filter = result.filter;
      setFilter(result.filter);
    }

    sessionState.restored = true;
    sessionState.persistBlocked = true;
    sessionState.settling = result.index >= 0;
    sessionState.restoreTargetIndex = result.index >= 0 ? result.index : null;

    if (result.index >= 0) {
      latestStateRef.current.index = result.index;
      setIndex(result.index);
    } else {
      sessionState.persistBlocked = false;
      sessionState.settling = false;
      sessionState.restoreTargetIndex = null;
    }

    const restoredItem = resolveCurrentStudyItem({
      words,
      index: result.index,
      filter: result.filter || restoreFilter,
      studyPool
    });

    if (!sessionState.toastShown) {
      const message = result.restored
        ? restoreMessageForReason(result.reason, restoredItem?.word || "")
        : restoreMessageForReason("notFound");

      if (message) setToast?.(message);
      sessionState.toastShown = true;
    }
  }, [words]);

  useEffect(() => {
    if (!storageReadyRef.current || !studySessionRef.current.restored) return;
    if (shouldBlockStudyIndexPersist(studySessionRef.current, index)) return;

    releaseStudyPersistBlock(studySessionRef.current, index);
    queueWordFlashSessionPersist();
  }, [index]);

  useEffect(() => {
    function handlePageHide() {
      const latest = latestStateRef.current;
      if (!storageReadyRef.current || !studySessionRef.current.restored) return;
      if (!Array.isArray(latest.words) || !latest.words.length) return;

      if (flushQueuedWordFlashSessionPersist()) return;

      const studyPool = buildStudyPoolForFilter(latest.filter, latest.words);

      persistWordFlashSession({
        words: latest.words,
        index: latest.index,
        filter: latest.filter,
        entryPositions: entryPositionsRef.current,
        filterKey,
        normalizeWord,
        studyPool,
        storageSet: safeLocalStorageSet
      });
    }

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      if (sessionPersistTimerRef.current) {
        clearTimeout(sessionPersistTimerRef.current);
      }
      flushQueuedWordFlashSessionPersist();
    };
  }, []);

  return {
    studySessionRef,
    entryPositionsRef,
    pendingSessionRef,
    persistWordFlashSessionNow,
    queueWordFlashSessionPersist,
    flushQueuedWordFlashSessionPersist,
    resetWordStudySessionState
  };
}
