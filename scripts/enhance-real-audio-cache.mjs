import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  REAL_AUDIO_ENHANCE_VERSION,
  isRealAudioEnhanceAvailable,
  needsRealAudioEnhance
} from "../app/lib/real-audio-enhance.mjs";
import {
  audioIndexPath,
  cacheDir,
  ensureEnhancedRealAudioFile,
  readJson,
  writeJson
} from "../app/lib/vocab-audio-source.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const limit = Number([...args].find((arg) => arg.startsWith("--limit="))?.split("=")[1] || 0) || Infinity;

if (!isRealAudioEnhanceAvailable()) {
  console.error("ffmpeg-static is not available; cannot enhance real audio cache.");
  process.exit(1);
}

const indexFile = audioIndexPath();
const index = readJson(indexFile, {});
const pending = Object.entries(index).filter(([, entry]) => needsRealAudioEnhance(entry));

console.log(`Real audio enhance version: ${REAL_AUDIO_ENHANCE_VERSION}`);
console.log(`Pending entries: ${pending.length}${dryRun ? " (dry-run)" : ""}`);
console.log("Truncated v1 clips are re-downloaded from remoteAudioUrl when available.");

let enhanced = 0;
let skipped = 0;
let failed = 0;

for (const [key, entry] of pending.slice(0, limit)) {
  if (dryRun) {
    console.log(`[dry-run] ${key} -> ${entry.filename}`);
    continue;
  }

  const result = await ensureEnhancedRealAudioFile(entry);
  if (result.ok && result.enhanced) {
    index[key] = {
      ...entry,
      audioEnhanceVersion: REAL_AUDIO_ENHANCE_VERSION,
      contentType: result.contentType || entry.contentType || "audio/mpeg",
      updatedAt: Date.now()
    };
    if (result.extension === "mp3" && !String(entry.filename || "").endsWith(".mp3")) {
      const nextFilename = String(entry.filename).replace(/\.[^.]+$/, ".mp3");
      const oldPath = path.join(cacheDir(), entry.filename);
      const nextPath = path.join(cacheDir(), nextFilename);
      if (fs.existsSync(oldPath) && oldPath !== nextPath) {
        fs.renameSync(oldPath, nextPath);
        index[key].filename = nextFilename;
      }
    }
    enhanced += 1;
    if (enhanced % 100 === 0) {
      writeJson(indexFile, index);
      console.log(`... enhanced ${enhanced}`);
    }
    continue;
  }

  if (result.skipped) {
    skipped += 1;
    continue;
  }

  failed += 1;
  console.warn(`[failed] ${key}: ${result.reason || "unknown"}`);
}

if (!dryRun) {
  writeJson(indexFile, index);
}

console.log(JSON.stringify({ enhanced, skipped, failed, pending: pending.length }, null, 2));