import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createSpellingUiBridge } from "../lib/spelling/ui-bridge.mjs";
import { formatSpellingErrorDiagnosis } from "../lib/spelling/spelling-error-diagnosis.mjs";
import { getSpellingHint } from "../lib/spelling/state-machine.mjs";
import { resolveSpellingScope } from "../lib/spelling/spelling-scope.mjs";
import { getWordId } from "../lib/spelling/word-id.mjs";
import { playSpellingFeedbackSfx } from "../lib/spelling/spelling-feedback-sfx.mjs";
import { preloadSpellingEntryAudio } from "../lib/vocab-speech.mjs";

function noop() {}

const CORRECT_ADVANCE_DELAY_MS = 1400;
const TURBO_ADVANCE_DELAY_MS = 900;
const AUTO_SUBMIT_DEBOUNCE_MS = 400;

function statusTextFor(uiState, detail = "") {
  switch (uiState) {
    case "show_question":
      return "请输入当前词的英文拼写";
    case "inputting":
      return "正在判定拼写";
    case "correct_feedback":
      return detail || "拼写正确";
    case "wrong_feedback":
      return detail || "拼写错误，请重新输入";
    case "in_repair":
      return detail || "请继续拼写当前内容";
    case "waiting_second":
      return "请继续完成当前范围";
    case "done_today":
      return "今日拼写已完成";
    default:
      return "拼写训练准备中";
  }
}

function wait(ms = 0) {
  return new Promise((resolve) => {
    const schedule = typeof globalThis.setTimeout === "function"
      ? globalThis.setTimeout
      : setTimeout;
    schedule(resolve, Math.max(0, Number(ms) || 0));
  });
}

function resolveCorrectAdvanceDelay(autoNextOnCorrect, turboMode) {
  if (!autoNextOnCorrect) return 0;
  return turboMode ? TURBO_ADVANCE_DELAY_MS : CORRECT_ADVANCE_DELAY_MS;
}

export function createInitialProductionSpellingState() {
  return {
    currentWord: null,
    inputValue: "",
    setInputValue: noop,
    submit: async () => null,
    skip: async () => null,
    markFamiliar: async () => null,
    enqueuePriorityReview: async () => null,
    hint: "",
    uiState: "idle",
    progress: null,
    todayStats: null,
    statusText: statusTextFor("idle"),
    feedbackDetail: "",
    lastDiagnosis: null,
    debug: null,
    ready: false
  };
}

export function mapSnapshotToProductionHookState(snapshot, options = {}) {
  const uiState = snapshot?.uiState || "idle";
  const stats = snapshot?.sessionProgress || null;

  return {
    currentWord: snapshot?.currentWord || null,
    inputValue: options.inputValue ?? "",
    setInputValue: options.setInputValue || noop,
    submit: options.submit || (async () => null),
    skip: options.skip || (async () => null),
    markFamiliar: options.markFamiliar || (async () => null),
    enqueuePriorityReview: options.enqueuePriorityReview || (async () => null),
    hint: options.hint || "",
    uiState,
    progress: stats,
    todayStats: stats,
    statusText: options.statusText || statusTextFor(uiState, options.feedbackDetail || ""),
    feedbackDetail: options.feedbackDetail || "",
    lastDiagnosis: options.lastDiagnosis || null,
    debug: snapshot?.debug || null,
    repairProgress: snapshot?.expectedInputState?.repairProgressLabel || "",
    repairStreak: snapshot?.expectedInputState?.repairStreak ?? 0,
    repairRequired: snapshot?.expectedInputState?.repairRequired ?? 0,
    totalWrongCount: snapshot?.expectedInputState?.totalWrongCount ?? 0,
    ready: options.ready === true
  };
}

export function buildProductionFlashcardState(words = []) {
  const statuses = {};

  for (const word of Array.isArray(words) ? words : []) {
    const wordId = getWordId(word);
    if (wordId && word?.status) statuses[wordId] = word.status;
  }

  return { statuses };
}

function buildPersonalWrongBatchIdentity(words = []) {
  return (Array.isArray(words) ? words : [])
    .map((entry) => String(entry?.wordId || entry?.id || "").trim())
    .filter(Boolean)
    .sort()
    .join("|");
}

