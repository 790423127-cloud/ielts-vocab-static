import { filterDistinctSynonymTerms } from "../vocab/synonym-equivalence.mjs";
import {
  hasCompleteReadingSynonymDetails,
  normalizeReadingSynonymDetails
} from "./synonym-details.mjs";
import {
  applyMeaningCoverageReview,
  isMeaningCoverageProfileUsable,
  needsMeaningCoverageReview
} from "../vocab/meaning-coverage-audit.mjs";
import { needsMultiPosSenseRepair } from "../vocab/multi-pos-sense-coverage.mjs";

export const READING_WORDS_STORAGE_KEY = "ielts-personal-reading-words-v1";
export const READING_WORDS_ROLLBACK_KEY = "ielts-personal-reading-words-rollback-v1";
export const READING_WORDS_SESSION_KEY = "ielts-personal-reading-words-session-v1";
export const READING_WORDS_BACKUP_VERSION = 1;
export const READING_WORDS_ROLLBACK_VERSION = 2;
export const READING_WORDS_INDEXED_DB_NAME = "ielts-personal-reading-words-v1";
const READING_WORDS_INDEXED_DB_VERSION = 1;
const READING_WORDS_INDEXED_DB_STORE = "notebook";
const READING_WORDS_INDEXED_DB_SNAPSHOT_KEY = "snapshot";
const READING_WORDS_INDEXED_DB_ROLLBACK_KEY = "rollback";
const NO_ROLLBACK_UPDATE = Symbol("no-reading-words-rollback-update");
const READING_AI_REVIEW_SOURCE = "reading-ai";

const CORE_FIELDS = ["pos", "meaning", "definition", "example", "exampleCn"];
const REVIEWED_RELATION_FIELDS = [
  ["forms", "formsReviewed"],
  ["wordFamily", "wordFamilyReviewed"],
  ["synonyms", "synonymsReviewed"]
];

const FIELD_ALIASES = new Map([
  ["word", "word"], ["headword", "word"], ["单词", "word"], ["词", "word"],
  ["meaning", "meaning"], ["释义", "meaning"], ["中文释义", "meaning"],
  ["definition", "definition"], ["英文释义", "definition"], ["英文定义", "definition"],
  ["pos", "pos"], ["part of speech", "pos"], ["词性", "pos"],
  ["phonetic", "phonetic"], ["音标", "phonetic"],
  ["example", "example"], ["英文例句", "example"], ["例句", "example"],
  ["examplecn", "exampleCn"], ["example cn", "exampleCn"], ["例句翻译", "exampleCn"], ["中文例句", "exampleCn"],
  ["synonyms", "synonyms"], ["synonym", "synonyms"], ["同义替换", "synonyms"], ["同义词", "synonyms"]
]);

const IMPORT_COLUMN_ORDER = [
  "word", "meaning", "definition", "pos", "phonetic", "example", "exampleCn", "synonyms"
];

const POS_ALIASES = new Map([
  ["n", "noun"], ["n.", "noun"], ["noun", "noun"],
  ["v", "verb"], ["v.", "verb"], ["verb", "verb"],
  ["adj", "adjective"], ["adj.", "adjective"], ["adjective", "adjective"],
  ["adv", "adverb"], ["adv.", "adverb"], ["adverb", "adverb"],
  ["prep", "preposition"], ["prep.", "preposition"], ["preposition", "preposition"],
  ["conj", "conjunction"], ["conj.", "conjunction"], ["conjunction", "conjunction"],
  ["pron", "pronoun"], ["pron.", "pronoun"], ["pronoun", "pronoun"],
  ["det", "determiner"], ["det.", "determiner"], ["determiner", "determiner"],
  ["interj", "interjection"], ["interj.", "interjection"], ["interjection", "interjection"],
  ["auxiliary verb", "auxiliary verb"], ["modal verb", "modal verb"], ["phrase", "phrase"]
]);

const POS_PATTERN = Array.from(POS_ALIASES.keys())
  .sort((a, b) => b.length - a.length)
  .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");
const POS_AT_START_RE = new RegExp(`^(${POS_PATTERN})(?:\\s+|[.．:：-]+\\s*)`, "i");
const CJK_RE = /[\u3400-\u9fff]/;

