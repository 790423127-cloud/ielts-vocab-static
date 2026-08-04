/**
 * Bulk-retire junk/unusable G-reading pending headwords, then re-expand.
 * Usage: node scripts/cleanup-reading-g-pending-junk.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  READING_G_RETIREMENTS_SOURCE,
  getReadingGRetirementKey,
  normalizeReadingGRetirements
} from "../app/lib/reading-g-vocab/retirements.mjs";
import { runReadingGQuestionBankExpansion } from "./expand-reading-g-question-bank.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const VOCAB_PATH = path.join(ROOT, "public/data/reading-g-vocab.json");
const RETIREMENTS_PATH = path.join(ROOT, READING_G_RETIREMENTS_SOURCE);
const PLAN_PATH = path.join(ROOT, "tmp/reading-g-pending-delete-plan.json");
const BACKUP_DIR = path.join(ROOT, "backups", "reading-g-pending-junk-cleanup");

const EXTRA_JUNK = new Set(
  [
    "americans",
    "americas",
    "amsterdam",
    "apps",
    "asap",
    "assyrians",
    "auckland",
    "id",
    "zealanders",
    "kph",
    "first-come",
    "first-served"
  ].map((w) => w.toLowerCase())
);

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function atomicWriteJson(filePath, value) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function main() {
  const vocab = readJson(VOCAB_PATH);
  if (!vocab?.items) throw new Error("reading-g-vocab.json missing items");
  const plan = readJson(PLAN_PATH);
  if (!plan?.deleteWords?.length) throw new Error("delete plan missing; run classify first");

  const pending = vocab.items.filter((it) => it.primaryLayer === "questionBankPending");
  const byWord = new Map(pending.map((it) => [String(it.word || "").toLowerCase(), it]));
  const byId = new Map(pending.map((it) => [it.id, it]));

  const targets = [];
  const seen = new Set();
  for (const row of plan.deleteWords) {
    const entry = byId.get(row.id) || byWord.get(String(row.word || "").toLowerCase());
    if (!entry) continue;
    const key = getReadingGRetirementKey(entry);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    targets.push({ entry, reason: row.reason || "classified_junk" });
  }
  for (const word of EXTRA_JUNK) {
    const entry = byWord.get(word);
    if (!entry) continue;
    const key = getReadingGRetirementKey(entry);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    targets.push({ entry, reason: "extra_manual_junk" });
  }

  if (!targets.length) {
    console.log("Nothing to retire.");
    return;
  }

  const deletedAt = new Date().toISOString();
  const previous = readJson(RETIREMENTS_PATH, {
    version: "reading-g-retirements-v1",
    updatedAt: "",
    count: 0,
    entries: []
  });
  const prevEntries = normalizeReadingGRetirements(previous);
  const prevKeys = new Set(prevEntries.map((e) => e.key));
  const merged = [...prevEntries];
  for (const { entry } of targets) {
    const key = getReadingGRetirementKey(entry);
    if (prevKeys.has(key)) continue;
    prevKeys.add(key);
    merged.push({
      key,
      id: entry.id,
      word: entry.word,
      entryType: entry.entryType === "phrase" ? "phrase" : "word",
      deletedAt
    });
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = deletedAt.replace(/[:.]/g, "-");
  const backupPath = path.join(BACKUP_DIR, `cleanup-${stamp}.json`);
  atomicWriteJson(backupPath, {
    version: "reading-g-pending-junk-cleanup-v1",
    deletedAt,
    deleteCount: targets.length,
    previousRetirements: previous,
    deleted: targets.map(({ entry, reason }) => ({
      id: entry.id,
      word: entry.word,
      reason,
      primaryLayer: entry.primaryLayer
    }))
  });

  const nextRetirements = {
    version: "reading-g-retirements-v1",
    updatedAt: deletedAt,
    count: merged.length,
    entries: merged
  };
  atomicWriteJson(RETIREMENTS_PATH, nextRetirements);

  console.log(`Retirements written: +${targets.length} (total ${merged.length})`);
  console.log(`Backup: ${backupPath}`);
  console.log("Re-running question-bank expansion...");

  const result = runReadingGQuestionBankExpansion({ projectRoot: ROOT });
  const q = result.vocab.questionBankExpansion || {};
  console.log(
    JSON.stringify(
      {
        ok: true,
        deletedThisRun: targets.length,
        retirementTotal: merged.length,
        items: result.vocab.count,
        pendingCount: q.pendingCount,
        activeExpansion: q.activeCount,
        aiCompleted: q.aiCompletedCount,
        retiredCount: q.retiredCount
      },
      null,
      2
    )
  );

  // reason breakdown
  const reasons = {};
  for (const t of targets) reasons[t.reason] = (reasons[t.reason] || 0) + 1;
  console.log("reason breakdown", reasons);
  console.log(
    "sample deleted:",
    targets
      .slice(0, 40)
      .map((t) => t.entry.word)
      .join(", ")
  );
}

main();
