import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vocabPath = path.join(root, "public", "data", "reading-g-vocab.json");
const sourcePath = process.env.LOGIC_SOURCE_XLSX;
const python = process.env.LOGIC_IMPORT_PYTHON || "python";

if (!sourcePath) {
  throw new Error("Set LOGIC_SOURCE_XLSX to the supplied 阅读所有逻辑词.xlsx file.");
}

const extractor = String.raw`
import json, re, sys, zipfile, xml.etree.ElementTree as ET
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(sys.argv[1]) as archive:
  shared_root = ET.fromstring(archive.read('xl/sharedStrings.xml'))
  shared = [''.join(t.text or '' for t in item.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')) for item in shared_root.findall('m:si', ns)]
  sheet = ET.fromstring(archive.read('xl/worksheets/sheet3.xml'))
  rows = []
  for row in sheet.findall('.//m:sheetData/m:row', ns):
    values = []
    for cell in row.findall('m:c', ns):
      value = cell.find('m:v', ns)
      text = '' if value is None else value.text
      if cell.attrib.get('t') == 's' and text:
        text = shared[int(text)]
      elif cell.attrib.get('t') == 'inlineStr':
        text = ''.join(t.text or '' for t in cell.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t'))
      values.append(text)
    rows.append(values)
print(json.dumps(rows[1:], ensure_ascii=False))
`;

const extracted = spawnSync(python, ["-c", extractor, sourcePath], {
  encoding: "utf8",
  env: { ...process.env, PYTHONIOENCODING: "utf-8" }
});
if (extracted.status !== 0) {
  throw new Error(extracted.stderr || "Unable to extract the logic workbook.");
}

const rawRows = JSON.parse(extracted.stdout);
const sourceFile = "阅读所有逻辑词.xlsx";
const sourceWorkbookId = "582696";
const importedAt = "2026-08-12";
const manualCoreRepairs = Object.freeze({
  "as...as": { phonetic: "/æz ... æz/" }
});

function text(value) {
  return String(value ?? "").trim();
}

