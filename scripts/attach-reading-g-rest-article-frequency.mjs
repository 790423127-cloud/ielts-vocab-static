/**
 * Attach 280-article frequency evidence to G-class items that are not in
 * the article high-frequency layer. Does not add/remove layers or IDs.
 *
 *   node scripts/attach-reading-g-rest-article-frequency.mjs
 *   node scripts/attach-reading-g-rest-article-frequency.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { atomicReplaceFileSync } from "../app/lib/reading-g-vocab/atomic-write.server.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VOCAB_PATH = path.join(ROOT, "public", "data", "reading-g-vocab.json");
const SOURCE_PATH = path.join(ROOT, "scripts", "data", "reading-g-article-rest-frequency-20260828.json");
const BACKUP_DIR = path.join(ROOT, "backups", "reading-g-article-rest-frequency-20260828");
const LAYER_ID = "part12ArticleHighFrequency";
const apply = process.argv.includes("--apply");

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

const source = JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8"));
const vocab = JSON.parse(fs.readFileSync(VOCAB_PATH, "utf8"));
const beforeIds = (vocab.items || []).map((item) => `${item.id}::${item.word}`);
const byId = new Map((vocab.items || []).map((item) => [item.id, item]));
const rows = list(source.rows);
if (rows.length !== Number(source.hitCount)) {
  throw new Error("rest-frequency rows/hitCount 不一致");
}

let attached = 0;
let skippedHf = 0;
let missing = [];
for (const row of rows) {
  const item = byId.get(row.id);
  if (!item) {
    missing.push(row.id);
    continue;
  }
  if (item.word !== row.word) {
    throw new Error(`ID/词头不一致：${row.id} ${item.word} != ${row.word}`);
  }
  if (list(item.layers).includes(LAYER_ID)) {
    skippedHf += 1;
    continue;
  }
  item.part12ArticleFrequency = {
    version: source.version,
    sourceDocument: "剑雅5-21 G类阅读 Part1+2 224篇 + Part3 56篇",
    articleCount: Number(row.articleCount || 0),
    occurrenceCount: Number(row.occurrenceCount || 0),
    part1ArticleCount: Number(row.part1ArticleCount || 0),
    part2ArticleCount: Number(row.part2ArticleCount || 0),
    part3ArticleCount: Number(row.part3ArticleCount || 0),
    surfaces: unique(row.surfaces),
    articleIds: unique(row.articleIds),
    part3ArticleIds: unique(row.part3ArticleIds)
  };
  attached += 1;
}

if (missing.length) {
  throw new Error(`找不到词条：${missing.slice(0, 8).join(", ")}`);
}

const afterIds = (vocab.items || []).map((item) => `${item.id}::${item.word}`);
if (JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) {
  throw new Error("稳定 ID 或词头发生变化，已停止。");
}

vocab.articleRestFrequency = {
  version: source.version,
  attachedAt: "2026-08-28",
  articleCount: source.articleCount,
  restItemCount: source.restItemCount,
  hitCount: attached,
  zeroCount: Number(source.zeroCount || 0),
  skippedHighFrequencyCount: skippedHf,
  policy: "不改 ID、不加入文章高频层；仅为非高频词条补上 280 篇出现统计，供其余词汇入口按频率排序。"
};

const report = {
  mode: apply ? "apply" : "dry-run",
  attached,
  skippedHf,
  restItems: source.restItemCount,
  zeros: source.zeroCount
};

if (apply) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, "reading-g-vocab.before.json");
  if (!fs.existsSync(backupPath)) fs.copyFileSync(VOCAB_PATH, backupPath);
  atomicReplaceFileSync(VOCAB_PATH, `${JSON.stringify(vocab, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
