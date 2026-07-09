import { spawn } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

export const REAL_AUDIO_ENHANCE_VERSION = "enhance-v4";

/** Target loudness for commons / wav real-voice clips (LUFS). */
export const REAL_AUDIO_TARGET_LUFS = -14;

/** Dictionary mp3 sources are quieter; boost a bit more while keeping word endings intact. */
export const DICTIONARY_AUDIO_TARGET_LUFS = -10;

const FFMPEG_PATH = (() => {
  try {
    return require("ffmpeg-static");
  } catch {
    return "";
  }
})();

// Do not trim trailing audio: quiet word endings were being removed as "silence".
const ENHANCE_FILTER = [
  "highpass=f=80",
  "lowpass=f=12000",
  `loudnorm=I=${REAL_AUDIO_TARGET_LUFS}:TP=-1.0:LRA=11`,
  "alimiter=limit=0.98"
].join(",");

const DICTIONARY_ENHANCE_FILTER = [
  `loudnorm=I=${DICTIONARY_AUDIO_TARGET_LUFS}:TP=-0.5:LRA=11`,
  "alimiter=limit=0.99"
].join(",");

export function resolveEnhanceFilter(entry = {}, source = "") {
  const entrySource = String(entry?.source || source || "");
  if (entrySource === "real-dictionary") {
    return DICTIONARY_ENHANCE_FILTER;
  }
  return ENHANCE_FILTER;
}

export function resolveEnhanceBitrate(entry = {}, source = "") {
  const entrySource = String(entry?.source || source || "");
  return entrySource === "real-dictionary" ? "192k" : "128k";
}

function runFfmpeg(args, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    if (!FFMPEG_PATH || !existsSync(FFMPEG_PATH)) {
      reject(new Error("ffmpeg-static is not available"));
      return;
    }

    const child = spawn(FFMPEG_PATH, args, {
      stdio: ["ignore", "ignore", "pipe"]
    });

    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("ffmpeg enhance timeout"));
    }, timeoutMs);

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stderr);
      } else {
        reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
      }
    });
  });
}

export function isRealAudioEnhanceAvailable() {
  return Boolean(FFMPEG_PATH && existsSync(FFMPEG_PATH));
}

export function needsRealAudioEnhance(entry = {}) {
  if (!entry?.realAudio || !entry?.hasAudio || !entry?.filename) return false;
  return entry.audioEnhanceVersion !== REAL_AUDIO_ENHANCE_VERSION;
}

export function needsEdgeAudioEnhance(entry = {}) {
  if (!entry?.hasAudio || !entry?.filename || entry?.realAudio) return false;
  return entry.audioEnhanceVersion !== REAL_AUDIO_ENHANCE_VERSION;
}

export function needsSpeechAudioEnhance(entry = {}) {
  return needsRealAudioEnhance(entry) || needsEdgeAudioEnhance(entry);
}

/**
 * Normalize quiet / noisy real-voice clips to a consistent mp3 loudness profile.
 * Falls back to the original buffer when ffmpeg is unavailable or processing fails.
 */
export async function enhanceRealAudioBuffer(buffer, extension = "mp3", options = {}) {
  if (!buffer?.length) return null;
  if (!isRealAudioEnhanceAvailable()) {
    return {
      buffer,
      extension,
      contentType: extension === "mp3" ? "audio/mpeg" : `audio/${extension}`,
      enhanced: false
    };
  }

  const inputExt = String(extension || "mp3").replace(/^\./, "") || "mp3";
  const tempDir = mkdtempSync(path.join(tmpdir(), "real-audio-enhance-"));
  const inputPath = path.join(tempDir, `input.${inputExt}`);
  const outputPath = path.join(tempDir, "output.mp3");

  try {
    writeFileSync(inputPath, buffer);

    await runFfmpeg([
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
      "-af",
      options.filter || ENHANCE_FILTER,
      "-ar",
      "44100",
      "-ac",
      "1",
      "-c:a",
      "libmp3lame",
      "-b:a",
      options.bitrate || "128k",
      outputPath
    ], options.timeoutMs || 20000);

    if (!existsSync(outputPath)) {
      throw new Error("ffmpeg did not produce output");
    }

    const enhanced = readFileSync(outputPath);
    if (!enhanced.length) {
      throw new Error("enhanced audio is empty");
    }

    return {
      buffer: enhanced,
      extension: "mp3",
      contentType: "audio/mpeg",
      enhanced: true
    };
  } catch {
    return {
      buffer,
      extension: inputExt,
      contentType: inputExt === "mp3" ? "audio/mpeg" : `audio/${inputExt}`,
      enhanced: false
    };
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

export async function enhanceRealAudioFile(filepath, options = {}) {
  if (!filepath || !existsSync(filepath)) return { ok: false, reason: "missing" };

  const extension = path.extname(filepath).slice(1) || "mp3";
  const original = readFileSync(filepath);
  const result = await enhanceRealAudioBuffer(original, extension, options);
  if (!result?.buffer?.length) return { ok: false, reason: "empty" };
  if (!result.enhanced) return { ok: false, reason: "skipped" };

  writeFileSync(filepath, result.buffer);
  return { ok: true, enhanced: true, contentType: result.contentType };
}