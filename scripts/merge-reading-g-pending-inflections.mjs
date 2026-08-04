import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyReadingGCompaction } from "../app/lib/reading-g-vocab/compaction.mjs";
import { normalizeReadingGKey } from "../app/lib/reading-g-vocab/normalize.mjs";
import {
  enrichReadingGRelationMeanings,
  sanitizeReadingGRelations
} from "../app/lib/reading-g-vocab/relation-meanings.mjs";
import { LEXICALIZED_PLURAL_HEADWORDS } from "../app/lib/vocab/word-study-eligibility.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VOCAB_FILE = path.join(ROOT, "public", "data", "reading-g-vocab.json");
const REPORT_FILE = path.join(ROOT, "public", "data", "reading-g-import-report.json");
const COMPACTION_FILE = path.join(ROOT, "public", "data", "reading-g-word-family-compaction.json");
const PENDING_LAYER_ID = "questionBankPending";
const MERGE_VERSION = "reading-g-pending-inflection-merge-v1";
const COMPACTION_VERSION = "reading-g-internal-family-compaction-v2-pending-inflections";
const RETAINED_REVIEW_WORDS = new Set(["attractions", "gatherings", "evenings"]);
const BLOCKED_PAIRS = new Set([
  "care::career",
  "cool::cooler",
  "dry::dryer",
  "lit::litter"
]);
const BLOCKED_ADVERBS = new Set(["hardly", "lately", "nearly"]);

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

function unique(values) {
  return [...new Set(asArray(values).map(text).filter(Boolean))];
}

function primaryMeaning(entry) {
  return text(entry?.primaryMeaningZh || entry?.meaning || entry?.meaningZh);
}

function isPendingIndependent(entry) {
  return (
    (entry?.entryType || "word") === "word"
    && entry?.primaryLayer === PENDING_LAYER_ID
    && entry?.studyMode === "reference"
    && asArray(entry?.qualityFlags).includes("missing_master_lexicon")
  );
}

function hasUsableMeaning(entry) {
  const meaning = primaryMeaning(entry);
  return Boolean(
    meaning
    && !asArray(entry?.qualityFlags).includes("missing_master_lexicon")
    && !/(?:待补|placeholder|to be completed)/i.test(meaning)
  );
}

function posKinds(entry) {
  const value = text(entry?.primaryPos || entry?.pos).toLowerCase();
  const kinds = new Set();
  if (/(^|[\s/,;])v(?:erb)?([\s/,;]|$)|verb/.test(value)) kinds.add("verb");
  if (/(^|[\s/,;])n(?:oun)?([\s/,;]|$)|noun/.test(value)) kinds.add("noun");
  if (/adj(?:ective)?/.test(value)) kinds.add("adjective");
  return kinds;
}

function isConsonant(char) {
  return /^[b-df-hj-np-tv-z]$/i.test(char || "");
}

function isVowel(char) {
  return /^[aeiou]$/i.test(char || "");
}

function hasCvcEnding(word) {
  if (word.length < 3) return false;
  const [a, b, c] = word.slice(-3);
  return isConsonant(a) && isVowel(b) && isConsonant(c) && !/[wxy]$/i.test(word);
}

function addCandidate(map, word, type) {
  const key = normalizeReadingGKey(word);
  if (!key) return;
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(type);
}

