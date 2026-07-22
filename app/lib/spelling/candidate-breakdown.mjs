import { normalizeEntryMode } from "./entry-mode.mjs";
import {
  normalizeSpellingEntry,
  resolveSpellingEntryType
} from "./normalize-spelling-entry.mjs";
import {
  buildSpellingExclusionIndex,
  isSpellingInterjectionEntry
} from "./spelling-word-filter.mjs";
import { detectTruncatedHeadword } from "./truncated-headword.mjs";
import { isInternalSpellingIdentifier } from "./word-id.mjs";

function toWordList(words) {
  if (Array.isArray(words)) return words;
  if (Array.isArray(words?.words)) return words.words;
  return [];
}

function readFlashcardStatus(flashcardState = {}, wordId, word = {}) {
  const statusMaps = [
    flashcardState.statuses,
    flashcardState.flashcardProgress?.statuses,
    flashcardState.flashcardProgress,
    flashcardState.progress
  ].filter(Boolean);

  for (const map of statusMaps) {
    const value = map[wordId] ?? map[word.word] ?? map[word.id];
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && typeof value.status === "string") return value.status;
  }

  return "";
}

function shouldIncludeEntry(entryType, entryMode) {
  if (entryMode === "phrases") return entryType === "phrase";
  if (entryMode === "headwords") return entryType === "word";
  return true;
}

