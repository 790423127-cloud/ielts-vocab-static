import {
  LR_PARAPHRASE_CHUNK_PREFIX,
  LR_PARAPHRASE_CHUNK_SIZE,
  LR_PARAPHRASE_DB,
  LR_PARAPHRASE_META_KEY,
  LR_PARAPHRASE_STORE
} from "./lr-paraphrase-keys.mjs";

function openStore() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB 不可用"));
    const req = indexedDB.open(LR_PARAPHRASE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LR_PARAPHRASE_STORE)) db.createObjectStore(LR_PARAPHRASE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LR_PARAPHRASE_STORE, "readonly");
    const req = tx.objectStore(LR_PARAPHRASE_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function idbSet(key, value) {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LR_PARAPHRASE_STORE, "readwrite");
    const req = tx.objectStore(LR_PARAPHRASE_STORE).put(value, key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function loadParaphrasesFromIndexedDB() {
  const meta = await idbGet(LR_PARAPHRASE_META_KEY).catch(() => null);
  if (!meta?.chunks) return { entries: [], meta: null };
  const entries = [];
  for (let i = 0; i < Number(meta.chunks); i += 1) {
    const raw = await idbGet(`${LR_PARAPHRASE_CHUNK_PREFIX}${i}`).catch(() => null);
    if (!raw) continue;
    const chunk = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(chunk)) entries.push(...chunk);
  }
  return { entries, meta };
}

export async function saveParaphrasesToIndexedDB(entries, meta) {
  const list = Array.isArray(entries) ? entries : [];
  const chunks = Math.max(1, Math.ceil(list.length / LR_PARAPHRASE_CHUNK_SIZE));
  for (let i = 0; i < chunks; i += 1) {
    const chunk = list.slice(i * LR_PARAPHRASE_CHUNK_SIZE, (i + 1) * LR_PARAPHRASE_CHUNK_SIZE);
    await idbSet(`${LR_PARAPHRASE_CHUNK_PREFIX}${i}`, JSON.stringify(chunk));
  }
  await idbSet(LR_PARAPHRASE_META_KEY, { ...meta, chunks, total: list.length, updatedAt: Date.now() });
}

export function isParaphraseCacheValid(cachedMeta, freshMeta) {
  const cachedHash = cachedMeta?.paraphraseLexiconHash || cachedMeta?.synonymLexiconHash || "";
  const freshHash = freshMeta?.paraphraseLexiconHash || freshMeta?.synonymLexiconHash || "";
  return Boolean(cachedHash && freshHash && cachedHash === freshHash && Number(cachedMeta.total) === Number(freshMeta.count));
}

export async function loadParaphrasesWithCache(fetchFresh) {
  const fresh = await fetchFresh();
  const cached = await loadParaphrasesFromIndexedDB();
  if (cached.entries.length && isParaphraseCacheValid(cached.meta, fresh)) {
    return { entries: cached.entries, ...fresh, fromCache: true };
  }
  await saveParaphrasesToIndexedDB(fresh.entries, fresh);
  return { entries: fresh.entries, ...fresh, fromCache: false };
}