import { LEXICON_VERSION_WITHOUT_CONFIRMED_PERSON_NAMES } from "./lexicon-guard-shared.mjs";
import {
  applyWordUserStateMap,
  buildWordCacheMeta,
  buildWordUserStateMap,
  isWordCacheCurrent,
  mergeWordContentWithUserState,
  stripWordUserState
} from "./word-cache-meta.mjs";

export const BIG_STORE_DB = "ielts_vocab_big_store_v1";
export const BIG_STORE_NAME = "kv";
export const BIG_WORDS_KEY = "words";
export const BIG_WORDS_META_KEY = "words_meta_v2";
export const BIG_WORDS_CHUNK_PREFIX = "words_chunk_v2_";
export const BIG_WORD_USER_STATE_KEY = "word_user_state_v1";
export const BIG_WORDS_CHUNK_SIZE = 250;

function openBigStore() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB 不可用"));
      return;
    }

    const request = indexedDB.open(BIG_STORE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BIG_STORE_NAME)) {
        db.createObjectStore(BIG_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB 打开失败"));
  });
}

function requestValue(store, key) {
  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB 读取失败"));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB 事务失败"));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB 事务已中止"));
  });
}

async function readStoredValues(db, keys) {
  const transaction = db.transaction(BIG_STORE_NAME, "readonly");
  const store = transaction.objectStore(BIG_STORE_NAME);
  const done = transactionDone(transaction);
  const values = await Promise.all(keys.map((key) => requestValue(store, key).catch(() => null)));
  await done;
  return values;
}

export async function loadWordsFromIndexedDB() {
  const db = await openBigStore();

  try {
    const [meta] = await readStoredValues(db, [BIG_WORDS_META_KEY]);
    const chunkCount = Number(meta?.chunks || 0);
    const chunkKeys = Array.from(
      { length: chunkCount },
      (_, index) => `${BIG_WORDS_CHUNK_PREFIX}${index}`
    );
    const keys = [...chunkKeys, BIG_WORD_USER_STATE_KEY, BIG_WORDS_KEY];
    const values = await readStoredValues(db, keys);
    const state = values[chunkKeys.length] || {};

    if (chunkCount > 0) {
      const content = [];
      for (let index = 0; index < chunkCount; index += 1) {
        const raw = values[index];
        if (!raw) continue;
        const chunk = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(chunk)) content.push(...chunk);
      }

      if (content.length) {
        return { words: applyWordUserStateMap(content, state), meta };
      }
    }

    const legacy = values[chunkKeys.length + 1];
    if (Array.isArray(legacy) && legacy.length) {
      await saveWordsToIndexedDB(legacy).catch(() => {});
      return { words: legacy, meta: buildWordCacheMeta(legacy) };
    }
  } finally {
    db.close();
  }

  return null;
}

export async function saveWordsToIndexedDB(nextWords, sourceMeta = {}) {
  const list = Array.isArray(nextWords) ? nextWords : [];
  const content = list.map(stripWordUserState);
  const userState = buildWordUserStateMap(list);
  const db = await openBigStore();

  try {
    const [oldMeta] = await readStoredValues(db, [BIG_WORDS_META_KEY]).catch(() => [null]);
    const oldChunks = Number(oldMeta?.chunks || 0);
    const chunks = Math.max(1, Math.ceil(content.length / BIG_WORDS_CHUNK_SIZE));
    const transaction = db.transaction(BIG_STORE_NAME, "readwrite");
    const store = transaction.objectStore(BIG_STORE_NAME);
    const done = transactionDone(transaction);

    store.delete(BIG_WORDS_KEY);
    for (let index = 0; index < chunks; index += 1) {
      const start = index * BIG_WORDS_CHUNK_SIZE;
      store.put(
        JSON.stringify(content.slice(start, start + BIG_WORDS_CHUNK_SIZE)),
        `${BIG_WORDS_CHUNK_PREFIX}${index}`
      );
    }
    store.put(userState, BIG_WORD_USER_STATE_KEY);
    store.put(
      {
        ...buildWordCacheMeta(list, sourceMeta),
        chunks,
        chunkSize: BIG_WORDS_CHUNK_SIZE,
        updatedAt: Date.now()
      },
      BIG_WORDS_META_KEY
    );
    for (let index = chunks; index < oldChunks; index += 1) {
      store.delete(`${BIG_WORDS_CHUNK_PREFIX}${index}`);
    }

    await done;
  } finally {
    db.close();
  }

  return true;
}

