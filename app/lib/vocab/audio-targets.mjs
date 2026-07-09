/**
 * Build unique speech targets from a word list (extracted from page.jsx I3.4).
 */
import {
  isSimpleDictionaryWord,
  normalizePhraseItems,
  normalizeWord
} from "./page-word-helpers.mjs";

export function collectAllAudioTargets(words = [], scope = "all") {
  const map = new Map();

  function add(text, kind = "word") {
    const clean = String(text || "").replace(/\s+/g, " ").trim();

    if (!clean || clean === "完成") return;

    const key = normalizeWord(clean);

    if (!key || map.has(key)) return;

    map.set(key, {
      key,
      word: clean,
      kind
    });
  }

  (Array.isArray(words) ? words : []).forEach((word) => {
    add(word.word, isSimpleDictionaryWord(word.word) ? "word" : "phrase");

    if (scope !== "word") {
      add(word.example, "sentence");

      normalizePhraseItems(word.collocations).forEach((item) => add(item.phrase, "phrase"));
      normalizePhraseItems(word.phraseCollocations).forEach((item) => add(item.phrase, "phrase"));

      if (Array.isArray(word.forms)) {
        word.forms.forEach((form) => add(form?.word, isSimpleDictionaryWord(form?.word) ? "word" : "phrase"));
      }

      if (Array.isArray(word.wordFamily)) {
        word.wordFamily.forEach((family) => add(family?.word, isSimpleDictionaryWord(family?.word) ? "word" : "phrase"));
      }
    }
  });

  return Array.from(map.values());
}
