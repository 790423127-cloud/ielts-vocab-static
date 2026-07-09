import {
  buildErrorDedupeKey,
  dedupeErrorBankRecordsBySpellingKey,
  mergeDedupedErrorStats,
  pickCanonicalErrorRecord,
  resolveErrorDisplayWord
} from "./error-bank-dedupe.mjs";
import { getSpellingExpectedAnswer } from "./normalize-spelling-entry.mjs";
import { createSpellingRecord } from "./state-machine.mjs";
import { normalizeSpellingAnswer, getWordId } from "./word-id.mjs";

const LEGACY_SPELLING_STORE = "ielts_static_spelling_v1";
const LEGACY_IMPORT_FLAG = "ielts_spelling_legacy_error_import_v3_restore";
const RECOVERY_VERSION = "v6-spelling-key-dedupe-prune";
const RECOVERY_VERSION_KEY = "ielts_spelling_error_recovery_version";

const SEVERITY_PRIORITY = { low: 1, medium: 2, high: 3 };

function severityForWrongCount(count) {
  if (count >= 4) return "high";
  if (count >= 2) return "medium";
  return "low";
}

export function parseLegacySpellingWordId(wordId = "") {
  const raw = String(wordId || "").trim();
  const match = raw.match(/^(?:word|phrase):(.+)$/i);
  return match ? normalizeSpellingAnswer(match[1]) : "";
}

function collectLexiconAnswers(entry = {}) {
  const answers = new Set();
  const primary = normalizeSpellingAnswer(
    entry.expectedAnswer || entry.answer || entry.word || entry.text || entry.phrase || ""
  );
  if (primary) answers.add(primary);

  for (const value of entry.acceptedAnswers || []) {
    const normalized = normalizeSpellingAnswer(value);
    if (normalized) answers.add(normalized);
  }

  return [...answers];
}

function isRestoredTruncationEntry(entry = {}) {
  return Boolean(
    entry.fixedFrom ||
    entry.fixedCanonical ||
    entry.sourceType === "truncation-canonical-fix"
  );
}

export function buildErrorBankLexiconIndexes(entries = []) {
  const byWordId = new Map();
  const byAnswer = new Map();
  const byReplacedFrom = new Map();
  const byTruncationAlias = new Map();
  const restoredByCanonical = new Map();

  for (const entry of Array.isArray(entries) ? entries : []) {
    const wordId = getWordId(entry);
    if (!wordId) continue;

    byWordId.set(wordId, entry);

    for (const answer of collectLexiconAnswers(entry)) {
      if (!byAnswer.has(answer)) byAnswer.set(answer, entry);
    }

    const replacedFrom = normalizeSpellingAnswer(entry.replacedFrom || "");
    if (replacedFrom) byReplacedFrom.set(replacedFrom, entry);

    const fixedFrom = normalizeSpellingAnswer(entry.fixedFrom || "");
    const fixedCanonical = normalizeSpellingAnswer(entry.fixedCanonical || "");
    const displacedFrom = normalizeSpellingAnswer(entry.displacedFrom || "");
    const displacedTo = normalizeSpellingAnswer(entry.displacedTo || "");

    if (isRestoredTruncationEntry(entry)) {
      const canonical = fixedCanonical || normalizeSpellingAnswer(entry.word || "");
      if (canonical && !restoredByCanonical.has(canonical)) {
        restoredByCanonical.set(canonical, entry);
      }

      for (const alias of [fixedFrom, fixedCanonical, ...collectLexiconAnswers(entry)]) {
        if (alias) byTruncationAlias.set(alias, entry);
      }
      byTruncationAlias.set(wordId, entry);
    }

    if (displacedFrom) {
      const restored = restoredByCanonical.get(displacedFrom) || byAnswer.get(displacedFrom);
      if (restored) {
        byTruncationAlias.set(wordId, restored);
        byTruncationAlias.set(displacedFrom, restored);
        if (displacedTo) byTruncationAlias.set(displacedTo, restored);
      }
    }
  }

  for (const entry of entries) {
    const fixedFrom = normalizeSpellingAnswer(entry.fixedFrom || "");
    const canonical = normalizeSpellingAnswer(entry.fixedCanonical || entry.word || "");
    if (!fixedFrom || !canonical) continue;
    const restored = restoredByCanonical.get(canonical);
    if (restored) byTruncationAlias.set(fixedFrom, restored);
  }

  return {
    byWordId,
    byAnswer,
    byReplacedFrom,
    byTruncationAlias,
    restoredByCanonical
  };
}

