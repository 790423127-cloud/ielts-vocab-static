/**
 * Import the reviewed high-frequency vocabulary layer derived from 224
 * distinct Cambridge IELTS General Training Part 1/Part 2 articles.
 *
 * Dry run:
 *   node scripts/import-reading-g-part12-article-high-frequency.mjs
 * Apply with a timestamped backup:
 *   node scripts/import-reading-g-part12-article-high-frequency.mjs --apply
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeReadingGKey,
  stableReadingGId
} from "../app/lib/reading-g-vocab/normalize.mjs";
import {
  normalizeReadingGForms,
  normalizeReadingGWordFamily
} from "../app/lib/reading-g-vocab/morphology.mjs";
import { atomicReplaceFileSync } from "../app/lib/reading-g-vocab/atomic-write.server.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VOCAB_PATH = path.join(ROOT, "public", "data", "reading-g-vocab.json");
const MASTER_PATH = path.join(ROOT, "public", "data", "words.json");
const STATIC_MASTER_PATH = path.join(ROOT, ".static-export-cache", "words.json");
const RETIREMENTS_PATH = path.join(ROOT, "public", "data", "reading-g-retirements.json");
const SOURCE_PATH = path.join(ROOT, "scripts", "data", "reading-g-part12-article-high-frequency-20260823.json");
const BACKUP_ROOT = path.join(ROOT, "backups", "reading-g-part12-article-high-frequency-20260823");
const SOURCE_FILE = "scripts/data/reading-g-part12-article-high-frequency-20260823.json";
const LAYER_ID = "part12ArticleHighFrequency";
const QUALITY_FLAG = "part12_article_high_frequency_v4";

function text(value) {
  return String(value == null ? "" : value).trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function entryKey(entry) {
  return `${entry?.entryType || "word"}::${normalizeReadingGKey(entry?.normalizedKey || entry?.word)}`;
}

function validatePayload(payload, arrayField, countField, label) {
  const rows = list(payload?.[arrayField]);
  if (!rows.length || Number(payload?.[countField]) !== rows.length) {
    throw new Error(`${label} ${arrayField}/${countField} 不一致，已停止写入。`);
  }
  return rows;
}

function sourceFiles(source) {
  return [source.sourceDocument, SOURCE_FILE];
}

function frequencyEvidence(row, source) {
  return {
    version: source.version,
    sourceDocument: source.sourceDocument,
    sourceSha256: source.sourceSha256,
    minimumDistinctArticles: source.minimumDistinctArticles,
    articleCount: Number(row.articleCount || 0),
    testCount: Number(row.testCount || 0),
    occurrenceCount: Number(row.occurrenceCount || 0),
    part1ArticleCount: Number(row.part1ArticleCount || 0),
    part2ArticleCount: Number(row.part2ArticleCount || 0),
    surfaces: unique(list(row.surfaces)),
    articleIds: unique(list(row.articleIds)),
    part3ArticleCount: Number(row.part3ArticleCount || 0),
    part3ArticleIds: unique(list(row.part3ArticleIds))
  };
}

function rowEntryType(row) {
  return text(row?.entryType) === "phrase" ? "phrase" : "word";
}

function rowEntryKey(row) {
  return `${rowEntryType(row)}::${normalizeReadingGKey(row.key || row.word)}`;
}

function validateFrequencyRow(row, source) {
  const key = normalizeReadingGKey(row.key || row.word);
  const articleIds = unique(list(row.articleIds));
  if (!key || !["existing", "master", "manual"].includes(row.kind)) {
    throw new Error(`无效高频词行：${row.word || row.key || "(empty)"}`);
  }
  const part3Ids = unique(list(row.part3ArticleIds));
  const part12Count = Number(row.articleCount || 0);
  const part3Count = Number(row.part3ArticleCount || 0);
  if (articleIds.length !== part12Count) {
    throw new Error(`${row.word} 的 articleIds/articleCount 不一致。`);
  }
  if (part3Ids.length !== part3Count) {
    throw new Error(`${row.word} 的 part3ArticleIds/part3ArticleCount 不一致。`);
  }
  if (part12Count + part3Count < Number(source.minimumDistinctArticles || 1)) {
    throw new Error(`${row.word} 未达到跨文章阈值。`);
  }
  return rowEntryKey(row);
}

function buildMasterEntry(master, row, source) {
  const word = text(master.word || row.word);
  const normalizedKey = normalizeReadingGKey(word);
  const id = stableReadingGId("word", normalizedKey);
  const primaryPos = text(master.primaryPos || master.pos);
  const meaning = text(master.primaryMeaningZh || master.meaningZh || master.meaning);
  const definition = text(master.definition || meaning);
  const example = text(master.example);
  const exampleZh = text(master.exampleCn || master.exampleZh);
  const files = ["public/data/words.json", ...sourceFiles(source)];
  const forms = normalizeReadingGForms(master.forms, word);
  const formKeys = new Set(forms.map((form) => normalizeReadingGKey(form.word)).filter(Boolean));
  const wordFamily = normalizeReadingGWordFamily(master.wordFamily, word).filter(
    (member) => !formKeys.has(normalizeReadingGKey(member.word))
  );

  if (!word || !primaryPos || !meaning || !definition || !example || !exampleZh || !text(master.phonetic)) {
    throw new Error(`主词库中的 ${word || "(empty)"} 缺少可复用的完整教学字段。`);
  }

  return {
    id,
    entryType: "word",
    word,
    normalizedKey,
    phonetic: text(master.phonetic),
    primaryPos,
    pos: primaryPos,
    primaryMeaningZh: meaning,
    meaning,
    meaningZh: meaning,
    definition,
    example,
    exampleCn: exampleZh,
    exampleZh,
    senses: [{
      senseId: `${id}_${primaryPos.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_01`,
      pos: primaryPos,
      meaningZh: meaning,
      definition,
      example,
      exampleZh,
      sourceFiles: files
    }],
    collocations: structuredClone(list(master.collocations)),
    phraseCollocations: structuredClone(list(master.phraseCollocations)),
    forms,
    wordFamily,
    synonyms: structuredClone(list(master.synonyms)),
    synonymDetails: structuredClone(list(master.synonymDetails)),
    topics: unique(["G类阅读", "Part1+2文章高频", ...list(master.topics)]),
    ieltsUse: unique([...list(master.ieltsUse), "Reading", "IELTS G类"]),
    difficulty: text(master.difficulty || "中级核心"),
    category: "IELTS G类 · 阅读核心",
    domain: "阅读通用",
    layers: [LAYER_ID],
    primaryLayer: LAYER_ID,
    layerRank: 6,
    studyMode: "active",
    sourceFiles: files,
    qualityFlags: [QUALITY_FLAG, "master_content_reused"],
    acceptedAnswers: unique([word, ...list(master.acceptedAnswers)]),
    sourceWordId: text(master.id || master.wordId),
    meaningDetailZh: text(master.meaningDetailZh || master.meaningDetailedZh || meaning),
    meaningDetailSource: "master-lexicon",
    otherMeanings: structuredClone(list(master.otherMeanings)),
    formsReviewed: master.formsReviewed === true,
    formsReviewSource: "master-lexicon",
    wordFamilyReviewed: master.wordFamilyReviewed === true,
    wordFamilyReviewSource: "master-lexicon",
    collocationsReviewed: list(master.collocations).length > 0,
    phraseCollocationsReviewed: list(master.phraseCollocations).length > 0,
    synonymsReviewed: master.synonymsReviewed === true,
    synonymsReviewSource: "master-lexicon",
    meaningCoveragePending: false,
    meaningCoverageReviewed: true,
    meaningCoverageAuditStatus: "reviewed",
    meaningCoverageReviewSource: "master-lexicon-reuse",
    meaningCoverageReviewedAt: source.reviewedAt,
    audio: text(master.audio),
    exampleAudio: text(master.exampleAudio),
    part12ArticleFrequency: frequencyEvidence(row, source),
    part12ArticleHighFrequencyVersion: source.version,
    aiGenerated: master.aiGenerated === true
  };
}

function buildManualEntry(row, source) {
  const content = row.content && typeof row.content === "object" ? row.content : {};
  const entryType = text(row.entryType) === "phrase" ? "phrase" : "word";
  const word = text(content.word || row.word);
  const normalizedKey = normalizeReadingGKey(word);
  const id = stableReadingGId(entryType, normalizedKey);
  const primaryPos = text(content.primaryPos);
  const meaning = text(content.primaryMeaningZh);
  const definition = text(content.definition);
  const example = text(content.example);
  const exampleZh = text(content.exampleCn);
  const files = sourceFiles(source);

  if (!word || !text(content.phonetic) || !primaryPos || !meaning || !definition || !example || !exampleZh || !text(content.meaningDetailZh)) {
    throw new Error(`人工词条 ${word || row.key || "(empty)"} 缺少完整教学字段。`);
  }

  return {
    id,
    entryType,
    word,
    normalizedKey,
    phonetic: text(content.phonetic),
    primaryPos,
    pos: primaryPos,
    primaryMeaningZh: meaning,
    meaning,
    meaningZh: meaning,
    definition,
    example,
    exampleCn: exampleZh,
    exampleZh,
    senses: [{
      senseId: `${id}_abbreviation_01`,
      pos: primaryPos,
      meaningZh: meaning,
      definition,
      example,
      exampleZh,
      sourceFiles: files
    }],
    collocations: structuredClone(list(content.collocations)),
    phraseCollocations: structuredClone(list(content.phraseCollocations)),
    forms: [],
    wordFamily: [],
    synonyms: structuredClone(list(content.synonyms)),
    synonymDetails: structuredClone(list(content.synonymDetails)),
    topics: unique(["G类阅读", "Part1+2文章高频", ...list(content.topics)]),
    ieltsUse: ["Reading", "IELTS G类"],
    difficulty: text(content.difficulty || "中级核心"),
    category: "IELTS G类 · 阅读核心",
    domain: text(content.domain || "阅读通用"),
    layers: [LAYER_ID],
    primaryLayer: LAYER_ID,
    layerRank: 6,
    studyMode: "active",
    sourceFiles: files,
    qualityFlags: [QUALITY_FLAG, "manual_editorial_article_abbreviation_v1"],
    acceptedAnswers: unique([word, normalizeReadingGKey(word), ...list(content.acceptedAnswers)]),
    meaningDetailZh: text(content.meaningDetailZh),
    meaningDetailSource: "manual-editorial-from-source-articles",
    otherMeanings: structuredClone(list(content.otherMeanings)),
    formsReviewed: true,
    formsReviewSource: "manual-editorial",
    wordFamilyReviewed: true,
    wordFamilyReviewSource: "manual-editorial",
    collocationsReviewed: true,
    phraseCollocationsReviewed: true,
    synonymsReviewed: true,
    synonymsReviewSource: "manual-editorial",
    meaningCoveragePending: false,
    meaningCoverageReviewed: true,
    meaningCoverageAuditStatus: "reviewed",
    meaningCoverageReviewSource: "manual-editorial",
    meaningCoverageReviewedAt: source.reviewedAt,
    audio: "",
    exampleAudio: "",
    part12ArticleFrequency: frequencyEvidence(row, source),
    part12ArticleHighFrequencyVersion: source.version,
    aiGenerated: false
  };
}

function recomputeTotals(payload) {
  const items = list(payload.items);
  payload.count = items.length;
  payload.wordCount = items.filter((item) => item.entryType !== "phrase").length;
  payload.phraseCount = items.filter((item) => item.entryType === "phrase").length;
  payload.activeCount = items.filter((item) => item.studyMode !== "reference").length;
  payload.referenceCount = items.filter((item) => item.studyMode === "reference").length;
  payload.multiSenseCount = items.filter((item) => list(item.senses).length > 1).length;
}

export function buildPart12ArticleHighFrequencyPlan(vocabPayload, masterPayload, retirementPayload, sourcePayload) {
  const currentItems = validatePayload(vocabPayload, "items", "count", "G 类词库");
  const masterWords = validatePayload(masterPayload, "words", "count", "主词库");
  const sourceRows = validatePayload(sourcePayload, "rows", "count", "高频词源");
  if (sourcePayload.layerId !== LAYER_ID || Number(sourcePayload.corpus?.articleCount) !== 224) {
    throw new Error("高频词源的层 ID 或文章总数不正确，已停止写入。");
  }
  if (list(sourcePayload.articleCatalog).length !== 224) {
    throw new Error("文章目录不是 224 篇，已停止写入。");
  }

  const masterByKey = new Map(masterWords.map((entry) => [normalizeReadingGKey(entry.word), entry]));
  const retiredKeys = new Set(list(retirementPayload?.entries).map((entry) => (
    text(entry.key) || `word::${normalizeReadingGKey(entry.word)}`
  )));
  const sourceKeys = new Set();
  for (const row of sourceRows) {
    const key = validateFrequencyRow(row, sourcePayload);
    if (sourceKeys.has(key)) throw new Error(`高频词源重复：${key}`);
    sourceKeys.add(key);
  }

  const beforeIdentity = currentItems.map((entry) => `${entry.id}::${entryKey(entry)}`);
  const nextItems = currentItems.map((entry) => structuredClone(entry));
  const nextByKey = new Map(nextItems.map((entry) => [entryKey(entry), entry]));
  const taggedExisting = [];
  const alreadyCreated = [];
  const added = [];
  const restored = [];

  for (const row of sourceRows) {
    const normalizedKey = normalizeReadingGKey(row.key || row.word);
    const key = rowEntryKey(row);
    const restoreRetired = row.restoreRetired === true;
    let entry = nextByKey.get(key);
    if (!entry && retiredKeys.has(key) && !restoreRetired) {
      throw new Error(`${row.word} 位于退役记录中，已停止恢复。`);
    }
    if (retiredKeys.has(key) && (restoreRetired || entry)) restored.push(key);

    if (!entry) {
      if (row.kind === "existing") throw new Error(`既有高频词缺失：${row.word}`);
      if (row.kind === "master") {
        const master = masterByKey.get(normalizedKey);
        if (!master) throw new Error(`主词库缺少唯一词条：${row.word}`);
        if (text(row.sourceWordId) && text(master.id || master.wordId) !== text(row.sourceWordId)) {
          throw new Error(`${row.word} 的主词库稳定 ID 与审核源不一致。`);
        }
        entry = buildMasterEntry(master, row, sourcePayload);
      } else {
        entry = buildManualEntry(row, sourcePayload);
      }
      if (nextItems.some((item) => item.id === entry.id)) throw new Error(`稳定 ID 冲突：${entry.id}`);
      nextItems.push(entry);
      nextByKey.set(key, entry);
      added.push(entry.word);
      continue;
    }

    if (
      row.kind !== "existing"
      && !list(entry.layers).includes(LAYER_ID)
      && entry.part12ArticleHighFrequencyVersion
      && entry.part12ArticleHighFrequencyVersion !== sourcePayload.version
    ) {
      throw new Error(`${row.word} 已存在但不是本导入创建的词条，已停止以避免覆盖。`);
    }
    entry.layers = unique([...list(entry.layers), LAYER_ID]);
    entry.sourceFiles = unique([...list(entry.sourceFiles), ...sourceFiles(sourcePayload)]);
    entry.qualityFlags = unique([
      ...list(entry.qualityFlags).filter((flag) => flag !== "part12_article_high_frequency_v1"),
      QUALITY_FLAG
    ]);
    entry.part12ArticleFrequency = frequencyEvidence(row, sourcePayload);
    entry.part12ArticleHighFrequencyVersion = sourcePayload.version;
    if (row.kind === "existing") taggedExisting.push(entry.word);
    else alreadyCreated.push(entry.word);
  }

  const untagged = [];
  for (const entry of nextItems) {
    const key = entryKey(entry);
    if (sourceKeys.has(key) || !list(entry.layers).includes(LAYER_ID)) continue;
    entry.layers = list(entry.layers).filter((layer) => layer !== LAYER_ID);
    entry.qualityFlags = list(entry.qualityFlags).filter((flag) => (
      flag !== QUALITY_FLAG && flag !== "part12_article_high_frequency_v1"
    ));
    delete entry.part12ArticleFrequency;
    delete entry.part12ArticleHighFrequencyVersion;
    untagged.push(entry.word);
  }

  const payload = structuredClone(vocabPayload);
  payload.items = nextItems;
  recomputeTotals(payload);
  payload.layerStats = {
    ...(payload.layerStats || {}),
    [LAYER_ID]: {
      name: sourcePayload.layerName,
      rawCount: sourceRows.length,
      uniqueKeysInLayer: sourceRows.length,
      skippedEmpty: 0,
      mode: "mixed",
      rank: 6,
      primaryNewCount: Number(sourcePayload.additionCount),
      filterCount: sourceRows.length,
      minimumDistinctArticles: sourcePayload.minimumDistinctArticles,
      corpusArticleCount: sourcePayload.corpus.articleCount
    }
  };
  payload.updatedAt = `${sourcePayload.reviewedAt}T00:00:00.000Z`;
  payload.part12ArticleHighFrequency = {
    version: sourcePayload.version,
    sourceDocument: sourcePayload.sourceDocument,
    sourceSha256: sourcePayload.sourceSha256,
    importedAt: sourcePayload.reviewedAt,
    corpusArticleCount: sourcePayload.corpus.articleCount,
    testCount: sourcePayload.corpus.testCount,
    part1ArticleCount: sourcePayload.corpus.part1ArticleCount,
    part2ArticleCount: sourcePayload.corpus.part2ArticleCount,
    minimumDistinctArticles: sourcePayload.minimumDistinctArticles,
    layer: LAYER_ID,
    layerCount: sourceRows.length,
    taggedExistingCount: Number(sourcePayload.existingCount),
    addedCount: Number(sourcePayload.additionCount),
    wordCount: Number(sourcePayload.wordCount || sourceRows.filter((row) => rowEntryType(row) !== "phrase").length),
    phraseCount: Number(sourcePayload.phraseCount || sourceRows.filter((row) => rowEntryType(row) === "phrase").length),
    masterContentReused: sourcePayload.masterReuseCount,
    manualEditorialCount: sourcePayload.manualEditorialCount,
    addedWords: sourceRows.filter((row) => row.kind !== "existing").map((row) => row.word),
    restoredRetired: restored,
    paidAiCalls: 0,
    policy: sourcePayload.policy
  };

  const nextRetirements = structuredClone(retirementPayload || { entries: [] });
  if (restored.length) {
    const restoredSet = new Set(restored);
    nextRetirements.entries = list(nextRetirements.entries).filter((entry) => {
      const key = text(entry?.key) || `word::${normalizeReadingGKey(entry?.word)}`;
      return !restoredSet.has(key);
    });
    nextRetirements.count = nextRetirements.entries.length;
    nextRetirements.updatedAt = new Date().toISOString();
  }

  const afterExistingIdentity = payload.items.slice(0, currentItems.length).map((entry) => `${entry.id}::${entryKey(entry)}`);
  if (JSON.stringify(beforeIdentity) !== JSON.stringify(afterExistingIdentity)) {
    throw new Error("导入改变了既有词条顺序、词头或稳定 ID，已停止写入。");
  }
  const keys = payload.items.map(entryKey);
  if (new Set(keys).size !== keys.length) throw new Error("导入后出现重复词条，已停止写入。");
  const layerItems = payload.items.filter((entry) => list(entry.layers).includes(LAYER_ID));
  if (layerItems.length !== sourceRows.length) throw new Error("导入后的高频层数量与审核源不一致。");

  for (let index = 0; index < currentItems.length; index += 1) {
    const key = entryKey(currentItems[index]);
    const wasLayered = list(currentItems[index].layers).includes(LAYER_ID);
    if (sourceKeys.has(key) || wasLayered) continue;
    if (JSON.stringify(currentItems[index]) !== JSON.stringify(payload.items[index])) {
      throw new Error(`无关词条被修改：${currentItems[index].word}`);
    }
  }

  return {
    payload,
    summary: {
      beforeCount: currentItems.length,
      afterCount: payload.items.length,
      layerCount: layerItems.length,
      taggedExistingCount: taggedExisting.length,
      untaggedCount: untagged.length,
      added,
      alreadyCreated,
      untagged,
      restoredRetired: restored,
      stableIdsChanged: 0,
      paidAiCalls: 0
    },
    retirements: nextRetirements
  };
}

function timestampForPath() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function main() {
  if (!fs.existsSync(STATIC_MASTER_PATH) || hashFile(MASTER_PATH) !== hashFile(STATIC_MASTER_PATH)) {
    throw new Error("public/data/words.json 与 .static-export-cache/words.json 不一致，已停止写入。");
  }
  const vocab = readJson(VOCAB_PATH);
  const master = readJson(MASTER_PATH);
  const retirements = readJson(RETIREMENTS_PATH);
  const source = readJson(SOURCE_PATH);
  const plan = buildPart12ArticleHighFrequencyPlan(vocab, master, retirements, source);
  const apply = process.argv.includes("--apply");

  if (apply) {
    const backupDir = path.join(BACKUP_ROOT, timestampForPath());
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(VOCAB_PATH, path.join(backupDir, "reading-g-vocab.before.json"));
    fs.copyFileSync(RETIREMENTS_PATH, path.join(backupDir, "reading-g-retirements.before.json"));
    atomicReplaceFileSync(VOCAB_PATH, JSON.stringify(plan.payload));
    if (plan.retirements) {
      atomicReplaceFileSync(RETIREMENTS_PATH, `${JSON.stringify(plan.retirements, null, 2)}\n`);
    }
    plan.summary.backupDir = path.relative(ROOT, backupDir).replace(/\\/g, "/");
  }

  process.stdout.write(`${JSON.stringify({ mode: apply ? "apply" : "dry-run", ...plan.summary }, null, 2)}\n`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
