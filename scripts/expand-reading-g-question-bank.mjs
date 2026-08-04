/**
 * Expand the G-reading bank with the 3,109 strict headwords that are present in
 * the 5,262 question-bank list but absent from the original G-reading words.
 *
 * Exact master-lexicon matches reuse the complete words.json entry and enter
 * stage 3 as active study items. Words without an exact master headword are
 * retained as stage-4 reference items with an explicit pending-data flag.
 *
 * Direct usage: node scripts/expand-reading-g-question-bank.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeReadingGKey,
  stableReadingGId
} from "../app/lib/reading-g-vocab/normalize.mjs";
import {
  QUESTION_BANK_AI_LAYER_ID,
  QUESTION_BANK_AI_LAYER_RANK,
  READING_G_AI_COMPLETION_SOURCE,
  buildReadingGAiCompletedEntry
} from "../app/lib/reading-g-vocab/ai-completion.mjs";
import {
  READING_G_RETIREMENTS_SOURCE,
  applyReadingGRetirements
} from "../app/lib/reading-g-vocab/retirements.mjs";
import { organizeReadingGMorphology } from "../app/lib/reading-g-vocab/morphology.mjs";
import {
  READING_G_COMPACTION_SOURCE,
  applyReadingGCompaction
} from "../app/lib/reading-g-vocab/compaction.mjs";
import {
  enrichReadingGRelationMeanings,
  sanitizeReadingGRelations
} from "../app/lib/reading-g-vocab/relation-meanings.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.join(__dirname, "..");
const EXPANSION_SOURCE = path.join("scripts", "data", "reading-g-question-bank-3109.json");
const ACTIVE_LAYER_ID = "questionBankActive";
const PENDING_LAYER_ID = "questionBankPending";
const ACTIVE_LAYER_RANK = 10;
const PENDING_LAYER_RANK = 12;
const EXPANSION_FLAG = "question_bank_5262_expansion";
const EXTERNAL_SUPPLEMENT_FLAGS = [
  "grok_full_bank_true_missing_supplement_v1",
  "grok_excel_part1_2_missing_supplement_v1"
];
const EXTERNAL_SUPPLEMENT_LAYERS = [
  "grokFullBankSupplement",
  "grokExcelPart12Supplement"
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value == null ? "" : value).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256Buffer(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function atomicWriteJson(finalPath, data) {
  const tempPath = `${finalPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tempPath, finalPath);
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function relationWord(value) {
  return typeof value === "string"
    ? text(value)
    : text(value?.word || value?.form || value?.value);
}

function uniqueRelations(values) {
  const seen = new Set();
  const result = [];
  for (const value of asArray(values)) {
    const word = relationWord(value);
    const key = normalizeReadingGKey(word);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(clone(value));
  }
  return result;
}

function uniqueText(values) {
  return [...new Set(asArray(values).map(text).filter(Boolean))];
}

function preserveCompactedHistory(existing, refreshed) {
  const mergedAliases = asArray(existing?.mergedAliases);
  const mergedEntries = asArray(existing?.mergedEntries);
  if (!mergedAliases.length && !mergedEntries.length) return refreshed;
  return {
    ...refreshed,
    id: text(existing?.id) || refreshed.id,
    forms: uniqueRelations([...asArray(refreshed?.forms), ...asArray(existing?.forms)]),
    wordFamily: uniqueRelations([
      ...asArray(refreshed?.wordFamily),
      ...asArray(existing?.wordFamily)
    ]),
    mergedAliases: clone(mergedAliases),
    mergedEntries: clone(mergedEntries),
    layers: uniqueText([...asArray(refreshed?.layers), ...asArray(existing?.layers)]),
    topics: uniqueText([...asArray(refreshed?.topics), ...asArray(existing?.topics)]),
    sourceFiles: uniqueText([
      ...asArray(refreshed?.sourceFiles),
      ...asArray(existing?.sourceFiles)
    ]),
    qualityFlags: uniqueText([
      ...asArray(refreshed?.qualityFlags),
      ...asArray(existing?.qualityFlags)
    ]),
    studyMode: existing?.studyMode === "active" ? "active" : refreshed.studyMode,
    layerRank: Math.min(
      Number(refreshed?.layerRank) || 99,
      Number(existing?.layerRank) || 99
    )
  };
}

function readingGMergeKey(item) {
  return `${item?.entryType || "word"}::${normalizeReadingGKey(item?.normalizedKey || item?.word)}`;
}

function isExternalSupplementItem(item) {
  const layers = asArray(item?.layers);
  const flags = asArray(item?.qualityFlags);
  return (
    EXTERNAL_SUPPLEMENT_LAYERS.some((layer) => layers.includes(layer)) ||
    EXTERNAL_SUPPLEMENT_FLAGS.some((flag) => flags.includes(flag))
  );
}

function restoreExternalSupplementItems(items, protectedItems) {
  const restored = [...items];
  const existing = new Set(restored.map(readingGMergeKey));
  let restoredCount = 0;
  for (const item of protectedItems) {
    const key = readingGMergeKey(item);
    if (key.endsWith("::") || existing.has(key)) continue;
    restored.push(clone(item));
    existing.add(key);
    restoredCount += 1;
  }
  return { items: restored, restoredCount };
}

function normalizePos(value) {
  const pos = text(value).toLowerCase().replace(/\.$/, "");
  if (pos === "n" || pos === "noun") return "noun";
  if (pos === "v" || pos === "verb") return "verb";
  if (pos === "adj" || pos === "adjective") return "adjective";
  if (pos === "adv" || pos === "adverb") return "adverb";
  return pos;
}

function extractLabeledMeanings(meaning, primaryPos, fallback) {
  const source = text(meaning);
  const marker = /(^|[；;]|\s+)(prep|pron|conj|adj|adv|n|v)\.?\s*/gi;
  const matches = [...source.matchAll(marker)];
  if (!matches.length) return [fallback];

  const candidates = [];
  const prefix = source.slice(0, matches[0].index).replace(/[；;\s]+$/g, "").trim();
  const firstPos = normalizePos(text(primaryPos).split("/")[0]);
  if (prefix) candidates.push({ ...fallback, pos: firstPos, meaningZh: prefix });
  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index + matches[index][0].length;
    const end = matches[index + 1]?.index ?? source.length;
    const meaningZh = source.slice(start, end).replace(/^[；;\s]+|[；;\s]+$/g, "").trim();
    if (!meaningZh) continue;
    candidates.push({
      ...fallback,
      pos: normalizePos(matches[index][2]),
      meaningZh
    });
  }
  return candidates.length ? candidates : [fallback];
}

