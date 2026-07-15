const PLACEHOLDER_RE = /(?:无中文释义|暂无释义|待补充|待完善|待审核|需要复核|IELTS\s*G类实用词\s*[：:]|专有名词，需结合原文识别|非标准词形或来源残留)/iu;
const GENERIC_DETAIL_RE = /^(?:(?:“[A-Za-z][A-Za-z' -]*”|[A-Za-z][A-Za-z' -]*)常见含义为[：:]|(?:“[A-Za-z][A-Za-z' -]*”|[A-Za-z][A-Za-z' -]*)表示|[A-Za-z][A-Za-z' -]*\s*[：:])/u;

function normalize(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

export function getMeaningDisplay(entry = {}) {
  const meaning = String(entry.meaning || "").trim();
  const candidate = String(entry.meaningDetailedZh || "").trim();
  const detail = candidate
    && normalize(candidate) !== normalize(meaning)
    && !PLACEHOLDER_RE.test(candidate)
    && !GENERIC_DETAIL_RE.test(candidate)
    ? candidate
    : "";
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
  return { detail, senses };
}
