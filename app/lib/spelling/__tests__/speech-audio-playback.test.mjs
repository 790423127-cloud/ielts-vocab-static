import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EDGE_SENTENCE_PLAYBACK_GAIN,
  REAL_AUDIO_PLAYBACK_GAIN,
  playSpeechAudio,
  resolveSpeechPlaybackOptions,
  stopSpeechAudioPlayback
} from "../../speech-audio-playback.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("speech playback module balances normalized and edge clip loudness", () => {
  assert.equal(resolveSpeechPlaybackOptions({ realAudio: true, audioEnhanced: true }, "word").gain, REAL_AUDIO_PLAYBACK_GAIN);
  assert.equal(resolveSpeechPlaybackOptions({ source: "edge-generated" }, "sentence").gain, EDGE_SENTENCE_PLAYBACK_GAIN);
  assert.ok(EDGE_SENTENCE_PLAYBACK_GAIN > REAL_AUDIO_PLAYBACK_GAIN);
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