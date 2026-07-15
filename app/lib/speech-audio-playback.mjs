import { isAudioInterruptedError } from "./vocab-speech.mjs";

/**
 * Single Edge-only playback gain for words, phrases, and example sentences.
 * Real-person audio path is disabled product-wide.
 */
// Cached Edge clips are already loudness-normalized and peak near -1 dBFS.
// A gain above 1 clips those samples at the device output and exaggerates MP3 tail noise.
export const EDGE_PLAYBACK_GAIN = 1;
export const PLAYBACK_END_FADE_SECONDS = 0.04;
export const PLAYBACK_INTERRUPT_FADE_SECONDS = 0.012;
export const SPEECH_ACTIVITY_RMS_DB = -65;
export const SPEECH_ANALYSIS_WINDOW_SECONDS = 0.01;
export const SPEECH_TAIL_PADDING_SECONDS = 0.12;
export const SPEECH_TAIL_MIN_TRIM_SECONDS = 0.18;
/** @deprecated use EDGE_PLAYBACK_GAIN — kept for tests/imports */
export const EDGE_SENTENCE_PLAYBACK_GAIN = EDGE_PLAYBACK_GAIN;
/** @deprecated use EDGE_PLAYBACK_GAIN — kept for tests/imports */
export const EDGE_WORD_PLAYBACK_GAIN = EDGE_PLAYBACK_GAIN;
/** @deprecated real audio disabled */
export const REAL_AUDIO_PLAYBACK_GAIN = EDGE_PLAYBACK_GAIN;
export const NORMALIZED_PLAYBACK_GAIN = 1;

let sharedContext = null;
let masterGainNode = null;
let activeHtmlAudio = null;
let activeWebAudioPlayback = null;
const decodedAudioBufferCache = new Map();
const MAX_DECODED_AUDIO_BUFFERS = 80;

function getAudioContext() {
  if (typeof window === "undefined") return null;

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;

  if (!sharedContext) {
    sharedContext = new AudioContextCtor();
  }

  return sharedContext;
}

function getMasterGain(context) {
  if (!masterGainNode || masterGainNode.context !== context) {
    masterGainNode = context.createGain();
    masterGainNode.gain.value = 1;
    masterGainNode.connect(context.destination);
  }

  return masterGainNode;
}

export function primeSpeechAudioPlayback() {
  const context = getAudioContext();
  if (context?.state === "suspended") {
    void context.resume().catch(() => {});
  }
  return Boolean(context);
}

function installSpeechPlaybackPrimer() {
  if (typeof window === "undefined" || window.__ieltsSpeechPlaybackPrimer) return;
  window.__ieltsSpeechPlaybackPrimer = true;
  const prime = () => {
    primeSpeechAudioPlayback();
    window.removeEventListener("pointerdown", prime);
    window.removeEventListener("keydown", prime);
  };
  window.addEventListener("pointerdown", prime, { passive: true });
  window.addEventListener("keydown", prime, { passive: true });
}

installSpeechPlaybackPrimer();

export function resolveSpeechPlaybackOptions(result = {}, kind = "word") {
  const source = String(result.source || "edge-cache");
  return {
    kind,
    source,
    realAudio: false,
    audioEnhanced: Boolean(result.audioEnhanced),
    gain: EDGE_PLAYBACK_GAIN
  };
}

export function resolvePlaybackGain(options = {}) {
  const gain = Number(options.gain);
  if (Number.isFinite(gain) && gain > 0) {
    return Math.min(3, Math.max(0.5, gain));
  }
  return EDGE_PLAYBACK_GAIN;
}

export function resolveCleanPlaybackWindow(audioBuffer) {
  const duration = Number(audioBuffer?.duration) || 0;
  const sampleRate = Number(audioBuffer?.sampleRate) || 0;
  const length = Number(audioBuffer?.length) || 0;
  const channelCount = Number(audioBuffer?.numberOfChannels) || 0;
  const fullWindow = {
    endTime: duration,
    fadeStartTime: Math.max(0, duration - PLAYBACK_END_FADE_SECONDS),
    trimmed: false
  };

  if (!duration || !sampleRate || !length || !channelCount || typeof audioBuffer.getChannelData !== "function") {
    return fullWindow;
  }

  const channels = [];
  for (let channel = 0; channel < channelCount; channel += 1) {
    channels.push(audioBuffer.getChannelData(channel));
  }

  const windowSize = Math.max(1, Math.round(sampleRate * SPEECH_ANALYSIS_WINDOW_SECONDS));
  const windowCount = Math.ceil(length / windowSize);
  const activityPowerThreshold = 10 ** (SPEECH_ACTIVITY_RMS_DB / 10);
  const activeWindows = new Array(windowCount).fill(false);

  for (let windowIndex = 0; windowIndex < windowCount; windowIndex += 1) {
    const start = windowIndex * windowSize;
    const end = Math.min(length, start + windowSize);
    let sumSquares = 0;
    for (const samples of channels) {
      for (let index = start; index < end; index += 1) {
        const sample = samples[index] || 0;
        sumSquares += sample * sample;
      }
    }
    const sampleCount = Math.max(1, (end - start) * channelCount);
    activeWindows[windowIndex] = sumSquares / sampleCount >= activityPowerThreshold;
  }

  let lastSustainedWindow = -1;
  for (let index = 0; index < activeWindows.length; index += 1) {
    if (activeWindows[index] && (activeWindows[index - 1] || activeWindows[index + 1])) {
      lastSustainedWindow = index;
    }
  }
  if (lastSustainedWindow < 0) return fullWindow;

  const meaningfulEndTime = Math.min(duration, ((lastSustainedWindow + 1) * windowSize) / sampleRate);
  const endTime = Math.min(duration, meaningfulEndTime + SPEECH_TAIL_PADDING_SECONDS);
  if (duration - endTime < SPEECH_TAIL_MIN_TRIM_SECONDS) return fullWindow;

  return {
    endTime,
    fadeStartTime: Math.min(endTime - PLAYBACK_END_FADE_SECONDS, meaningfulEndTime + 0.02),
    trimmed: true
  };
}

