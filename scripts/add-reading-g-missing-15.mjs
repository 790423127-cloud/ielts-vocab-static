/**
 * Add 15 grok-only words that are truly absent from reading-g
 * (after simple/abbrev filter) as standalone active cards.
 *
 * Usage: node scripts/add-reading-g-missing-15.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeReadingGKey,
  stableReadingGId
} from "../app/lib/reading-g-vocab/normalize.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VOCAB_PATH = path.join(ROOT, "public", "data", "reading-g-vocab.json");
const MASTER_PATH = path.join(ROOT, "public", "data", "words.json");
const HEADER_PATH = path.join(ROOT, "app", "components", "GlobalStudyHeader.jsx");
const BACKUP_DIR = path.join(ROOT, "backups");

const WORDS = [
  "dialogue",
  "energetic",
  "examination",
  "firemen",
  "firework",
  "gymnasium",
  "housework",
  "killer",
  "lantern",
  "lasting",
  "lastly",
  "novel",
  "regret",
  "scissors",
  "silent"
];

/** Manual fallbacks when master lexicon lacks a headword. */
const FALLBACKS = {
  firemen: {
    word: "firemen",
    pos: "noun",
    primaryPos: "noun",
    phonetic: "/ˈfaɪəmen/",
    meaning: "消防员（fireman 的复数）",
    primaryMeaningZh: "消防员（fireman 的复数）",
    definition: "消防员（fireman 的复数）",
    example: "The firemen arrived within minutes.",
    exampleCn: "消防员几分钟内就赶到了。",
    forms: [{ word: "fireman", type: "form", meaning: "消防员（单数）" }],
    wordFamily: []
  },
  lastly: {
    word: "lastly",
    pos: "adverb",
    primaryPos: "adverb",
    phonetic: "/ˈlɑːstli/",
    meaning: "最后；最后一点",
    primaryMeaningZh: "最后；最后一点",
    definition: "最后；最后一点",
    example: "Lastly, please check your answers carefully.",
    exampleCn: "最后，请仔细检查你的答案。",
    forms: [],
    wordFamily: [{ word: "last", meaning: "最后的；持续" }]
  }
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value == null ? "" : value).trim();
}

