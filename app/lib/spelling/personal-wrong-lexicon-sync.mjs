import { normalizeEntryKey } from "./lexicon-merge.mjs";
import {
  buildPersonalWrongLexiconIndex,
  normalizePersonalWrongBookRecords
} from "./personal-wrong-book.mjs";
import { normalizeSpellingAnswer } from "./word-id.mjs";
import { buildPhraseLexiconMeta } from "../vocab/load-phrases.mjs";
import {
  loadPhrasesFromIndexedDB,
  savePhrasesToIndexedDB
} from "../vocab/phrase-flashcard-store.mjs";
import {
  loadActiveWordsForSync,
  persistWordsToLocalLexicon
} from "../vocab/word-store.mjs";

function hashString(value = "") {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeHeadword(value = "") {
  return normalizeSpellingAnswer(value).replace(/\s+/g, " ").trim();
}

function fallbackPersonalWrongMeaning(record = {}) {
  return String(record.meaning || "个人做题错词，释义待补充").trim();
}

function recordLexiconKey(record = {}) {
  if (record.scope === "phrase") {
    return normalizeEntryKey({ word: record.anchor || record.word || record.targetAnswer });
  }
  return normalizeHeadword(record.anchor || record.baseWord || record.word || record.targetAnswer);
}

function isPersonalWrongSupplementalEntry(entry = {}) {
  return entry?.addedFromPersonalWrongBook === true ||
    entry?.source === "personal_wrong_book" ||
    entry?.candidateSource === "personal-wrong-book";
}

function buildScopedPersonalWrongKeySet(records = [], scope = "word") {
  const keys = new Set();
  for (const record of normalizePersonalWrongBookRecords(records)) {
    if (record.active === false || record.scope !== scope) continue;
    for (const value of [
      recordLexiconKey(record),
      record.normalizedAnchor,
      record.normalizedInflected,
      record.normalized
    ]) {
      const key = normalizeHeadword(value);
      if (key) keys.add(key);
    }
  }
  return keys;
}

export function pruneStalePersonalWrongLexiconEntries(entries = [], records = [], scope = "word") {
  const keepKeys = buildScopedPersonalWrongKeySet(records, scope);
  const kept = [];
  const removed = [];

  for (const entry of Array.isArray(entries) ? entries : []) {
    const key = normalizeEntryKey(entry);
    if (isPersonalWrongSupplementalEntry(entry) && key && !keepKeys.has(key)) {
      removed.push(entry);
      continue;
    }
    kept.push(entry);
  }

  return { entries: kept, removed, removedCount: removed.length };
}

export function isPersonalWrongRecordInLexicon(record = {}, headwords = [], phrases = []) {
  const key = recordLexiconKey(record);
  if (!key) return false;

  const index = buildPersonalWrongLexiconIndex(record.scope === "phrase" ? phrases : headwords);
  return Boolean(
    index.get(key)
    || index.get(record.normalizedAnchor)
    || index.get(record.normalizedInflected)
    || index.get(record.normalized)
  );
}

export function findPersonalWrongRecordsMissingFromLexicon(records = [], headwords = [], phrases = []) {
  return normalizePersonalWrongBookRecords(records).filter(
    (record) => record.active !== false && !isPersonalWrongRecordInLexicon(record, headwords, phrases)
  );
}

export function buildLexiconEntryFromPersonalWrongRecord(record = {}) {
  const isPhrase = record.scope === "phrase";
  const headword = String(
    isPhrase
      ? (record.anchor || record.word || record.targetAnswer)
      : (record.anchor || record.baseWord || record.word || record.targetAnswer)
  ).trim();

  const id = `word_${hashString(`${isPhrase ? "phrase" : "word"}:${normalizeEntryKey({ word: headword })}`)}`;
  const meaning = fallbackPersonalWrongMeaning(record);
  const normalizedHeadword = normalizeHeadword(headword);

  return {
    word: headword,
    normalizedHeadword,
    phonetic: "",
    pos: isPhrase ? "phrase" : "word",
    meaning,
    meaningZh: meaning,
    meaningDetailedZh: meaning,
    meaningDetailZh: meaning,
    definition: meaning,
    example: `Please review ${headword} in your personal wrong-word practice.`,
    exampleCn: "",
    collocations: [],
    phraseCollocations: [],
    ieltsUse: ["Spelling"],
    topics: ["个人做题错词"],
    difficulty: "中级核心",
    category: "个人做题错词",
    targetBand: "5-6",
    gTUseCase: "个人错词复习",
    candidateSource: "personal-wrong-book",
    sourceType: "local-personal-wrong",
    duplicateCheckResult: "personal-local-deduped",
    phoneticStatus: "pending_review",
    pronunciationSourceTier: "pending_review",
    pronunciationVariant: "en-US",
    status: "",
    favorite: false,
    forms: [],
    wordFamily: [],
    audio: "",
    exampleAudio: "",
    id,
    wordId: id,
    answer: headword,
    acceptedAnswers: [headword],
    entryType: isPhrase ? "phrase" : "headword",
    isPhrase,
    source: "personal_wrong_book",
    supplemental: true,
    addedFromPersonalWrongBook: true
  };
}

export function appendPersonalWrongRecordsToLexicon(headwords = [], phrases = [], records = []) {
  const normalized = normalizePersonalWrongBookRecords(records);
  const missing = findPersonalWrongRecordsMissingFromLexicon(normalized, headwords, phrases);
  const prunedHeadwords = pruneStalePersonalWrongLexiconEntries(headwords, normalized, "word");
  const prunedPhrases = pruneStalePersonalWrongLexiconEntries(phrases, normalized, "phrase");
  const nextHeadwords = [...prunedHeadwords.entries];
  const nextPhrases = [...prunedPhrases.entries];
  const addedEntries = [];
  const existingWordKeys = new Set(nextHeadwords.map(normalizeEntryKey));
  const existingPhraseKeys = new Set(nextPhrases.map(normalizeEntryKey));

  for (const record of missing) {
    const entry = buildLexiconEntryFromPersonalWrongRecord(record);
    const key = normalizeEntryKey(entry);

    if (record.scope === "phrase") {
      if (existingPhraseKeys.has(key)) continue;
      nextPhrases.push(entry);
      existingPhraseKeys.add(key);
    } else {
      if (existingWordKeys.has(key)) continue;
      nextHeadwords.push(entry);
      existingWordKeys.add(key);
    }

    addedEntries.push(entry);
  }

  return {
    headwords: nextHeadwords,
    phrases: nextPhrases,
    added: addedEntries.length,
    addedEntries,
    missingRecords: missing,
    removedHeadwords: prunedHeadwords.removedCount,
    removedPhrases: prunedPhrases.removedCount,
    removed: prunedHeadwords.removedCount + prunedPhrases.removedCount
  };
}

async function loadPhraseListForSync() {
  let phrases = [];
  let meta = null;

  try {
    const response = await fetch("/data/phrases.json", { cache: "no-store" });
    if (response?.ok) {
      const payload = await response.json().catch(() => null);
      phrases = Array.isArray(payload?.phrases) ? payload.phrases : [];
      meta = buildPhraseLexiconMeta(payload, phrases);
    }
  } catch {}

  const cached = await loadPhrasesFromIndexedDB().catch(() => ({ phrases: [], meta: null }));
  const mergedKeys = new Set(phrases.map(normalizeEntryKey));

  for (const phrase of cached.phrases || []) {
    const key = normalizeEntryKey(phrase);
    if (key && !mergedKeys.has(key)) {
      phrases.push(phrase);
      mergedKeys.add(key);
    }
  }

  return { phrases, meta: meta || cached.meta || buildPhraseLexiconMeta({}, phrases) };
}

export async function syncPersonalWrongRecordsToLocalLexicon(records = [], options = {}) {
  const normalized = normalizePersonalWrongBookRecords(records);
  const scopeFilter = options.scope || "";
  const recordsForSync = scopeFilter
    ? normalized.filter((record) => record.scope === scopeFilter)
    : normalized;

  const loadWords = options.loadWordsForSync || loadActiveWordsForSync;
  const loadPhrases = options.loadPhrasesForSync || loadPhraseListForSync;
  const persistWords = options.persistWords || persistWordsToLocalLexicon;
  const persistPhrases = options.persistPhrases || savePhrasesToIndexedDB;
  const needsWords = !scopeFilter || scopeFilter === "word";
  const needsPhrases = !scopeFilter || scopeFilter === "phrase";

  const { words: headwords, meta } = needsWords
    ? await loadWords()
    : { words: [], meta: null };
  const { phrases, meta: phraseMeta } = needsPhrases
    ? await loadPhrases()
    : { phrases: [], meta: null };
  const merged = appendPersonalWrongRecordsToLexicon(headwords, phrases, recordsForSync);
  const addedEntries = scopeFilter
    ? merged.addedEntries.filter((entry) => {
      const isPhrase = entry.entryType === "phrase" || entry.isPhrase;
      return scopeFilter === "phrase" ? isPhrase : !isPhrase;
    })
    : merged.addedEntries;
  const addedHeadwords = addedEntries.filter((entry) => entry.entryType !== "phrase" && !entry.isPhrase);
  const addedPhrases = addedEntries.filter((entry) => entry.entryType === "phrase" || entry.isPhrase);
  const shouldPersistWords = addedHeadwords.length > 0 || merged.removedHeadwords > 0;
  const shouldPersistPhrases = addedPhrases.length > 0 || merged.removedPhrases > 0;
  const nextPhraseMeta = shouldPersistPhrases
    ? buildPhraseLexiconMeta({ version: phraseMeta?.version || "phrase-layer-personal-wrong-v1" }, merged.phrases)
    : phraseMeta;

  if (shouldPersistWords) {
    await persistWords(merged.headwords, meta || {});
  }

  if (shouldPersistPhrases) {
    await persistPhrases(merged.phrases, nextPhraseMeta || buildPhraseLexiconMeta({}, merged.phrases));
  }

  return {
    ...merged,
    addedEntries,
    added: addedEntries.length,
    addedHeadwords: addedHeadwords.length,
    addedPhrases: addedPhrases.length,
    removedHeadwords: merged.removedHeadwords,
    removedPhrases: merged.removedPhrases,
    removed: merged.removed,
    wouldAdd: 0,
    pendingEntries: [],
    meta,
    phraseMeta: nextPhraseMeta
  };
}

export function resolveSpellingEntryAiTarget(entry = {}, scope = "word") {
  if (!entry || typeof entry !== "object") return "";

  if (scope === "phrase" || entry.isPhrase || entry.pos === "phrase") {
    return String(entry.word || entry.displayText || entry.expectedAnswer || "").trim();
  }

  return String(
    entry.personalWrong?.anchor
    || entry.personalWrong?.baseWord
    || entry.word
    || entry.displayText
    || entry.expectedAnswer
    || ""
  ).trim();
}