function meaningTokens(value) {
  return text(value)
    .split(/[；;，,、/]+/)
    .map((token) => token.replace(/\s+/g, "").toLowerCase())
    .filter(Boolean);
}

function buildSenses(word, master, entryId, primaryMeaning, primaryPos) {
  const primaryCandidate = {
    pos: normalizePos(primaryPos),
    meaningZh: primaryMeaning,
    definition: text(master.definition),
    example: text(master.example),
    exampleZh: text(master.exampleCn || master.exampleZh)
  };
  const candidates = [
    ...extractLabeledMeanings(primaryMeaning, primaryPos, primaryCandidate),
    ...asArray(master.otherMeanings).map((sense) => ({
      pos: normalizePos(sense?.pos),
      meaningZh: text(sense?.meaningZh || sense?.meaning || sense?.chinese),
      definition: text(sense?.definitionEn || sense?.definition),
      example: text(sense?.example),
      exampleZh: text(sense?.exampleCn || sense?.exampleZh)
    }))
  ];
  const seen = new Set();
  const result = [];
  for (const candidate of candidates) {
    if (!candidate.meaningZh) continue;
    const key = `${candidate.pos.toLowerCase()}::${candidate.meaningZh.toLowerCase()}`;
    if (seen.has(key)) continue;
    const tokens = meaningTokens(candidate.meaningZh);
    const containedAt = result.findIndex((existing) => {
      if (existing.pos !== candidate.pos) return false;
      const existingTokens = meaningTokens(existing.meaningZh);
      const existingSet = new Set(existingTokens);
      const candidateSet = new Set(tokens);
      return (
        tokens.every((token) => existingSet.has(token)) ||
        existingTokens.every((token) => candidateSet.has(token))
      );
    });
    if (containedAt >= 0) {
      if (tokens.length > meaningTokens(result[containedAt].meaningZh).length) {
        result[containedAt].meaningZh = candidate.meaningZh;
      }
      continue;
    }
    seen.add(key);
    result.push({
      senseId: `${entryId}_${candidate.pos || "x"}_${String(result.length + 1).padStart(2, "0")}`
        .replace(/[^a-zA-Z0-9_]+/g, "_"),
      pos: normalizePos(candidate.pos),
      meaningZh: candidate.meaningZh,
      definition: candidate.definition,
      example: candidate.example,
      exampleZh: candidate.exampleZh,
      sourceFiles: ["public/data/words.json"]
    });
  }
  return result;
}

