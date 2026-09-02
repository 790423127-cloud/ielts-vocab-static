import {
  normalizeReadingWord,
  normalizeReadingWordKey
} from "../reading-words/storage.mjs";
import {
  mergeReadingParaphraseState,
  parseReadingParaphraseImport
} from "../reading-paraphrases/storage.mjs";

export const READING_COACH_SYNC_TYPE = "ielts-reading-coach-smart-sync";
export const READING_COACH_SOURCE = "ielts-reading-coach";
const MAX_SYNC_ITEMS = 5000;

function text(value) {
  return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
}

function validFingerprint(value) {
  return /^[a-f0-9]{64}$/i.test(text(value));
}

export function parseReadingCoachSyncPackage(input) {
  const payload = typeof input === "string" ? JSON.parse(input) : input;
  if (!payload || payload.type !== READING_COACH_SYNC_TYPE || payload.schemaVersion !== 1) {
    throw new Error("这不是受支持的阅读系统传输包");
  }
  const words = Array.isArray(payload.words) ? payload.words : [];
  const paraphrases = Array.isArray(payload.paraphrases) ? payload.paraphrases : [];
  if (words.length > MAX_SYNC_ITEMS || paraphrases.length > MAX_SYNC_ITEMS) {
    throw new Error("单次传输条目过多");
  }
  const cleanWords = words.filter((item) => text(item?.id) && text(item?.word) && validFingerprint(item?.fingerprint));
  const cleanParaphrases = paraphrases.filter((item) => (
    text(item?.id)
    && text(item?.questionPhrase)
    && text(item?.sourcePhrase)
    && validFingerprint(item?.fingerprint)
  ));
  if (cleanWords.length !== words.length || cleanParaphrases.length !== paraphrases.length) {
    throw new Error("传输包内有不完整条目，未写入词库");
  }
  return {
    ...payload,
    transferId: text(payload.transferId),
    words: cleanWords,
    paraphrases: cleanParaphrases
  };
}

function incomingReadingWord(item, now, idFactory) {
  const externalId = text(item.id);
  const readingMeaning = text(item.meaning);
  const readingSources = Array.isArray(item.sources) ? item.sources : [];
  const hasReadingContext = readingSources.some((source) => text(source?.sentence || source?.text || source?.quote));
  return normalizeReadingWord({
    id: `reading-coach-word-${externalId}`,
    word: text(item.word),
    meaning: text(item.meaning),
    importCount: Math.max(1, Number(item.occurrenceCount) || 1),
    externalSource: READING_COACH_SOURCE,
    externalId,
    externalFingerprint: text(item.fingerprint),
    readingMeaning,
    readingContextPending: hasReadingContext && !readingMeaning,
    readingContextReviewed: hasReadingContext && Boolean(readingMeaning),
    readingContextReviewSource: hasReadingContext && readingMeaning ? READING_COACH_SOURCE : "",
    readingContextReviewedAt: hasReadingContext && readingMeaning ? now : "",
    readingNote: text(item.note),
    readingStatus: text(item.status),
    readingSources,
    createdAt: text(item.createdAt) || now,
    updatedAt: text(item.updatedAt) || now
  }, { idFactory, now });
}

export function mergeReadingCoachWords(currentInput, incomingInput, options = {}) {
  const now = text(options.now) || new Date().toISOString();
  const words = (Array.isArray(currentInput) ? currentInput : [])
    .map((item) => normalizeReadingWord(item, { idFactory: options.idFactory, now }));
  const indexByExternalId = new Map();
  const indexByWord = new Map();
  words.forEach((item, index) => {
    if (item.externalSource === READING_COACH_SOURCE && item.externalId) {
      indexByExternalId.set(item.externalId, index);
    }
    indexByWord.set(normalizeReadingWordKey(item.word), index);
  });

  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const raw of Array.isArray(incomingInput) ? incomingInput : []) {
    const incoming = incomingReadingWord(raw, now, options.idFactory);
    const wordKey = normalizeReadingWordKey(incoming.word);
    const existingIndex = indexByExternalId.get(incoming.externalId) ?? indexByWord.get(wordKey);
    if (existingIndex === undefined) {
      words.push(incoming);
      const index = words.length - 1;
      indexByExternalId.set(incoming.externalId, index);
      indexByWord.set(wordKey, index);
      added += 1;
      continue;
    }

    const existing = words[existingIndex];
    const sameFingerprint = existing.externalSource === READING_COACH_SOURCE
      && existing.externalId === incoming.externalId
      && existing.externalFingerprint === incoming.externalFingerprint;
    if (sameFingerprint) {
      unchanged += 1;
      continue;
    }
    const sourceOwnedMeaning = !text(existing.meaning)
      || (existing.externalSource === READING_COACH_SOURCE && text(existing.meaning) === text(existing.readingMeaning));
    words[existingIndex] = normalizeReadingWord({
      ...existing,
      meaning: sourceOwnedMeaning ? incoming.meaning : existing.meaning,
      importCount: Math.max(Number(existing.importCount) || 1, Number(incoming.importCount) || 1),
      highFrequency: existing.highFrequency || incoming.highFrequency,
      externalSource: READING_COACH_SOURCE,
      externalId: incoming.externalId,
      externalFingerprint: incoming.externalFingerprint,
      readingMeaning: incoming.readingMeaning,
      readingContextPending: incoming.readingContextPending,
      readingContextReviewed: incoming.readingContextReviewed,
      readingContextReviewSource: incoming.readingContextReviewSource,
      readingContextReviewedAt: incoming.readingContextReviewedAt,
      readingNote: incoming.readingNote,
      readingStatus: incoming.readingStatus,
      readingSources: incoming.readingSources,
      updatedAt: now
    }, { idFactory: options.idFactory, now });
    indexByExternalId.set(incoming.externalId, existingIndex);
    updated += 1;
  }
  return { words, added, updated, unchanged };
}

export function mergeReadingCoachParaphrases(currentState, incomingInput, now = Date.now()) {
  const incoming = parseReadingParaphraseImport({
    items: (Array.isArray(incomingInput) ? incomingInput : []).map((item) => ({
      ...item,
      id: `reading-coach-pair-${text(item.id)}`,
      externalSource: READING_COACH_SOURCE,
      externalId: text(item.id),
      externalFingerprint: text(item.fingerprint)
    }))
  });
  const existingByExternalId = new Map(
    (Array.isArray(currentState?.items) ? currentState.items : [])
      .filter((item) => item.externalSource === READING_COACH_SOURCE && item.externalId)
      .map((item) => [item.externalId, item.externalFingerprint])
  );
  const result = mergeReadingParaphraseState(currentState, incoming, now);
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const item of incoming) {
    const previous = existingByExternalId.get(item.externalId);
    if (previous === undefined) added += 1;
    else if (previous === item.externalFingerprint) unchanged += 1;
    else updated += 1;
  }
  return { ...result, added, updated, unchanged };
}

export function buildReadingCoachSyncReceipt(payload) {
  return {
    transfer_id: text(payload.transferId),
    words: payload.words.map((item) => ({ id: text(item.id), fingerprint: text(item.fingerprint) })),
    paraphrases: payload.paraphrases.map((item) => ({ id: text(item.id), fingerprint: text(item.fingerprint) }))
  };
}
