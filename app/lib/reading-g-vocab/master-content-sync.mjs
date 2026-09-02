import { normalizeReadingGKey } from "./normalize.mjs";
import { isReadingGPlaceholderContent } from "./content-completeness.mjs";

const MASTER_FILL_SCALARS = Object.freeze([
  "phonetic",
  "pos",
  "meaning",
  "definition",
  "meaningDetailZh"
]);

const MASTER_FILL_LISTS = Object.freeze([
  "forms",
  "wordFamily",
  "synonyms",
  "synonymDetails",
  "collocations",
  "phraseCollocations"
]);

const MASTER_ADDITION_LISTS = Object.freeze([
  ...MASTER_FILL_LISTS,
  "otherMeanings",
  "senses",
  "meaningsZh"
]);

function text(value) {
  return String(value == null ? "" : value).trim();
}

const MASTER_DIFFICULTIES = new Set([
  "基础高频",
  "中级核心",
  "高级加分",
  "阅读扩展",
  "低频认识即可"
]);

function normalizeMasterDifficulty(value) {
  const raw = text(value);
  if (MASTER_DIFFICULTIES.has(raw)) return raw;
  if (raw === "阅读逻辑核心") return "阅读扩展";
  return "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function hasChinese(value) {
  return /[\u3400-\u9fff]/u.test(text(value));
}

function hasEnglish(value) {
  return /[A-Za-z]/u.test(text(value));
}

function hasUsablePos(value) {
  return Boolean(
    text(value)
    && !/^(?:word|phrase|pos|词性|unknown|n\/?a|待补)$/iu.test(text(value))
  );
}

function entryId(entry) {
  return text(entry?.wordId || entry?.id);
}

function validExamplePair(entry) {
  const example = text(entry?.example);
  const exampleCn = text(entry?.exampleCn || entry?.exampleZh);
  return example && exampleCn ? { example, exampleCn } : null;
}

function hasDefinedOtherMeanings(value) {
  const rows = list(value);
  return rows.length > 0 && rows.every((sense) => (
    hasUsablePos(sense?.pos)
    && hasChinese(sense?.meaningZh || sense?.meaning)
    && hasEnglish(sense?.definitionEn || sense?.definition)
  ));
}

function usableSenses(value) {
  return list(value).filter((sense) => ![
    sense?.meaningZh,
    sense?.meaning,
    sense?.definition
  ].some(isReadingGPlaceholderContent));
}

function isAiCompletedGEntry(entry) {
  return Boolean(
    entry
    && (entry.entryType || "word") === "word"
    && entry.studyMode !== "reference"
    && list(entry.qualityFlags).includes("reading_g_ai_completed")
  );
}

function copyFilledField(next, master, source, field, validSource = (value) => Boolean(text(value))) {
  if (text(master?.[field]) || !validSource(source?.[field])) return false;
  next[field] = source[field];
  return true;
}

function mergeExamplePair(next, master, source) {
  const sourcePair = validExamplePair(source);
  if (!sourcePair) return [];
  const masterExample = text(master?.example);
  const masterExampleCn = text(master?.exampleCn || master?.exampleZh);

  if (!masterExample && !masterExampleCn) {
    next.example = sourcePair.example;
    next.exampleCn = sourcePair.exampleCn;
    return ["example", "exampleCn"];
  }
  if (!masterExample && masterExampleCn === sourcePair.exampleCn) {
    next.example = sourcePair.example;
    return ["example"];
  }
  if (!masterExampleCn && masterExample === sourcePair.example) {
    next.exampleCn = sourcePair.exampleCn;
    return ["exampleCn"];
  }
  return [];
}

function mergeOneMasterEntry(master, source) {
  const next = { ...master };
  const fields = [];
  for (const field of MASTER_FILL_SCALARS) {
    const valid = field === "meaning" || field === "meaningDetailZh"
      ? hasChinese
      : field === "definition"
        ? hasEnglish
        : field === "pos"
          ? hasUsablePos
          : (value) => Boolean(text(value));
    if (copyFilledField(next, master, source, field, valid)) fields.push(field);
  }
  if (!text(master?.difficulty)) {
    const difficulty = normalizeMasterDifficulty(source?.difficulty);
    if (difficulty) {
      next.difficulty = difficulty;
      fields.push("difficulty");
    }
  }
  fields.push(...mergeExamplePair(next, master, source));

  for (const field of MASTER_FILL_LISTS) {
    if (!list(master?.[field]).length && list(source?.[field]).length) {
      next[field] = source[field];
      fields.push(field);
    }
  }
  if (!list(master?.otherMeanings).length && hasDefinedOtherMeanings(source?.otherMeanings)) {
    next.otherMeanings = source.otherMeanings;
    fields.push("otherMeanings");
  }
  const masterSenses = list(master?.senses);
  const cleanedMasterSenses = usableSenses(masterSenses);
  if (cleanedMasterSenses.length !== masterSenses.length) {
    const replacementSenses = cleanedMasterSenses.length
      ? cleanedMasterSenses
      : usableSenses(source?.senses);
    if (replacementSenses.length) next.senses = replacementSenses;
    else delete next.senses;
    fields.push("senses");
  }
  return { entry: next, fields };
}

