export const LR_SYNONYM_URL = "/data/listening-reading-synonyms.json";

function cleanText(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function fallbackDifficulty(value = "") {
  const text = cleanText(value);
  if (text === "4-5") return "foundation";
  if (text === "6-7") return "advanced";
  return text || "core";
}

export function normalizeSynonymItem(entry = {}, index = 0) {
  const baseWord = cleanText(entry.baseWord || entry.questionExpression || "");
  const hasExplicitSynonyms = Array.isArray(entry.synonyms);
  const rawSynonyms = hasExplicitSynonyms
    ? entry.synonyms
    : [entry.sourceExpression, entry.paraphrase, entry.replacement].filter(Boolean);
  const synonyms = [...new Set(rawSynonyms.map(cleanText).filter(Boolean))]
    .filter((value) => hasExplicitSynonyms || value.toLowerCase() !== baseWord.toLowerCase());
  const members = Array.isArray(entry.members)
    ? entry.members.map((member) => ({
        word: cleanText(member?.word || member?.baseWord || ""),
        phonetic: cleanText(member?.phonetic || ""),
        meaning: cleanText(member?.meaning || member?.meaningZh || ""),
        example: cleanText(member?.example || member?.questionSentence || ""),
        exampleCn: cleanText(member?.exampleCn || member?.exampleTranslation || ""),
        sourceWordId: cleanText(member?.sourceWordId || ""),
        seq: member?.seq ?? ""
      })).filter((member) => member.word)
    : [];

  return {
    id: cleanText(entry.id || `lrs_${index + 1}`),
    baseWord,
    meaning: cleanText(entry.meaning || entry.meaningZh || ""),
    synonyms,
    example: cleanText(entry.example || entry.questionSentence || ""),
    paraphraseExample: cleanText(entry.paraphraseExample || entry.sourceSentence || ""),
    source: cleanText(entry.source || entry.sourceType || ""),
    tags: [...new Set([
      ...(Array.isArray(entry.tags) ? entry.tags : []),
      ...(Array.isArray(entry.skills) ? entry.skills : []),
      "synonym"
    ].map(cleanText).filter(Boolean))],
    difficulty: fallbackDifficulty(entry.difficulty || entry.targetBand),
    relationType: cleanText(entry.relationType || ""),
    notesZh: cleanText(entry.notesZh || ""),
    clusterId: cleanText(entry.clusterId || ""),
    clusterTitle: cleanText(entry.clusterTitle || ""),
    members
  };
}

export function isValidSynonymItem(item = {}) {
  return Boolean(
    cleanText(item.baseWord)
    && Array.isArray(item.synonyms)
    && item.synonyms.map(cleanText).filter(Boolean).length > 0
  );
}

export function asSynonymItems(payload = {}) {
  const raw = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.items)
      ? payload.items
      : Array.isArray(payload.entries)
        ? payload.entries
        : [];

  return raw
    .map((entry, index) => normalizeSynonymItem(entry, index))
    .filter(isValidSynonymItem);
}

export function buildSynonymLexiconMeta(payload = {}, items = []) {
  return {
    version: cleanText(payload.version || "listening-reading-synonyms-v1"),
    count: items.length,
    groupCount: Number(payload.groupCount) || 0,
    sourceWordCount: Number(payload.sourceWordCount) || 0,
    synonymLexiconHash: cleanText(payload.synonymLexiconHash || `${items.length}:${items[0]?.id || ""}:${items[items.length - 1]?.id || ""}`),
    generatedAt: cleanText(payload.generatedAt || "")
  };
}

export async function loadLrSynonyms(url = LR_SYNONYM_URL) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response?.ok) throw new Error(`同义替换库加载失败（HTTP ${response?.status || "unknown"}）`);
  const payload = await response.json().catch(() => null);
  if (!payload) throw new Error("同义替换 JSON 解析失败");
  const items = asSynonymItems(payload);
  const meta = buildSynonymLexiconMeta(payload, items);
  return { items, ...meta, source: url };
}