function normalizedKey(value) {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function posFromMeaning(meaning) {
  const prefixes = [...text(meaning).matchAll(/(?:^|\n)\s*(n|v|adj|adv|prep|conj|pron|det)\./gi)]
    .map((match) => match[1].toLowerCase());
  const map = {
    n: "noun",
    v: "verb",
    adj: "adjective",
    adv: "adverb",
    prep: "preposition",
    conj: "conjunction",
    pron: "pronoun",
    det: "determiner"
  };
  return map[prefixes[0]] || (text(meaning).includes("phrase.") ? "phrase" : "word");
}

function mergeMissingText(entry, field, value) {
  if (!text(entry[field]) && text(value)) entry[field] = text(value);
}

const sourceEntries = new Map();
for (const row of rawRows) {
  const word = text(row[3]);
  const key = normalizedKey(word);
  if (!key) continue;
  const existing = sourceEntries.get(key);
  const source = {
    word,
    category: text(row[1]),
    chapter: text(row[2]),
    phonetic: text(row[4]),
    meaning: text(row[5]),
    example: text(row[6]),
    exampleCn: text(row[7]),
    form: text(row[8]),
    sourceWordId: text(row[11])
  };
  if (existing) {
    existing.categories = unique([...existing.categories, source.category]);
    existing.chapters = unique([...existing.chapters, source.chapter]);
  } else {
    sourceEntries.set(key, { ...source, categories: [source.category], chapters: [source.chapter] });
  }
}

const vocab = JSON.parse(fs.readFileSync(vocabPath, "utf8"));
const priorImport = vocab.logicWorkbookImport;
if (priorImport?.sourceWorkbookId === sourceWorkbookId && !process.argv.includes("--force")) {
  console.log(JSON.stringify(priorImport, null, 2));
  process.exit(0);
}
const byKey = new Map(vocab.items.map((item) => [normalizedKey(item.word), item]));
let taggedExisting = 0;
let promotedReference = 0;
let added = 0;
let filledCoreFields = 0;

for (const [key, source] of sourceEntries) {
  const repair = manualCoreRepairs[key] || {};
  source.phonetic ||= repair.phonetic || "";
  let entry = byKey.get(key);
  if (entry) {
    if (!Array.isArray(entry.layers)) entry.layers = [];
    if (!entry.layers.includes("logic120")) {
      entry.layers.push("logic120");
      taggedExisting += 1;
    }
    if (entry.studyMode === "reference") {
      entry.studyMode = "active";
      promotedReference += 1;
    }
    const before = JSON.stringify([
      entry.phonetic, entry.primaryMeaningZh, entry.meaning, entry.meaningZh,
      entry.definition, entry.example, entry.exampleCn, entry.exampleZh
    ]);
    mergeMissingText(entry, "phonetic", source.phonetic);
    mergeMissingText(entry, "primaryMeaningZh", source.meaning);
    mergeMissingText(entry, "meaning", source.meaning);
    mergeMissingText(entry, "meaningZh", source.meaning);
    mergeMissingText(entry, "definition", source.meaning);
    mergeMissingText(entry, "example", source.example);
    mergeMissingText(entry, "exampleCn", source.exampleCn);
    mergeMissingText(entry, "exampleZh", source.exampleCn);
    if (before !== JSON.stringify([
      entry.phonetic, entry.primaryMeaningZh, entry.meaning, entry.meaningZh,
      entry.definition, entry.example, entry.exampleCn, entry.exampleZh
    ])) filledCoreFields += 1;
  } else {
    const entryType = /\s/.test(source.word) ? "phrase" : "word";
    const pos = posFromMeaning(source.meaning);
    entry = {
      id: `rg_logic_${sourceWorkbookId}_${source.sourceWordId}`,
      word: source.word,
      wordId: source.sourceWordId,
      sourceWordId: source.sourceWordId,
      normalizedKey: key,
      entryType,
      isPhrase: entryType === "phrase",
      phonetic: source.phonetic,
      pos,
      primaryPos: pos,
      primaryMeaningZh: source.meaning,
      meaning: source.meaning,
      meaningZh: source.meaning,
      definition: source.meaning,
      example: source.example,
      exampleCn: source.exampleCn,
      exampleZh: source.exampleCn,
      forms: [],
      wordFamily: [],
      synonyms: [],
      difficulty: "阅读逻辑核心",
      category: "IELTS G类 · 阅读逻辑转换",
      domain: "阅读逻辑",
      topics: [],
      ieltsUse: ["阅读逻辑转换"],
      layers: ["logic120"],
      primaryLayer: "logic120",
      layerRank: 3,
      studyMode: "active",
      sourceFiles: [sourceFile],
      qualityFlags: ["idictation_logic_workbook_import_v1"],
      sourceType: "idictation-logic-workbook",
      source: "阅读所有逻辑词",
      sourceOrProvenance: "爱听写：阅读所有逻辑词（词书 582696）"
    };
    vocab.items.push(entry);
    byKey.set(key, entry);
    added += 1;
  }

  entry.excelSourceSheets = unique([...(entry.excelSourceSheets || []), "全部单词"]);
  entry.excelSourceTags = unique([...(entry.excelSourceTags || []), ...source.chapters]);
  entry.topics = unique([...(entry.topics || []), ...source.chapters]);
  entry.sourceFiles = unique([...(entry.sourceFiles || []), sourceFile]);
  entry.qualityFlags = unique([...(entry.qualityFlags || []), "idictation_logic_workbook_import_v1"]);
  entry.logicWorkbookSource = {
    workbookId: sourceWorkbookId,
    sourceWordId: source.sourceWordId,
    categories: source.categories,
    chapters: source.chapters,
    importedAt
  };
}

const logicRows = vocab.items.filter((item) => item.layers?.includes("logic120"));
const importSummary = {
  version: 1,
  importedAt,
  sourceFile,
  sourceWorkbookId,
  sourceRowCount: rawRows.length,
  uniqueSourceWordCount: sourceEntries.size,
  taggedExisting,
  promotedReference,
  added,
  filledCoreFields,
  finalLogicLayerCount: logicRows.length,
  policy: "保留既有词条与稳定 ID；仅以 Excel 补齐缺失核心字段，不覆盖既有完整内容。"
};
vocab.logicWorkbookImport = priorImport
  ? {
      ...priorImport,
      finalLogicLayerCount: logicRows.length,
      completionRepairCount: Number(priorImport.completionRepairCount || 0) + filledCoreFields
    }
  : importSummary;

fs.writeFileSync(vocabPath, `${JSON.stringify(vocab, null, 2)}\n`, "utf8");
console.log(JSON.stringify(vocab.logicWorkbookImport, null, 2));
