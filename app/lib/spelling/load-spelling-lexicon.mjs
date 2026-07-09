import { loadPhrasesFromIndexedDB } from "../vocab/phrase-flashcard-store.mjs";
import { loadWordsFromIndexedDB } from "../vocab/word-store.mjs";
import { mergeWordContentWithUserState } from "../vocab/word-cache-meta.mjs";
import { asPhraseList, asWordList, mergeSpellingLexicon, normalizeEntryKey } from "./lexicon-merge.mjs";

let spellingLexiconCache = new Map();
let spellingLexiconPromise = new Map();

export function mergeHeadwordsWithLocalCache(headwords = [], cachedWords = []) {
  return mergeWordContentWithUserState(headwords, cachedWords);
}

function getLexiconCacheKey(options = {}) {
  return options.scope === "word" || options.scope === "phrase" ? options.scope : "all";
}

async function fetchVocabMeta() {
  const response = await fetch("/api/vocab-meta", { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return null;
  return response.json().catch(() => null);
}

function isHeadwordCacheCurrent(cachedMeta = {}, apiMeta = {}) {
  if (!cachedMeta?.lexiconHash || !apiMeta?.lexiconHash) return false;
  return (
    Number(cachedMeta.count) === Number(apiMeta.count) &&
    String(cachedMeta.version || "") === String(apiMeta.version || "") &&
    String(cachedMeta.lexiconHash) === String(apiMeta.lexiconHash)
  );
}

async function fetchBrowserLexicon(options = {}) {
  const scope = getLexiconCacheKey(options);
  const needsHeadwords = scope !== "phrase";
  const needsPhrases = scope !== "word";
  const headwordPaths = ["/api/vocab-data", "/data/words.json"];
  let headwords = [];
  let headwordVersion = "";

  if (needsHeadwords) {
    const cachedWords = await loadWordsFromIndexedDB().catch(() => null);
    const apiMeta = await fetchVocabMeta();
    const canUseCachedHeadwords =
      cachedWords?.words?.length &&
      apiMeta?.lexiconHash &&
      isHeadwordCacheCurrent(cachedWords.meta || {}, apiMeta);

    if (canUseCachedHeadwords) {
      headwords = cachedWords.words;
      headwordVersion = String(cachedWords.meta?.version || apiMeta?.version || "indexeddb-cache");
    } else {
      for (const requestPath of headwordPaths) {
        const response = await fetch(requestPath, { cache: "no-store" }).catch(() => null);
        if (!response?.ok) continue;

        const payload = await response.json().catch(() => null);
        const words = asWordList(payload);
        if (!words.length) continue;

        headwords = words;
        headwordVersion = String(payload?.version || payload?.savedAt || requestPath);
        break;
      }

      if (cachedWords?.words?.length) {
        headwords = mergeHeadwordsWithLocalCache(headwords, cachedWords.words);
      } else if (!headwords.length && cachedWords?.words?.length) {
        headwords = cachedWords.words;
        headwordVersion = String(cachedWords.meta?.version || "indexeddb-cache");
      }
    }
  }

  let phrasesPayload = { phrases: [] };
  let phrases = [];

  if (needsPhrases) {
    const phraseResponse = await fetch("/data/phrases.json", { cache: "no-store" }).catch(() => null);
    phrasesPayload = phraseResponse?.ok
      ? await phraseResponse.json().catch(() => ({ phrases: [] }))
      : { phrases: [] };

    phrases = asPhraseList(phrasesPayload);
    const cachedPhrases = await loadPhrasesFromIndexedDB().catch(() => ({ phrases: [] }));
    const phraseKeys = new Set(phrases.map(normalizeEntryKey));

    for (const phrase of cachedPhrases.phrases || []) {
      const key = normalizeEntryKey(phrase);
      if (key && !phraseKeys.has(key)) {
        phrases.push(phrase);
        phraseKeys.add(key);
      }
    }
  }

  return {
    headwords,
    phrases,
    headwordVersion,
    phraseVersion: String(phrasesPayload?.version || phrasesPayload?.generatedAt || "")
  };
}

export function clearSpellingLexiconCache() {
  spellingLexiconCache = new Map();
  spellingLexiconPromise = new Map();
}

export async function loadSpellingLexicon(options = {}) {
  const cacheKey = getLexiconCacheKey(options);

  if (!options.force && spellingLexiconCache.has(cacheKey)) return spellingLexiconCache.get(cacheKey);
  if (!options.force && spellingLexiconPromise.has(cacheKey)) return spellingLexiconPromise.get(cacheKey);

  const promise = (async () => {
    const loaded = await fetchBrowserLexicon({ scope: cacheKey });

    const merged = mergeSpellingLexicon(loaded.headwords, loaded.phrases, {
      headwordVersion: loaded.headwordVersion,
      phraseVersion: loaded.phraseVersion
    });
    spellingLexiconCache.set(cacheKey, merged);
    spellingLexiconPromise.delete(cacheKey);
    return merged;
  })().catch((error) => {
    spellingLexiconPromise.delete(cacheKey);
    throw error;
  });

  spellingLexiconPromise.set(cacheKey, promise);
  return promise;
}

export { mergeSpellingLexicon } from "./lexicon-merge.mjs";
