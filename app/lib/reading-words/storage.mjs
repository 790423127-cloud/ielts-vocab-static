export const READING_WORDS_STORAGE_KEY = "ielts-personal-reading-words-v1";
export const READING_WORDS_ROLLBACK_KEY = "ielts-personal-reading-words-rollback-v1";
export const READING_WORDS_BACKUP_VERSION = 1;
const READING_AI_REVIEW_SOURCE = "reading-ai";

const CORE_FIELDS = [
  "pos",
  "meaning",
  "definition",
  "example",
  "exampleCn"
];

const REVIEWED_RELATION_FIELDS = [
  ["forms", "formsReviewed"],
  ["wordFamily", "wordFamilyReviewed"],
  ["synonyms", "synonymsReviewed"]
];

const FIELD_ALIASES = new Map([
  ["word", "word"],
  ["headword", "word"],
  ["单词", "word"],
  ["词", "word"],
  ["meaning", "meaning"],
  ["释义", "meaning"],
  ["中文释义", "meaning"],
  ["definition", "definition"],
  ["英文释义", "definition"],
  ["英文定义", "definition"],
  ["pos", "pos"],
  ["part of speech", "pos"],
  ["词性", "pos"],
  ["phonetic", "phonetic"],
  ["音标", "phonetic"],
  ["example", "example"],
  ["英文例句", "example"],
  ["例句", "example"],
  ["examplecn", "exampleCn"],
  ["example cn", "exampleCn"],
  ["例句翻译", "exampleCn"],
  ["中文例句", "exampleCn"],
  ["synonyms", "synonyms"],
  ["synonym", "synonyms"],
  ["同义替换", "synonyms"],
  ["同义词", "synonyms"]
]);

const IMPORT_COLUMN_ORDER = [
  "word",
  "meaning",
  "definition",
  "pos",
  "phonetic",
  "example",
  "exampleCn",
  "synonyms"
];

function cleanText(value) {
  return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
}

export function normalizeReadingWordKey(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"');
}

