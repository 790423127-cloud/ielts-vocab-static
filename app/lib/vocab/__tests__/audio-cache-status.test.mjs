import assert from "node:assert/strict";
import test from "node:test";

import { buildWordAudioStatusMap } from "../audio-cache-status.mjs";

test("buildWordAudioStatusMap returns verified word audio states only", () => {
  const index = {
    Alpha: { text: "Alpha", kind: "word", filename: "alpha.mp3", hasAudio: true },
    beta: { text: "beta", kind: "word", filename: "missing.mp3", hasAudio: true },
    gamma: { text: "gamma", kind: "word", filename: "", hasAudio: false },
    sentence: {
      text: "An example sentence.",
      kind: "sentence",
      filename: "sentence.mp3",
      hasAudio: true
    }
  };

  assert.deepEqual(
    buildWordAudioStatusMap(index, new Set(["alpha.mp3", "sentence.mp3"])),
    {
      alpha: { checked: true, hasAudio: true },
      beta: { checked: true, hasAudio: false },
      gamma: { checked: true, hasAudio: false }
    }
  );
});

test("buildWordAudioStatusMap normalizes apostrophes and whitespace", () => {
  const index = {
    legacy: {
      text: "  Teacher’s   ",
      kind: "word",
      filename: "teachers.mp3",
      hasAudio: true
    }
  };

  assert.deepEqual(buildWordAudioStatusMap(index, ["teachers.mp3"]), {
    "teacher's": { checked: true, hasAudio: true }
  });
});