function buildEngineDepsKey(words, candidateOptions, lexiconMeta, debugMode, categoryScope, spellingScope) {
  const practiceSource = categoryScope?.practiceSource || "category";
  const wordsIdentity = practiceSource === "personal_wrong_book"
    ? buildPersonalWrongBatchIdentity(words)
    : String(Array.isArray(words) ? words.length : 0);

  return JSON.stringify({
    spellingScope,
    wordsIdentity,
    lexiconVersion: lexiconMeta?.lexiconVersion || "",
    lexiconHash: lexiconMeta?.lexiconHash || "",
    entryMode: candidateOptions?.entryMode || candidateOptions?.mode || spellingScope?.entryMode || "headwords",
    excludeFamiliar: candidateOptions?.excludeFamiliarFlashcards !== false,
    debugMode: debugMode === true,
    practiceSource,
    currentBatchId: categoryScope?.currentBatchId || ""
  });
}

export function useSpellingEngine(words = [], options = {}) {
  const bridgeRef = useRef(null);
  const initKeyRef = useRef("");
  const initGenerationRef = useRef(0);
  const wordsRef = useRef(words);
  const flashcardStateRef = useRef(null);
  const candidateOptionsRef = useRef(null);
  const lexiconMetaRef = useRef(null);
  const debugModeRef = useRef(options.debugMode);
  const turboModeRef = useRef(options.turboMode === true);
  const autoNextOnCorrectRef = useRef(options.autoNextOnCorrect !== false);
  const soundEffectsEnabledRef = useRef(options.soundEffectsEnabled !== false);
  const pendingAdvanceRef = useRef(null);
  const submitInFlightRef = useRef(false);
  const [inputValue, setInputValue] = useState("");
  const [hintOverrideLevel, setHintOverrideLevel] = useState(0);
  const [snapshot, setSnapshot] = useState(null);
  const [ready, setReady] = useState(false);
  const [statusText, setStatusText] = useState(statusTextFor("idle"));
  const [feedbackDetail, setFeedbackDetail] = useState("");
  const [lastDiagnosis, setLastDiagnosis] = useState(null);
  const [awaitingAdvance, setAwaitingAdvance] = useState(false);
  const flashcardState = useMemo(() => buildProductionFlashcardState(words), [words]);
  const lexiconMeta = options.lexiconMeta || null;
  const candidateOptions = options.candidateOptions || null;

  wordsRef.current = words;
  flashcardStateRef.current = flashcardState;
  candidateOptionsRef.current = candidateOptions;
  lexiconMetaRef.current = lexiconMeta;
  debugModeRef.current = options.debugMode;
  turboModeRef.current = options.turboMode === true;
  autoNextOnCorrectRef.current = options.autoNextOnCorrect !== false;
  soundEffectsEnabledRef.current = options.soundEffectsEnabled !== false;

  const categoryScope = options.categoryScope || null;
  const spellingScope = useMemo(
    () => resolveSpellingScope(options.spellingScope || categoryScope?.scope || "word"),
    [options.spellingScope, categoryScope?.scope]
  );

  const engineDepsKey = useMemo(
    () => buildEngineDepsKey(words, candidateOptions, lexiconMeta, options.debugMode, categoryScope, spellingScope),
    [words, candidateOptions, lexiconMeta, options.debugMode, categoryScope, spellingScope]
  );

  useEffect(() => {
    const activeWords = wordsRef.current;

    if (!activeWords.length) {
      bridgeRef.current = null;
      initKeyRef.current = "";
      setReady(false);
      setSnapshot(null);
      setStatusText(statusTextFor("idle"));
      setFeedbackDetail("");
      setLastDiagnosis(null);
      setAwaitingAdvance(false);
      pendingAdvanceRef.current = null;
      return undefined;
    }

    if (initKeyRef.current === engineDepsKey && bridgeRef.current) {
      return undefined;
    }

    const previousKey = initKeyRef.current;
    const generation = initGenerationRef.current + 1;
    initGenerationRef.current = generation;
    initKeyRef.current = engineDepsKey;

    let cancelled = false;

    const bridge = createSpellingUiBridge({
      words: activeWords,
      flashcardState: flashcardStateRef.current,
      debugMode: debugModeRef.current,
      candidateOptions: candidateOptionsRef.current,
      lexiconMeta: lexiconMetaRef.current,
      scope: spellingScope.scope,
      currentBatchId: categoryScope?.currentBatchId || "",
      category: categoryScope?.label || "",
      source: categoryScope?.practiceSource || "category",
      errorBankTotal: Number(categoryScope?.errorBankTotal) || 0
    });

    bridgeRef.current = bridge;

    if (!previousKey || previousKey !== engineDepsKey) {
      setReady(false);
      setStatusText(statusTextFor("idle"));
      setFeedbackDetail("");
      setLastDiagnosis(null);
    }

    bridge.init()
      .then((nextSnapshot) => {
        if (cancelled || generation !== initGenerationRef.current) return;
        startTransition(() => {
          setSnapshot(nextSnapshot);
          setReady(true);
          setHintOverrideLevel(0);
          setStatusText(statusTextFor(nextSnapshot.uiState));
          setFeedbackDetail("");
          setLastDiagnosis(null);
        });
      })
      .catch((error) => {
        if (cancelled || generation !== initGenerationRef.current) return;
        initKeyRef.current = "";
        setSnapshot(null);
        setReady(false);
        setStatusText(`拼写训练初始化失败：${error?.message || error}`);
      });

    return () => {
      cancelled = true;
    };
  }, [
    engineDepsKey,
    categoryScope?.currentBatchId,
    categoryScope?.errorBankTotal,
    categoryScope?.label,
    categoryScope?.practiceSource,
    spellingScope.scope
  ]);

  function refresh(overrides = {}) {
    const bridge = bridgeRef.current;
    if (!bridge) return null;
    const nextSnapshot = bridge.getCurrentQuestion(overrides);
    setSnapshot(nextSnapshot);
    setHintOverrideLevel(0);
    setStatusText(statusTextFor(nextSnapshot.uiState));
    setFeedbackDetail("");
    return nextSnapshot;
  }

  async function submit() {
    const bridge = bridgeRef.current;
    const answer = inputValue.trim();
    if (!bridge || !ready || !answer) return null;
    if (submitInFlightRef.current) return null;

    setStatusText(statusTextFor("inputting"));
    setSnapshot((prev) => prev ? { ...prev, uiState: "inputting" } : prev);

    submitInFlightRef.current = true;
    let nextSnapshot;
    try {
      nextSnapshot = await bridge.submitAnswer(answer);
    } finally {
      submitInFlightRef.current = false;
    }
    const meta = nextSnapshot?.answerMeta || {};
    const diagnosis = meta.diagnosis || null;
    setLastDiagnosis(diagnosis);

    if (!meta.isCorrect) {
      if (soundEffectsEnabledRef.current) {
        playSpellingFeedbackSfx("wrong");
      }
      setInputValue("");
      const detail = formatSpellingErrorDiagnosis(diagnosis);
      setFeedbackDetail(detail);
      setSnapshot(nextSnapshot);
      setHintOverrideLevel(0);
      setStatusText(statusTextFor("wrong_feedback"));
      return nextSnapshot;
    }

    if (soundEffectsEnabledRef.current) {
      playSpellingFeedbackSfx("correct");
    }

    // Keep the submitted answer visible during correct_feedback; clear only when advancing.
    void preloadSpellingEntryAudio(nextSnapshot?.currentWord || {});

    setHintOverrideLevel(0);
    setFeedbackDetail("");

    const feedbackSnapshot = {
      ...nextSnapshot,
      currentWord: meta.previousWord || nextSnapshot.currentWord,
      expectedInputState: {
        ...(nextSnapshot.expectedInputState || {}),
        totalWrongCount: meta.previousTotalWrongCount ?? nextSnapshot.expectedInputState?.totalWrongCount ?? 0
      },
      uiState: "correct_feedback"
    };
    setSnapshot(feedbackSnapshot);
    setStatusText(statusTextFor("correct_feedback"));

    if (!autoNextOnCorrectRef.current) {
      pendingAdvanceRef.current = nextSnapshot;
      setAwaitingAdvance(true);
      setStatusText("拼写正确，按 Enter 进入下一词");
      return { ...nextSnapshot, answerMeta: meta, awaitingAdvance: true };
    }

    pendingAdvanceRef.current = null;
    setAwaitingAdvance(false);
    const delay = resolveCorrectAdvanceDelay(
      autoNextOnCorrectRef.current,
      turboModeRef.current
    );
    if (delay > 0) await wait(delay);

    setInputValue("");
    setSnapshot(nextSnapshot);
    setStatusText(statusTextFor(nextSnapshot.uiState));
    return { ...nextSnapshot, answerMeta: meta };
  }

  async function continueAfterCorrect() {
    const pending = pendingAdvanceRef.current;
    if (!pending) return null;

    pendingAdvanceRef.current = null;
    setAwaitingAdvance(false);
    setInputValue("");
    setSnapshot(pending);
    setStatusText(statusTextFor(pending.uiState));
    setFeedbackDetail("");
    return pending;
  }

  async function skip() {
    const bridge = bridgeRef.current;
    if (!bridge?.skipQuestion || !ready) return null;

    const nextSnapshot = await bridge.skipQuestion();
    setInputValue("");
    setHintOverrideLevel(0);
    setFeedbackDetail("");
    setLastDiagnosis(null);
    setSnapshot(nextSnapshot);
    setStatusText(statusTextFor(nextSnapshot.uiState));
    return nextSnapshot;
  }

  async function markFamiliar() {
    const bridge = bridgeRef.current;
    if (!bridge?.markFamiliarQuestion || !ready) return null;

    const nextSnapshot = await bridge.markFamiliarQuestion();
    setInputValue("");
    setHintOverrideLevel(0);
    setFeedbackDetail("");
    setLastDiagnosis(null);
    setSnapshot(nextSnapshot);
    setStatusText("已标记熟悉，进入下一题");
    return nextSnapshot;
  }

  async function enqueuePriorityReview() {
    const bridge = bridgeRef.current;
    if (!bridge?.enqueuePriorityReview || !ready) return null;

    const nextSnapshot = await bridge.enqueuePriorityReview();
    setInputValue("");
    setHintOverrideLevel(0);
    setFeedbackDetail("");
    setLastDiagnosis(null);
    setSnapshot(nextSnapshot);
    setStatusText("已加入错词重点复习，进入下一题");
    return nextSnapshot;
  }

  function captureCheckpoint() {
    const bridge = bridgeRef.current;
    if (!bridge?.captureUndoCheckpoint || !ready) return null;
    return bridge.captureUndoCheckpoint();
  }

  async function restoreCheckpoint(checkpoint) {
    const bridge = bridgeRef.current;
    if (!bridge?.restoreUndoCheckpoint || !ready || !checkpoint) return null;

    const nextSnapshot = await bridge.restoreUndoCheckpoint(checkpoint);
    setInputValue("");
    setHintOverrideLevel(0);
    setFeedbackDetail("");
    setLastDiagnosis(null);
    setAwaitingAdvance(false);
    pendingAdvanceRef.current = null;
    setSnapshot(nextSnapshot);
    setStatusText(statusTextFor(nextSnapshot.uiState));
    return nextSnapshot;
  }

  async function goToNextQuestion() {
    const bridge = bridgeRef.current;
    if (!bridge?.goToNextQuestion || !ready) return null;

    const nextSnapshot = await bridge.goToNextQuestion();
    setInputValue("");
    setHintOverrideLevel(0);
    setFeedbackDetail("");
    setLastDiagnosis(null);
    setAwaitingAdvance(false);
    pendingAdvanceRef.current = null;
    setSnapshot(nextSnapshot);
    setStatusText(statusTextFor(nextSnapshot.uiState));
    return nextSnapshot;
  }

  async function navigateToWord(wordId) {
    const bridge = bridgeRef.current;
    if (!bridge?.navigateToWord || !ready || !wordId) return null;

    const nextSnapshot = await bridge.navigateToWord(wordId);
    setInputValue("");
    setHintOverrideLevel(0);
    setFeedbackDetail("");
    setLastDiagnosis(null);
    setAwaitingAdvance(false);
    pendingAdvanceRef.current = null;
    setSnapshot(nextSnapshot);
    setStatusText(statusTextFor(nextSnapshot.uiState));
    return nextSnapshot;
  }

  function showHint() {
    const bridge = bridgeRef.current;
    const bridgeHint = bridge?.getSpellingHint() || "";
    if (bridgeHint) return bridgeHint;
    const nextLevel = Math.min(3, Math.max(1, hintOverrideLevel + 1));
    setHintOverrideLevel(nextLevel);
    return getSpellingHint(snapshot?.currentWord, nextLevel);
  }

  const displayedHint = bridgeRef.current?.getSpellingHint() ||
    (hintOverrideLevel ? getSpellingHint(snapshot?.currentWord, hintOverrideLevel) : "");

  const mapped = mapSnapshotToProductionHookState(snapshot, {
    inputValue,
    setInputValue,
    submit,
    skip,
    markFamiliar,
    enqueuePriorityReview,
    hint: displayedHint,
    statusText,
    feedbackDetail,
    lastDiagnosis,
    ready
  });

  const getSessionWordIds = useCallback(() => {
    const bridge = bridgeRef.current;
    if (!bridge?.getSessionWordIds || !ready) return [];
    return bridge.getSessionWordIds();
  }, [ready]);

  return {
    ...mapped,
    refresh,
    getHint: showHint,
    continueAfterCorrect,
    awaitingAdvance,
    captureCheckpoint,
    restoreCheckpoint,
    goToNextQuestion,
    navigateToWord,
    getSessionWordIds
  };
}

export {
  AUTO_SUBMIT_DEBOUNCE_MS,
  CORRECT_ADVANCE_DELAY_MS,
  TURBO_ADVANCE_DELAY_MS,
  resolveCorrectAdvanceDelay
};

export default {
  createInitialProductionSpellingState,
  mapSnapshotToProductionHookState,
  buildProductionFlashcardState,
  useSpellingEngine
};
