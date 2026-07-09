// Expressions Mode — independent audio module.
// Uses browser SpeechSynthesis only. Never touches Meaning Mode audio.
// Prefers en-GB voice, falls back to any English voice.
// Fully guards against Node.js environment (no speechSynthesis).

const hasSpeech = typeof speechSynthesis !== "undefined" && typeof SpeechSynthesisUtterance !== "undefined";

let activeUtterance = null;

function getEnglishVoice() {
  if (!hasSpeech) return null;
  const voices = speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  const gb = voices.find(v => v.lang.startsWith("en-GB"));
  if (gb) return gb;

  const en = voices.find(v => v.lang.startsWith("en-"));
  if (en) return en;

  return null;
}

export function speakPhrase(phrase) {
  if (!phrase || !hasSpeech) return;
  stopAudio();

  const utterance = new SpeechSynthesisUtterance(phrase);
  const voice = getEnglishVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = 0.88;
  utterance.pitch = 1.0;
  utterance.lang = "en-GB";

  activeUtterance = utterance;
  speechSynthesis.speak(utterance);
}

export function speakExample(exampleText) {
  if (!exampleText || !hasSpeech) return;
  stopAudio();

  const utterance = new SpeechSynthesisUtterance(exampleText);
  const voice = getEnglishVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = 0.85;
  utterance.pitch = 1.0;
  utterance.lang = "en-GB";

  activeUtterance = utterance;
  speechSynthesis.speak(utterance);
}

export function stopAudio() {
  if (hasSpeech) {
    speechSynthesis.cancel();
  }
  activeUtterance = null;
}

export function isSpeaking() {
  if (!hasSpeech) return false;
  return speechSynthesis.speaking;
}
