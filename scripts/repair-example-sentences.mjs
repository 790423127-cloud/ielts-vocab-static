/**
 * Repair broken / corpus-dump example sentences in:
 *   - public/data/reading-g-vocab.json  (primary issues)
 *   - public/data/words.json            (light cleanup if any)
 *   - public/data/basic-words.json
 *
 * Usage: node scripts/repair-example-sentences.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  cleanExampleField,
  cleanExampleCnField
} from "../app/lib/vocab/example-clean.mjs";
import { stripExampleSkeletonTails, isCorruptedExampleSkeleton } from "../app/lib/vocab/example-skeleton-tails.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function atomicWrite(filePath, data) {
  const tmp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

function backup(filePath) {
  const base = path.basename(filePath);
  const dest = path.join(
    root,
    "backups",
    `${base.replace(/\.json$/i, "")}-before-example-repair-${Date.now()}.json`
  );
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(filePath, dest);
  return dest;
}

function repairEntry(entry, stats, opts = {}) {
  const word = entry.word || entry.headword || entry.phrase || "";
  let example = entry.example || entry.exampleEn || "";
  let exampleCn = entry.exampleCn || entry.exampleZh || "";

  if (isCorruptedExampleSkeleton(example)) {
    example = stripExampleSkeletonTails(example);
    stats.skeleton += 1;
  }

  const cleaned = cleanExampleField(example, word, {
    entryType: entry.entryType || (/\s/.test(word) ? "phrase" : "word"),
    meaningZh: entry.primaryMeaningZh || entry.meaning || entry.meaningZh || "",
    synthesizeIfEmpty: opts.synthesizeIfEmpty === true,
    synthesizeIfTruncated: opts.synthesizeIfTruncated === true,
    maxWords: opts.maxWords || 36
  });

  if (cleaned.repaired) {
    stats.repaired += 1;
    stats.reasons[cleaned.reason] = (stats.reasons[cleaned.reason] || 0) + 1;
    entry.example = cleaned.example;
    if (entry.exampleEn !== undefined) entry.exampleEn = cleaned.example;
    // sync senses[0].example if present and was empty/same as old
    if (Array.isArray(entry.senses)) {
      for (const s of entry.senses) {
        if (!s.example || s.example === example) {
          s.example = cleaned.example;
        } else {
          const sc = cleanExampleField(s.example, word, {
            entryType: entry.entryType,
            meaningZh: s.meaningZh || "",
            synthesizeIfEmpty: false,
            maxWords: opts.maxWords || 36
          });
          if (sc.repaired && sc.example) s.example = sc.example;
        }
      }
    }
  } else if (cleaned.example && cleaned.example !== example) {
    entry.example = cleaned.example;
    stats.repaired += 1;
  }

  const cn = cleanExampleCnField(exampleCn);
  if (cn !== exampleCn) {
    entry.exampleCn = cn;
    if (entry.exampleZh !== undefined) entry.exampleZh = cn;
    stats.cnCleaned += 1;
  }

  return entry;
}

function repairReadingG() {
  const filePath = path.join(root, "public", "data", "reading-g-vocab.json");
  const bak = backup(filePath);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const stats = { total: 0, repaired: 0, skeleton: 0, cnCleaned: 0, reasons: {} };
  data.items = (data.items || []).map((item) => {
    stats.total += 1;
    return repairEntry(item, stats, {
      synthesizeIfEmpty: false,
      synthesizeIfTruncated: false,
      maxWords: 32
    });
  });
  data.exampleRepair = {
    at: new Date().toISOString(),
    stats
  };
  atomicWrite(filePath, data);
  return { filePath, bak, stats };
}

function repairWordsJson(rel = "public/data/words.json") {
  const filePath = path.join(root, rel);
  if (!fs.existsSync(filePath)) return null;
  const bak = backup(filePath);
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const isArr = Array.isArray(raw);
  const list = isArr ? raw : raw.words || raw.items || [];
  const stats = { total: 0, repaired: 0, skeleton: 0, cnCleaned: 0, reasons: {} };
  const next = list.map((item) => {
    stats.total += 1;
    // master bank: do not invent examples if empty (preserve intentional blanks)
    // Master lexicon: clean bullets / multi-sentence only; do NOT invent synthetic examples.
    return repairEntry(item, stats, {
      synthesizeIfEmpty: false,
      synthesizeIfTruncated: false,
      maxWords: 36
    });
  });
  const out = isArr ? next : { ...raw, words: next };
  if (!isArr && raw.items) out.items = next;
  atomicWrite(filePath, out);
  return { filePath, bak, stats };
}

function repairBasic() {
  const filePath = path.join(root, "public", "data", "basic-words.json");
  if (!fs.existsSync(filePath)) return null;
  const bak = backup(filePath);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const stats = { total: 0, repaired: 0, skeleton: 0, cnCleaned: 0, reasons: {} };
  const key = Array.isArray(data.words) ? "words" : "items";
  data[key] = (data[key] || []).map((item) => {
    stats.total += 1;
    return repairEntry(item, stats, {
      synthesizeIfEmpty: false,
      synthesizeIfTruncated: false,
      maxWords: 28
    });
  });
  atomicWrite(filePath, data);
  return { filePath, bak, stats };
}

function main() {
  const results = {
    readingG: repairReadingG(),
    words: repairWordsJson("public/data/words.json"),
    basic: repairBasic()
  };

  // also repair static export cache if present
  const cache = path.join(root, ".static-export-cache", "words.json");
  if (fs.existsSync(cache)) {
    results.staticCache = repairWordsJson(".static-export-cache/words.json");
  }

  console.log(JSON.stringify(results, null, 2));
}

main();
