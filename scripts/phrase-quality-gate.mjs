/**
 * Phrase-layer quality gate (read-only by default).
 * Usage:
 *   node scripts/phrase-quality-gate.mjs
 *   node scripts/phrase-quality-gate.mjs --gate
 *   node scripts/phrase-quality-gate.mjs --write-reports
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PHRASES_PATH = path.join(ROOT, "public", "data", "phrases.json");
const REPORT_PATH = path.join(ROOT, "reports", "phrase-quality-gate.json");

const MARKER = "无中文释义";
const FATAL_CODES = [
  "missingZhMarker",
  "emptyZh",
  "typoIl",
  "truncatedSupposin",
  "grammarStudyHave",
  "mistransHeart",
  "truncatedHeadword",
  "grammarOnlyMeaning",
  "machinePlaceholderMeaning",
  "abruptTruncation"
];
const WARNING_CODES = [
  "semanticPolarityMismatch",
  "mechanicalMeaning",
  "unbalancedDelimiter"
];

const PLACEHOLDER_MEANING_RE = /^(?:(?:暂无|没有|未提供|未找到|缺少)(?:中文)?(?:释义|翻译|含义)|(?:中文)?(?:释义|翻译|含义)(?:缺失|待补充)|待(?:补充|翻译|完善)|无中文释义|n\/?a|todo|tbd|placeholder|translation pending)$/i;
const GRAMMAR_TERM = "(?:过去式|过去时|过去分词|现在式|现在时|现在分词|将来式|将来时|第三人称单数(?:形式)?|比较级|最高级|语法形式|时态变化)";
const GRAMMAR_ONLY_PATTERNS = [
  new RegExp(`^(?:(?:该|此|本)(?:词|短语|表达)(?:是|为)?|[A-Za-z][A-Za-z' -]{0,60}(?:的|是|为))?(?:动词|形容词)?${GRAMMAR_TERM}(?:形式)?(?:[:：][A-Za-z][A-Za-z' -]{0,60})?[。.]*$`, "i"),
  new RegExp(`^(?:(?:该|此|本)(?:词|短语|表达)(?:是|为)?\\s*)?(?:[A-Za-z][A-Za-z' -]{0,40}(?:是|为)\\s*)?[A-Za-z][A-Za-z' -]{0,40}的${GRAMMAR_TERM}(?:形式)?[。.]*$`, "i")
];
const MACHINE_PLACEHOLDER_RE = /^(?:由\s*)?(?:ai|机器|自动)\s*(?:生成)?\s*(?:的)?\s*(?:占位)?\s*(?:释义|翻译)?\s*[,，;；:：]?\s*(?:待|请)\s*(?:人工)?\s*(?:补充|翻译|校对|完善)$/i;
const TRUNCATED_G_WORD_RE = /\b(?:supposin|thinkin|goin|havin|doin|lookin|workin|tryin|makin|comin|gettin|runnin|writin|readin|talkin)$/i;
const MECHANICAL_MEANING_PATTERNS = [
  /(?:直译(?:为|是)|字面(?:翻译|意思)(?:为|是)|按字面翻译|机械翻译|逐字翻译)/,
  /^[“"']?[A-Za-z][^”"']{1,80}[”"']?\s*(?:的中文(?:释义|翻译|意思)|(?:中文)?意思)(?:是|为)/i
];
const SEMANTIC_POLARITY_RULES = [
  {
    english: /\b(?:increase|rise|growth|grow|go up|higher)\b/i,
    englishOpposite: /\b(?:decrease|decline|fall|drop|reduce|lower|go down)\b/i,
    chineseOpposite: /下降|减少|降低|下跌|衰减/,
    clue: "upward English cue with downward Chinese cue"
  },
  {
    english: /\b(?:decrease|decline|fall|drop|reduce|lower|go down)\b/i,
    englishOpposite: /\b(?:increase|rise|growth|grow|go up|higher)\b/i,
    chineseOpposite: /上升|增加|增长|提高|上涨/,
    clue: "downward English cue with upward Chinese cue"
  },
  {
    english: /\bbefore\b/i,
    englishOpposite: /\bafter\b/i,
    chineseOpposite: /之后|以后/,
    clue: "before/after direction differs"
  },
  {
    english: /\bafter\b/i,
    englishOpposite: /\bbefore\b/i,
    chineseOpposite: /之前|以前/,
    clue: "after/before direction differs"
  },
  {
    english: /\bat least\b/i,
    englishOpposite: /\bat most\b/i,
    chineseOpposite: /至多|最多|不超过/,
    clue: "at least/at most direction differs"
  },
  {
    english: /\bat most\b/i,
    englishOpposite: /\bat least\b/i,
    chineseOpposite: /至少|最少|不少于/,
    clue: "at most/at least direction differs"
  }
];

function textOf(entry) {
  return [
    entry?.word,
    entry?.phrase,
    entry?.answer,
    entry?.meaning,
    entry?.definition,
    entry?.example,
    entry?.exampleCn
  ]
    .map((value) => String(value || ""))
    .join("\n");
}

function zhOf(entry) {
  return String(entry?.meaning || entry?.chinese || entry?.meaningZh || "").trim();
}

function headOf(entry) {
  return String(entry?.phrase || entry?.word || entry?.answer || "").trim();
}

function isGrammarOnlyMeaning(value) {
  const compact = value.replace(/\s+/g, " ").trim();
  return GRAMMAR_ONLY_PATTERNS.some((pattern) => pattern.test(compact));
}

function placeholderMeaning(value) {
  const normalized = value.replace(/[。.!！?？]+$/g, "").trim();
  return PLACEHOLDER_MEANING_RE.test(normalized) || MACHINE_PLACEHOLDER_RE.test(normalized);
}

function semanticPolarityClue(head, zh) {
  const match = SEMANTIC_POLARITY_RULES.find(
    (rule) => rule.english.test(head) && !rule.englishOpposite.test(head) && rule.chineseOpposite.test(zh)
  );
  return match?.clue || "";
}

function mechanicalMeaningClue(zh) {
  if (MECHANICAL_MEANING_PATTERNS[0].test(zh)) return "literal-translation editorial wording";
  if (MECHANICAL_MEANING_PATTERNS[1].test(zh)) return "machine-style headword-to-meaning wrapper";
  return "";
}

function unbalancedDelimiterField(head, zh) {
  const pairs = [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
    ["“", "”"]
  ];
  for (const [field, value] of [["head", head], ["meaning", zh]]) {
    for (const [left, right] of pairs) {
      const leftCount = value.split(left).length - 1;
      const rightCount = value.split(right).length - 1;
      if (leftCount !== rightCount) return { field, evidence: `${left}${right}: ${leftCount}/${rightCount}` };
    }
  }
  return null;
}

function abruptTruncationField(head, zh) {
  if (/\uFFFD$/.test(head)) return { field: "head", evidence: "replacement character at end" };
  if (/\uFFFD$/.test(zh)) return { field: "meaning", evidence: "replacement character at end" };
  if (/[A-Za-z]{2,}[-/]$/.test(head)) return { field: "head", evidence: "dangling word separator" };
  return null;
}

function findingRow(entry, code, severity, field, evidence, message) {
  return {
    id: String(entry?.id || entry?.wordId || headOf(entry)),
    head: headOf(entry),
    zh: zhOf(entry).slice(0, 120),
    severity,
    code,
    field,
    evidence: String(evidence || "").slice(0, 160),
    message
  };
}

export function auditPhrases(payload) {
  const phrases = Array.isArray(payload?.phrases)
    ? payload.phrases
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload)
        ? payload
        : [];

  const findings = Object.fromEntries(
    [...FATAL_CODES, ...WARNING_CODES].map((code) => [code, []])
  );
  const add = (entry, code, severity, field, evidence, message) => {
    findings[code].push(findingRow(entry, code, severity, field, evidence, message));
  };

  for (const entry of phrases) {
    const head = headOf(entry);
    const zh = zhOf(entry);
    const blob = textOf(entry);

    if (zh.includes(MARKER)) {
      add(entry, "missingZhMarker", "fatal", "meaning", MARKER, "Chinese meaning is a missing-meaning marker");
    }
    if (!zh) add(entry, "emptyZh", "fatal", "meaning", "", "Chinese meaning is empty");
    if (/\bI'l\b/i.test(blob) || head.startsWith("I'l ")) {
      add(entry, "typoIl", "fatal", "entry", "I'l", "English contraction is malformed");
    }
    if (/supposin(?!g)/i.test(blob)) {
      add(entry, "truncatedSupposin", "fatal", "entry", "supposin", "English token is truncated");
    }
    if (/\bThe study have\b/i.test(blob)) {
      add(entry, "grammarStudyHave", "fatal", "entry", "The study have", "English subject-verb agreement is invalid");
    }
    if (zh.includes("谎言的心脏")) {
      add(entry, "mistransHeart", "fatal", "meaning", "谎言的心脏", "Known mechanical mistranslation remains");
    }
    if (TRUNCATED_G_WORD_RE.test(head)) {
      add(entry, "truncatedHeadword", "fatal", "head", head.split(/\s+/).at(-1), "Headword appears to be missing final g");
    }
    if (zh && isGrammarOnlyMeaning(zh)) {
      add(entry, "grammarOnlyMeaning", "fatal", "meaning", zh, "Grammar or tense metadata is being used as the meaning");
    }
    if (zh && !zh.includes(MARKER) && placeholderMeaning(zh)) {
      add(entry, "machinePlaceholderMeaning", "fatal", "meaning", zh, "Machine/editorial placeholder is being used as the meaning");
    }

    const abrupt = abruptTruncationField(head, zh);
    if (abrupt) {
      add(entry, "abruptTruncation", "fatal", abrupt.field, abrupt.evidence, "Text ends with a strong truncation marker");
    }

    const polarityClue = semanticPolarityClue(head, zh);
    if (polarityClue) {
      add(entry, "semanticPolarityMismatch", "warning", "head+meaning", polarityClue, "Headword and Chinese meaning may point in opposite directions");
    }

    const mechanicalClue = mechanicalMeaningClue(zh);
    if (mechanicalClue) {
      add(entry, "mechanicalMeaning", "warning", "meaning", mechanicalClue, "Meaning contains machine-like or literal-translation editorial wording");
    }

    const delimiter = unbalancedDelimiterField(head, zh);
    if (delimiter) {
      add(entry, "unbalancedDelimiter", "warning", delimiter.field, delimiter.evidence, "Unbalanced delimiters may indicate truncated text");
    }
  }

  const fatalCounts = Object.fromEntries(
    FATAL_CODES.map((code) => [code, findings[code].length])
  );
  const warningCounts = Object.fromEntries(
    WARNING_CODES.map((code) => [code, findings[code].length])
  );
  const fatalTotal = Object.values(fatalCounts).reduce((sum, n) => sum + n, 0);
  const warningTotal = Object.values(warningCounts).reduce((sum, n) => sum + n, 0);
  const errors = Object.entries(fatalCounts)
    .filter(([, n]) => n > 0)
    .map(([key, n]) => `${key}: ${n}`);

  return {
    ok: fatalTotal === 0,
    count: phrases.length,
    payloadCount: Number(payload?.count || phrases.length),
    fatalTotal,
    fatalCounts,
    warningTotal,
    warningCounts,
    errors,
    findings
  };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const raw = fs.readFileSync(PHRASES_PATH, "utf8");
  const payload = JSON.parse(raw);
  const report = {
    generatedAt: new Date().toISOString(),
    source: path.relative(ROOT, PHRASES_PATH).replace(/\\/g, "/"),
    ...auditPhrases(payload)
  };

  const gate = {
    ok: report.ok,
    count: report.count,
    fatalTotal: report.fatalTotal,
    fatalCounts: report.fatalCounts,
    warningTotal: report.warningTotal,
    warningCounts: report.warningCounts,
    errors: report.errors,
    findings: report.findings
  };

  if (args.has("--write-reports")) {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  console.log(JSON.stringify(args.has("--gate") ? gate : report, null, 2));
  if (args.has("--gate") && !gate.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
