let sharedContext = null;
let masterGainNode = null;

// Match HTMLAudioElement default playback volume used by word pronunciation.
const SPEECH_MATCH_VOLUME = 1;

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
    masterGainNode.gain.value = SPEECH_MATCH_VOLUME;
    masterGainNode.connect(context.destination);
  }

  return masterGainNode;
}

function playTone({
  frequency,
  duration = 0.12,
  type = "sine",
  gain = 0.9,
  when = 0
}) {
  const context = getAudioContext();
  if (!context) return;

  if (context.state === "suspended") {
    void context.resume();
  }

  const startAt = context.currentTime + when;
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gainNode.gain.setValueAtTime(0.0001, startAt);
  gainNode.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0001), startAt + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  oscillator.connect(gainNode);
  gainNode.connect(getMasterGain(context));
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.03);
}

export function playSpellingCorrectSfx() {
  playTone({ frequency: 523.25, duration: 0.1, gain: 0.88, when: 0 });
  playTone({ frequency: 659.25, duration: 0.12, gain: 0.9, when: 0.08 });
  playTone({ frequency: 783.99, duration: 0.16, gain: 0.92, when: 0.18 });
}

export function playSpellingWrongSfx() {
  playTone({ frequency: 220, duration: 0.12, type: "triangle", gain: 0.95, when: 0 });
  playTone({ frequency: 165, duration: 0.18, type: "triangle", gain: 0.92, when: 0.1 });
}

export function playSpellingFeedbackSfx(kind = "") {
  if (kind === "correct") {
    playSpellingCorrectSfx();
    return;
  }

  if (kind === "wrong") {
    playSpellingWrongSfx();
  }
}