import { useCallback, useRef } from "react";
import {
  playSpeechAudio as playSpeechAudioUrl,
  resolveSpeechPlaybackOptions
} from "../lib/speech-audio-playback.mjs";
import {
  fetchSpeechAudioResult,
  SPEECH_WARM_OPTIONS
} from "../lib/vocab-speech.mjs";
import {
  formatSpeechSourceLabel,
  isSimpleDictionaryWord,
  normalizeWord
} from "../lib/vocab/page-word-helpers.mjs";

function isAudioInterruptedError(error) {
  const message = String(error?.message || error || "").toLowerCase();

  return (
    error?.name === "AbortError" ||
    message.includes("play() request was interrupted") ||
    message.includes("the play request was interrupted") ||
    message.includes("interrupted by a call to pause")
  );
}

/**
 * Home page word/example speech playback (extracted from app/page.jsx I3.3).
 */
export function useHomeWordSpeech({
  item,
  setToast,
  patchAudioStatusKey
}) {
  const audioRef = useRef(null);
  const audioPlayTokenRef = useRef(0);
  const recentSpeechRef = useRef({ key: "", at: 0 });

  const browserSpeakFallback = useCallback((text, label = "音频") => {
    const value = String(text || "").trim();

    if (!value || !("speechSynthesis" in window)) {
      setToast?.("没有可播放音频");
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(value);
      utterance.lang = "en-US";
      utterance.rate = 0.88;
      utterance.pitch = 1;
      utterance.onstart = () => setToast?.(`浏览器兜底发音：${label}`);
      utterance.onerror = () => setToast?.("浏览器兜底发音失败");
      window.speechSynthesis.speak(utterance);
    } catch {
      setToast?.("浏览器兜底发音失败");
    }
  }, [setToast]);

  const playAudioUrl = useCallback(async (url, options = {}) => {
    if (!url) return false;

    const playToken = audioPlayTokenRef.current + 1;
    audioPlayTokenRef.current = playToken;

    try {
      const result = await playSpeechAudioUrl(url, {
        ...options,
        playToken,
        isCurrent: (token) => audioPlayTokenRef.current === token
      });
      audioRef.current = result.audio || null;
      return Boolean(result.played) && audioPlayTokenRef.current === playToken;
    } catch (error) {
      if (isAudioInterruptedError(error)) {
        return false;
      }
      throw error;
    }
  }, []);

  const getSpeechAudioResult = useCallback(async (text, kind) => {
    const cleanText = String(text || "").trim();

    if (!cleanText) {
      return { url: "", source: "empty", realAudio: false };
    }

    return fetchSpeechAudioResult(cleanText, kind);
  }, []);

  const warmSpeechAudio = useCallback(async (text, kind = "word") => {
    const cleanText = String(text || "").trim();

    if (!cleanText || cleanText === "完成") return;

    try {
      const result = await fetchSpeechAudioResult(cleanText, kind, SPEECH_WARM_OPTIONS);

      if (kind === "sentence") return;

      const key = normalizeWord(cleanText);
      patchAudioStatusKey?.(key, {
        checked: true,
        hasAudio: true,
        source: result.source || "speech-cache",
        provider: result.provider || "",
        realAudio: Boolean(result.realAudio),
        updatedAt: Date.now()
      });
    } catch {
      // 后台预加载失败不弹窗，避免打断学习。
    }
  }, [patchAudioStatusKey]);

  const shouldIgnoreDuplicateSpeech = useCallback((cleanText, kind) => {
    const key = `${kind}:${cleanText}`;
    const now = Date.now();
    const last = recentSpeechRef.current;

    if (last.key === key && now - last.at < 350) return true;

    recentSpeechRef.current = { key, at: now };
    return false;
  }, []);

  const playSpeechAudio = useCallback(async (text, kind = "word") => {
    const cleanText = String(text || "").trim();

    if (!cleanText) {
      setToast?.(kind === "sentence" ? "没有例句可发音" : "没有单词可发音");
      return { played: false, result: { source: "empty", realAudio: false } };
    }

    if (shouldIgnoreDuplicateSpeech(cleanText, kind)) {
      return { played: false, result: { source: "duplicate", realAudio: false } };
    }

    const result = await getSpeechAudioResult(cleanText, kind);
    const played = await playAudioUrl(result.url, resolveSpeechPlaybackOptions(result, kind));
    return { played, result };
  }, [getSpeechAudioResult, playAudioUrl, setToast, shouldIgnoreDuplicateSpeech]);

  const speakWord = useCallback(async (showToast = true) => {
    try {
      const text = String(item?.word || "").trim();
      const key = normalizeWord(text);

      if (!text) {
        if (showToast) setToast?.("没有单词可发音");
        return;
      }

      const kind = isSimpleDictionaryWord(text) ? "word" : "phrase";
      const { played, result } = await playSpeechAudio(text, kind);

      patchAudioStatusKey?.(key, {
        checked: true,
        hasAudio: true,
        source: result.source || "speech-cache",
        provider: result.provider || "",
        realAudio: Boolean(result.realAudio),
        updatedAt: Date.now()
      });

      if (played && showToast) setToast?.(`播放 ${formatSpeechSourceLabel(result)}`);
    } catch (error) {
      if (!isAudioInterruptedError(error)) {
        browserSpeakFallback(item?.word, "单词");
      }
    }
  }, [browserSpeakFallback, item?.word, patchAudioStatusKey, playSpeechAudio, setToast]);

  const speakExample = useCallback(async () => {
    try {
      const { played, result } = await playSpeechAudio(item?.example, "sentence");
      if (played) setToast?.(`播放例句 ${formatSpeechSourceLabel(result)}`);
    } catch (error) {
      if (!isAudioInterruptedError(error)) {
        browserSpeakFallback(item?.example, "例句");
      }
    }
  }, [browserSpeakFallback, item?.example, playSpeechAudio, setToast]);

  const speakSmallText = useCallback(async (text, label = "搭配") => {
    try {
      const { played, result } = await playSpeechAudio(text, "phrase");
      if (played) setToast?.(`播放${label} ${formatSpeechSourceLabel(result)}`);
    } catch (error) {
      if (!isAudioInterruptedError(error)) {
        browserSpeakFallback(text, label);
      }
    }
  }, [browserSpeakFallback, playSpeechAudio, setToast]);

  return {
    audioRef,
    speakWord,
    speakExample,
    speakSmallText,
    warmSpeechAudio,
    playSpeechAudio,
    getSpeechAudioResult
  };
}
