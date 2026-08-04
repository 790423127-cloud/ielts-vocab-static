import fs from "fs";
import {
  READING_G_RETIREMENTS_SOURCE,
  getReadingGRetirementKey,
  normalizeReadingGRetirements
} from "../app/lib/reading-g-vocab/retirements.mjs";
import { runReadingGQuestionBankExpansion } from "../scripts/expand-reading-g-question-bank.mjs";

const ROOT = process.cwd();
const EXTRA = new Set([
  "weldown",
  "wollongbar",
  "welsh",
  "ages",
  "arts"
]);

const vocab = JSON.parse(fs.readFileSync("public/data/reading-g-vocab.json", "utf8"));
const pending = vocab.items.filter((i) => i.primaryLayer === "questionBankPending");
const more = pending.filter((i) => EXTRA.has(String(i.word || "").toLowerCase()));
console.log("second-pass candidates", more.map((x) => x.word));
if (!more.length) process.exit(0);

const deletedAt = new Date().toISOString();
const prev = JSON.parse(fs.readFileSync(READING_G_RETIREMENTS_SOURCE, "utf8"));
const entries = normalizeReadingGRetirements(prev);
const keys = new Set(entries.map((e) => e.key));
for (const entry of more) {
  const key = getReadingGRetirementKey(entry);
  if (!key || keys.has(key)) continue;
  keys.add(key);
  entries.push({ key, id: entry.id, word: entry.word, entryType: "word", deletedAt });
}
fs.writeFileSync(
  READING_G_RETIREMENTS_SOURCE,
  JSON.stringify({ version: "reading-g-retirements-v1", updatedAt: deletedAt, count: entries.length, entries }, null, 2) + "\n"
);
const result = runReadingGQuestionBankExpansion({ projectRoot: ROOT });
console.log({
  secondPassDeleted: more.length,
  pending: result.vocab.questionBankExpansion.pendingCount,
  total: result.vocab.count,
  retired: result.vocab.questionBankExpansion.retiredCount
});
