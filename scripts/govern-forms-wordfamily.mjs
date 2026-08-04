import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeReadingGKey,
  stableReadingGId
} from "../app/lib/reading-g-vocab/normalize.mjs";
import {
  isBrushableWord,
  isLexicalizedPlural
} from "../app/lib/vocab/word-study-eligibility.mjs";
import { coarsePos } from "../app/lib/reading-g-vocab/compaction.mjs";
import {
  enrichReadingGRelationMeanings,
  sanitizeReadingGRelations
} from "../app/lib/reading-g-vocab/relation-meanings.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const READING_G_PATH = path.join(ROOT, "public", "data", "reading-g-vocab.json");
const RETIREMENTS_PATH = path.join(ROOT, "public", "data", "reading-g-retirements.json");
const COMPACTION_PATH = path.join(ROOT, "public", "data", "reading-g-word-family-compaction.json");
const MASTER_PATH = path.join(ROOT, "public", "data", "words.json");
const HEADER_PATH = path.join(ROOT, "app", "components", "GlobalStudyHeader.jsx");
const REPORTS_DIR = path.join(ROOT, "reports");
const BACKUPS_DIR = path.join(ROOT, "backups");

const FALSE_RELATION_PAIRS = [
  ["find", "foundation"],
  ["find", "founder"],
  ["already", "ready"],
  ["method", "methodist"],
  ["sunny", "sunni"],
  ["tenant", "landlord"],
  ["homemaker", "make"],
  ["facelift", "lift"],
  ["meltdown", "down"],
  ["continually", "continu"],
  ["opposition", "oppos"],
  ["others", "another"],
  ["care", "career"]
];
const FALSE_PAIR_KEYS = new Set(
  FALSE_RELATION_PAIRS.flatMap(([left, right]) => [`${left}::${right}`, `${right}::${left}`])
);
const FRAGMENT_WORDS = new Set(["advertis", "announc", "inspir", "organiz", "continu", "oppos"]);
const PENDING_MARKERS = ["\u603b\u8bcd\u5e93\u5f85\u8865", "\u5f85\u8865"];
const P2_MASTER_PROMOTION_WHITELIST = [
  ["accompaniment", "accompany"], ["accompanist", "accompany"],
  ["stimulant", "stimulate"], ["meritorious", "merit"],
  ["burdensome", "burden"], ["unburden", "burden"],
  ["hurried", "hurriedly"], ["malignancy", "malignant"],
  ["malign", "malignant"], ["obtainable", "obtain"],
  ["maintainable", "maintenance"], ["illustrative", "illustrate"],
  ["financier", "finance"], ["quicken", "quickly"],
  ["distributive", "distribution"], ["venturer", "venture"],
  ["incentivize", "incentive"], ["institutionalize", "institution"],
  ["inclusivity", "inclusion"], ["impossibility", "impossible"],
  ["transact", "transaction"], ["transactional", "transaction"],
  ["predominance", "predominantly"], ["democrat", "democratic"]
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value == null ? "" : value).trim();
}

