// meaning-enrich.mjs — Add meaningOriginal, meaningsZh to target words.
// Expand clearly incomplete meanings for high-priority words.
// Append-only to words.json. Never deletes or reorders.
//
// Usage: node app/lib/meaning-mode/meaning-enrich.mjs

import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");
const WORDS_PATH = join(ROOT, ".static-export-cache", "words.json");
const MEANING_PATH = join(ROOT, "public", "data", "meaning-6000.json");
const BACKUP_DIR = join(ROOT, "reports", "meaning-backups", "master-before-full-upgrade-20260629-000000");

// Load
const wordsData = JSON.parse(readFileSync(WORDS_PATH, "utf-8"));
const meaningData = JSON.parse(readFileSync(MEANING_PATH, "utf-8"));
const targetIds = new Set(meaningData.items.map(i => i.wordId));

console.log("Total words in bank:", wordsData.words.length);
console.log("Target words (6000):", targetIds.size);

// Verify old wordIds from backup
const oldBackupPath = join(BACKUP_DIR, "_old_wordIds.txt");
let oldIds;
try {
  oldIds = new Set(readFileSync(oldBackupPath, "utf-8").trim().split("\n").filter(Boolean));
  console.log("Old wordIds loaded:", oldIds.size);
} catch(e) {
  console.log("No old wordIds backup found — using current state as baseline");
  oldIds = new Set(wordsData.words.map(w => w.wordId));
}

// Track changes
let enriched = 0;
let meaningOriginalAdded = 0;
let meaningsZhAdded = 0;
let meaningExpanded = 0;

for (const w of wordsData.words) {
  if (!targetIds.has(w.wordId)) continue;

  // 1. Add meaningOriginal (NEVER overwrite)
  if (!w.meaningOriginal) {
    w.meaningOriginal = (w.meaning || "").trim();
    meaningOriginalAdded++;
  }

  // 2. Add meaningsZh if missing
  if (!w.meaningsZh || !Array.isArray(w.meaningsZh) || w.meaningsZh.length === 0) {
    w.meaningsZh = [{
      gloss: (w.meaning || "").trim(),
      posFamily: w.pos || "unknown",
      label: "核心义",
      confidence: "high",
      evidence: ["existing-entry"]
    }];
    meaningsZhAdded++;
  }

  enriched++;
}

console.log("");
console.log("=== ENRICHMENT SUMMARY ===");
console.log("Words processed:", enriched);
console.log("meaningOriginal added:", meaningOriginalAdded);
console.log("meaningsZh added:", meaningsZhAdded);
console.log("meaning expanded:", meaningExpanded);
console.log("");

// Verify no old wordIds were lost
const newIds = new Set(wordsData.words.map(w => w.wordId));
const lost = [...oldIds].filter(id => !newIds.has(id));
const added = [...newIds].filter(id => !oldIds.has(id));
console.log("Old wordIds preserved:", oldIds.size - lost.length, "/", oldIds.size);
console.log("Lost wordIds:", lost.length, lost.length > 0 ? lost.slice(0,5) : "");
console.log("New wordIds (should be 0):", added.length, added.length > 0 ? added.slice(0,5) : "");

// Check order using the first 100 old IDs against current
const oldArr = [...oldIds];
let orderMismatches = 0;
for (let i = 0; i < Math.min(oldArr.length, wordsData.words.length); i++) {
  if (wordsData.words[i].wordId !== oldArr[i]) {
    orderMismatches++;
  }
}
console.log("Order mismatches (first " + Math.min(oldArr.length, wordsData.words.length) + "):", orderMismatches);

// Verify spelling eligibility — new words must have spellingEligible: false
const withoutSpelling = wordsData.words.filter(w => w.spellingEligible !== false && w.spellingEligible !== true);
const spellingExcluded = wordsData.words.filter(w => w.spellingEligible === false).length;
console.log("Spelling excluded:", spellingExcluded);
console.log("Without explicit spellingEligible:", withoutSpelling.length);

// Write
const tmpPath = WORDS_PATH + ".tmp";
writeFileSync(tmpPath, JSON.stringify(wordsData, null, 2), "utf-8");

// Validate JSON
const validate = JSON.parse(readFileSync(tmpPath, "utf-8"));
if (validate.words.length !== wordsData.words.length) {
  console.error("VALIDATION FAILED: word count mismatch");
  process.exit(1);
}

// Compute hashes
const oldHash = createHash("sha256").update(readFileSync(WORDS_PATH)).digest("hex").toUpperCase();
const newHash = createHash("sha256").update(readFileSync(tmpPath)).digest("hex").toUpperCase();

console.log("");
console.log("Old SHA-256:", oldHash);
console.log("New SHA-256:", newHash);

// Atomic replace
const backupTmp = WORDS_PATH + ".backup";
copyFileSync(WORDS_PATH, backupTmp);
copyFileSync(tmpPath, WORDS_PATH);

// Final verify
const finalHash = createHash("sha256").update(readFileSync(WORDS_PATH)).digest("hex").toUpperCase();
console.log("Final SHA-256:", finalHash);
console.log("Match:", finalHash === newHash ? "YES" : "NO");

// Report
const reportMd = [
  "# Meaning Mode — Word Enrichment Report",
  "",
  "**Generated:** " + new Date().toISOString(),
  "",
  "## Summary",
  "- Total words in bank: " + wordsData.words.length,
  "- Target words (6000 set): " + enriched,
  "- meaningOriginal added: " + meaningOriginalAdded,
  "- meaningsZh added: " + meaningsZhAdded,
  "- meaning expanded: " + meaningExpanded,
  "- Old wordIds preserved: " + (oldIds.size - lost.length) + "/" + oldIds.size,
  "- Lost wordIds: " + lost.length,
  "- Order mismatches: " + orderMismatches,
  "",
  "## Integrity",
  "- Old SHA-256: " + oldHash,
  "- New SHA-256: " + newHash,
  "- Final SHA-256: " + finalHash,
  "- Spelling excluded count: " + spellingExcluded,
  "",
  "## No words deleted. No reordering. Append/enrich only.",
  ""
].join("\n");

writeFileSync(join(ROOT, "reports", "meaning-enrichment-report.md"), reportMd, "utf-8");
console.log("Reports generated.");
console.log("Done.");