export function generatedForms(entry) {
  const headword = normalizeReadingGKey(entry?.normalizedKey || entry?.word);
  const forms = new Map();
  if (!headword || /[^a-z'-]/.test(headword)) return forms;
  const kinds = posKinds(entry);

  if (kinds.has("noun") && !LEXICALIZED_PLURAL_HEADWORDS.has(headword)) {
    if (/[^aeiou]y$/.test(headword)) addCandidate(forms, `${headword.slice(0, -1)}ies`, "plural");
    else if (/(s|x|z|ch|sh)$/.test(headword)) addCandidate(forms, `${headword}es`, "plural");
    else if (/fe$/.test(headword)) {
      addCandidate(forms, `${headword.slice(0, -2)}ves`, "plural");
      addCandidate(forms, `${headword}s`, "plural");
    } else if (/f$/.test(headword)) {
      addCandidate(forms, `${headword.slice(0, -1)}ves`, "plural");
      addCandidate(forms, `${headword}s`, "plural");
    } else if (/o$/.test(headword)) {
      addCandidate(forms, `${headword}es`, "plural");
      addCandidate(forms, `${headword}s`, "plural");
    } else addCandidate(forms, `${headword}s`, "plural");
  }

  if (kinds.has("verb")) {
    if (/[^aeiou]y$/.test(headword)) addCandidate(forms, `${headword.slice(0, -1)}ies`, "third-person singular");
    else if (/(s|x|z|ch|sh|o)$/.test(headword)) addCandidate(forms, `${headword}es`, "third-person singular");
    else addCandidate(forms, `${headword}s`, "third-person singular");

    if (/ie$/.test(headword)) addCandidate(forms, `${headword.slice(0, -2)}ying`, "present participle/gerund");
    else if (/e$/.test(headword) && !/(ee|ye|oe)$/.test(headword)) {
      addCandidate(forms, `${headword.slice(0, -1)}ing`, "present participle/gerund");
    } else if (hasCvcEnding(headword)) {
      addCandidate(forms, `${headword}${headword.at(-1)}ing`, "present participle/gerund");
    } else addCandidate(forms, `${headword}ing`, "present participle/gerund");

    if (/[^aeiou]y$/.test(headword)) addCandidate(forms, `${headword.slice(0, -1)}ied`, "past tense/participle");
    else if (/e$/.test(headword)) addCandidate(forms, `${headword}d`, "past tense/participle");
    else if (hasCvcEnding(headword)) {
      addCandidate(forms, `${headword}${headword.at(-1)}ed`, "past tense/participle");
    } else addCandidate(forms, `${headword}ed`, "past tense/participle");
  }

  if (kinds.has("adjective")) {
    if (/[^aeiou]y$/.test(headword)) {
      addCandidate(forms, `${headword.slice(0, -1)}ier`, "comparative");
      addCandidate(forms, `${headword.slice(0, -1)}iest`, "superlative");
    } else if (/e$/.test(headword)) {
      addCandidate(forms, `${headword}r`, "comparative");
      addCandidate(forms, `${headword}st`, "superlative");
    } else if (hasCvcEnding(headword)) {
      addCandidate(forms, `${headword}${headword.at(-1)}er`, "comparative");
      addCandidate(forms, `${headword}${headword.at(-1)}est`, "superlative");
    } else {
      addCandidate(forms, `${headword}er`, "comparative");
      addCandidate(forms, `${headword}est`, "superlative");
    }
    addCandidate(
      forms,
      /[^aeiou]y$/.test(headword)
        ? `${headword.slice(0, -1)}ily`
        : /ic$/.test(headword)
          ? `${headword}ally`
          : /le$/.test(headword)
            ? `${headword.slice(0, -1)}y`
            : `${headword}ly`,
      "adverbial form"
    );
  }
  return forms;
}

function chooseType(types) {
  return [
    "third-person singular",
    "plural",
    "present participle/gerund",
    "past tense/participle",
    "comparative",
    "superlative",
    "adverbial form",
    "explicit G form"
  ].find((type) => types.has(type)) || "explicit G form";
}

function buildCandidateMap(items, pendingByKey) {
  const candidates = new Map();
  const add = (aliasKey, ownerKey, type, source) => {
    if (!pendingByKey.has(aliasKey) || aliasKey === ownerKey) return;
    if (RETAINED_REVIEW_WORDS.has(aliasKey)) return;
    if (BLOCKED_PAIRS.has(`${ownerKey}::${aliasKey}`)) return;
    if (type === "adverbial form" && BLOCKED_ADVERBS.has(aliasKey)) return;
    if (!candidates.has(aliasKey)) candidates.set(aliasKey, []);
    candidates.get(aliasKey).push({ ownerKey, type, source });
  };

  for (const owner of items) {
    if ((owner?.entryType || "word") !== "word" || isPendingIndependent(owner) || !hasUsableMeaning(owner)) continue;
    const ownerKey = normalizeReadingGKey(owner?.normalizedKey || owner?.word);
    for (const [aliasKey, types] of generatedForms(owner)) {
      add(aliasKey, ownerKey, chooseType(types), "generated");
    }
    for (const relation of asArray(owner?.forms)) {
      const aliasKey = normalizeReadingGKey(relationWord(relation));
      add(aliasKey, ownerKey, text(relation?.type) || "explicit G form", "explicit");
    }
  }
  return candidates;
}

export function buildPendingInflectionMergePlan(items, existingCompaction = {}) {
  const words = asArray(items).filter((entry) => (entry?.entryType || "word") === "word");
  const byKey = new Map(words.map((entry) => [normalizeReadingGKey(entry?.normalizedKey || entry?.word), entry]));
  const pending = words.filter(isPendingIndependent);
  const pendingByKey = new Map(pending.map((entry) => [normalizeReadingGKey(entry?.normalizedKey || entry?.word), entry]));
  const candidates = buildCandidateMap(words, pendingByKey);
  const existingAliases = new Map();
  for (const rule of asArray(existingCompaction?.rules)) {
    const canonicalKey = normalizeReadingGKey(rule?.canonicalKey || rule?.canonicalWord);
    for (const alias of asArray(rule?.aliases)) {
      const aliasKey = normalizeReadingGKey(alias?.key || alias?.word);
      if (aliasKey) existingAliases.set(aliasKey, canonicalKey);
    }
  }

  const mappings = [];
  const conflicts = [];
  for (const [aliasKey, rows] of candidates) {
    const ownerKeys = [...new Set(rows.map((row) => row.ownerKey))];
    const existingOwner = existingAliases.get(aliasKey);
    if (existingOwner && !ownerKeys.includes(existingOwner)) {
      conflicts.push({ aliasKey, reason: "existing-compaction-owner-conflict", existingOwner, ownerKeys });
      continue;
    }
    if (ownerKeys.length !== 1) {
      conflicts.push({ aliasKey, reason: "ambiguous-g-owners", ownerKeys });
      continue;
    }
    const ownerKey = ownerKeys[0];
    const owner = byKey.get(ownerKey);
    const alias = pendingByKey.get(aliasKey);
    if (!owner || !alias || !hasUsableMeaning(owner)) continue;
    const types = new Set(rows.map((row) => row.type));
    const sources = new Set(rows.map((row) => row.source));
    mappings.push({
      aliasKey,
      aliasId: text(alias.id),
      aliasWord: text(alias.word),
      ownerKey,
      ownerId: text(owner.id),
      ownerWord: text(owner.word),
      type: chooseType(types),
      source: sources.has("generated") && sources.has("explicit") ? "generated+explicit" : [...sources][0]
    });
  }
  mappings.sort((left, right) => left.aliasKey.localeCompare(right.aliasKey));

  const reviewWords = [...RETAINED_REVIEW_WORDS].filter((key) => pendingByKey.has(key));
  const countsByType = Object.fromEntries(
    [...new Set(mappings.map((row) => row.type))].sort().map((type) => [
      type,
      mappings.filter((row) => row.type === type).length
    ])
  );
  return {
    version: MERGE_VERSION,
    scope: "reading-g-only",
    pendingBefore: pending.length,
    mergeCount: mappings.length,
    pendingAfter: pending.length - mappings.length,
    generatedCount: mappings.filter((row) => row.source !== "explicit").length,
    explicitOnlyCount: mappings.filter((row) => row.source === "explicit").length,
    reviewWords,
    conflicts,
    countsByType,
    mappings
  };
}

function appendMappingsToCompaction(existingCompaction, mergePlan, generatedAt) {
  const rules = asArray(existingCompaction?.rules).map((rule) => ({
    ...rule,
    aliases: asArray(rule?.aliases).map((alias) => ({ ...alias }))
  }));
  const byCanonical = new Map(rules.map((rule) => [normalizeReadingGKey(rule.canonicalKey), rule]));
  for (const mapping of mergePlan.mappings) {
    let rule = byCanonical.get(mapping.ownerKey);
    if (!rule) {
      rule = {
        canonicalKey: mapping.ownerKey,
        canonicalId: mapping.ownerId,
        canonicalWord: mapping.ownerWord,
        aliases: []
      };
      rules.push(rule);
      byCanonical.set(mapping.ownerKey, rule);
    }
    if (!rule.aliases.some((alias) => normalizeReadingGKey(alias?.key || alias?.word) === mapping.aliasKey)) {
      rule.aliases.push({
        key: mapping.aliasKey,
        id: mapping.aliasId,
        word: mapping.aliasWord,
        relationType: "form"
      });
    }
  }
  rules.sort((left, right) => normalizeReadingGKey(left.canonicalKey).localeCompare(normalizeReadingGKey(right.canonicalKey)));
  for (const rule of rules) rule.aliases.sort((left, right) => normalizeReadingGKey(left.key).localeCompare(normalizeReadingGKey(right.key)));
  const aliasCount = rules.reduce((sum, rule) => sum + rule.aliases.length, 0);
  const sourceWordCount = Number(existingCompaction?.sourceWordCount) || 0;
  return {
    ...existingCompaction,
    version: COMPACTION_VERSION,
    generatedAt,
    scope: "reading-g-only-persistent-family-and-inflection-compaction",
    resultingWordCount: Math.max(0, sourceWordCount - aliasCount),
    rules,
    stats: {
      ...existingCompaction?.stats,
      familyCount: rules.length,
      aliasCount,
      pendingInflectionAliasesAdded: mergePlan.mergeCount
    }
  };
}

function itemStats(items) {
  const words = items.filter((entry) => (entry?.entryType || "word") === "word");
  const phrases = items.length - words.length;
  return {
    count: items.length,
    wordCount: words.length,
    phraseCount: phrases,
    activeCount: items.filter((entry) => entry?.studyMode !== "reference").length,
    referenceCount: items.filter((entry) => entry?.studyMode === "reference").length,
    multiSenseCount: items.filter((entry) => asArray(entry?.senses).length > 1).length,
    pendingIndependentCount: words.filter(isPendingIndependent).length,
    pendingLayerCount: words.filter((entry) => asArray(entry?.layers).includes(PENDING_LAYER_ID)).length
  };
}

function updateLayerStats(layerStats, stats) {
  const next = structuredClone(layerStats || {});
  const pending = next[PENDING_LAYER_ID] || {};
  next[PENDING_LAYER_ID] = {
    ...pending,
    rawCount: stats.pendingLayerCount,
    uniqueKeysInLayer: stats.pendingLayerCount,
    primaryNewCount: stats.pendingIndependentCount,
    actionableCount: stats.pendingIndependentCount,
    filterCount: stats.pendingLayerCount
  };
  return next;
}

function updateExpansion(expansion, stats, mergeCount) {
  return {
    ...(expansion || {}),
    pendingCount: stats.pendingLayerCount,
    pendingIndependentCount: stats.pendingIndependentCount,
    referenceCount: stats.pendingLayerCount,
    compactedSourceHeadwordCount: Number(expansion?.compactedSourceHeadwordCount || 0) + mergeCount,
    effectiveTargetCount: Math.max(0, Number(expansion?.effectiveTargetCount || 0) - mergeCount)
  };
}

function updateDataset(vocab, items, mergePlan, applyStats, relationMeaningStats, relationAuditStats, generatedAt) {
  const stats = itemStats(items);
  const layerStats = updateLayerStats(vocab.layerStats, stats);
  const questionBankExpansion = updateExpansion(vocab.questionBankExpansion, stats, mergePlan.mergeCount);
  const pendingInflectionMerge = {
    version: MERGE_VERSION,
    updatedAt: generatedAt,
    scope: "reading-g-only",
    mergedCount: mergePlan.mergeCount,
    pendingBefore: mergePlan.pendingBefore,
    pendingAfter: stats.pendingIndependentCount,
    generatedCount: mergePlan.generatedCount,
    explicitOnlyCount: mergePlan.explicitOnlyCount,
    retainedReviewWords: mergePlan.reviewWords,
    countsByType: mergePlan.countsByType
  };
  return {
    ...vocab,
    ...stats,
    items,
    layerStats,
    expandedAt: generatedAt,
    questionBankExpansion,
    wordFamilyCompaction: {
      version: COMPACTION_VERSION,
      source: "public/data/reading-g-word-family-compaction.json",
      updatedAt: generatedAt,
      sourceWordCount: Number(vocab.wordCount) || stats.wordCount + mergePlan.mergeCount,
      resultingWordCount: stats.wordCount,
      ...applyStats
    },
    pendingInflectionMerge,
    relationMeaningEnrichment: {
      version: "reading-g-relation-meanings-v1",
      updatedAt: generatedAt,
      ...relationMeaningStats
    },
    relationAudit: {
      version: "reading-g-relation-audit-v1",
      updatedAt: generatedAt,
      ...relationAuditStats
    }
  };
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function loadInputs() {
  const [vocabText, reportText, compactionText] = await Promise.all([
    readFile(VOCAB_FILE, "utf8"),
    readFile(REPORT_FILE, "utf8"),
    readFile(COMPACTION_FILE, "utf8")
  ]);
  return {
    vocabText,
    reportText,
    compactionText,
    vocab: JSON.parse(vocabText),
    report: JSON.parse(reportText),
    compaction: JSON.parse(compactionText)
  };
}

async function writeWithBackup(inputs, nextVocab, nextReport, nextCompaction, generatedAt, mergePlan) {
  const stamp = generatedAt.replace(/[:.]/g, "-");
  const backupDir = path.join(ROOT, "backups", `reading-g-pending-inflection-merge-${stamp}`);
  const reportDir = path.join(ROOT, "reports");
  await mkdir(backupDir, { recursive: true });
  await mkdir(reportDir, { recursive: true });
  await Promise.all([
    copyFile(VOCAB_FILE, path.join(backupDir, path.basename(VOCAB_FILE))),
    copyFile(REPORT_FILE, path.join(backupDir, path.basename(REPORT_FILE))),
    copyFile(COMPACTION_FILE, path.join(backupDir, path.basename(COMPACTION_FILE)))
  ]);
  try {
    await writeFile(VOCAB_FILE, json(nextVocab), "utf8");
    await writeFile(REPORT_FILE, json(nextReport), "utf8");
    await writeFile(COMPACTION_FILE, json(nextCompaction), "utf8");
  } catch (error) {
    await Promise.all([
      writeFile(VOCAB_FILE, inputs.vocabText, "utf8"),
      writeFile(REPORT_FILE, inputs.reportText, "utf8"),
      writeFile(COMPACTION_FILE, inputs.compactionText, "utf8")
    ]);
    throw error;
  }
  const auditFile = path.join(reportDir, `reading-g-pending-inflection-merge-${stamp}.json`);
  await writeFile(auditFile, json({ generatedAt, backupDir, ...mergePlan }), "utf8");
  return { backupDir, auditFile };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const inputs = await loadInputs();
  const mergePlan = buildPendingInflectionMergePlan(inputs.vocab.items, inputs.compaction);
  if (mergePlan.conflicts.length) {
    throw new Error(`G-only inflection merge has ${mergePlan.conflicts.length} unresolved owner conflicts.`);
  }
  if (!mergePlan.mergeCount) {
    process.stdout.write(`${JSON.stringify({
      mode: apply ? "apply-noop" : "dry-run",
      scope: mergePlan.scope,
      pendingBefore: mergePlan.pendingBefore,
      safeMergeCount: 0,
      pendingAfter: mergePlan.pendingAfter,
      reviewWords: mergePlan.reviewWords
    }, null, 2)}\n`);
    return;
  }
  for (const blocked of ["career", "cooler", "dryer", "litter", ...RETAINED_REVIEW_WORDS]) {
    if (mergePlan.mappings.some((row) => row.aliasKey === blocked)) {
      throw new Error(`Unsafe or retained word was selected: ${blocked}`);
    }
  }

  const generatedAt = new Date().toISOString();
  const nextCompaction = appendMappingsToCompaction(inputs.compaction, mergePlan, generatedAt);
  const compacted = applyReadingGCompaction(inputs.vocab.items, nextCompaction);
  if (compacted.stats.removedIndependentWordCount !== mergePlan.mergeCount) {
    throw new Error(`Expected to merge ${mergePlan.mergeCount}, but compaction removed ${compacted.stats.removedIndependentWordCount}.`);
  }
  const enriched = enrichReadingGRelationMeanings(compacted.items, new Map());
  const sanitized = sanitizeReadingGRelations(enriched.items, new Map());
  const nextVocab = updateDataset(
    inputs.vocab,
    sanitized.items,
    mergePlan,
    compacted.stats,
    enriched.stats,
    sanitized.stats,
    generatedAt
  );
  if (nextVocab.pendingIndependentCount !== mergePlan.pendingAfter) {
    throw new Error(`Expected ${mergePlan.pendingAfter} pending entries, got ${nextVocab.pendingIndependentCount}.`);
  }
  if (nextVocab.phraseCount !== inputs.vocab.phraseCount) throw new Error("Phrase count changed unexpectedly.");
  const finalWords = new Map(
    nextVocab.items
      .filter((entry) => (entry?.entryType || "word") === "word")
      .map((entry) => [normalizeReadingGKey(entry?.normalizedKey || entry?.word), entry])
  );
  for (const mapping of mergePlan.mappings) {
    if (finalWords.has(mapping.aliasKey)) throw new Error(`Merged alias still exists independently: ${mapping.aliasKey}`);
    const owner = finalWords.get(mapping.ownerKey);
    const represented = [...asArray(owner?.forms), ...asArray(owner?.wordFamily)]
      .some((row) => normalizeReadingGKey(relationWord(row)) === mapping.aliasKey);
    if (!represented) throw new Error(`Merged alias is not represented under its G owner: ${mapping.aliasKey}`);
  }
  for (const reviewWord of mergePlan.reviewWords) {
    if (!finalWords.has(reviewWord)) throw new Error(`Review word was removed unexpectedly: ${reviewWord}`);
  }

  const nextReport = {
    ...inputs.report,
    generatedAt,
    layerStats: nextVocab.layerStats,
    summary: {
      ...inputs.report.summary,
      itemCount: nextVocab.count,
      wordCount: nextVocab.wordCount,
      phraseCount: nextVocab.phraseCount,
      activeCount: nextVocab.activeCount,
      referenceOnlyCount: nextVocab.referenceCount,
      multiSenseCount: nextVocab.multiSenseCount
    },
    questionBankExpansion: nextVocab.questionBankExpansion,
    wordFamilyCompaction: nextVocab.wordFamilyCompaction,
    pendingInflectionMerge: nextVocab.pendingInflectionMerge,
    relationMeaningEnrichment: nextVocab.relationMeaningEnrichment,
    relationAudit: nextVocab.relationAudit
  };
  const compactionText = json(nextCompaction);
  nextReport.sourceFiles = {
    ...nextReport.sourceFiles,
    "public/data/reading-g-word-family-compaction.json": {
      ...(nextReport.sourceFiles?.["public/data/reading-g-word-family-compaction.json"] || {}),
      bytes: Buffer.byteLength(compactionText),
      sha256: sha256(compactionText),
      rawCount: nextCompaction.rules.length,
      role: "reading_g_internal_word_family_compaction",
      removedIndependentWordCount: mergePlan.mergeCount
    }
  };

  const output = {
    mode: apply ? "apply" : "dry-run",
    scope: mergePlan.scope,
    pendingBefore: mergePlan.pendingBefore,
    safeMergeCount: mergePlan.mergeCount,
    pendingAfter: nextVocab.pendingIndependentCount,
    wordCountBefore: inputs.vocab.wordCount,
    wordCountAfter: nextVocab.wordCount,
    phraseCount: nextVocab.phraseCount,
    reviewWords: mergePlan.reviewWords,
    countsByType: mergePlan.countsByType
  };

  if (apply) {
    const files = await writeWithBackup(inputs, nextVocab, nextReport, nextCompaction, generatedAt, mergePlan);
    Object.assign(output, files);
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