function buildMasterBackedEntry(word, master) {
  const normalizedKey = normalizeReadingGKey(word);
  const id = stableReadingGId("word", normalizedKey);
  const primaryMeaningZh = text(
    master.meaning || master.meaningZh || master.meaningDetailedZh || master.definition
  );
  const primaryPos = text(master.pos);
  const topics = uniqueText([
    ...asArray(master.topics),
    "G类阅读",
    "全题库补充3109"
  ]);
  const ieltsUse = uniqueText([...asArray(master.ieltsUse), "Reading"]);
  const qualityFlags = uniqueText([
    ...asArray(master.qualityFlags),
    EXPANSION_FLAG,
    "master_lexicon_reused"
  ]);

  return {
    id,
    entryType: "word",
    word,
    normalizedKey,
    phonetic: text(master.phonetic || master.ipa),
    primaryPos,
    primaryMeaningZh,
    meaning: primaryMeaningZh,
    definition: text(master.definition || primaryMeaningZh),
    example: text(master.example),
    exampleCn: text(master.exampleCn || master.exampleZh),
    senses: buildSenses(word, master, id, primaryMeaningZh, primaryPos),
    collocations: clone(asArray(master.collocations)),
    phraseCollocations: clone(asArray(master.phraseCollocations)),
    forms: uniqueRelations(master.forms),
    wordFamily: uniqueRelations(master.wordFamily),
    topics,
    ieltsUse,
    difficulty: text(master.difficulty || "中级核心"),
    category: "IELTS G类 · 全题库补充",
    domain: text(master.domain || "全题库阅读"),
    layers: [ACTIVE_LAYER_ID],
    primaryLayer: ACTIVE_LAYER_ID,
    layerRank: ACTIVE_LAYER_RANK,
    phraseStudyStage: 0,
    studyMode: "active",
    sourceFiles: [EXPANSION_SOURCE.replace(/\\/g, "/"), "public/data/words.json"],
    qualityFlags,
    alternateMeanings: [],
    pos: primaryPos,
    meaningZh: primaryMeaningZh,
    sourceWordId: text(master.wordId || master.id),
    phoneticSource: text(master.pronunciationSource || master.phoneticSource || "words.json"),
    meaningDetailZh: text(master.meaningDetailZh || master.meaningDetailedZh),
    otherMeanings: clone(asArray(master.otherMeanings)),
    audio: text(master.audio),
    exampleAudio: text(master.exampleAudio)
  };
}

function buildPendingEntry(word) {
  const normalizedKey = normalizeReadingGKey(word);
  const id = stableReadingGId("word", normalizedKey);
  const placeholder = "全题库阅读词汇（总词库待补）";
  return {
    id,
    entryType: "word",
    word,
    normalizedKey,
    phonetic: "",
    primaryPos: "",
    primaryMeaningZh: placeholder,
    meaning: placeholder,
    definition: placeholder,
    example: "",
    exampleCn: "",
    senses: [
      {
        senseId: `${id}_placeholder_01`,
        pos: "",
        meaningZh: placeholder,
        definition: "",
        example: "",
        exampleZh: "",
        sourceFiles: [EXPANSION_SOURCE.replace(/\\/g, "/")]
      }
    ],
    collocations: [],
    phraseCollocations: [],
    forms: [],
    wordFamily: [],
    topics: ["G类阅读", "全题库补充3109", "总词库待补资料"],
    ieltsUse: ["Reading"],
    difficulty: "待补充",
    category: "IELTS G类 · 全题库补充",
    domain: "全题库阅读",
    layers: [PENDING_LAYER_ID],
    primaryLayer: PENDING_LAYER_ID,
    layerRank: PENDING_LAYER_RANK,
    phraseStudyStage: 0,
    studyMode: "reference",
    sourceFiles: [EXPANSION_SOURCE.replace(/\\/g, "/")],
    qualityFlags: [EXPANSION_FLAG, "missing_master_lexicon", "missing_meaning_filled_placeholder"],
    alternateMeanings: [],
    pos: "",
    meaningZh: placeholder,
    phoneticSource: ""
  };
}