function findRestoredEntry(alias = "", indexes = {}) {
  const key = normalizeSpellingAnswer(alias);
  if (!key) return null;

  return (
    indexes.byTruncationAlias?.get(key) ||
    indexes.restoredByCanonical?.get(key) ||
    indexes.byAnswer.get(key) ||
    null
  );
}

function pickCanonicalEntry(entry = {}, indexes = {}) {
  const canonical = normalizeSpellingAnswer(entry.replacedCanonical || entry.fixedCanonical || "");
  if (!canonical) return null;
  return findRestoredEntry(canonical, indexes) || indexes.byAnswer.get(canonical) || null;
}

function targetFromEntry(entry = {}, indexes = {}, fromWordId = "") {
  const wordId = getWordId(entry);
  return {
    wordId,
    entry,
    recovered: fromWordId !== wordId,
    reason: "direct",
    fromWordId: fromWordId || wordId
  };
}

export function resolveErrorBankTarget(error = {}, indexes = {}) {
  if (!error?.wordId) return null;

  const direct = indexes.byWordId.get(error.wordId);
  if (direct) {
    if (isRestoredTruncationEntry(direct)) {
      return targetFromEntry(direct, indexes, error.wordId);
    }

    if (direct.displacedFrom) {
      const restored = findRestoredEntry(direct.displacedFrom, indexes);
      if (restored) {
        return {
          wordId: getWordId(restored),
          entry: restored,
          recovered: true,
          reason: "displaced-slot",
          fromWordId: error.wordId
        };
      }
    }

    const canonicalEntry = pickCanonicalEntry(direct, indexes);
    if (canonicalEntry && getWordId(canonicalEntry) !== error.wordId) {
      return {
        wordId: getWordId(canonicalEntry),
        entry: canonicalEntry,
        recovered: true,
        reason: "replaced-slot",
        fromWordId: error.wordId
      };
    }

    return targetFromEntry(direct, indexes, error.wordId);
  }

  const aliasCandidates = [
    parseLegacySpellingWordId(error.wordId),
    error.wordId
  ].filter(Boolean);

  for (const alias of aliasCandidates) {
    const restored = findRestoredEntry(alias, indexes);
    if (restored) {
      return {
        wordId: getWordId(restored),
        entry: restored,
        recovered: true,
        reason: alias === parseLegacySpellingWordId(error.wordId) ? "legacy-word-id" : "truncation-alias",
        fromWordId: error.wordId
      };
    }
  }

  const legacyAnswer = parseLegacySpellingWordId(error.wordId);
  if (legacyAnswer) {
    const replacement = indexes.byReplacedFrom.get(legacyAnswer);
    const canonicalEntry = replacement ? pickCanonicalEntry(replacement, indexes) : null;
    if (canonicalEntry) {
      return {
        wordId: getWordId(canonicalEntry),
        entry: canonicalEntry,
        recovered: true,
        reason: "replaced-from",
        fromWordId: error.wordId
      };
    }
  }

  return null;
}

function mergeRecoveredErrorRecords(left = {}, right = {}, wordId = "") {
  const merged = mergeDedupedErrorStats(
    { ...left, wordId: left.wordId || right.wordId || wordId },
    { ...right, wordId: right.wordId || left.wordId || wordId },
    { preferLexicon: false }
  );

  return {
    ...left,
    ...right,
    ...merged,
    everWrong: true,
    active: true,
    recovered: Boolean(left.recovered || right.recovered)
  };
}

function dedupeRawErrorRecords(errorRecords = []) {
  const grouped = new Map();

  for (const error of Array.isArray(errorRecords) ? errorRecords : []) {
    if (!error?.wordId || !error.everWrong) continue;
    const existing = grouped.get(error.wordId);
    grouped.set(error.wordId, existing ? mergeRecoveredErrorRecords(existing, error) : { ...error });
  }

  return [...grouped.values()];
}

