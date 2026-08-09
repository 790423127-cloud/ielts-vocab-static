/**
 * Retire user-confirmed proper nouns and brands from G-reading.
 * Usage:
 *   node scripts/clean-reading-g-pending-anomalies.mjs --dry-run
 *   node scripts/clean-reading-g-pending-anomalies.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  READING_G_RETIREMENTS_SOURCE,
  getReadingGRetirementKey,
  normalizeReadingGRetirements
} from "../app/lib/reading-g-vocab/retirements.mjs";
import { isReadingGAiCompletionCandidate } from "../app/lib/reading-g-vocab/ai-completion.mjs";
import { runReadingGQuestionBankExpansion } from "./expand-reading-g-question-bank.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const VOCAB_PATH = path.join(ROOT, "public/data/reading-g-vocab.json");
const RETIREMENTS_PATH = path.join(ROOT, READING_G_RETIREMENTS_SOURCE);
const BACKUP_ROOT = path.join(ROOT, "backups/reading-g-pending-anomalies");

const PROPER_NAMES_AND_BRANDS = [
  "atherton", "fenton", "sasha", "wessex", "hatcliff", "brene", "coffs", "ffyona",
  "helmsley", "locksley", "logitech", "marshbrook", "sloane", "darren's", "bramley",
  "hanugoldi", "microsoft", "tang", "percil", "ripton", "wychwood", "croyde",
  "lillee's", "maplehampton", "sture", "bingham", "buchanan", "caldy", "cambourne",
  "carey", "dingle", "palmer's", "sinclair", "skybag", "cameron", "grafton", "wollongbar"
];

const TARGETS = new Map(PROPER_NAMES_AND_BRANDS.map((word) => [word, "proper_name_or_brand"]));

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function atomicWriteJson(filePath, payload) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function normalize(word) {
  return String(word || "").trim().toLowerCase();
}

function main() {
  const apply = process.argv.includes("--apply");
  const vocab = readJson(VOCAB_PATH);
  const retirementPayload = readJson(RETIREMENTS_PATH);
  const entries = Array.isArray(vocab.items) ? vocab.items : [];
  const targetEntries = entries.filter((entry) => TARGETS.has(normalize(entry.word)));
  const matchedWords = new Set(targetEntries.map((entry) => normalize(entry.word)));
  const missingWords = [...TARGETS.keys()].filter((word) => !matchedWords.has(word));

  if (TARGETS.size !== 37) throw new Error(`Expected 37 targets, found ${TARGETS.size}`);
  if (targetEntries.length !== 37 || missingWords.length) {
    throw new Error(`Expected all 37 targets in G vocabulary: matched=${targetEntries.length}, missing=${missingWords.join(", ")}`);
  }

  const summary = {
    apply,
    properNamesAndBrands: PROPER_NAMES_AND_BRANDS.length,
    matchedEntries: targetEntries.length,
    exclusionMethod: "reading-g-retirements overlay",
    aiCandidatesBefore: entries.filter(isReadingGAiCompletionCandidate).length
  };

  if (!apply) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const retiredAt = new Date().toISOString();
  const stamp = retiredAt.replace(/[:.]/g, "-");
  const backupDir = path.join(BACKUP_ROOT, stamp);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(VOCAB_PATH, path.join(backupDir, "reading-g-vocab.before.json"));
  fs.copyFileSync(RETIREMENTS_PATH, path.join(backupDir, "reading-g-retirements.before.json"));

  const existingRetirements = normalizeReadingGRetirements(retirementPayload);
  const retirementKeys = new Set(existingRetirements.map((entry) => entry.key));
  const nextRetirements = [...existingRetirements];
  for (const entry of targetEntries) {
    const key = getReadingGRetirementKey(entry);
    if (!key || retirementKeys.has(key)) continue;
    retirementKeys.add(key);
    nextRetirements.push({
      key,
      id: entry.id,
      word: entry.word,
      entryType: entry.entryType === "phrase" ? "phrase" : "word",
      deletedAt: retiredAt
    });
  }

  atomicWriteJson(RETIREMENTS_PATH, {
    version: "reading-g-retirements-v1",
    updatedAt: retiredAt,
    count: nextRetirements.length,
    entries: nextRetirements
  });
  atomicWriteJson(path.join(backupDir, "cleanup-manifest.json"), {
    version: "reading-g-pending-anomalies-v1",
    retiredAt,
    summary,
    targets: targetEntries.map((entry) => ({
      id: entry.id,
      word: entry.word,
      reason: TARGETS.get(normalize(entry.word))
    }))
  });

  const { vocab: nextVocab } = runReadingGQuestionBankExpansion({ projectRoot: ROOT });
  const remaining = (nextVocab.items || []).filter((entry) => TARGETS.has(normalize(entry.word)));
  if (remaining.length) throw new Error(`Retired targets remain visible: ${remaining.map((entry) => entry.word).join(", ")}`);

  console.log(JSON.stringify({
    ...summary,
    backupDir,
    retirementTotal: nextRetirements.length,
    aiCandidatesAfter: (nextVocab.items || []).filter(isReadingGAiCompletionCandidate).length,
    visibleTargetCount: remaining.length
  }, null, 2));
}

main();
