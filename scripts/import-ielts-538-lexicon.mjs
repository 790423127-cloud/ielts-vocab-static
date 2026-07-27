import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyIelts538EditorialContent } from "../app/lib/ielts-538/editorial-content.mjs";
import { buildIelts538DifficultyIndex } from "../app/lib/ielts-538/replacement-sections.mjs";
import {
  applyIelts538SynonymDetails,
  buildIelts538SynonymDetailIndex
} from "../app/lib/ielts-538/synonym-details.mjs";

const EXPECTED_GROUP_COUNTS = new Map([
  ["1:1", 20],
  ["2:1", 50],
  ["2:2", 50],
  ["3:1", 50],
  ["3:2", 50],
  ["3:3", 50],
  ["3:4", 50],
  ["3:5", 56]
]);

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function normalizeWordKey(word) {
  return String(word || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ");
}

function stableId(word) {
  const digest = createHash("sha256")
    .update(normalizeWordKey(word), "utf8")
    .digest("hex")
    .slice(0, 16);
  return `ielts538_${digest}`;
}

function splitMeaning(rawMeaning, word) {
  const sourceMeaning = String(rawMeaning || "").trim();
  const match = sourceMeaning.match(/^(adj|adv|pron|conj|prep|vi|vt|n|v|a|ad)\.\s*/i);
  const rawPos = match?.[1]?.toLowerCase() || "";
  const posMap = {
    a: "adjective",
    adj: "adjective",
    ad: "adverb",
    adv: "adverb",
    n: "noun",
    v: "verb",
    vi: "verb",
    vt: "verb",
    pron: "pronoun",
    conj: "conjunction",
    prep: "preposition"
  };
  return {
    pos: posMap[rawPos] || (String(word).includes(" ") ? "phrase" : ""),
    meaning: match ? sourceMeaning.slice(match[0].length).trim() : sourceMeaning,
    sourceMeaning
  };
}

function validateSource(source) {
  const rows = Array.isArray(source?.rows) ? source.rows : [];
  if (rows.length !== 376) {
    throw new Error(`源数据应为 376 条，实际为 ${rows.length} 条。`);
  }

  const seen = new Set();
  const groupCounts = new Map();
  for (const [index, row] of rows.entries()) {
    const wordKey = normalizeWordKey(row?.word);
    if (!wordKey) throw new Error(`第 ${index + 1} 条缺少词头。`);
    if (!String(row?.meaning || "").trim()) {
      throw new Error(`第 ${index + 1} 条 ${row.word} 缺少释义。`);
    }
    if (seen.has(wordKey)) throw new Error(`发现重复词头：${row.word}`);
    seen.add(wordKey);

    const groupKey = `${Number(row.category)}:${Number(row.group)}`;
    groupCounts.set(groupKey, (groupCounts.get(groupKey) || 0) + 1);
  }

  for (const [groupKey, expected] of EXPECTED_GROUP_COUNTS) {
    const actual = groupCounts.get(groupKey) || 0;
    if (actual !== expected) {
      throw new Error(`分组 ${groupKey} 应为 ${expected} 条，实际为 ${actual} 条。`);
    }
  }
  if (groupCounts.size !== EXPECTED_GROUP_COUNTS.size) {
    throw new Error(`源数据出现未预期分组，实际分组数为 ${groupCounts.size}。`);
  }
  return rows;
}

function buildLexicon(source) {
  const rows = validateSource(source);
  const ids = new Set();
  const words = rows.map((row) => {
    const word = String(row.word).trim();
    const id = stableId(word);
    if (ids.has(id)) throw new Error(`稳定 ID 冲突：${word}`);
    ids.add(id);

    const categoryNumber = Number(row.category);
    const groupNumber = Number(row.group);
    const meaning = splitMeaning(row.meaning, word);
    const synonyms = Array.isArray(row.synonyms)
      ? row.synonyms.map((item) => String(item || "").trim()).filter(Boolean)
      : [];

    return {
      id,
      wordId: id,
      word,
      entryType: word.includes(" ") ? "phrase" : "word",
      phonetic: String(row.phonetic || "").trim(),
      pos: meaning.pos,
      meaning: meaning.meaning,
      sourceMeaning: meaning.sourceMeaning,
      definition: "",
      example: "",
      exampleCn: "",
      synonyms,
      collocations: [],
      phraseCollocations: [],
      ieltsUse: ["Reading", "538考点"],
      topics: [
        "538考点",
        `第${categoryNumber}类考点词`,
        `第${groupNumber}组`
      ],
      difficulty: "考点词",
      category: `第${categoryNumber}类考点词`,
      sourceCategory: categoryNumber,
      sourceGroup: groupNumber,
      sourceGroupIndex: Number(row.groupIndex),
      sourceUrl: String(row.sourceUrl || source?.source || "").trim(),
      sourceType: "guixue-ielts-538",
      forms: [],
      wordFamily: []
    };
  });

  const masterLexicon = JSON.parse(
    readFileSync(resolve(process.cwd(), "public/data/words.json"), "utf8")
  );
  const difficultyIndex = buildIelts538DifficultyIndex(masterLexicon?.words);
  const synonymDetailIndex = buildIelts538SynonymDetailIndex(masterLexicon?.words);
  const editorialWords = applyIelts538EditorialContent(
    words,
    undefined,
    undefined,
    difficultyIndex
  );

  return {
    version: "ielts-538-v1-376",
    count: words.length,
    generatedAt: String(source?.downloadedAt || ""),
    source: String(source?.source || ""),
    sourceTitle: "雅思阅读538考点词真经",
    note: "独立词库；保留原网页词头、音标、中文释义和同替词，不改动主词库。",
    groupCounts: Object.fromEntries(EXPECTED_GROUP_COUNTS),
    words: applyIelts538SynonymDetails(editorialWords, synonymDetailIndex)
  };
}

const sourceArg = readArg("--source");
const outputArg = readArg("--output") || "public/data/ielts-538-words.json";
const force = process.argv.includes("--force");

if (!sourceArg) {
  throw new Error("缺少 --source <下载源 JSON 路径>。");
}

const sourcePath = resolve(process.cwd(), sourceArg);
const outputPath = resolve(process.cwd(), outputArg);
const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const lexicon = buildLexicon(source);
const nextContent = `${JSON.stringify(lexicon, null, 2)}\n`;

if (existsSync(outputPath)) {
  const currentContent = readFileSync(outputPath, "utf8");
  if (currentContent === nextContent) {
    console.log(`538 考点词库无需更新：${outputPath}`);
    process.exit(0);
  }
  if (!force) {
    throw new Error(`输出文件已存在且内容不同：${outputPath}。确认后使用 --force 覆盖。`);
  }
}

writeFileSync(outputPath, nextContent, "utf8");
console.log(`已生成 538 考点独立词库：${lexicon.count} 条 -> ${outputPath}`);

export { buildLexicon, normalizeWordKey, stableId };