export function recoverErrorBankRecords(errorRecords = [], lexiconEntries = []) {
  const indexes = buildErrorBankLexiconIndexes(lexiconEntries);
  const grouped = new Map();
  const relinks = [];

  for (const error of dedupeRawErrorRecords(errorRecords)) {
    const target = resolveErrorBankTarget(error, indexes);
    if (!target?.wordId) {
      const existing = grouped.get(error.wordId);
      grouped.set(
        error.wordId,
        existing ? mergeRecoveredErrorRecords(existing, error) : { ...error, orphaned: true }
      );
      continue;
    }

    if (target.fromWordId !== target.wordId) {
      relinks.push({
        fromWordId: target.fromWordId,
        toWordId: target.wordId,
        reason: target.reason
      });
    }

    const next = {
      ...error,
      wordId: target.wordId,
      recovered: target.recovered || target.fromWordId !== target.wordId,
      active: true
    };

    const existing = grouped.get(target.wordId);
    grouped.set(target.wordId, existing ? mergeRecoveredErrorRecords(existing, next) : next);
  }

  return {
    records: [...grouped.values()],
    relinks,
    stats: {
      input: Array.isArray(errorRecords) ? errorRecords.length : 0,
      output: grouped.size,
      relinked: relinks.length
    }
  };
}

export function readLegacyLocalSpellingErrors() {
  if (typeof localStorage === "undefined") return [];

  try {
    const raw = localStorage.getItem(LEGACY_SPELLING_STORE);
    if (!raw) return [];

    const state = JSON.parse(raw);
    const records = Object.values(state?.records || {});
    return records
      .filter((record) => Number(record?.wrongAttempts || 0) > 0)
      .map((record) => {
        const totalWrongCount = Number(record.wrongAttempts || 0);
        return {
          wordId: String(record.wordId || ""),
          everWrong: true,
          totalWrongCount,
          totalCorrectCount: Number(record.correctAttempts || 0),
          latestWrongAt: Number(record.lastSeenAt || 0),
          lastWrongAnswer: String(record.lastWrongAnswer || ""),
          active: true,
          severity: severityForWrongCount(totalWrongCount),
          source: "legacy-local-storage"
        };
      })
      .filter((record) => record.wordId);
  } catch {
    return [];
  }
}

export function hasImportedLegacySpellingErrors(scope = "word") {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(`${LEGACY_IMPORT_FLAG}:${scope}`) === "1";
}

export function markLegacySpellingErrorsImported(scope = "word") {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(`${LEGACY_IMPORT_FLAG}:${scope}`, "1");
}

export function needsTruncationErrorRecovery(scope = "word") {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(`${RECOVERY_VERSION_KEY}:${scope}`) !== RECOVERY_VERSION;
}

export function markTruncationErrorRecoveryDone(scope = "word") {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(`${RECOVERY_VERSION_KEY}:${scope}`, RECOVERY_VERSION);
}

function collectPersistedErrorRecords(errorRecords = [], progressRecords = []) {
  const combined = [...errorRecords];

  for (const record of Array.isArray(progressRecords) ? progressRecords : []) {
    if (!record?.wordId || !record?.errorBank?.everWrong) continue;
    combined.push({
      wordId: record.wordId,
      ...record.errorBank
    });
  }

  return dedupeRawErrorRecords(combined);
}

function needsRecoveredErrorWrite(recovered, storedError, progressRecord) {
  const progressError = progressRecord?.errorBank;
  if (!storedError || !progressError) return true;
  if (storedError.active !== true || progressError.active !== true) return true;

  const mergedStored = mergeRecoveredErrorRecords(storedError, progressError);
  return (
    Number(mergedStored.totalWrongCount || 0) < Number(recovered.totalWrongCount || 0)
    || Number(mergedStored.totalCorrectCount || 0) < Number(recovered.totalCorrectCount || 0)
    || Number(mergedStored.latestWrongAt || 0) < Number(recovered.latestWrongAt || 0)
  );
}

function buildStoredWordIdSet(progressRecords = [], errorRecords = []) {
  const ids = new Set();

  for (const record of Array.isArray(progressRecords) ? progressRecords : []) {
    if (record?.wordId && record?.errorBank?.everWrong) ids.add(record.wordId);
  }

  for (const error of Array.isArray(errorRecords) ? errorRecords : []) {
    if (error?.wordId && error?.everWrong) ids.add(error.wordId);
  }

  return ids;
}

