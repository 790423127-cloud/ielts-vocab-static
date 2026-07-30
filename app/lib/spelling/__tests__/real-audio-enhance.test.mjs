import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { spawn } from "node:child_process";
import { createRequire } from "node:module";

import {
  EDGE_AUDIO_ENHANCE_VERSION,
  REAL_AUDIO_ENHANCE_VERSION,
  enhanceRealAudioBuffer,
  isRealAudioEnhanceAvailable,
  needsEdgeAudioEnhance,
  needsRealAudioEnhance,
  resolveEdgeEnhanceFilter
} from "../../real-audio-enhance.mjs";

const require = createRequire(import.meta.url);
const ffmpegPath = (() => {
  try {
    return require("ffmpeg-static");
  } catch {
    return "";
  }
})();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("needsRealAudioEnhance only targets cached real-audio entries missing enhance version", () => {
  assert.equal(needsRealAudioEnhance({ realAudio: true, hasAudio: true, filename: "a.mp3" }), true);
  assert.equal(
    needsRealAudioEnhance({
      realAudio: true,
      hasAudio: true,
      filename: "a.mp3",
      audioEnhanceVersion: REAL_AUDIO_ENHANCE_VERSION
    }),
    false
  );
  assert.equal(needsRealAudioEnhance({ realAudio: false, hasAudio: true, filename: "a.mp3" }), false);
});

test("edge enhancement removes the persistent 11.76 kHz TTS tone without reprocessing real audio", () => {
  assert.notEqual(EDGE_AUDIO_ENHANCE_VERSION, REAL_AUDIO_ENHANCE_VERSION);
  assert.match(EDGE_AUDIO_ENHANCE_VERSION, /11760/);
  assert.match(resolveEdgeEnhanceFilter(), /equalizer=f=11760:t=h:w=1800:g=-60/);
  assert.equal(needsEdgeAudioEnhance({ realAudio: false, hasAudio: true, filename: "edge.mp3" }), true);
  assert.equal(
    needsEdgeAudioEnhance({
      realAudio: false,
      hasAudio: true,
      filename: "edge.mp3",
      audioEnhanceVersion: EDGE_AUDIO_ENHANCE_VERSION
    }),
    false
  );
  assert.equal(needsEdgeAudioEnhance({ realAudio: true, hasAudio: true, filename: "real.mp3" }), false);
});

test("enhanceRealAudioBuffer normalizes a cached real-audio sample when ffmpeg is available", async (t) => {
  if (!isRealAudioEnhanceAvailable()) {
    t.skip("ffmpeg-static is not available");
    return;
  }

  const samplePath = path.join(root, ".audio-cache", "real-4e2fd71be645745c3723b80265ba5d75.mp3");
  if (!fs.existsSync(samplePath)) {
    t.skip("sample real audio file is missing");
    return;
  }

  const input = fs.readFileSync(samplePath);
  const result = await enhanceRealAudioBuffer(input, "mp3");
  assert.equal(result.enhanced, true);
  assert.equal(result.extension, "mp3");
  assert.ok(result.buffer.length > 0);

  const probeDuration = (filePath) => new Promise((resolve) => {
    const child = spawn(ffmpegPath, ["-i", filePath, "-f", "null", "-"], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", () => {
      const match = stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
      resolve(match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : 0);
    });
  });

  const tempInput = path.join(root, ".audio-cache", "_enhance-test-input.mp3");
  const tempOutput = path.join(root, ".audio-cache", "_enhance-test-output.mp3");
  fs.writeFileSync(tempInput, input);
  fs.writeFileSync(tempOutput, result.buffer);

  const inputDuration = await probeDuration(tempInput);
  const outputDuration = await probeDuration(tempOutput);
  assert.ok(outputDuration >= inputDuration * 0.9, `enhanced audio was truncated (${outputDuration}s vs ${inputDuration}s)`);

  fs.rmSync(tempInput, { force: true });
  fs.rmSync(tempOutput, { force: true });
});
