/**
 * Remove G-class headwords whose first letter is a stray "n" glued from
 * article line-breaks (nintroduce → introduce). Canonical cards stay;
 * junk IDs are aliased then retired. Does not change official master IDs.
 *
 *   node scripts/fix-reading-g-leading-n-glued-words.mjs
 *   node scripts/fix-reading-g-leading-n-glued-words.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { atomicReplaceFileSync } from "../app/lib/reading-g-vocab/atomic-write.server.mjs";
import {
  getReadingGRetirementKey,
  normalizeReadingGRetirements
} from "../app/lib/reading-g-vocab/retirements.mjs";
import { normalizeReadingGKey } from "../app/lib/reading-g-vocab/normalize.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VOCAB_PATH = path.join(ROOT, "public", "data", "reading-g-vocab.json");
const RETIREMENTS_PATH = path.join(ROOT, "public", "data", "reading-g-retirements.json");
const BACKUP_DIR = path.join(ROOT, "backups", "reading-g-leading-n-glue-20260829");
const apply = process.argv.includes("--apply");

const GLUED = [
  { junk: "nintroduce", canonical: "introduce" },
  { junk: "nhighlight", canonical: "highlight" },
  { junk: "noverhead", canonical: "overhead" },
  { junk: "nprovide", canonical: "provide" },
  { junk: "nrepetitive", canonical: "repetitive" },
  { junk: "nslippery", canonical: "slippery" },
  { junk: "ntransporting", canonical: "transporting" },
  { junk: "nunsuitable", canonical: "unsuitable" }
];

const RENAME = [
  { from: "lnterviewees", to: "interviewees" }
];

const DISPLAY_JUNK = new Set([
  ...GLUED.map((row) => row.junk),
  "lnterviewees",
  "lntervieweeses"
]);

function list(value) {
  return Array.isArray(value) ? value : [];
}

function isDisplayJunk(value) {
  return DISPLAY_JUNK.has(normalizeReadingGKey(value));
}

function stripDisplayJunk(item) {
  const stripped = [];
  for (const field of ["wordFamily", "forms"]) {
    const rows = list(item[field]);
    const next = rows.filter((row) => !isDisplayJunk(row?.word));
    if (next.length !== rows.length) {
      item[field] = next;
      stripped.push({
        owner: item.word,
        id: item.id,
        field,
        removed: rows.length - next.length
      });
    }
  }
  return stripped;
}

function recomputeTotals(items) {
  let wordCount = 0;
  let phraseCount = 0;
  let activeCount = 0;
  let referenceCount = 0;
  for (const item of items) {
    if ((item?.entryType || "word") === "phrase") phraseCount += 1;
    else wordCount += 1;
    if (item?.studyMode === "reference") referenceCount += 1;
    else activeCount += 1;
  }
  return { count: items.length, wordCount, phraseCount, activeCount, referenceCount };
}

const vocab = JSON.parse(fs.readFileSync(VOCAB_PATH, "utf8"));
const retirementsPayload = JSON.parse(fs.readFileSync(RETIREMENTS_PATH, "utf8"));
const byWord = new Map();
const byId = new Map();
for (const item of vocab.items) {
  byWord.set(normalizeReadingGKey(item.word), item);
  byId.set(item.id, item);
}

const merged = [];
const missing = [];
const removedIds = new Set();

for (const row of GLUED) {
  const junk = byWord.get(row.junk);
  const canonical = byWord.get(row.canonical);
  if (!junk) {
    continue;
  }
  if (!canonical) {
    missing.push(row);
    continue;
  }
  const aliases = list(canonical.mergedAliases);
  const key = normalizeReadingGKey(junk.word);
  if (!aliases.some((alias) => normalizeReadingGKey(alias.key || alias.word) === key)) {
    canonical.mergedAliases = [
      ...aliases,
      {
        key,
        id: junk.id,
        word: junk.word,
        relationType: "form"
      }
    ];
  }
  const mergedEntries = list(canonical.mergedEntries);
  if (!mergedEntries.some((entry) => entry.id === junk.id)) {
    canonical.mergedEntries = [
      ...mergedEntries,
      {
        key,
        id: junk.id,
        word: junk.word,
        reason: "leading-n-line-break-glue"
      }
    ];
  }
  removedIds.add(junk.id);
  merged.push({ junk: junk.word, junkId: junk.id, canonical: canonical.word, canonicalId: canonical.id });
}

const renamed = [];
for (const row of RENAME) {
  const item = byWord.get(row.from);
  if (!item) {
    continue;
  }
  const previous = item.word;
  item.word = row.to;
  item.normalizedKey = normalizeReadingGKey(row.to);
  const aliases = list(item.mergedAliases);
  if (!aliases.some((alias) => normalizeReadingGKey(alias.key || alias.word) === row.from)) {
    item.mergedAliases = [
      ...aliases,
      { key: row.from, id: item.id, word: previous, relationType: "form" }
    ];
  }
  renamed.push({ id: item.id, from: previous, to: item.word });
}

const displayStripped = [];
for (const item of vocab.items) {
  displayStripped.push(...stripDisplayJunk(item));
}

if (missing.length) {
  throw new Error(`无法匹配：${JSON.stringify(missing)}`);
}

const nextItems = vocab.items.filter((item) => !removedIds.has(item.id));
const deletedAt = new Date().toISOString();
const retirementByKey = new Map(
  normalizeReadingGRetirements(retirementsPayload).map((entry) => [entry.key, entry])
);
for (const row of merged) {
  const junk = byId.get(row.junkId);
  const key = getReadingGRetirementKey(junk);
  retirementByKey.set(key, {
    key,
    id: junk.id,
    word: junk.word,
    entryType: "word",
    deletedAt,
    reason: "leading-n-line-break-glue"
  });
}

const nextRetirements = {
  version: "reading-g-retirements-v1",
  updatedAt: deletedAt,
  count: retirementByKey.size,
  entries: [...retirementByKey.values()]
};

const totals = recomputeTotals(nextItems);
const nextVocab = {
  ...vocab,
  ...totals,
  items: nextItems,
  leadingNGlueRepair: {
    version: "reading-g-leading-n-glue-v1-20260829",
    repairedAt: deletedAt,
    merged,
    renamed,
    displayStripped,
    policy: "词头多出的 n 来自换行粘连。正式主词 ID 不改；错误学习卡并入已有正确词头后退役；词族/变形栏不再展示这些错词。"
  }
};

const report = {
  mode: apply ? "apply" : "dry-run",
  merged,
  renamed,
  displayStripped,
  beforeCount: vocab.items.length,
  afterCount: nextItems.length
};

if (apply) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  if (!fs.existsSync(path.join(BACKUP_DIR, "reading-g-vocab.before.json"))) {
    fs.copyFileSync(VOCAB_PATH, path.join(BACKUP_DIR, "reading-g-vocab.before.json"));
  }
  if (!fs.existsSync(path.join(BACKUP_DIR, "reading-g-retirements.before.json"))) {
    fs.copyFileSync(RETIREMENTS_PATH, path.join(BACKUP_DIR, "reading-g-retirements.before.json"));
  }
  atomicReplaceFileSync(VOCAB_PATH, `${JSON.stringify(nextVocab, null, 2)}\n`);
  atomicReplaceFileSync(RETIREMENTS_PATH, `${JSON.stringify(nextRetirements, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