function buildProgressDedupeGroups(progressRecords = [], lexiconEntries = [], errorRecords = []) {
  const indexes = buildErrorBankLexiconIndexes(lexiconEntries);
  const entryById = new Map();
  const progressById = new Map();
  const errorById = new Map();

  for (const entry of Array.isArray(lexiconEntries) ? lexiconEntries : []) {
    const wordId = getWordId(entry);
    if (wordId) entryById.set(wordId, entry);
  }

  for (const record of Array.isArray(progressRecords) ? progressRecords : []) {
    if (record?.wordId) progressById.set(record.wordId, record);
  }

  for (const error of Array.isArray(errorRecords) ? errorRecords : []) {
    if (error?.wordId) errorById.set(error.wordId, error);
  }

  const groups = new Map();
  const storedWordIds = buildStoredWordIdSet(progressRecords, errorRecords);

  for (const storageWordId of storedWordIds) {
    const progress = progressById.get(storageWordId) || null;
    const error = progress?.errorBank || errorById.get(storageWordId) || null;

    if (!error?.everWrong) continue;

    const resolvedTarget = resolveErrorBankTarget({ wordId: storageWordId, ...error }, indexes);
    const lexiconEntry = resolvedTarget?.entry || entryById.get(storageWordId);
    const canonicalWordId = resolvedTarget?.wordId || storageWordId;
    const displayWord = resolveErrorDisplayWord(
      { wordId: canonicalWordId, ...error },
      lexiconEntry
    );
    const dedupeKey = buildErrorDedupeKey({ wordId: storageWordId, displayWord }, lexiconEntry);
    if (!dedupeKey) continue;

    const bucket = groups.get(dedupeKey) || [];
    bucket.push({
      ...(progress || { wordId: storageWordId, errorBank: error }),
      originalWordId: storageWordId,
      wordId: canonicalWordId,
      dedupeKey,
      displayWord,
      lexiconEntry,
      orphaned: !lexiconEntry,
      errorBank: {
        ...(progress?.errorBank || {}),
        ...error
      }
    });
    groups.set(dedupeKey, bucket);
  }

  return groups;
}

function mergeProgressErrorStats(canonical = {}, record = {}) {
  const canonicalId = canonical.originalWordId || canonical.wordId;
  const recordId = record.originalWordId || record.wordId;
  const isRelinkedDuplicate = (
    record.originalWordId
    && record.wordId
    && record.originalWordId !== record.wordId
    && record.wordId === canonicalId
  );

  if (isRelinkedDuplicate || recordId === canonicalId) {
    return mergeRecoveredErrorRecords(
      { ...canonical.errorBank, wordId: canonicalId },
      { ...record.errorBank, wordId: canonicalId },
      canonicalId
    );
  }

  return mergeDedupedErrorStats(
    {
      ...canonical.errorBank,
      wordId: canonicalId,
      sourceWordIds: canonical.errorBank?.sourceWordIds || [canonicalId]
    },
    {
      ...record.errorBank,
      wordId: recordId,
      displayWord: record.displayWord,
      dedupeKey: record.dedupeKey
    }
  );
}

function pickStorageWordId(records = []) {
  const direct = records.find((record) => record.originalWordId === record.wordId);
  if (direct?.originalWordId) return direct.originalWordId;

  const resolved = records.find((record) => record.wordId && record.originalWordId !== record.wordId);
  if (resolved?.wordId) return resolved.wordId;

  return records[0]?.originalWordId || records[0]?.wordId || "";
}

function mergeProgressRecordsForDedupe(records = []) {
  if (!records.length) return null;
  if (records.length === 1) {
    const only = records[0];
    return {
      canonical: only,
      duplicates: [],
      mergedErrorBank: {
        ...only.errorBank,
        dedupeKey: only.dedupeKey,
        displayWord: only.displayWord,
        sourceWordIds: [only.originalWordId || only.wordId],
        firstWrongAt: Number(only.errorBank?.firstWrongAt || only.errorBank?.latestWrongAt || 0),
        lastErrorSource: only.wordId
      }
    };
  }

  const storageWordId = pickStorageWordId(records);
  const storageRecord = records.find(
    (record) => (record.originalWordId || record.wordId) === storageWordId
  ) || records[0];
  const canonical = pickCanonicalErrorRecord(records.map((record) => ({
    ...record,
    wordId: record.originalWordId || record.wordId,
    orphaned: !record.lexiconEntry
  }))) || storageRecord;

  let mergedErrorBank = {
    ...storageRecord.errorBank,
    dedupeKey: storageRecord.dedupeKey,
    displayWord: storageRecord.displayWord,
    sourceWordIds: [storageWordId],
    firstWrongAt: Number(storageRecord.errorBank?.firstWrongAt || storageRecord.errorBank?.latestWrongAt || 0),
    lastErrorSource: storageWordId
  };

  for (const record of records) {
    const recordId = record.originalWordId || record.wordId;
    if (recordId === storageWordId) continue;
    mergedErrorBank = mergeProgressErrorStats(
      {
        ...storageRecord,
        wordId: storageWordId,
        originalWordId: storageWordId,
        errorBank: mergedErrorBank
      },
      record
    );
  }

  return {
    canonical: {
      ...canonical,
      ...storageRecord,
      wordId: storageWordId,
      originalWordId: storageWordId
    },
    duplicates: records.filter((record) => (record.originalWordId || record.wordId) !== storageWordId),
    mergedErrorBank
  };
}

