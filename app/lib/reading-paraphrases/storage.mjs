import { safeLocalStorageGet, safeLocalStorageSet } from "../browser-storage.mjs";

export const READING_PARAPHRASE_STORAGE_KEY = "ielts_reading_paraphrases_v1";
export const READING_PARAPHRASE_SCHEMA_VERSION = 1;
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

  for (const item of Array.isArray(current.items) ? current.items : []) {
    const normalized = normalizeItem(item);
    if (normalized) byPair.set(normalized.pairKey, normalized);
  }

  let added = 0;
  let updated = 0;
  for (const incoming of Array.isArray(incomingItems) ? incomingItems : []) {
    const normalized = normalizeItem(incoming);
    if (!normalized) continue;
    const existing = byPair.get(normalized.pairKey);
    if (!existing) {
      byPair.set(normalized.pairKey, normalized);
      added += 1;
      continue;
    }
    const sources = mergeSources(existing.sources, normalized.sources);
    byPair.set(normalized.pairKey, {
      ...existing,
      id: existing.id || normalized.id,
      questionPhrase: normalized.questionPhrase,
      sourcePhrase: normalized.sourcePhrase,
      note: normalized.note || existing.note,
      confidence: Math.max(existing.confidence, normalized.confidence),
      occurrenceCount: Math.max(existing.occurrenceCount, normalized.occurrenceCount, sources.length),
      sources,
      createdAt: existing.createdAt || normalized.createdAt,
      updatedAt: normalized.updatedAt || existing.updatedAt,
      study: newestStudy(existing.study, normalized.study)
    });
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

export function loadReadingParaphraseState() {
  const raw = safeLocalStorageGet(READING_PARAPHRASE_STORAGE_KEY);
  if (!raw) return createReadingParaphraseState();
  try {
    const parsed = JSON.parse(raw);
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
        : {}
    };
  } catch {
    return createReadingParaphraseState();
  }
}

export function saveReadingParaphraseState(state) {
  return safeLocalStorageSet(
    READING_PARAPHRASE_STORAGE_KEY,
    JSON.stringify({
      ...createReadingParaphraseState(),
      ...state,
      schemaVersion: READING_PARAPHRASE_SCHEMA_VERSION,
      updatedAt: Number(state?.updatedAt || Date.now())
    })
  );
}
