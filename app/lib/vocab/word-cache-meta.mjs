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
  const list = Array.isArray(words) ? words : [];
  if (!state || !Object.keys(state).length) return list;

  return list.map((entry) => {
    const record = state?.[wordIdentity(entry)];
    return record ? { ...entry, ...record } : entry;
  });
}

export function buildWordCacheMeta(words = [], sourceMeta = {}) {
  const list = Array.isArray(words) ? words : [];
  const declaredSourceCount = Number(sourceMeta.sourceCount ?? sourceMeta.count);
  return {
    schemaVersion: WORD_CACHE_SCHEMA_VERSION,
    count: list.length,
    sourceCount: Number.isInteger(declaredSourceCount) && declaredSourceCount >= 0
      ? declaredSourceCount
      : list.length,
    version: String(sourceMeta.version || ""),
    lexiconHash: String(sourceMeta.lexiconHash || ""),
    savedAt: String(sourceMeta.savedAt || ""),
    fileHash: String(sourceMeta.fileHash || ""),
    wordsHash: String(sourceMeta.wordsHash || "")
  };
}

export function isWordCacheCurrent(cacheMeta = {}, apiMeta = {}) {
  if (!cacheMeta.lexiconHash || !apiMeta.lexiconHash) return false;
  const cachedSourceCount = Number(cacheMeta.sourceCount ?? cacheMeta.count);
  return (
    cachedSourceCount === Number(apiMeta.count) &&
    String(cacheMeta.version || "") === String(apiMeta.version || "") &&
    String(cacheMeta.lexiconHash) === String(apiMeta.lexiconHash)
  );
}

export function mergeWordContentWithUserState(
  freshWords = [],
  cachedWords = [],
  { includePersonalSupplements = true, supplementKinds = null } = {}
) {
  const freshList = Array.isArray(freshWords) ? freshWords : [];
  const cachedList = Array.isArray(cachedWords) ? cachedWords : [];
  if (!cachedList.length) return freshList;

  const cachedById = new Map();
  for (const entry of cachedList) {
    const key = wordIdentity(entry);
    if (key) cachedById.set(key, entry);
  }

  const mergedWords = freshList.map((fresh) => {
    const cached = cachedById.get(wordIdentity(fresh));
    if (!cached) return fresh;

    let merged = fresh;
    for (const field of USER_STATE_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(cached, field)) continue;
      if (merged === fresh) merged = { ...fresh };
      merged[field] = cached[field];
    }
    return merged;
  });

  if (!includePersonalSupplements) return mergedWords;

  const allowedKinds = Array.isArray(supplementKinds) ? new Set(supplementKinds) : null;
  const freshIds = new Set(mergedWords.map(wordIdentity).filter(Boolean));
  for (const cached of cachedList) {
    const key = wordIdentity(cached);
    const supplementKind =
      cached?.addedFromReadingWords === true || cached?.source === "personal-reading"
        ? "personal-reading"
        : cached?.addedFromPersonalWrongBook === true || cached?.source === "personal_wrong_book"
          ? "personal-wrong"
          : cached?.supplemental === true
            ? "other"
            : "";
    const isPersonalSupplement =
      Boolean(supplementKind) && (!allowedKinds || allowedKinds.has(supplementKind));

    if (key && !freshIds.has(key) && isPersonalSupplement) {
      mergedWords.push({ ...cached });
      freshIds.add(key);
    }
  }

  return mergedWords;
}

export function formatVocabCountLabel(status, count) {
  if (status === "loading") return "加载中";
  if ((status === "online" || status === "offline") && Number(count) > 0) {
    return `${Number(count).toLocaleString("en-US")} 词`;
  }
  if (status === "online" || status === "offline") return "准备中";
  return "词库不可用";
}

export function formatOfflineVocabNotice(meta = {}) {
  const version = String(meta.version || "未知版本").trim() || "未知版本";
  return `当前使用离线词库缓存，版本：${version}`;
}