function cleanText(value) {
  return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
}

function normalizeImportedPos(value) {
  const clean = cleanText(value).toLowerCase();
  return POS_ALIASES.get(clean) || cleanText(value);
}

export function normalizeReadingWordKey(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"');
}

export function getReadingWordContext(word = {}) {
  const sources = Array.isArray(word?.readingSources) ? word.readingSources : [];
  const candidates = sources
    .map((source) => ({
      source,
      sentence: cleanText(source?.sentence || source?.text || source?.quote)
    }))
    .filter((item) => item.sentence);
  if (!candidates.length) return { sentence: "", label: "", sourceId: "" };

  const wordKey = normalizeReadingWordKey(word?.word);
  const selected = candidates.find((item) => (
    wordKey && normalizeReadingWordKey(item.sentence).includes(wordKey)
  )) || candidates[0];
  return {
    sentence: selected.sentence,
    label: [cleanText(selected.source?.testTitle), cleanText(selected.source?.context)]
      .filter(Boolean)
      .join(" · "),
    sourceId: cleanText(selected.source?.id)
  };
}

export function normalizeReadingWordsSession(value = {}) {
  return {
    selectedId: cleanText(value?.selectedId),
    search: cleanText(value?.search),
    onlyIncomplete: value?.onlyIncomplete === true,
    onlyFrequent: value?.onlyFrequent === true
  };
}

export function normalizeReadingSynonyms(value, headword = "") {
  return filterDistinctSynonymTerms(value, headword, { max: 8 });
}

