import fs from "fs";
import path from "path";
import { normalizeReadingGKey } from "../app/lib/reading-g-vocab/normalize.mjs";
import { getReadingGRetirementKey } from "../app/lib/reading-g-vocab/retirements.mjs";

const ROOT = process.cwd();
const want = ["clean", "for", "many", "more", "own", "test", "two", "type", "whole"];
const dir = path.join(ROOT, "backups/reading-g-delete");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
const byWord = new Map();
for (const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const word = String(data.entry?.word || "").toLowerCase();
  if (want.includes(word)) byWord.set(word, data.entry);
}
console.log(
  "found backups",
  [...byWord.keys()],
  "missing",
  want.filter((w) => !byWord.has(w))
);

const vocabPath = path.join(ROOT, "public/data/reading-g-vocab.json");
const vocab = JSON.parse(fs.readFileSync(vocabPath, "utf8"));
const existing = new Set(
  vocab.items.map((i) => normalizeReadingGKey(i.word))
);
let added = 0;
for (const word of want) {
  const entry = byWord.get(word);
  if (!entry) continue;
  const key = normalizeReadingGKey(entry.word);
  if (existing.has(key)) {
    console.log("already present", word);
    continue;
  }
  vocab.items.push(entry);
  existing.add(key);
  added += 1;
  console.log("restored core entry", word, entry.primaryLayer, entry.studyMode);
}

// recompute counts
const items = vocab.items;
vocab.count = items.length;
vocab.wordCount = items.filter((i) => (i.entryType || "word") === "word").length;
vocab.phraseCount = items.filter((i) => i.entryType === "phrase").length;
vocab.activeCount = items.filter((i) => i.studyMode === "active").length;
vocab.referenceCount = items.filter((i) => i.studyMode === "reference").length;
vocab.multiSenseCount = items.filter((i) => Array.isArray(i.senses) && i.senses.length > 1).length;

fs.writeFileSync(vocabPath, JSON.stringify(vocab, null, 2) + "\n");
console.log({
  added,
  total: vocab.count,
  active: vocab.activeCount,
  reference: vocab.referenceCount,
  pending: items.filter((i) => i.primaryLayer === "questionBankPending").length
});

// ensure not in retirements
const retPath = path.join(ROOT, "public/data/reading-g-retirements.json");
const ret = JSON.parse(fs.readFileSync(retPath, "utf8"));
const before = ret.entries.length;
ret.entries = ret.entries.filter((e) => !want.includes(String(e.word || "").toLowerCase()));
ret.count = ret.entries.length;
ret.updatedAt = new Date().toISOString();
fs.writeFileSync(retPath, JSON.stringify(ret, null, 2) + "\n");
console.log("retirements removed", before - ret.entries.length, "now", ret.count);

// final verification of user-requested sets
const plan = JSON.parse(fs.readFileSync("tmp/reading-g-pending-delete-plan.json", "utf8"));
const inflection = plan.deleteWords
  .filter((d) => d.reason === "inflection_of_active")
  .map((d) => String(d.word).toLowerCase());
const misc =
  "ages americans americas amsterdam apps arts asap assyrians auckland brings clean first-come first-served for id kph many more own test two type weldown welsh whole wollongbar zealanders".split(
    /\s+/
  );
const present = new Set(items.map((i) => String(i.word || "").toLowerCase()));
const missInf = inflection.filter((w) => !present.has(w));
const missMisc = misc.filter((w) => !present.has(w));
console.log({
  inflectionRequested: inflection.length,
  inflectionMissing: missInf.length,
  miscRequested: misc.length,
  miscMissing: missMisc,
  sampleInf: inflection.slice(0, 5).map((w) => [w, present.has(w)])
});