function loadConsistentMasterLexicon(root) {
  const publicPath = path.join(root, "public", "data", "words.json");
  const cachePath = path.join(root, ".static-export-cache", "words.json");
  if (!fs.existsSync(publicPath) || !fs.existsSync(cachePath)) {
    throw new Error("总词库正式来源不完整：需要 public/data/words.json 与 .static-export-cache/words.json");
  }
  const publicData = readJson(publicPath);
  const cacheData = readJson(cachePath);
  const publicWords = asArray(publicData.words);
  const cacheWords = asArray(cacheData.words);
  const publicContentHash = sha256Buffer(JSON.stringify(publicWords));
  const cacheContentHash = sha256Buffer(JSON.stringify(cacheWords));
  if (
    publicWords.length !== cacheWords.length ||
    publicContentHash !== cacheContentHash ||
    (publicData.lexiconHash && cacheData.lexiconHash && publicData.lexiconHash !== cacheData.lexiconHash)
  ) {
    throw new Error("总词库正式来源不一致，已停止写入G类词库");
  }
  const byKey = new Map();
  for (const entry of publicWords) {
    const key = normalizeReadingGKey(entry?.word);
    if (!key) continue;
    if (byKey.has(key)) throw new Error(`总词库存在重复主词：${key}`);
    byKey.set(key, entry);
  }
  return {
    byKey,
    count: publicWords.length,
    lexiconHash: publicData.lexiconHash || publicContentHash,
    publicPath,
    cachePath
  };
}

function validateExpandedPayload(
  vocab,
  sourceWords,
  retiredKeys = new Set(),
  compactedKeys = new Set()
) {
  const items = asArray(vocab.items);
  const ids = new Set();
  const keys = new Set();
  for (const item of items) {
    if (!item?.id || ids.has(item.id)) throw new Error(`G类词库ID缺失或重复：${item?.id || "(empty)"}`);
    ids.add(item.id);
    const key = `${item.entryType || "word"}::${normalizeReadingGKey(item.normalizedKey || item.word)}`;
    if (keys.has(key)) throw new Error(`G类词库主词重复：${key}`);
    keys.add(key);
    if (!text(item.primaryMeaningZh || item.meaning)) throw new Error(`G类词条缺少释义：${item.word}`);
  }
  for (const word of sourceWords) {
    const key = `word::${normalizeReadingGKey(word)}`;
    if (retiredKeys.has(key)) continue;
    if (!keys.has(key) && !compactedKeys.has(normalizeReadingGKey(word))) {
      throw new Error(`3109扩展词未写入：${word}`);
    }
  }
}

