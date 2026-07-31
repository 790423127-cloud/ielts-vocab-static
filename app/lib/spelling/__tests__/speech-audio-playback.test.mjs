import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EDGE_PLAYBACK_GAIN,
  EDGE_SENTENCE_PLAYBACK_GAIN,
  PLAYBACK_END_FADE_SECONDS,
  PLAYBACK_INTERRUPT_FADE_SECONDS,
  REAL_AUDIO_PLAYBACK_GAIN,
  SPEECH_LOWPASS_FREQUENCY_HZ,
  SPEECH_NOISE_NOTCH_FREQUENCY_HZ,
  SPEECH_NOISE_NOTCH_Q,
  playSpeechAudio,
  resolveCleanPlaybackWindow,
  resolveSpeechPlaybackOptions,
  stopSpeechAudioPlayback
} from "../../speech-audio-playback.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("speech playback module uses one edge gain for word and sentence", () => {
  const wordGain = resolveSpeechPlaybackOptions({ source: "edge-generated" }, "word").gain;
  const sentenceGain = resolveSpeechPlaybackOptions({ source: "edge-generated" }, "sentence").gain;
  const legacyReal = resolveSpeechPlaybackOptions({ realAudio: true, audioEnhanced: true }, "word");
  assert.equal(wordGain, EDGE_SENTENCE_PLAYBACK_GAIN);
  assert.equal(sentenceGain, EDGE_SENTENCE_PLAYBACK_GAIN);
  assert.equal(legacyReal.gain, EDGE_SENTENCE_PLAYBACK_GAIN);
  assert.equal(legacyReal.realAudio, false);
  assert.equal(REAL_AUDIO_PLAYBACK_GAIN, EDGE_SENTENCE_PLAYBACK_GAIN);
  assert.ok(EDGE_PLAYBACK_GAIN <= 1.05, "normalized audio must retain clipping headroom");
  assert.ok(PLAYBACK_END_FADE_SECONDS >= 0.03);
  assert.ok(PLAYBACK_END_FADE_SECONDS <= 0.06);
  assert.ok(PLAYBACK_INTERRUPT_FADE_SECONDS > 0);
  assert.ok(PLAYBACK_INTERRUPT_FADE_SECONDS < PLAYBACK_END_FADE_SECONDS);
  assert.equal(SPEECH_NOISE_NOTCH_FREQUENCY_HZ, 11760);
  assert.ok(SPEECH_NOISE_NOTCH_Q >= 5);
  assert.ok(SPEECH_LOWPASS_FREQUENCY_HZ < SPEECH_NOISE_NOTCH_FREQUENCY_HZ);

  const playbackSource = fs.readFileSync(path.join(root, "app/lib/speech-audio-playback.mjs"), "utf8");
  assert.match(playbackSource, /linearRampToValueAtTime\(0, endsAt\)/);
  assert.match(playbackSource, /source\.stop\(endsAt\)/);
  assert.match(playbackSource, /source\.stop\(now \+ PLAYBACK_INTERRUPT_FADE_SECONDS\)/);
  assert.match(playbackSource, /source\.connect\(filters\.lowpass\)/);
  assert.match(playbackSource, /filters\.lowpass\.connect\(filters\.notch\)/);
  assert.match(playbackSource, /filters\.notch\.connect\(gainNode\)/);
});

test("speech playback removes a long MP3 tail and ignores an isolated final spike", () => {
  const sampleRate = 1000;
  const samples = new Float32Array(sampleRate * 2);
  samples.fill(0.08, 200, 900);
  samples[samples.length - 2] = 0.5;
  const window = resolveCleanPlaybackWindow({
    duration: 2,
    sampleRate,
    length: samples.length,
    numberOfChannels: 1,
    getChannelData: () => samples
  });

  assert.equal(window.trimmed, true);
  assert.ok(window.endTime >= 1.01 && window.endTime <= 1.03);
  assert.ok(window.fadeStartTime >= 0.91 && window.fadeStartTime < window.endTime);
});

test("speech playback keeps clips whose real speech reaches the end", () => {
  const sampleRate = 1000;
  const samples = new Float32Array(sampleRate);
  samples.fill(0.08, 200, 950);
  const window = resolveCleanPlaybackWindow({
    duration: 1,
    sampleRate,
    length: samples.length,
    numberOfChannels: 1,
    getChannelData: () => samples
  });

  assert.equal(window.trimmed, false);
  assert.equal(window.endTime, 1);
});

test("frontend speech callers route playback through the shared playback module", () => {
  const files = [
    "app/hooks/useHomeWordSpeech.js",
    "app/components/PhraseFlashcardPanel.jsx",
    "app/hooks/useVocabSpeech.js"
  ];

  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(source, /speech-audio-playback\.mjs/);
    assert.match(source, /resolveSpeechPlaybackOptions/);
  }

  const pageSource = fs.readFileSync(path.join(root, "app/page.jsx"), "utf8");
  assert.match(pageSource, /useHomeWordSpeech/);
});

test("playSpeechAudio returns a structured result in non-browser environments", async () => {
  const result = await playSpeechAudio("");
  assert.deepEqual(result, { played: false, audio: null });
  stopSpeechAudioPlayback();
});
