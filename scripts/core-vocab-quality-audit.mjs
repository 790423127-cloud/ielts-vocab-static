/**
 * Read-only vocabulary inspector. It may write reports, but never writes source lexicons.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  CONFIRMED_PERSON_NAME_WORDS,
  PENDING_PERSON_NAME_WORDS,
  normalizeHeadword
} from "../app/lib/vocab/lexicon-guard-shared.mjs";
import { isBrushableWord } from "../app/lib/vocab/word-study-eligibility.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORDS_PATH = path.join(ROOT, ".static-export-cache", "words.json");
const PHRASES_PATH = path.join(ROOT, "public", "data", "phrases.json");
const REPORT_PATH = path.join(ROOT, "reports", "core-vocab-quality-audit.json");
const CANDIDATE_PATH = path.join(ROOT, "reports", "core-vocab-repair-candidates.json");

export const VALID_DIFFICULTIES = new Set([
  "基础高频",
  "中级核心",
  "高级加分",
  "阅读扩展",
  "低频认识即可"
]);

const REQUIRED_SUSPICIOUS_WORDS = new Map([
  ["aepyornis", "罕见灭绝鸟类名称，不符合通用核心词定位"],
  ["zaftig", "低频口语形容词，核心高频价值需要人工复核"],
  ["pulpwood", "林业专业词，核心高频价值需要人工复核"],
  ["underly", "疑似把 underlie 错写为 underly"],
  ["unprecedent", "疑似把 unprecedented 截断为 unprecedent"],
  ["watersh", "疑似被截断的 watershed"],
  ["alleg", "疑似被截断的 allege/allegation"],
  ["anticipat", "疑似被截断的 anticipate"],
  ["decea", "疑似被截断的 deceased/decease"],
  ["infrar", "疑似被截断的 infrared"],
  ["upris", "疑似被截断的 uprising/uprise"],
  ["wrongdo", "疑似被截断的 wrongdoing/wrongdoer"]
]);

const CONSERVATIVE_LOW_VALUE_WORDS = new Map([
  ["aepyornis", "灭绝鸟类分类名称"],
  ["zaftig", "低频俚语化形容词"],
  ["pulpwood", "林业专业词"],
  ["alidad", "测量仪器专业词"],
  ["alidade", "测量仪器专业词"],
  ["arbalest", "古代武器词"],
  ["arbalist", "古代武器相关职业词"],
  ["caprifig", "植物专业词"],
  ["cauterant", "医学专业词"],
  ["umbel", "植物学专业词"]
]);

const KNOWN_EXAMPLE_MISMATCHES = new Map([
  ["unus", "例句中的 Unus Institute 与词条给出的通用词义缺乏可验证对应"]
]);

const TEMPLATE_MEANING = /^IELTS G类实用词\s*[：:]\s*/i;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readLexicon(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const payload = JSON.parse(raw);
  const entries = Array.isArray(payload) ? payload : payload.words || payload.phrases || [];
  return { raw, payload, entries, fileHash: sha256(raw) };
}

function isPhraseEntry(entry) {
  const word = normalizeHeadword(entry?.word);
  const isReviewedCompoundHeadword =
    entry?.entryType === "headword" &&
    entry?.lexicalizedCompound === true;
  return Boolean(
    entry?.isPhrase ||
    entry?.entryType === "phrase" ||
    entry?.pos === "phrase" ||
    (word.includes(" ") && !isReviewedCompoundHeadword)
  );
}

function isExplicitProperName(entry) {
  const marker = [entry?.pos, entry?.category, entry?.meaning, entry?.definition]
    .map((value) => String(value || ""))
    .join(" ");
  return /proper noun|noun\s*\(name\)|专有名词|人名|地名|姓氏|汽车品牌/i.test(marker);
}