export function stopSpeechAudioPlayback() {
  if (activeHtmlAudio) {
    try {
      activeHtmlAudio.pause();
    } catch {}
    try {
      activeHtmlAudio.currentTime = 0;
    } catch {}
    activeHtmlAudio = null;
  }

  if (activeWebAudioPlayback) {
    const playback = activeWebAudioPlayback;
    activeWebAudioPlayback = null;
    try {
      const now = playback.gainNode.context.currentTime;
      const currentGain = Math.max(0, playback.gainNode.gain.value);
      playback.gainNode.gain.cancelScheduledValues(now);
      playback.gainNode.gain.setValueAtTime(currentGain, now);
      playback.gainNode.gain.linearRampToValueAtTime(0, now + PLAYBACK_INTERRUPT_FADE_SECONDS);
      playback.source.stop(now + PLAYBACK_INTERRUPT_FADE_SECONDS);
    } catch {}
  }
}

async function playWithWebAudio(url, options = {}) {
  const context = getAudioContext();
  if (!context) return false;

  if (context.state === "suspended") {
    try {
      await context.resume();
    } catch {}
  }

  let audioBuffer = decodedAudioBufferCache.get(url);
  if (!audioBuffer) {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) return false;
    const arrayBuffer = await response.arrayBuffer();
    audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
    decodedAudioBufferCache.set(url, audioBuffer);
    if (decodedAudioBufferCache.size > MAX_DECODED_AUDIO_BUFFERS) {
      decodedAudioBufferCache.delete(decodedAudioBufferCache.keys().next().value);
    }
  }

  const source = context.createBufferSource();
  source.buffer = audioBuffer;

  const gainNode = context.createGain();
  const gain = resolvePlaybackGain(options);
  const playbackWindow = resolveCleanPlaybackWindow(audioBuffer);
  const startedAt = context.currentTime;
  const endsAt = startedAt + playbackWindow.endTime;
  const fadeStartsAt = startedAt + playbackWindow.fadeStartTime;
  gainNode.gain.setValueAtTime(gain, startedAt);
  gainNode.gain.setValueAtTime(gain, fadeStartsAt);
  gainNode.gain.linearRampToValueAtTime(0, endsAt);

  source.connect(gainNode);
  gainNode.connect(getMasterGain(context));
  const playback = { source, gainNode };
  activeWebAudioPlayback = playback;

  source.onended = () => {
    if (activeWebAudioPlayback === playback) activeWebAudioPlayback = null;
    try {
      source.disconnect();
      gainNode.disconnect();
    } catch {}
  };
  try {
    source.start(startedAt);
    source.stop(endsAt);
    return true;
  } catch {
    if (activeWebAudioPlayback === playback) activeWebAudioPlayback = null;
    return false;
  }
}

async function playWithHtmlAudio(url, options = {}) {
  const bustUrl = url.startsWith("blob:")
    ? url
    : url.includes("?")
      ? `${url}&_ts=${Date.now()}`
      : `${url}?_ts=${Date.now()}`;
  const audio = new Audio(bustUrl);
  audio.volume = Math.min(1, resolvePlaybackGain(options) / EDGE_SENTENCE_PLAYBACK_GAIN);
  activeHtmlAudio = audio;
  await audio.play();
  return audio;
}

/**
 * Play cached speech audio with loudness compensation so words and sentences feel consistent.
 */
export async function playSpeechAudio(url, options = {}) {
  if (!url) return { played: false, audio: null };

  const isCurrent = () => !options.isCurrent || options.isCurrent(Number(options.playToken) || 0);

  try {
    stopSpeechAudioPlayback();

    if (getAudioContext()) {
      const played = await playWithWebAudio(url, options);
      if (!isCurrent()) {
        stopSpeechAudioPlayback();
        return { played: false, audio: null, interrupted: true };
      }
      if (played) {
        return { played: true, audio: null, engine: "webaudio" };
      }
    }

    const audio = await playWithHtmlAudio(url, options);
    if (!isCurrent()) {
      stopSpeechAudioPlayback();
      return { played: false, audio: null, interrupted: true };
    }
    return { played: true, audio, engine: "htmlaudio" };
  } catch (error) {
    if (isAudioInterruptedError(error)) {
      return { played: false, audio: null, interrupted: true };
    }
    throw error;
  }
}
