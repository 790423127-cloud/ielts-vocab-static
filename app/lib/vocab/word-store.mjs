import { LEXICON_VERSION_WITHOUT_CONFIRMED_PERSON_NAMES } from "./lexicon-guard-shared.mjs";
import {
  applyWordUserStateMap,
  buildWordCacheMeta,
  buildWordUserStateMap,
  isWordCacheCurrent,
  mergeWordContentWithUserState,
  stripWordUserState,
  WORD_CACHE_SCHEMA_VERSION
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
  try {
    const values = await Promise.all(keys.map((key) => requestValue(store, key)));
    await done;
    return values;
  } catch (error) {
    await done.catch(() => {});
    throw error;
  }
}

export function computeWordStoreContentHash(words = []) {
  const text = JSON.stringify(Array.isArray(words) ? words : []);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function updateContentHash(hash, text, start = 0, end = text.length) {
  let nextHash = hash;
  for (let index = start; index < end; index += 1) {
    nextHash ^= text.charCodeAt(index);
    nextHash = Math.imul(nextHash, 0x01000193);
  }
  return nextHash;
}

export function computeWordStoreContentHashFromChunks(serializedChunks = []) {
  const chunks = Array.isArray(serializedChunks) && serializedChunks.length
    ? serializedChunks
    : ["[]"];
  let hash = updateContentHash(0x811c9dc5, "[");

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = String(chunks[index] || "[]");
    if (index > 0) hash = updateContentHash(hash, ",");
    hash = updateContentHash(hash, chunk, 1, Math.max(1, chunk.length - 1));
  }

  hash = updateContentHash(hash, "]");
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function yieldToBrowserMainThread() {
  if (typeof globalThis.scheduler?.yield === "function") {
    return globalThis.scheduler.yield();
  }
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

export async function prepareWordStoreSnapshot(nextWords, options = {}) {
  const list = Array.isArray(nextWords) ? nextWords : [];
  const chunkSize = Math.max(1, Number(options.chunkSize) || BIG_WORDS_CHUNK_SIZE);
  const yieldControl = options.yieldControl || yieldToBrowserMainThread;
  const chunkCount = Math.max(1, Math.ceil(list.length / chunkSize));
  const serializedChunks = [];
  const userState = {};

  for (let index = 0; index < chunkCount; index += 1) {
    const start = index * chunkSize;
    const sourceChunk = list.slice(start, start + chunkSize);
    const contentChunk = sourceChunk.map(stripWordUserState);
    serializedChunks.push(JSON.stringify(contentChunk));
    Object.assign(userState, buildWordUserStateMap(sourceChunk));

    if (index < chunkCount - 1) await yieldControl();
  }

  return {
    serializedChunks,
    userState,
    contentHash: computeWordStoreContentHashFromChunks(serializedChunks),
    totalCount: list.length,
    chunkCount,
    chunkSize
  };
}

function cacheResult(status, options = {}) {
  return {
    status,
    words: Array.isArray(options.words) ? options.words : [],
    meta: options.meta || null,
    userState: options.userState && typeof options.userState === "object"
      ? options.userState
      : {},
    reason: options.reason || "",
    error: options.error
  };
}

export function validateWordCacheChunks(meta, rawChunks, userState = {}) {
  if (!meta || typeof meta !== "object") {
    return cacheResult("cache-miss", { userState });
  }
  if (Number(meta.schemaVersion) !== WORD_CACHE_SCHEMA_VERSION) {
    return cacheResult("cache-version-mismatch", {
      meta,
      userState,
      reason: `不支持的词库缓存schemaVersion：${meta.schemaVersion ?? "缺失"}`
    });
  }

  const chunkCount = Number(meta.chunks);
  const chunkSize = Number(meta.chunkSize);
  const totalCount = Number(meta.totalCount ?? meta.count);
  if (
    !Number.isInteger(chunkCount) ||
    chunkCount <= 0 ||
    !Number.isInteger(chunkSize) ||
    chunkSize <= 0 ||
    !Number.isInteger(totalCount) ||
    totalCount < 0 ||
    !Array.isArray(rawChunks) ||
    rawChunks.length !== chunkCount
  ) {
    return cacheResult("cache-invalid", {
      meta,
      userState,
      reason: "词库缓存manifest中的chunk数量、chunkSize或totalCount无效"
    });
  }

  const content = [];
  for (let index = 0; index < chunkCount; index += 1) {
    const raw = rawChunks[index];
    if (raw === undefined || raw === null || raw === "") {
      return cacheResult("cache-invalid", {
        meta,
        userState,
        reason: `词库缓存缺少chunk ${index}`
      });
    }

    let chunk;
    try {
      chunk = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return cacheResult("cache-invalid", {
        meta,
        userState,
        reason: `词库缓存chunk ${index}无法解析`
      });
    }
    const expectedFullChunk = index < chunkCount - 1;
    if (
      !Array.isArray(chunk) ||
      (expectedFullChunk && chunk.length !== chunkSize) ||
      (!expectedFullChunk && (chunk.length <= 0 || chunk.length > chunkSize))
    ) {
      return cacheResult("cache-invalid", {
        meta,
        userState,
        reason: `词库缓存chunk ${index}结构或长度无效`
      });
    }
    content.push(...chunk);
  }

  if (content.length !== totalCount) {
    return cacheResult("cache-invalid", {
      meta,
      userState,
      reason: `词库缓存数量不一致：manifest=${totalCount}，实际=${content.length}`
    });
  }
  if (meta.contentHash && meta.contentHash !== computeWordStoreContentHash(content)) {
    return cacheResult("cache-invalid", {
      meta,
      userState,
      reason: "词库缓存contentHash不一致"
    });
  }

  return cacheResult("cache-hit", {
    words: applyWordUserStateMap(content, userState),
    meta,
    userState
  });
}

export function applyStoredUserState(words, stored) {
  return applyWordUserStateMap(words, stored?.userState || {});
}

export async function loadWordsFromIndexedDB() {
  let db;
  try {
    db = await openBigStore();
  } catch (error) {
    return cacheResult("storage-error", { error, reason: error?.message || "IndexedDB打开失败" });
  }

  try {
    let meta;
    let state;
    let legacy;
    try {
      [meta, state, legacy] = await readStoredValues(db, [
        BIG_WORDS_META_KEY,
        BIG_WORD_USER_STATE_KEY,
        BIG_WORDS_KEY
      ]);
    } catch (error) {
      return cacheResult("storage-error", {
        error,
        reason: error?.message || "IndexedDB读取失败"
      });
    }
    const userState = state && typeof state === "object" ? state : {};
    const chunkCount = Number(meta?.chunks || 0);
    const chunkKeys = Array.from(
      { length: chunkCount },
      (_, index) => `${BIG_WORDS_CHUNK_PREFIX}${index}`
    );

    if (chunkCount > 0) {
      let rawChunks;
      try {
        rawChunks = await readStoredValues(db, chunkKeys);
      } catch (error) {
        return cacheResult("storage-error", {
          meta,
          userState,
          error,
          reason: error?.message || "IndexedDB chunk读取失败"
        });
      }
      return validateWordCacheChunks(meta, rawChunks, userState);
    }

    if (Array.isArray(legacy) && legacy.length) {
      await saveWordsToIndexedDB(legacy).catch(() => {});
      const legacyMeta = buildWordCacheMeta(legacy);
      return cacheResult("cache-hit", {
        words: applyWordUserStateMap(legacy, userState),
        meta: legacyMeta,
        userState
      });
    }
    if (meta) {
      return cacheResult("cache-invalid", {
        meta,
        userState,
        reason: "词库缓存manifest未声明有效chunk"
      });
    }
    return cacheResult("cache-miss", { userState });
  } finally {
    db.close();
  }
}

export async function saveWordsToIndexedDB(nextWords, sourceMeta = {}) {
  const list = Array.isArray(nextWords) ? nextWords : [];
  const prepared = await prepareWordStoreSnapshot(list);
  const db = await openBigStore();

  try {
    const [oldMeta] = await readStoredValues(db, [BIG_WORDS_META_KEY]).catch(() => [null]);
    const oldChunks = Number(oldMeta?.chunks || 0);
    const chunks = prepared.chunkCount;
    const transaction = db.transaction(BIG_STORE_NAME, "readwrite");
    const store = transaction.objectStore(BIG_STORE_NAME);
    const done = transactionDone(transaction);

    store.delete(BIG_WORDS_KEY);
    for (let index = 0; index < chunks; index += 1) {
      store.put(
        prepared.serializedChunks[index],
        `${BIG_WORDS_CHUNK_PREFIX}${index}`
      );
    }
    store.put(prepared.userState, BIG_WORD_USER_STATE_KEY);
    store.put(
      {
        ...buildWordCacheMeta(list, sourceMeta),
        chunks,
        chunkSize: prepared.chunkSize,
        totalCount: prepared.totalCount,
        contentHash: prepared.contentHash,
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
  const stored = await loadWordsFromIndexedDB();
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
        const onlineWords = applyStoredUserState(payload.words, stored);
        words = mergeWordContentWithUserState(onlineWords, words);
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
