import {
  isAiCoreContentComplete,
  normalizeAiGeneratedEntry
} from "../vocab/admin-ai-content-profile.mjs";
import { normalizeReadingGKey } from "./normalize.mjs";

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

export function isReadingGPendingAiEntry(entry) {
  return Boolean(
    entry &&
    (entry.entryType || "word") === "word" &&
    entry.primaryLayer === QUESTION_BANK_PENDING_LAYER_ID &&
    entry.studyMode === "reference" &&
    list(entry.qualityFlags).includes(PENDING_FLAG)
  );
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
  if (!isReadingGPendingAiEntry(pendingEntry)) {
    throw new Error("只允许补全“全题库待补资料”中的单词");
  }

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
  const qualityFlags = unique([
    ...list(pendingEntry.qualityFlags).filter((flag) => flag !== PENDING_FLAG && flag !== PLACEHOLDER_FLAG),
    "master_lexicon_absent",
    "reading_g_ai_completed"
  ]);

  return {
    ...pendingEntry,
    word,
    normalizedKey: normalizeReadingGKey(word),
    phonetic: normalized.phonetic,
    primaryPos: normalized.pos,
    primaryMeaningZh: normalized.meaning,
    meaning: normalized.meaning,
    meaningZh: normalized.meaning,
    definition: normalized.definition,
    example: normalized.example,
    exampleCn: normalized.exampleCn,
    senses: buildSenses(pendingEntry.id, normalized),
    collocations: normalized.collocations,
    phraseCollocations: normalized.phraseCollocations,
    forms: normalized.forms,
    wordFamily: normalized.wordFamily,
    topics: unique([...list(normalized.topics), "G类阅读", "全题库补充3109", "AI已补全"]),
    ieltsUse: unique([...list(normalized.ieltsUse), "Reading"]),
    difficulty: normalized.difficulty,
    category: "IELTS G类 · 全题库AI补全",
    domain: "全题库阅读",
    layers: [QUESTION_BANK_AI_LAYER_ID],
    primaryLayer: QUESTION_BANK_AI_LAYER_ID,
    layerRank: QUESTION_BANK_AI_LAYER_RANK,
    studyMode: "active",
    sourceFiles: unique([
      ...list(pendingEntry.sourceFiles),
      READING_G_AI_COMPLETION_SOURCE
    ]),
    qualityFlags,
    alternateMeanings: list(normalized.synonyms),
    pos: normalized.pos,
    meaningDetailZh: normalized.meaningDetailZh,
    otherMeanings: normalized.otherMeanings,
    phoneticSource: aiSource,
    aiGenerated: true,
    aiContentProfile: normalized.aiContentProfile,
    aiCompletionSource: aiSource,
    aiCompletedAt: generatedAt
  };
}