export async function saveWordUserStateToIndexedDB(words) {
  const db = await openBigStore();

  try {
    const transaction = db.transaction(BIG_STORE_NAME, "readwrite");
    const store = transaction.objectStore(BIG_STORE_NAME);
    const done = transactionDone(transaction);
    store.put(buildWordUserStateMap(words), BIG_WORD_USER_STATE_KEY);
    await done;
  } finally {
    db.close();
  }

  return true;
}

export async function loadActiveWordsForSync() {
  const stored = await loadWordsFromIndexedDB().catch(() => null);
  let words = stored?.words || [];
  let meta = stored?.meta || {};

  try {
    const metaResponse = await fetch("/api/vocab-meta", { cache: "no-store" });
    const apiMeta = metaResponse?.ok ? await metaResponse.json().catch(() => null) : null;

    if (words.length && apiMeta?.lexiconHash && isWordCacheCurrent(meta, apiMeta)) {
      return { words, meta: { ...meta, ...apiMeta } };
    }

    const response = await fetch("/api/vocab-data", { cache: "no-store" });
    if (response?.ok) {
      const payload = await response.json().catch(() => null);
      if (payload?.words?.length) {
        words = mergeWordContentWithUserState(payload.words, words);
        meta = {
          count: payload.count,
          version: payload.version || meta.version || "",
          lexiconHash: payload.lexiconHash || meta.lexiconHash || "",
          savedAt: payload.savedAt || meta.savedAt || "",
          fileHash: payload.fileHash || meta.fileHash || "",
          wordsHash: payload.wordsHash || meta.wordsHash || ""
        };
      }
    }
  } catch {}

  if (!words.length && stored?.words?.length) {
    words = stored.words;
    meta = stored.meta || meta;
  }

  return { words, meta };
}

export async function postExportCache(words, cacheMeta = {}, extra = {}) {
  const list = Array.isArray(words) ? words : [];
  if (!list.length) return { ok: false, skipped: true };

  const response = await fetch("/api/export-cache", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      words: list.map(stripWordUserState),
      savedAt: new Date().toISOString(),
      version: cacheMeta.version || LEXICON_VERSION_WITHOUT_CONFIRMED_PERSON_NAMES,
      lexiconHash: cacheMeta.lexiconHash || "",
      ...extra
    })
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    return { ok: false, error: detail.error || response.status, detail: detail.detail || "" };
  }

  return response.json().catch(() => ({ ok: false }));
}

export async function persistWordsToLocalLexicon(words, meta = {}, options = {}) {
  await saveWordsToIndexedDB(words, meta);
  if (options.publish !== true) return { ok: true, localOnly: true };
  return postExportCache(words, meta, { source: options.source || "explicit-content-edit" });
}

function normalizeWordLookup(value = "") {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function findWordIndexInList(words = [], lookup = "") {
  const key = normalizeWordLookup(lookup);
  if (!key) return -1;

  return (Array.isArray(words) ? words : []).findIndex((entry) => {
    const candidates = [
      entry?.word,
      entry?.answer,
      entry?.id,
      entry?.wordId
    ].map(normalizeWordLookup).filter(Boolean);

    return candidates.includes(key);
  });
}

export async function updateWordInLocalLexicon(lookup, patch = {}, options = {}) {
  const { words, meta } = options.words
    ? { words: options.words, meta: options.meta || {} }
    : await loadActiveWordsForSync();

  const index = findWordIndexInList(words, lookup);
  if (index < 0) {
    return { ok: false, words, meta, error: "词库中找不到该词" };
  }

  const nextWords = [...words];
  nextWords[index] = {
    ...nextWords[index],
    ...patch,
    word: patch.word || nextWords[index].word
  };

  if (options.persist !== false) {
    await persistWordsToLocalLexicon(nextWords, meta, options);
  }

  return { ok: true, words: nextWords, meta, entry: nextWords[index], index };
}
