import { normalizeSpellingEntry } from "./normalize-spelling-entry.mjs";
import {
  applyPluralShortcut,
  resolveWordUnit
} from "./plural-forms.mjs";
import { splitSpellingBatches } from "./spelling-categories.mjs";
import { getWordId, isInternalSpellingIdentifier, normalizeSpellingAnswer } from "./word-id.mjs";

export const PERSONAL_WRONG_BOOK_STORAGE_KEY = "ielts-vocab:personal-wrong-book:v1";
export const PERSONAL_WRONG_BOOK_BATCH_SIZE = 35;
export const PERSONAL_WRONG_BOOK_BASE_REPS = 2;
export const PERSONAL_WRONG_BOOK_PLURAL_REPS = 2;
export const PERSONAL_WRONG_BOOK_REPETITIONS = PERSONAL_WRONG_BOOK_BASE_REPS + PERSONAL_WRONG_BOOK_PLURAL_REPS;

export { inferPluralBase, resolvePluralInflectionPair } from "./plural-forms.mjs";

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

function inferScopeFromText(value = "") {
  return /\s/.test(String(value || "").trim()) ? "phrase" : "word";
}

function isEnglishLike(value = "") {
  return /^[A-Za-z][A-Za-z0-9' -]*[A-Za-z0-9]$|^[A-Za-z]$/u.test(String(value || "").trim());
}

function isValidPersonalWrongAnswer(value = "") {
  const text = String(value || "").trim();
  if (!text || isInternalSpellingIdentifier(text)) return false;
  return /\s/.test(text) || isEnglishLike(text);
}

function stripAnswerNumberPrefix(value = "") {
  return String(value || "")
    .trim()
    .replace(/^\d{1,4}\s*[、,，.．)\]）:：-]\s*/u, "")
    .replace(/^\d{1,4}\s+(?=[A-Za-z])/u, "")
    .trim();
}

function resolveScopeForTarget(targetText = "", scopeHint = "") {
  if (/\s/.test(String(targetText || "").trim())) return "phrase";
  return scopeHint === "phrase" ? "phrase" : "word";
}

function buildWritesForRecord(record = {}) {
  const anchor = record.anchor || record.baseWord || record.word || record.targetAnswer;
  const inflected = record.inflected || record.targetAnswer || anchor;
  if (!isValidPersonalWrongAnswer(anchor) || !isValidPersonalWrongAnswer(inflected)) return [];
  const hasPair = Boolean(record.hasInflectionPair && normalizeHeadword(anchor) !== normalizeHeadword(inflected));
  const writes = [];

  if (!hasPair) {
    for (let index = 1; index <= PERSONAL_WRONG_BOOK_BASE_REPS; index += 1) {
      writes.push({
        formKind: "same",
        formIndex: index,
        unitWriteIndex: index,
        answer: anchor
      });
    }
    return writes;
  }

  for (let index = 1; index <= PERSONAL_WRONG_BOOK_BASE_REPS; index += 1) {
    writes.push({
      formKind: "base",
      formIndex: index,
      unitWriteIndex: index,
      answer: anchor
    });
  }

  for (let index = 1; index <= PERSONAL_WRONG_BOOK_PLURAL_REPS; index += 1) {
    writes.push({
      formKind: "plural",
      formIndex: index,
      unitWriteIndex: PERSONAL_WRONG_BOOK_BASE_REPS + index,
      answer: inflected
    });
  }

  return writes;
}

