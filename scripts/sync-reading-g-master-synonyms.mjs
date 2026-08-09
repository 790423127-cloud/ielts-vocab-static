/**
 * Fill empty G-reading synonym lists from the current master lexicon.
 *
 * Usage:
 *   node scripts/sync-reading-g-master-synonyms.mjs
 *   node scripts/sync-reading-g-master-synonyms.mjs --apply
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeReadingGKey } from "../app/lib/reading-g-vocab/normalize.mjs";
import {
  normalizeReadingGSynonymDetails,
  normalizeReadingGSynonyms
} from "../app/lib/reading-g-vocab/synonym-relations.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VOCAB_PATH = path.join(ROOT, "public", "data", "reading-g-vocab.json");
const MASTER_PATH = path.join(ROOT, "public", "data", "words.json");
const STATIC_MASTER_PATH = path.join(ROOT, ".static-export-cache", "words.json");
const BACKUP_ROOT = path.join(ROOT, "backups", "reading-g-master-synonyms");
const apply = process.argv.includes("--apply");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function atomicWriteJson(filePath, value) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function masterItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.words)) return payload.words;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

const masterRaw = fs.readFileSync(MASTER_PATH, "utf8");
const staticMasterRaw = fs.readFileSync(STATIC_MASTER_PATH, "utf8");
if (sha256(masterRaw) !== sha256(staticMasterRaw)) {
  throw new Error("主词库与静态导出缓存不一致，已停止同步同义替换。");
}

const vocabRaw = fs.readFileSync(VOCAB_PATH, "utf8");
const vocab = JSON.parse(vocabRaw);
if (!Array.isArray(vocab.items)) throw new Error("G类阅读词库 items 无法读取。");

const masterByKey = new Map();
for (const entry of masterItems(JSON.parse(masterRaw))) {
  const key = normalizeReadingGKey(entry?.word);
  if (key && !masterByKey.has(key)) masterByKey.set(key, entry);
}

const syncedAt = new Date().toISOString();
const beforeIdentity = vocab.items.map((entry) => `${entry.id || ""}::${entry.word || ""}`);
let matchedMaster = 0;
let availableBefore = 0;
let updated = 0;
let detailsUpdated = 0;

function masterSynonymDetail(word, masterEntry) {
  return {
    word,
    pos: String(masterEntry?.primaryPos || masterEntry?.pos || "").trim(),
    meaningZh: String(masterEntry?.primaryMeaningZh || masterEntry?.meaningZh || masterEntry?.meaning || "").trim()
  };
}

function synonymDetailsFromMaster(entry, synonyms) {
  const existing = normalizeReadingGSynonymDetails(entry.synonymDetails, entry.word, synonyms);
  const existingByKey = new Map(existing.map((detail) => [normalizeReadingGKey(detail.word), detail]));
  return synonyms.map((word) => {
    const masterEntry = masterByKey.get(normalizeReadingGKey(word));
    return masterEntry
      ? masterSynonymDetail(word, masterEntry)
      : existingByKey.get(normalizeReadingGKey(word)) || { word, pos: "", meaningZh: "" };
  });
}

const nextItems = vocab.items.map((entry) => {
  if ((entry.entryType || "word") !== "word") return entry;
  let nextEntry = entry;
  let current = normalizeReadingGSynonyms(entry.synonyms, entry.word);
  if (current.length) {
    availableBefore += 1;
  } else {
    const master = masterByKey.get(normalizeReadingGKey(entry.word));
    if (master) {
      matchedMaster += 1;
      const synonyms = normalizeReadingGSynonyms(master.synonyms, entry.word);
      if (synonyms.length) {
        current = synonyms;
        updated += 1;
        nextEntry = {
          ...nextEntry,
          synonyms,
          synonymsReviewed: true,
          synonymsReviewSource: "master-lexicon",
          synonymsReviewedAt: syncedAt
        };
      }
    }
  }

  if (!current.length) return nextEntry;
  const synonymDetails = synonymDetailsFromMaster(nextEntry, current);
  if (JSON.stringify(synonymDetails) !== JSON.stringify(nextEntry.synonymDetails || [])) {
    detailsUpdated += 1;
    nextEntry = { ...nextEntry, synonymDetails };
  }
  return nextEntry;
});
const afterIdentity = nextItems.map((entry) => `${entry.id || ""}::${entry.word || ""}`);
if (JSON.stringify(beforeIdentity) !== JSON.stringify(afterIdentity)) {
  throw new Error("同步改变了 G 词库的数量、顺序、词头或稳定 ID，已停止写入。");
}

const nextVocab = {
  ...vocab,
  updatedAt: updated || detailsUpdated ? syncedAt : vocab.updatedAt,
  synonymEnrichment: {
    ...(vocab.synonymEnrichment || {}),
    masterLexicon: {
      updatedAt: syncedAt,
      matchedMaster,
      availableBefore,
      added: updated,
      detailsUpdated,
      maxPerWord: 4
    }
  },
  items: nextItems
};
const report = {
  mode: apply ? "apply" : "dry-run",
  masterSourcesMatch: true,
  totalWordEntries: vocab.items.filter((entry) => (entry.entryType || "word") === "word").length,
  matchedMaster,
  availableBefore,
  addedFromMaster: updated,
  synonymDetailsUpdated: detailsUpdated,
  pendingAfter: nextItems.filter((entry) => (
    (entry.entryType || "word") === "word"
    && !normalizeReadingGSynonyms(entry.synonyms, entry.word).length
    && entry.synonymsReviewed !== true
  )).length,
  reviewedNoneAfter: nextItems.filter((entry) => (
    (entry.entryType || "word") === "word"
    && !normalizeReadingGSynonyms(entry.synonyms, entry.word).length
    && entry.synonymsReviewed === true
  )).length,
  stableIdsChanged: 0,
  maxPerWord: 4,
  sha256Before: sha256(vocabRaw),
  sha256After: sha256(`${JSON.stringify(nextVocab, null, 2)}\n`)
};

if (apply && (updated || detailsUpdated)) {
  const stamp = syncedAt.replace(/[:.]/g, "-");
  const backupDir = path.join(BACKUP_ROOT, stamp);
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, "reading-g-vocab.before.json");
  fs.copyFileSync(VOCAB_PATH, backupPath);
  if (sha256(fs.readFileSync(backupPath, "utf8")) !== sha256(vocabRaw)) {
    throw new Error("G类阅读词库备份校验失败，已停止写入。");
  }
  atomicWriteJson(VOCAB_PATH, nextVocab);
  report.backupPath = backupPath;
}

console.log(JSON.stringify(report, null, 2));
