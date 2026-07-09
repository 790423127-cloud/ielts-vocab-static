import {
  buildErrorDedupeKey,
  dedupeErrorBankDisplayItems,
  summarizeDedupedErrorBank
} from "./error-bank-dedupe.mjs";
import { parseLegacySpellingWordId, recoverErrorBankRecords } from "./error-bank-recovery.mjs";
import { normalizeSpellingEntry } from "./normalize-spelling-entry.mjs";
import { getWordId } from "./word-id.mjs";

function buildOrphanLexiconEntry(error = {}) {
  const legacyAnswer = parseLegacySpellingWordId(error.wordId);
  const headword = legacyAnswer || String(error.wordId || "").trim();

  return {
    word: headword,
    id: error.wordId,
    wordId: error.wordId,
    meaning: legacyAnswer ? "（词库已更新，词条待匹配）" : "（词条待匹配）",
    orphaned: true
  };
}

export function buildLexiconEntryMap(entries = []) {
  const map = new Map();

  for (const entry of Array.isArray(entries) ? entries : []) {
    const wordId = getWordId(entry);
    if (wordId) map.set(wordId, entry);
  }

  return map;
}

export function formatErrorBankSeverity(severity = "low") {
  if (severity === "high") return "高频错";
  if (severity === "medium") return "多次错";
  return "偶错";
}

export function mergeErrorBankRecords(errorRecords = [], lexiconEntries = [], options = {}) {
  const entryMap = buildLexiconEntryMap(lexiconEntries);
  const { records: recoveredErrors } = recoverErrorBankRecords(errorRecords, lexiconEntries);
  const merged = [];

  for (const error of recoveredErrors) {
    if (!error?.wordId || !error.everWrong) continue;

    const source = entryMap.get(error.wordId) || (error.orphaned ? buildOrphanLexiconEntry(error) : null);
    if (!source) continue;

    const normalized = normalizeSpellingEntry(source);
    const displayWord = normalized.expectedAnswer || normalized.displayText || source.word || "";
    const dedupeKey = buildErrorDedupeKey({ wordId: error.wordId, displayWord }, source);

    merged.push({
      ...source,
      ...normalized,
      errorBank: {
        everWrong: true,
        dedupeKey,
        displayWord,
        sourceWordIds: Array.isArray(error.sourceWordIds) && error.sourceWordIds.length
          ? error.sourceWordIds
          : [error.wordId].filter(Boolean),
        totalWrongCount: Number(error.totalWrongCount || 0),
        wrongCount: Number(error.totalWrongCount || error.wrongCount || 0),
        totalCorrectCount: Number(error.totalCorrectCount || 0),
        firstWrongAt: Number(error.firstWrongAt || error.latestWrongAt || 0),
        latestWrongAt: Number(error.latestWrongAt || 0),
        lastWrongAt: Number(error.latestWrongAt || 0),
        lastWrongAnswer: String(error.lastWrongAnswer || ""),
        lastErrorSource: String(error.lastErrorSource || error.wordId || ""),
        active: true,
        severity: error.severity || "low"
      }
    });
  }

  return dedupeErrorBankDisplayItems(merged);
}

export function errorBankEntriesToSpellingCandidates(items = []) {
  return items.map((item) => {
    const { errorBank, ...entry } = item;
    return entry;
  });
}

export function shouldExcludeFamiliarSpellingEntries(practiceSource, includeFamiliar = false) {
  return !["error_bank", "personal_wrong_book", "srs_review"].includes(practiceSource) && !includeFamiliar;
}

export function summarizeErrorBankItems(items = []) {
  const summary = summarizeDedupedErrorBank(items);

  return {
    total: summary.distinct,
    distinct: summary.distinct,
    totalWrongAttempts: summary.totalWrongAttempts,
    high: summary.high,
    phrase: summary.phrase,
    word: summary.word
  };
}
