import {
  isAiCoreContentComplete,
  normalizeAiGeneratedEntry
} from "../vocab/admin-ai-content-profile.mjs";
import { normalizeReadingGKey } from "./normalize.mjs";
import {
  getReadingGCompleteness,
  getReadingGContentIssues,
  READING_G_CONTENT_ISSUE,
  isReadingGContentIncomplete,
  isReadingGPlaceholderContent
} from "./content-completeness.mjs";

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

function mergeSenseRows(existingValues, generatedValues) {
  const rows = new Map();
  for (const value of [...list(existingValues), ...list(generatedValues)]) {
    const key = `${text(value?.pos).toLowerCase()}::${text(value?.meaningZh || value?.meaning).toLowerCase()}`;
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

export function isReadingGAiCompletionCandidate(entry) {
  if (!entry || (entry.entryType || "word") !== "word") return false;
  const fields = getReadingGCompleteness(entry).fields;
  const issues = getReadingGContentIssues(entry);
  return !fields.meaning
    || !fields.phonetic
    || !fields.example
    || !fields.wordFamily
    || issues.includes(READING_G_CONTENT_ISSUE.POS);
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

export function buildReadingGAiCompletedEntry(pendingEntry, profile, options = {}) {
  if (!isReadingGAiCompletionCandidate(pendingEntry)) {
    throw new Error("只允许补全音标、释义或例句缺失的G类单词");
  }

  const wasExplicitPending = isReadingGPendingAiEntry(pendingEntry);
  const word = text(pendingEntry.word);
  const normalized = normalizeAiGeneratedEntry(profile, word);
  if (normalizeReadingGKey(normalized.word) !== normalizeReadingGKey(word)) {
    throw new Error(`AI返回主词与待补词不一致：${word} → ${normalized.word || "(empty)"}`);
  }
  if (!isAiCoreContentComplete(normalized)) {
    throw new Error(`AI返回资料不完整，未写入：${word}`);
  }

  const aiSource = options.aiSource === "ai-cache" ? "ai-cache" : "deepseek";
  const generatedAt = text(options.generatedAt || normalized.generatedAt || new Date().toISOString());
  const generatedSenses = buildSenses(pendingEntry.id, normalized);
  const primaryMeaningZh = keepExistingTeachingValue(
    pendingEntry.primaryMeaningZh || pendingEntry.meaningZh || pendingEntry.meaning,
    normalized.meaning
  );
  const exampleCn = keepExistingTeachingValue(
    pendingEntry.exampleCn || pendingEntry.exampleZh,
    normalized.exampleCn
  );
  const qualityFlags = unique([
    ...list(pendingEntry.qualityFlags).filter((flag) => flag !== PENDING_FLAG && flag !== PLACEHOLDER_FLAG),
    ...(wasExplicitPending ? ["master_lexicon_absent"] : []),
    "reading_g_ai_completed",
    ...(wasExplicitPending ? [] : ["reading_g_ai_enhanced"])
  ]);

  const completed = {
    ...pendingEntry,
    word,
    normalizedKey: normalizeReadingGKey(word),
    phonetic: keepExistingTeachingValue(pendingEntry.phonetic, normalized.phonetic),
    primaryPos: keepExistingTeachingValue(pendingEntry.primaryPos || pendingEntry.pos, normalized.pos),
    primaryMeaningZh,
    meaning: keepExistingTeachingValue(pendingEntry.meaning, primaryMeaningZh),
    meaningZh: keepExistingTeachingValue(pendingEntry.meaningZh, primaryMeaningZh),
    definition: keepExistingTeachingValue(pendingEntry.definition, normalized.definition),
    example: keepExistingTeachingValue(pendingEntry.example, normalized.example),
    exampleCn,
    exampleZh: keepExistingTeachingValue(pendingEntry.exampleZh, exampleCn),
    senses: mergeSenseRows(pendingEntry.senses, generatedSenses),
    wordFamily: list(pendingEntry.wordFamily).length
      ? pendingEntry.wordFamily
      : list(normalized.wordFamily),
    wordFamilyReviewed: true,
    difficulty: keepExistingTeachingValue(pendingEntry.difficulty, normalized.difficulty),
    category: wasExplicitPending ? "IELTS G类 · 全题库AI补全" : pendingEntry.category,
    domain: wasExplicitPending ? "全题库阅读" : pendingEntry.domain,
    layers: wasExplicitPending ? [QUESTION_BANK_AI_LAYER_ID] : list(pendingEntry.layers),
    primaryLayer: wasExplicitPending ? QUESTION_BANK_AI_LAYER_ID : pendingEntry.primaryLayer,
    layerRank: wasExplicitPending ? QUESTION_BANK_AI_LAYER_RANK : pendingEntry.layerRank,
    studyMode: wasExplicitPending ? "active" : pendingEntry.studyMode,
    sourceFiles: unique([
      ...list(pendingEntry.sourceFiles),
      READING_G_AI_COMPLETION_SOURCE
    ]),
    qualityFlags,
    alternateMeanings: list(pendingEntry.alternateMeanings),
    pos: keepExistingTeachingValue(pendingEntry.pos || pendingEntry.primaryPos, normalized.pos),
    meaningDetailZh: keepExistingTeachingValue(pendingEntry.meaningDetailZh, normalized.meaningDetailZh),
    otherMeanings: list(pendingEntry.otherMeanings).length ? pendingEntry.otherMeanings : normalized.otherMeanings,
    phoneticSource: pendingEntry.phoneticSource || aiSource,
    aiGenerated: true,
    aiContentProfile: normalized.aiContentProfile,
    aiCompletionSource: aiSource,
    aiCompletedAt: generatedAt
  };
  if (isReadingGContentIncomplete(completed)) {
    throw new Error(`AI返回资料仍未通过G类完整性校验：${word}`);
  }
  return completed;
}
