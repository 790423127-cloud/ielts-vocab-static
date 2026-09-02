const PLACEHOLDER_RE = /(?:无中文释义|暂无释义|待补充|待完善|待审核|需要复核|IELTS\s*G类实用词\s*[：:]|专有名词，需结合原文识别|非标准词形或来源残留)/iu;
const GENERIC_DETAIL_RE = /^(?:(?:“[A-Za-z][A-Za-z' -]*”|[A-Za-z][A-Za-z' -]*)(?:常见含义为|在雅思(?:听力|阅读)?中的常用含义是)[：:]|(?:“[A-Za-z][A-Za-z' -]*”|[A-Za-z][A-Za-z' -]*)(?:表示|的核心意思是)|(?:“[A-Za-z][A-Za-z' -]*”|[A-Za-z][A-Za-z' -]*|该词)在当前词条中(?:作.+?使用，?)?主要表示|[A-Za-z][A-Za-z' -]*\s*[：:])/u;
const POS_ONLY_DETAIL_RE = /^(?:本词条|该词|“?[A-Za-z][A-Za-z' -]*”?)?(?:按|作).*(?:词|使用)$/iu;
const COLLOCATION_ONLY_RE = /^(?:常见|固定|短语)?搭配(?:有|包括|如|例如)?[“"']?.+$/u;
const MORPHOLOGY_ONLY_RE = /(?:(?:复数(?:形式)?|第三人称单数(?:形式)?|过去式|过去分词|现在分词|动名词|比较级|最高级)(?:形式)?$|^(?:plural|third[- ]person singular|past tense|past participle|present participle|gerund|comparative|superlative)(?:\s+form)?\s*(?:为|是|[:：]|is\b).+$)/iu;
const EXAMPLE_NOTE_RE = /^(?:例句提示[：:]?|在当前例句中[，,:：]?)/u;

function normalize(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function compact(value) {
  return normalize(value).replace(/[“”"'‘’；;，,。.!！?？、：:\s]/g, "");
}

function chineseLength(value) {
  return (String(value || "").match(/[\u3400-\u9fff]/gu) || []).length;
}

function meaningKeys(value) {
  return new Set(
    String(value || "")
      .split(/[；;，,、/]+/u)
      .map(compact)
      .filter(Boolean)
  );
}

function splitDetailClauses(value) {
  return String(value || "")
    .split(/[。！？!?；;]+/u)
    .map((clause) => clause.trim().replace(/^[，,：:\s]+|[，,：:\s]+$/gu, ""))
    .filter(Boolean);
}

function clauseIsOnlyMainGloss(clause, entry = {}) {
  const word = String(entry.word || "").trim();
  const meaning = String(entry.meaning || entry.meaningZh || entry.primaryMeaningZh || "").trim();
  const glossKeys = meaningKeys(meaning);
  const wholeMeaningKey = compact(meaning);
  const clauseKey = compact(clause);
  if (!clauseKey || clauseKey === wholeMeaningKey || glossKeys.has(clauseKey)) return true;

  if (GENERIC_DETAIL_RE.test(clause)) return true;
  if (POS_ONLY_DETAIL_RE.test(clause)) return true;
  if (word) {
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const withoutHeadword = clause.replace(
      new RegExp(`^[“\"']?${escapedWord}[”\"']?\\s*[：:]\\s*`, "iu"),
      ""
    );
    const remainderKey = compact(withoutHeadword);
    if (!remainderKey || remainderKey === wholeMeaningKey || glossKeys.has(remainderKey)) return true;
  }
  return false;
}

function clauseIsOnlyExampleNote(clause, entry = {}) {
  if (!EXAMPLE_NOTE_RE.test(clause)) return false;
  if (/^例句提示/u.test(clause)) return true;
  const remainder = clause.replace(EXAMPLE_NOTE_RE, "").trim();
  const exampleCn = String(entry.exampleCn || entry.exampleChinese || entry.example_chinese || "").trim();
  if (!remainder || !exampleCn) return false;
  const remainderKey = compact(remainder);
  const exampleKey = compact(exampleCn);
  return remainderKey === exampleKey || remainderKey.includes(exampleKey) || exampleKey.includes(remainderKey);
}

function detailAnalysis(entry = {}) {
  const raw = String(entry.meaningDetailZh || entry.meaningDetailedZh || entry.main_meaning_detail_zh || "").trim();
  if (!raw || PLACEHOLDER_RE.test(raw)) {
    return { raw, detail: "", supportClauses: [], reason: raw ? "placeholder" : "missing" };
  }

  const semanticClauses = [];
  const collocationClauses = [];
  const supportClauses = [];
  for (const clause of splitDetailClauses(raw)) {
    if (clauseIsOnlyMainGloss(clause, entry)) continue;
    if (COLLOCATION_ONLY_RE.test(clause)) {
      collocationClauses.push(clause);
      supportClauses.push(clause);
      continue;
    }
    if (
      clauseIsOnlyExampleNote(clause, entry) ||
      MORPHOLOGY_ONLY_RE.test(clause)
    ) {
      supportClauses.push(clause);
      continue;
    }
    semanticClauses.push(clause);
  }

  const semanticDetail = semanticClauses.join("；");
  if (semanticDetail && chineseLength(semanticDetail) >= 8) {
    const detail = [...semanticClauses, ...collocationClauses].join("；");
    return { raw, detail: /[。！？!?]$/u.test(detail) ? detail : `${detail}。`, supportClauses, reason: "" };
  }
  return {
    raw,
    detail: "",
    supportClauses,
    reason: supportClauses.length ? "support-only" : "shallow"
  };
}

export function isMeaningDetailInformative(entry = {}) {
  return Boolean(detailAnalysis(entry).detail);
}

export function describeMeaningDetailIssue(entry = {}) {
  const analysis = detailAnalysis(entry);
  if (analysis.detail) return "";
  if (!analysis.raw) return "缺少主释义详解";
  if (analysis.reason === "placeholder") return "主释义详解仍是占位内容";
  if (analysis.reason === "support-only") return "只有词形、搭配或例句复述，没有解释主释义的语义范围或实际用法";
  return "主释义详解过短，或只是重复单词、词性和中文短释义";
}

export function getMeaningDisplay(entry = {}) {
  const meaning = String(entry.meaning || "").trim();
  const rawDefinition = String(entry.definition || "").trim();
  const definition = /[A-Za-z]{3}/.test(rawDefinition) && !/[\u3400-\u9fff]/u.test(rawDefinition)
    ? rawDefinition
    : "";
  const detail = detailAnalysis({ ...entry, meaning }).detail;
  const seen = new Set();
  const senses = (Array.isArray(entry.meaningsZh) ? entry.meaningsZh : [])
    .filter((sense) => String(sense?.confidence || "high").toLowerCase() === "high")
    .map((sense) => ({
      gloss: String(sense?.gloss || sense?.meaning || "").trim(),
      label: String(sense?.label || "").trim(),
      posFamily: String(sense?.posFamily || "").trim()
    }))
    .filter((sense) => {
      const key = normalize(sense.gloss);
      if (!key || PLACEHOLDER_RE.test(sense.gloss) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
  return { definition, detail, senses };
}

export function getMainMeaningDetailDisplay(entry = {}, options = {}) {
  const display = getMeaningDisplay(entry);
  const verifiedDetail = display.detail;
  if (verifiedDetail) return verifiedDetail;

  const meaning = String(
    options.meaning || entry.primaryMeaningZh || entry.meaningZh || entry.meaning || ""
  ).trim();
  if (meaning) return "现有资料只确认了主释义，语义范围和实际用法仍待补充。";
  return "该词的主释义和详细说明均待补充。";
}
