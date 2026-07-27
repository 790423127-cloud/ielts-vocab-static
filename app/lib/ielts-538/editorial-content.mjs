import { IELTS_538_EDITORIAL_PARAPHRASES } from "./editorial-paraphrases.mjs";
import { IELTS_538_EDITORIAL_PARAPHRASE_ALTERNATIVES } from "./editorial-paraphrase-alternatives.mjs";
import { applyIelts538SynonymSections } from "./replacement-sections.mjs";

export const IELTS_538_EDITORIAL_RELATION_TYPE = "contextual-reading-paraphrase";
export const IELTS_538_READING_SECTIONS = new Set([
  "Section 1",
  "Section 2",
  "Section 3"
]);

export function normalizeEditorialWordKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ");
}

export function validateIelts538EditorialContent(words, rows = IELTS_538_EDITORIAL_PARAPHRASES) {
  if (!Array.isArray(words) || words.length !== 376) {
    throw new Error(`538 词库应包含 376 词，实际为 ${Array.isArray(words) ? words.length : 0} 词。`);
  }
  if (!Array.isArray(rows) || rows.length !== words.length) {
    throw new Error(`阅读语境改写应包含 ${words.length} 组，实际为 ${Array.isArray(rows) ? rows.length : 0} 组。`);
  }

  const sourceKeys = new Set(words.map((entry) => normalizeEditorialWordKey(entry?.word)));
  const rowMap = new Map();

  for (const [index, row] of rows.entries()) {
    if (!Array.isArray(row) || row.length !== 5 || row.some((value) => !String(value || "").trim())) {
      throw new Error(`第 ${index + 1} 组阅读语境改写字段不完整。`);
    }

    const [word, replacement, sourceSentence, paraphraseSentence, meaningCn] = row;
    const key = normalizeEditorialWordKey(word);
    if (!sourceKeys.has(key)) throw new Error(`阅读语境改写含有词库外词条：${word}`);
    if (rowMap.has(key)) throw new Error(`阅读语境改写重复：${word}`);
    if (sourceSentence.trim() === paraphraseSentence.trim()) {
      throw new Error(`阅读语境改写不能与原句完全相同：${word}`);
    }

    rowMap.set(key, {
      replacement: replacement.trim(),
      sourceSentence: sourceSentence.trim(),
      paraphraseSentence: paraphraseSentence.trim(),
      meaningCn: meaningCn.trim()
    });
  }

  const missing = words
    .map((entry) => String(entry?.word || "").trim())
    .filter((word) => !rowMap.has(normalizeEditorialWordKey(word)));
  if (missing.length) throw new Error(`以下词条缺少阅读语境改写：${missing.join("、")}`);

  return rowMap;
}

export function validateIelts538EditorialAlternatives(
  words,
  primaryRows = IELTS_538_EDITORIAL_PARAPHRASES,
  alternativeRows = IELTS_538_EDITORIAL_PARAPHRASE_ALTERNATIVES
) {
  const primaryMap = validateIelts538EditorialContent(words, primaryRows);
  const alternativeMap = new Map();
  const seenRelations = new Set(
    [...primaryMap.entries()].map(
      ([wordKey, entry]) => `${wordKey}\u0000${normalizeEditorialWordKey(entry.replacement)}`
    )
  );

  if (!Array.isArray(alternativeRows)) {
    throw new Error("538 补充同义改写必须是数组。");
  }

  for (const [index, row] of alternativeRows.entries()) {
    if (!Array.isArray(row) || row.length !== 3 || row.some((value) => !String(value || "").trim())) {
      throw new Error(`第 ${index + 1} 组补充同义改写字段不完整。`);
    }

    const [word, replacement, paraphraseSentence] = row.map((value) => String(value).trim());
    const wordKey = normalizeEditorialWordKey(word);
    const primary = primaryMap.get(wordKey);
    if (!primary) throw new Error(`补充同义改写含有词库外词条：${word}`);
    if (paraphraseSentence === primary.sourceSentence) {
      throw new Error(`补充同义改写不能与原句完全相同：${word} / ${replacement}`);
    }

    const relationKey = `${wordKey}\u0000${normalizeEditorialWordKey(replacement)}`;
    if (seenRelations.has(relationKey)) {
      throw new Error(`补充同义改写关系重复：${word} / ${replacement}`);
    }
    seenRelations.add(relationKey);

    const alternatives = alternativeMap.get(wordKey) || [];
    alternatives.push({ replacement, paraphraseSentence });
    alternativeMap.set(wordKey, alternatives);
  }

  return { primaryMap, alternativeMap };
}

export function applyIelts538EditorialContent(
  words,
  rows = IELTS_538_EDITORIAL_PARAPHRASES,
  alternativeRows = IELTS_538_EDITORIAL_PARAPHRASE_ALTERNATIVES,
  difficultyIndex = new Map()
) {
  const { primaryMap, alternativeMap } = validateIelts538EditorialAlternatives(
    words,
    rows,
    alternativeRows
  );

  const enrichedWords = words.map((entry) => {
    const wordKey = normalizeEditorialWordKey(entry.word);
    const editorial = primaryMap.get(wordKey);
    const alternatives = alternativeMap.get(wordKey) || [];
    const paraphraseExamples = [
      {
        replacement: editorial.replacement,
        sourceSentence: editorial.sourceSentence,
        paraphraseSentence: editorial.paraphraseSentence,
        meaningCn: editorial.meaningCn,
        relationType: IELTS_538_EDITORIAL_RELATION_TYPE,
        isRecommended: true
      },
      ...alternatives.map((alternative) => ({
        replacement: alternative.replacement,
        sourceSentence: editorial.sourceSentence,
        paraphraseSentence: alternative.paraphraseSentence,
        meaningCn: editorial.meaningCn,
        relationType: IELTS_538_EDITORIAL_RELATION_TYPE,
        isRecommended: false
      }))
    ];

    return {
      ...entry,
      example: editorial.sourceSentence,
      exampleCn: editorial.meaningCn,
      validatedSynonyms: paraphraseExamples.map((pair) => pair.replacement),
      recommendedSynonyms: [editorial.replacement],
      paraphraseExamples
    };
  });

  return applyIelts538SynonymSections(enrichedWords, difficultyIndex);
}
