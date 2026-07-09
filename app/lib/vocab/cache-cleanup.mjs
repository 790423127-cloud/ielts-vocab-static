export const VOCAB_CACHE_NAME_PREFIXES = [
  "ielts-vocab",
  "ielts_vocab",
  "static-vocab",
  "static_vocab",
  "vocab-",
  "next-data-ielts-vocab"
];

export function isVocabOwnedCacheName(name) {
  const value = String(name || "").trim().toLowerCase();
  return VOCAB_CACHE_NAME_PREFIXES.some((prefix) => value.startsWith(prefix));
}

export async function cleanupBrowserCachesForVocab(cachesApi = globalThis?.caches) {
  if (!cachesApi?.keys || !cachesApi?.delete) return 0;

  const names = await cachesApi.keys();
  let deleted = 0;

  for (const name of names) {
    if (!isVocabOwnedCacheName(name)) continue;
    if (await cachesApi.delete(name)) deleted += 1;
  }

  return deleted;
}
