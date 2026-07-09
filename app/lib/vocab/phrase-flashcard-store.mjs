import {
  PHRASE_FLASHCARD_CHUNK_PREFIX,
  PHRASE_FLASHCARD_CHUNK_SIZE,
  PHRASE_FLASHCARD_DB,
  PHRASE_FLASHCARD_META_KEY,
  PHRASE_FLASHCARD_STORE
} from "./phrase-flashcard-keys.mjs";

function openPhraseStore() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB 不可用"));
      return;
    }

    const req = indexedDB.open(PHRASE_FLASHCARD_DB, 1);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PHRASE_FLASHCARD_STORE)) {
        db.createObjectStore(PHRASE_FLASHCARD_STORE);
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("词组 IndexedDB 打开失败"));
  });
}

async function idbGet(key) {
  const db = await openPhraseStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHRASE_FLASHCARD_STORE, "readonly");
    const req = tx.objectStore(PHRASE_FLASHCARD_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function idbSet(key, value) {
  const db = await openPhraseStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHRASE_FLASHCARD_STORE, "readwrite");
    const req = tx.objectStore(PHRASE_FLASHCARD_STORE).put(value, key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function idbDelete(key) {
  const db = await openPhraseStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHRASE_FLASHCARD_STORE, "readwrite");
    const req = tx.objectStore(PHRASE_FLASHCARD_STORE).delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function loadPhrasesFromIndexedDB() {
  const meta = await idbGet(PHRASE_FLASHCARD_META_KEY).catch(() => null);
  if (!meta?.chunks) return { phrases: [], meta: null };

  const phrases = [];
  for (let i = 0; i < Number(meta.chunks); i += 1) {
    const raw = await idbGet(`${PHRASE_FLASHCARD_CHUNK_PREFIX}${i}`).catch(() => null);
    if (!raw) continue;
    const chunk = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(chunk)) phrases.push(...chunk);
  }

  return { phrases, meta };
}

export async function savePhrasesToIndexedDB(phrases, meta) {
  const list = Array.isArray(phrases) ? phrases : [];
  const oldMeta = await idbGet(PHRASE_FLASHCARD_META_KEY).catch(() => null);
  const oldChunks = Number(oldMeta?.chunks || 0);
  const chunks = Math.max(1, Math.ceil(list.length / PHRASE_FLASHCARD_CHUNK_SIZE));

  for (let i = 0; i < chunks; i += 1) {
    const start = i * PHRASE_FLASHCARD_CHUNK_SIZE;
    const chunk = list.slice(start, start + PHRASE_FLASHCARD_CHUNK_SIZE);
    await idbSet(`${PHRASE_FLASHCARD_CHUNK_PREFIX}${i}`, JSON.stringify(chunk));
  }

  for (let i = chunks; i < oldChunks; i += 1) {
    await idbDelete(`${PHRASE_FLASHCARD_CHUNK_PREFIX}${i}`).catch(() => {});
  }

  await idbSet(PHRASE_FLASHCARD_META_KEY, {
    ...meta,
    chunks,
    total: list.length,
    chunkSize: PHRASE_FLASHCARD_CHUNK_SIZE,
    updatedAt: Date.now()
  });

  return true;
}

export function isPhraseCacheValid(cachedMeta, freshMeta) {
  if (!cachedMeta?.phraseLexiconHash || !freshMeta?.phraseLexiconHash) return false;
  return (
    cachedMeta.phraseLexiconHash === freshMeta.phraseLexiconHash &&
    Number(cachedMeta.total) === Number(freshMeta.count)
  );
}

export async function loadPhrasesWithCache(fetchFresh) {
  const fresh = await fetchFresh();
  const cached = await loadPhrasesFromIndexedDB();

  if (cached.phrases.length && isPhraseCacheValid(cached.meta, fresh.meta)) {
    return {
      phrases: cached.phrases,
      ...fresh.meta,
      fromCache: true
    };
  }

  await savePhrasesToIndexedDB(fresh.phrases, fresh.meta);
  return {
    phrases: fresh.phrases,
    ...fresh.meta,
    fromCache: false
  };
}