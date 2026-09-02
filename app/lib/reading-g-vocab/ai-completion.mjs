import {
  isAiGMainContentComplete,
  normalizeAiGeneratedEntry
} from "../vocab/admin-ai-content-profile.mjs";
import { normalizeReadingGKey } from "./normalize.mjs";
import {
  getReadingGCompleteness,
  getReadingGContentIssues,
  READING_G_CONTENT_ISSUE,
  isReadingGContentIncomplete,
  isReadingGPlaceholderContent,
  needsReadingGMultiPosSplit
} from "./content-completeness.mjs";
import {
  applyMeaningCoverageReview,
  isMeaningCoverageProfileUsable,
  needsMeaningCoverageReview,
  MEANING_COVERAGE_PENDING_FLAG,
  MEANING_COVERAGE_REVIEWED_FLAG
} from "../vocab/meaning-coverage-audit.mjs";
import { isBrushableWord } from "../vocab/word-study-eligibility.mjs";
import { isAiProfileCompatibleWithDeclaredPos } from "../vocab/multi-pos-sense-coverage.mjs";

export const READING_G_AI_COMPLETION_SOURCE = "public/data/reading-g-ai-completions.json";
export const QUESTION_BANK_AI_LAYER_ID = "questionBankAiCompleted";
export const QUESTION_BANK_AI_LAYER_RANK = 11;
export const QUESTION_BANK_PENDING_LAYER_ID = "questionBankPending";

const PENDING_FLAG = "missing_master_lexicon";
const PLACEHOLDER_FLAG = "missing_meaning_filled_placeholder";

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value == null ? "" : value).trim();
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function hasReviewedCollection(entry, field, reviewedField) {
  return list(entry?.[field]).length > 0 || entry?.[reviewedField] === true;
}

function chooseGeneratedCollection(entry, field, reviewedField, generated) {
  return entry?.[reviewedField] === true || list(entry?.[field]).length
    ? list(entry?.[field])
    : list(generated);
}

function mergeSenseRows(existingValues, generatedValues) {
  const rows = new Map();
  for (const value of [...list(existingValues), ...list(generatedValues)]) {
    const meaning = text(value?.meaningZh || value?.meaning);
    // Once a real profile has been generated, the old question-bank marker is
    // no longer a lexical sense. Keeping it here makes the study card render
    // "总词库待补" beside the completed Chinese meanings.
    if (isReadingGPlaceholderContent(meaning)) continue;
    const key = `${text(value?.pos).toLowerCase()}::${meaning.toLowerCase()}`;
    if (key === "::") continue;
    const previous = rows.get(key);
    rows.set(key, previous && typeof previous === "object" && typeof value === "object"
      ? { ...previous, ...value }
      : value);
  }
  return [...rows.values()];
}

export function isReadingGPendingAiEntry(entry) {
  return Boolean(
    entry &&
    (entry.entryType || "word") === "word" &&
    entry.primaryLayer === QUESTION_BANK_PENDING_LAYER_ID &&
    entry.studyMode === "reference" &&
    list(entry.qualityFlags).includes(PENDING_FLAG)
  );
}

// The G-main completion queue is deliberately limited to independently
// brushable headwords. Reference-only records may be useful for lookup, but
// must not consume a paid completion slot or be promoted by this UI.
export function isReadingGStandaloneStudyEntry(entry) {
  return Boolean(
    entry &&
    (entry.entryType || "word") === "word" &&
    entry.studyMode === "active" &&
    isBrushableWord(entry)
  );
}

export function isReadingGAiCompletionCandidate(entry) {
  if (!isReadingGStandaloneStudyEntry(entry)) return false;
  const fields = getReadingGCompleteness(entry).fields;
  const issues = getReadingGContentIssues(entry);
  return !fields.meaning
    || !fields.phonetic
    || !fields.example
    || !fields.forms
    || !fields.wordFamily
    || !fields.synonyms
    || !hasReviewedCollection(entry, "collocations", "collocationsReviewed")
    || !hasReviewedCollection(entry, "phraseCollocations", "phraseCollocationsReviewed")
    || issues.includes(READING_G_CONTENT_ISSUE.POS)
    || needsMeaningCoverageReview(entry);
}

