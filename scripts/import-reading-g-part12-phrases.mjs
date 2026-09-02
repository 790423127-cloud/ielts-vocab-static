/**
 * Import the reviewed G4-G21 Part/Passage/Section 1-2 phrase set.
 *
 * Dry run (default):
 *   node scripts/import-reading-g-part12-phrases.mjs
 * Apply with one targeted backup:
 *   node scripts/import-reading-g-part12-phrases.mjs --apply
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeReadingGKey,
  stableReadingGId
} from "../app/lib/reading-g-vocab/normalize.mjs";
import {
  arpabetToIpa,
  isInvalidIpa,
  loadCmuDictionary
} from "./lib/gt-ipa-validate.mjs";
import {
  READING_G_PART12_EDITORIAL_KEYS,
  READING_G_PART12_EXISTING_EDITORIAL,
  READING_G_PART12_PHRASE_EDITORIAL
} from "./data/reading-g-part12-phrase-editorial.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VOCAB_PATH = path.join(ROOT, "public", "data", "reading-g-vocab.json");
const PHRASES_PATH = path.join(ROOT, "public", "data", "phrases.json");
const WORDS_PATH = path.join(ROOT, "public", "data", "words.json");
const RETIREMENTS_PATH = path.join(ROOT, "public", "data", "reading-g-retirements.json");
const SNAPSHOT_PATH = path.join(ROOT, "scripts", "data", "reading-g-part12-phrases-150.json");
const BACKUP_DIR = path.join(ROOT, "backups", "reading-g-part12-phrases-150");
const SOURCE_BASENAME = "G类阅读4-21_Part1-2_考试导向优化版_150短语.txt";
const IMPORT_VERSION = "reading-g-part12-phrases-150-v1";
const IMPORT_DATE = "2026-08-14";
const LAYER_ID = "gtPart12Phrases150";
const QUALITY_FLAG = "reading_g_part12_phrase_150_v1";

const VARIANT_TARGETS = new Map([
  ["first-come first-served", "first come first served"],
  ["eligible for", "be eligible for"],
  ["likely to", "be likely to"],
  ["required to", "be required to"],
  ["allowed to", "be allowed to"],
  ["involved in", "be involved in"],
  ["sign up for", "sign up"]
]);

function text(value) {
  return String(value == null ? "" : value).trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  const seen = new Set();
  return values.flatMap((value) => {
    const normalized = text(value);
    const key = normalizeReadingGKey(normalized);
    if (!normalized || !key || seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  });
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function atomicWrite(finalPath, content) {
  const tempPath = `${finalPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, content, "utf8");
  fs.renameSync(tempPath, finalPath);
}

function sourceArg() {
  const index = process.argv.indexOf("--source");
  if (index >= 0 && process.argv[index + 1]) return path.resolve(process.argv[index + 1]);
  return "";
}

function downloadsSource() {
  const downloads = path.join(os.homedir(), "Downloads");
  const direct = path.join(downloads, SOURCE_BASENAME);
  if (fs.existsSync(direct)) return direct;
  if (!fs.existsSync(downloads)) return "";
  const candidate = fs.readdirSync(downloads).find((name) => (
    name.startsWith("G") && name.includes("4-21_Part1-2_") && name.endsWith("150短语.txt")
  ));
  return candidate ? path.join(downloads, candidate) : "";
}

function parseTextSource(filePath) {
  let tier = "";
  const rows = [];
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const line = raw.trim();
    if (line.startsWith("【")) {
      if (line.includes("S级")) tier = "S";
      else if (line.includes("A级")) tier = "A";
      else if (line.includes("B级")) tier = "B";
      continue;
    }
    if (!line.includes("｜")) continue;
    const parts = line.split("｜").map((part) => part.trim()).filter(Boolean);
    if (parts.length < 4) continue;
    const phrase = parts[0];
    const meaningZh = parts[1];
    const examSource = parts.at(-1);
    const examTag = parts.slice(2, -1).join("｜");
    rows.push({
      tier,
      phrase,
      normalizedKey: normalizeReadingGKey(phrase),
      meaningZh,
      examTag,
      examSource
    });
  }
  return rows;
}

function loadSourceRows() {
  const explicit = sourceArg();
  if (explicit) {
    if (!fs.existsSync(explicit)) throw new Error(`指定源文件不存在：${explicit}`);
    return { rows: parseTextSource(explicit), sourcePath: explicit, sourceType: "text" };
  }
  if (fs.existsSync(SNAPSHOT_PATH)) {
    const payload = readJson(SNAPSHOT_PATH);
    return {
      rows: list(payload.rows),
      sourcePath: SNAPSHOT_PATH,
      sourceType: "snapshot"
    };
  }
  const sourcePath = downloadsSource();
  if (!sourcePath) throw new Error(`找不到 ${SOURCE_BASENAME}`);
  return { rows: parseTextSource(sourcePath), sourcePath, sourceType: "text" };
}

function validateSourceRows(rows) {
  const errors = [];
  const tierCounts = Object.fromEntries(["S", "A", "B"].map((tier) => [
    tier,
    rows.filter((row) => row.tier === tier).length
  ]));
  const keys = rows.map((row) => normalizeReadingGKey(row.normalizedKey || row.phrase));
  if (rows.length !== 150) errors.push(`源条目数应为150，实际为${rows.length}`);
  if (tierCounts.S !== 75 || tierCounts.A !== 40 || tierCounts.B !== 35) {
    errors.push(`分级数量异常：${JSON.stringify(tierCounts)}`);
  }
  if (new Set(keys).size !== rows.length) errors.push("源文件内部存在重复词组");
  for (const row of rows) {
    if (!row.phrase || !row.meaningZh || !row.examTag || !row.examSource || !row.tier) {
      errors.push(`源条目字段缺失：${JSON.stringify(row)}`);
    }
  }
  const sourceKeySet = new Set(keys);
  const editorialMissingFromSource = READING_G_PART12_EDITORIAL_KEYS.filter((key) => !sourceKeySet.has(key));
  if (READING_G_PART12_EDITORIAL_KEYS.length !== 101 || editorialMissingFromSource.length) {
    errors.push(`人工内容表与源文件不一致：${editorialMissingFromSource.join(", ")}`);
  }
  const existingEditorialKeys = Object.keys(READING_G_PART12_EXISTING_EDITORIAL);
  const existingEditorialMissingFromSource = existingEditorialKeys.filter((key) => !sourceKeySet.has(key));
  if (existingEditorialKeys.length !== 49 || existingEditorialMissingFromSource.length) {
    errors.push(`复用词条人工内容表与源文件不一致：${existingEditorialMissingFromSource.join(", ")}`);
  }
  if (errors.length) throw new Error(errors.join("；"));
  return tierCounts;
}

function mergeGloss(existingValue, sourceValue) {
  if (text(existingValue) === text(sourceValue)) return text(existingValue);
  const pieces = [];
  const seen = [];
  for (const raw of [existingValue, sourceValue]) {
    for (const part of text(raw).split(/[；;]/u).map((value) => value.trim()).filter(Boolean)) {
      const key = part.toLowerCase().replace(/[\s，,。.!！?？、…\/（）()]+/gu, "");
      if (!key) continue;
      const duplicate = seen.some((prior) => prior === key || prior.includes(key) || key.includes(prior));
      if (duplicate) continue;
      seen.push(key);
      pieces.push(part);
    }
  }
  return pieces.join("；");
}

function addSourceMetadata(entry, row, { promoted = false, restored = false } = {}) {
  const next = structuredClone(entry);
  next.layers = unique([...list(next.layers), LAYER_ID]);
  next.sourceFiles = unique([...list(next.sourceFiles), SOURCE_BASENAME, "scripts/data/reading-g-part12-phrases-150.json"]);
  next.topics = unique([
    ...list(next.topics),
    "G类阅读",
    "G4-G21 Part1-2考试短语",
    `${row.tier}级考试短语`,
    row.examTag
  ]);
  next.qualityFlags = unique([...list(next.qualityFlags), QUALITY_FLAG]);
  next.acceptedAnswers = unique([next.word, ...list(next.acceptedAnswers), row.phrase]);
  next.part12PhraseTier = row.tier;
  next.part12ExamTag = row.examTag;
  next.part12ExamSource = row.examSource;
  next.part12SourcePhrase = row.phrase;
  next.part12PhraseImportVersion = IMPORT_VERSION;
  next.part12PhraseReviewedAt = IMPORT_DATE;
  if (promoted) {
    next.studyMode = "active";
    next.layers = next.layers.filter((layer) => layer !== "reference701");
    if (next.primaryLayer === "reference701") next.primaryLayer = LAYER_ID;
    next.layerRank = Math.min(Number(next.layerRank) || 99, 5);
    next.promotedFromReferenceBy = IMPORT_VERSION;
  }
  if (restored) {
    next.restoredFromRetirementBy = IMPORT_VERSION;
    next.restoredFromRetirementAt = IMPORT_DATE;
  }
  return next;
}

function phraseTokenKeys(phrase) {
  return normalizeReadingGKey(phrase)
    .replace(/-/gu, " ")
    .match(/[a-z]+(?:'[a-z]+)?/gu) || [];
}

function cleanPhoneticBody(value) {
  const phonetic = text(value);
  return phonetic.replace(/^\//u, "").replace(/\/$/u, "").trim();
}

async function buildPhrasePhonetic(phrase, localPhrase, lexiconByKey, cmu) {
  const localPhonetic = text(localPhrase?.phonetic);
  if (localPhonetic && !isInvalidIpa(localPhonetic)) return localPhonetic;
  const bodies = [];
  for (const token of phraseTokenKeys(phrase)) {
    const arpabet = cmu[token] || cmu[token.toUpperCase()] || "";
    const fromCmu = arpabetToIpa(arpabet);
    if (fromCmu && !isInvalidIpa(fromCmu)) {
      bodies.push(cleanPhoneticBody(fromCmu));
      continue;
    }
    const fromLexicon = text(lexiconByKey.get(token)?.phonetic);
    if (fromLexicon && !isInvalidIpa(fromLexicon)) {
      bodies.push(cleanPhoneticBody(fromLexicon));
      continue;
    }
    throw new Error(`无法为词组“${phrase}”确认组成词“${token}”的音标`);
  }
  if (!bodies.length) throw new Error(`无法为词组“${phrase}”生成音标`);
  return `/${bodies.join(" ")}/`;
}

function hasCompleteReusablePhrase(entry) {
  return Boolean(
    text(entry?.phonetic) &&
    text(entry?.meaning || entry?.meaningZh) &&
    text(entry?.example) &&
    text(entry?.exampleCn || entry?.exampleZh)
  );
}

function domainFor(row) {
  const blob = `${row.examTag} ${row.meaningZh}`;
  if (/工作|员工|雇|职位|工龄|休假|绩效|人力|班次/u.test(blob)) return "工作";
  if (/交通|出行|车辆|公交|行李/u.test(blob)) return "交通";
  if (/学校|入学|学期|课程|学生|教育/u.test(blob)) return "教育";
  if (/费用|退款|罚款|差价|计酬|票价/u.test(blob)) return "消费与规则";
  if (/健康|安全|风险|护理/u.test(blob)) return "健康与安全";
  return "阅读通用";
}

async function buildNewEntry(row, localPhrase, lexiconByKey, cmu, retirementKeys) {
  const key = normalizeReadingGKey(row.normalizedKey || row.phrase);
  const editorial = READING_G_PART12_PHRASE_EDITORIAL[key];
  if (!editorial) throw new Error(`新增词组缺少逐条人工内容：${row.phrase}`);
  const reusable = hasCompleteReusablePhrase(localPhrase);
  const phonetic = await buildPhrasePhonetic(row.phrase, localPhrase, lexiconByKey, cmu);
  const example = reusable ? text(localPhrase.example) : text(editorial.example);
  const exampleCn = reusable ? text(localPhrase.exampleCn || localPhrase.exampleZh) : text(editorial.exampleCn);
  const pos = text(editorial.pos || localPhrase?.pos || "fixed expression");
  const sourceFiles = unique([
    SOURCE_BASENAME,
    "scripts/data/reading-g-part12-phrases-150.json",
    ...(localPhrase ? ["public/data/phrases.json"] : [])
  ]);
  const qualityFlags = unique([
    QUALITY_FLAG,
    "manual_editorial_phrase_content_v1",
    ...(localPhrase ? ["local_phrase_lexicon_reused"] : [])
  ]);
  const senseId = `${stableReadingGId("phrase", key)}_phrase_01`;
  const entry = {
    id: stableReadingGId("phrase", key),
    entryType: "phrase",
    word: row.phrase,
    normalizedKey: key,
    phonetic,
    primaryPos: pos,
    pos,
    primaryMeaningZh: row.meaningZh,
    meaning: row.meaningZh,
    meaningZh: row.meaningZh,
    definition: text(localPhrase?.definition) || row.meaningZh,
    example,
    exampleCn,
    exampleZh: exampleCn,
    senses: [{
      senseId,
      pos,
      meaningZh: row.meaningZh,
      definition: text(localPhrase?.definition) || row.meaningZh,
      example,
      exampleZh: exampleCn,
      sourceFiles
    }],
    collocations: list(localPhrase?.collocations).map((item) => structuredClone(item)),
    phraseCollocations: list(localPhrase?.phraseCollocations).map((item) => structuredClone(item)),
    forms: [],
    wordFamily: [],
    synonyms: list(localPhrase?.synonyms).map(text).filter(Boolean),
    synonymDetails: list(localPhrase?.synonymDetails).map((item) => structuredClone(item)),
    topics: unique(["G类阅读", "G4-G21 Part1-2考试短语", `${row.tier}级考试短语`, row.examTag]),
    ieltsUse: unique(["Reading", "IELTS G类"]),
    difficulty: row.tier === "S" ? "基础至中级" : "中级核心",
    category: "IELTS G类 · 阅读核心",
    domain: domainFor(row),
    layers: [LAYER_ID],
    primaryLayer: LAYER_ID,
    layerRank: row.tier === "S" ? 4 : 5,
    phraseStudyStage: row.tier === "S" ? 1 : 2,
    studyMode: "active",
    sourceFiles,
    qualityFlags,
    acceptedAnswers: unique([row.phrase, ...list(localPhrase?.acceptedAnswers)]),
    meaningDetailZh: editorial.detail,
    meaningDetailSource: "manual-editorial-review",
    meaningDetailReviewedAt: IMPORT_DATE,
    meaningCoveragePending: false,
    meaningCoverageReviewed: true,
    meaningCoverageAuditStatus: "reviewed",
    meaningCoverageReviewSource: "manual-editorial-review",
    meaningCoverageReviewedAt: IMPORT_DATE,
    formsReviewed: true,
    formsReviewSource: "phrase-not-applicable",
    wordFamilyReviewed: true,
    wordFamilyReviewSource: "phrase-not-applicable",
    synonymsReviewed: localPhrase?.synonymsReviewed === true,
    audio: text(localPhrase?.audio),
    exampleAudio: text(localPhrase?.exampleAudio),
    part12PhraseTier: row.tier,
    part12ExamTag: row.examTag,
    part12ExamSource: row.examSource,
    part12SourcePhrase: row.phrase,
    part12PhraseImportVersion: IMPORT_VERSION,
    part12PhraseReviewedAt: IMPORT_DATE,
    ...(retirementKeys.has(`phrase::${key}`) ? {
      restoredFromRetirementBy: IMPORT_VERSION,
      restoredFromRetirementAt: IMPORT_DATE
    } : {})
  };
  return { entry, reusable };
}

function recomputeTotals(vocab) {
  const items = list(vocab.items);
  const totals = {
    count: items.length,
    wordCount: items.filter((item) => (item.entryType || "word") !== "phrase").length,
    phraseCount: items.filter((item) => item.entryType === "phrase").length,
    activeCount: items.filter((item) => item.studyMode !== "reference").length,
    referenceCount: items.filter((item) => item.studyMode === "reference").length,
    multiSenseCount: items.filter((item) => list(item.senses).length > 1).length
  };
  Object.assign(vocab, totals);
  return totals;
}

function validateResult(vocab, rows, before, stats) {
  const ids = new Set();
  const mergeKeys = new Set();
  for (const item of vocab.items) {
    if (!item.id || ids.has(item.id)) throw new Error(`导入后出现空ID或重复ID：${item.id || "(empty)"}`);
    ids.add(item.id);
    const key = `${item.entryType || "word"}::${normalizeReadingGKey(item.normalizedKey || item.word)}`;
    if (mergeKeys.has(key)) throw new Error(`导入后出现重复词条：${key}`);
    mergeKeys.add(key);
  }
  const byKey = new Map(vocab.items.map((item) => [
    `${item.entryType || "word"}::${normalizeReadingGKey(item.normalizedKey || item.word)}`,
    item
  ]));
  const represented = [];
  for (const row of rows) {
    const key = normalizeReadingGKey(row.phrase);
    const targetKey = VARIANT_TARGETS.get(key) || key;
    const item = byKey.get(`phrase::${targetKey}`);
    if (!item) throw new Error(`源词组未被表示：${row.phrase}`);
    if (!list(item.layers).includes(LAYER_ID)) throw new Error(`源词组未进入专属层：${row.phrase}`);
    if (!list(item.acceptedAnswers).some((answer) => normalizeReadingGKey(answer) === key)) {
      throw new Error(`源词组变体未保留：${row.phrase}`);
    }
    represented.push(item);
  }
  const uniqueRepresented = new Set(represented.map((item) => item.id));
  if (uniqueRepresented.size !== 150) {
    throw new Error(`专属层应表示150张唯一卡，实际为${uniqueRepresented.size}`);
  }
  const layerItems = vocab.items.filter((item) => list(item.layers).includes(LAYER_ID));
  if (layerItems.length !== 150) throw new Error(`专属层词条数应为150，实际为${layerItems.length}`);
  const newItems = layerItems.filter((item) => list(item.qualityFlags).includes("manual_editorial_phrase_content_v1"));
  if (newItems.length !== 101) throw new Error(`新增人工词组应为101，实际为${newItems.length}`);
  for (const item of newItems) {
    if (!text(item.phonetic) || isInvalidIpa(item.phonetic)) throw new Error(`新增词组音标无效：${item.word}`);
    if (!text(item.primaryMeaningZh) || !text(item.primaryPos)) throw new Error(`新增词组主资料不完整：${item.word}`);
    if (!text(item.example) || !text(item.exampleCn)) throw new Error(`新增词组例句不完整：${item.word}`);
    if ((text(item.meaningDetailZh).match(/[\u3400-\u9fff]/gu) || []).length < 12) {
      throw new Error(`新增词组详解不足：${item.word}`);
    }
    if (/^(?:在当前例句中|当前例句中|在本句中)/u.test(text(item.meaningDetailZh))) {
      throw new Error(`新增词组使用了例句复述式详解：${item.word}`);
    }
  }
  const totals = recomputeTotals(vocab);
  if (totals.count !== before.count + stats.created) {
    throw new Error(`总数增量异常：${before.count} + ${stats.created} != ${totals.count}`);
  }
  if (totals.phraseCount !== before.phraseCount + stats.created) {
    throw new Error(`词组数增量异常：${before.phraseCount} + ${stats.created} != ${totals.phraseCount}`);
  }
  return totals;
}

async function buildImport(vocab, rows) {
  const phrasePayload = readJson(PHRASES_PATH);
  const masterPayload = readJson(WORDS_PATH);
  const retirementPayload = readJson(RETIREMENTS_PATH);
  const localPhraseByKey = new Map(list(phrasePayload.phrases).map((entry) => [
    normalizeReadingGKey(entry.word || entry.phrase || entry.answer),
    entry
  ]));
  const lexiconByKey = new Map([
    ...list(masterPayload.words),
    ...list(vocab.items).filter((item) => (item.entryType || "word") === "word")
  ].map((entry) => [normalizeReadingGKey(entry.word), entry]));
  const retirementKeys = new Set(list(retirementPayload.entries).map((entry) => text(entry.key)));
  const cmu = await loadCmuDictionary();
  const byKey = new Map(vocab.items.map((entry, index) => [
    `${entry.entryType || "word"}::${normalizeReadingGKey(entry.normalizedKey || entry.word)}`,
    { entry, index }
  ]));
  const stats = {
    sourceRows: rows.length,
    exactExisting: 0,
    variantMerged: 0,
    alreadyImported: 0,
    created: 0,
    promotedReference: 0,
    localPhraseReused: 0,
    restoredRetired: 0,
    changedExisting: 0,
    changedExistingWords: []
  };

  for (const row of rows) {
    const sourceKey = normalizeReadingGKey(row.phrase);
    const exact = byKey.get(`phrase::${sourceKey}`);
    const variantTarget = VARIANT_TARGETS.get(sourceKey);
    const variant = variantTarget ? byKey.get(`phrase::${variantTarget}`) : null;
    const found = exact || variant;
    if (found) {
      const wasImported = list(found.entry.qualityFlags).includes(QUALITY_FLAG) &&
        normalizeReadingGKey(found.entry.part12SourcePhrase) === sourceKey;
      if (wasImported) stats.alreadyImported += 1;
      else if (exact) stats.exactExisting += 1;
      else stats.variantMerged += 1;
      const before = JSON.stringify(found.entry);
      const promoted = found.entry.studyMode === "reference";
      let next = addSourceMetadata(found.entry, row, { promoted });
      const editorial = READING_G_PART12_EXISTING_EDITORIAL[sourceKey]
        || READING_G_PART12_PHRASE_EDITORIAL[sourceKey];
      if (!editorial) throw new Error(`复用词组缺少人工用法说明：${row.phrase}`);
      const importerManagedEditorial = wasImported
        && list(next.qualityFlags).includes("manual_editorial_phrase_content_v1")
        && !list(next.qualityFlags).includes("local_phrase_lexicon_reused");
      if (importerManagedEditorial) {
        next.example = text(editorial.example);
        next.exampleCn = text(editorial.exampleCn);
        next.exampleZh = text(editorial.exampleCn);
        next.senses = list(next.senses).map((sense, index) => index === 0
          ? {
              ...sense,
              example: text(editorial.example),
              exampleZh: text(editorial.exampleCn)
            }
          : sense);
      }
      const currentPos = text(next.primaryPos || next.pos);
      if (!currentPos || /^(?:phrase|connector\/expression)$/iu.test(currentPos)) {
        next.primaryPos = editorial.pos;
        next.pos = editorial.pos;
      }
      if (!text(next.phonetic)) {
        const localPhrase = localPhraseByKey.get(normalizeReadingGKey(next.word))
          || localPhraseByKey.get(sourceKey)
          || null;
        next.phonetic = await buildPhrasePhonetic(next.word, localPhrase, lexiconByKey, cmu);
        next.phoneticSource = localPhrase?.phonetic
          ? "local-phrase-lexicon"
          : "cmu-component-composition";
      }
      if (!text(next.meaningDetailZh) || /^(?:在当前例句中|当前例句中|在本句中)/u.test(text(next.meaningDetailZh))) {
        next.meaningDetailZh = editorial.detail;
        next.meaningDetailSource = "manual-editorial-review";
        next.meaningDetailReviewedAt = IMPORT_DATE;
      }
      const mergedMeaning = mergeGloss(
        next.primaryMeaningZh || next.meaningZh || next.meaning,
        row.meaningZh
      );
      next.primaryMeaningZh = mergedMeaning;
      next.meaning = mergedMeaning;
      next.meaningZh = mergedMeaning;
      if (!wasImported) next.updatedAt = next.updatedAt || IMPORT_DATE;
      vocab.items[found.index] = next;
      byKey.set(`phrase::${normalizeReadingGKey(next.word)}`, { entry: next, index: found.index });
      if (promoted) stats.promotedReference += 1;
      if (JSON.stringify(next) !== before) {
        stats.changedExisting += 1;
        stats.changedExistingWords.push(next.word);
      }
      continue;
    }

    const localPhrase = localPhraseByKey.get(sourceKey) || null;
    const { entry, reusable } = await buildNewEntry(
      row,
      localPhrase,
      lexiconByKey,
      cmu,
      retirementKeys
    );
    const index = vocab.items.length;
    vocab.items.push(entry);
    byKey.set(`phrase::${sourceKey}`, { entry, index });
    stats.created += 1;
    if (reusable) stats.localPhraseReused += 1;
    if (entry.restoredFromRetirementBy) stats.restoredRetired += 1;
  }
  return stats;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { rows, sourcePath, sourceType } = loadSourceRows();
  const tierCounts = validateSourceRows(rows);
  const originalRaw = fs.readFileSync(VOCAB_PATH, "utf8");
  const originalHash = sha256(originalRaw);
  const vocab = JSON.parse(originalRaw);
  const hadImportBefore = vocab.part12PhraseImport?.version === IMPORT_VERSION;
  const before = recomputeTotals(structuredClone(vocab));
  const stats = await buildImport(vocab, rows);
  const totals = validateResult(vocab, rows, before, stats);
  vocab.layerStats = {
    ...(vocab.layerStats || {}),
    [LAYER_ID]: {
      name: "G4-G21 Part1-2考试短语150",
      rawCount: 150,
      uniqueKeysInLayer: 150,
      skippedEmpty: 0,
      mode: "active",
      rank: 4,
      primaryNewCount: 101,
      filterCount: 150,
      tierCounts
    }
  };
  vocab.part12PhraseImport = {
    version: IMPORT_VERSION,
    source: SOURCE_BASENAME,
    importedAt: IMPORT_DATE,
    sourceCount: 150,
    strictExistingCount: 42,
    variantMergeCount: 7,
    createdCount: 101,
    activePromotedCount: 1,
    restoredRetirementCount: 1,
    tierCounts,
    paidAiCalls: 0,
    policy: "Preserve existing IDs and progress; merge exact/format/grammar variants; S new cards enter stage 1, A/B new cards enter stage 2."
  };
  vocab.updatedAt = `${IMPORT_DATE}T00:00:00.000Z`;

  const nextRaw = `${JSON.stringify(vocab)}\n`;
  const report = {
    mode: apply ? "apply" : "dry-run",
    sourcePath,
    sourceType,
    sourceHash: sourceType === "text" ? sha256(fs.readFileSync(sourcePath)) : "snapshot",
    input: { count: rows.length, tierCounts },
    before,
    after: totals,
    stats,
    expectedImport: { strictExisting: 42, variants: 7, created: 101, represented: 150 },
    paidAiCalls: 0,
    backupPath: "",
    outputHash: sha256(nextRaw)
  };

  if (apply) {
    const currentRaw = fs.readFileSync(VOCAB_PATH, "utf8");
    if (sha256(currentRaw) !== originalHash) {
      throw new Error("正式G词库在导入期间发生变化，已安全中止，未写入任何数据");
    }
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const existingBackups = fs.readdirSync(BACKUP_DIR)
      .filter((name) => /^reading-g-vocab-before-.+\.json$/u.test(name))
      .sort();
    const canReuseImportBackup = hadImportBefore && existingBackups.length > 0;
    const backupPath = canReuseImportBackup
      ? path.join(BACKUP_DIR, existingBackups[0])
      : path.join(BACKUP_DIR, `reading-g-vocab-before-${timestampForFile()}.json`);
    if (!canReuseImportBackup) fs.copyFileSync(VOCAB_PATH, backupPath);
    if (sourceType === "text") {
      const snapshot = {
        version: IMPORT_VERSION,
        sourceFile: SOURCE_BASENAME,
        sourceSha256: report.sourceHash,
        count: rows.length,
        tierCounts,
        rows
      };
      atomicWrite(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
    }
    atomicWrite(VOCAB_PATH, nextRaw);
    const persistedRaw = fs.readFileSync(VOCAB_PATH, "utf8");
    if (sha256(persistedRaw) !== report.outputHash) {
      fs.copyFileSync(backupPath, VOCAB_PATH);
      throw new Error("写入后哈希校验失败，已从单次备份回退");
    }
    report.backupPath = backupPath;
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