export async function consolidateSpellingErrorBankByDedupeKey(store, lexiconEntries = [], options = {}) {
  if (!store?.getAllRecords || !store?.putRecord) {
    return { changed: false, stats: { groups: 0, removed: 0, input: 0, output: 0 } };
  }

  const hasProgressSnapshot = Array.isArray(options.progressRecords);
  const hasErrorSnapshot = Array.isArray(options.errorRecords);
  const [progressRecords, errorRecords] = await Promise.all([
    hasProgressSnapshot ? options.progressRecords : store.getAllRecords(),
    hasErrorSnapshot ? options.errorRecords : (store.getAllErrorBankRecords?.() || [])
  ]);
  const inputCount = buildStoredWordIdSet(progressRecords, errorRecords).size;
  const groups = buildProgressDedupeGroups(progressRecords, lexiconEntries, errorRecords);
  const now = Number(options.now || Date.now());
  let changed = false;
  let removed = 0;

  for (const records of groups.values()) {
    if (records.length <= 1) {
      const only = records[0];
      const storageWordId = only.originalWordId || only.wordId;
      const nextErrorBank = {
        ...only.errorBank,
        dedupeKey: only.dedupeKey,
        displayWord: only.displayWord,
        sourceWordIds: Array.isArray(only.errorBank?.sourceWordIds) && only.errorBank.sourceWordIds.length
          ? only.errorBank.sourceWordIds
          : [storageWordId],
        firstWrongAt: Number(only.errorBank?.firstWrongAt || only.errorBank?.latestWrongAt || 0),
        lastErrorSource: only.errorBank?.lastErrorSource || storageWordId,
        active: true
      };

      const needsWrite = (
        only.errorBank?.dedupeKey !== nextErrorBank.dedupeKey
        || only.errorBank?.displayWord !== nextErrorBank.displayWord
        || !Array.isArray(only.errorBank?.sourceWordIds)
        || !only.errorBank?.sourceWordIds.length
      );

      if (needsWrite) {
        const baseRecord = only.spelling ? only : createSpellingRecord(storageWordId, { now });
        await store.putRecord({
          ...baseRecord,
          ...only,
          wordId: storageWordId,
          errorBank: nextErrorBank,
          updatedAt: now,
          revision: Number(baseRecord.revision || only.revision || 0) + 1,
          dirty: true
        });
        changed = true;
      }
      continue;
    }

    const merged = mergeProgressRecordsForDedupe(records);
    if (!merged?.canonical) continue;

    const storageWordId = merged.canonical.originalWordId || merged.canonical.wordId;
    const baseRecord = merged.canonical.spelling
      ? merged.canonical
      : createSpellingRecord(storageWordId, { now });
    const nextRecord = {
      ...baseRecord,
      ...merged.canonical,
      wordId: storageWordId,
      errorBank: {
        ...merged.canonical.errorBank,
        ...merged.mergedErrorBank,
        active: true
      },
      updatedAt: now,
      revision: Number(baseRecord.revision || merged.canonical.revision || 0) + 1,
      dirty: true
    };

    await store.putRecord(nextRecord);
    changed = true;

    for (const duplicate of merged.duplicates) {
      const deleteId = duplicate.originalWordId || duplicate.wordId;
      if (store.deleteRecord) {
        await store.deleteRecord(deleteId);
      } else if (store.deleteErrorBankRecord) {
        await store.deleteErrorBankRecord(deleteId);
      }
      removed += 1;
      changed = true;
    }
  }

  return {
    changed,
    stats: {
      input: inputCount,
      output: groups.size,
      groups: groups.size,
      removed
    }
  };
}