export function normalizeReadingSynonyms(value, headword = "") {
  const values = Array.isArray(value)
    ? value
    : String(value || "").split(/[,，;；|\n]+/);
  const headwordKey = normalizeReadingWordKey(headword);
  const seen = new Set();

  return values
    .map((item) => cleanText(typeof item === "string" ? item : item?.word || item?.replacement))
    .filter((item) => {
      const key = normalizeReadingWordKey(item);
      if (!key || key === headwordKey || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function createStableId(idFactory) {
  if (typeof idFactory === "function") return cleanText(idFactory());
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `reading-${globalThis.crypto.randomUUID()}`;
  }
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
    example: cleanText(input.example),
    exampleCn: cleanText(input.exampleCn),
    forms: Array.isArray(input.forms) ? input.forms : [],
    wordFamily: Array.isArray(input.wordFamily) ? input.wordFamily : [],
    synonyms: normalizeReadingSynonyms(
      input.synonyms || input.validatedSynonyms || input.recommendedSynonyms,
      word
    ),
    formsReviewed: input.formsReviewed === true && cleanText(input.formsReviewSource) === READING_AI_REVIEW_SOURCE,
    formsReviewSource: cleanText(input.formsReviewSource) === READING_AI_REVIEW_SOURCE ? READING_AI_REVIEW_SOURCE : "",
    wordFamilyReviewed: input.wordFamilyReviewed === true && cleanText(input.wordFamilyReviewSource) === READING_AI_REVIEW_SOURCE,
    wordFamilyReviewSource: cleanText(input.wordFamilyReviewSource) === READING_AI_REVIEW_SOURCE ? READING_AI_REVIEW_SOURCE : "",
    synonymsReviewed: input.synonymsReviewed === true && cleanText(input.synonymsReviewSource) === READING_AI_REVIEW_SOURCE,
    synonymsReviewSource: cleanText(input.synonymsReviewSource) === READING_AI_REVIEW_SOURCE ? READING_AI_REVIEW_SOURCE : "",
    mainWordId: cleanText(input.mainWordId),
    importCount,
    highFrequency: input.highFrequency === true || importCount >= 2,
    firstImportedAt: cleanText(input.firstImportedAt) || cleanText(input.createdAt) || now,
    lastImportedAt: cleanText(input.lastImportedAt) || cleanText(input.updatedAt) || now,
    status: ["熟悉", "模糊", "不熟"].includes(input.status) ? input.status : "",
    favorite: Boolean(input.favorite),
    source: "personal-reading",
    createdAt: cleanText(input.createdAt) || now,
    updatedAt: cleanText(input.updatedAt) || now
  };
}

export function getReadingWordMissingFields(word) {
  const missing = CORE_FIELDS.filter((field) => !cleanText(word?.[field]));

  for (const [field, reviewedField] of REVIEWED_RELATION_FIELDS) {
    const hasData = Array.isArray(word?.[field]) && word[field].length > 0;
    if (!hasData && word?.[reviewedField] !== true) missing.push(field);
  }

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
  const firstRow = rows[0];
  const headerFields = firstRow.map((value) => FIELD_ALIASES.get(normalizeHeader(value)) || "");
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

export function parseReadingWordsTable(value, options = {}) {
  const text = String(value || "").trim();
  if (!text) return [];

  let rawItems;
  if (text.startsWith("[") || text.startsWith("{")) {
    const parsed = JSON.parse(text);
    rawItems = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.words)
        ? parsed.words
        : [];
  } else {
    const firstLine = text.split(/\r?\n/, 1)[0] || "";
    const delimiter = firstLine.includes("\t") ? "\t" : ",";
    if (!firstLine.includes(delimiter)) {
      rawItems = text.split(/\r?\n/).map((word) => ({ word }));
    } else {
      rawItems = rowsToObjects(parseDelimitedRows(text, delimiter));
    }
  }

  return rawItems
    .map((item) => normalizeReadingWord(item, options))
    .filter((item) => item.word);
}

export function mergeReadingWordImports(currentWords, incomingWords, { idFactory, now: nowOption } = {}) {
  const now = cleanText(nowOption) || new Date().toISOString();
  const words = (Array.isArray(currentWords) ? currentWords : [])
    .map((item) => normalizeReadingWord(item, { idFactory, now }));
  const indexByWordKey = new Map(
    words.map((item, index) => [normalizeReadingWordKey(item.word), index])
  );
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
      words[existingIndex] = {
        ...existing,
        importCount: nextCount,
        highFrequency: nextCount >= 2,
        lastImportedAt: now,
        updatedAt: now
      };
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

export function mergeReadingWordAiProfile(word, profile = {}) {
  const next = { ...word };
  const textFields = [
    "phonetic",
    "pos",
    "meaning",
    "meaningDetailZh",
    "definition",
    "example",
    "exampleCn"
  ];
  const arrayFields = ["otherMeanings", "forms", "wordFamily"];

  for (const field of textFields) {
    if (!cleanText(next[field]) && cleanText(profile[field])) {
      next[field] = cleanText(profile[field]);
    }
  }
  for (const field of arrayFields) {
    if ((!Array.isArray(next[field]) || !next[field].length) && Array.isArray(profile[field])) {
      next[field] = profile[field];
    }
  }
  if (!Array.isArray(next.synonyms) || !next.synonyms.length) {
    next.synonyms = normalizeReadingSynonyms(profile.synonyms, next.word);
  }
  if (Array.isArray(profile.forms)) {
    next.formsReviewed = true;
    next.formsReviewSource = READING_AI_REVIEW_SOURCE;
  }
  if (Array.isArray(profile.wordFamily)) {
    next.wordFamilyReviewed = true;
    next.wordFamilyReviewSource = READING_AI_REVIEW_SOURCE;
  }
  if (Array.isArray(profile.synonyms)) {
    next.synonymsReviewed = true;
    next.synonymsReviewSource = READING_AI_REVIEW_SOURCE;
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

export function readReadingWords() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(READING_WORDS_STORAGE_KEY) || "null");
    const items = Array.isArray(parsed) ? parsed : parsed?.words;
    return Array.isArray(items)
      ? items.map((item) => normalizeReadingWord(item)).filter((item) => item.word)
      : [];
  } catch {
    return [];
  }
}

export function writeReadingWords(words) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(READING_WORDS_STORAGE_KEY, JSON.stringify({
      version: READING_WORDS_BACKUP_VERSION,
      updatedAt: new Date().toISOString(),
      words: Array.isArray(words) ? words : []
    }));
    return true;
  } catch {
    return false;
  }
}

export function writeReadingWordsWithBackup(words, previousWords) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(READING_WORDS_ROLLBACK_KEY, JSON.stringify({
      version: READING_WORDS_BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      words: Array.isArray(previousWords) ? previousWords : []
    }));
    return writeReadingWords(words);
  } catch {
    return false;
  }
}

export function readReadingWordsRollback() {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(READING_WORDS_ROLLBACK_KEY) || "null");
    if (!Array.isArray(parsed?.words)) return null;
    return {
      ...parsed,
      words: parsed.words.map((item) => normalizeReadingWord(item)).filter((item) => item.word)
    };
  } catch {
    return null;
  }
}

export function buildReadingWordsBackup(words) {
  return {
    version: READING_WORDS_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    words: Array.isArray(words) ? words : []
  };
}