export function applyReadingGQuestionBankExpansion({
  vocab,
  report,
  projectRoot = DEFAULT_ROOT,
  compactionPayloadOverride = null
} = {}) {
  if (!vocab || !Array.isArray(vocab.items)) throw new Error("G类词库载荷无效");
  const protectedExternalSupplementItems = vocab.items.filter(isExternalSupplementItem).map(clone);
  const compactionPath = path.join(projectRoot, READING_G_COMPACTION_SOURCE);
  const compactionPayload = compactionPayloadOverride || (
    fs.existsSync(compactionPath)
      ? readJson(compactionPath)
      : { rules: [] }
  );
  const configuredCompactionAliasKeys = new Set(
    asArray(compactionPayload?.rules).flatMap((rule) => (
      asArray(rule?.aliases)
        .map((alias) => normalizeReadingGKey(alias?.key || alias?.word))
        .filter(Boolean)
    ))
  );
  const sourcePath = path.join(projectRoot, EXPANSION_SOURCE);
  const source = readJson(sourcePath);
  const sourceWords = asArray(source.words).map(normalizeReadingGKey).filter(Boolean);
  if (source.count !== 3109 || sourceWords.length !== 3109 || new Set(sourceWords).size !== 3109) {
    throw new Error("3109扩展源数量或唯一性校验失败");
  }

  const master = loadConsistentMasterLexicon(projectRoot);
  const aiCompletionPath = path.join(projectRoot, READING_G_AI_COMPLETION_SOURCE);
  const aiCompletionPayload = fs.existsSync(aiCompletionPath)
    ? readJson(aiCompletionPath)
    : { entries: {} };
  const aiCompletions = aiCompletionPayload?.entries && typeof aiCompletionPayload.entries === "object"
    ? aiCompletionPayload.entries
    : {};
  const existingIndex = new Map();
  vocab.items.forEach((item, index) => {
    if ((item.entryType || "word") !== "word") return;
    existingIndex.set(normalizeReadingGKey(item.normalizedKey || item.word), index);
  });

  const masterMissingWords = [];
  let masterMatchedCount = 0;
  let addedCount = 0;
  let refreshedCount = 0;
  let alreadyInCoreCount = 0;
  const skippedConfiguredSourceAliases = new Set();

  for (const word of sourceWords) {
    const masterEntry = master.byKey.get(word);
    const completionRecord = aiCompletions[word];
    const pendingEntry = !masterEntry ? buildPendingEntry(word) : null;
    let next;
    if (masterEntry) {
      next = buildMasterBackedEntry(word, masterEntry);
    } else if (completionRecord) {
      next = buildReadingGAiCompletedEntry(
        pendingEntry,
        completionRecord.profile || completionRecord,
        {
          aiSource: completionRecord.source,
          generatedAt: completionRecord.completedAt
        }
      );
    } else {
      next = pendingEntry;
    }
    if (masterEntry) masterMatchedCount += 1;
    else masterMissingWords.push(word);

    const existingAt = existingIndex.get(word);
    if (existingAt == null) {
      // A compacted source form is represented by its canonical entry. Do not
      // rematerialize it as a fresh pending word on every rebuild; doing so
      // would leak the pending layer back onto the canonical after compaction.
      if (configuredCompactionAliasKeys.has(word)) {
        skippedConfiguredSourceAliases.add(word);
        continue;
      }
      existingIndex.set(word, vocab.items.length);
      vocab.items.push(next);
      addedCount += 1;
      continue;
    }
    const existing = vocab.items[existingAt];
    if (isExternalSupplementItem(existing)) {
      alreadyInCoreCount += 1;
      continue;
    }
    const isPriorExpansion = asArray(existing.qualityFlags).includes(EXPANSION_FLAG);
    if (isPriorExpansion) {
      vocab.items[existingAt] = preserveCompactedHistory(existing, next);
      refreshedCount += 1;
    } else {
      alreadyInCoreCount += 1;
    }
  }

  const retirementPath = path.join(projectRoot, READING_G_RETIREMENTS_SOURCE);
  const retirementPayload = fs.existsSync(retirementPath)
    ? readJson(retirementPath)
    : { entries: [] };
  const retirementResult = applyReadingGRetirements(vocab.items, retirementPayload);
  const morphologyResult = organizeReadingGMorphology(retirementResult.items, master.byKey);
  const compactionResult = applyReadingGCompaction(morphologyResult.items, compactionPayload);
  const relationAuditResult = sanitizeReadingGRelations(compactionResult.items, master.byKey);
  const relationMeaningResult = enrichReadingGRelationMeanings(
    relationAuditResult.items,
    master.byKey
  );
  const restoredSupplementResult = restoreExternalSupplementItems(
    relationMeaningResult.items,
    protectedExternalSupplementItems
  );
  // External supplements are restored verbatim so their teaching data is not
  // lost, but a restored item may itself be an explicitly compacted alias.
  // Reapply the same plan after restoration so those aliases do not reappear
  // as independent flashcards on every question-bank rebuild.
  const restoredCompactionResult = applyReadingGCompaction(
    restoredSupplementResult.items,
    compactionPayload
  );
  vocab.items = restoredCompactionResult.items;
  const items = vocab.items;
  const visibleWordKeys = new Set(
    items
      .filter((item) => (item.entryType || "word") === "word")
      .map((item) => normalizeReadingGKey(item.normalizedKey || item.word))
  );
  const compactedKeys = new Set([
    ...compactionResult.representedKeys,
    ...restoredCompactionResult.representedKeys,
    ...compactionResult.suppressedKeys,
    ...restoredCompactionResult.suppressedKeys,
    ...skippedConfiguredSourceAliases
  ]);
  const sourceWordStatus = sourceWords.map((word) => {
    const retirementKey = `word::${word}`;
    if (retirementResult.retiredKeys.has(retirementKey)) return "retired";
    if (visibleWordKeys.has(word)) return "visible";
    if (
      compactionResult.representedKeys.has(word)
      || restoredCompactionResult.representedKeys.has(word)
    ) return "compacted";
    if (
      compactionResult.suppressedKeys.has(word)
      || restoredCompactionResult.suppressedKeys.has(word)
      || skippedConfiguredSourceAliases.has(word)
    ) return "suppressed";
    return "missing";
  });
  const visibleSourceHeadwordCount = sourceWordStatus.filter((status) => status === "visible").length;
  const compactedSourceHeadwordCount = sourceWordStatus.filter((status) => status === "compacted").length;
  const suppressedSourceHeadwordCount = sourceWordStatus.filter((status) => status === "suppressed").length;
  const retiredSourceHeadwordCount = sourceWordStatus.filter((status) => status === "retired").length;
  const missingSourceHeadwordCount = sourceWordStatus.filter((status) => status === "missing").length;
  if (missingSourceHeadwordCount) {
    throw new Error(`G类题库合并后仍缺少 ${missingSourceHeadwordCount} 个来源词`);
  }
  const activeExpansionCount = items.filter((item) => (
    !isExternalSupplementItem(item)
    &&
    asArray(item.qualityFlags).includes(EXPANSION_FLAG)
    && (
      asArray(item.layers).includes(ACTIVE_LAYER_ID)
      || asArray(item.layers).includes(QUESTION_BANK_AI_LAYER_ID)
    )
  )).length;
  const pendingLayerCount = items.filter(
    (item) => asArray(item.layers).includes(PENDING_LAYER_ID)
  ).length;
  const pendingIndependentCount = items.filter(
    (item) => item.primaryLayer === PENDING_LAYER_ID
      && item.studyMode === "reference"
      && asArray(item.qualityFlags).includes("missing_master_lexicon")
  ).length;
  const visibleMasterMatchedCount = items.filter(
    (item) => !isExternalSupplementItem(item)
      && asArray(item.layers).includes(ACTIVE_LAYER_ID)
      && asArray(item.qualityFlags).includes(EXPANSION_FLAG)
  ).length;
  const visibleAiCompletedCount = items.filter(
    (item) => !isExternalSupplementItem(item)
      && asArray(item.layers).includes(QUESTION_BANK_AI_LAYER_ID)
      && asArray(item.qualityFlags).includes(EXPANSION_FLAG)
  ).length;
  const wordCount = items.filter((item) => (item.entryType || "word") === "word").length;
  const phraseCount = items.filter((item) => item.entryType === "phrase").length;
  const activeCount = items.filter((item) => item.studyMode === "active").length;
  const referenceCount = items.filter((item) => item.studyMode === "reference").length;
  const multiSenseCount = items.filter((item) => asArray(item.senses).length > 1).length;

  vocab.count = items.length;
  vocab.wordCount = wordCount;
  vocab.phraseCount = phraseCount;
  vocab.activeCount = activeCount;
  vocab.referenceCount = referenceCount;
  vocab.multiSenseCount = multiSenseCount;
  vocab.layerStats = vocab.layerStats || {};
  vocab.layerStats[ACTIVE_LAYER_ID] = {
    name: "全题库补充（已有资料）",
    rawCount: visibleMasterMatchedCount,
    uniqueKeysInLayer: visibleMasterMatchedCount,
    skippedEmpty: 0,
    mode: "active",
    rank: ACTIVE_LAYER_RANK,
    primaryNewCount: visibleMasterMatchedCount,
    filterCount: items.filter((item) => asArray(item.layers).includes(ACTIVE_LAYER_ID)).length
  };
  vocab.layerStats[QUESTION_BANK_AI_LAYER_ID] = {
    name: "全题库补充（AI已补全）",
    rawCount: visibleAiCompletedCount,
    uniqueKeysInLayer: visibleAiCompletedCount,
    skippedEmpty: 0,
    mode: "active",
    rank: QUESTION_BANK_AI_LAYER_RANK,
    primaryNewCount: visibleAiCompletedCount,
    filterCount: items.filter((item) => asArray(item.layers).includes(QUESTION_BANK_AI_LAYER_ID)).length
  };
  vocab.layerStats[PENDING_LAYER_ID] = {
    name: "全题库待补资料",
    rawCount: pendingLayerCount,
    uniqueKeysInLayer: pendingLayerCount,
    skippedEmpty: 0,
    mode: "reference",
    rank: PENDING_LAYER_RANK,
    primaryNewCount: pendingIndependentCount,
    actionableCount: pendingIndependentCount,
    filterCount: pendingLayerCount
  };
  const expandedAt = new Date().toISOString();
  vocab.expandedAt = expandedAt;
  vocab.questionBankExpansion = {
    version: text(source.datasetVersion || "reading-g-question-bank-expansion-v1"),
    source: EXPANSION_SOURCE.replace(/\\/g, "/"),
    targetCount: sourceWords.length,
    masterLexiconCount: master.count,
    masterLexiconHash: master.lexiconHash,
    masterMatchedCount,
    masterMissingCount: masterMissingWords.length,
    aiCompletedCount: visibleAiCompletedCount,
    pendingCount: pendingIndependentCount,
    pendingIndependentCount,
    pendingLayerCount,
    retiredCount: retirementResult.retirements.length,
    retiredSourceHeadwordCount,
    compactedSourceHeadwordCount,
    suppressedSourceHeadwordCount,
    effectiveTargetCount: visibleSourceHeadwordCount,
    representedTargetCount: visibleSourceHeadwordCount + compactedSourceHeadwordCount,
    activeCount: activeExpansionCount,
    referenceCount: pendingIndependentCount,
    addedCount,
    refreshedCount,
    alreadyInCoreCount
  };
  vocab.morphologyEnrichment = {
    version: "reading-g-master-morphology-v1",
    source: "public/data/words.json",
    masterLexiconHash: master.lexiconHash,
    updatedAt: expandedAt,
    ...morphologyResult.stats
  };
  vocab.wordFamilyCompaction = {
    version: text(compactionPayload.version || "disabled"),
    source: READING_G_COMPACTION_SOURCE,
    updatedAt: expandedAt,
    sourceWordCount: morphologyResult.stats.wordEntries,
    resultingWordCount: wordCount,
    ...compactionResult.stats
  };
  vocab.relationMeaningEnrichment = {
    version: "reading-g-relation-meanings-v1",
    updatedAt: expandedAt,
    ...relationMeaningResult.stats
  };
  vocab.relationAudit = {
    version: "reading-g-relation-audit-v1",
    updatedAt: expandedAt,
    ...relationAuditResult.stats
  };
  const noteSuffix = "全题库补充3109：总词库命中词和AI已补全词进入阶段3，仍缺资料的词进入阶段4参考查阅。";
  if (!text(vocab.note).includes("全题库补充3109")) {
    vocab.note = `${text(vocab.note)} ${noteSuffix}`.trim();
  }

  if (report && typeof report === "object") {
    report.sourceFiles = report.sourceFiles || {};
    report.sourceFiles[EXPANSION_SOURCE.replace(/\\/g, "/")] = {
      bytes: fs.statSync(sourcePath).size,
      sha256: sha256File(sourcePath),
      rawCount: sourceWords.length,
      role: "question_bank_expansion",
      layerIds: [ACTIVE_LAYER_ID, QUESTION_BANK_AI_LAYER_ID, PENDING_LAYER_ID]
    };
    if (fs.existsSync(aiCompletionPath)) {
      report.sourceFiles[READING_G_AI_COMPLETION_SOURCE] = {
        bytes: fs.statSync(aiCompletionPath).size,
        sha256: sha256File(aiCompletionPath),
        rawCount: Object.keys(aiCompletions).length,
        role: "reading_g_ai_completions",
        layerIds: [QUESTION_BANK_AI_LAYER_ID]
      };
    }
    if (fs.existsSync(retirementPath)) {
      report.sourceFiles[READING_G_RETIREMENTS_SOURCE] = {
        bytes: fs.statSync(retirementPath).size,
        sha256: sha256File(retirementPath),
        rawCount: retirementResult.retirements.length,
        role: "reading_g_retirements",
        removedCount: retirementResult.removed.length
      };
    }
    if (fs.existsSync(compactionPath)) {
      report.sourceFiles[READING_G_COMPACTION_SOURCE] = {
        bytes: fs.statSync(compactionPath).size,
        sha256: sha256File(compactionPath),
        rawCount: asArray(compactionPayload.rules).length,
        role: "reading_g_internal_word_family_compaction",
        removedIndependentWordCount: compactionResult.stats.removedIndependentWordCount
      };
    }
    report.layerStats = vocab.layerStats;
    report.questionBankExpansion = clone(vocab.questionBankExpansion);
    report.morphologyEnrichment = clone(vocab.morphologyEnrichment);
    report.wordFamilyCompaction = clone(vocab.wordFamilyCompaction);
    report.relationMeaningEnrichment = clone(vocab.relationMeaningEnrichment);
    report.relationAudit = clone(vocab.relationAudit);
    report.summary = {
      ...(report.summary || {}),
      itemCount: items.length,
      wordCount,
      phraseCount,
      activeCount,
      referenceOnlyCount: referenceCount,
      multiSenseCount,
      emptyWord: items.filter((item) => !text(item.word)).length,
      emptyMeaning: items.filter((item) => !text(item.primaryMeaningZh || item.meaning)).length
    };
  }

  validateExpandedPayload(vocab, sourceWords, retirementResult.retiredKeys, compactedKeys);
  return {
    targetCount: sourceWords.length,
    masterMatchedCount,
    masterMissingCount: masterMissingWords.length,
    aiCompletedCount: visibleAiCompletedCount,
    activeExpansionCount,
    pendingExpansionCount: pendingIndependentCount,
    pendingLayerCount,
    retiredCount: retirementResult.retirements.length,
    effectiveTargetCount: visibleSourceHeadwordCount,
    representedTargetCount: visibleSourceHeadwordCount + compactedSourceHeadwordCount,
    addedCount,
    refreshedCount,
    alreadyInCoreCount,
    morphology: morphologyResult.stats,
    compaction: compactionResult.stats,
    relationMeanings: relationMeaningResult.stats,
    relationAudit: relationAuditResult.stats,
    externalSupplementsRestored: restoredSupplementResult.restoredCount,
    externalSupplementsRecompacted: restoredCompactionResult.stats.removedIndependentWordCount,
    masterMissingWords
  };
}

export function runReadingGQuestionBankExpansion({ projectRoot = DEFAULT_ROOT } = {}) {
  const vocabPath = path.join(projectRoot, "public", "data", "reading-g-vocab.json");
  const reportPath = path.join(projectRoot, "public", "data", "reading-g-import-report.json");
  const vocab = readJson(vocabPath);
  const report = fs.existsSync(reportPath) ? readJson(reportPath) : {};
  const result = applyReadingGQuestionBankExpansion({ vocab, report, projectRoot });
  atomicWriteJson(vocabPath, vocab);
  atomicWriteJson(reportPath, report);
  return { vocabPath, reportPath, result, vocab };
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    const { vocabPath, reportPath, result, vocab } = runReadingGQuestionBankExpansion();
    console.log(JSON.stringify({ ok: true, vocabPath, reportPath, result, totals: {
      count: vocab.count,
      wordCount: vocab.wordCount,
      phraseCount: vocab.phraseCount,
      activeCount: vocab.activeCount,
      referenceCount: vocab.referenceCount
    } }, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
