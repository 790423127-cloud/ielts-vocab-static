import crypto from "node:crypto";
import {
  IRREGULAR_VERB_FORMS,
  IRREGULAR_PLURAL_FORMS,
  buildRegularPlural,
  detectRegularPlural
} from "../../app/lib/vocab/page-word-helpers.mjs";

export const SEMANTIC_QUALITY_VERSION = "vocab-semantic-quality-v1-20260715";

export const PATCH_COLUMNS = [
  "id", "word", "action", "setJson", "addFormsJson", "addMeaningsJson",
  "addQuizSensesJson", "reason", "evidence", "expectedMeaningHash", "expectedExampleHash"
];

export const ALLOWED_ACTIONS = new Set([
  "repair", "delete", "reclassify", "add-form", "add-sense", "keep", "defer"
]);

export const USER_PROGRESS_FIELDS = new Set([
  "status", "favorite", "reviewCount", "lastReviewedAt", "nextReviewAt",
  "correctCount", "wrongCount", "correctStreak", "srs", "reviewStats",
  "lastSeenAt", "familiarity", "mastery"
]);

const CHINESE_RE = /[\u3400-\u9fff]/u;
const ENCODING_DAMAGE_RE = /(?:ï¿½|�|锟斤拷|鈥|闁|妫|瀹|鎴|绛|璇|鍗|浠|銆)/u;
const PLACEHOLDER_MEANING_RE = /(?:无中文释义|暂无释义|待补充|待完善|待审核|需要复核|IELTS\s*G类实用词\s*[：:]|专有名词，需结合原文识别|非标准词形或来源残留)/iu;
const PLACEHOLDER_EXAMPLE_RE = /(?:TODO|TBD|\[[^\]]*(?:word|example|例句|填入|待补)[^\]]*\]|等待\s*AI|例句待补全)/iu;
const GENERIC_EXAMPLE_CN_RE = /^(?:与住房相关的实用例句。|与工作相关的实用例句。|与阅读相关的实用例句。|与G类书信相关的实用例句。|与银行相关的实用例句。|与交通相关的实用例句。)$/u;
const GENERIC_DETAIL_RES = [
  /^(?:“[A-Za-z][A-Za-z' -]*”|[A-Za-z][A-Za-z' -]*)常见含义为[：:]\s*/u,
  /^(?:“[A-Za-z][A-Za-z' -]*”|[A-Za-z][A-Za-z' -]*)表示[“"]?[^”"]+[”"]?。?$/u,
  /^[A-Za-z][A-Za-z' -]*\s*[：:]\s*/u
];
const VALID_SHORT_HEADWORDS = new Set([
  "a", "am", "an", "as", "at", "be", "by", "cd", "cv", "cc", "de", "do", "e", "go", "gp",
  "he", "i", "if", "ii", "in", "is", "it", "me", "mr", "ms", "my", "n", "no", "of", "ok",
  "on", "or", "ox", "re", "s", "so", "to", "up", "us", "we"
]);
const EMPTY_SLOT_RE = /\b(?:with|in|on|of|a|an|the|to|from|at|by|for)\s+[.!?](?:\s|$)/i;
const KNOWN_CONTENT_MISMATCH = new Map([
  ["payload", "英文为10 tons，中文为5吨"],
  ["janitor", "英文写清洁办公室，中文写锁门，内容不对应"]
]);
const KNOWN_BAD_HEADWORDS = new Set(["neff"]);
const KNOWN_COMPOUNDS = new Map([
  ["claimform", ["claim form"]],
  ["byproduct", ["by-product", "by product"]],
  ["dropoff", ["drop-off", "drop off"]],
  ["dutyfree", ["duty-free", "duty free"]]
]);
const EXTRA_IRREGULARS = new Map(Object.entries({
  fought: "fight", fled: "flee", met: "meet", overtook: "overtake", overtaken: "overtake",
  spun: "spin", swore: "swear", sworn: "swear", wept: "weep", won: "win",
  accused: "accuse", leaves: "leaf", wolves: "wolf"
}));

export function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ");
}

export function normalizeLoose(value = "") {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "");
}

export function hasChinese(value) {
  return CHINESE_RE.test(String(value || ""));
}

