import { mergeWordContentWithUserState } from "./word-cache-meta.mjs";

const DB_NAME = "ielts_vocab_big_store_v1";
const STORE_NAME = "kv";
const META_KEY = "words_meta_v2";
const CHUNK_PREFIX = "words_chunk_v2_";
const LEGACY_KEY = "words";

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

async function openStore() {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB is unavailable");
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
  };
  return requestToPromise(request);
}

async function getValue(key) {
  const db = await openStore();
  try {
    const tx = db.transaction(STORE_NAME, "readonly");
    return await requestToPromise(tx.objectStore(STORE_NAME).get(key));
  } finally {
    db.close();
  }
}

function asWords(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.words)) return payload.words;
  return [];
}

export async function loadBrowserVocab() {
  const meta = await getValue(META_KEY).catch(() => null);
  if (meta?.version === 2 && Number(meta.chunks) > 0) {
    const words = [];
    for (let index = 0; index < Number(meta.chunks); index += 1) {
      const raw = await getValue(`${CHUNK_PREFIX}${index}`).catch(() => null);
      if (!raw) continue;
      const chunk = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Array.isArray(chunk)) words.push(...chunk);
    }
    if (words.length) return words;
  }

  const legacy = await getValue(LEGACY_KEY).catch(() => null);
  return Array.isArray(legacy) ? legacy : [];
}

async function fetchAuthoritativeVocab() {
  const paths = ["/api/vocab-data", "/data/words.json"];
  for (const path of paths) {
    const response = await fetch(path, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) continue;
    const payload = await response.json().catch(() => null);
    const words = asWords(payload);
    if (words.length) return words;
  }
  return [];
}

// The deployed words.json is the base vocabulary for spelling; local personal-wrong
// supplements are additive so user-added words are not lost after a release refresh.
export function mergeVocabForSpelling(authoritative = [], cached = []) {
  if (authoritative.length) return mergeWordContentWithUserState(authoritative, cached);
  return cached;
}

export async function loadVocabForSpelling() {
  const authoritative = await fetchAuthoritativeVocab();
  const cached = await loadBrowserVocab().catch(() => []);
  return mergeVocabForSpelling(authoritative, cached);
}
