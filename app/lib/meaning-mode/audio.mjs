// Meaning Mode audio — browser SpeechSynthesis wrapper.
// Fully independent; no API routes, no shared players, no Edge TTS.

let currentUtterance = null;
let selectedVoice = null;
let voicesLoaded = false;

/**
 * Initialize voice selection. Called once on first user interaction.
 */
function ensureVoices() {
  if (!voicesLoaded && typeof window !== "undefined" && window.speechSynthesis) {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      // Prefer en-GB, fallback to any English
      selectedVoice = voices.find(v => v.lang.startsWith("en-GB"))
        || voices.find(v => v.lang.startsWith("en-"))
        || voices[0];
      voicesLoaded = true;
    }
  }
}

/**
 * Speak an English word or sentence.
 * Always cancels any currently playing audio first.
 *
 * @param {string} text - English text to speak
 * @param {object} options - { rate?: number, pitch?: number }
 * @returns {boolean} - true if speech was initiated
 */
export function speak(text, options = {}) {
  if (typeof window === "undefined") return false;
  if (!window.speechSynthesis) return false;
  if (!text || typeof text !== "string" || !text.trim()) return false;

  // Cancel any current playback
  stop();

  ensureVoices();

  const utterance = new SpeechSynthesisUtterance(text.trim());
  utterance.voice = selectedVoice;
  utterance.rate = options.rate || 0.9;
  utterance.pitch = options.pitch || 1.0;
  utterance.lang = selectedVoice ? selectedVoice.lang : "en-GB";

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);

  return true;
}

/**
 * Speak an English word (shorthand).
 */
export function speakWord(word) {
  return speak(word, { rate: 0.85 });
}

/**
 * Speak an example sentence (shorthand).
 */
export function speakExample(sentence) {
  return speak(sentence, { rate: 0.9 });
}

/**
 * Stop any currently playing audio.
 */
export function stop() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  currentUtterance = null;
}

/**
 * Check if audio is currently playing.
 */
export function isSpeaking() {
  if (typeof window === "undefined") return false;
  return window.speechSynthesis && window.speechSynthesis.speaking;
}

/**
 * Get the selected voice info for debug.
 */
export function getVoiceInfo() {
  ensureVoices();
  return {
    available: !!selectedVoice,
    name: selectedVoice ? selectedVoice.name : null,
    lang: selectedVoice ? selectedVoice.lang : null,
    engine: "speech-synthesis"
  };
}