export function hashMeaning(entry) {
  return sha256(JSON.stringify({
    meaning: entry?.meaning ?? "",
    definition: entry?.definition ?? "",
    meaningDetailedZh: entry?.meaningDetailedZh ?? "",
    meaningDetailZh: entry?.meaningDetailZh ?? "",
    meaningsZh: entry?.meaningsZh ?? [],
    quizSenses: entry?.quizSenses ?? []
  }));
}

export function hashExample(entry) {
  return sha256(JSON.stringify({ example: entry?.example ?? "", exampleCn: entry?.exampleCn ?? "" }));
}

function addVariant(set, value) {
  const text = normalizeText(value);
  if (!text) return;
  set.add(text);
  set.add(text.replace(/-/g, " "));
  set.add(text.replace(/[ -]/g, ""));
}

function regularVerbForms(word) {
  if (!/^[a-z][a-z'-]*$/.test(word)) return [];
  const consonantY = /[^aeiou]y$/.test(word);
  const endsE = /e$/.test(word);
  const cvc = /[^aeiou][aeiou][^aeiouwxy]$/.test(word) && word.length <= 6;
  const third = consonantY ? `${word.slice(0, -1)}ies` : /(?:s|x|z|ch|sh|o)$/.test(word) ? `${word}es` : `${word}s`;
  const past = consonantY ? `${word.slice(0, -1)}ied` : endsE ? `${word}d` : cvc ? `${word}${word.at(-1)}ed` : `${word}ed`;
  const ing = endsE && !/(?:ee|ye|oe)$/.test(word) ? `${word.slice(0, -1)}ing` : cvc ? `${word}${word.at(-1)}ing` : `${word}ing`;
  return [third, past, ing];
}

export function collectMorphologyVariants(entry) {
  const variants = new Set();
  const headword = normalizeText(entry?.word);
  addVariant(variants, headword);
  for (const value of entry?.acceptedAnswers || []) addVariant(variants, value);
  for (const item of entry?.forms || []) addVariant(variants, item?.word ?? item);
  for (const item of entry?.wordFamily || []) addVariant(variants, item?.word ?? item);
  for (const value of KNOWN_COMPOUNDS.get(headword) || []) addVariant(variants, value);

  for (const [form, details] of Object.entries(IRREGULAR_VERB_FORMS || {})) {
    if (normalizeText(details?.base) === headword) addVariant(variants, form);
  }
  for (const [form, details] of Object.entries(IRREGULAR_PLURAL_FORMS || {})) {
    if (normalizeText(details?.base) === headword) addVariant(variants, form);
  }
  for (const [form, base] of EXTRA_IRREGULARS) {
    if (base === headword) addVariant(variants, form);
  }
  if (headword && !headword.includes(" ")) {
    addVariant(variants, buildRegularPlural(headword));
    for (const form of regularVerbForms(headword)) addVariant(variants, form);
  }
  const inferredBase = detectRegularPlural(headword);
  if (inferredBase) addVariant(variants, inferredBase);
  return variants;
}

function containsVariant(example, variants) {
  const text = normalizeText(example);
  const loose = normalizeLoose(example);
  for (const variant of variants) {
    if (!variant) continue;
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(text)) return true;
    if (/[ -]/.test(variant) && variant.length >= 4 && loose.includes(normalizeLoose(variant))) return true;
  }
  return false;
}

export function exampleTargetStatus(entry) {
  const example = String(entry?.example || "");
  const headwordOnly = new Set();
  addVariant(headwordOnly, entry?.word);
  const rawMatch = containsVariant(example, headwordOnly);
  const variants = collectMorphologyVariants(entry);
  return { rawMatch, morphologyMatch: containsVariant(example, variants), variants: [...variants] };
}

function normalizeNumberTokens(text) {
  let value = normalizeText(text)
    .replace(/10,?000|一万/g, " 10000 ")
    .replace(/2\s*billion|20亿/g, " 2000000000 ")
    .replace(/20\s*%|百分之二十|八折/g, " 20percent ")
    .replace(/十吨/g, " 10tons ")
    .replace(/五吨/g, " 5tons ");
  value = value
    .replace(/(\d+(?:\.\d+)?)\s*million/g, (_, number) => ` ${Number(number) * 1_000_000} `)
    .replace(/(\d+(?:\.\d+)?)\s*billion/g, (_, number) => ` ${Number(number) * 1_000_000_000} `)
    .replace(/(\d+(?:\.\d+)?)\s*万/g, (_, number) => ` ${Number(number) * 10_000} `)
    .replace(/(\d+(?:\.\d+)?)\s*亿/g, (_, number) => ` ${Number(number) * 100_000_000} `)
    .replace(/(?<=\d),(?=\d)/g, "");
  return new Set(value.match(/\d+(?:\.\d+)?(?:percent|tons)?/g) || []);
}

export function hasNumberMismatch(entry) {
  const word = normalizeText(entry?.word);
  if (word === "payload") return /\b10\s+tons?\b/i.test(String(entry?.example || "")) && /5\s*吨/u.test(String(entry?.exampleCn || ""));
  const combined = `${entry?.example || ""} ${entry?.exampleCn || ""}`;
  if (/(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|月|世纪|年代|a\.m\.|p\.m\.|\bam\b|\bpm\b|点半)/i.test(combined)) return false;
  const english = normalizeNumberTokens(entry?.example);
  const chinese = normalizeNumberTokens(entry?.exampleCn);
  if (!english.size || !chinese.size) return false;
  return [...english].some((number) => !chinese.has(number)) || [...chinese].some((number) => !english.has(number));
}

function issue(priority, category, entry, evidence, disposition = "defer") {
  return {
    priority,
    category,
    id: String(entry?.id || entry?.wordId || ""),
    word: String(entry?.word || ""),
    evidence,
    disposition
  };
}

function splitMeaningSenses(value = "") {
  return [...new Set(String(value).split(/\s*[；;|]\s*/u).map((part) => part.trim()).filter(Boolean))];
}

function exampleTemplateSkeleton(entry) {
  let skeleton = normalizeText(entry?.example);
  const variants = [...collectMorphologyVariants(entry)].sort((a, b) => b.length - a.length);
  for (const variant of variants) {
    if (!variant) continue;
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    skeleton = skeleton.replace(new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "gi"), "$1{target}$2");
  }
  return skeleton.replace(/\s+/g, " ").trim();
}

