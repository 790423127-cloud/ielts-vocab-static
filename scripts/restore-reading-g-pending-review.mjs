import fs from "fs";
import path from "path";
import {
  READING_G_RETIREMENTS_SOURCE,
  getReadingGRetirementKey,
  normalizeReadingGRetirements
} from "../app/lib/reading-g-vocab/retirements.mjs";
import { normalizeReadingGKey } from "../app/lib/reading-g-vocab/normalize.mjs";
import { runReadingGQuestionBankExpansion } from "./expand-reading-g-question-bank.mjs";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
// fix windows path from file URL
const projectRoot = process.cwd();

const MISC = new Set(
  `ages americans americas amsterdam apps arts asap assyrians auckland brings clean first-come first-served for id kph many more own test two type weldown welsh whole wollongbar zealanders`
    .split(/\s+/)
    .map((w) => w.toLowerCase())
);

const plan = JSON.parse(fs.readFileSync(path.join(projectRoot, "tmp/reading-g-pending-delete-plan.json"), "utf8"));
const inflection = new Set(
  (plan.deleteWords || [])
    .filter((d) => d.reason === "inflection_of_active")
    .map((d) => String(d.word || "").toLowerCase())
);

const backupDir = path.join(projectRoot, "backups/reading-g-pending-junk-cleanup");
if (fs.existsSync(backupDir)) {
  for (const f of fs.readdirSync(backupDir).filter((x) => x.endsWith(".json"))) {
    const data = JSON.parse(fs.readFileSync(path.join(backupDir, f), "utf8"));
    for (const d of data.deleted || []) {
      if (d.reason === "inflection_of_active") inflection.add(String(d.word || "").toLowerCase());
      if (d.reason === "extra_manual_junk") MISC.add(String(d.word || "").toLowerCase());
    }
  }
}

const restoreWords = new Set([...inflection, ...MISC]);
const restoreKeys = new Set();
for (const word of restoreWords) {
  const key = getReadingGRetirementKey({ word, entryType: "word" });
  if (key) restoreKeys.add(key);
  const nk = normalizeReadingGKey(word);
  if (nk) restoreKeys.add(`word::${nk}`);
}

const retirementsPath = path.join(projectRoot, READING_G_RETIREMENTS_SOURCE);
const prev = JSON.parse(fs.readFileSync(retirementsPath, "utf8"));
const before = normalizeReadingGRetirements(prev);
const kept = [];
const restored = [];
for (const entry of before) {
  const wordKey = String(entry.word || "").toLowerCase();
  const normKey = normalizeReadingGKey(entry.word);
  const retirementKey = String(entry.key || "");
  const shouldRestore =
    restoreKeys.has(retirementKey) ||
    restoreWords.has(wordKey) ||
    restoreWords.has(normKey);
  if (shouldRestore) restored.push(entry);
  else kept.push(entry);
}

const deletedAt = new Date().toISOString();
const next = {
  version: "reading-g-retirements-v1",
  updatedAt: deletedAt,
  count: kept.length,
  entries: kept
};

const bakDir = path.join(projectRoot, "backups", "reading-g-restore-pending");
fs.mkdirSync(bakDir, { recursive: true });
const stamp = deletedAt.replace(/[:.]/g, "-");
fs.writeFileSync(path.join(bakDir, `retirements-before-restore-${stamp}.json`), JSON.stringify(prev, null, 2) + "\n");
fs.writeFileSync(
  path.join(bakDir, `restored-entries-${stamp}.json`),
  JSON.stringify(
    {
      restoredAt: deletedAt,
      restoreCount: restored.length,
      inflectionCount: inflection.size,
      miscCount: MISC.size,
      restoredWords: restored.map((e) => e.word).sort((a, b) => a.localeCompare(b)),
      restored
    },
    null,
    2
  ) + "\n"
);

fs.writeFileSync(retirementsPath, JSON.stringify(next, null, 2) + "\n");
console.log({
  retirementsBefore: before.length,
  restored: restored.length,
  retirementsAfter: kept.length,
  inflectionRequested: inflection.size,
  miscRequested: MISC.size
});

console.log("Re-expanding vocab...");
const result = runReadingGQuestionBankExpansion({ projectRoot });
const q = result.vocab.questionBankExpansion;
console.log({
  total: result.vocab.count,
  pending: q.pendingCount,
  activeExpansion: q.activeCount,
  retired: q.retiredCount,
  effective: q.effectiveTargetCount
});

const words = new Set(
  result.vocab.items
    .filter((i) => (i.entryType || "word") === "word")
    .map((i) => normalizeReadingGKey(i.word))
);
const missing = [...restoreWords].filter((w) => !words.has(normalizeReadingGKey(w)));
console.log("missing after restore", missing.length, missing.join(", "));

const restoredPending = result.vocab.items.filter(
  (i) =>
    (i.primaryLayer === "questionBankPending" || i.primaryLayer === "questionBankActive") &&
    restoreWords.has(String(i.word || "").toLowerCase())
);
console.log(
  "restored visible",
  restoredPending.length,
  "pending",
  restoredPending.filter((i) => i.primaryLayer === "questionBankPending").length,
  "active",
  restoredPending.filter((i) => i.primaryLayer === "questionBankActive").length
);