function relationWord(value) {
  return typeof value === "string"
    ? text(value)
    : text(value?.word || value?.form || value?.value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readJsonWithRaw(filePath) {
  const raw = fs.readFileSync(filePath);
  return { raw, data: JSON.parse(raw.toString("utf8")), hash: sha256(raw) };
}

function parseArgs(argv) {
  const options = { mode: "dry-run", scope: "reading-g", promote: false };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") options.mode = "dry-run";
    else if (arg === "--apply") options.mode = "apply";
    else if (arg === "--promote") options.promote = true;
    else if (arg.startsWith("--scope=")) options.scope = arg.slice("--scope=".length);
    else if (arg === "--scope" && argv[index + 1]) options.scope = argv[++index];
    else throw new Error(`未知参数：${arg}`);
  }
  if (options.scope !== "reading-g") {
    throw new Error("当前治理范围已按用户要求锁定为 reading-g；主词库只读，不能使用 master/all。 ");
  }
  return options;
}

function timestampParts(date = new Date()) {
  const iso = date.toISOString();
  return {
    iso,
    date: iso.slice(0, 10).replaceAll("-", ""),
    slug: iso.replace(/[-:]/g, "").replace("T", "-").replace(/\.\d{3}Z$/, "Z")
  };
}

function relationRows(entry, field) {
  return asArray(entry?.[field]);
}

function relationMap(entry, field) {
  return new Map(
    relationRows(entry, field)
      .map((row) => [normalizeReadingGKey(relationWord(row)), row])
      .filter(([key]) => key)
  );
}

function hasPendingMarker(row) {
  const value = text(row?.meaning || row?.meaningZh || row?.note);
  return PENDING_MARKERS.some((marker) => value.includes(marker));
}

function removalReason(owner, field, row) {
  const ownerKey = normalizeReadingGKey(owner?.word);
  const targetKey = normalizeReadingGKey(relationWord(row));
  if ((owner?.entryType || "word") !== "word" || /\s/.test(ownerKey)) return "phrase-split-relation";
  if (hasPendingMarker(row)) return "pending-placeholder-relation";
  if (FALSE_PAIR_KEYS.has(`${ownerKey}::${targetKey}`)) return "known-false-relation";
  if (field === "wordFamily" && FRAGMENT_WORDS.has(targetKey)) return "truncated-family-fragment";
  if (!targetKey || ownerKey === targetKey) return "empty-or-self-link";
  return "unsafe-relation";
}

function compareRelations(beforeItems, afterItems) {
  const afterById = new Map(afterItems.map((entry) => [text(entry?.id), entry]));
  const changes = [];
  const removed = [];
  const moved = [];
  const meaningsChanged = [];

  for (const before of beforeItems) {
    const after = afterById.get(text(before?.id));
    if (!after) continue;
    const entryChanges = [];
    const beforeForms = relationMap(before, "forms");
    const beforeFamily = relationMap(before, "wordFamily");
    const afterForms = relationMap(after, "forms");
    const afterFamily = relationMap(after, "wordFamily");

    for (const [field, beforeMap, afterMap, oppositeAfter] of [
      ["forms", beforeForms, afterForms, afterFamily],
      ["wordFamily", beforeFamily, afterFamily, afterForms]
    ]) {
      for (const [key, row] of beforeMap) {
        if (afterMap.has(key)) {
          const next = afterMap.get(key);
          if (text(row?.meaning || row?.meaningZh) !== text(next?.meaning || next?.meaningZh)) {
            meaningsChanged.push({ owner: before.word, field, word: relationWord(row) });
          }
          continue;
        }
        if (oppositeAfter.has(key)) {
          const action = {
            owner: before.word,
            word: relationWord(row),
            from: field,
            to: field === "forms" ? "wordFamily" : "forms"
          };
          moved.push(action);
          entryChanges.push(action);
          continue;
        }
        const action = {
          owner: before.word,
          field,
          word: relationWord(row),
          reason: removalReason(before, field, row)
        };
        removed.push(action);
        entryChanges.push(action);
      }
    }
    if (entryChanges.length || JSON.stringify(before.forms || []) !== JSON.stringify(after.forms || [])
      || JSON.stringify(before.wordFamily || []) !== JSON.stringify(after.wordFamily || [])) {
      changes.push({ id: before.id, word: before.word, actions: entryChanges.length });
    }
  }
  return { changedEntries: changes, removed, moved, meaningsChanged };
}

function relationTotals(items) {
  return asArray(items).reduce((totals, entry) => {
    totals.forms += relationRows(entry, "forms").length;
    totals.wordFamily += relationRows(entry, "wordFamily").length;
    return totals;
  }, { forms: 0, wordFamily: 0 });
}

function auditItems(items) {
  const falseRelations = [];
  const fragmentRelations = [];
  const placeholderRelations = [];
  const phraseRelations = [];
  const selfLinks = [];
  const crossCategoryDuplicates = [];
  const missingMeanings = [];
  const mergedIndependentDuplicates = [];
  const wordItems = items.filter((entry) => (entry?.entryType || "word") === "word");
  const wordKeys = new Set(wordItems.map((entry) => normalizeReadingGKey(entry.word)));
  const ids = new Set();
  const duplicateIds = [];
  const duplicateWords = [];
  const seenWords = new Set();

  for (const entry of items) {
    const id = text(entry?.id);
    const ownerKey = normalizeReadingGKey(entry?.word);
    if (!id || ids.has(id)) duplicateIds.push({ id, word: entry?.word });
    if (id) ids.add(id);
    if ((entry?.entryType || "word") === "word") {
      if (!ownerKey || seenWords.has(ownerKey)) duplicateWords.push(entry?.word);
      if (ownerKey) seenWords.add(ownerKey);
    }
    const forms = relationMap(entry, "forms");
    const family = relationMap(entry, "wordFamily");
    for (const [field, rows] of [["forms", forms], ["wordFamily", family]]) {
      for (const [targetKey, row] of rows) {
        const auditRow = { owner: entry.word, field, word: relationWord(row) };
        if (FALSE_PAIR_KEYS.has(`${ownerKey}::${targetKey}`)) falseRelations.push(auditRow);
        if (field === "wordFamily" && FRAGMENT_WORDS.has(targetKey)) fragmentRelations.push(auditRow);
        if (hasPendingMarker(row)) placeholderRelations.push(auditRow);
        if ((entry?.entryType || "word") !== "word" || /\s/.test(ownerKey)) phraseRelations.push(auditRow);
        if (!targetKey || targetKey === ownerKey) selfLinks.push(auditRow);
        if (!text(row?.meaning || row?.meaningZh)) missingMeanings.push(auditRow);
        if (
          /merged-independent/i.test(text(row?.relation || row?.type))
          && wordKeys.has(targetKey)
        ) mergedIndependentDuplicates.push(auditRow);
      }
    }
    for (const key of forms.keys()) {
      if (family.has(key)) crossCategoryDuplicates.push({ owner: entry.word, word: key });
    }
  }

  return {
    itemCount: items.length,
    wordCount: wordItems.length,
    phraseCount: items.length - wordItems.length,
    relationTotals: relationTotals(items),
    falseRelations,
    fragmentRelations,
    placeholderRelations,
    phraseRelations,
    selfLinks,
    crossCategoryDuplicates,
    missingMeanings,
    mergedIndependentDuplicates,
    duplicateIds,
    duplicateWords
  };
}

function uniqueText(values) {
  return [...new Set(asArray(values).map(text).filter(Boolean))];
}

function entryMeaning(entry) {
  return text(
    entry?.primaryMeaningZh
    || entry?.meaningZh
    || entry?.meaning
    || entry?.meaningDetailedZh
    || entry?.meaningDetailZh
    || entry?.definition
  );
}

function safeCoarsePos(entry) {
  const value = text(entry?.primaryPos || entry?.pos).toLowerCase();
  if (/adv/.test(value)) return "adverb";
  if (/adj/.test(value)) return "adjective";
  if (/(^|[\s/])n([\s/.]|$)|noun/.test(value)) return "noun";
  if (/(^|[\s/])v([\s/.]|$)|verb/.test(value)) return "verb";
  return coarsePos(entry);
}

function chineseCharacters(value) {
  return new Set((text(value).match(/[\u3400-\u9fff]/g) || []));
}

function meaningsHaveUsefulOverlap(left, right) {
  const leftChars = chineseCharacters(left);
  const rightChars = chineseCharacters(right);
  if (!leftChars.size || !rightChars.size) return true;
  const overlap = [...leftChars].filter((char) => rightChars.has(char)).length;
  return overlap / Math.min(leftChars.size, rightChars.size) >= 0.25;
}

function isIndependentStandaloneRelation(owner, field, row, masterEntry, whitelisted) {
  if (whitelisted) return true;
  if (!masterEntry || !isBrushableWord(masterEntry)) return false;
  const targetKey = normalizeReadingGKey(masterEntry.word || relationWord(row));
  const targetPos = safeCoarsePos(masterEntry) || safeCoarsePos(row);
  const ownerPos = safeCoarsePos(owner);
  const targetMeaning = entryMeaning(masterEntry) || text(row?.meaning || row?.meaningZh);
  const auditDecision = text(masterEntry?.morphologyAudit?.decision).toLowerCase();

  // The governance specification treats ordinary -ly adverbs as forms rather
  // than additional standalone cards.
  if (targetPos === "adverb" && /ly$/.test(targetKey)) return false;
  if (field === "wordFamily") return true;
  if (/independent|hybrid|lexical/.test(auditDecision)) return true;
  if (isLexicalizedPlural(masterEntry)) return true;
  if (["better", "best", "worse", "worst", "more", "most", "less", "least"].includes(targetKey)) {
    return false;
  }
  if (targetPos && ownerPos && targetPos !== ownerPos) return true;
  if (/过去式|过去分词|现在分词|第三人称|复数形式|比较级|最高级/i.test(targetMeaning)) return false;
  return !meaningsHaveUsefulOverlap(entryMeaning(owner), targetMeaning);
}

function buildStandalonePromotionPlan(items, masterByKey, retirementEntries, enabled) {
  const existingWordKeys = new Set(
    items
      .filter((entry) => (entry?.entryType || "word") === "word")
      .map((entry) => normalizeReadingGKey(entry?.word))
  );
  const retiredKeys = new Set(
    asArray(retirementEntries).map((entry) => (
      text(entry?.key)
      || `${entry?.entryType === "phrase" ? "phrase" : "word"}::${normalizeReadingGKey(entry?.word)}`
    ))
  );
  const whitelist = new Set(P2_MASTER_PROMOTION_WHITELIST.map(([word]) => word));
  const candidates = new Map();
  const skippedRetired = [];

  for (const owner of items) {
    if ((owner?.entryType || "word") !== "word") continue;
    for (const field of ["forms", "wordFamily"]) {
      for (const row of relationRows(owner, field)) {
        const key = normalizeReadingGKey(relationWord(row));
        if (!key || existingWordKeys.has(key)) continue;
        if (retiredKeys.has(`word::${key}`)) {
          skippedRetired.push({ word: relationWord(row), owner: owner.word, field });
          continue;
        }
        const masterEntry = masterByKey.get(key) || null;
        const eligibleFromWhitelist = whitelist.has(key);
        const eligibleFromMaster = isIndependentStandaloneRelation(
          owner,
          field,
          row,
          masterEntry,
          eligibleFromWhitelist
        ) && Boolean(masterEntry);
        if (!eligibleFromMaster && !eligibleFromWhitelist) continue;
        const meaning = entryMeaning(masterEntry) || text(row?.meaning || row?.meaningZh);
        if (!meaning || PENDING_MARKERS.some((marker) => meaning.includes(marker))) continue;
        const current = candidates.get(key) || {
          key,
          word: relationWord(row),
          masterEntry,
          relationRow: row,
          owners: [],
          fields: new Set(),
          reason: eligibleFromMaster ? "master-brushable-headword" : "approved-standalone-whitelist"
        };
        current.owners.push(owner);
        current.fields.add(field);
        if (!current.masterEntry && masterEntry) current.masterEntry = masterEntry;
        candidates.set(key, current);
      }
    }
  }

  const candidateRows = [...candidates.values()]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((candidate) => ({ ...candidate, fields: [...candidate.fields] }));
  if (!enabled) {
    return { entries: [], candidates: candidateRows, skippedRetired, skippedWhitelist: [] };
  }

  const entries = candidateRows.map((candidate) => {
    const master = candidate.masterEntry ? structuredClone(candidate.masterEntry) : null;
    const row = candidate.relationRow || {};
    const owner = candidate.owners[0] || {};
    const id = stableReadingGId("word", candidate.key);
    const meaning = entryMeaning(master) || text(row.meaning || row.meaningZh);
    const pos = text(master?.pos || row.pos) || "word";
    const base = master || {
      word: candidate.word,
      phonetic: text(row.phonetic),
      pos,
      meaning,
      definition: "",
      example: "",
      exampleCn: "",
      collocations: [],
      phraseCollocations: [],
      topics: [],
      forms: [],
      wordFamily: []
    };
    return {
      ...base,
      id,
      wordId: id,
      sourceWordId: text(master?.wordId || master?.id),
      word: candidate.word,
      normalizedKey: candidate.key,
      entryType: "word",
      isPhrase: false,
      studyMode: "active",
      primaryMeaningZh: meaning,
      primaryPos: pos,
      meaning,
      pos,
      layers: uniqueText([...asArray(owner.layers), "formsFamilyStandalone"]),
      sourceFiles: uniqueText([
        ...asArray(owner.sourceFiles),
        ...(master ? ["public/data/words.json"] : [])
      ]),
      qualityFlags: uniqueText([
        ...asArray(owner.qualityFlags).filter((flag) => flag !== "missing_master_lexicon"),
        ...(master ? ["master_lexicon_reused"] : []),
        "forms_family_independent_restored"
      ]),
      standaloneRestoration: {
        version: "reading-g-forms-family-governance-v1",
        ownerWords: uniqueText(candidate.owners.map((entry) => entry.word)),
        relationFields: candidate.fields,
        reason: candidate.reason
      }
    };
  });
  const promotedKeys = new Set(entries.map((entry) => normalizeReadingGKey(entry.word)));
  const skippedWhitelist = [...whitelist]
    .filter((key) => !existingWordKeys.has(key) && !promotedKeys.has(key))
    .map((word) => ({ word, reason: retiredKeys.has(`word::${word}`) ? "retired" : "no-safe-g-relation" }));
  return { entries, candidates: candidateRows, skippedRetired, skippedWhitelist };
}

function pruneCompactionForStandaloneWords(payload, standaloneKeys, timestamp) {
  const sourceRules = asArray(payload?.rules);
  let removedAliasCount = 0;
  const rules = sourceRules.flatMap((rule) => {
    const aliases = asArray(rule?.aliases).filter((alias) => {
      const remove = standaloneKeys.has(normalizeReadingGKey(alias?.key || alias?.word));
      if (remove) removedAliasCount += 1;
      return !remove;
    });
    return aliases.length ? [{ ...rule, aliases }] : [];
  });
  const previousAliasCount = sourceRules.reduce((sum, rule) => sum + asArray(rule?.aliases).length, 0);
  return {
    payload: {
      ...payload,
      version: `reading-g-internal-family-compaction-v2-${timestamp.date}`,
      updatedAt: timestamp.iso,
      rules,
      resultingWordCount: Number(payload?.resultingWordCount || 0) + removedAliasCount,
      stats: {
        ...(payload?.stats || {}),
        familyCount: rules.length,
        aliasCount: previousAliasCount - removedAliasCount,
        standaloneAliasesRestored: removedAliasCount
      }
    },
    removedAliasCount
  };
}

function buildPlan(options, now = new Date()) {
  const timestamp = timestampParts(now);
  const readingGFile = readJsonWithRaw(READING_G_PATH);
  const retirementFile = readJsonWithRaw(RETIREMENTS_PATH);
  const compactionFile = readJsonWithRaw(COMPACTION_PATH);
  const masterFile = readJsonWithRaw(MASTER_PATH);
  const masterItems = asArray(masterFile.data?.words);
  const masterByKey = new Map(masterItems.map((entry) => [normalizeReadingGKey(entry?.word), entry]));
  const beforeItems = asArray(readingGFile.data?.items);
  const sanitized = sanitizeReadingGRelations(structuredClone(beforeItems), masterByKey);
  const enriched = enrichReadingGRelationMeanings(sanitized.items, masterByKey);
  const promotion = buildStandalonePromotionPlan(
    enriched.items,
    masterByKey,
    retirementFile.data?.entries,
    options.promote
  );
  const promotedItems = [...enriched.items, ...promotion.entries];
  const finalSanitized = sanitizeReadingGRelations(promotedItems, masterByKey);
  const finalEnriched = enrichReadingGRelationMeanings(finalSanitized.items, masterByKey);
  const afterItems = finalEnriched.items;
  const promotedKeys = new Set(promotion.entries.map((entry) => normalizeReadingGKey(entry.word)));
  const compaction = pruneCompactionForStandaloneWords(
    compactionFile.data,
    promotedKeys,
    timestamp
  );
  const beforeAudit = auditItems(beforeItems);
  const afterAudit = auditItems(afterItems);
  const diff = compareRelations(beforeItems, afterItems);
  const wordCount = afterItems.filter((entry) => (entry?.entryType || "word") === "word").length;
  const phraseCount = afterItems.length - wordCount;
  const activeCount = afterItems.filter((entry) => entry?.studyMode !== "reference").length;
  const referenceCount = afterItems.length - activeCount;
  const multiSenseCount = afterItems.filter((entry) => asArray(entry?.senses).length > 1).length;
  const output = {
    ...readingGFile.data,
    count: afterItems.length,
    wordCount,
    phraseCount,
    activeCount,
    referenceCount,
    multiSenseCount,
    questionBankExpansion: readingGFile.data?.questionBankExpansion
      ? {
          ...readingGFile.data.questionBankExpansion,
          retiredCount: asArray(retirementFile.data?.entries).length
        }
      : readingGFile.data?.questionBankExpansion,
    items: afterItems,
    formsFamilyGovernance: {
      version: `reading-g-forms-family-governance-v1-${timestamp.date}`,
      updatedAt: timestamp.iso,
      scope: "reading-g-only",
      masterLexiconRole: "read-only-reference",
      standaloneWordsRestored: promotion.entries.length,
      compactionAliasesReleased: compaction.removedAliasCount,
      initialSanitizer: sanitized.stats,
      finalSanitizer: finalSanitized.stats,
      meaningEnrichment: finalEnriched.stats
    },
    relationAudit: {
      ...(readingGFile.data?.relationAudit || {}),
      version: `reading-g-relation-audit-v2-${timestamp.date}`,
      updatedAt: timestamp.iso,
      ...finalSanitized.stats,
      remainingFalseRelations: afterAudit.falseRelations.length,
      remainingFragments: afterAudit.fragmentRelations.length,
      remainingPhraseRelations: afterAudit.phraseRelations.length,
      remainingPlaceholders: afterAudit.placeholderRelations.length,
      remainingSelfLinks: afterAudit.selfLinks.length,
      remainingCrossCategoryDuplicates: afterAudit.crossCategoryDuplicates.length,
      remainingMissingMeanings: afterAudit.missingMeanings.length
    }
  };
  const content = `${JSON.stringify(output, null, 2)}\n`;
  const idsBefore = beforeItems.map((entry) => text(entry?.id));
  const idsAfter = afterItems.map((entry) => text(entry?.id));
  const invariantFailures = [];
  if (JSON.stringify(idsBefore) !== JSON.stringify(idsAfter.slice(0, idsBefore.length))) {
    invariantFailures.push("existing-stable-id-or-order-changed");
  }
  if (afterItems.length !== beforeItems.length + promotion.entries.length) {
    invariantFailures.push("unexpected-standalone-item-count");
  }
  if (afterAudit.duplicateIds.length) invariantFailures.push("duplicate-or-missing-id");
  if (afterAudit.duplicateWords.length) invariantFailures.push("duplicate-or-missing-word-head");
  if (afterAudit.falseRelations.length) invariantFailures.push("known-false-relations-remain");
  if (afterAudit.fragmentRelations.length) invariantFailures.push("truncated-family-fragments-remain");
  if (afterAudit.phraseRelations.length) invariantFailures.push("phrase-split-relations-remain");
  if (afterAudit.placeholderRelations.length) invariantFailures.push("pending-placeholder-relations-remain");
  if (afterAudit.selfLinks.length) invariantFailures.push("self-links-remain");
  if (afterAudit.crossCategoryDuplicates.length) invariantFailures.push("cross-category-duplicates-remain");
  if (afterAudit.missingMeanings.length) invariantFailures.push("relation-meanings-missing");

  return {
    timestamp,
    readingGFile,
    retirementFile,
    compactionFile,
    masterFile,
    compactionOutput: compaction.payload,
    compactionContent: `${JSON.stringify(compaction.payload, null, 2)}\n`,
    output,
    content,
    report: {
      mode: options.mode,
      scope: "reading-g-only",
      generatedAt: timestamp.iso,
      sourceHashes: {
        readingG: readingGFile.hash,
        retirements: retirementFile.hash,
        compaction: compactionFile.hash,
        masterReadOnly: masterFile.hash
      },
      masterLexicon: {
        role: "read-only-reference-only",
        modified: false,
        reusedForStandaloneCards: promotion.entries.filter((entry) => entry.sourceWordId).length
      },
      retirements: {
        count: Number(retirementFile.data?.count) || asArray(retirementFile.data?.entries).length,
        modified: false,
        explanation: "历史退役记录原样保留，不属于本次删除"
      },
      before: beforeAudit,
      after: afterAudit,
      sanitizerStats: {
        initial: sanitized.stats,
        final: finalSanitized.stats
      },
      meaningStats: finalEnriched.stats,
      changes: {
        changedEntryCount: diff.changedEntries.length,
        removedRelationCount: diff.removed.length,
        movedRelationCount: diff.moved.length,
        meaningAdjustedCount: diff.meaningsChanged.length,
        changedEntries: diff.changedEntries,
        removedRelations: diff.removed,
        movedRelations: diff.moved,
        meaningsAdjusted: diff.meaningsChanged
      },
      promotion: {
        requested: options.promote,
        candidateCount: promotion.candidates.length,
        applied: promotion.entries.length,
        copiedFromMaster: promotion.entries.filter((entry) => entry.sourceWordId).length,
        builtFromApprovedGRelation: promotion.entries.filter((entry) => !entry.sourceWordId).length,
        compactionAliasesReleased: compaction.removedAliasCount,
        skippedRetired: promotion.skippedRetired,
        skippedWhitelist: promotion.skippedWhitelist,
        entries: promotion.entries.map((entry) => ({
          id: entry.id,
          word: entry.word,
          pos: entry.primaryPos,
          meaning: entry.primaryMeaningZh,
          sourceWordId: entry.sourceWordId,
          ownerWords: entry.standaloneRestoration?.ownerWords,
          relationFields: entry.standaloneRestoration?.relationFields,
          reason: entry.standaloneRestoration?.reason
        }))
      },
      invariants: {
        existingStableIdsAndOrderPreserved:
          !invariantFailures.includes("existing-stable-id-or-order-changed"),
        standaloneAdditionsExactlyPlanned:
          afterItems.length === beforeItems.length + promotion.entries.length,
        retirementHistoryPreserved: true,
        masterLexiconUnmodified: true,
        careCareerRemaining: afterAudit.falseRelations.filter((row) => (
          [normalizeReadingGKey(row.owner), normalizeReadingGKey(row.word)].sort().join("::")
          === ["care", "career"].sort().join("::")
        )).length,
        failures: invariantFailures,
        passed: invariantFailures.length === 0
      },
      proposedOutput: {
        count: output.count,
        wordCount: output.wordCount,
        phraseCount: output.phraseCount,
        activeCount: output.activeCount,
        referenceCount: output.referenceCount,
        sha256: sha256(content)
      }
    }
  };
}

function markdownReport(report) {
  const countsByReason = Object.entries(
    report.changes.removedRelations.reduce((acc, row) => {
      acc[row.reason] = (acc[row.reason] || 0) + 1;
      return acc;
    }, {})
  );
  const reasonLines = countsByReason.length
    ? countsByReason.map(([reason, count]) => `- ${reason}: ${count}`).join("\n")
    : "- 无";
  const failureLines = report.invariants.failures.length
    ? report.invariants.failures.map((value) => `- ${value}`).join("\n")
    : "- 无，全部通过";
  return [
    "# G 类阅读提升：词形词族治理报告",
    "",
    `- 模式：${report.mode}`,
    `- 范围：${report.scope}`,
    `- 生成时间：${report.generatedAt}`,
    `- 主词库：只读参考，主词库写入 0 条`,
    `- 历史退役记录：${report.retirements.count} 条，原样保留`,
    "",
    "## 数量",
    "",
    `- 独立条目：${report.before.itemCount} → ${report.after.itemCount}`,
    `- 独立单词：${report.before.wordCount} → ${report.after.wordCount}`,
    `- 词形关系：${report.before.relationTotals.forms} → ${report.after.relationTotals.forms}`,
    `- 词族关系：${report.before.relationTotals.wordFamily} → ${report.after.relationTotals.wordFamily}`,
    `- 涉及条目：${report.changes.changedEntryCount}`,
    `- 拟删除错误关系：${report.changes.removedRelationCount}`,
    `- 拟移动关系：${report.changes.movedRelationCount}`,
    `- 恢复为独立可刷词：${report.promotion.applied}`,
    `- 解除旧合并规则：${report.promotion.compactionAliasesReleased}`,
    "",
    "## 删除原因",
    "",
    reasonLines,
    "",
    "## 完整性检查",
    "",
    `- care/career 残留：${report.invariants.careCareerRemaining}`,
    `- 错误关系残留：${report.after.falseRelations.length}`,
    `- 截断词干残留：${report.after.fragmentRelations.length}`,
    `- 短语拆词关系残留：${report.after.phraseRelations.length}`,
    `- 待补占位关系残留：${report.after.placeholderRelations.length}`,
    `- 跨栏重复：${report.after.crossCategoryDuplicates.length}`,
    `- 缺少释义：${report.after.missingMeanings.length}`,
    `- 既有稳定 ID 与顺序保留：${report.invariants.existingStableIdsAndOrderPreserved ? "是" : "否"}`,
    "",
    "## 未通过项",
    "",
    failureLines,
    ""
  ].join("\n");
}

function atomicWrite(filePath, content) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, content, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function writeReports(plan) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const stem = `forms-family-governance-${plan.timestamp.slug}`;
  const jsonPath = path.join(REPORTS_DIR, `${stem}.json`);
  const markdownPath = path.join(REPORTS_DIR, `${stem}.md`);
  atomicWrite(jsonPath, `${JSON.stringify(plan.report, null, 2)}\n`);
  atomicWrite(markdownPath, markdownReport(plan.report));
  return { jsonPath, markdownPath };
}