function uniqueText(values) {
  const out = [];
  const seen = new Set();
  for (const value of asArray(values)) {
    const t = text(value);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function recomputeTotals(items) {
  let wordCount = 0;
  let phraseCount = 0;
  let activeCount = 0;
  let referenceCount = 0;
  let multiSenseCount = 0;
  for (const item of items) {
    if ((item?.entryType || "word") === "phrase") phraseCount += 1;
    else wordCount += 1;
    if (item?.studyMode === "reference") referenceCount += 1;
    else activeCount += 1;
    if (asArray(item?.senses).length > 1) multiSenseCount += 1;
  }
  return {
    count: items.length,
    wordCount,
    phraseCount,
    activeCount,
    referenceCount,
    multiSenseCount
  };
}

function buildEntry(word, master) {
  const key = normalizeReadingGKey(word);
  const id = stableReadingGId("word", key);
  const fallback = FALLBACKS[key] || null;
  const src = master || fallback || {};
  const meaning =
    text(src.primaryMeaningZh || src.meaning || src.meaningZh || src.definition) ||
    text(fallback?.meaning) ||
    word;
  const pos = text(src.primaryPos || src.pos) || text(fallback?.pos) || "word";

  return {
    id,
    wordId: id,
    sourceWordId: text(master?.wordId || master?.id),
    word,
    normalizedKey: key,
    entryType: "word",
    isPhrase: false,
    studyMode: "active",
    phonetic: text(src.phonetic || fallback?.phonetic),
    pos,
    primaryPos: pos,
    meaning,
    meaningZh: meaning,
    primaryMeaningZh: meaning,
    definition: text(src.definition) || meaning,
    example: text(src.example || fallback?.example),
    exampleCn: text(src.exampleCn || src.exampleZh || fallback?.exampleCn),
    collocations: asArray(src.collocations).slice(0, 8),
    phraseCollocations: asArray(src.phraseCollocations).slice(0, 8),
    forms: asArray(src.forms?.length ? src.forms : fallback?.forms),
    wordFamily: asArray(src.wordFamily?.length ? src.wordFamily : fallback?.wordFamily),
    senses: asArray(src.senses),
    alternateMeanings: asArray(src.alternateMeanings),
    ieltsUse: asArray(src.ieltsUse).length ? asArray(src.ieltsUse) : ["Reading", "G类补充"],
    topics: uniqueText([
      ...asArray(src.topics).slice(0, 6),
      "G类完整学习计划",
      "全题库补充词"
    ]),
    difficulty: text(src.difficulty) || "中级核心",
    category: text(src.category) || "IELTS G类 · 阅读核心",
    domain: text(src.domain) || "阅读通用",
    layers: ["questionBankActive", "grokFullBankSupplement"],
    primaryLayer: "questionBankActive",
    layerRank: 50,
    sourceFiles: uniqueText([
      ...(master ? ["public/data/words.json"] : []),
      "grok_全题库完整词汇_去中小学基础词_20260803.txt"
    ]),
    qualityFlags: uniqueText([
      master ? "master_lexicon_reused" : "built_without_master",
      "grok_full_bank_true_missing_supplement_v1"
    ]),
    mergedAliases: [],
    mergedEntries: [],
    supplementMeta: {
      version: "grok-full-bank-15-v1",
      reason: "true-absent-after-forms-family-alias-and-simple-abbrev-filter",
      sourceList: "grok_全题库完整词汇_去中小学基础词_20260803"
    }
  };
}

function atomicWrite(filePath, content) {
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, filePath);
}

function main() {
  const apply = process.argv.includes("--apply");
  const vocab = JSON.parse(fs.readFileSync(VOCAB_PATH, "utf8"));
  const master = JSON.parse(fs.readFileSync(MASTER_PATH, "utf8"));
  const masterBy = new Map(
    asArray(master.words).map((w) => [normalizeReadingGKey(w.word), w])
  );
  const existing = new Set(
    asArray(vocab.items).map((it) => normalizeReadingGKey(it.normalizedKey || it.word))
  );

  const added = [];
  const skipped = [];
  for (const word of WORDS) {
    const key = normalizeReadingGKey(word);
    if (existing.has(key)) {
      skipped.push({ word, reason: "already-present" });
      continue;
    }
    const entry = buildEntry(word, masterBy.get(key) || null);
    added.push(entry);
    existing.add(key);
  }

  const nextItems = [...asArray(vocab.items), ...added];
  const totals = recomputeTotals(nextItems);
  const now = new Date().toISOString();
  const date = now.slice(0, 10).replaceAll("-", "");
  const output = {
    ...vocab,
    ...totals,
    items: nextItems,
    grokFullBankSupplement: {
      version: `reading-g-grok-full-bank-15-v1-${date}`,
      updatedAt: now,
      addedCount: added.length,
      words: added.map((e) => e.word),
      skipped
    }
  };

  const content = `${JSON.stringify(output, null, 2)}\n`;
  const report = {
    mode: apply ? "apply" : "dry-run",
    before: vocab.count,
    after: totals.count,
    added: added.map((e) => ({
      word: e.word,
      id: e.id,
      meaning: e.meaning,
      fromMaster: Boolean(e.sourceWordId)
    })),
    skipped,
    totals
  };

  if (!apply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const slug = now.replace(/[-:]/g, "").replace("T", "-").replace(/\.\d{3}Z$/, "Z");
  const backupDir = path.join(BACKUP_DIR, `reading-g-add-15-${slug}`);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(VOCAB_PATH, path.join(backupDir, "reading-g-vocab.json.before"));
  fs.copyFileSync(HEADER_PATH, path.join(backupDir, "GlobalStudyHeader.jsx.before"));

  atomicWrite(VOCAB_PATH, content);

  const cacheVersion = `${date}-grok-full-bank-15-v1`;
  const header = fs.readFileSync(HEADER_PATH, "utf8");
  const updated = header.replace(
    /\/data\/reading-g-vocab\.json\?v=[^"'`\s]+/g,
    `/data/reading-g-vocab.json?v=${cacheVersion}`
  );
  if (updated === header) {
    throw new Error("cache version slot not found in GlobalStudyHeader.jsx");
  }
  atomicWrite(HEADER_PATH, updated);

  console.log(
    JSON.stringify(
      {
        ...report,
        backupDir,
        cacheVersion
      },
      null,
      2
    )
  );
}

main();
