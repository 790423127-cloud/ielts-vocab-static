import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, ".static-export-cache", "words.json");
const OUT_DIR = path.join(ROOT, "reports", "full-vocab-semantic-audit");
const OUT_JSON = path.join(OUT_DIR, "audit.json");
const OUT_TSV = path.join(OUT_DIR, "candidates.tsv");
const OUT_SUMMARY = path.join(OUT_DIR, "summary.md");

const CJK = /[\u3400-\u9fff]/;
const REPLACEMENT = /\uFFFD|锟斤拷|ï¿½|鈥[™œ“”]|鐨勬|鏄|涓枃|鍙互|璇嶄箟|渚嬪彞|鎰忔€?/;
const PLACEHOLDER = /无中文释义|暂无释义|待补充|待完善|待审核|需要复核|来源残留|非标准词形|专有名词.{0,8}结合原文|IELTS\s*G类实用词\s*[：:]|^(unknown|n\/?a|null|undefined|-|—)$/i;
const GENERIC_DETAIL = /^(?:“|\")?.+?(?:”|\")?(?:常见含义为|表示|意思是)[：:]?/;
const BAD_EXAMPLE = /\b(?:example sentence|sample sentence|insert sentence|todo|tbd)\b|[<>\[\]{}]|_{2,}/i;
const GENERIC_POS = new Set(["", "word", "unknown", "n/a", "reference"]);
const VALID_DIFFICULTIES = new Set(["基础高频", "中级核心", "高级加分", "阅读扩展", "低频认识即可"]);

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const norm = (value) => String(value || "")
  .normalize("NFKC")
  .trim()
  .toLowerCase()
  .replace(/[’‘]/g, "'")
  .replace(/[‐‑‒–—]/g, "-")
  .replace(/\s+/g, " ");
const englishTokens = (value) => String(value || "").match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
const cjkCount = (value) => (String(value || "").match(/[\u3400-\u9fff]/g) || []).length;
const uniq = (items) => [...new Set(items.filter(Boolean))];
const safe = (value) => String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");

function isPhrase(entry) {
  return Boolean(entry?.isPhrase || entry?.entryType === "phrase" || entry?.pos === "phrase" || norm(entry?.word).includes(" "));
}

function isReference(entry) {
  return entry?.studyMode === "reference"
    || entry?.difficulty === "低频认识即可"
    || /参考|专名|来源待核|拼写变体/.test(String(entry?.category || ""));
}

function isHighImpact(entry) {
  const topics = Array.isArray(entry?.topics) ? entry.topics.join(" ") : "";
  const uses = Array.isArray(entry?.ieltsUse) ? entry.ieltsUse.join(" ") : "";
  return Boolean(
    entry?.readingPriority
    || entry?.listeningPriority
    || entry?.writingPriority
    || ["基础高频", "中级核心"].includes(entry?.difficulty)
    || /Reading|Listening|Writing|G类|阅读|听力|写作/.test(`${topics} ${uses}`)
  );
}

function targetForms(entry) {
  const values = [entry?.word, entry?.answer, ...(entry?.acceptedAnswers || [])];
  for (const item of [...(entry?.forms || []), ...(entry?.wordFamily || [])]) {
    if (typeof item === "string") values.push(item);
    else values.push(item?.word);
  }
  return uniq(values.map(norm).filter(Boolean));
}

function containsTarget(entry, example) {
  const text = norm(example);
  if (!text) return false;
  return targetForms(entry).some((target) => {
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(text);
  });
}

function addIssue(candidate, type, priority, reason, safeFix = false) {
  if (!candidate.issues.some((item) => item.type === type)) {
    candidate.issues.push({ type, priority, reason, safeFix });
  }
}

function priorityRank(value) {
  return ({ P0: 4, P1: 3, P2: 2, P3: 1 })[value] || 0;
}

function candidatePriority(candidate) {
  return candidate.issues.reduce((best, issue) => priorityRank(issue.priority) > priorityRank(best) ? issue.priority : best, "P3");
}

function inspectEntry(entry, duplicateExampleCount) {
  const word = safe(entry?.word);
  const meaning = safe(entry?.meaning);
  const definition = safe(entry?.definition);
  const example = safe(entry?.example);
  const exampleCn = safe(entry?.exampleCn);
  const detail = safe(entry?.meaningDetailZh);
  const detailed = safe(entry?.meaningDetailedZh);
  const pos = norm(entry?.pos);
  const ref = isReference(entry);
  const high = isHighImpact(entry);
  const tokens = englishTokens(example);
  const candidate = {
    id: safe(entry?.id || entry?.wordId),
    word,
    pos: safe(entry?.pos),
    difficulty: safe(entry?.difficulty),
    category: safe(entry?.category),
    studyMode: safe(entry?.studyMode),
    highImpact: high,
    reference: ref,
    meaning,
    definition,
    example,
    exampleCn,
    meaningDetailZh: detail,
    meaningDetailedZh: detailed,
    issues: []
  };

  if (!word) addIssue(candidate, "missing_word", "P0", "word为空");
  if (!meaning) addIssue(candidate, "missing_meaning", "P0", "meaning为空");
  else {
    if (!CJK.test(meaning) && /[A-Za-z]/.test(meaning)) addIssue(candidate, "meaning_without_chinese", "P0", "释义没有中文");
    if (PLACEHOLDER.test(meaning)) addIssue(candidate, "placeholder_meaning", "P0", `释义为占位或待复核文本：${meaning}`);
    if (REPLACEMENT.test(meaning)) addIssue(candidate, "meaning_encoding_damage", "P0", "释义疑似乱码或编码损坏");
    if (cjkCount(meaning) <= 1 && meaning.length <= 4 && high && !ref) addIssue(candidate, "meaning_too_thin", "P1", `高价值词释义过短：${meaning}`);
  }

  if (!definition) addIssue(candidate, "missing_definition", high && !ref ? "P1" : "P2", "英文定义为空");
  else {
    if (PLACEHOLDER.test(definition)) addIssue(candidate, "placeholder_definition", "P1", "英文定义为占位文本");
    if (REPLACEMENT.test(definition)) addIssue(candidate, "definition_encoding_damage", "P0", "英文定义疑似乱码");
    if ((pos === "noun" || pos === "n") && /^to\s+[a-z]/i.test(definition)) addIssue(candidate, "pos_definition_mismatch", "P1", "名词词性但定义以动词不定式开头");
    if ((pos === "verb" || pos === "v") && /^(?:a|an|the)\s+[a-z]/i.test(definition)) addIssue(candidate, "pos_definition_mismatch", "P1", "动词词性但定义像名词定义");
  }

  if (GENERIC_POS.has(pos)) addIssue(candidate, "generic_or_missing_pos", high && !ref ? "P1" : "P2", `词性过于笼统：${entry?.pos || "空"}`);
  if (!VALID_DIFFICULTIES.has(entry?.difficulty)) addIssue(candidate, "invalid_difficulty", "P1", `难度字段异常：${entry?.difficulty}`);

  if (!example) addIssue(candidate, "missing_example", high && !ref ? "P0" : "P1", "英文例句为空");
  else {
    if (tokens.length < 4) addIssue(candidate, "short_or_fragment_example", high && !ref ? "P0" : "P1", `英文例句仅${tokens.length}个词`);
    if (BAD_EXAMPLE.test(example)) addIssue(candidate, "placeholder_or_broken_example", "P0", "英文例句含占位符或异常符号");
    if (REPLACEMENT.test(example)) addIssue(candidate, "example_encoding_damage", "P0", "英文例句疑似乱码");
    if (!containsTarget(entry, example)) addIssue(candidate, "target_absent_from_example", high && !ref ? "P1" : "P2", "例句未出现词头、答案或登记词形");
    if (duplicateExampleCount >= 4) addIssue(candidate, "duplicate_template_example", high && !ref ? "P1" : "P2", `相同英文例句被${duplicateExampleCount}个词条共用`);
  }

  if (!exampleCn) addIssue(candidate, "missing_example_cn", high && !ref ? "P1" : "P2", "中文例句为空");
  else {
    if (!CJK.test(exampleCn)) addIssue(candidate, "example_cn_without_chinese", "P1", "中文例句没有中文字符");
    if (REPLACEMENT.test(exampleCn)) addIssue(candidate, "example_cn_encoding_damage", "P0", "中文例句疑似乱码");
    const ratio = tokens.length ? cjkCount(exampleCn) / tokens.length : 0;
    if (tokens.length >= 5 && (ratio < 0.25 || ratio > 8)) addIssue(candidate, "translation_length_outlier", "P2", `中英文例句长度比异常：${ratio.toFixed(2)}`);
  }

  if (!detail) addIssue(candidate, "missing_meaning_detail", high && !ref ? "P1" : "P2", "meaningDetailZh为空");
  else {
    if (REPLACEMENT.test(detail)) addIssue(candidate, "meaning_detail_encoding_damage", "P0", "meaningDetailZh疑似乱码");
    if (GENERIC_DETAIL.test(detail) && detail.length <= meaning.length + word.length + 18) {
      addIssue(candidate, "generic_meaning_detail", high && !ref ? "P1" : "P2", "meaningDetailZh只是机械重复短释义");
    }
  }

  if (!detailed) addIssue(candidate, "missing_meaning_detailed", high && !ref ? "P1" : "P2", "meaningDetailedZh为空");
  else {
    if (REPLACEMENT.test(detailed)) addIssue(candidate, "meaning_detailed_encoding_damage", "P0", "meaningDetailedZh疑似乱码");
    if (norm(detailed) === norm(meaning) && high && !ref) addIssue(candidate, "meaning_detailed_not_expanded", "P1", "meaningDetailedZh与meaning完全相同，没有展开");
  }

  const semicolonCount = (meaning.match(/[；;]/g) || []).length;
  const posMulti = /[/,]|\band\b/i.test(String(entry?.pos || ""));
  const likelyMultiSense = semicolonCount >= 1 || posMulti;
  if (likelyMultiSense && !(Array.isArray(entry?.meaningsZh) && entry.meaningsZh.length)) {
    addIssue(candidate, "multi_meaning_without_structured_senses", high && !ref ? "P1" : "P2", "短释义或词性显示多义，但meaningsZh为空");
  }
  if (likelyMultiSense && !(Array.isArray(entry?.quizSenses) && entry.quizSenses.length) && high && !ref) {
    addIssue(candidate, "multi_meaning_without_quiz_senses", "P2", "高价值多义词没有quizSenses");
  }

  if (isPhrase(entry)) addIssue(candidate, "phrase_in_word_lexicon", "P0", "单词总库中混入phrase型条目");

  candidate.priority = candidatePriority(candidate);
  candidate.score = candidate.issues.reduce((sum, issue) => sum + priorityRank(issue.priority), 0)
    + (high ? 3 : 0) - (ref ? 2 : 0);
  return candidate;
}

function main() {
  const raw = fs.readFileSync(SOURCE, "utf8");
  const payload = JSON.parse(raw);
  const words = Array.isArray(payload) ? payload : payload.words || [];

  const normalizedHeads = new Map();
  const idCounts = new Map();
  const exampleCounts = new Map();
  for (const entry of words) {
    const head = norm(entry?.word);
    const id = String(entry?.id || entry?.wordId || "");
    if (head) normalizedHeads.set(head, (normalizedHeads.get(head) || 0) + 1);
    if (id) idCounts.set(id, (idCounts.get(id) || 0) + 1);
    const ex = norm(entry?.example);
    if (ex) exampleCounts.set(ex, (exampleCounts.get(ex) || 0) + 1);
  }

  const candidates = [];
  for (const entry of words) {
    const candidate = inspectEntry(entry, exampleCounts.get(norm(entry?.example)) || 0);
    const headCount = normalizedHeads.get(norm(entry?.word)) || 0;
    const idCount = idCounts.get(String(entry?.id || entry?.wordId || "")) || 0;
    if (headCount > 1) addIssue(candidate, "duplicate_normalized_headword", "P0", `归一化词头重复${headCount}次`);
    if (idCount > 1) addIssue(candidate, "duplicate_stable_id", "P0", `稳定ID重复${idCount}次`);
    candidate.priority = candidatePriority(candidate);
    candidate.score = candidate.issues.reduce((sum, issue) => sum + priorityRank(issue.priority), 0)
      + (candidate.highImpact ? 3 : 0) - (candidate.reference ? 2 : 0);
    if (candidate.issues.length) candidates.push(candidate);
  }

  candidates.sort((a, b) => b.score - a.score || a.word.localeCompare(b.word));
  const issueCounts = {};
  const priorityCounts = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const candidate of candidates) {
    priorityCounts[candidate.priority] += 1;
    for (const issue of candidate.issues) issueCounts[issue.type] = (issueCounts[issue.type] || 0) + 1;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    source: {
      path: path.relative(ROOT, SOURCE).replace(/\\/g, "/"),
      version: payload.version || null,
      declaredCount: payload.count ?? null,
      actualCount: words.length,
      sha256: sha256(raw)
    },
    methodology: {
      readOnly: true,
      automaticSemanticRewrite: false,
      note: "确定性结构/文本启发式审计。例句与释义是否完全对应仍需人工或语料证据复核。"
    },
    summary: {
      totalWords: words.length,
      candidateCount: candidates.length,
      highImpactCandidateCount: candidates.filter((item) => item.highImpact && !item.reference).length,
      referenceCandidateCount: candidates.filter((item) => item.reference).length,
      priorityCounts,
      issueCounts
    },
    candidates
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const columns = ["priority", "score", "id", "word", "pos", "difficulty", "category", "studyMode", "highImpact", "reference", "issueTypes", "meaning", "definition", "example", "exampleCn", "meaningDetailZh", "meaningDetailedZh"];
  const rows = [columns.join("\t")];
  for (const item of candidates) {
    const values = {
      ...item,
      issueTypes: item.issues.map((issue) => `${issue.type}:${issue.priority}`).join("|"),
    };
    rows.push(columns.map((column) => safe(values[column])).join("\t"));
  }
  fs.writeFileSync(OUT_TSV, `${rows.join("\n")}\n`, "utf8");

  const topIssues = Object.entries(issueCounts).sort((a, b) => b[1] - a[1]).slice(0, 20);
  const topCandidates = candidates.slice(0, 40);
  const md = [
    "# 全词库语义质量审计摘要",
    "",
    `- 数据版本：${report.source.version}`,
    `- 实际词条：${words.length}`,
    `- 命中候选：${candidates.length}`,
    `- 高影响非参考候选：${report.summary.highImpactCandidateCount}`,
    `- P0：${priorityCounts.P0}`,
    `- P1：${priorityCounts.P1}`,
    `- P2：${priorityCounts.P2}`,
    "",
    "## 高频问题",
    "",
    ...topIssues.map(([type, count]) => `- ${type}: ${count}`),
    "",
    "## 最高优先级样本",
    "",
    ...topCandidates.map((item) => `- **${item.word}** [${item.priority}] — ${item.issues.map((issue) => issue.type).join(", ")}`),
    ""
  ].join("\n");
  fs.writeFileSync(OUT_SUMMARY, md, "utf8");

  console.log(JSON.stringify({
    ok: true,
    reportDir: path.relative(ROOT, OUT_DIR).replace(/\\/g, "/"),
    source: report.source,
    summary: report.summary,
    topCandidates: topCandidates.map((item) => ({ word: item.word, priority: item.priority, issues: item.issues.map((issue) => issue.type) }))
  }, null, 2));
}

main();
