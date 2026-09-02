import { safeLocalStorageGet, safeLocalStorageRemove, safeLocalStorageSet } from "../browser-storage.mjs";

export const READING_PARAPHRASE_STORAGE_KEY = "ielts_reading_paraphrases_v1";
export const READING_PARAPHRASE_ROLLBACK_KEY = "ielts_reading_paraphrases_rollback_v1";
export const READING_PARAPHRASE_SCHEMA_VERSION = 1;
export const READING_PARAPHRASE_ROLLBACK_VERSION = 2;
export const READING_PARAPHRASE_DIRECTION = {
  QUESTION_TO_SOURCE: "question-to-source",
  SOURCE_TO_QUESTION: "source-to-question",
  BROWSE: "browse"
};
export const READING_PARAPHRASE_STATUS = {
  NEW: "",
  KNOWN: "known",
  FUZZY: "fuzzy",
  UNFAMILIAR: "unfamiliar"
};

function text(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function key(value) {
  return text(value).toLocaleLowerCase("en-US");
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function readingParaphrasePairKey(questionPhrase, sourcePhrase) {
  return `${key(questionPhrase)}=>${key(sourcePhrase)}`;
}

function sourceKey(source = {}) {
  return [
    source.id,
    source.testId,
    source.partNumber,
    source.questionNumber,
    source.questionPrompt,
    source.evidence
  ].map(key).join("|");
}

function normalizeSource(source = {}) {
  return {
    id: text(source.id) || `source-${stableHash(sourceKey(source))}`,
    testId: text(source.testId),
    testTitle: text(source.testTitle),
    partNumber: Number(source.partNumber || 0) || null,
    questionNumber: text(source.questionNumber),
    questionPrompt: text(source.questionPrompt),
    evidence: String(source.evidence || "").trim(),
    userAnswer: text(source.userAnswer),
    correctAnswer: text(source.correctAnswer)
  };
}

function normalizeItem(item = {}, index = 0) {
  const questionPhrase = text(item.questionPhrase ?? item.question_phrase);
  const sourcePhrase = text(item.sourcePhrase ?? item.source_phrase);
  if (!questionPhrase || !sourcePhrase) return null;
  const pairKey = readingParaphrasePairKey(questionPhrase, sourcePhrase);
  const sources = Array.isArray(item.sources)
    ? item.sources.map(normalizeSource).filter((source) => source.id)
    : [];
  const declaredCount = Number(item.occurrenceCount ?? item.occurrence_count ?? 0);
  return {
    id: text(item.id) || `reading-pair-${stableHash(`${pairKey}|${index}`)}`,
    pairKey,
    questionPhrase,
    sourcePhrase,
    note: text(item.note),
    relationType: text(item.relationType ?? item.relation_type) || "direct-paraphrase",
    externalSource: text(item.externalSource),
    externalId: text(item.externalId),
    externalFingerprint: text(item.externalFingerprint ?? item.fingerprint),
    confidence: Math.max(0, Math.min(1, Number(item.confidence || 0))),
    occurrenceCount: Math.max(1, Number.isFinite(declaredCount) ? declaredCount : 0, sources.length),
    sources,
    createdAt: text(item.createdAt ?? item.created_at),
    updatedAt: text(item.updatedAt ?? item.updated_at),
    study: {
      status: Object.values(READING_PARAPHRASE_STATUS).includes(item.study?.status)
        ? item.study.status
        : READING_PARAPHRASE_STATUS.NEW,
      updatedAt: Number(item.study?.updatedAt || 0)
    }
  };
}

function parseTxt(input) {
  return String(input || "")
    .split(/\r?\n/)
    .map((line, index) => {
      const match = line.match(/^\s*(.+?)\s*=\s*(.+?)\s*$/);
      if (!match) return null;
      return normalizeItem({
        id: `reading-pair-${stableHash(readingParaphrasePairKey(match[1], match[2]))}`,
        questionPhrase: match[1],
        sourcePhrase: match[2]
      }, index);
    })
    .filter(Boolean);
}

export function parseReadingParaphraseImport(input) {
  let payload = input;
  if (typeof input === "string") {
    const raw = input.trim();
    if (!raw) return [];
    try {
      payload = JSON.parse(raw);
    } catch {
      return parseTxt(raw);
    }
  }

  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : [];
  return rows.map(normalizeItem).filter(Boolean);
}

function mergeSources(existing = [], incoming = []) {
  const byKey = new Map();
  for (const source of [...existing, ...incoming]) {
    const normalized = normalizeSource(source);
    const identity = sourceKey(normalized);
    if (!identity) continue;
    byKey.set(identity, normalized);
  }
  return [...byKey.values()];
}

function newestStudy(a = {}, b = {}) {
  const aTime = Number(a.updatedAt || 0);
  const bTime = Number(b.updatedAt || 0);
  return bTime > aTime ? b : a;
}

export function createReadingParaphraseState() {
  return {
    schemaVersion: READING_PARAPHRASE_SCHEMA_VERSION,
    items: [],
    direction: READING_PARAPHRASE_DIRECTION.QUESTION_TO_SOURCE,
    positions: {},
    updatedAt: 0
  };
}

export function mergeReadingParaphraseState(currentInput, incomingItems, now = Date.now()) {
  const current = currentInput && typeof currentInput === "object"
    ? currentInput
    : createReadingParaphraseState();
  const byPair = new Map();
  const pairByExternalId = new Map();

  for (const item of Array.isArray(current.items) ? current.items : []) {
    const normalized = normalizeItem(item);
    if (normalized) {
      byPair.set(normalized.pairKey, normalized);
      if (normalized.externalId) pairByExternalId.set(normalized.externalId, normalized.pairKey);
    }
  }

  let added = 0;
  let updated = 0;
  for (const incoming of Array.isArray(incomingItems) ? incomingItems : []) {
    const normalized = normalizeItem(incoming);
    if (!normalized) continue;
    const previousPairKey = normalized.externalId
      ? pairByExternalId.get(normalized.externalId)
      : undefined;
    const existing = byPair.get(previousPairKey || normalized.pairKey);
    if (!existing) {
      byPair.set(normalized.pairKey, normalized);
      if (normalized.externalId) pairByExternalId.set(normalized.externalId, normalized.pairKey);
      added += 1;
      continue;
    }
    if (previousPairKey && previousPairKey !== normalized.pairKey) {
      byPair.delete(previousPairKey);
    }
    const sources = mergeSources(existing.sources, normalized.sources);
    byPair.set(normalized.pairKey, {
      ...existing,
      id: existing.id || normalized.id,
      questionPhrase: normalized.questionPhrase,
      sourcePhrase: normalized.sourcePhrase,
      note: normalized.note || existing.note,
      relationType: normalized.relationType || existing.relationType,
      externalSource: normalized.externalSource || existing.externalSource,
      externalId: normalized.externalId || existing.externalId,
      externalFingerprint: normalized.externalFingerprint || existing.externalFingerprint,
      confidence: Math.max(existing.confidence, normalized.confidence),
      occurrenceCount: Math.max(existing.occurrenceCount, normalized.occurrenceCount, sources.length),
      sources,
      createdAt: existing.createdAt || normalized.createdAt,
      updatedAt: normalized.updatedAt || existing.updatedAt,
      study: newestStudy(existing.study, normalized.study)
    });
    if (normalized.externalId) pairByExternalId.set(normalized.externalId, normalized.pairKey);
    updated += 1;
  }

  return {
    state: {
      schemaVersion: READING_PARAPHRASE_SCHEMA_VERSION,
      items: [...byPair.values()],
      direction: Object.values(READING_PARAPHRASE_DIRECTION).includes(current.direction)
        ? current.direction
        : READING_PARAPHRASE_DIRECTION.QUESTION_TO_SOURCE,
      positions: current.positions && typeof current.positions === "object" ? current.positions : {},
      updatedAt: Number(now || Date.now())
    },
    added,
    updated
  };
}

export function mergeReadingParaphraseCloudState(localInput, remoteInput) {
  const local = localInput && typeof localInput === "object" ? localInput : createReadingParaphraseState();
  const remote = remoteInput && typeof remoteInput === "object" ? remoteInput : createReadingParaphraseState();
  const merged = mergeReadingParaphraseState(local, remote.items || [], Math.max(
    Number(local.updatedAt || 0),
    Number(remote.updatedAt || 0)
  )).state;
  const remoteIsNewer = Number(remote.updatedAt || 0) > Number(local.updatedAt || 0);
  return {
    ...merged,
    direction: remoteIsNewer ? remote.direction : local.direction,
    positions: {
      ...(remote.positions || {}),
      ...(local.positions || {})
    },
    updatedAt: Math.max(Number(local.updatedAt || 0), Number(remote.updatedAt || 0))
  };
}

export const READING_PARAPHRASE_INDEXED_DB_NAME = "ielts-reading-paraphrases-v1";
const READING_PARAPHRASE_INDEXED_DB_VERSION = 1;
const READING_PARAPHRASE_INDEXED_DB_STORE = "notebook";
const READING_PARAPHRASE_INDEXED_DB_SNAPSHOT_KEY = "snapshot";
const READING_PARAPHRASE_INDEXED_DB_ROLLBACK_KEY = "rollback";

function hydrateParaphraseState(parsed) {
  if (!parsed || typeof parsed !== "object") return createReadingParaphraseState();
  const merged = mergeReadingParaphraseState(
    createReadingParaphraseState(),
    parsed.items || [],
    parsed.updatedAt
  ).state;
  return {
    ...merged,
    direction: Object.values(READING_PARAPHRASE_DIRECTION).includes(parsed.direction)
      ? parsed.direction
      : merged.direction,
    positions: parsed.positions && typeof parsed.positions === "object"
      ? parsed.positions
      : {},
    updatedAt: Number(parsed.updatedAt || merged.updatedAt || 0)
  };
}

function serializeParaphraseState(state) {
  return {
    ...createReadingParaphraseState(),
    ...state,
    schemaVersion: READING_PARAPHRASE_SCHEMA_VERSION,
    updatedAt: Number(state?.updatedAt || Date.now())
  };
}

export function loadReadingParaphraseState() {
  const raw = safeLocalStorageGet(READING_PARAPHRASE_STORAGE_KEY);
  if (!raw) return createReadingParaphraseState();
  try {
    return hydrateParaphraseState(JSON.parse(raw));
  } catch {
    return createReadingParaphraseState();
  }
}

export function saveReadingParaphraseState(state) {
  return safeLocalStorageSet(
    READING_PARAPHRASE_STORAGE_KEY,
    JSON.stringify(serializeParaphraseState(state))
  );
}

function paraphraseRollbackId(item = {}) {
  return text(item.pairKey)
    || readingParaphrasePairKey(item.questionPhrase, item.sourcePhrase)
    || text(item.id);
}

function hasUniqueParaphraseRollbackIds(items) {
  const ids = items.map(paraphraseRollbackId);
  return ids.every(Boolean) && new Set(ids).size === ids.length;
}

export function buildReadingParaphraseRollback(state, previousState, now = Date.now()) {
  const nextItems = Array.isArray(state?.items) ? state.items : [];
  const previousItems = Array.isArray(previousState?.items) ? previousState.items : [];
  if (
    !hasUniqueParaphraseRollbackIds(nextItems)
    || !hasUniqueParaphraseRollbackIds(previousItems)
  ) {
    return {
      ...createReadingParaphraseState(),
      ...(previousState || {}),
      schemaVersion: READING_PARAPHRASE_SCHEMA_VERSION,
      kind: "snapshot",
      backedUpAt: now
    };
  }

  const nextById = new Map(nextItems.map((item) => [paraphraseRollbackId(item), item]));
  const previousEntries = previousItems.filter((item) => {
    const nextItem = nextById.get(paraphraseRollbackId(item));
    return !nextItem || JSON.stringify(nextItem) !== JSON.stringify(item);
  });
  return {
    schemaVersion: READING_PARAPHRASE_SCHEMA_VERSION,
    rollbackVersion: READING_PARAPHRASE_ROLLBACK_VERSION,
    kind: "delta",
    backedUpAt: now,
    previousOrder: previousItems.map(paraphraseRollbackId),
    previousEntries,
    previousDirection: previousState?.direction || READING_PARAPHRASE_DIRECTION.QUESTION_TO_SOURCE,
    previousPositions: previousState?.positions && typeof previousState.positions === "object"
      ? previousState.positions
      : {},
    previousUpdatedAt: Number(previousState?.updatedAt || 0)
  };
}

export function restoreReadingParaphraseRollback(currentState, rollback) {
  if (Array.isArray(rollback?.items)) return rollback;
  if (
    rollback?.kind !== "delta"
    || !Array.isArray(rollback.previousOrder)
    || !Array.isArray(rollback.previousEntries)
  ) {
    return null;
  }
  const currentItems = Array.isArray(currentState?.items) ? currentState.items : [];
  if (
    !hasUniqueParaphraseRollbackIds(currentItems)
    || !hasUniqueParaphraseRollbackIds(rollback.previousEntries)
  ) {
    return null;
  }
  const currentById = new Map(currentItems.map((item) => [paraphraseRollbackId(item), item]));
  const previousById = new Map(
    rollback.previousEntries.map((item) => [paraphraseRollbackId(item), item])
  );
  const items = rollback.previousOrder.map((id) => previousById.get(id) || currentById.get(id));
  if (!items.every(Boolean)) return null;
  return {
    schemaVersion: READING_PARAPHRASE_SCHEMA_VERSION,
    items,
    direction: rollback.previousDirection,
    positions: rollback.previousPositions || {},
    updatedAt: Number(rollback.previousUpdatedAt || 0)
  };
}

function isIndexedDbAvailable() {
  return typeof window !== "undefined" && typeof window.indexedDB?.open === "function";
}

function openParaphraseIndexedDb() {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new Error("当前浏览器未提供 IndexedDB"));
  }
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(
      READING_PARAPHRASE_INDEXED_DB_NAME,
      READING_PARAPHRASE_INDEXED_DB_VERSION
    );
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(READING_PARAPHRASE_INDEXED_DB_STORE)) {
        database.createObjectStore(READING_PARAPHRASE_INDEXED_DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB 打开失败"));
    request.onblocked = () => reject(new Error("IndexedDB 被其他页面占用"));
  });
}

function indexedDbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB 请求失败"));
  });
}

function indexedDbTransactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB 写入失败"));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB 写入已中止"));
  });
}

async function readParaphraseIndexedDbState() {
  const database = await openParaphraseIndexedDb();
  try {
    const transaction = database.transaction(READING_PARAPHRASE_INDEXED_DB_STORE, "readonly");
    const store = transaction.objectStore(READING_PARAPHRASE_INDEXED_DB_STORE);
    const done = indexedDbTransactionDone(transaction);
    const [snapshot, rollback] = await Promise.all([
      indexedDbRequest(store.get(READING_PARAPHRASE_INDEXED_DB_SNAPSHOT_KEY)),
      indexedDbRequest(store.get(READING_PARAPHRASE_INDEXED_DB_ROLLBACK_KEY))
    ]);
    await done;
    return {
      snapshot: snapshot ? hydrateParaphraseState(snapshot) : null,
      rollback: rollback || null
    };
  } finally {
    database.close();
  }
}

async function writeParaphraseIndexedDb(snapshot, rollback) {
  const database = await openParaphraseIndexedDb();
  try {
    const transaction = database.transaction(READING_PARAPHRASE_INDEXED_DB_STORE, "readwrite");
    const store = transaction.objectStore(READING_PARAPHRASE_INDEXED_DB_STORE);
    const done = indexedDbTransactionDone(transaction);
    if (snapshot) store.put(snapshot, READING_PARAPHRASE_INDEXED_DB_SNAPSHOT_KEY);
    if (rollback) store.put(rollback, READING_PARAPHRASE_INDEXED_DB_ROLLBACK_KEY);
    await done;
  } finally {
    database.close();
  }
}