function createStableId(idFactory) {
  if (typeof idFactory === "function") return cleanText(idFactory());
  if (typeof globalThis.crypto?.randomUUID === "function") return `reading-${globalThis.crypto.randomUUID()}`;
  return `reading-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeReadingWord(input = {}, { idFactory, preserveId = true, now: nowOption } = {}) {
  const word = cleanText(input.word || input.headword);
  const now = cleanText(nowOption) || new Date().toISOString();
  const sourceId = preserveId ? cleanText(input.id || input.wordId) : "";
  const id = sourceId || createStableId(idFactory);
  const importCount = Math.max(1, Math.floor(Number(input.importCount) || 1));
  return {
    id,
    wordId: id,
    word,
    phonetic: cleanText(input.phonetic),
    pos: cleanText(input.pos || input.partOfSpeech),
    meaning: cleanText(input.meaning || input.chineseMeaning),
    meaningDetailZh: cleanText(input.meaningDetailZh),
    definition: cleanText(input.definition),
    otherMeanings: Array.isArray(input.otherMeanings) ? input.otherMeanings : [],
    meaningCoveragePending: input.meaningCoveragePending === true,
    meaningCoverageReviewed: input.meaningCoverageReviewed === true,
    meaningCoverageAuditStatus: cleanText(input.meaningCoverageAuditStatus),
    meaningCoverageReviewSource: cleanText(input.meaningCoverageReviewSource),
    meaningCoverageReviewedAt: cleanText(input.meaningCoverageReviewedAt),
    meaningCoveragePromptVersion: cleanText(input.meaningCoveragePromptVersion),
    example: cleanText(input.example),
    exampleCn: cleanText(input.exampleCn),
    forms: Array.isArray(input.forms) ? input.forms : [],
    wordFamily: Array.isArray(input.wordFamily) ? input.wordFamily : [],
    synonyms: normalizeReadingSynonyms(input.synonyms || input.validatedSynonyms || input.recommendedSynonyms, word),
    synonymDetails: normalizeReadingSynonymDetails(
      [
        ...(Array.isArray(input.synonymDetails || input.synonym_details)
          ? (input.synonymDetails || input.synonym_details)
          : []),
        ...(Array.isArray(input.synonyms) ? input.synonyms : [])
      ],
      input.synonyms || input.validatedSynonyms || input.recommendedSynonyms,
      word
    ),
    // Keep AI review flags even if an older write lost the exact source tag;
    // otherwise words can stay "incomplete" forever after a successful AI pass.
    formsReviewed: input.formsReviewed === true,
    formsReviewSource: input.formsReviewed === true
      ? (cleanText(input.formsReviewSource) || READING_AI_REVIEW_SOURCE)
      : "",
    wordFamilyReviewed: input.wordFamilyReviewed === true,
    wordFamilyReviewSource: input.wordFamilyReviewed === true
      ? (cleanText(input.wordFamilyReviewSource) || READING_AI_REVIEW_SOURCE)
      : "",
    synonymsReviewed: input.synonymsReviewed === true,
    synonymsReviewSource: input.synonymsReviewed === true
      ? (cleanText(input.synonymsReviewSource) || READING_AI_REVIEW_SOURCE)
      : "",
    mainWordId: cleanText(input.mainWordId),
    baseWord: cleanText(input.baseWord),
    baseWordId: cleanText(input.baseWordId),
    relationType: cleanText(input.relationType),
    correctedFrom: cleanText(input.correctedFrom),
    externalSource: cleanText(input.externalSource),
    externalId: cleanText(input.externalId),
    externalFingerprint: cleanText(input.externalFingerprint),
    readingMeaning: cleanText(input.readingMeaning),
    readingContextPending: input.readingContextPending === true && input.readingContextReviewed !== true,
    readingContextReviewed: input.readingContextReviewed === true,
    readingContextReviewSource: input.readingContextReviewed === true
      ? cleanText(input.readingContextReviewSource)
      : "",
    readingContextReviewedAt: input.readingContextReviewed === true
      ? cleanText(input.readingContextReviewedAt)
      : "",
    readingNote: cleanText(input.readingNote),
    readingStatus: cleanText(input.readingStatus),
    readingSources: Array.isArray(input.readingSources) ? input.readingSources : [],
    importCount,
    highFrequency: input.highFrequency === true || importCount >= 2,
    firstImportedAt: cleanText(input.firstImportedAt) || cleanText(input.createdAt) || now,
    lastImportedAt: cleanText(input.lastImportedAt) || cleanText(input.updatedAt) || now,
    status: ["熟悉", "模糊", "不熟"].includes(input.status) ? input.status : "",
    lastReviewedAt: cleanText(input.lastReviewedAt),
    favorite: Boolean(input.favorite),
    source: "personal-reading",
    createdAt: cleanText(input.createdAt) || now,
    updatedAt: cleanText(input.updatedAt) || now
  };
}

export function getReadingWordMissingFields(word) {
  const missing = CORE_FIELDS.filter((field) => !cleanText(word?.[field]));
  if (needsMultiPosSenseRepair(word)) missing.push("multiPosSenses");
  if (needsMeaningCoverageReview(word)) missing.push("meaningDetailZh");
  for (const [field, reviewedField] of REVIEWED_RELATION_FIELDS) {
    const hasData = Array.isArray(word?.[field]) && word[field].length > 0;
    if (!hasData && word?.[reviewedField] !== true) missing.push(field);
  }
  if (!hasCompleteReadingSynonymDetails(word)) missing.push("synonymDetails");
  return missing;
}

export function isReadingWordIncomplete(word) {
  return Boolean(cleanText(word?.word) && getReadingWordMissingFields(word).length);
}

function parseDelimitedRows(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => cleanText(value))) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => cleanText(value))) rows.push(row);
  return rows;
}

function normalizeHeader(value) {
  return cleanText(value).toLowerCase().replace(/[_-]+/g, " ");
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headerFields = rows[0].map((value) => FIELD_ALIASES.get(normalizeHeader(value)) || "");
  const hasHeader = headerFields.includes("word");
  const fields = hasHeader ? headerFields : IMPORT_COLUMN_ORDER;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  return dataRows.map((row) => {
    const item = {};
    row.forEach((value, index) => {
      const field = fields[index];
      if (field && item[field] === undefined) item[field] = value;
    });
    return item;
  });
}

function stripLinePrefix(value) {
  return cleanText(value).replace(/^(?:[-*•·]\s*|\d+[.)、]\s*)/, "");
}

export function parseReadingWordsPlainLine(value) {
  const line = stripLinePrefix(value);
  if (!line) return null;

  const phoneticMatch = line.match(/^(.+?)\s+(\/[^/\n]+\/|\[[^\]\n]+\])(?:\s+|$)(.*)$/);
  if (phoneticMatch) {
    const word = cleanText(phoneticMatch[1]).replace(/[：:;,，；]+$/, "");
    let rest = cleanText(phoneticMatch[3]);
    let pos = "";
    const posMatch = rest.match(POS_AT_START_RE);
    if (posMatch) {
      pos = normalizeImportedPos(posMatch[1]);
      rest = cleanText(rest.slice(posMatch[0].length));
    }
    return { word, phonetic: cleanText(phoneticMatch[2]), pos, meaning: rest };
  }

  const posMatch = line.match(new RegExp(`^(.+?)\\s+(${POS_PATTERN})(?:\\s+|[.．:：-]+\\s*)(.+)$`, "i"));
  if (posMatch) {
    return {
      word: cleanText(posMatch[1]).replace(/[：:;,，；]+$/, ""),
      pos: normalizeImportedPos(posMatch[2]),
      meaning: cleanText(posMatch[3])
    };
  }

  const firstSpace = line.search(/\s/);
  if (firstSpace > 0) {
    const possibleWord = cleanText(line.slice(0, firstSpace));
    const remainder = cleanText(line.slice(firstSpace));
    if (/^[A-Za-z][A-Za-z'’.-]*$/.test(possibleWord) && CJK_RE.test(remainder)) {
      return { word: possibleWord, meaning: remainder };
    }
  }

  return { word: line };
}

export function parseReadingWordsTable(value, options = {}) {
  const text = String(value || "").trim();
  if (!text) return [];
  let rawItems;
  if (text.startsWith("[") || text.startsWith("{")) {
    const parsed = JSON.parse(text);
    rawItems = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.words) ? parsed.words : [];
  } else {
    const firstLine = text.split(/\r?\n/, 1)[0] || "";
    if (firstLine.includes("\t")) {
      rawItems = rowsToObjects(parseDelimitedRows(text, "\t"));
    } else if (firstLine.includes(",")) {
      rawItems = rowsToObjects(parseDelimitedRows(text, ","));
    } else {
      rawItems = text.split(/\r?\n/).map(parseReadingWordsPlainLine).filter(Boolean);
    }
  }
  return rawItems.map((item) => normalizeReadingWord(item, options)).filter((item) => item.word);
}

export function mergeReadingWordImports(currentWords, incomingWords, { idFactory, now: nowOption } = {}) {
  const now = cleanText(nowOption) || new Date().toISOString();
  const words = (Array.isArray(currentWords) ? currentWords : []).map((item) => normalizeReadingWord(item, { idFactory, now }));
  const indexByWordKey = new Map(words.map((item, index) => [normalizeReadingWordKey(item.word), index]));
  const knownIds = new Set(words.map((item) => cleanText(item.id || item.wordId)).filter(Boolean));
  let added = 0;
  let duplicates = 0;
  let promoted = 0;
  for (const raw of Array.isArray(incomingWords) ? incomingWords : []) {
    const normalized = normalizeReadingWord(raw, { idFactory, now });
    const wordKey = normalizeReadingWordKey(normalized.word);
    const existingIndex = indexByWordKey.get(wordKey);
    if (!wordKey) {
      duplicates += 1;
      continue;
    }
    if (existingIndex !== undefined) {
      const existing = words[existingIndex];
      const nextCount = Math.max(1, Number(existing.importCount) || 1) + 1;
      if (!existing.highFrequency && nextCount >= 2) promoted += 1;
      words[existingIndex] = { ...existing, importCount: nextCount, highFrequency: nextCount >= 2, lastImportedAt: now, updatedAt: now };
      duplicates += 1;
      continue;
    }
    if (knownIds.has(normalized.id)) {
      const nextId = createStableId(idFactory);
      normalized.id = nextId;
      normalized.wordId = nextId;
    }
    words.push(normalized);
    indexByWordKey.set(wordKey, words.length - 1);
    knownIds.add(normalized.id);
    added += 1;
  }
  return { words, added, duplicates, promoted };
}

export function mergeReadingWordAiProfile(word, profile = {}, options = {}) {
  let next = { ...word };
  const contextSentence = cleanText(options.contextSentence);
  const contextAware = Boolean(contextSentence);
  // Accept OCR/import typo fixes from AI (e.g. ncestors → ancestors).
  const corrected = cleanText(profile.word);
  const correctedFrom = cleanText(profile.correctedFrom);
  if (
    corrected &&
    correctedFrom &&
    normalizeReadingWordKey(correctedFrom) === normalizeReadingWordKey(next.word) &&
    normalizeReadingWordKey(corrected) !== normalizeReadingWordKey(next.word)
  ) {
    next.word = corrected;
  } else if (
    corrected &&
    normalizeReadingWordKey(corrected) !== normalizeReadingWordKey(next.word) &&
    // single-letter drop/add near miss without explicit correctedFrom
    (normalizeReadingWordKey(next.word).slice(1) === normalizeReadingWordKey(corrected) ||
      normalizeReadingWordKey(corrected).slice(1) === normalizeReadingWordKey(next.word))
  ) {
    next.word = corrected;
  }
  for (const field of ["phonetic", "pos", "meaning", "meaningDetailZh", "definition", "example", "exampleCn"]) {
    if (!cleanText(next[field]) && cleanText(profile[field])) next[field] = cleanText(profile[field]);
  }
  for (const field of ["otherMeanings", "forms", "wordFamily"]) {
    if ((!Array.isArray(next[field]) || !next[field].length) && Array.isArray(profile[field])) next[field] = profile[field];
  }
  if (!Array.isArray(next.synonyms) || !next.synonyms.length) {
    next.synonyms = normalizeReadingSynonyms(profile.synonyms, next.word);
  }
  if (contextAware) {
    // The reading passage owns the primary sense.  Replace semantic fields
    // inherited from the global lexicon, but keep identity and study state.
    for (const field of ["pos", "meaning", "meaningDetailZh", "definition", "exampleCn"]) {
      if (cleanText(profile[field])) next[field] = cleanText(profile[field]);
    }
    next.example = contextSentence;
    for (const field of ["otherMeanings", "forms", "wordFamily"]) {
      if (Array.isArray(profile[field])) next[field] = profile[field];
    }
    next.synonyms = normalizeReadingSynonyms(profile.synonyms, next.word);
    next.synonymDetails = normalizeReadingSynonymDetails(
      profile.synonymDetails,
      next.synonyms,
      next.word
    );
    next.readingMeaning = cleanText(profile.meaning);
    next.readingContextPending = false;
    next.readingContextReviewed = true;
    next.readingContextReviewSource = "reading-context-ai";
    next.readingContextReviewedAt = cleanText(profile.generatedAt) || new Date().toISOString();
  }
  // A semantic-review queue is intentionally different from a missing-field
  // queue: keep the learner's primary gloss, only replace a template-level
  // explanation, and append verified common senses from the profile.
  if (
    needsMeaningCoverageReview(next) &&
    isMeaningCoverageProfileUsable(profile, next.word)
  ) {
    next = applyMeaningCoverageReview(next, profile, {
      source: cleanText(profile.source) || READING_AI_REVIEW_SOURCE,
      reviewedAt: cleanText(profile.generatedAt) || new Date().toISOString()
    });
  }
  if (!contextAware) {
    next.synonymDetails = normalizeReadingSynonymDetails(
      [
        ...(Array.isArray(next.synonymDetails) ? next.synonymDetails : []),
        ...(Array.isArray(profile.synonymDetails) ? profile.synonymDetails : [])
      ],
      next.synonyms,
      next.word
    );
  }
  // Usable AI profiles always include relation arrays (possibly empty). Mark
  // them reviewed so empty-but-checked relations do not keep the card incomplete.
  const aiMarkedRelations = profile?.aiGenerated === true
    || profile?.source === "deepseek"
    || profile?.source === "ai-cache"
    || profile?.aiContentProfile;
  const relationReviewSource = contextAware ? "reading-context-ai" : READING_AI_REVIEW_SOURCE;
  if (Array.isArray(profile.forms) || aiMarkedRelations) {
    next.formsReviewed = true;
    next.formsReviewSource = relationReviewSource;
    if (!Array.isArray(next.forms)) next.forms = [];
  }
  if (Array.isArray(profile.wordFamily) || aiMarkedRelations) {
    next.wordFamilyReviewed = true;
    next.wordFamilyReviewSource = relationReviewSource;
    if (!Array.isArray(next.wordFamily)) next.wordFamily = [];
  }
  if (Array.isArray(profile.synonyms) || aiMarkedRelations) {
    next.synonymsReviewed = true;
    next.synonymsReviewSource = relationReviewSource;
    if (!Array.isArray(next.synonyms)) next.synonyms = [];
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

export function readReadingWords() {
  return readLegacyReadingWordsSnapshot().words;
}

function readLegacyReadingWordsSnapshot() {
  if (typeof window === "undefined") return { words: [], updatedAt: "" };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(READING_WORDS_STORAGE_KEY) || "null");
    const items = Array.isArray(parsed) ? parsed : parsed?.words;
    return {
      words: Array.isArray(items)
        ? items.map((item) => normalizeReadingWord(item)).filter((item) => item.word)
        : [],
      updatedAt: cleanText(parsed?.updatedAt)
    };
  } catch {
    return { words: [], updatedAt: "" };
  }
}

export function readReadingWordsSession() {
  if (typeof window === "undefined") return normalizeReadingWordsSession();
  try {
    return normalizeReadingWordsSession(
      JSON.parse(window.localStorage.getItem(READING_WORDS_SESSION_KEY) || "null")
    );
  } catch {
    return normalizeReadingWordsSession();
  }
}

export function writeReadingWordsSession(session) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(READING_WORDS_SESSION_KEY, JSON.stringify({
      ...normalizeReadingWordsSession(session),
      updatedAt: new Date().toISOString()
    }));
    return true;
  } catch {
    return false;
  }
}

export function compactReadingWordsForPersistence(words, options = {}) {
  return (Array.isArray(words) ? words : [])
    .map((item) => normalizeReadingWord(item, { now: options.now }))
    .filter((item) => item.word);
}

function readingWordRollbackId(word = {}) {
  return cleanText(word.id || word.wordId);
}

function hasUniqueRollbackIds(words) {
  const ids = words.map(readingWordRollbackId);
  return ids.every(Boolean) && new Set(ids).size === ids.length;
}

export function buildReadingWordsRollback(words, previousWords, options = {}) {
  const now = cleanText(options.now) || new Date().toISOString();
  const next = compactReadingWordsForPersistence(words, { now });
  const previous = compactReadingWordsForPersistence(previousWords, { now });

  // Stable IDs are the normal data contract. Keep a full snapshot only for
  // malformed legacy data so rollback can never reconstruct the wrong list.
  if (!hasUniqueRollbackIds(next) || !hasUniqueRollbackIds(previous)) {
    return {
      version: READING_WORDS_BACKUP_VERSION,
      kind: "snapshot",
      createdAt: now,
      words: previous
    };
  }

  const nextById = new Map(next.map((item) => [readingWordRollbackId(item), item]));
  const previousEntries = previous.filter((item) => {
    const nextItem = nextById.get(readingWordRollbackId(item));
    return !nextItem || JSON.stringify(nextItem) !== JSON.stringify(item);
  });

  return {
    version: READING_WORDS_ROLLBACK_VERSION,
    kind: "delta",
    createdAt: now,
    previousOrder: previous.map(readingWordRollbackId),
    previousEntries
  };
}

export function restoreReadingWordsRollback(currentWords, rollback, options = {}) {
  if (Array.isArray(rollback?.words)) {
    return compactReadingWordsForPersistence(rollback.words, options);
  }
  if (
    rollback?.kind !== "delta"
    || !Array.isArray(rollback.previousOrder)
    || !Array.isArray(rollback.previousEntries)
  ) {
    return null;
  }

  const current = compactReadingWordsForPersistence(currentWords, options);
  if (!hasUniqueRollbackIds(current) || !hasUniqueRollbackIds(rollback.previousEntries)) {
    return null;
  }
  const currentById = new Map(current.map((item) => [readingWordRollbackId(item), item]));
  const previousById = new Map(
    rollback.previousEntries.map((item) => [readingWordRollbackId(item), item])
  );
  const restored = rollback.previousOrder.map((id) => previousById.get(id) || currentById.get(id));
  return restored.every(Boolean) ? restored : null;
}

function storageErrorMessage(label, error) {
  const name = cleanText(error?.name);
  const message = cleanText(error?.message);
  return [label, name, message].filter(Boolean).join("：") || label;
}

function isIndexedDbAvailable() {
  return typeof window !== "undefined" && typeof window.indexedDB?.open === "function";
}

function openReadingWordsIndexedDb() {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new Error("当前浏览器未提供 IndexedDB"));
  }
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(
      READING_WORDS_INDEXED_DB_NAME,
      READING_WORDS_INDEXED_DB_VERSION
    );
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(READING_WORDS_INDEXED_DB_STORE)) {
        database.createObjectStore(READING_WORDS_INDEXED_DB_STORE);
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

function createReadingWordsSnapshot(words, updatedAt = new Date().toISOString()) {
  return {
    version: READING_WORDS_BACKUP_VERSION,
    updatedAt,
    words: compactReadingWordsForPersistence(words, { now: updatedAt })
  };
}

function normalizeReadingWordsSnapshot(value) {
  if (!value || !Array.isArray(value.words)) return null;
  return {
    words: compactReadingWordsForPersistence(value.words, { now: value.updatedAt }),
    updatedAt: cleanText(value.updatedAt)
  };
}

async function readReadingWordsIndexedDbState() {
  const database = await openReadingWordsIndexedDb();
  try {
    const transaction = database.transaction(READING_WORDS_INDEXED_DB_STORE, "readonly");
    const store = transaction.objectStore(READING_WORDS_INDEXED_DB_STORE);
    const done = indexedDbTransactionDone(transaction);
    const [snapshot, rollback] = await Promise.all([
      indexedDbRequest(store.get(READING_WORDS_INDEXED_DB_SNAPSHOT_KEY)),
      indexedDbRequest(store.get(READING_WORDS_INDEXED_DB_ROLLBACK_KEY))
    ]);
    await done;
    return { snapshot: normalizeReadingWordsSnapshot(snapshot), rollback: rollback || null };
  } finally {
    database.close();
  }
}

async function writeReadingWordsIndexedDb(words, rollback = NO_ROLLBACK_UPDATE) {
  const snapshot = createReadingWordsSnapshot(words);
  const database = await openReadingWordsIndexedDb();
  try {
    const transaction = database.transaction(READING_WORDS_INDEXED_DB_STORE, "readwrite");
    const store = transaction.objectStore(READING_WORDS_INDEXED_DB_STORE);
    const done = indexedDbTransactionDone(transaction);
    store.put(snapshot, READING_WORDS_INDEXED_DB_SNAPSHOT_KEY);
    if (rollback !== NO_ROLLBACK_UPDATE) {
      store.put(rollback, READING_WORDS_INDEXED_DB_ROLLBACK_KEY);
    }
    await done;
    return snapshot;
  } finally {
    database.close();
  }
}

function writeLegacyReadingWordsDetailed(words, previousWords = null) {
  if (typeof window === "undefined") {
    return { ok: false, error: new Error("当前环境不支持浏览器存储") };
  }
  try {
    if (Array.isArray(previousWords)) {
      window.localStorage.setItem(
        READING_WORDS_ROLLBACK_KEY,
        JSON.stringify(buildReadingWordsRollback(words, previousWords))
      );
    }
    window.localStorage.setItem(
      READING_WORDS_STORAGE_KEY,
      JSON.stringify(createReadingWordsSnapshot(words))
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Loads the large notebook from IndexedDB.  Existing localStorage data is
 * preserved and copied once, so upgrades never discard a learner's notebook.
 */
export async function loadPersistedReadingWords() {
  const legacy = readLegacyReadingWordsSnapshot();
  if (!isIndexedDbAvailable()) {
    return {
      words: legacy.words,
      storage: "localStorage",
      warning: "当前浏览器不支持 IndexedDB，阅读生词本仍使用容量较小的本地存储。"
    };
  }

  try {
    const indexed = await readReadingWordsIndexedDbState();
    if (indexed.snapshot && timestamp(indexed.snapshot.updatedAt) >= timestamp(legacy.updatedAt)) {
      return { words: indexed.snapshot.words, storage: "indexedDB", warning: "" };
    }
    if (legacy.words.length || legacy.updatedAt) {
      await writeReadingWordsIndexedDb(legacy.words);
      return {
        words: legacy.words,
        storage: "indexedDB",
        warning: "已将旧版阅读生词迁移到更大容量的浏览器数据库。"
      };
    }
    return { words: [], storage: "indexedDB", warning: "" };
  } catch (error) {
    return {
      words: legacy.words,
      storage: "localStorage",
      warning: `IndexedDB 读取失败，已回退旧存储：${storageErrorMessage("", error)}`
    };
  }
}

/**
 * Atomically stores the current notebook and, when provided, its reversible
 * predecessor.  localStorage remains a compatibility fallback only.
 */
export async function persistReadingWords(words, previousWords = null) {
  let rollback = NO_ROLLBACK_UPDATE;
  try {
    if (Array.isArray(previousWords)) {
      rollback = buildReadingWordsRollback(words, previousWords);
    }
  } catch (error) {
    return {
      ok: false,
      error: new Error(storageErrorMessage("阅读生词回退备份生成失败", error))
    };
  }
  if (isIndexedDbAvailable()) {
    try {
      await writeReadingWordsIndexedDb(words, rollback);
      return { ok: true, storage: "indexedDB", warning: "" };
    } catch (indexedDbError) {
      const legacy = writeLegacyReadingWordsDetailed(words, previousWords);
      if (legacy.ok) {
        return {
          ok: true,
          storage: "localStorage",
          warning: `IndexedDB 写入失败，暂时改用旧存储：${storageErrorMessage("", indexedDbError)}`
        };
      }
      return {
        ok: false,
        error: new Error(
          `${storageErrorMessage("IndexedDB 写入失败", indexedDbError)}；` +
          `${storageErrorMessage("旧存储写入失败", legacy.error)}`
        )
      };
    }
  }

  const legacy = writeLegacyReadingWordsDetailed(words, previousWords);
  return legacy.ok
    ? {
      ok: true,
      storage: "localStorage",
      warning: "当前浏览器不支持 IndexedDB，阅读生词本仍使用容量较小的本地存储。"
    }
    : { ok: false, error: new Error(storageErrorMessage("旧存储写入失败", legacy.error)) };
}

export async function readPersistedReadingWordsRollback(currentWords = null) {
  if (isIndexedDbAvailable()) {
    try {
      const indexed = await readReadingWordsIndexedDbState();
      const sourceWords = Array.isArray(currentWords)
        ? currentWords
        : indexed.snapshot?.words || [];
      const words = restoreReadingWordsRollback(sourceWords, indexed.rollback);
      if (words) return { ...indexed.rollback, words };
    } catch {
      // The legacy fallback below keeps prior data recoverable when IndexedDB
      // is unavailable in a restricted browser profile.
    }
  }
  return readReadingWordsRollback();
}

export function writeReadingWords(words) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(READING_WORDS_STORAGE_KEY, JSON.stringify({
      version: READING_WORDS_BACKUP_VERSION,
      updatedAt: new Date().toISOString(),
      words: compactReadingWordsForPersistence(words)
    }));
    return true;
  } catch {
    return false;
  }
}

export function writeReadingWordsWithBackup(words, previousWords) {
  if (!writeReadingWordsRollback(words, previousWords)) return false;
  return writeReadingWords(words);
}

export function writeReadingWordsRollback(words, previousWords) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(
      READING_WORDS_ROLLBACK_KEY,
      JSON.stringify(buildReadingWordsRollback(words, previousWords))
    );
    return true;
  } catch {
    return false;
  }
}

export function readReadingWordsRollback() {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(READING_WORDS_ROLLBACK_KEY) || "null");
    const words = restoreReadingWordsRollback(readReadingWords(), parsed);
    return words ? { ...parsed, words } : null;
  } catch {
    return null;
  }
}

export function buildReadingWordsBackup(words) {
  return {
    version: READING_WORDS_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    words: compactReadingWordsForPersistence(words)
  };
}