function normalizePersonalWrongLine(line = "", options = {}) {
  const now = Number(options.now || Date.now());
  const scopeHint = options.scopeHint || options.scope || "";
  const original = String(line || "").trim();
  const hasAnswerNumberPrefix = /^\d{1,4}\s*(?:[、,，.．)\]）:：-]\s*|\s+(?=[A-Za-z]))/u.test(original);
  const raw = stripAnswerNumberPrefix(original);
  if (!raw) return null;

  const arrowMatch = raw.match(/^(.+?)\s*(?:->|=>|→|＝>|变成|正确(?:形式|答案)?[:：])\s*(.+)$/u);
  let formPart = raw;
  let explicitAnchor = "";
  let meaningParts = [];

  if (arrowMatch) {
    explicitAnchor = arrowMatch[1].trim();
    formPart = arrowMatch[2].trim();
  }

  const parts = formPart.split(/\s*[|｜]\s*/u).map((part) => part.trim()).filter(Boolean);
  const first = parts[0] || "";
  meaningParts = parts.slice(1);

  const shortcutMatch = first.match(/^([A-Za-z][A-Za-z'-]*)\s*(\+(?:s|es|ies|ves))$/i);
  let anchor = "";
  let inflected = "";
  let hasInflectionPair = false;
  let formNote = "";
  let usedShortcut = false;

  if (shortcutMatch) {
    usedShortcut = true;
    anchor = explicitAnchor || shortcutMatch[1];
    inflected = applyPluralShortcut(shortcutMatch[1], shortcutMatch[2]);
    hasInflectionPair = Boolean(anchor && inflected && normalizeHeadword(anchor) !== normalizeHeadword(inflected));
    formNote = hasInflectionPair ? "注意复数形式" : "";
  } else if (explicitAnchor) {
    const unit = resolveWordUnit(first, "", { explicitAnchor });
    if (!unit) return null;
    anchor = unit.anchor;
    inflected = unit.inflected;
    hasInflectionPair = unit.hasPair;
    formNote = unit.formNote || "";
  } else if (parts.length >= 2 && isEnglishLike(parts[1]) && !/\s/.test(first) && !/\s/.test(parts[1])) {
    const unit = resolveWordUnit(first, parts[1]);
    if (unit) {
      anchor = unit.anchor;
      inflected = unit.inflected;
      hasInflectionPair = unit.hasPair;
      formNote = unit.formNote || "";
      meaningParts = parts.slice(2);
    } else {
      anchor = first;
      inflected = first;
      hasInflectionPair = false;
      meaningParts = parts.slice(1);
    }
  } else if (/\s/.test(first)) {
    anchor = first;
    inflected = first;
    hasInflectionPair = false;
  } else if (hasAnswerNumberPrefix) {
    const unit = resolveWordUnit(first);
    if (unit && unit.hasPair && normalizeHeadword(unit.inflected) === normalizeHeadword(first)) {
      anchor = unit.anchor;
      inflected = unit.inflected;
      hasInflectionPair = true;
      formNote = unit.formNote || "";
    } else {
      anchor = first;
      inflected = first;
      hasInflectionPair = false;
    }
  } else {
    const unit = resolveWordUnit(first);
    if (!unit) return null;
    anchor = unit.anchor;
    inflected = unit.inflected;
    hasInflectionPair = unit.hasPair;
    formNote = unit.formNote || "";
  }

  const word = anchor || inflected;
  if (!isValidPersonalWrongAnswer(word)) return null;
  if (!isValidPersonalWrongAnswer(inflected || displayWord)) return null;
  if (!usedShortcut && /\s/.test(first) && !isEnglishLike(first)) return null;

  const displayWord = /\s/.test(first) ? first : (anchor || inflected);
  const scope = resolveScopeForTarget(displayWord, scopeHint);
  const errorType = scope === "word" && hasInflectionPair ? "plural_form" : "spelling";

  return {
    word: displayWord,
    anchor: anchor || displayWord,
    inflected: inflected || displayWord,
    hasInflectionPair: scope === "word" && hasInflectionPair,
    targetAnswer: inflected || displayWord,
    baseWord: anchor || "",
    meaning: meaningParts.join("；").trim(),
    errorType,
    formNote: formNote || (errorType === "plural_form" ? "注意复数形式" : ""),
    scope,
    addedAt: now,
    source: "manual"
  };
}

export function parsePersonalWrongBookInput(input = "", options = {}) {
  const values = String(input || "")
    .split(/[\n,;，；]+/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => normalizePersonalWrongLine(line, options))
    .filter(Boolean);

  const byKey = new Map();
  for (const item of values) {
    const key = `${item.scope}:${normalizeHeadword(item.anchor || item.word)}`;
    if (!byKey.has(key)) byKey.set(key, item);
  }
  return [...byKey.values()];
}

export function getPersonalWrongBookRecordDedupeKey(record = {}) {
  const legacyTarget = String(record?.targetAnswer || record?.word || record?.text || "").trim();
  const scope = resolveScopeForTarget(legacyTarget, record?.scope || inferScopeFromText(legacyTarget));
  const anchor = String(record?.anchor || record?.baseWord || record?.word || legacyTarget || "").trim();
  const inflected = String(record?.inflected || record?.targetAnswer || legacyTarget || anchor || "").trim();
  const normalizedAnchor = normalizeHeadword(anchor);
  const normalizedInflected = normalizeHeadword(inflected);
  const normalizedTarget = normalizeHeadword(legacyTarget);
  const normalizedWord = normalizeHeadword(record?.word || "");
  const normalized = normalizedAnchor || normalizedInflected || normalizedTarget || normalizedWord;
  return normalized ? `${scope}:${normalized}` : "";
}

export function normalizePersonalWrongBookRecords(records = []) {
  const byKey = new Map();

  for (const item of Array.isArray(records) ? records : []) {
    const legacyTarget = String(item?.targetAnswer || item?.word || item?.text || "").trim();
    const scope = resolveScopeForTarget(legacyTarget, item?.scope || inferScopeFromText(legacyTarget));
    let anchor = String(item?.anchor || item?.baseWord || "").trim();
    let inflected = String(item?.inflected || item?.targetAnswer || legacyTarget).trim();
    let hasInflectionPair = item?.hasInflectionPair === true;

    if (!anchor && !inflected) continue;

    if (scope === "word" && !hasInflectionPair && anchor && inflected && normalizeHeadword(anchor) !== normalizeHeadword(inflected)) {
      hasInflectionPair = true;
    }

    if (scope === "word" && !anchor) {
      const unit = resolveWordUnit(inflected);
      if (unit) {
        anchor = unit.anchor;
        inflected = unit.inflected;
        hasInflectionPair = unit.hasPair;
      } else {
        anchor = inflected;
      }
    }

    if (scope === "phrase") {
      anchor = anchor || inflected || legacyTarget;
      inflected = inflected || anchor;
      hasInflectionPair = false;
    }

    const normalizedAnchor = normalizeHeadword(anchor);
    const normalizedInflected = normalizeHeadword(inflected);
    if (!isValidPersonalWrongAnswer(anchor)) continue;
    if (!isValidPersonalWrongAnswer(inflected)) continue;
    if (!normalizedAnchor) continue;

    const key = getPersonalWrongBookRecordDedupeKey({
      ...item,
      scope,
      anchor,
      baseWord: anchor,
      inflected,
      targetAnswer: inflected,
      word: anchor
    }) || `${scope}:${normalizedAnchor}`;
    const previous = byKey.get(key);
    const id = String(previous?.id || item?.id || `personal_wrong_${scope}_${hashString(`${scope}:${normalizedAnchor}`)}`).trim();
    const errorType = scope === "word" && hasInflectionPair ? "plural_form" : "spelling";

    byKey.set(key, {
      ...previous,
      ...item,
      id,
      word: anchor,
      anchor,
      inflected,
      hasInflectionPair: scope === "word" && hasInflectionPair,
      targetAnswer: inflected,
      baseWord: anchor,
      normalized: normalizedInflected,
      normalizedAnchor,
      normalizedInflected,
      scope,
      meaning: String(item?.meaning || previous?.meaning || "").trim(),
      errorType,
      formNote: String(item?.formNote || previous?.formNote || (errorType === "plural_form" ? "注意复数形式" : "")).trim(),
      addedAt: Number(previous?.addedAt || item?.addedAt || Date.now()),
      source: String(item?.source || previous?.source || "manual"),
      targetRepetitions: hasInflectionPair ? PERSONAL_WRONG_BOOK_REPETITIONS : PERSONAL_WRONG_BOOK_BASE_REPS,
      active: item?.active !== false
    });
  }

  return [...byKey.values()].sort((left, right) => Number(left.addedAt || 0) - Number(right.addedAt || 0));
}

export function dedupePersonalWrongBookRecords(records = []) {
  const input = Array.isArray(records) ? records : [];
  const normalized = normalizePersonalWrongBookRecords(input);
  return {
    records: normalized,
    stats: {
      input: input.length,
      output: normalized.length,
      merged: Math.max(0, input.length - normalized.length)
    }
  };
}

export function mergePersonalWrongBookRecords(existing = [], incoming = []) {
  return normalizePersonalWrongBookRecords([
    ...(Array.isArray(existing) ? existing : []),
    ...(Array.isArray(incoming) ? incoming : [])
  ]);
}

export function buildPersonalWrongLexiconIndex(entries = []) {
  const index = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    for (const key of [
      entry.word,
      entry.phrase,
      entry.answer,
      entry.expectedAnswer
    ].filter(Boolean)) {
      const normalized = normalizeHeadword(key);
      if (normalized) index.set(normalized, entry);
    }
  }
  return index;
}

function buildSupplementalEntry(record = {}, answer = "") {
  const targetAnswer = answer || record.inflected || record.targetAnswer || record.word;
  const id = `personal_wrong_local_${record.scope}_${hashString(`${record.id}:${targetAnswer}`)}`;
  return {
    id,
    wordId: id,
    word: targetAnswer,
    displayText: targetAnswer,
    expectedAnswer: targetAnswer,
    answer: targetAnswer,
    acceptedAnswers: [targetAnswer],
    pos: record.scope === "phrase" ? "phrase" : "word",
    meaning: record.meaning || "做题错词，待补充释义",
    definition: record.meaning || "做题错词，待补充释义",
    example: "",
    exampleCn: "",
    difficulty: "做题错词",
    category: "个人做题错词",
    entryType: record.scope === "phrase" ? "phrase" : "headword",
    isPhrase: record.scope === "phrase",
    personalWrongOnly: true
  };
}

function resolveLinkedEntry(record = {}, write = {}, index = {}) {
  const answerNorm = normalizeHeadword(write.answer);
  return index.get(answerNorm)
    || index.get(record.normalizedAnchor)
    || index.get(record.normalizedInflected)
    || index.get(record.normalized);
}

function buildFormHint(record = {}, write = {}) {
  if (write.formKind === "plural") {
    return record.formNote || `复数形式：${write.answer}`;
  }
  if (write.formKind === "base" && record.hasInflectionPair) {
    return "原形";
  }
  return record.formNote || "";
}

function cloneForWrite(entry = {}, record = {}, write = {}) {
  const base = normalizeSpellingEntry(entry);
  const sourceWordId = getWordId(entry) || base.wordId || record.id;
  const uniqueId = `${record.id}:${write.formKind}-${write.formIndex}`;
  const targetAnswer = write.answer;

  return {
    ...entry,
    ...base,
    id: uniqueId,
    wordId: uniqueId,
    displayText: targetAnswer,
    expectedAnswer: targetAnswer,
    answer: targetAnswer,
    acceptedAnswers: [targetAnswer],
    word: targetAnswer,
    spellingHint: buildFormHint(record, write),
    meaning: record.meaning || base.meaning,
    personalWrong: {
      unitId: record.id,
      recordId: record.id,
      sourceWordId,
      source: record.source || "manual",
      linkedToLexicon: !entry.personalWrongOnly,
      anchor: record.anchor || record.baseWord || "",
      inflected: record.inflected || record.targetAnswer || "",
      baseWord: record.anchor || record.baseWord || "",
      targetAnswer,
      hasInflectionPair: Boolean(record.hasInflectionPair),
      errorType: record.errorType || "spelling",
      formNote: record.formNote || "",
      formKind: write.formKind,
      formIndex: write.formIndex,
      unitWriteIndex: write.unitWriteIndex,
      unitWriteTotal: record.hasInflectionPair ? PERSONAL_WRONG_BOOK_REPETITIONS : PERSONAL_WRONG_BOOK_BASE_REPS,
      repeatIndex: write.unitWriteIndex,
      repeatTotal: record.hasInflectionPair ? PERSONAL_WRONG_BOOK_REPETITIONS : PERSONAL_WRONG_BOOK_BASE_REPS,
      linkedToOfficialLexicon: !entry.personalWrongOnly &&
        entry.source !== "personal_wrong_book" &&
        entry.addedFromPersonalWrongBook !== true &&
        entry.supplemental !== true
    }
  };
}

export function buildPersonalWrongBookCandidates(records = [], lexiconEntries = [], options = {}) {
  const scope = options.scope || "word";
  const normalizedRecords = normalizePersonalWrongBookRecords(records)
    .filter((record) => record.active !== false && record.scope === scope);
  const index = buildPersonalWrongLexiconIndex(lexiconEntries);
  const candidates = [];

  for (const record of normalizedRecords) {
    const writes = buildWritesForRecord(record);
    for (const write of writes) {
      const linked = resolveLinkedEntry(record, write, index);
      const source = linked || buildSupplementalEntry(record, write.answer);
      candidates.push(cloneForWrite(source, record, write));
    }
  }

  return candidates;
}

export function getPersonalWrongScopedRecords(records = [], scope = "word") {
  return normalizePersonalWrongBookRecords(records)
    .filter((record) => record.active !== false && record.scope === scope);
}

export function splitPersonalWrongBookBatches(records = [], options = {}) {
  const scope = options.scope || "word";
  const batchSize = Math.max(1, Number(options.batchSize) || PERSONAL_WRONG_BOOK_BATCH_SIZE);
  return splitSpellingBatches(getPersonalWrongScopedRecords(records, scope), batchSize);
}

export function countPersonalWrongBookBatches(records = [], options = {}) {
  return Math.max(1, splitPersonalWrongBookBatches(records, options).length);
}

export function clampPersonalWrongBatchIndex(batchIndex = 0, records = [], options = {}) {
  const batchCount = countPersonalWrongBookBatches(records, options);
  return Math.min(Math.max(0, Number(batchIndex) || 0), batchCount - 1);
}

export function findPersonalWrongBatchIndexForRecordIds(records = [], recordIds = [], options = {}) {
  const targets = new Set((Array.isArray(recordIds) ? recordIds : []).filter(Boolean));
  if (!targets.size) return 0;

  const batches = splitPersonalWrongBookBatches(records, options);
  for (let index = 0; index < batches.length; index += 1) {
    if (batches[index].some((record) => targets.has(record.id))) {
      return index;
    }
  }

  return Math.max(0, batches.length - 1);
}

export function resolvePersonalWrongBatchIndexAfterAdd(records = [], options = {}) {
  const {
    scope = "word",
    currentBatchIndex = 0,
    addedRecordIds = [],
    jumpToNewWordsBatch = false,
    batchSize = PERSONAL_WRONG_BOOK_BATCH_SIZE
  } = options;
  const batchOptions = { scope, batchSize };

  if (jumpToNewWordsBatch && addedRecordIds.length) {
    return findPersonalWrongBatchIndexForRecordIds(records, addedRecordIds, batchOptions);
  }

  return clampPersonalWrongBatchIndex(currentBatchIndex, records, batchOptions);
}

export function listPersonalWrongBookBatchOptions(records = [], options = {}) {
  const scope = options.scope || "word";
  const batchSize = Math.max(1, Number(options.batchSize) || PERSONAL_WRONG_BOOK_BATCH_SIZE);
  const batches = splitPersonalWrongBookBatches(records, { scope, batchSize });

  return batches.map((batch, index) => ({
    value: index,
    label: `第 ${index + 1} 组 · ${batch.length} 词`,
    count: batch.length
  }));
}

export function selectPersonalWrongBookBatch(records = [], lexiconEntries = [], options = {}) {
  const scope = options.scope || "word";
  const batchSize = Math.max(1, Number(options.batchSize) || PERSONAL_WRONG_BOOK_BATCH_SIZE);
  const batchIndex = clampPersonalWrongBatchIndex(options.batchIndex, records, { scope, batchSize });
  const batches = splitPersonalWrongBookBatches(records, { scope, batchSize });
  const batchRecords = batches[batchIndex] || [];
  const entries = buildPersonalWrongBookCandidates(batchRecords, lexiconEntries, { scope });

  return {
    records: batchRecords,
    entries,
    scopeKind: scope,
    batchIndex,
    batchSize,
    totalInCategory: getPersonalWrongScopedRecords(records, scope).length,
    batchCount: batches.length,
    batchEntryCount: batchRecords.length,
    writeCount: entries.length
  };
}

export function summarizePersonalWrongBook(records = []) {
  const normalized = normalizePersonalWrongBookRecords(records).filter((record) => record.active !== false);
  const withPair = normalized.filter((record) => record.scope === "word" && record.hasInflectionPair).length;
  return {
    total: normalized.length,
    word: normalized.filter((record) => record.scope === "word").length,
    phrase: normalized.filter((record) => record.scope === "phrase").length,
    withInflectionPair: withPair,
    repetitions: PERSONAL_WRONG_BOOK_REPETITIONS,
    baseRepetitions: PERSONAL_WRONG_BOOK_BASE_REPS,
    pluralRepetitions: PERSONAL_WRONG_BOOK_PLURAL_REPS
  };
}

export function formatPersonalWrongUnitLabel(record = {}) {
  if (record.scope === "phrase") return record.anchor || record.word;
  if (record.hasInflectionPair) {
    return `${record.anchor} + ${record.inflected}`;
  }
  return record.anchor || record.word;
}