function writeLocalParaphraseRollback(rollback) {
  const payload = JSON.stringify(rollback);
  safeLocalStorageRemove(READING_PARAPHRASE_ROLLBACK_KEY);
  return safeLocalStorageSet(READING_PARAPHRASE_ROLLBACK_KEY, payload);
}

export function saveReadingParaphraseRollback(state, previousState) {
  return writeLocalParaphraseRollback(buildReadingParaphraseRollback(state, previousState));
}

export async function persistReadingParaphraseRollback(state, previousState) {
  const rollback = buildReadingParaphraseRollback(state, previousState);
  const localOk = writeLocalParaphraseRollback(rollback);
  try {
    await writeParaphraseIndexedDb(null, rollback);
    return true;
  } catch {
    return localOk;
  }
}

export async function persistReadingParaphraseState(state, previousState = null) {
  const snapshot = serializeParaphraseState(state);
  const rollback = previousState
    ? buildReadingParaphraseRollback(state, previousState)
    : null;
  let indexedOk = false;
  try {
    await writeParaphraseIndexedDb(snapshot, rollback);
    indexedOk = true;
  } catch {
    indexedOk = false;
  }
  if (rollback) writeLocalParaphraseRollback(rollback);
  const localOk = saveReadingParaphraseState(snapshot);
  return indexedOk || localOk;
}

export async function loadPersistedReadingParaphraseState() {
  const local = loadReadingParaphraseState();
  try {
    const indexed = await readParaphraseIndexedDbState();
    const snapshot = indexed.snapshot;
    if (snapshot && Number(snapshot.updatedAt || 0) >= Number(local.updatedAt || 0) && snapshot.items) {
      return snapshot;
    }
  } catch {
    // Fall back to localStorage when IndexedDB is blocked or unavailable.
  }
  return local;
}

export function saveReadingParaphraseStateWithBackup(state, previousState) {
  return saveReadingParaphraseRollback(state, previousState)
    && saveReadingParaphraseState(state);
}
