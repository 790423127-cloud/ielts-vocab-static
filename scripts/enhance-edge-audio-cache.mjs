import {
  REAL_AUDIO_ENHANCE_VERSION,
  isRealAudioEnhanceAvailable,
  needsEdgeAudioEnhance
} from "../app/lib/real-audio-enhance.mjs";
import {
  audioIndexPath,
  ensureEnhancedEdgeAudioFile,
  readJson,
  writeJson
} from "../app/lib/vocab-audio-source.mjs";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const limit = Number([...args].find((arg) => arg.startsWith("--limit="))?.split("=")[1] || 0) || Infinity;

if (!isRealAudioEnhanceAvailable()) {
  console.error("ffmpeg-static is not available; cannot enhance edge audio cache.");
  process.exit(1);
}

const indexFile = audioIndexPath();
const index = readJson(indexFile, {});
const pending = Object.entries(index).filter(([, entry]) => needsEdgeAudioEnhance(entry));

console.log(`Edge audio enhance version: ${REAL_AUDIO_ENHANCE_VERSION}`);
console.log(`Pending edge entries: ${pending.length}${dryRun ? " (dry-run)" : ""}`);

let enhanced = 0;
let skipped = 0;
let failed = 0;

for (const [key, entry] of pending.slice(0, limit)) {
  if (dryRun) {
    console.log(`[dry-run] ${key} -> ${entry.filename}`);
    continue;
  }

  const result = await ensureEnhancedEdgeAudioFile(entry);
  if (result.ok && result.enhanced) {
    index[key] = {
      ...entry,
      audioEnhanceVersion: REAL_AUDIO_ENHANCE_VERSION,
      contentType: result.contentType || entry.contentType || "audio/mpeg",
      updatedAt: Date.now()
    };
    enhanced += 1;
    if (enhanced % 200 === 0) {
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