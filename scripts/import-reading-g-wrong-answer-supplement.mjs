/**
 * Import reviewed non-basic vocabulary gaps found in the user's wrong-answer workbook.
 *
 * Dry run:
 *   node scripts/import-reading-g-wrong-answer-supplement.mjs
 * Apply with a timestamped backup:
 *   node scripts/import-reading-g-wrong-answer-supplement.mjs --apply
 */
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
const RETIREMENTS_PATH = path.join(ROOT, "public", "data", "reading-g-retirements.json");
const SOURCE_PATH = path.join(ROOT, "scripts", "data", "reading-g-wrong-answer-supplement-20260823.json");
const BACKUP_ROOT = path.join(ROOT, "backups", "reading-g-wrong-answer-supplement-20260823");
const LAYER_ID = "wrongAnswerSupplement20260823";

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

function buildEntry(master, row, source) {
  const word = text(row.word);
  const normalizedKey = normalizeReadingGKey(word);
  const id = stableReadingGId("word", normalizedKey);
  const primaryPos = text(master.primaryPos || master.pos);
  const meaning = text(master.primaryMeaningZh || master.meaningZh || master.meaning);
  const definition = text(master.definition || meaning);
  const example = text(master.example);
  const exampleZh = text(master.exampleCn || master.exampleZh);
  const sourceFiles = [
    "public/data/words.json",
    source.sourceWorkbook,
    "scripts/data/reading-g-wrong-answer-supplement-20260823.json"
  ];
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
      sourceFiles
    }],
    collocations: structuredClone(list(master.collocations)),
    phraseCollocations: structuredClone(list(master.phraseCollocations)),
    forms,
    wordFamily,
    synonyms: structuredClone(list(master.synonyms)),
    synonymDetails: structuredClone(list(master.synonymDetails)),
    topics: ["G类阅读", "错题补充", "身体恢复与资源补充"],
    ieltsUse: unique([...list(master.ieltsUse), "Reading", "IELTS G类"]),
    difficulty: text(row.difficulty || master.difficulty || "中级核心"),
    category: "IELTS G类 · 阅读核心",
    domain: text(row.domain || "阅读通用"),
    layers: [LAYER_ID],
    primaryLayer: LAYER_ID,
    layerRank: 6,
    studyMode: "active",
    sourceFiles,
    qualityFlags: ["wrong_answer_workbook_supplement_v1", "master_content_reused"],
    acceptedAnswers: unique([word, ...list(master.acceptedAnswers)]),
    sourceWordId: text(master.id || master.wordId),
    meaningDetailZh: text(master.meaningDetailZh || master.meaningDetailedZh),
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
    wrongAnswerEvidence: structuredClone(row.evidence || {}),
    wrongAnswerSupplementVersion: source.version,
    wrongAnswerSupplementReviewedAt: source.reviewedAt,
    aiGenerated: master.aiGenerated === true
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

export function buildWrongAnswerSupplementPlan(vocabPayload, masterPayload, retirementPayload, sourcePayload) {
  const currentItems = validatePayload(vocabPayload, "items", "count", "G 类词库");
  const masterWords = validatePayload(masterPayload, "words", "count", "主词库");
  const sourceRows = validatePayload(sourcePayload, "rows", "count", "错题补充源");
  const beforeIdentity = currentItems.map((entry) => `${entry.id}::${entryKey(entry)}`);
  const currentByKey = new Map(currentItems.map((entry) => [entryKey(entry), entry]));
  const masterByKey = new Map(masterWords.map((entry) => [normalizeReadingGKey(entry.word), entry]));
  const retiredKeys = new Set(list(retirementPayload?.entries).map((entry) => (
    text(entry.key) || `word::${normalizeReadingGKey(entry.word)}`
  )));
  const nextItems = currentItems.map((entry) => structuredClone(entry));
  const added = [];
  const alreadyPresent = [];

  for (const row of sourceRows) {
    const normalizedKey = normalizeReadingGKey(row.word);
    const key = `word::${normalizedKey}`;
    const existing = currentByKey.get(key);
    if (existing) {
      if (existing.wrongAnswerSupplementVersion !== sourcePayload.version) {
        throw new Error(`${row.word} 已存在但不是本补充创建的词条，已停止以避免覆盖。`);
      }
      alreadyPresent.push(row.word);
      continue;
    }
    if (retiredKeys.has(key)) throw new Error(`${row.word} 位于退役记录中，已停止恢复。`);
    const master = masterByKey.get(normalizedKey);
    if (!master) throw new Error(`主词库缺少唯一词条：${row.word}`);
    const entry = buildEntry(master, row, sourcePayload);
    if (nextItems.some((item) => item.id === entry.id)) throw new Error(`稳定 ID 冲突：${entry.id}`);
    nextItems.push(entry);
    currentByKey.set(key, entry);
    added.push(row.word);
  }

  const payload = structuredClone(vocabPayload);
  payload.items = nextItems;
  recomputeTotals(payload);
  payload.updatedAt = `${sourcePayload.reviewedAt}T00:00:00.000Z`;
  payload.wrongAnswerSupplement = {
    version: sourcePayload.version,
    sourceWorkbook: sourcePayload.sourceWorkbook,
    importedAt: sourcePayload.reviewedAt,
    sourceCount: sourceRows.length,
    addedCount: added.length,
    alreadyPresentCount: alreadyPresent.length,
    words: sourceRows.map((row) => row.word),
    layer: LAYER_ID,
    targetStage: 2,
    masterContentReused: added.length,
    paidAiCalls: 0,
    policy: sourcePayload.policy
  };

  const afterExistingIdentity = payload.items.slice(0, currentItems.length).map((entry) => `${entry.id}::${entryKey(entry)}`);
  if (JSON.stringify(beforeIdentity) !== JSON.stringify(afterExistingIdentity)) {
    throw new Error("导入改变了既有词条顺序、词头或稳定 ID，已停止写入。");
  }
  const keys = payload.items.map(entryKey);
  if (new Set(keys).size !== keys.length) throw new Error("导入后出现重复词条，已停止写入。");

  return {
    payload,
    summary: {
      beforeCount: currentItems.length,
      afterCount: payload.items.length,
      added,
      alreadyPresent,
      paidAiCalls: 0
    }
  };
}

function timestampForPath() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function main() {
  const vocab = readJson(VOCAB_PATH);
  const master = readJson(MASTER_PATH);
  const retirements = readJson(RETIREMENTS_PATH);
  const source = readJson(SOURCE_PATH);
  const plan = buildWrongAnswerSupplementPlan(vocab, master, retirements, source);
  const apply = process.argv.includes("--apply");

  if (apply && plan.summary.added.length) {
    const backupDir = path.join(BACKUP_ROOT, timestampForPath());
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(VOCAB_PATH, path.join(backupDir, "reading-g-vocab.before.json"));
    atomicReplaceFileSync(VOCAB_PATH, JSON.stringify(plan.payload));
    plan.summary.backupDir = path.relative(ROOT, backupDir).replace(/\\/g, "/");
  }

  process.stdout.write(`${JSON.stringify({ mode: apply ? "apply" : "dry-run", ...plan.summary }, null, 2)}\n`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
