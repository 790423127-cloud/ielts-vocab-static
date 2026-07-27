import { getPosDisplay } from "../vocab/pos-display.mjs";
import { IELTS_538_DATA_URL } from "./keys.mjs";

export function normalizeIelts538WordKey(word) {
  return String(word || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ");
}

export function getIelts538ProgressKey(word) {
  const stableId = String(word?.wordId || word?.id || "").trim();
  return stableId || normalizeIelts538WordKey(word?.word || word);
}

export function normalizeIelts538Item(entry, index = 0) {
  const word = String(entry?.word || "").trim();
  if (!word) return null;

  return {
    id: String(entry?.id || `ielts538_${index}_${normalizeIelts538WordKey(word)}`),
    wordId: String(entry?.wordId || entry?.id || ""),
    word,
    entryType: entry?.entryType === "phrase" || word.includes(" ") ? "phrase" : "word",
    phonetic: String(entry?.phonetic || "").trim(),
    pos: getPosDisplay(String(entry?.pos || "").trim()),
    meaning: String(entry?.meaning || "").trim(),
    definition: String(entry?.definition || "").trim(),
    example: String(entry?.example || "").trim(),
    exampleCn: String(entry?.exampleCn || "").trim(),
    readingSection: String(entry?.readingSection || "").trim(),
    synonyms: Array.isArray(entry?.synonyms)
      ? entry.synonyms.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    validatedSynonyms: Array.isArray(entry?.validatedSynonyms)
      ? entry.validatedSynonyms.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    recommendedSynonyms: Array.isArray(entry?.recommendedSynonyms)
      ? entry.recommendedSynonyms.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    synonymSections: Object.fromEntries(
      Object.entries(entry?.synonymSections || {})
        .map(([replacement, section]) => [
          String(replacement || "").trim(),
          String(section || "").trim()
        ])
        .filter(([replacement, section]) =>
          replacement && ["Section 1", "Section 2", "Section 3"].includes(section)
        )
    ),
    synonymDetails: Object.fromEntries(
      Object.entries(entry?.synonymDetails || {})
        .map(([replacement, detail]) => [
          String(replacement || "").trim(),
          {
            pos: String(detail?.pos || "").trim(),
            originalMeaning: String(detail?.originalMeaning || "").trim(),
            contextualMeaning: String(detail?.contextualMeaning || "").trim()
          }
        ])
        .filter(([replacement, detail]) =>
          replacement && (detail.originalMeaning || detail.contextualMeaning)
        )
    ),
    paraphraseExamples: Array.isArray(entry?.paraphraseExamples)
      ? entry.paraphraseExamples
          .map((item) => ({
            replacement: String(item?.replacement || "").trim(),
            sourceSentence: String(item?.sourceSentence || "").trim(),
            paraphraseSentence: String(item?.paraphraseSentence || "").trim(),
            meaningCn: String(item?.meaningCn || "").trim(),
            relationType: String(item?.relationType || "").trim(),
            readingSection: String(item?.readingSection || "").trim(),
            isRecommended: Boolean(item?.isRecommended)
          }))
          .filter((item) =>
            item.replacement &&
            item.sourceSentence &&
            item.paraphraseSentence &&
            item.meaningCn
          )
      : [],
    collocations: Array.isArray(entry?.collocations) ? entry.collocations : [],
    phraseCollocations: Array.isArray(entry?.phraseCollocations) ? entry.phraseCollocations : [],
    ieltsUse: Array.isArray(entry?.ieltsUse) ? entry.ieltsUse : [],
    topics: Array.isArray(entry?.topics) ? entry.topics : [],
    difficulty: String(entry?.difficulty || "考点词").trim() || "考点词",
    category: String(entry?.category || "538考点").trim() || "538考点",
    sourceCategory: Number(entry?.sourceCategory) || 0,
    sourceGroup: Number(entry?.sourceGroup) || 0,
    sourceGroupIndex: Number(entry?.sourceGroupIndex) || 0,
    forms: Array.isArray(entry?.forms) ? entry.forms : [],
    wordFamily: Array.isArray(entry?.wordFamily) ? entry.wordFamily : []
  };
}

export async function loadIelts538Words(fetchImpl = fetch) {
  const response = await fetchImpl(IELTS_538_DATA_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`538 考点词库加载失败：HTTP ${response.status}`);
  }

  const data = await response.json();
  const rawList = Array.isArray(data?.words) ? data.words : [];
  const words = rawList.map(normalizeIelts538Item).filter(Boolean);

  if (Number(data?.count) !== words.length) {
    throw new Error(`538 考点词库数量不一致：声明 ${data?.count}，实际 ${words.length}`);
  }

  return {
    version: String(data?.version || "ielts-538-v1"),
    count: words.length,
    generatedAt: String(data?.generatedAt || ""),
    note: String(data?.note || ""),
    words
  };
}
