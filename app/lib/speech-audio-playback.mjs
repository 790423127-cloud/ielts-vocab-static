import { isAudioInterruptedError } from "./vocab-speech.mjs";

/** Edge TTS clips are roughly 7dB quieter than normalized real-voice audio. */
export const EDGE_SENTENCE_PLAYBACK_GAIN = 2.25;
export const EDGE_WORD_PLAYBACK_GAIN = 2.1;
export const REAL_AUDIO_PLAYBACK_GAIN = 1.3;
export const NORMALIZED_PLAYBACK_GAIN = 1;

let sharedContext = null;
let masterGainNode = null;
let activeHtmlAudio = null;
let activeWebAudioSource = null;

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

export function resolveSpeechPlaybackOptions(result = {}, kind = "word") {
  const audioEnhanced = Boolean(result.audioEnhanced);
  const realAudio = Boolean(result.realAudio);
  const source = String(result.source || "");

  if (audioEnhanced || realAudio) {
    return {
      kind,
      source,
      realAudio,
      audioEnhanced: audioEnhanced || realAudio,
      gain: REAL_AUDIO_PLAYBACK_GAIN
    };
  }

  return {
    kind,
    source,
    realAudio: false,
    audioEnhanced: false,
    gain: kind === "sentence" ? EDGE_SENTENCE_PLAYBACK_GAIN : EDGE_WORD_PLAYBACK_GAIN
  };
}

export function resolvePlaybackGain(options = {}) {
  const gain = Number(options.gain);
  if (Number.isFinite(gain) && gain > 0) {
    return Math.min(3, Math.max(0.5, gain));
  }

  if (options.audioEnhanced || options.realAudio) {
    return REAL_AUDIO_PLAYBACK_GAIN;
  }

  if (options.kind === "sentence") {
    return EDGE_SENTENCE_PLAYBACK_GAIN;
  }

  return EDGE_WORD_PLAYBACK_GAIN;
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

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return false;

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));

  const source = context.createBufferSource();
  source.buffer = audioBuffer;

  const gainNode = context.createGain();
  gainNode.gain.value = resolvePlaybackGain(options);

  source.connect(gainNode);
  gainNode.connect(getMasterGain(context));
  activeWebAudioSource = source;

  return await new Promise((resolve) => {
    let settled = false;
    const finish = (played) => {
      if (settled) return;
      settled = true;
      if (activeWebAudioSource === source) {
        activeWebAudioSource = null;
      }
      resolve(played);
    };

    source.onended = () => finish(true);
    try {
      source.start(0);
    } catch {
      finish(false);
    }
  });
}

async function playWithHtmlAudio(url, options = {}) {
  const bustUrl = url.includes("?") ? `${url}&_ts=${Date.now()}` : `${url}?_ts=${Date.now()}`;
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