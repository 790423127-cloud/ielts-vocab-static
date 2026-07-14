import { isAudioInterruptedError } from "./vocab-speech.mjs";

/**
 * Single Edge-only playback gain for words, phrases, and example sentences.
 * Real-person audio path is disabled product-wide.
 */
export const EDGE_PLAYBACK_GAIN = 2.15;
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
let activeWebAudioSource = null;
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

  if (activeWebAudioSource) {
    try {
      activeWebAudioSource.stop();
    } catch {}
    activeWebAudioSource = null;
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
  gainNode.gain.value = resolvePlaybackGain(options);

  source.connect(gainNode);
  gainNode.connect(getMasterGain(context));
  activeWebAudioSource = source;

  source.onended = () => {
    if (activeWebAudioSource === source) activeWebAudioSource = null;
  };
  try {
    source.start(0);
    return true;
  } catch {
    if (activeWebAudioSource === source) activeWebAudioSource = null;
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

    const gain = resolvePlaybackGain(options);
    const preferHtmlAudio = gain <= 1.05 && !options.realAudio && !options.audioEnhanced;

    if (!preferHtmlAudio && getAudioContext()) {
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
