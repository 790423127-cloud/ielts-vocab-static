import { parseLegacySpellingWordId } from "./error-bank-recovery.mjs";
import { getSpellingExpectedAnswer } from "./normalize-spelling-entry.mjs";
import { getWordId } from "./word-id.mjs";

const SEVERITY_PRIORITY = { low: 1, medium: 2, high: 3 };

export function normalizeSpellingKey(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[''\u2018\u2019\u201A\u2032`]/g, "'")
    .replace(/\s+/g, " ");
}

function severityForWrongCount(count) {
  if (count >= 4) return "high";
  if (count >= 2) return "medium";
  return "low";
}

export function resolveErrorDisplayWord(error = {}, lexiconEntry = null) {
  if (lexiconEntry) {
    return getSpellingExpectedAnswer(lexiconEntry) || String(lexiconEntry.word || "").trim();
  }

  const legacy = parseLegacySpellingWordId(error.wordId);
  if (legacy) return legacy;

  return String(
    error.displayWord
    || error.expectedAnswer
    || error.word
    || error.wordId
    || ""
  ).trim();
}

export function buildErrorDedupeKey(error = {}, lexiconEntry = null) {
  const displayWord = resolveErrorDisplayWord(error, lexiconEntry);
  return normalizeSpellingKey(displayWord);
}

function uniqueWordIds(...values) {
  const ids = new Set();
  for (const value of values) {
    for (const item of Array.isArray(value) ? value : [value]) {
      const wordId = String(item || "").trim();
      if (wordId) ids.add(wordId);
    }
  }
  return [...ids];
}

function pickHigherSeverity(left = "low", right = "low") {
  return (SEVERITY_PRIORITY[right] || 1) > (SEVERITY_PRIORITY[left] || 1) ? right : left;
}

function pickReviewPriority(record = {}) {
  const repairState = String(record?.today?.repairState || "");
  const repairLocked = Boolean(record?.today?.repairLocked);
  const srsStage = Number(record?.srs?.stage || 0);
  const nextReviewAt = Number(record?.srs?.nextReviewAt || 0);
  const latestWrongAt = Number(record?.errorBank?.latestWrongAt || record?.latestWrongAt || 0);
  const inRepair = repairState === "in_repair" ? 1 : 0;

  return {
    inRepair,
    repairLocked: repairLocked ? 1 : 0,
    srsStage,
    nextReviewAt,
    latestWrongAt
  };
}

function compareReviewPriority(left = {}, right = {}) {
  const leftScore = pickReviewPriority(left);
  const rightScore = pickReviewPriority(right);

  return (
    rightScore.inRepair - leftScore.inRepair
    || rightScore.repairLocked - leftScore.repairLocked
    || rightScore.srsStage - leftScore.srsStage
    || rightScore.nextReviewAt - leftScore.nextReviewAt
    || rightScore.latestWrongAt - leftScore.latestWrongAt
  );
}

export function pickCanonicalErrorRecord(records = [], options = {}) {
  const list = (Array.isArray(records) ? records : []).filter((record) => record?.wordId);
  if (!list.length) return null;

  const preferLexicon = options.preferLexicon !== false;
  const sorted = [...list].sort((left, right) => {
    const leftLexicon = preferLexicon && !left.orphaned ? 1 : 0;
    const rightLexicon = preferLexicon && !right.orphaned ? 1 : 0;
    return (
      rightLexicon - leftLexicon
      || compareReviewPriority(left, right)
      || Number(right?.errorBank?.latestWrongAt || right?.latestWrongAt || 0)
        - Number(left?.errorBank?.latestWrongAt || left?.latestWrongAt || 0)
    );
  });

  return sorted[0];
}

export function mergeDedupedErrorStats(left = {}, right = {}, options = {}) {
  const leftIds = uniqueWordIds(left.sourceWordIds, left.wordId);
  const rightIds = uniqueWordIds(right.sourceWordIds, right.wordId);
  const mergedIds = uniqueWordIds(leftIds, rightIds);

  const leftWrong = Number(left.totalWrongCount || left.wrongCount || 0);
  const rightWrong = Number(right.totalWrongCount || right.wrongCount || 0);
  const leftCorrect = Number(left.totalCorrectCount || 0);
  const rightCorrect = Number(right.totalCorrectCount || 0);

  const rightIsNewSource = right.wordId && !leftIds.includes(right.wordId);
  const totalWrongCount = rightIsNewSource
    ? leftWrong + rightWrong
    : Math.max(leftWrong, rightWrong);
  const totalCorrectCount = rightIsNewSource
    ? leftCorrect + rightCorrect
    : Math.max(leftCorrect, rightCorrect);

  const leftLatest = Number(left.latestWrongAt || left.lastWrongAt || 0);
  const rightLatest = Number(right.latestWrongAt || right.lastWrongAt || 0);
  const latestWrongAt = Math.max(leftLatest, rightLatest);
  const firstWrongAt = Math.min(
    Number(left.firstWrongAt || leftLatest || Number.POSITIVE_INFINITY),
    Number(right.firstWrongAt || rightLatest || Number.POSITIVE_INFINITY)
  );

  const lastWrongAnswer = leftLatest >= rightLatest
    ? String(left.lastWrongAnswer || "")
    : String(right.lastWrongAnswer || "");

  const severity = pickHigherSeverity(
    left.severity || severityForWrongCount(leftWrong),
    right.severity || severityForWrongCount(rightWrong)
  );

  const canonical = pickCanonicalErrorRecord(
    [left.fullRecord, right.fullRecord].filter(Boolean),
    options
  ) || (left.fullRecord || right.fullRecord || null);

  return {
    wordId: canonical?.wordId || left.wordId || right.wordId,
    displayWord: left.displayWord || right.displayWord || "",
    dedupeKey: left.dedupeKey || right.dedupeKey || "",
    sourceWordIds: mergedIds,
    everWrong: true,
    totalWrongCount,
    wrongCount: totalWrongCount,
    totalCorrectCount,
    firstWrongAt: Number.isFinite(firstWrongAt) ? firstWrongAt : 0,
    latestWrongAt,
    lastWrongAt: latestWrongAt,
    lastWrongAnswer,
    active: left.active !== false || right.active !== false,
    severity: severity || severityForWrongCount(totalWrongCount),
    lastErrorSource: rightLatest >= leftLatest
      ? String(right.lastErrorSource || right.wordId || "")
      : String(left.lastErrorSource || left.wordId || ""),
    canonicalRecord: canonical
  };
}

function enrichErrorForDedupe(error = {}, lexiconEntry = null) {
  const displayWord = resolveErrorDisplayWord(error, lexiconEntry);
  const dedupeKey = normalizeSpellingKey(displayWord);
  const latestWrongAt = Number(error.latestWrongAt || error.lastWrongAt || 0);

  return {
    ...error,
    displayWord,
    dedupeKey,
    sourceWordIds: uniqueWordIds(error.sourceWordIds, error.wordId),
    wrongCount: Number(error.totalWrongCount || error.wrongCount || 0),
    firstWrongAt: Number(error.firstWrongAt || latestWrongAt || 0),
    lastWrongAt: latestWrongAt,
    lastErrorSource: String(error.lastErrorSource || error.wordId || "")
  };
}

export function dedupeErrorBankRecordsBySpellingKey(errorRecords = [], lexiconEntries = [], options = {}) {
  const entryById = new Map();
  const entryByKey = new Map();

  for (const entry of Array.isArray(lexiconEntries) ? lexiconEntries : []) {
    const wordId = getWordId(entry);
    if (wordId) entryById.set(wordId, entry);
    const key = normalizeSpellingKey(getSpellingExpectedAnswer(entry));
    if (key && !entryByKey.has(key)) entryByKey.set(key, entry);
  }

  const grouped = new Map();

  for (const rawError of Array.isArray(errorRecords) ? errorRecords : []) {
    if (!rawError?.wordId || !rawError.everWrong) continue;

    const lexiconEntry = entryById.get(rawError.wordId) || entryByKey.get(buildErrorDedupeKey(rawError));
    const enriched = enrichErrorForDedupe(rawError, lexiconEntry);
    if (!enriched.dedupeKey) continue;

    const existing = grouped.get(enriched.dedupeKey);
    if (!existing) {
      grouped.set(enriched.dedupeKey, {
        ...enriched,
        fullRecord: options.progressById?.get?.(enriched.wordId) || null,
        orphaned: rawError.orphaned === true && !lexiconEntry
      });
      continue;
    }

    grouped.set(
      enriched.dedupeKey,
      mergeDedupedErrorStats(
        existing,
        {
          ...enriched,
          fullRecord: options.progressById?.get?.(enriched.wordId) || null
        },
        options
      )
    );
  }

  return {
    records: [...grouped.values()],
    stats: {
      input: Array.isArray(errorRecords) ? errorRecords.length : 0,
      output: grouped.size,
      merged: Math.max(0, (Array.isArray(errorRecords) ? errorRecords.length : 0) - grouped.size)
    }
  };
}

export function dedupeErrorBankDisplayItems(items = []) {
  const grouped = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const displayWord = getSpellingExpectedAnswer(item) || String(item.word || "").trim();
    const dedupeKey = normalizeSpellingKey(displayWord);
    if (!dedupeKey) continue;

    const existing = grouped.get(dedupeKey);
    const errorBank = item.errorBank || {};
    const next = {
      ...item,
      displayWord,
      dedupeKey,
      errorBank: {
        ...errorBank,
        dedupeKey,
        displayWord,
        sourceWordIds: uniqueWordIds(errorBank.sourceWordIds, item.wordId),
        firstWrongAt: Number(errorBank.firstWrongAt || errorBank.latestWrongAt || 0)
      }
    };

    if (!existing) {
      grouped.set(dedupeKey, next);
      continue;
    }

    const mergedStats = mergeDedupedErrorStats(
      {
        wordId: existing.wordId,
        displayWord: existing.displayWord,
        dedupeKey: existing.dedupeKey,
        sourceWordIds: existing.errorBank?.sourceWordIds,
        totalWrongCount: existing.errorBank?.totalWrongCount,
        totalCorrectCount: existing.errorBank?.totalCorrectCount,
        firstWrongAt: existing.errorBank?.firstWrongAt,
        latestWrongAt: existing.errorBank?.latestWrongAt,
        lastWrongAnswer: existing.errorBank?.lastWrongAnswer,
        severity: existing.errorBank?.severity,
        active: existing.errorBank?.active,
        lastErrorSource: existing.errorBank?.lastErrorSource,
        fullRecord: existing
      },
      {
        wordId: next.wordId,
        displayWord: next.displayWord,
        dedupeKey: next.dedupeKey,
        sourceWordIds: next.errorBank?.sourceWordIds,
        totalWrongCount: next.errorBank?.totalWrongCount,
        totalCorrectCount: next.errorBank?.totalCorrectCount,
        firstWrongAt: next.errorBank?.firstWrongAt,
        latestWrongAt: next.errorBank?.latestWrongAt,
        lastWrongAnswer: next.errorBank?.lastWrongAnswer,
        severity: next.errorBank?.severity,
        active: next.errorBank?.active,
        lastErrorSource: next.errorBank?.lastErrorSource,
        fullRecord: next
      }
    );

    const canonical = pickCanonicalErrorRecord([existing, next]) || existing;
    grouped.set(dedupeKey, {
      ...canonical,
      displayWord: mergedStats.displayWord || canonical.displayWord || displayWord,
      dedupeKey,
      errorBank: {
        ...(canonical.errorBank || {}),
        ...mergedStats
      }
    });
  }

  return [...grouped.values()].sort(
    (left, right) => Number(right.errorBank?.latestWrongAt || 0) - Number(left.errorBank?.latestWrongAt || 0)
  );
}

export function dedupeReviewQueueWordIds(wordIds = [], records = {}, lexiconEntries = []) {
  const entryById = new Map();
  for (const entry of Array.isArray(lexiconEntries) ? lexiconEntries : []) {
    const wordId = getWordId(entry);
    if (wordId) entryById.set(wordId, entry);
  }

  const seenKeys = new Set();
  const deduped = [];

  for (const wordId of Array.isArray(wordIds) ? wordIds : []) {
    const record = records[wordId] || {};
    const lexiconEntry = entryById.get(wordId);
    const dedupeKey = buildErrorDedupeKey({ wordId, ...record.errorBank }, lexiconEntry);
    const key = dedupeKey || wordId;

    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    deduped.push(wordId);
  }

  return deduped;
}

export function summarizeDedupedErrorBank(items = []) {
  const list = Array.isArray(items) ? items : [];
  const totalWrongAttempts = list.reduce(
    (sum, item) => sum + Number(item?.errorBank?.totalWrongCount || item?.errorBank?.wrongCount || 0),
    0
  );

  return {
    distinct: list.length,
    totalWrongAttempts,
    high: list.filter((item) => item.errorBank?.severity === "high").length,
    phrase: list.filter((item) => item.entryType === "phrase" || item.isPhrase).length,
    word: list.filter((item) => item.entryType !== "phrase" && !item.isPhrase).length
  };
}