export function isReadingGMeaningCoverageCandidate(entry) {
  return isReadingGStandaloneStudyEntry(entry) && needsMeaningCoverageReview(entry);
}

export function resolveReadingGMeaningCoverageProfile(entry, cachedProfile) {
  if (isMeaningCoverageProfileUsable(entry, entry?.word)) {
    return { profile: entry, aiSource: "local-reconciliation" };
  }
  if (cachedProfile && isMeaningCoverageProfileUsable(cachedProfile, entry?.word)) {
    return { profile: cachedProfile, aiSource: "ai-cache" };
  }
  return null;
}

function keepExistingTeachingValue(existingValue, generatedValue) {
  const existing = text(existingValue);
  return existing && !isReadingGPlaceholderContent(existing) ? existing : text(generatedValue);
}

function buildSenses(entryId, normalized) {
  const candidates = [
    {
      pos: normalized.pos,
      meaningZh: normalized.meaning,
      definition: normalized.definition,
      example: normalized.example,
      exampleZh: normalized.exampleCn
    },
    ...list(normalized.otherMeanings).map((sense) => ({
      pos: text(sense?.pos),
      meaningZh: text(sense?.meaningZh || sense?.meaning),
      definition: text(sense?.definitionEn || sense?.definition),
      example: text(sense?.example),
      exampleZh: text(sense?.exampleCn || sense?.exampleZh)
    }))
  ];
  const seen = new Set();
  return candidates.flatMap((sense) => {
    if (!sense.meaningZh) return [];
    const key = `${text(sense.pos).toLowerCase()}::${sense.meaningZh.toLowerCase()}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      senseId: `${entryId}_${text(sense.pos) || "x"}_${String(seen.size).padStart(2, "0")}`
        .replace(/[^a-zA-Z0-9_]+/g, "_"),
      pos: text(sense.pos),
      meaningZh: sense.meaningZh,
      definition: sense.definition,
      example: sense.example,
      exampleZh: sense.exampleZh,
      sourceFiles: [READING_G_AI_COMPLETION_SOURCE]
    }];
  });
}

// This intentionally updates only the teaching explanation and common senses.
// It is used by the dedicated review button, not by the full-profile queue.
export function buildReadingGMeaningCoverageCompletedEntry(entry, profile, options = {}) {
  if (!isReadingGMeaningCoverageCandidate(entry)) {
    throw new Error("只允许复核可单独刷词的常见义待复核词");
  }
  const word = text(entry.word);
  const normalized = normalizeAiGeneratedEntry(profile, word);
  if (normalizeReadingGKey(normalized.word) !== normalizeReadingGKey(word)) {
    throw new Error(`AI返回主词与待复核词不一致：${word} → ${normalized.word || "(empty)"}`);
  }
  if (!isMeaningCoverageProfileUsable(normalized, word)) {
    throw new Error(`AI返回的常见义资料不完整，未写入：${word}`);
  }
  if (!isAiProfileCompatibleWithDeclaredPos(normalized, entry.primaryPos || entry.pos)) {
    throw new Error(`AI返回的词性义项覆盖不完整，未写入：${word} (multiPosNeedsSplit)`);
  }

  const aiSource = ["ai-cache", "local-reconciliation"].includes(options.aiSource)
    ? options.aiSource
    : "deepseek";
  const generatedAt = text(options.generatedAt || normalized.generatedAt || new Date().toISOString());
  const reviewed = applyMeaningCoverageReview(entry, normalized, {
    source: aiSource,
    reviewedAt: generatedAt,
    replacePrimaryMeaning: true
  });
  return {
    ...reviewed,
    qualityFlags: unique([
      ...list(reviewed.qualityFlags).filter((flag) => flag !== MEANING_COVERAGE_PENDING_FLAG),
      MEANING_COVERAGE_REVIEWED_FLAG,
      "reading_g_ai_completed"
    ]),
    aiContentProfile: normalized.aiContentProfile,
    aiCompletionSource: aiSource,
    aiCompletedAt: generatedAt,
    updatedAt: generatedAt
  };
}

export function buildReadingGAiCompletedEntry(pendingEntry, profile, options = {}) {
  // Keep this legacy branch callable for a controlled migration script, while
  // the page and API both use isReadingGAiCompletionCandidate and therefore
  // cannot send reference-only entries to AI.
  if (!isReadingGAiCompletionCandidate(pendingEntry) && !isReadingGPendingAiEntry(pendingEntry)) {
    throw new Error("只允许补全音标、释义或例句缺失的G类单词");
  }

  const wasExplicitPending = isReadingGPendingAiEntry(pendingEntry);
  const isSemanticReview = needsMeaningCoverageReview(pendingEntry);
  const word = text(pendingEntry.word);
  const normalized = normalizeAiGeneratedEntry(profile, word);
  if (normalizeReadingGKey(normalized.word) !== normalizeReadingGKey(word)) {
    throw new Error(`AI返回主词与待补词不一致：${word} → ${normalized.word || "(empty)"}`);
  }
  if (!isAiGMainContentComplete(normalized)) {
    throw new Error(`AI返回资料不完整，未写入：${word}`);
  }
  if (!isAiProfileCompatibleWithDeclaredPos(normalized, pendingEntry.primaryPos || pendingEntry.pos)) {
    throw new Error(`AI返回的词性义项覆盖不完整，未写入：${word} (multiPosNeedsSplit)`);
  }

  const aiSource = options.aiSource === "ai-cache" ? "ai-cache" : "deepseek";
  const generatedAt = text(options.generatedAt || normalized.generatedAt || new Date().toISOString());
  const requiresSenseRebuild = needsReadingGMultiPosSplit(pendingEntry);
  const requiresPrimarySenseRepair = isSemanticReview || requiresSenseRebuild;
  const semanticBase = requiresPrimarySenseRepair
    ? applyMeaningCoverageReview(pendingEntry, normalized, {
      source: aiSource,
      reviewedAt: generatedAt,
      replacePrimaryMeaning: true
    })
    : pendingEntry;
  const { aiCompletionLastFailure: _previousCompletionFailure, ...semanticBaseWithoutFailure } = semanticBase;
  const generatedSenses = buildSenses(pendingEntry.id, normalized);
  const primaryMeaningZh = keepExistingTeachingValue(
    semanticBase.primaryMeaningZh || semanticBase.meaningZh || semanticBase.meaning,
    normalized.meaning
  );
  const exampleCn = keepExistingTeachingValue(
    semanticBase.exampleCn || semanticBase.exampleZh,
    normalized.exampleCn
  );
  const qualityFlags = unique([
    ...list(semanticBase.qualityFlags).filter((flag) => (
      flag !== PENDING_FLAG &&
      flag !== PLACEHOLDER_FLAG &&
      flag !== MEANING_COVERAGE_PENDING_FLAG &&
      flag !== MEANING_COVERAGE_REVIEWED_FLAG
    )),
    ...(wasExplicitPending ? ["master_lexicon_absent"] : []),
    "reading_g_ai_completed",
    ...(isSemanticReview ? [MEANING_COVERAGE_REVIEWED_FLAG] : []),
    ...(wasExplicitPending ? [] : ["reading_g_ai_enhanced"])
  ]);

  const completed = {
    ...semanticBaseWithoutFailure,
    word,
    normalizedKey: normalizeReadingGKey(word),
    phonetic: keepExistingTeachingValue(semanticBase.phonetic, normalized.phonetic),
    primaryPos: keepExistingTeachingValue(semanticBase.primaryPos || semanticBase.pos, normalized.pos),
    primaryMeaningZh,
    meaning: keepExistingTeachingValue(semanticBase.meaning, primaryMeaningZh),
    meaningZh: keepExistingTeachingValue(semanticBase.meaningZh, primaryMeaningZh),
    definition: keepExistingTeachingValue(semanticBase.definition, normalized.definition),
    example: keepExistingTeachingValue(semanticBase.example, normalized.example),
    exampleCn,
    exampleZh: keepExistingTeachingValue(semanticBase.exampleZh, exampleCn),
    // A multi-POS repair cannot keep the structurally incomplete sense rows
    // that caused the entry to enter this queue. Rebuild them from the
    // validated primary + additional senses; all other completions still use
    // the conservative merge path.
    senses: requiresSenseRebuild
      ? generatedSenses
      : mergeSenseRows(semanticBase.senses, generatedSenses),
    forms: chooseGeneratedCollection(semanticBase, "forms", "formsReviewed", normalized.forms),
    formsReviewed: true,
    wordFamily: chooseGeneratedCollection(semanticBase, "wordFamily", "wordFamilyReviewed", normalized.wordFamily),
    wordFamilyReviewed: true,
    synonyms: chooseGeneratedCollection(semanticBase, "synonyms", "synonymsReviewed", normalized.synonyms),
    synonymDetails: semanticBase?.synonymsReviewed === true
      ? list(semanticBase.synonymDetails)
      : list(normalized.synonymDetails),
    synonymsReviewed: true,
    collocations: chooseGeneratedCollection(semanticBase, "collocations", "collocationsReviewed", normalized.collocations),
    collocationsReviewed: true,
    phraseCollocations: chooseGeneratedCollection(
      semanticBase,
      "phraseCollocations",
      "phraseCollocationsReviewed",
      normalized.phraseCollocations
    ),
    phraseCollocationsReviewed: true,
    difficulty: keepExistingTeachingValue(pendingEntry.difficulty, normalized.difficulty),
    category: wasExplicitPending ? "IELTS G类 · 全题库AI补全" : semanticBase.category,
    domain: wasExplicitPending ? "全题库阅读" : semanticBase.domain,
    layers: wasExplicitPending ? [QUESTION_BANK_AI_LAYER_ID] : list(semanticBase.layers),
    primaryLayer: wasExplicitPending ? QUESTION_BANK_AI_LAYER_ID : semanticBase.primaryLayer,
    layerRank: wasExplicitPending ? QUESTION_BANK_AI_LAYER_RANK : semanticBase.layerRank,
    studyMode: wasExplicitPending ? "active" : semanticBase.studyMode,
    sourceFiles: unique([
      ...list(semanticBase.sourceFiles),
      READING_G_AI_COMPLETION_SOURCE
    ]),
    qualityFlags,
    alternateMeanings: list(semanticBase.alternateMeanings),
    pos: keepExistingTeachingValue(semanticBase.pos || semanticBase.primaryPos, normalized.pos),
    meaningDetailZh: keepExistingTeachingValue(semanticBase.meaningDetailZh, normalized.meaningDetailZh),
    otherMeanings: requiresSenseRebuild
      ? normalized.otherMeanings
      : isSemanticReview
      ? semanticBase.otherMeanings
      : (list(semanticBase.otherMeanings).length ? semanticBase.otherMeanings : normalized.otherMeanings),
    phoneticSource: semanticBase.phoneticSource || aiSource,
    aiGenerated: true,
    aiContentProfile: normalized.aiContentProfile,
    aiCompletionSource: aiSource,
    aiCompletedAt: generatedAt,
    updatedAt: generatedAt,
    meaningCoveragePending: isSemanticReview ? false : semanticBase.meaningCoveragePending,
    meaningCoverageReviewed: isSemanticReview ? true : semanticBase.meaningCoverageReviewed,
    meaningCoverageAuditStatus: isSemanticReview ? "reviewed" : semanticBase.meaningCoverageAuditStatus,
    meaningCoverageReviewSource: isSemanticReview ? aiSource : semanticBase.meaningCoverageReviewSource,
    meaningCoverageReviewedAt: isSemanticReview ? generatedAt : semanticBase.meaningCoverageReviewedAt,
    meaningCoveragePromptVersion: isSemanticReview
      ? normalized.aiContentProfile
      : semanticBase.meaningCoveragePromptVersion
  };
  if (isReadingGContentIncomplete(completed)) {
    const remainingIssues = getReadingGContentIssues(completed).join(", ") || "unknown";
    throw new Error(`AI返回资料仍未通过G类完整性校验：${word}（${remainingIssues}）`);
  }
  return completed;
}
