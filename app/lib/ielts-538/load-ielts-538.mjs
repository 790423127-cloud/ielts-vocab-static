import { getPosDisplay } from "../vocab/pos-display.mjs";
import { loadSessionJson, loadSessionValue } from "../browser-json-cache.mjs";
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
    wordFamily: Array.isArray(entry?.wordFamily) ? entry.wordFamily : [],
    part3HighFrequency: entry?.part3HighFrequency === true,
    part3HighFrequencyReplacements: Array.isArray(entry?.part3HighFrequencyReplacements)
      ? entry.part3HighFrequencyReplacements.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    practiceKind: String(entry?.practiceKind || "").trim(),
    questionExpression: String(entry?.questionExpression || "").trim(),
    sourceExpression: String(entry?.sourceExpression || "").trim(),
    occurrenceCount: Number(entry?.occurrenceCount) || 0,
    questionProbability: Number(entry?.questionProbability) || 0,
    sourceFiles: Array.isArray(entry?.sourceFiles) ? entry.sourceFiles : [],
    sources: Array.isArray(entry?.sources) ? entry.sources : []
  };
}

export async function loadIelts538Words(fetchImpl = fetch) {
  const useMemory = fetchImpl === fetch;
  return loadSessionValue(
    "ielts-538:normalized:20260824-high-frequency-min3-v1",
    async () => {
      let data;
      if (useMemory) {
        data = await loadSessionJson(IELTS_538_DATA_URL, fetchImpl, { cache: "force-cache" });
      } else {
        const response = await fetchImpl(IELTS_538_DATA_URL, { cache: "force-cache" });
        if (!response.ok) {
          throw new Error(`538 考点词库加载失败：HTTP ${response.status}`);
        }
        data = await response.json();
      }
      const rawList = Array.isArray(data?.words) ? data.words : [];
      const rawPracticeList = Array.isArray(data?.questionParaphrases)
        ? data.questionParaphrases
        : [];
      const baseWords = rawList.map(normalizeIelts538Item).filter(Boolean);
      const practiceWords = rawPracticeList.map((entry, index) =>
        normalizeIelts538Item(entry, rawList.length + index)
      ).filter(Boolean);

      if (Number(data?.count) !== baseWords.length) {
        throw new Error(`538 考点词库数量不一致：声明 ${data?.count}，实际 ${baseWords.length}`);
      }
      const declaredPracticeCount = Number(data?.aiCoachQuestionParaphrases?.practiceEntryCount) || 0;
      if (declaredPracticeCount !== practiceWords.length) {
        throw new Error(
          `AI教练真题替换数量不一致：声明 ${declaredPracticeCount}，实际 ${practiceWords.length}`
        );
      }

      return {
        version: String(data?.version || "ielts-538-v1"),
        count: baseWords.length,
        practiceCount: practiceWords.length,
        generatedAt: String(data?.generatedAt || ""),
        note: String(data?.note || ""),
        words: [...baseWords, ...practiceWords]
      };
    },
    { useMemory }
  );
}
