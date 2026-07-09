import {
  getSpellingExpectedAnswer,
  getSpellingMeaning,
  getSpellingPhonetic
} from "./normalize-spelling-entry.mjs";

export const SPELLING_EXPORT_SCHEMA_VERSION = 1;

export function compactSpellingExportEntry(item = {}) {
  const word = getSpellingExpectedAnswer(item);

  return {
    word,
    meaning: getSpellingMeaning(item),
    phonetic: getSpellingPhonetic(item),
    pos: String(item?.pos || "").trim(),
    example: String(item?.example || "").trim(),
    exampleCn: String(item?.exampleCn || "").trim(),
    difficulty: String(item?.difficulty || "").trim(),
    category: String(item?.category || "").trim()
  };
}

export function buildEnglishTxtLines(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .map((item) => getSpellingExpectedAnswer(item))
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

export function buildCurrentBatchExportPayload(options = {}) {
  const entries = Array.isArray(options.entries) ? options.entries : [];
  const scope = String(options.scope || "word").trim() || "word";

  return {
    schemaVersion: SPELLING_EXPORT_SCHEMA_VERSION,
    exportType: "spelling-current-batch",
    exportedAt: options.exportedAt || new Date().toISOString(),
    scope,
    practiceSource: String(options.practiceSource || "category").trim() || "category",
    rangeLabel: String(options.rangeLabel || "").trim(),
    count: entries.length,
    entries: entries.map(compactSpellingExportEntry)
  };
}

export function buildCurrentCategoryExportPayload(options = {}) {
  const entries = Array.isArray(options.entries) ? options.entries : [];
  const scope = String(options.scope || "word").trim() || "word";

  return {
    schemaVersion: SPELLING_EXPORT_SCHEMA_VERSION,
    exportType: "spelling-current-category",
    exportedAt: options.exportedAt || new Date().toISOString(),
    scope,
    categoryType: String(options.categoryType || "all").trim() || "all",
    categoryValue: String(options.categoryValue || "").trim(),
    rangeLabel: String(options.rangeLabel || "").trim(),
    count: entries.length,
    entries: entries.map(compactSpellingExportEntry)
  };
}

export function buildCombinedLexiconExportPayload(lexicon = {}, options = {}) {
  const headwords = Array.isArray(lexicon.headwords) ? lexicon.headwords : [];
  const phrases = Array.isArray(lexicon.phrases) ? lexicon.phrases : [];

  return {
    schemaVersion: SPELLING_EXPORT_SCHEMA_VERSION,
    exportType: "spelling-lexicon-combined",
    exportedAt: options.exportedAt || new Date().toISOString(),
    lexiconVersion: String(lexicon.lexiconVersion || "").trim(),
    lexiconHash: String(lexicon.lexiconHash || "").trim(),
    counts: {
      words: headwords.length,
      phrases: phrases.length
    },
    words: headwords.map(compactSpellingExportEntry),
    phrases: phrases.map(compactSpellingExportEntry)
  };
}

export function buildScopeLexiconExportPayload(lexicon = {}, scope = "word", options = {}) {
  const isPhrase = scope === "phrase";
  const entries = isPhrase
    ? (Array.isArray(lexicon.phrases) ? lexicon.phrases : [])
    : (Array.isArray(lexicon.headwords) ? lexicon.headwords : []);

  return {
    schemaVersion: SPELLING_EXPORT_SCHEMA_VERSION,
    exportType: isPhrase ? "spelling-lexicon-phrases" : "spelling-lexicon-words",
    exportedAt: options.exportedAt || new Date().toISOString(),
    scope,
    lexiconVersion: String(lexicon.lexiconVersion || "").trim(),
    lexiconHash: String(lexicon.lexiconHash || "").trim(),
    count: entries.length,
    entries: entries.map(compactSpellingExportEntry)
  };
}

function formatExportDateStamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "export";
  return date.toISOString().slice(0, 10);
}

export function buildCombinedExportFilename(counts = {}, exportedAt = new Date()) {
  const words = Math.max(0, Number(counts.words || 0));
  const phrases = Math.max(0, Number(counts.phrases || 0));
  return `spelling-words-phrases-${words}-${phrases}-${formatExportDateStamp(exportedAt)}.json`;
}

export function buildCurrentBatchExportFilename(scope = "word", count = 0, format = "json", exportedAt = new Date()) {
  const safeScope = scope === "phrase" ? "phrases" : "words";
  const ext = format === "txt" ? "txt" : "json";
  return `spelling-batch-${safeScope}-${Math.max(0, Number(count) || 0)}-${formatExportDateStamp(exportedAt)}.${ext}`;
}

export function buildCurrentCategoryExportFilename(scope = "word", count = 0, format = "json", exportedAt = new Date()) {
  const safeScope = scope === "phrase" ? "phrases" : "words";
  const ext = format === "txt" ? "txt" : "json";
  return `spelling-category-${safeScope}-${Math.max(0, Number(count) || 0)}-${formatExportDateStamp(exportedAt)}.${ext}`;
}

export function buildScopeLexiconExportFilename(scope = "word", count = 0, exportedAt = new Date()) {
  const safeScope = scope === "phrase" ? "phrases" : "words";
  return `spelling-${safeScope}-${Math.max(0, Number(count) || 0)}-${formatExportDateStamp(exportedAt)}.json`;
}

export function triggerSpellingExportDownload(options = {}) {
  if (typeof document === "undefined") return false;

  const content = String(options.content ?? "");
  const filename = String(options.filename || "spelling-export.json").trim() || "spelling-export.json";
  const mimeType = String(options.mimeType || "application/octet-stream");

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}