function applyPlan(plan) {
  if (!plan.report.invariants.passed) {
    throw new Error(`完整性检查未通过，停止写入：${plan.report.invariants.failures.join(", ")}`);
  }
  const currentReadingGHash = sha256(fs.readFileSync(READING_G_PATH));
  const currentRetirementsHash = sha256(fs.readFileSync(RETIREMENTS_PATH));
  const currentCompactionHash = sha256(fs.readFileSync(COMPACTION_PATH));
  const currentMasterHash = sha256(fs.readFileSync(MASTER_PATH));
  if (currentReadingGHash !== plan.readingGFile.hash) throw new Error("G 类词库在分析后发生变化，停止写入，请重新运行。 ");
  if (currentRetirementsHash !== plan.retirementFile.hash) throw new Error("退役记录在分析后发生变化，停止写入，请重新运行。 ");
  if (currentCompactionHash !== plan.compactionFile.hash) throw new Error("词族合并规则在分析后发生变化，停止写入，请重新运行。 ");
  if (currentMasterHash !== plan.masterFile.hash) throw new Error("只读参考主词库在分析后发生变化，停止写入，请重新运行。 ");

  const backupDir = path.join(BACKUPS_DIR, `forms-family-governance-${plan.timestamp.slug}`);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(READING_G_PATH, path.join(backupDir, "reading-g-vocab.json.before"));
  fs.copyFileSync(RETIREMENTS_PATH, path.join(backupDir, "reading-g-retirements.json.before"));
  fs.copyFileSync(COMPACTION_PATH, path.join(backupDir, "reading-g-word-family-compaction.json.before"));
  fs.copyFileSync(HEADER_PATH, path.join(backupDir, "GlobalStudyHeader.jsx.before"));

  atomicWrite(READING_G_PATH, plan.content);
  atomicWrite(COMPACTION_PATH, plan.compactionContent);
  const cacheVersion = `${plan.timestamp.date}-forms-family-governance-v1`;
  const headerSource = fs.readFileSync(HEADER_PATH, "utf8");
  const updatedHeader = headerSource.replace(
    /\/data\/reading-g-vocab\.json\?v=[^"'`\s]+/g,
    `/data/reading-g-vocab.json?v=${cacheVersion}`
  );
  if (updatedHeader === headerSource) throw new Error("未找到 G 类词库缓存版本位置，词库已备份但需人工检查。 ");
  atomicWrite(HEADER_PATH, updatedHeader);
  return { backupDir, cacheVersion };
}

function main() {
  const options = parseArgs(process.argv);
  const plan = buildPlan(options);
  const reportPaths = writeReports(plan);
  let applied = null;
  if (options.mode === "apply") applied = applyPlan(plan);
  const masterHashAfter = sha256(fs.readFileSync(MASTER_PATH));
  if (masterHashAfter !== plan.masterFile.hash) throw new Error("主词库发生了意外变化。 ");
  console.log(JSON.stringify({
    ok: true,
    mode: options.mode,
    scope: "reading-g-only",
    reportPaths,
    applied,
    summary: {
      itemCount: `${plan.report.before.itemCount} -> ${plan.report.after.itemCount}`,
      changedEntries: plan.report.changes.changedEntryCount,
      removedRelations: plan.report.changes.removedRelationCount,
      movedRelations: plan.report.changes.movedRelationCount,
      standaloneWordsRestored: plan.report.promotion.applied,
      compactionAliasesReleased: plan.report.promotion.compactionAliasesReleased,
      retirementRecordsPreserved: plan.report.retirements.count,
      masterWrites: 0,
      invariantsPassed: plan.report.invariants.passed
    }
  }, null, 2));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

export {
  auditItems,
  buildPlan,
  compareRelations,
  isIndependentStandaloneRelation,
  parseArgs
};
