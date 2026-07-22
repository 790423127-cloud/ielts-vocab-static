export const WORD_CACHE_SCHEMA_VERSION = 3;

export const USER_STATE_FIELDS = [
  "status",
  "favorite",
  "lastReviewedAt",
  "reviewCount",
  "correctCount",
  "wrongCount",
  "mastery",
  "learningProgress"
];

export function wordIdentity(entry = {}) {
  return String(entry.id || entry.wordId || entry.word || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();
}

export function stripWordUserState(entry = {}) {
  const content = { ...entry };
  for (const field of USER_STATE_FIELDS) delete content[field];
  return content;
}

export function buildWordUserStateMap(words = []) {
  const state = {};

  for (const entry of Array.isArray(words) ? words : []) {
    const key = wordIdentity(entry);
    if (!key) continue;

    const record = {};
    for (const field of USER_STATE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(entry, field)) record[field] = entry[field];
    }

    if (Object.keys(record).length) state[key] = record;
  }

  return state;
}

export function applyWordUserStateMap(words = [], state = {}) {
  return (Array.isArray(words) ? words : []).map((entry) => {
    const record = state?.[wordIdentity(entry)];
    return record ? { ...entry, ...record } : { ...entry };
  });
}

export function buildWordCacheMeta(words = [], sourceMeta = {}) {
  const list = Array.isArray(words) ? words : [];
  return {
    schemaVersion: WORD_CACHE_SCHEMA_VERSION,
    count: list.length,
    version: String(sourceMeta.version || ""),
    lexiconHash: String(sourceMeta.lexiconHash || ""),
    savedAt: String(sourceMeta.savedAt || ""),
    fileHash: String(sourceMeta.fileHash || ""),
    wordsHash: String(sourceMeta.wordsHash || "")
  };
}

export function isWordCacheCurrent(cacheMeta = {}, apiMeta = {}) {
  if (!cacheMeta.lexiconHash || !apiMeta.lexiconHash) return false;
  return (
    Number(cacheMeta.count) === Number(apiMeta.count) &&
    String(cacheMeta.version || "") === String(apiMeta.version || "") &&
    String(cacheMeta.lexiconHash) === String(apiMeta.lexiconHash)
  );
}

export function mergeWordContentWithUserState(
  freshWords = [],
  cachedWords = [],
  { includePersonalSupplements = true } = {}
) {
  const cachedById = new Map();
  for (const entry of Array.isArray(cachedWords) ? cachedWords : []) {
    const key = wordIdentity(entry);
    if (key) cachedById.set(key, entry);
  }

  const mergedWords = (Array.isArray(freshWords) ? freshWords : []).map((fresh) => {
    const cached = cachedById.get(wordIdentity(fresh));
    if (!cached) return { ...fresh };

    const merged = { ...fresh };
    for (const field of USER_STATE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(cached, field)) merged[field] = cached[field];
    }
    return merged;
  });

  if (!includePersonalSupplements) return mergedWords;

  const freshIds = new Set(mergedWords.map(wordIdentity).filter(Boolean));
  for (const cached of Array.isArray(cachedWords) ? cachedWords : []) {
    const key = wordIdentity(cached);
    const isPersonalWrongSupplement =
      cached?.addedFromPersonalWrongBook === true ||
      cached?.source === "personal_wrong_book" ||
      cached?.supplemental === true;

    if (key && !freshIds.has(key) && isPersonalWrongSupplement) {
      mergedWords.push({ ...cached });
      freshIds.add(key);
    }
  }

  return mergedWords;
}

export function formatVocabCountLabel(status, count) {
  if (status === "loading") return "加载中";
  if ((status === "online" || status === "offline") && Number.isFinite(Number(count))) {
    return `${Number(count).toLocaleString("en-US")} 词`;
  }
  return "词库不可用";
}

export function formatOfflineVocabNotice(meta = {}) {
  const version = String(meta.version || "未知版本").trim() || "未知版本";
  return `当前使用离线词库缓存，版本：${version}`;
}