export function isGenericMeaningDetail(entry) {
  const detail = String(entry?.meaningDetailedZh || entry?.meaningDetailZh || "").trim();
  return Boolean(detail && GENERIC_DETAIL_RES.some((pattern) => pattern.test(detail)));
}

export function isUsefulDetailedMeaning(entry) {
  const detail = String(entry?.meaningDetailedZh || "").trim();
  if (!detail || PLACEHOLDER_MEANING_RE.test(detail) || isGenericMeaningDetail({ ...entry, meaningDetailZh: detail })) return false;
  return normalizeText(detail) !== normalizeText(entry?.meaning);
}

export function auditSemanticVocabulary(payload, options = {}) {
  const allWords = Array.isArray(payload) ? payload : payload?.words || [];
  const sourceWords = allWords.filter((entry) => {
    if (options.onlyGt && !entry?.gtPlanStage && !(entry?.topics || []).some((topic) => /G类/u.test(String(topic)))) return false;
    if (options.onlyCore && !["基础高频", "中级核心"].includes(entry?.difficulty)) return false;
    return true;
  });
  const issues = [];
  const ids = new Map();
  const heads = new Map();
  const exampleSkeletons = new Map();
  let strictExampleCandidates = 0;
  let acceptedByMorphology = 0;

  for (const entry of sourceWords) {
    const id = String(entry?.id || entry?.wordId || "");
    const word = normalizeText(entry?.word);
    const meaning = String(entry?.meaning || "").trim();
    const definition = String(entry?.definition || "").trim();
    const example = String(entry?.example || "").trim();
    const exampleCn = String(entry?.exampleCn || "").trim();
    const detailedMeaning = String(entry?.meaningDetailedZh || "").trim();
    const learningDetail = String(entry?.meaningDetailZh || "").trim();
    const hasEnglishDefinition = /[A-Za-z]{3}/.test(definition) && !hasChinese(definition);
    const hasStructuredMeanings = Array.isArray(entry?.meaningsZh) && entry.meaningsZh.some((sense) => String(sense?.gloss || "").trim());
    const hasHighQuizSenses = Array.isArray(entry?.quizSenses) && entry.quizSenses.some((sense) => String(sense?.confidence || "").toLowerCase() === "high");
    const hasV2Fallback = entry?.definitionSource === "legacy-chinese-fallback" && hasStructuredMeanings;
    const isReferenceEntry = entry?.studyMode === "reference";
    const hasMultipleMeanings = splitMeaningSenses(meaning).length > 1;

    if (!meaning) issues.push(issue("P0", "missing_meaning", entry, "meaning为空", "repair"));
    else if (!hasChinese(meaning)) issues.push(issue("P0", "meaning_without_chinese", entry, meaning, "repair"));
    if (PLACEHOLDER_MEANING_RE.test(meaning)) issues.push(issue("P0", "placeholder_meaning", entry, meaning, "repair"));
    if (ENCODING_DAMAGE_RE.test(meaning)) issues.push(issue("P0", "meaning_encoding_damage", entry, meaning, "repair"));
    if (meaning && meaning.length <= 1 && !hasEnglishDefinition && !hasStructuredMeanings) issues.push(issue("P1", "meaning_too_thin", entry, meaning));
    if (!definition) issues.push(issue("P2", "definition_missing", entry, "definition为空"));
    else if (normalizeText(definition) === normalizeText(meaning) && !hasV2Fallback) issues.push(issue("P2", "definition_equals_meaning", entry, definition));
    if (definition && hasChinese(definition) && !/[A-Za-z]{3}/.test(definition) && !hasV2Fallback) issues.push(issue("P2", "definition_chinese_only", entry, definition));
    if (/^(?:n\.?|noun)$/i.test(String(entry?.pos || "").trim()) && /^to\s+[a-z]/i.test(definition)) issues.push(issue("P1", "definition_pos_mismatch", entry, definition));

    if (!detailedMeaning && !hasStructuredMeanings && !hasEnglishDefinition) issues.push(issue("P2", "missing_learning_enrichment", entry, "缺少可信英文定义、具体详细释义或结构化中文义项"));
    if (learningDetail && isGenericMeaningDetail(entry) && !hasStructuredMeanings && !hasEnglishDefinition) issues.push(issue("P2", "generic_meaning_detail", entry, learningDetail));
    if (detailedMeaning && normalizeText(detailedMeaning) === normalizeText(meaning) && !hasStructuredMeanings && !hasEnglishDefinition) issues.push(issue("P2", "meaning_detailed_not_expanded", entry, detailedMeaning));
    if (hasMultipleMeanings && !(entry?.meaningsZh || []).length) issues.push(issue("P1", "multi_meaning_without_structured_senses", entry, meaning));
    if (hasMultipleMeanings && ["基础高频", "中级核心"].includes(entry?.difficulty) && !hasHighQuizSenses) {
      issues.push(issue("P1", "multi_meaning_without_quiz_senses", entry, meaning));
    }

    if (!example) issues.push(issue("P0", "missing_example", entry, "example为空", "repair"));
    else {
      const tokenCount = example.match(/[A-Za-z]+/g)?.length || 0;
      if (tokenCount < 4) issues.push(issue("P1", "short_example", entry, example));
      if (EMPTY_SLOT_RE.test(example) || /\s+[.!](?:\s|$)/.test(example)) {
        issues.push(issue("P0", "unfinished_example", entry, example, "repair"));
      }
      if (PLACEHOLDER_EXAMPLE_RE.test(example)) issues.push(issue("P0", "placeholder_example", entry, example, "repair"));
      if (ENCODING_DAMAGE_RE.test(example)) issues.push(issue("P0", "example_encoding_damage", entry, example, "repair"));
      if (/\s+[,.!?;:](?:\s|$)/.test(example)) issues.push(issue("P0", "space_before_punctuation", entry, example, "repair"));
      const target = exampleTargetStatus(entry);
      if (!target.rawMatch) {
        strictExampleCandidates += 1;
        if (target.morphologyMatch) acceptedByMorphology += 1;
        else issues.push(issue("P1", "target_absent_after_morphology", entry, example));
      }
      const skeleton = exampleTemplateSkeleton(entry).replace(/\d+/g, "#");
      if (skeleton) exampleSkeletons.set(skeleton, [...(exampleSkeletons.get(skeleton) || []), entry]);
    }
    if (!exampleCn) issues.push(issue("P0", "missing_example_cn", entry, "exampleCn为空", "repair"));
    else if (GENERIC_EXAMPLE_CN_RE.test(exampleCn)) issues.push(issue("P0", "generic_example_cn", entry, exampleCn, "repair"));
    if (ENCODING_DAMAGE_RE.test(exampleCn)) issues.push(issue("P0", "example_cn_encoding_damage", entry, exampleCn, "repair"));
    const knownMismatchStillPresent = word === "payload"
      ? hasNumberMismatch(entry)
      : word === "janitor" && /锁|锁门/u.test(exampleCn);
    if (KNOWN_CONTENT_MISMATCH.has(word) && knownMismatchStillPresent) issues.push(issue("P0", "obvious_translation_mismatch", entry, KNOWN_CONTENT_MISMATCH.get(word), "repair"));
    if (hasNumberMismatch(entry)) issues.push(issue(KNOWN_CONTENT_MISMATCH.has(word) ? "P0" : "P1", "number_mismatch", entry, `${example} <> ${exampleCn}`, KNOWN_CONTENT_MISMATCH.has(word) ? "repair" : "defer"));

    if (ids.has(id)) issues.push(issue("P0", "duplicate_stable_id", entry, `与${ids.get(id).word}重复`, "repair"));
    else ids.set(id, entry);
    if (heads.has(word)) issues.push(issue("P0", "duplicate_normalized_headword", entry, `与${heads.get(word).id || heads.get(word).wordId}重复`, "repair"));
    else heads.set(word, entry);
    if (!isReferenceEntry && ((/^[a-z]{1,2}$/.test(word) && !VALID_SHORT_HEADWORDS.has(word)) || /(?:alleg|anticipat|decea|infrar|watersh|wrongdo)$/.test(word))) issues.push(issue("P1", "truncated_headword", entry, word));
    if (KNOWN_BAD_HEADWORDS.has(word)) issues.push(issue("P0", "probable_typo", entry, "来源噪声，无通用学习价值", "delete"));
    const registeredForms = new Set((entry?.forms || []).map((form) => normalizeText(form?.word ?? form)));
    if (KNOWN_COMPOUNDS.has(word) && !KNOWN_COMPOUNDS.get(word).some((form) => registeredForms.has(normalizeText(form)))) issues.push(issue("P1", "compound_without_space_or_hyphen", entry, KNOWN_COMPOUNDS.get(word).join(" / "), "add-form"));
    if (/\s/.test(word) && entry?.entryType !== "phrase") issues.push(issue("P1", "phrase_in_word_lexicon", entry, word));
    if (!isReferenceEntry && !entry?.allowProperNameStudy && /proper noun|专有名词|人名|来源残留/i.test(`${entry?.pos || ""} ${meaning} ${definition}`)) issues.push(issue("P1", "proper_name_or_source_noise", entry, `${entry?.pos || ""} ${meaning}`));
  }

  for (const entries of exampleSkeletons.values()) {
    if (entries.length < 4) continue;
    for (const entry of entries) issues.push(issue("P3", "controlled_template_example", entry, `同类词受控句型出现${entries.length}次`, "keep"));
  }

  const filteredIssues = options.priority ? issues.filter((item) => item.priority === options.priority) : issues;
  const limitedIssues = options.batchSize ? filteredIssues.slice(0, options.batchSize) : filteredIssues;
  const categoryCounts = {};
  const priorityCounts = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const item of issues) {
    categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
    priorityCounts[item.priority] = (priorityCounts[item.priority] || 0) + 1;
  }
  const p0EntryIds = new Set(issues.filter((item) => item.priority === "P0").map((item) => item.id || item.word));
  return {
    summary: {
      totalWords: allWords.length,
      auditedWords: sourceWords.length,
      issueCount: issues.length,
      p0IssueCount: priorityCounts.P0,
      p0EntryCount: p0EntryIds.size,
      strictExampleCandidates,
      acceptedByMorphology,
      targetAbsentAfterMorphology: categoryCounts.target_absent_after_morphology || 0,
      priorityCounts,
      categoryCounts
    },
    methodology: {
      paidApiCalls: 0,
      externalPerWordLookups: 0,
      morphologySources: ["IRREGULAR_VERB_FORMS", "IRREGULAR_PLURAL_FORMS", "detectRegularPlural", "buildRegularPlural", "forms", "wordFamily", "acceptedAnswers"],
      strictCandidateDefinition: "例句未直接出现词头；先接受已登记词形、规则词形、不规则词形及连字符/空格等价形式"
    },
    issues: limitedIssues,
    allIssueCount: issues.length
  };
}

export function toTsv(rows, columns) {
  const escape = (value) => String(value ?? "").replace(/[\t\r\n]+/g, " ");
  return `${columns.join("\t")}\n${rows.map((row) => columns.map((column) => escape(row[column])).join("\t")).join("\n")}${rows.length ? "\n" : ""}`;
}
