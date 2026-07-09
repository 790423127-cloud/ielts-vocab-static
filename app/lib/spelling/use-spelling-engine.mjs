import { startTransition, useEffect, useMemo, useRef, useState } from "react";

import { createSpellingUiBridge } from "./ui-bridge.mjs";
import { getWordId } from "./word-id.mjs";

export function createInitialSpellingHookState() {
  return {
    uiState: "idle",
    currentQuestion: null,
    input: "",
    hint: "",
    hintLevel: 0,
    message: "拼写训练准备中",
    progress: null,
    debug: null,
    ready: false
  };
}

function messageForUiState(uiState) {
  switch (uiState) {
    case "show_question":
      return "请输入这个词的英文拼写";
    case "inputting":
      return "正在判定拼写";
    case "correct_feedback":
      return "拼写正确";
    case "wrong_feedback":
      return "拼写错误，请重新输入";
    case "in_repair":
      return "请继续拼写当前内容";
    case "waiting_second":
      return "请继续完成当前范围";
    case "done_today":
      return "今日拼写已完成";
    default:
      return "拼写训练准备中";
  }
}

export function mapBridgeSnapshotToHookState(snapshot, options = {}) {
  const uiState = snapshot?.uiState || "idle";

  return {
    uiState,
    currentQuestion: snapshot?.currentWord || null,
    input: options.input ?? "",
    hint: options.hint ?? "",
    hintLevel: Number(snapshot?.hintLevel || 0),
    message: options.message || messageForUiState(uiState),
    progress: snapshot?.sessionProgress || null,
    debug: snapshot?.debug || null,
    ready: options.ready === true
  };
}

export function buildFlashcardStateFromWords(words = []) {
  const statuses = {};

  for (const word of Array.isArray(words) ? words : []) {
    const wordId = getWordId(word);
    if (wordId && word?.status) statuses[wordId] = word.status;
  }

  return { statuses };
}

export function useSpellingEngine(words = [], options = {}) {
  const bridgeRef = useRef(null);
  const [state, setState] = useState(() => createInitialSpellingHookState());
  const flashcardState = useMemo(() => buildFlashcardStateFromWords(words), [words]);

  useEffect(() => {
    let cancelled = false;
    const bridge = createSpellingUiBridge({
      words,
      flashcardState,
      debugMode: options.debugMode,
      candidateOptions: options.candidateOptions
    });

    bridgeRef.current = bridge;
    bridge.init()
      .then((snapshot) => {
        if (cancelled) return;
        startTransition(() => {
          setState(mapBridgeSnapshotToHookState(snapshot, {
            hint: bridge.getSpellingHint(),
            ready: true
          }));
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          uiState: "idle",
          message: `拼写训练初始化失败：${error?.message || error}`,
          ready: false
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [words, flashcardState, options.debugMode, options.candidateOptions]);

  function refresh(overrides = {}) {
    const bridge = bridgeRef.current;
    if (!bridge) return null;
    const snapshot = bridge.getCurrentQuestion(overrides);
    const mapped = mapBridgeSnapshotToHookState(snapshot, {
      hint: bridge.getSpellingHint(),
      ready: true
    });
    setState(mapped);
    return mapped;
  }

  async function submitAnswer(input) {
    const bridge = bridgeRef.current;
    if (!bridge || !state.ready) return null;

    setState((prev) => ({
      ...prev,
      uiState: "inputting",
      input,
      message: messageForUiState("inputting")
    }));

    const snapshot = await bridge.submitAnswer(input);
    const mapped = mapBridgeSnapshotToHookState(snapshot, {
      hint: bridge.getSpellingHint(),
      ready: true
    });
    setState(mapped);
    return mapped;
  }

  function getHint() {
    const bridge = bridgeRef.current;
    if (!bridge) return "";
    const hint = bridge.getSpellingHint();
    setState((prev) => ({ ...prev, hint }));
    return hint;
  }

  return {
    ...state,
    refresh,
    submitAnswer,
    getHint,
    getProgress: () => bridgeRef.current?.getProgress() || state.progress,
    getTodayStats: () => bridgeRef.current?.getTodayStats() || state.progress,
    getHintLevel: () => bridgeRef.current?.getHintLevel() || state.hintLevel,
    getSpellingHint: () => bridgeRef.current?.getSpellingHint() || state.hint
  };
}
