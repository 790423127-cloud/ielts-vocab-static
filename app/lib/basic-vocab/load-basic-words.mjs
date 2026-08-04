import { BASIC_WORDS_DATA_URL } from "./keys.mjs";
import { getPosDisplay } from "../vocab/pos-display.mjs";
import { loadSessionJson, loadSessionValue } from "../browser-json-cache.mjs";

function normalizeWordKey(word) {
  return String(word || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘']/g, "'")
    .replace(/\s+/g, " ");
}

function buildBasicWordsPayload(data) {
  const rawList = Array.isArray(data?.words)
    ? data.words
    : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data)
        ? data
        : [];

  const words = rawList
    .map((entry, index) => {
      const word = String(entry?.word || "").trim();
      if (!word) return null;

      return {
        id: entry?.id || `basic_${index}_${normalizeWordKey(word)}`,
        word,
        phonetic: String(entry?.phonetic || "").trim(),
        pos: getPosDisplay(String(entry?.pos || "").trim()),
        meaning: String(entry?.meaning || entry?.meaningZh || "").trim(),
        definition: String(entry?.definition || "").trim(),
        example: String(entry?.example || "").trim(),
        exampleCn: String(entry?.exampleCn || "").trim(),
        collocations: Array.isArray(entry?.collocations) ? entry.collocations : [],
        phraseCollocations: Array.isArray(entry?.phraseCollocations) ? entry.phraseCollocations : [],
        ieltsUse: Array.isArray(entry?.ieltsUse) ? entry.ieltsUse : [],
        topics: Array.isArray(entry?.topics) ? entry.topics : [],
        difficulty: String(entry?.difficulty || "基础高频").trim() || "基础高频",
        category: String(entry?.category || "基础单词").trim() || "基础单词",
        forms: Array.isArray(entry?.forms) ? entry.forms : [],
        wordFamily: Array.isArray(entry?.wordFamily) ? entry.wordFamily : []
      };
    })
    .filter(Boolean);

  return {
    version: String(data?.version || "basic-zero-v1"),
    count: Number.isFinite(data?.count) ? data.count : words.length,
    generatedAt: String(data?.generatedAt || ""),
    note: String(data?.note || ""),
    words
  };
}

/**
 * Load the standalone basic-word lexicon from /data/basic-words.json.
 * Completely independent from the master lexicon (public/data/words.json).
 */
export async function loadBasicWords(fetchImpl = fetch) {
  const useMemory = fetchImpl === fetch;
  return loadSessionValue(
    "basic-words:normalized",
    async () => {
      let data;
      if (useMemory) {
        data = await loadSessionJson(BASIC_WORDS_DATA_URL, fetchImpl, { cache: "force-cache" });
      } else {
        const response = await fetchImpl(BASIC_WORDS_DATA_URL, { cache: "force-cache" });
        if (!response.ok) {
          throw new Error(`基础词库加载失败：HTTP ${response.status}`);
        }
        data = await response.json();
      }
      return buildBasicWordsPayload(data);
    },
    { useMemory }
  );
}

export function normalizeBasicWordKey(word) {
  return normalizeWordKey(word);
}