function duplicateKeyForCandidate(candidate = {}) {
  return String(candidate.expectedAnswer || candidate.displayText || candidate.word || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function shouldAllowRepeatedAnswerCandidates(options = {}, words = []) {
  if (options.allowRepeatedAnswers === true || options.practiceSource === "personal_wrong_book") {
    return true;
  }

  return (Array.isArray(words) ? words : []).some((entry) => Number(entry?.personalWrong?.repeatTotal || 0) > 1);
}

function duplicateKeyForSession(candidate = {}, allowRepeatedAnswers = false) {
  if (allowRepeatedAnswers) {
    return String(candidate.wordId || "").trim();
  }

  return duplicateKeyForCandidate(candidate);
}

export function analyzeCandidateBreakdown(words = [], flashcardState = {}, options = {}) {
  const excludeFamiliarFlashcards = options.excludeFamiliarFlashcards !== false;
  const entryMode = normalizeEntryMode(options.entryMode || options.mode, {
    scope: options.scope || "word"
  });
  const currentBatchId = String(options.currentBatchId || options.batchId || "");
  const rawEntries = toWordList(words);
  const allowRepeatedAnswers = shouldAllowRepeatedAnswerCandidates(options, rawEntries);
  const rawBatchTotal = rawEntries.length;

  let filteredByInvalidAnswer = 0;
  let filteredByMode = 0;
  let filteredByFamiliar = 0;
  let filteredByInterjection = 0;
  let filteredByIntegrity = 0;
  let filteredByTruncated = 0;
  let filteredByDuplicate = 0;
  const filteredBySrsOnly = 0;
  const filteredByRepairState = 0;
  const sessionCandidates = [];
  const seenAnswers = new Set();
  const truncationIndex = buildSpellingExclusionIndex(rawEntries);

  for (const word of rawEntries) {
    const normalized = normalizeSpellingEntry(word);
    const entryType = resolveSpellingEntryType(word, normalized.expectedAnswer);
    const flashcardStatus = readFlashcardStatus(flashcardState, normalized.wordId, word);

    if (!normalized.wordId || !normalized.expectedAnswer || isInternalSpellingIdentifier(normalized.expectedAnswer)) {
      filteredByInvalidAnswer += 1;
      continue;
    }

    if (!shouldIncludeEntry(entryType, entryMode)) {
      filteredByMode += 1;
      continue;
    }

    if (isSpellingInterjectionEntry(word)) {
      filteredByInterjection += 1;
      continue;
    }

    if (word?.spellingEligible === false || word?.dataIntegrityStatus === "historical-slot-replacement-review") {
      filteredByIntegrity += 1;
      continue;
    }

    if (detectTruncatedHeadword(word, truncationIndex)) {
      filteredByTruncated += 1;
      continue;
    }

    if (excludeFamiliarFlashcards && flashcardStatus === "熟悉") {
      filteredByFamiliar += 1;
      continue;
    }

    const duplicateKey = duplicateKeyForSession(normalized, allowRepeatedAnswers);
    if (duplicateKey && seenAnswers.has(duplicateKey)) {
      filteredByDuplicate += 1;
      continue;
    }
    if (duplicateKey) seenAnswers.add(duplicateKey);

    sessionCandidates.push({
      ...word,
      ...normalized,
      word: normalized.displayText,
      entryType,
      flashcardStatus,
      sourceIndex: sessionCandidates.length
    });
  }

  const eligibleTotal = rawBatchTotal - filteredByInvalidAnswer;
  const sessionTotal = sessionCandidates.length;
  const filteredOutTotal = rawBatchTotal - sessionTotal;
  const filteredByCompleted = 0;
  const filteredOther = Math.max(
    0,
    filteredOutTotal -
      filteredByInvalidAnswer -
      filteredByMode -
      filteredByFamiliar -
      filteredByInterjection -
      filteredByIntegrity -
      filteredByTruncated -
      filteredByCompleted -
      filteredByDuplicate -
      filteredBySrsOnly -
      filteredByRepairState
  );

  return {
    rawBatchTotal,
    eligibleTotal,
    sessionTotal,
    completedCount: 0,
    filteredOutTotal,
    filteredByFamiliar,
    filteredByInterjection,
    filteredByIntegrity,
    filteredByTruncated,
    filteredByInvalidAnswer,
    filteredByMode,
    filteredByCompleted,
    filteredByDuplicate,
    filteredBySrsOnly,
    filteredByRepairState,
    filteredOther,
    currentMode: entryMode,
    includeFamiliar: !excludeFamiliarFlashcards,
    currentBatch: currentBatchId,
    currentBatchId,
    sessionCandidates,
    sessionWordIds: sessionCandidates.map((candidate) => candidate.wordId).filter(Boolean)
  };
}

export function formatCandidateBreakdownSummary(breakdown = {}) {
  const parts = [];

  if (Number(breakdown.filteredByFamiliar) > 0) {
    parts.push(`熟悉词 ${breakdown.filteredByFamiliar}`);
  }
  if (Number(breakdown.filteredByInterjection) > 0) {
    parts.push(`语气词 ${breakdown.filteredByInterjection}`);
  }
  if (Number(breakdown.filteredByIntegrity) > 0) {
    parts.push(`历史替换待复核 ${breakdown.filteredByIntegrity}`);
  }
  if (Number(breakdown.filteredByTruncated) > 0) {
    parts.push(`截断词 ${breakdown.filteredByTruncated}`);
  }
  if (Number(breakdown.filteredByInvalidAnswer) > 0) {
    parts.push(`无效词 ${breakdown.filteredByInvalidAnswer}`);
  }
  if (Number(breakdown.filteredByMode) > 0) {
    const modeLabel = breakdown.currentMode === "headwords"
      ? "短语"
      : breakdown.currentMode === "phrases"
        ? "单词"
        : "题型";
    parts.push(`${modeLabel} ${breakdown.filteredByMode}`);
  }
  if (Number(breakdown.filteredByDuplicate) > 0) {
    parts.push(`duplicate ${breakdown.filteredByDuplicate}`);
  }
  if (Number(breakdown.filteredBySrsOnly) > 0) {
    parts.push(`SRS ${breakdown.filteredBySrsOnly}`);
  }
  if (Number(breakdown.filteredByRepairState) > 0) {
    parts.push(`repair ${breakdown.filteredByRepairState}`);
  }
  if (Number(breakdown.filteredOther) > 0) {
    parts.push(`其他 ${breakdown.filteredOther}`);
  }

  return parts.join("，");
}

export function formatSessionTrainingLine(breakdown = {}) {
  const sessionTotal = Number(breakdown.sessionTotal) || 0;
  const filteredOutTotal = Number(breakdown.filteredOutTotal) || 0;

  if (filteredOutTotal <= 0) {
    return `本次训练：${sessionTotal} 词`;
  }

  const detail = formatCandidateBreakdownSummary(breakdown);
  return `本次训练：${sessionTotal} 词（已过滤 ${filteredOutTotal} 个${detail ? `：${detail}` : ""}）`;
}

export function logCandidateBreakdownDebug(breakdown = {}, progress = {}, context = {}) {
  if (typeof console === "undefined") return;

  const payload = {
    rawBatchTotal: breakdown.rawBatchTotal,
    candidateTotal: breakdown.candidateTotal ?? breakdown.sessionTotal,
    sessionTotal: breakdown.sessionTotal,
    pendingTotal: context.pendingTotal ?? progress.pendingTotal ?? 0,
    repairTotal: context.repairTotal ?? progress.repairTotal ?? 0,
    errorBankTotal: context.errorBankTotal ?? 0,
    srsTotal: context.srsTotal ?? progress.srsTotal ?? 0,
    duplicateCount: context.duplicateCount ?? breakdown.duplicateCount ?? breakdown.filteredByDuplicate ?? 0,
    mode: context.mode || breakdown.currentMode || "",
    category: context.category || breakdown.category || "",
    batch: context.batch || breakdown.currentBatch || breakdown.currentBatchId || "",
    source: context.source || breakdown.source || "",
    completedCount: progress.completedCount ?? breakdown.completedCount ?? 0,
    filteredOutTotal: breakdown.filteredOutTotal,
    filteredByFamiliar: breakdown.filteredByFamiliar,
    filteredByInterjection: breakdown.filteredByInterjection,
    filteredByIntegrity: breakdown.filteredByIntegrity,
    filteredByTruncated: breakdown.filteredByTruncated,
    filteredByInvalidAnswer: breakdown.filteredByInvalidAnswer,
    filteredByMode: breakdown.filteredByMode,
    filteredByCompleted: breakdown.filteredByCompleted,
    filteredByDuplicate: breakdown.filteredByDuplicate,
    filteredBySrsOnly: breakdown.filteredBySrsOnly,
    filteredByRepairState: breakdown.filteredByRepairState,
    currentMode: breakdown.currentMode,
    includeFamiliar: breakdown.includeFamiliar,
    currentBatch: breakdown.currentBatch || breakdown.currentBatchId,
    currentBatchId: breakdown.currentBatchId
  };

  console.debug("[SPELLING_DEBUG]", payload);
  console.table({
    "raw batch": breakdown.rawBatchTotal,
    "valid answer": breakdown.eligibleTotal,
    "filtered familiar": breakdown.filteredByFamiliar,
    "filtered interjection": breakdown.filteredByInterjection,
    "filtered integrity": breakdown.filteredByIntegrity,
    "filtered truncated": breakdown.filteredByTruncated,
    "filtered invalid": breakdown.filteredByInvalidAnswer,
    "filtered mode": breakdown.filteredByMode,
    "filtered duplicate": breakdown.filteredByDuplicate,
    "filtered srs": breakdown.filteredBySrsOnly,
    "filtered repair": breakdown.filteredByRepairState,
    "session total": breakdown.sessionTotal
  });
}
