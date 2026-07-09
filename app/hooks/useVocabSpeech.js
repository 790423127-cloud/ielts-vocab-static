import { useCallback, useEffect, useRef, useState } from "react";
import {
  playSpeechAudio,
  resolveSpeechPlaybackOptions,
  stopSpeechAudioPlayback
} from "../lib/speech-audio-playback.mjs";
import {
  browserSpeak,
  fetchSpeechAudioResult,
  isAudioInterruptedError,
  isSpeechSynthesisSupported,
  preloadSpellingEntryAudio,
  resolveSpeechAudioKind,
  resolveSpeechFetchOptions,
  resolveSpellingSpeechText
} from "../lib/vocab-speech.mjs";

export function useVocabSpeech({ word = "", example = "", entry = null } = {}) {
  const speechWord = String(word || resolveSpellingSpeechText(entry) || "").trim();
  const speechExample = String(example || "").trim();
  const audioRef = useRef(null);
  const playTokenRef = useRef(0);
  const requestControllerRef = useRef(null);
  const lastRequestRef = useRef({ key: "", at: 0 });
  const [playing, setPlaying] = useState(null);

  const stopSpeech = useCallback(() => {
    playTokenRef.current += 1;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    stopSpeechAudioPlayback();

    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {}
      try {
        audioRef.current.currentTime = 0;
      } catch {}
      audioRef.current = null;
    }

    if (isSpeechSynthesisSupported()) {
      window.speechSynthesis.cancel();
    }

    setPlaying(null);
  }, []);

  useEffect(() => {
    stopSpeech();
    const controller = new AbortController();
    void preloadSpellingEntryAudio(
      entry || { expectedAnswer: speechWord, example: speechExample },
      { signal: controller.signal }
    );
    return () => controller.abort();
  }, [speechWord, speechExample, entry, stopSpeech]);

  useEffect(() => () => stopSpeech(), [stopSpeech]);

  const playAudioUrl = useCallback(async (url, options = {}) => {
    if (!url) return false;

    const playToken = playTokenRef.current + 1;
    playTokenRef.current = playToken;

    try {
      const result = await playSpeechAudio(url, {
        ...options,
        playToken,
        isCurrent: (token) => playTokenRef.current === token
      });
      audioRef.current = result.audio || null;
      return Boolean(result.played) && playTokenRef.current === playToken;
    } catch (error) {
      if (isAudioInterruptedError(error)) return false;
      throw error;
    }
  }, []);

  const speakText = useCallback(async (text, target) => {
    const cleanText = String(text || "").trim();
    if (!cleanText) return false;
    const requestKey = `${target}:${cleanText}`;
    const now = Date.now();
    if (lastRequestRef.current.key === requestKey && now - lastRequestRef.current.at < 700) {
      return false;
    }
    lastRequestRef.current = { key: requestKey, at: now };

    stopSpeech();
    const requestToken = playTokenRef.current;
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setPlaying(target);

    const clearIfCurrent = () => {
      setPlaying((current) => (current === target ? null : current));
    };

    try {
      const kind = resolveSpeechAudioKind(cleanText, target);
      const result = await fetchSpeechAudioResult(cleanText, kind, {
        ...resolveSpeechFetchOptions(kind, "play"),
        signal: controller.signal
      });
      if (controller.signal.aborted || playTokenRef.current !== requestToken) {
        return false;
      }
      const played = await playAudioUrl(result.url, resolveSpeechPlaybackOptions(result, kind));
      if (!played) {
        clearIfCurrent();
        return false;
      }

      if (audioRef.current) {
        audioRef.current.onended = clearIfCurrent;
        audioRef.current.onerror = clearIfCurrent;
      }

      return true;
    } catch (error) {
      if (!isAudioInterruptedError(error) && browserSpeak(cleanText)) {
        window.setTimeout(clearIfCurrent, Math.min(12000, cleanText.length * 120));
        return true;
      }

      clearIfCurrent();
      return false;
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
    }
  }, [playAudioUrl, stopSpeech]);

  const playWord = useCallback(() => speakText(speechWord, "word"), [speakText, speechWord]);
  const playExample = useCallback(() => speakText(speechExample, "example"), [speakText, speechExample]);

  const wordLabel = playing === "word" ? "正在播放…" : "Tab/1·单词";
  const exampleLabel = playing === "example" ? "正在播放…" : "Space·例句";

  return {
    playing,
    playWord,
    playExample,
    stopSpeech,
    wordAriaLabel: playing === "word" ? "正在播放发音" : "播放单词发音 (Tab/1)",
    exampleAriaLabel: playing === "example" ? "正在播放例句发音" : "播放例句发音 (Space)",
    wordButtonLabel: wordLabel,
    exampleButtonLabel: exampleLabel,
    canPlayWord: Boolean(speechWord),
    canPlayExample: Boolean(speechExample)
  };
}
