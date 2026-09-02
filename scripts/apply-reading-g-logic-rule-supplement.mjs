/**
 * Add reviewed phrase-level logic categories and evidence to reading-g-vocab.
 *
 * Dry-run:
 *   node scripts/apply-reading-g-logic-rule-supplement.mjs
 * Apply (creates a timestamped backup first):
 *   node scripts/apply-reading-g-logic-rule-supplement.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeReadingGKey,
  stableReadingGId
} from "../app/lib/reading-g-vocab/normalize.mjs";
import { atomicReplaceFileSync } from "../app/lib/reading-g-vocab/atomic-write.server.mjs";
import {
  LOGIC_EXISTING_PHRASES,
  LOGIC_NEW_PHRASES,
  LOGIC_RULE_CATEGORIES,
  LOGIC_RULE_EXCLUSIONS,
  LOGIC_RULE_GATES,
  LOGIC_RULE_VERSION
} from "./data/reading-g-logic-rule-supplement.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VOCAB_PATH = path.join(ROOT, "public", "data", "reading-g-vocab.json");
const EVIDENCE_PATH = path.join(ROOT, "public", "data", "reading-g-question-evidence.json");
const BACKUP_DIR = path.join(ROOT, "backups", "reading-g-logic-rule-supplement-20260826");
const RULE_SOURCE = "scripts/data/reading-g-logic-rule-supplement.mjs";
const EVIDENCE_SOURCE = "public/data/reading-g-question-evidence.json";
const QUALITY_FLAG = "logic120_rule_supplement_v1";
const AUDIT_AT = "2026-08-26";
const apply = process.argv.includes("--apply");

function text(value) {
  return String(value == null ? "" : value).trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function keyOf(value) {
  return normalizeReadingGKey(value);
}

function normalizeEvidenceText(value) {
  return ` ${text(value)
    .toLowerCase()
    .replace(/[’']/gu, "'")
    .replace(/[^a-z0-9']+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()} `;
}

function countLiteral(segment, term) {
  const haystack = normalizeEvidenceText(segment);
  const needle = normalizeEvidenceText(term);
  if (needle === "  ") return 0;
  let count = 0;
  let offset = 0;
  while (offset < haystack.length) {
    const index = haystack.indexOf(needle, offset);
    if (index < 0) break;
    count += 1;
    offset = index + Math.max(needle.length - 1, 1);
  }
  return count;
}

function countPattern(segment, source) {
  const matches = text(segment).match(new RegExp(source, "giu"));
  return matches?.length || 0;
}

function buildQuestionFrequency(spec, evidence) {
  let occurrenceCount = 0;
  let questionCount = 0;
  const tests = new Set();

  for (const question of evidence.questions || []) {
    const segments = [question.questionLabel, question.answerSentence, question.answer]
      .map(text)
      .filter(Boolean);
    let questionOccurrences = 0;
    for (const segment of segments) {
      for (const term of spec.evidenceTerms || []) {
        questionOccurrences += countLiteral(segment, term);
      }
      for (const pattern of spec.evidencePatterns || []) {
        questionOccurrences += countPattern(segment, pattern);
      }
    }
    if (!questionOccurrences) continue;
    occurrenceCount += questionOccurrences;
    questionCount += 1;
    tests.add(`${text(question.book)}|${text(question.test)}`);
  }

  const evidenceQuestionCount = Number(evidence.count || evidence.questions?.length || 0);
  return {
    version: 2,
    auditedAt: AUDIT_AT,
    source: EVIDENCE_SOURCE,
    occurrenceCount,
    questionCount,
    testCount: tests.size,
    questionEvidenceRate: evidenceQuestionCount
      ? Number((questionCount / evidenceQuestionCount).toFixed(8))
      : 0,
    evidenceTerms: unique(spec.evidenceTerms || []),
    evidencePatterns: unique(spec.evidencePatterns || [])
  };
}

function getArticleFrequency(item) {
  const source = item?.part12ArticleFrequency || {};
  return {
    articleCount: Number(source.articleCount || 0) + Number(source.part3ArticleCount || 0),
    occurrenceCount: Number(source.occurrenceCount || 0)
  };
}

function addSharedMetadata(item, spec, frequency) {
  item.layers = unique([...list(item.layers), "logic120"]);
  item.studyMode = "active";
  item.topics = unique([
    ...list(item.topics),
    "阅读逻辑转换",
    "真题逻辑规则补充",
    LOGIC_RULE_CATEGORIES.find((category) => category.id === spec.category)?.label
  ]);
  item.ieltsUse = unique([...list(item.ieltsUse), "阅读逻辑转换"]);
  item.sourceFiles = unique([
    ...list(item.sourceFiles),
    RULE_SOURCE,
    ...(frequency.questionCount ? [EVIDENCE_SOURCE] : [])
  ]);
  item.qualityFlags = unique([...list(item.qualityFlags), QUALITY_FLAG]);
  item.acceptedAnswers = unique([
    ...list(item.acceptedAnswers),
    item.word,
    ...list(spec.acceptedAnswers)
  ]);
  item.aiCoachQuestionFrequency = frequency;
  item.logicRuleCategory = spec.category;
  item.logicRuleVersion = LOGIC_RULE_VERSION;
}

function makePhraseEntry(spec, frequency) {
  const normalizedKey = keyOf(spec.word);
  const id = stableReadingGId("phrase", normalizedKey);
  const item = {
    id,
    word: spec.word,
    normalizedKey,
    entryType: "phrase",
    isPhrase: true,
    phonetic: text(spec.phonetic),
    pos: "phrase",
    primaryPos: "phrase",
    primaryMeaningZh: spec.primaryMeaningZh,
    meaning: spec.primaryMeaningZh,
    meaningZh: spec.primaryMeaningZh,
    definition: spec.definition,
    meaningDetailZh: spec.meaningDetailZh,
    meaningDetailSource: "manual-editorial-review",
    meaningDetailReviewedAt: AUDIT_AT,
    example: spec.example,
    exampleCn: spec.exampleCn,
    exampleZh: spec.exampleCn,
    senses: [
      {
        senseId: `${id}_phrase_01`,
        pos: "phrase",
        meaningZh: spec.primaryMeaningZh,
        definition: spec.definition,
        example: spec.example,
        exampleZh: spec.exampleCn,
        sourceFiles: [RULE_SOURCE, EVIDENCE_SOURCE]
      }
    ],
    collocations: [],
    phraseCollocations: [],
    forms: [],
    wordFamily: [],
    synonyms: [],
    synonymDetails: [],
    difficulty: "阅读逻辑核心",
    category: "IELTS G类 · 阅读逻辑转换",
    domain: "阅读逻辑",
    topics: [],
    ieltsUse: [],
    layers: ["logic120"],
    primaryLayer: "logic120",
    layerRank: 3,
    phraseStudyStage: 1,
    studyMode: "active",
    sourceFiles: [],
    qualityFlags: [],
    acceptedAnswers: [],
    audio: "",
    exampleAudio: ""
  };
  addSharedMetadata(item, spec, frequency);
  return item;
}

function identitySnapshot(items) {
  return items.map((item) => `${item.id}::${item.word}`);
}

const vocab = JSON.parse(fs.readFileSync(VOCAB_PATH, "utf8"));
const evidence = JSON.parse(fs.readFileSync(EVIDENCE_PATH, "utf8"));
if (!Array.isArray(vocab.items) || !Array.isArray(evidence.questions)) {
  throw new Error("正式词库或真题证据结构无效，已停止写入。");
}

const beforeCount = vocab.items.length;
const beforeLogicCount = vocab.items.filter((item) => list(item.layers).includes("logic120")).length;
const beforeIdentities = identitySnapshot(vocab.items);
const byKey = new Map(vocab.items.map((item) => [keyOf(item.word), item]));
const byId = new Map(vocab.items.map((item) => [item.id, item]));
const evidenceSummary = {};
const taggedExisting = [];
const alreadyTagged = [];
const added = [];
const promotedReference = [];

for (const spec of LOGIC_EXISTING_PHRASES) {
  const item = byKey.get(keyOf(spec.word));
  if (!item) {
    throw new Error(`应补逻辑标签的既有词组不存在：${spec.word}`);
  }
  const frequency = buildQuestionFrequency(spec, evidence);
  const articleFrequency = getArticleFrequency(item);
  if (!frequency.questionCount && !articleFrequency.articleCount) {
    throw new Error(`词组缺少真题或文章证据：${spec.word}`);
  }
  const wasTagged = list(item.layers).includes("logic120");
  const wasReference = item.studyMode === "reference";
  addSharedMetadata(item, spec, frequency);
  if (wasTagged) alreadyTagged.push(item.word);
  else taggedExisting.push(item.word);
  if (wasReference) promotedReference.push(item.word);
  evidenceSummary[item.word] = {
    category: spec.category,
    articleCount: articleFrequency.articleCount,
    articleOccurrenceCount: articleFrequency.occurrenceCount,
    questionOccurrenceCount: frequency.occurrenceCount,
    questionCount: frequency.questionCount,
    testCount: frequency.testCount
  };
}

for (const spec of LOGIC_NEW_PHRASES) {
  const normalizedKey = keyOf(spec.word);
  const frequency = buildQuestionFrequency(spec, evidence);
  if (!frequency.questionCount) {
    throw new Error(`新词组没有匹配到真题证据：${spec.word}`);
  }
  let item = byKey.get(normalizedKey);
  if (item) {
    const wasTagged = list(item.layers).includes("logic120");
    const wasReference = item.studyMode === "reference";
    addSharedMetadata(item, spec, frequency);
    if (wasTagged) alreadyTagged.push(item.word);
    else taggedExisting.push(item.word);
    if (wasReference) promotedReference.push(item.word);
  } else {
    item = makePhraseEntry(spec, frequency);
    if (byId.has(item.id)) {
      throw new Error(`新词组稳定 ID 与现有词条冲突：${item.word} (${item.id})`);
    }
    vocab.items.push(item);
    byKey.set(normalizedKey, item);
    byId.set(item.id, item);
    added.push(item.word);
  }
  evidenceSummary[item.word] = {
    category: spec.category,
    articleCount: 0,
    articleOccurrenceCount: 0,
    questionOccurrenceCount: frequency.occurrenceCount,
    questionCount: frequency.questionCount,
    testCount: frequency.testCount
  };
}

const logicRows = vocab.items.filter((item) => list(item.layers).includes("logic120"));
const afterCount = vocab.items.length;
vocab.count = afterCount;
vocab.wordCount = vocab.items.filter(
  (item) => (item.entryType || "word") !== "phrase" && !/\s/u.test(item.word || "")
).length;
vocab.phraseCount = afterCount - vocab.wordCount;
vocab.activeCount = vocab.items.filter((item) => item.studyMode === "active").length;
vocab.referenceCount = afterCount - vocab.activeCount;
if (vocab.layerStats?.logic120) {
  vocab.layerStats.logic120.filterCount = logicRows.length;
  vocab.layerStats.logic120.uniqueKeysInLayer = logicRows.length;
}
for (const auditKey of ["logicWorkbookImport", "logicLayerCorpusAudit"]) {
  if (vocab[auditKey]) vocab[auditKey].finalLogicLayerCount = logicRows.length;
}

const priorSupplement = vocab.logicRuleSupplement;
vocab.logicRuleSupplement = {
  version: LOGIC_RULE_VERSION,
  auditedAt: AUDIT_AT,
  source: RULE_SOURCE,
  evidenceSource: EVIDENCE_SOURCE,
  evidenceQuestionCount: Number(evidence.count || evidence.questions.length),
  gates: LOGIC_RULE_GATES,
  categories: LOGIC_RULE_CATEGORIES,
  orderingPolicy: "logic120 默认按不同文章覆盖数降序、文章总出现次数降序、题目证据出现次数降序、题目记录数降序排列。",
  existingPhraseTargetCount: LOGIC_EXISTING_PHRASES.length,
  newPhraseTargetCount: LOGIC_NEW_PHRASES.length,
  taggedDuringInitialApplyCount:
    priorSupplement?.taggedDuringInitialApplyCount ?? taggedExisting.length,
  addedDuringInitialApplyCount:
    priorSupplement?.addedDuringInitialApplyCount ?? added.length,
  promotedReferenceDuringInitialApplyCount:
    priorSupplement?.promotedReferenceDuringInitialApplyCount ?? promotedReference.length,
  existingPhraseWords: LOGIC_EXISTING_PHRASES.map((spec) => spec.word),
  newPhraseWords: LOGIC_NEW_PHRASES.map((spec) => spec.word),
  exclusions: LOGIC_RULE_EXCLUSIONS,
  evidenceSummary,
  finalLogicLayerCount: logicRows.length,
  paidAiCalls: 0,
  dataSafety: "未删除词条；未修改既有 id、word 或用户学习状态数据。"
};

if (vocab.aiCoachLogicLayerAudit) {
  vocab.aiCoachLogicLayerAudit = {
    ...vocab.aiCoachLogicLayerAudit,
    version: 2,
    auditedAt: AUDIT_AT,
    ruleVersion: LOGIC_RULE_VERSION,
    ruleCategories: LOGIC_RULE_CATEGORIES.map((category) => category.label),
    finalLogicLayerCount: logicRows.length,
    policy: "只加入在严格题干、答案句或已审核文章语料中真实出现，且会改变条件、范围、数量、程度、时间、真假、确定性或句间关系的稳定表达；普通主题搭配和已有上位逻辑词的具体实例不重复建卡；不删除既有词条和稳定 ID。"
  };
}

const afterExistingIdentities = identitySnapshot(vocab.items.slice(0, beforeCount));
if (JSON.stringify(beforeIdentities) !== JSON.stringify(afterExistingIdentities)) {
  throw new Error("既有词条的稳定 ID 或词头发生变化，已停止写入。");
}
if (new Set(vocab.items.map((item) => item.id)).size !== vocab.items.length) {
  throw new Error("补充后出现重复稳定 ID，已停止写入。");
}
for (const spec of LOGIC_NEW_PHRASES) {
  const matchingRows = vocab.items.filter((item) => keyOf(item.word) === keyOf(spec.word));
  if (matchingRows.length !== 1) {
    throw new Error(`本次新增词组出现重复词头：${spec.word}`);
  }
}

let backupPath = "";
if (apply) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/gu, "-");
  backupPath = path.join(BACKUP_DIR, `reading-g-vocab.before-${timestamp}.json`);
  fs.copyFileSync(VOCAB_PATH, backupPath);
  atomicReplaceFileSync(VOCAB_PATH, `${JSON.stringify(vocab, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  ruleVersion: LOGIC_RULE_VERSION,
  beforeCount,
  afterCount,
  beforeLogicCount,
  afterLogicCount: logicRows.length,
  taggedExisting,
  alreadyTagged,
  added,
  promotedReference,
  backupPath,
  evidenceSummary
}, null, 2)}\n`);