function hasTargetInExample(entry) {
  const example = normalizeHeadword(entry?.example);
  const targets = [entry?.word, ...(entry?.forms || []).map((item) => item?.word)]
    .map(normalizeHeadword)
    .filter(Boolean);
  return targets.some((target) => new RegExp(`(^|[^a-z])${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i").test(example));
}

function candidateBase(entry) {
  return {
    id: String(entry?.id || entry?.wordId || ""),
    word: String(entry?.word || ""),
    currentDifficulty: String(entry?.difficulty || ""),
    currentCategory: String(entry?.category || ""),
    currentMeaning: String(entry?.meaning || ""),
    currentPhonetic: String(entry?.phonetic || ""),
    issueTypes: [],
    riskLevel: "low",
    suggestedActions: [],
    evidence: [],
    allowAutomaticFix: false
  };
}

const RISK_RANK = new Map([["low", 1], ["medium", 2], ["high", 3]]);

function addIssue(state, entry, issueType, riskLevel, action, evidence) {
  const key = String(entry?.id || entry?.wordId || normalizeHeadword(entry?.word));
  if (!state.candidates.has(key)) state.candidates.set(key, candidateBase(entry));
  const candidate = state.candidates.get(key);

  if (!candidate.issueTypes.includes(issueType)) candidate.issueTypes.push(issueType);
  if (!candidate.suggestedActions.includes(action)) candidate.suggestedActions.push(action);
  if (!candidate.evidence.includes(evidence)) candidate.evidence.push(evidence);
  if ((RISK_RANK.get(riskLevel) || 0) > (RISK_RANK.get(candidate.riskLevel) || 0)) {
    candidate.riskLevel = riskLevel;
  }

  state.issues.push({
    id: candidate.id,
    word: candidate.word,
    issueType,
    riskLevel,
    suggestedAction: action,
    evidence,
    allowAutomaticFix: false
  });
}

export function auditCoreVocab(payload) {
  const words = Array.isArray(payload) ? payload : Array.isArray(payload?.words) ? payload.words : [];
  const state = { issues: [], candidates: new Map() };
  const activeWords = words.filter(isBrushableWord);
  const wordSet = new Set(words.map((entry) => normalizeHeadword(entry.word)).filter(Boolean));
  const coreWords = activeWords.filter((entry) => entry.difficulty === "中级核心");

  for (const entry of activeWords) {
    const word = normalizeHeadword(entry.word);
    if (!VALID_DIFFICULTIES.has(entry.difficulty)) {
      addIssue(state, entry, "invalid_difficulty", "high", "调整分类", `difficulty=${JSON.stringify(entry.difficulty)}`);
    }

    if (!word || !String(entry.meaning || "").trim() || !String(entry.example || "").trim()) {
      addIssue(state, entry, "required_field_missing", "high", "人工确认", "word、释义或例句存在空值");
    }

    if (isPhraseEntry(entry)) {
      addIssue(state, entry, "phrase_in_words", "high", "人工确认", "单词层检测到 phrase 型条目");
    }

    if (CONFIRMED_PERSON_NAME_WORDS.has(word)) {
      addIssue(state, entry, "confirmed_person_name", "high", "删除候选", "命中已确认人名保护清单");
    } else if (PENDING_PERSON_NAME_WORDS.has(word) || isExplicitProperName(entry)) {
      addIssue(state, entry, "proper_name_or_brand_review", "medium", "人工确认", "词性、分类或释义明确包含专名标记");
    }

    const suspiciousReason = REQUIRED_SUSPICIOUS_WORDS.get(word);
    if (suspiciousReason) {
      addIssue(state, entry, "suspicious_word_form", "high", "修正词形", suspiciousReason);
    }

    const lowValueReason = CONSERVATIVE_LOW_VALUE_WORDS.get(word);
    if (lowValueReason) {
      addIssue(state, entry, "low_utility_specialist_word", "medium", "调整分类", lowValueReason);
    }

    const mismatchReason = KNOWN_EXAMPLE_MISMATCHES.get(word);
    if (mismatchReason) {
      addIssue(state, entry, "example_meaning_mismatch", "medium", "修正释义", mismatchReason);
    }

    const pos = String(entry.pos || "").trim().toLowerCase();
    const definition = String(entry.definition || "").trim();
    if ((pos === "noun" || pos === "n") && /^to\s+[a-z]/i.test(definition)) {
      addIssue(state, entry, "pos_definition_mismatch", "medium", "人工确认", `词性为 ${entry.pos}，英文定义却以动词不定式开头`);
    }

    const linkedForms = [...(entry.forms || []), ...(entry.wordFamily || [])]
      .map((item) => normalizeHeadword(item?.word))
      .filter((form) => form && form !== word && wordSet.has(form));
    if (linkedForms.length) {
      addIssue(state, entry, "root_or_variant_overlap", "low", "保留", `词库另有词形：${[...new Set(linkedForms)].join(", ")}；仅提示人工检查，不视为重复`);
    }

    if (entry.example && !hasTargetInExample(entry) && TEMPLATE_MEANING.test(String(entry.meaning || ""))) {
      addIssue(state, entry, "template_example_review", "low", "人工确认", "模板释义条目的例句未出现当前词或已登记词形");
    }
  }

  for (const entry of coreWords) {
    if (!String(entry.phonetic || "").trim()) {
      addIssue(state, entry, "missing_phonetic", "low", "补音标", "中级核心词 phonetic 为空；缺音标不代表应删除");
    }
    if (TEMPLATE_MEANING.test(String(entry.meaning || ""))) {
      addIssue(state, entry, "template_meaning", "medium", "修正释义", `当前释义=${JSON.stringify(entry.meaning)}`);
    }

    const word = normalizeHeadword(entry.word);
    if (REQUIRED_SUSPICIOUS_WORDS.has(word) || CONSERVATIVE_LOW_VALUE_WORDS.has(word) || isExplicitProperName(entry)) {
      addIssue(state, entry, "possible_core_misclassification", "medium", "调整分类", "基础/核心层命中专名、异常词形或保守低价值观察清单");
    }
  }

  const candidates = words
    .map((entry) => state.candidates.get(String(entry?.id || entry?.wordId || normalizeHeadword(entry?.word))))
    .filter(Boolean);
  const countType = (type) => new Set(state.issues.filter((item) => item.issueType === type).map((item) => item.id || item.word)).size;
  const properLowIds = new Set(state.issues
    .filter((item) => ["proper_name_or_brand_review", "low_utility_specialist_word"].includes(item.issueType))
    .map((item) => item.id || item.word));

  return {
    summary: {
      totalWords: words.length,
      coreWords: coreWords.length,
      invalidDifficultyCount: countType("invalid_difficulty"),
      coreMissingPhoneticCount: countType("missing_phonetic"),
      coreTemplateMeaningCount: countType("template_meaning"),
      suspiciousWordFormCount: countType("suspicious_word_form"),
      suspectedLowValueProperNameCount: properLowIds.size,
      suspectedMisclassificationCount: countType("possible_core_misclassification"),
      candidateCount: candidates.length,
      automaticFixCandidateCount: candidates.filter((item) => item.allowAutomaticFix).length
    },
    methodology: {
      automaticFixDefault: false,
      properNameRule: "仅使用确认清单或词条自身的 proper noun/专有名词/人名/地名/品牌标记，不使用大小写猜测",
      lowUtilityRule: "仅使用保守人工观察清单，结果均需人工确认",
      semanticChecks: "仅报告高置信结构线索；不使用无来源模型判断自动修改词义"
    },
    issues: state.issues,
    candidates
  };
}

export function runQualityGate(payload, apiPayload = null) {
  const words = Array.isArray(payload) ? payload : Array.isArray(payload?.words) ? payload.words : [];
  const activeWords = words.filter(isBrushableWord);
  const errors = [];
  const invalid = activeWords.filter((entry) => !VALID_DIFFICULTIES.has(entry.difficulty));
  const empty = activeWords.filter((entry) => !normalizeHeadword(entry.word) || !String(entry.meaning || "").trim() || !String(entry.example || "").trim());
  const phrases = activeWords.filter(isPhraseEntry);
  const confirmedNames = activeWords.filter((entry) => CONFIRMED_PERSON_NAME_WORDS.has(normalizeHeadword(entry.word)));

  if (invalid.length) errors.push(`invalid difficulty: ${invalid.length}`);
  if (empty.length) errors.push(`required field missing: ${empty.length}`);
  if (phrases.length) errors.push(`phrase entries in words: ${phrases.length}`);
  if (confirmedNames.length) errors.push(`confirmed person names: ${confirmedNames.length}`);
  if (!Array.isArray(payload) && Number(payload?.count) !== words.length) errors.push("active count metadata mismatch");
  if (!Array.isArray(payload) && (!payload?.version || !payload?.savedAt || !payload?.lexiconHash)) {
    errors.push("active metadata incomplete");
  }

  if (apiPayload) {
    if (Number(apiPayload.count) !== words.length) errors.push("API count mismatch");
    if (apiPayload.version !== payload.version) errors.push("API version mismatch");
    if (apiPayload.lexiconHash !== payload.lexiconHash) errors.push("API lexiconHash mismatch");
    if (apiPayload.wordsHash !== sha256(JSON.stringify(words))) errors.push("API wordsHash mismatch");
  }

  return { ok: errors.length === 0, errors };
}

export function buildReports(wordsFile, phrasesFile) {
  const audit = auditCoreVocab(wordsFile.payload);
  const gate = runQualityGate(wordsFile.payload);
  const generatedAt = new Date().toISOString();
  const common = {
    generatedAt,
    readOnlySourceAudit: true,
    source: {
      wordsPath: path.relative(ROOT, WORDS_PATH).replace(/\\/g, "/"),
      wordsFileHash: wordsFile.fileHash,
      wordsArrayHash: sha256(JSON.stringify(wordsFile.entries)),
      phrasesPath: path.relative(ROOT, PHRASES_PATH).replace(/\\/g, "/"),
      phrasesFileHash: phrasesFile.fileHash
    }
  };

  return {
    auditReport: { ...common, gate, summary: audit.summary, methodology: audit.methodology, issues: audit.issues },
    candidateReport: { ...common, summary: audit.summary, candidates: audit.candidates }
  };
}

function main() {
  const wordsFile = readLexicon(WORDS_PATH);
  const phrasesFile = readLexicon(PHRASES_PATH);
  const { auditReport, candidateReport } = buildReports(wordsFile, phrasesFile);
  const args = new Set(process.argv.slice(2));

  if (args.has("--write-reports")) {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(auditReport, null, 2)}\n`, "utf8");
    fs.writeFileSync(CANDIDATE_PATH, `${JSON.stringify(candidateReport, null, 2)}\n`, "utf8");
  }

  const output = args.has("--gate") ? auditReport.gate : {
    ok: true,
    reportsWritten: args.has("--write-reports"),
    reportPath: path.relative(ROOT, REPORT_PATH),
    candidatePath: path.relative(ROOT, CANDIDATE_PATH),
    summary: auditReport.summary,
    gate: auditReport.gate
  };
  console.log(JSON.stringify(output, null, 2));
  if (args.has("--gate") && !auditReport.gate.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
