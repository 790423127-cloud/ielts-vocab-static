"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  SPELLING_SHORTCUT_ACTIONS,
  resolveSpellingShortcut
} from "../lib/spelling/training-shortcuts.mjs";

function isEditableTarget(target) {
  const tag = target?.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
}

function isWordNavigationShortcut(event) {
  const key = event.key;
  if (key !== "ArrowLeft" && key !== "ArrowRight") return false;
  return event.ctrlKey || event.metaKey;
}

export function useSpellingTrainingControls(options = {}) {
  const inputRef = useRef(null);
  const allowBlurRef = useRef(false);
  const {
    enabled = true,
    current,
    spelling,
    speech,
    listenOnlyMode = false,
    showMeaning = true,
    showExample = true,
    onToggleMeaning,
    onToggleExample,
    onSubmit,
    onSkip,
    onMarkFamiliar,
    onEnqueuePriorityReview,
    onReplay,
    onPlayExample,
    onContinueAfterCorrect,
    onUndo,
    onPreviousWord,
    onNextWord
  } = options;

  const focusInput = useCallback((options = {}) => {
    if (!enabled || !inputRef.current) return;
    if (options.force !== true && allowBlurRef.current) return;

    window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input || input.disabled) return;
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }
      if (typeof input.setSelectionRange === "function") {
        const end = input.value.length;
        input.setSelectionRange(end, end);
      }
    });
  }, [enabled]);

  const markSettingsInteraction = useCallback(() => {
    allowBlurRef.current = true;
    window.setTimeout(() => {
      allowBlurRef.current = false;
    }, 250);
  }, []);

  const handleInputBlur = useCallback(() => {
    if (allowBlurRef.current) return;
    focusInput({ force: true });
  }, [focusInput]);

  const handleInputKeyDown = useCallback((event) => {
    if (!enabled || !current) return;
    const action = resolveSpellingShortcut(event, {
      isPhraseTyping: current.entryType === "phrase"
        && event.target === inputRef.current
        && Boolean(event.currentTarget?.value),
      awaitingAdvance: spelling?.uiState === "correct_feedback" && spelling?.awaitingAdvance
    });

    if (action === SPELLING_SHORTCUT_ACTIONS.PLAY_WORD) {
      event.preventDefault();
      speech?.playWord?.();
      focusInput({ force: true });
      return;
    }

    if (action === SPELLING_SHORTCUT_ACTIONS.PLAY_EXAMPLE) {
      event.preventDefault();
      if (onPlayExample) {
        onPlayExample();
      } else {
        speech?.playExample?.();
      }
      focusInput({ force: true });
      return;
    }

    if (action === SPELLING_SHORTCUT_ACTIONS.SKIP) {
      event.preventDefault();
      onSkip?.();
      focusInput({ force: true });
      return;
    }

    if (action === SPELLING_SHORTCUT_ACTIONS.CONTINUE) {
      event.preventDefault();
      onContinueAfterCorrect?.();
      focusInput({ force: true });
      return;
    }

    if (action === SPELLING_SHORTCUT_ACTIONS.SUBMIT) {
      event.preventDefault();
      onSubmit?.();
      focusInput({ force: true });
      return;
    }

    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && (event.key === "z" || event.key === "Z")) {
      event.preventDefault();
      onUndo?.();
      focusInput({ force: true });
      return;
    }

    if (isWordNavigationShortcut(event)) {
      event.preventDefault();
      if (event.key === "ArrowLeft") {
        onPreviousWord?.();
      } else {
        onNextWord?.();
      }
      focusInput({ force: true });
      return;
    }

    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key === "1") {
      event.preventDefault();
      onReplay?.();
      focusInput({ force: true });
      return;
    }

    if (event.key === "2") {
      event.preventDefault();
      onToggleMeaning?.();
      focusInput({ force: true });
      return;
    }

    if (event.key === "3") {
      event.preventDefault();
      onToggleExample?.();
      focusInput({ force: true });
      return;
    }

    if (event.key === "4") {
      event.preventDefault();
      onMarkFamiliar?.();
      focusInput({ force: true });
      return;
    }

    if (event.key === "5") {
      event.preventDefault();
      onEnqueuePriorityReview?.();
      focusInput({ force: true });
      return;
    }
  }, [
    enabled,
    current,
    speech,
    focusInput,
    onSkip,
    onSubmit,
    onReplay,
    onToggleMeaning,
    onToggleExample,
    onMarkFamiliar,
    onEnqueuePriorityReview,
    onPlayExample,
    onContinueAfterCorrect,
    onUndo,
    onPreviousWord,
    onNextWord,
    spelling?.uiState,
    spelling?.awaitingAdvance
  ]);

  useEffect(() => {
    if (!enabled) return undefined;

    function handleWindowKeyDown(event) {
      if (isEditableTarget(event.target)) return;
      if (!current) return;

      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && (event.key === "z" || event.key === "Z")) {
        event.preventDefault();
        onUndo?.();
        focusInput({ force: true });
        return;
      }

      if (isWordNavigationShortcut(event)) {
        event.preventDefault();
        if (event.key === "ArrowLeft") {
          onPreviousWord?.();
        } else {
          onNextWord?.();
        }
        focusInput({ force: true });
        return;
      }

      const action = resolveSpellingShortcut(event, {
        awaitingAdvance: spelling?.uiState === "correct_feedback" && spelling?.awaitingAdvance
      });

      if (action === SPELLING_SHORTCUT_ACTIONS.PLAY_WORD) {
        event.preventDefault();
        speech?.playWord?.();
        focusInput({ force: true });
        return;
      }

      if (action === SPELLING_SHORTCUT_ACTIONS.PLAY_EXAMPLE) {
        event.preventDefault();
        if (onPlayExample) {
          onPlayExample();
        } else {
          speech?.playExample?.();
        }
        focusInput({ force: true });
        return;
      }

      if (action === SPELLING_SHORTCUT_ACTIONS.SKIP) {
        event.preventDefault();
        onSkip?.();
        focusInput({ force: true });
        return;
      }

      if (action === SPELLING_SHORTCUT_ACTIONS.CONTINUE || action === SPELLING_SHORTCUT_ACTIONS.SUBMIT) {
        event.preventDefault();
        if (action === SPELLING_SHORTCUT_ACTIONS.CONTINUE) {
          onContinueAfterCorrect?.();
        } else {
          onSubmit?.();
        }
        focusInput({ force: true });
      }
    }

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [
    enabled,
    current,
    speech,
    focusInput,
    onPlayExample,
    onSkip,
    onSubmit,
    onContinueAfterCorrect,
    onUndo,
    onPreviousWord,
    onNextWord,
    spelling?.uiState,
    spelling?.awaitingAdvance
  ]);

  useEffect(() => {
    if (!enabled || !current) return;
    if (spelling?.uiState === "correct_feedback" || spelling?.uiState === "inputting") return;
    focusInput({ force: true });
  }, [enabled, current?.wordId, spelling?.uiState, focusInput]);

  useEffect(() => {
    if (!enabled || !speech?.playing) return;
    const timer = window.setTimeout(() => focusInput({ force: true }), 60);
    return () => window.clearTimeout(timer);
  }, [enabled, speech?.playing, focusInput]);

  useEffect(() => {
    if (!enabled || !listenOnlyMode || !current) return;
    if (spelling?.uiState === "wrong_feedback" || spelling?.uiState === "correct_feedback" || spelling?.uiState === "inputting") {
      return undefined;
    }

    const timer = window.setTimeout(() => speech?.playWord?.(), 500);
    return () => window.clearTimeout(timer);
  }, [enabled, listenOnlyMode, current?.wordId, spelling?.uiState, speech]);

  return {
    inputRef,
    focusInput,
    markSettingsInteraction,
    handleInputBlur,
    handleInputKeyDown,
    showMeaning,
    showExample
  };
}

export default useSpellingTrainingControls;
