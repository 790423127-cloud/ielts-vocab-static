import { asPhraseList } from "../spelling/lexicon-merge.mjs";
import { loadSessionJson, loadSessionValue } from "../browser-json-cache.mjs";

const PHRASES_URL = "/data/phrases.json";

export function normalizePhraseKey(phrase = {}) {
  return String(phrase?.id || phrase?.wordId || phrase?.word || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function buildPhraseLexiconMeta(payload = {}, phrases = []) {
  const version = String(payload?.version || payload?.generatedAt || "").trim();
  const count = phrases.length;
  const firstId = phrases[0]?.id || phrases[0]?.wordId || "";
  const lastId = phrases[phrases.length - 1]?.id || phrases[phrases.length - 1]?.wordId || "";
  const phraseLexiconHash = [version, count, firstId, lastId].join("|");

  return {
    version,
    count,
    phraseLexiconHash,
    generatedAt: payload?.generatedAt || "",
    source: payload?.source || PHRASES_URL
  };
}

export async function fetchPhrasesPayload(url = PHRASES_URL) {
  return loadSessionValue(`phrases:${url}`, async () => {
    const payload = await loadSessionJson(url, fetch, { cache: "force-cache" }).catch(async () => {
      const response = await fetch(url, { cache: "force-cache" });
      if (!response?.ok) {
        throw new Error(`词组库加载失败（HTTP ${response?.status || "unknown"}）`);
      }
      return response.json();
    });

    if (!payload) {
      throw new Error("词组库 JSON 解析失败");
    }

    const phrases = asPhraseList(payload);

    if (!phrases.length) {
      throw new Error("词组库为空，请检查 public/data/phrases.json");
    }

    return {
      payload,
      phrases,
      meta: buildPhraseLexiconMeta(payload, phrases)
    };
  });
}

/** Browser-only unified phrase loader. Never merges into word lists. */
export async function loadPhrases() {
  const loaded = await fetchPhrasesPayload(PHRASES_URL);
  return {
    phrases: loaded.phrases,
    version: loaded.meta.version,
    count: loaded.meta.count,
    phraseLexiconHash: loaded.meta.phraseLexiconHash,
    generatedAt: loaded.meta.generatedAt,
    source: loaded.meta.source
  };
}