function sameIdentity(a, b) {
  return entryId(a) === entryId(b)
    && text(a?.word) === text(b?.word)
    && text(a?.wordId) === text(b?.wordId);
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function retiredIdentitySets(entries = []) {
  return {
    ids: new Set(list(entries).map(entryId).filter(Boolean)),
    words: new Set(list(entries).map((entry) => normalizeReadingGKey(entry?.word)).filter(Boolean))
  };
}

function nextAddedMasterId(source, usedIds) {
  const preferred = text(source?.sourceWordId);
  if (preferred && !usedIds.has(preferred)) {
    usedIds.add(preferred);
    return preferred;
  }
  const base = `word_reading_g_${stableHash(normalizeReadingGKey(source?.word))}`;
  let candidate = base;
  let suffix = 1;
  while (usedIds.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function buildAddedMasterEntry(source, usedIds, now) {
  const id = nextAddedMasterId(source, usedIds);
  const entry = {
    id,
    wordId: id,
    word: text(source?.word),
    entryType: "headword",
    source: "reading-g-ai",
    supplemental: false,
    addedFromReadingG: true,
    sourceReadingGId: text(source?.id),
    addedAt: now
  };
  for (const field of MASTER_FILL_SCALARS) {
    if (text(source?.[field])) entry[field] = source[field];
  }
  const difficulty = normalizeMasterDifficulty(source?.difficulty);
  if (difficulty) entry.difficulty = difficulty;
  const examplePair = validExamplePair(source);
  if (examplePair) Object.assign(entry, examplePair);
  for (const field of MASTER_ADDITION_LISTS) {
    const values = field === "senses" ? usableSenses(source?.[field]) : list(source?.[field]);
    if (values.length) entry[field] = values;
  }
  for (const field of ["formsReviewed", "wordFamilyReviewed", "synonymsReviewed"]) {
    if (source?.[field] === true) entry[field] = true;
  }
  return entry;
}

/**
 * Safely copy only missing learning-content fields from AI-completed G entries
 * into existing master entries, and append a complete headword when no master
 * entry exists. Existing fields, order, identities and user state are preserved.
 */
export function buildReadingGAiMasterSyncPlan(masterPayload, readingGEntries, options = {}) {
  const masterWords = list(masterPayload?.words);
  if (!masterWords.length || masterWords.length !== Number(masterPayload?.count)) {
    throw new Error("主词库 words/count 不一致，已停止同步。");
  }

  const retired = retiredIdentitySets(options.retiredEntries);
  const usedIds = new Set(masterWords.map(entryId).filter(Boolean));
  const now = text(options.now) || new Date().toISOString();

  const byId = new Map();
  const byWord = new Map();
  for (const entry of masterWords) {
    const id = entryId(entry);
    const wordKey = normalizeReadingGKey(entry?.word);
    if (id) byId.set(id, entry);
    if (wordKey) byWord.set(wordKey, [...(byWord.get(wordKey) || []), entry]);
  }

  const report = {
    candidates: 0,
    matchedBySourceWordId: 0,
    matchedByUniqueHeadword: 0,
    unmatched: [],
    ambiguous: [],
    identityConflicts: [],
    retired: [],
    updatedEntries: [],
    addedEntries: [],
    fieldCounts: {}
  };
  const replacements = new Map();
  const additions = [];

  for (const source of list(readingGEntries).filter(isAiCompletedGEntry)) {
    report.candidates += 1;
    const sourceKey = normalizeReadingGKey(source.word);
    const sourceWordId = text(source.sourceWordId);
    let master = null;
    let matchType = "";

    if (sourceWordId && byId.has(sourceWordId)) {
      const candidate = byId.get(sourceWordId);
      if (normalizeReadingGKey(candidate.word) !== sourceKey) {
        report.identityConflicts.push({ word: source.word, sourceWordId, masterWord: candidate.word });
        continue;
      }
      master = candidate;
      matchType = "sourceWordId";
    } else {
      const candidates = byWord.get(sourceKey) || [];
      if (candidates.length === 1) {
        master = candidates[0];
        matchType = "headword";
      } else if (candidates.length > 1) {
        report.ambiguous.push({ word: source.word, count: candidates.length });
        continue;
      } else {
        if (retired.ids.has(sourceWordId) || retired.words.has(sourceKey)) {
          report.retired.push({ word: source.word, sourceWordId });
          continue;
        }
        const addition = buildAddedMasterEntry(source, usedIds, now);
        additions.push(addition);
        byId.set(entryId(addition), addition);
        byWord.set(sourceKey, [addition]);
        report.addedEntries.push({
          id: entryId(addition),
          word: addition.word,
          sourceReadingGId: addition.sourceReadingGId
        });
        continue;
      }
    }

    if (matchType === "sourceWordId") report.matchedBySourceWordId += 1;
    else report.matchedByUniqueHeadword += 1;
    const currentMaster = replacements.get(entryId(master)) || master;
    const merged = mergeOneMasterEntry(currentMaster, source);
    if (!merged.fields.length) continue;
    replacements.set(entryId(master), merged.entry);
    report.updatedEntries.push({
      id: entryId(master),
      word: master.word,
      matchedBy: matchType,
      fields: merged.fields
    });
    for (const field of merged.fields) {
      report.fieldCounts[field] = (report.fieldCounts[field] || 0) + 1;
    }
  }

  const nextWords = [
    ...masterWords.map((entry) => replacements.get(entryId(entry)) || entry),
    ...additions.map((entry) => replacements.get(entryId(entry)) || entry)
  ];
  if (masterWords.some((entry, index) => !sameIdentity(nextWords[index], entry))) {
    throw new Error("同步尝试改变已有主词库顺序、词头或稳定 ID，已停止写入。");
  }

  return {
    nextWords,
    changed: report.updatedEntries.length > 0 || report.addedEntries.length > 0,
    report: {
      ...report,
      unmatchedCount: report.unmatched.length,
      ambiguousCount: report.ambiguous.length,
      identityConflictCount: report.identityConflicts.length,
      retiredCount: report.retired.length,
      updatedCount: report.updatedEntries.length,
      addedCount: report.addedEntries.length,
      changedCount: report.updatedEntries.length + report.addedEntries.length,
      stableIdsChanged: 0
    }
  };
}

/**
 * Delete exact G headwords from the master lexicon. Phrases and grammatical
 * reference rows never cascade to a different lemma merely through sourceWordId.
 */
export function buildReadingGMasterDeletionPlan(masterPayload, readingGEntries) {
  const masterWords = list(masterPayload?.words);
  if (!masterWords.length || masterWords.length !== Number(masterPayload?.count)) {
    throw new Error("主词库 words/count 不一致，已停止联动删除。");
  }

  const byId = new Map(masterWords.map((entry) => [entryId(entry), entry]).filter(([id]) => id));
  const byWord = new Map();
  for (const entry of masterWords) {
    const key = normalizeReadingGKey(entry?.word);
    if (key) byWord.set(key, [...(byWord.get(key) || []), entry]);
  }

  const deletedIds = new Set();
  const report = {
    candidates: 0,
    deletedEntries: [],
    phrasesSkipped: [],
    referenceConflicts: [],
    unmatched: [],
    ambiguous: []
  };

  for (const source of list(readingGEntries)) {
    if ((source?.entryType || "word") === "phrase") {
      report.phrasesSkipped.push(text(source?.word));
      continue;
    }
    report.candidates += 1;
    const sourceKey = normalizeReadingGKey(source?.word);
    const sourceWordId = text(source?.sourceWordId);
    let master = null;

    if (sourceWordId && byId.has(sourceWordId)) {
      const candidate = byId.get(sourceWordId);
      if (normalizeReadingGKey(candidate?.word) === sourceKey) {
        master = candidate;
      } else {
        report.referenceConflicts.push({
          word: text(source?.word),
          sourceWordId,
          masterWord: text(candidate?.word)
        });
        continue;
      }
    } else {
      const candidates = (byWord.get(sourceKey) || []).filter((entry) => !deletedIds.has(entryId(entry)));
      if (candidates.length === 1) master = candidates[0];
      else if (candidates.length > 1) {
        report.ambiguous.push({ word: text(source?.word), count: candidates.length });
        continue;
      }
    }

    const id = entryId(master || {});
    if (!id) {
      report.unmatched.push(text(source?.word));
      continue;
    }
    if (deletedIds.has(id)) continue;
    deletedIds.add(id);
    report.deletedEntries.push({
      id,
      word: text(master?.word),
      sourceReadingGId: text(source?.id)
    });
  }

  return {
    nextWords: masterWords.filter((entry) => !deletedIds.has(entryId(entry))),
    changed: deletedIds.size > 0,
    report: {
      ...report,
      deletedCount: deletedIds.size,
      unmatchedCount: report.unmatched.length,
      ambiguousCount: report.ambiguous.length,
      referenceConflictCount: report.referenceConflicts.length,
      phraseSkippedCount: report.phrasesSkipped.length,
      stableIdsChanged: 0
    }
  };
}