export async function recoverAndPersistSpellingErrorBank(store, lexiconEntries = [], options = {}) {
  if (!store?.getAllErrorBankRecords || !store?.getAllRecords || !store?.putRecord) {
    return { changed: false, stats: { input: 0, output: 0, relinked: 0 } };
  }

  const scope = options.scope || "word";
  const forceRecovery = options.forceRecovery === true || needsTruncationErrorRecovery(scope);
  const now = Number(options.now || Date.now());
  const [errorRecords, progressRecords] = await Promise.all([
    store.getAllErrorBankRecords(),
    store.getAllRecords()
  ]);
  const emptyConsolidation = { groups: 0, removed: 0, input: 0, output: 0 };

  const legacyErrors = options.importLegacy !== false && !hasImportedLegacySpellingErrors(scope)
    ? readLegacyLocalSpellingErrors()
    : [];

  const combined = [
    ...collectPersistedErrorRecords(errorRecords, progressRecords),
    ...legacyErrors
  ];
  const { records: recoveredErrors, relinks, stats } = recoverErrorBankRecords(combined, lexiconEntries);
  const progressById = new Map(
    (Array.isArray(progressRecords) ? progressRecords : []).map((record) => [record.wordId, record])
  );
  const { records: dedupedErrors, stats: dedupeStats } = dedupeErrorBankRecordsBySpellingKey(
    recoveredErrors,
    lexiconEntries,
    { progressById }
  );
  const errorById = new Map(
    (Array.isArray(errorRecords) ? errorRecords : []).map((record) => [record.wordId, record])
  );
  const repairCandidates = dedupedErrors.filter((recovered) => (
    forceRecovery
    || needsRecoveredErrorWrite(recovered, errorById.get(recovered.wordId), progressById.get(recovered.wordId))
  ));
  const shouldPersist = repairCandidates.length > 0 || legacyErrors.length > 0 || relinks.length > 0;

  if (!shouldPersist) {
    const consolidation = await consolidateSpellingErrorBankByDedupeKey(store, lexiconEntries, {
      now,
      progressRecords,
      errorRecords
    });
    if (forceRecovery) markTruncationErrorRecoveryDone(scope);
    return {
      changed: consolidation.changed,
      stats: {
        ...stats,
        dedupe: dedupeStats,
        consolidation: consolidation.stats,
        preConsolidation: emptyConsolidation
      },
      relinks,
      forceRecovery
    };
  }

  let changed = relinks.length > 0 || legacyErrors.length > 0 || repairCandidates.length > 0;

  for (const recovered of repairCandidates) {
    const existing = progressById.get(recovered.wordId);
    const next = existing
      ? { ...existing }
      : createSpellingRecord(recovered.wordId, { now });

    const lexiconEntry = lexiconEntries.find((entry) => getWordId(entry) === recovered.wordId);
    const displayWord = resolveErrorDisplayWord(recovered, lexiconEntry)
      || getSpellingExpectedAnswer(lexiconEntry);
    next.errorBank = mergeRecoveredErrorRecords(next.errorBank || {}, recovered, recovered.wordId);
    next.errorBank = {
      ...next.errorBank,
      dedupeKey: buildErrorDedupeKey({ ...next.errorBank, wordId: recovered.wordId, displayWord }, lexiconEntry),
      displayWord,
      sourceWordIds: Array.isArray(recovered.sourceWordIds) && recovered.sourceWordIds.length
        ? recovered.sourceWordIds
        : [recovered.wordId],
      firstWrongAt: Number(next.errorBank.firstWrongAt || next.errorBank.latestWrongAt || 0),
      lastErrorSource: recovered.lastErrorSource || recovered.wordId,
      active: true
    };
    next.updatedAt = now;
    next.revision = Number(next.revision || 0) + 1;
    next.dirty = true;

    await store.putRecord(next);
    progressById.set(recovered.wordId, next);
    errorById.set(recovered.wordId, {
      wordId: recovered.wordId,
      ...next.errorBank,
      updatedAt: next.updatedAt,
      revision: next.revision
    });
  }

  const relinkedFrom = new Set(
    relinks
      .filter((item) => item.fromWordId && item.fromWordId !== item.toWordId)
      .map((item) => item.fromWordId)
  );

  if (relinkedFrom.size && store.deleteErrorBankRecord) {
    for (const fromWordId of relinkedFrom) {
      await store.deleteErrorBankRecord(fromWordId);
      errorById.delete(fromWordId);
    }
  }

  if (legacyErrors.length) markLegacySpellingErrorsImported(scope);

  const consolidation = await consolidateSpellingErrorBankByDedupeKey(store, lexiconEntries, {
    now,
    progressRecords: [...progressById.values()],
    errorRecords: [...errorById.values()]
  });
  if (consolidation.changed) changed = true;

  if (changed || forceRecovery) markTruncationErrorRecoveryDone(scope);

  return {
    changed,
    stats: {
      ...stats,
      dedupe: dedupeStats,
      consolidation: consolidation.stats,
      preConsolidation: emptyConsolidation
    },
    relinks,
    forceRecovery
  };
}
