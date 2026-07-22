// Build Meaning Mode example index from main word bank.
// Reads: .static-export-cache/words.json, public/data/meaning-6000.json
// Outputs: app/lib/meaning-mode/example-index.generated.mjs, reports/meaning-example-*

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");
const WORDS_PATH = join(ROOT, ".static-export-cache", "words.json");
const MEANING_PATH = join(ROOT, "public", "data", "meaning-6000.json");
const OUTPUT_IDX = join(__dirname, "example-index.generated.mjs");
const REPORTS_DIR = join(ROOT, "reports");

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex").toUpperCase();
}

function normalizeWord(w) {
  return String(w || "").trim().toLowerCase().replace(/['\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
}

function isEnglishText(text) {
  if (!text || !String(text).trim()) return false;
  const s = String(text).trim();
  // Must contain at least one ASCII letter
  if (!/[a-zA-Z]/.test(s)) return false;
  // Must not be purely CJK
  const cjkCount = (s.match(/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/g) || []).length;
  if (cjkCount > s.length * 0.5) return false;
  return true;
}

// Record hashes before
const wordsHashBefore = sha256(WORDS_PATH);
const meaningHashBefore = sha256(MEANING_PATH);

// Load data
const wordsData = JSON.parse(readFileSync(WORDS_PATH, "utf-8"));
const meaningData = JSON.parse(readFileSync(MEANING_PATH, "utf-8"));

const allWords = wordsData.words;
const meaningItems = meaningData.items;

console.log("Main word bank:", allWords.length, "words");
console.log("Meaning-6000:", meaningItems.length, "words");

// Build lookup maps
const byWordId = new Map();
const byWord = new Map();

for (const w of allWords) {
  if (w.wordId) byWordId.set(w.wordId, w);
  const nw = normalizeWord(w.word);
  if (nw) {
    if (!byWord.has(nw)) byWord.set(nw, []);
    byWord.get(nw).push(w);
  }
}

// Match
const stats = { wordIdMatch: 0, wordMatch: 0, ambiguous: 0, noMatch: 0, invalidExample: 0, total: meaningItems.length };
const index = {};
const noMatchList = [];
const invalidList = [];

for (const item of meaningItems) {
  let found = null;
  let matchType = "";

  // 1. wordId exact match
  if (item.wordId && byWordId.has(item.wordId)) {
    found = byWordId.get(item.wordId);
    matchType = "wordId";
  }
  // 2. word exact match
  else if (item.word) {
    const nw = normalizeWord(item.word);
    if (byWord.has(nw)) {
      const candidates = byWord.get(nw);
      if (candidates.length === 1) {
        found = candidates[0];
        matchType = "word";
      } else {
        // Ambiguous — take first but note it
        found = candidates[0];
        matchType = "word(ambiguous)";
        stats.ambiguous++;
      }
    }
  }

  if (found) {
    const ex = found.example;
    if (isEnglishText(ex)) {
      const key = item.wordId || normalizeWord(item.word);
      index[key] = {
        sourceWordId: found.wordId,
        word: item.word,
        example: String(ex).trim(),
        exampleCn: found.exampleCn && String(found.exampleCn).trim() ? String(found.exampleCn).trim() : null,
        sourceField: "example",
        matchType
      };
      if (matchType === "wordId") stats.wordIdMatch++;
      else stats.wordMatch++;
    } else {
      stats.invalidExample++;
      invalidList.push({ wordId: item.wordId, word: item.word, example: ex, reason: "not valid English text" });
    }
  } else {
    stats.noMatch++;
    noMatchList.push({ wordId: item.wordId, word: item.word });
  }
}

const matched = Object.keys(index).length;
const coverage = (matched / meaningItems.length * 100).toFixed(1);

console.log("\n=== Results ===");
console.log("wordId exact matches:", stats.wordIdMatch);
console.log("word text matches:", stats.wordMatch);
console.log("ambiguous:", stats.ambiguous);
console.log("no match:", stats.noMatch);
console.log("invalid example:", stats.invalidExample);
console.log("Total matched:", matched, "/", meaningItems.length, "(" + coverage + "%)");

// Write the generated index
const indexJSON = JSON.stringify(index, null, 2);

const output = [
  "// Auto-generated Meaning Mode example index.",
  "// Source: .static-export-cache/words.json (READ-ONLY, never modified)",
  "// Matched against: public/data/meaning-6000.json (READ-ONLY, never modified)",
  "// Generated: " + new Date().toISOString(),
  "// Stats: " + matched + "/" + meaningItems.length + " matched (" + coverage + "% coverage)",
  "// DO NOT EDIT MANUALLY — regenerate with: node app/lib/meaning-mode/build-example-index.mjs",
  "",
  "export const MEANING_EXAMPLE_INDEX = " + indexJSON + ";",
  "",
  "export function getExample(wordIdOrKey) {",
  "  return MEANING_EXAMPLE_INDEX[wordIdOrKey] || null;",
  "}",
  "",
  "export function hasExample(wordIdOrKey) {",
  "  return wordIdOrKey in MEANING_EXAMPLE_INDEX;",
  "}",
  ""
].join("\n");

writeFileSync(OUTPUT_IDX, output, "utf-8");
console.log("\nIndex written to:", OUTPUT_IDX);

// Write reports
mkdirSync(REPORTS_DIR, { recursive: true });

// Sample entries
const sampleKeys = Object.keys(index).slice(0, 30);
const samples = sampleKeys.map(k => ({
  key: k,
  word: index[k].word,
  example: index[k].example.substring(0, 80),
  exampleCn: index[k].exampleCn,
  matchType: index[k].matchType
}));

const reportMD = [
  "# Meaning Mode — Example Index Build Report",
  "",
  "**Generated:** " + new Date().toISOString(),
  "",
  "## Source",
  "- Main word bank: .static-export-cache/words.json (13,795 words)",
  "- Example field: example (100% coverage in main bank)",
  "- Chinese translation: exampleCn (100% coverage in main bank)",
  "",
  "## Match Results",
  "| Metric | Count |",
  "|--------|-------|",
  "| Total meaning-6000 words | " + meaningItems.length + " |",
  "| Successfully matched | **" + matched + "** |",
  "| Coverage | **" + coverage + "%** |",
  "| wordId exact match | " + stats.wordIdMatch + " |",
  "| word text match | " + stats.wordMatch + " |",
  "| Ambiguous matches | " + stats.ambiguous + " |",
  "| No match | " + stats.noMatch + " |",
  "| Invalid/missing example | " + stats.invalidExample + " |",
  "",
  "## Match Rules",
  "1. wordId exact match (meaning-6000.wordId ↔ words.json.wordId)",
  "2. word exact match (normalized, case-insensitive)",
  "3. No fuzzy matching, no stemming, no synonym matching",
  "",
  "## Sample Matches (first 30)",
  "",
  "| # | Word | Example | ExampleCn | Match |",
  "|---|------|---------|-----------|-------|",
  ...samples.map((s, i) => "| " + (i + 1) + " | " + s.word + " | " + (s.example || "-") + " | " + (s.exampleCn || "-") + " | " + s.matchType + " |"),
  "",
  "## Index Output",
  "- pp/lib/meaning-mode/example-index.generated.mjs",
  "- Export: MEANING_EXAMPLE_INDEX, getExample(), hasExample()",
  "",
  "## File Integrity (SHA-256)",
  "- words.json: " + wordsHashBefore + "",
  "- meaning-6000.json: " + meaningHashBefore + "",
  ""
].join("\n");

writeFileSync(join(REPORTS_DIR, "meaning-example-index-report.md"), reportMD, "utf-8");

const reportJSON = {
  generatedAt: new Date().toISOString(),
  sourcePath: WORDS_PATH,
  meaningPath: MEANING_PATH,
  totalMeaningWords: meaningItems.length,
  matched,
  coverage: parseFloat(coverage),
  matchBreakdown: {
    wordIdExact: stats.wordIdMatch,
    wordText: stats.wordMatch,
    ambiguous: stats.ambiguous,
    noMatch: stats.noMatch,
    invalidExample: stats.invalidExample
  },
  fileIntegrity: {
    wordsJsonSha256: wordsHashBefore,
    meaning6000JsonSha256: meaningHashBefore
  },
  sampleEntries: samples
};

writeFileSync(join(REPORTS_DIR, "meaning-example-index-report.json"), JSON.stringify(reportJSON, null, 2), "utf-8");

console.log("Reports written to:", REPORTS_DIR);
console.log("Done.");
