import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyReadingGCompaction
} from "../app/lib/reading-g-vocab/compaction.mjs";
import {
  buildItemKeyIndex
} from "../app/lib/reading-g-vocab/migration.mjs";
import {
  normalizeReadingGKey,
  stableReadingGId
} from "../app/lib/reading-g-vocab/normalize.mjs";
import {
  countStageUniques
} from "../app/lib/reading-g-vocab/stages.mjs";
import {
  classifySurfaceInflection
} from "../app/lib/vocab/word-surface-morphology.mjs";
import {
  applyReadingGQuestionBankExpansion
} from "./expand-reading-g-question-bank.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VOCAB_PATH = path.join(ROOT, "public", "data", "reading-g-vocab.json");
const REPORT_PATH = path.join(ROOT, "public", "data", "reading-g-import-report.json");
const COMPACTION_PATH = path.join(ROOT, "public", "data", "reading-g-word-family-compaction.json");
const RETIREMENTS_PATH = path.join(ROOT, "public", "data", "reading-g-retirements.json");
const MASTER_PATH = path.join(ROOT, "public", "data", "words.json");
const EXAMPLE_REPAIRS_PATH = path.join(ROOT, "scripts", "data", "reading-g-example-repairs.json");
const BACKUPS_ROOT = path.join(ROOT, "backups");
const REPORTS_ROOT = path.join(ROOT, "reports");
const VERSION = "reading-g-word-only-inflection-review-v2-20260804";

const FORCED_STANDALONE = new Set([
  "accepted", "accomplished", "accounting", "aids", "applied", "arms",
  "athletics", "belonging", "breeding", "casting", "clothes", "coloured",
  "committed", "commons", "composed", "concerned", "confines", "consulting",
  "contents", "customs", "cuttings", "dedicated", "developed", "developing",
  "devoted", "distinguished", "drawing", "dynamics", "effects", "endangered",
  "established", "exhausted", "expecting", "farming", "filing", "fittings",
  "following", "fulfilled", "funding", "gathering", "gifted", "granted",
  "graphics", "housing", "hundreds", "informed", "interested", "interesting",
  "involved", "leading", "leaves", "lots", "manufacturing", "marketing",
  "minutes", "nowadays", "offering", "ones", "organised", "overalls", "packed",
  "painting", "poisoning", "premises", "pressed", "pros", "provided",
  "publishing", "qualified", "quarters", "refreshing", "regards", "related",
  "relaxed", "rewarding", "sales", "satisfied", "savings", "screening",
  "shooting", "shorts", "smelt", "sporting", "standing", "striking",
  "suffering", "sustained", "teaching", "tested", "thinking", "thought",
  "troubled", "trousers", "twisted", "understanding", "undertaking", "varied",
  "woods", "worried", "writing"
]);

const SUPPRESSED_NONWORDS = new Set(["serv"]);
const FORCED_GRAMMAR_ONLY = new Set(["fishermen", "trouser"]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value == null ? "" : value).trim();
}

function keyOf(value) {
  return normalizeReadingGKey(value?.normalizedKey || value?.key || value?.word || value);
}

function uniqueText(values) {
  return [...new Set(asArray(values).map(text).filter(Boolean))];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function atomicWrite(filePath, value) {
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, value, "utf8");
  fs.renameSync(temporary, filePath);
}

function relationWord(value) {
  return typeof value === "string"
    ? text(value)
    : text(value?.word || value?.form || value?.value || value?.key);
}

function entryMeaning(entry) {
  return text(entry?.primaryMeaningZh || entry?.meaning || entry?.meaningZh || entry?.definition);
}

function entryPos(entry) {
  return text(entry?.primaryPos || entry?.pos).toLowerCase();
}

function hasPos(entry, pattern) {
  return pattern.test(entryPos(entry));
}

function masterWords(payload) {
  return Array.isArray(payload) ? payload : asArray(payload?.words);
}

function listBackupVocabFiles() {
  if (!fs.existsSync(BACKUPS_ROOT)) return [];
  return fs.readdirSync(BACKUPS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const directory = path.join(BACKUPS_ROOT, entry.name);
      return fs.readdirSync(directory, { withFileTypes: true })
        .filter((file) => file.isFile() && /^reading-g-vocab\.json(?:\.before)?$/.test(file.name))
        .map((file) => path.join(directory, file.name));
    });
}

function buildHistoricalEntryIndex(aliasKeys) {
  const index = new Map();
  for (const filePath of listBackupVocabFiles()) {
    let payload;
    try {
      payload = readJson(filePath);
    } catch {
      continue;
    }
    for (const entry of asArray(payload?.items)) {
      const key = keyOf(entry);
      if (!aliasKeys.has(key) || (entry?.entryType || "word") !== "word") continue;
      const completeness = JSON.stringify(entry).length;
      if (!index.has(key) || completeness > index.get(key).completeness) {
        index.set(key, { entry, filePath, completeness });
      }
    }
  }
  return index;
}

function recomputeTotals(items) {
  const words = items.filter((entry) => (entry?.entryType || "word") === "word");
  const phrases = items.filter((entry) => entry?.entryType === "phrase");
  return {
    count: items.length,
    wordCount: words.length,
    phraseCount: phrases.length,
    activeCount: items.filter((entry) => entry?.studyMode !== "reference").length,
    referenceCount: items.filter((entry) => entry?.studyMode === "reference").length,
    multiSenseCount: items.filter((entry) => asArray(entry?.senses).length > 1).length
  };
}

function relationSnapshotByKey(items) {
  const snapshots = new Map();
  for (const owner of items) {
    for (const snapshot of asArray(owner?.mergedEntries)) {
      const key = keyOf(snapshot);
      if (key && !snapshots.has(key)) snapshots.set(key, snapshot);
    }
  }
  return snapshots;
}

function senseTokens(value) {
  return text(value)
    .normalize("NFKC")
    .toLowerCase()
    .split(/[；;，,、。]+/u)
    .map((token) => token.replace(/\s+/g, ""))
    .filter(Boolean);
}

function dedupeContainedSenses(senses) {
  const source = asArray(senses).filter((sense) => sense && typeof sense === "object");
  return source.filter((sense, index) => {
    const ownTokens = senseTokens(sense?.meaningZh || sense?.meaning);
    if (!ownTokens.length) return true;
    const ownSet = new Set(ownTokens);
    return !source.some((candidate, candidateIndex) => {
      if (candidateIndex === index || text(candidate?.pos) !== text(sense?.pos)) return false;
      const candidateTokens = senseTokens(candidate?.meaningZh || candidate?.meaning);
      if (!candidateTokens.length) return false;
      const candidateSet = new Set(candidateTokens);
      const ownContained = ownTokens.every((token) => candidateSet.has(token));
      if (!ownContained) return false;
      return candidateTokens.length > ownTokens.length
        || (candidateTokens.length === ownTokens.length && candidateIndex < index);
    });
  });
}

function applyEditorialRepairs(items, repairPayload) {
  const repairsById = new Map(asArray(repairPayload?.repairs).map((repair) => [text(repair?.id), repair]));
  const repairEntry = (entry) => {
    const repair = repairsById.get(text(entry?.id));
    const mergedEntries = asArray(entry?.mergedEntries).map(repairEntry);
    if (!repair) return { ...entry, mergedEntries };
    return {
      ...entry,
      example: text(repair.example),
      exampleCn: text(repair.exampleCn),
      exampleZh: text(repair.exampleCn),
      mergedEntries
    };
  };
  return asArray(items).map(repairEntry);
}

function sanitizeFinalTeachingRows(items, repairPayload) {
  return applyEditorialRepairs(items, repairPayload).map((entry) => ({
    ...entry,
    senses: dedupeContainedSenses(entry?.senses),
    mergedEntries: asArray(entry?.mergedEntries).map((snapshot) => ({
      ...snapshot,
      senses: dedupeContainedSenses(snapshot?.senses)
    }))
  }));
}

function buildExpandedEntry({ key, alias, owner, snapshot, master, historical }) {
  const historic = historical ? structuredClone(historical.entry) : null;
  const source = historic || (master ? structuredClone(master) : {});
  const id = text(alias?.id || snapshot?.id || historic?.id) || stableReadingGId("word", key);
  const word = text(alias?.word || snapshot?.word || historic?.word || master?.word || key);
  const meaning = text(
    snapshot?.meaning
    || historic?.primaryMeaningZh
    || historic?.meaning
    || master?.meaning
    || master?.primaryMeaningZh
  ) || `与 ${text(owner?.word)} 相关的词形`;
  const pos = text(snapshot?.pos || historic?.primaryPos || historic?.pos || master?.pos || master?.primaryPos) || "word";
  const layers = uniqueText([
    ...asArray(snapshot?.layers),
    ...asArray(historic?.layers),
    ...(!snapshot?.layers?.length && !historic?.layers?.length ? asArray(owner?.layers) : [])
  ]);
  const activeLayers = layers.filter((layer) => !["reference701", "questionBankPending"].includes(layer));

  return {
    ...source,
    id,
    wordId: id,
    sourceWordId: text(source?.sourceWordId || master?.wordId || master?.id),
    word,
    normalizedKey: key,
    entryType: "word",
    isPhrase: false,
    studyMode: activeLayers.length || !layers.length ? "active" : "reference",
    primaryMeaningZh: meaning,
    primaryPos: pos,
    meaning,
    pos,
    definition: text(snapshot?.definition || source?.definition) || meaning,
    example: text(snapshot?.example || source?.example),
    exampleZh: text(snapshot?.exampleZh || source?.exampleZh || source?.exampleCn),
    exampleCn: text(snapshot?.exampleZh || source?.exampleCn || source?.exampleZh),
    forms: asArray(source?.forms),
    wordFamily: asArray(source?.wordFamily),
    layers,
    primaryLayer: text(historic?.primaryLayer || layers[0] || owner?.primaryLayer || "formsFamilyStandalone"),
    sourceFiles: uniqueText([
      ...asArray(snapshot?.sourceFiles),
      ...asArray(source?.sourceFiles),
      ...(master ? ["public/data/words.json"] : [])
    ]),
    qualityFlags: uniqueText([
      ...asArray(snapshot?.qualityFlags).filter((flag) => !(master && flag === "missing_master_lexicon")),
      ...asArray(source?.qualityFlags).filter((flag) => flag !== "missing_master_lexicon"),
      ...(master ? ["master_lexicon_reused"] : []),
      "word_only_inflection_review_expanded"
    ])
  };
}

function cleanRelationRow(value, word, kind = "") {
  const source = value && typeof value === "object" ? structuredClone(value) : {};
  const row = { ...source, word };
  delete row.entryId;
  delete row.relationType;
  if (row.relation === "merged-independent-entry") delete row.relation;
  if (row.type === "merged-form" || !text(row.type)) {
    row.type = kind || "related word";
  }
  return row;
}

function cleanExpandedMorphology(items) {
  let movedFormsToFamily = 0;
  let movedFamilyToForms = 0;
  let duplicateRelationsRemoved = 0;
  const cleaned = items.map((entry) => {
    if ((entry?.entryType || "word") !== "word") return entry;
    const headword = keyOf(entry);
    const forms = new Map();
    const family = new Map();
    const add = (value, originalBucket) => {
      const word = relationWord(value);
      const key = normalizeReadingGKey(word);
      if (!key || key === headword) return;
      const kind = classifySurfaceInflection(headword, key);
      const target = kind ? forms : family;
      const other = kind ? family : forms;
      if (target.has(key) || other.has(key)) {
        duplicateRelationsRemoved += 1;
        return;
      }
      target.set(key, cleanRelationRow(value, word, kind));
      if (kind && originalBucket === "family") movedFamilyToForms += 1;
      if (!kind && originalBucket === "forms") movedFormsToFamily += 1;
    };
    asArray(entry?.forms).forEach((row) => add(row, "forms"));
    asArray(entry?.wordFamily).forEach((row) => add(row, "family"));
    return {
      ...entry,
      forms: [...forms.values()],
      wordFamily: [...family.values()],
      mergedAliases: [],
      mergedEntries: []
    };
  });
  return {
    items: cleaned,
    stats: { movedFormsToFamily, movedFamilyToForms, duplicateRelationsRemoved }
  };
}

function semanticStandalone(aliasKey, kind, master) {
  if (FORCED_GRAMMAR_ONLY.has(aliasKey)) return { standalone: false, reason: "grammar-only-exception" };
  if (FORCED_STANDALONE.has(aliasKey)) return { standalone: true, reason: "curated-lexicalised-use" };
  if (!kind) return { standalone: true, reason: "not-a-direct-inflection" };
  const isIndependentMaster = master && master.entryType !== "inflected-form";
  if (!isIndependentMaster) return { standalone: false, reason: "regular-grammar-form" };
  if (kind === "present-participle" && hasPos(master, /noun|adjective|preposition|(^|\/)n(\/|$)|adj/)) {
    return { standalone: true, reason: "lexicalised-ing-headword" };
  }
  if (kind === "past-or-past-participle" && hasPos(master, /noun|adjective|(^|\/)n(\/|$)|adj/)) {
    return { standalone: true, reason: "lexicalised-participle-headword" };
  }
  if (kind === "irregular" && hasPos(master, /noun|adjective|(^|\/)n(\/|$)|adj/)) {
    return { standalone: true, reason: "irregular-form-with-independent-use" };
  }
  return { standalone: false, reason: "regular-grammar-form" };
}

function findClosestBase(aliasKey, componentKeys, allKeys = componentKeys) {
  const candidates = new Set([...componentKeys, ...allKeys]);
  return [...candidates]
    .filter((candidate) => candidate !== aliasKey)
    .map((candidate) => ({
      key: candidate,
      kind: classifySurfaceInflection(candidate, aliasKey)
    }))
    .filter((candidate) => candidate.kind)
    .sort((left, right) => right.key.length - left.key.length || left.key.localeCompare(right.key))[0] || null;
}

function buildReviewPlan({ expandedItems, originalCompaction, currentWordKeys, retiredKeys, masterByKey }) {
  const expandedByKey = new Map(
    expandedItems
      .filter((entry) => (entry?.entryType || "word") === "word")
      .map((entry) => [keyOf(entry), entry])
  );
  const mappings = [];
  const standalone = [];
  const suppressedRules = [];
  const suppressedAliasesByCanonical = new Map();
  const decisions = [];
  const allExpandedKeys = new Set(expandedByKey.keys());

  for (const rule of asArray(originalCompaction?.rules)) {
    const originalCanonical = keyOf(rule?.canonicalKey || rule?.canonicalWord);
    if (!currentWordKeys.has(originalCanonical)) {
      const stillSuppressed = [];
      for (const alias of asArray(rule?.aliases)) {
        const aliasKey = keyOf(alias);
        const kind = classifySurfaceInflection(originalCanonical, aliasKey);
        const aliasRetired = retiredKeys.has(`word::${aliasKey}`);
        if (aliasRetired || kind || !expandedByKey.has(aliasKey)) {
          stillSuppressed.push({ ...alias, relationType: "form" });
          continue;
        }
        standalone.push(aliasKey);
        decisions.push({
          aliasKey,
          previousCanonical: originalCanonical,
          outcome: "standalone",
          reason: "independent-derivation-of-retired-canonical",
          inferredBase: originalCanonical,
          inflectionKind: "",
          meaning: entryMeaning(expandedByKey.get(aliasKey))
        });
      }
      if (stillSuppressed.length) {
        suppressedRules.push({
          ...structuredClone(rule),
          suppressionOnly: true,
          suppressionReason: "canonical-retired-by-user",
          aliases: stillSuppressed
        });
      }
      continue;
    }
    const componentKeys = new Set([
      originalCanonical,
      ...asArray(rule?.aliases).map(keyOf).filter((key) => expandedByKey.has(key))
    ]);
    for (const alias of asArray(rule?.aliases)) {
      const aliasKey = keyOf(alias);
      if (!aliasKey || retiredKeys.has(`word::${aliasKey}`) || !expandedByKey.has(aliasKey)) continue;
      if (SUPPRESSED_NONWORDS.has(aliasKey)) {
        if (!suppressedAliasesByCanonical.has(originalCanonical)) suppressedAliasesByCanonical.set(originalCanonical, []);
        suppressedAliasesByCanonical.get(originalCanonical).push({ ...alias, relationType: "form" });
        decisions.push({
          aliasKey,
          previousCanonical: originalCanonical,
          outcome: "suppressed",
          reason: "invalid-fragment",
          inferredBase: "",
          inflectionKind: "",
          meaning: entryMeaning(expandedByKey.get(aliasKey))
        });
        continue;
      }
      const closest = findClosestBase(aliasKey, componentKeys, allExpandedKeys);
      const master = masterByKey.get(aliasKey) || null;
      const semantic = semanticStandalone(aliasKey, closest?.kind || "", master);
      if (!closest || semantic.standalone) {
        standalone.push(aliasKey);
        decisions.push({
          aliasKey,
          previousCanonical: originalCanonical,
          outcome: "standalone",
          reason: semantic.reason,
          inferredBase: closest?.key || "",
          inflectionKind: closest?.kind || "",
          meaning: entryMeaning(expandedByKey.get(aliasKey))
        });
        continue;
      }
      mappings.push({
        canonicalKey: closest.key,
        aliasKey,
        kind: closest.kind,
        previousCanonical: originalCanonical
      });
      decisions.push({
        aliasKey,
        previousCanonical: originalCanonical,
        outcome: "merged",
        reason: "direct-grammar-inflection",
        inferredBase: closest.key,
        inflectionKind: closest.kind,
        meaning: entryMeaning(expandedByKey.get(aliasKey))
      });
    }

    const reversedBase = findClosestBase(originalCanonical, componentKeys, componentKeys);
    if (reversedBase && !mappings.some((mapping) => mapping.aliasKey === originalCanonical)) {
      const canonicalMaster = masterByKey.get(originalCanonical) || null;
      const semantic = semanticStandalone(originalCanonical, reversedBase.kind, canonicalMaster);
      if (!semantic.standalone) {
        mappings.push({
          canonicalKey: reversedBase.key,
          aliasKey: originalCanonical,
          kind: reversedBase.kind,
          previousCanonical: originalCanonical
        });
        decisions.push({
          aliasKey: originalCanonical,
          previousCanonical: originalCanonical,
          outcome: "merged",
          reason: "reversed-direction-corrected",
          inferredBase: reversedBase.key,
          inflectionKind: reversedBase.kind,
          meaning: entryMeaning(expandedByKey.get(originalCanonical))
        });
      }
    }
  }

  const aliasesThatOwnForms = new Set(mappings.map((mapping) => mapping.canonicalKey));
  const mappingsByAlias = new Map(mappings.map((mapping) => [mapping.aliasKey, mapping]));
  for (const base of aliasesThatOwnForms) {
    const baseMapping = mappingsByAlias.get(base);
    if (!baseMapping) continue;
    mappingsByAlias.delete(base);
    standalone.push(base);
    decisions.push({
      aliasKey: base,
      previousCanonical: baseMapping.previousCanonical,
      outcome: "standalone",
      reason: "required-as-inflection-base",
      inferredBase: baseMapping.canonicalKey,
      inflectionKind: baseMapping.kind,
      meaning: entryMeaning(expandedByKey.get(base))
    });
  }

  const rulesByCanonical = new Map();
  for (const mapping of mappingsByAlias.values()) {
    const canonical = expandedByKey.get(mapping.canonicalKey);
    const alias = expandedByKey.get(mapping.aliasKey);
    if (!canonical || !alias) continue;
    if (!rulesByCanonical.has(mapping.canonicalKey)) {
      rulesByCanonical.set(mapping.canonicalKey, {
        canonicalKey: mapping.canonicalKey,
        canonicalId: text(canonical.id),
        canonicalWord: text(canonical.word),
        aliases: []
      });
    }
    rulesByCanonical.get(mapping.canonicalKey).aliases.push({
      key: mapping.aliasKey,
      id: text(alias.id),
      word: text(alias.word),
      relationType: "form"
    });
  }
  const activeRules = [...rulesByCanonical.values()]
    .map((rule) => ({
      ...rule,
      aliases: rule.aliases.sort((left, right) => left.key.localeCompare(right.key))
    }))
    .sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey));
  const fragmentSuppressionRules = [...suppressedAliasesByCanonical.entries()].map(([canonicalKey, aliases]) => {
    const canonical = expandedByKey.get(canonicalKey);
    return {
      canonicalKey,
      canonicalId: text(canonical?.id),
      canonicalWord: text(canonical?.word || canonicalKey),
      suppressionOnly: true,
      suppressionReason: "invalid-fragment",
      aliases
    };
  });
  const rules = [...activeRules, ...fragmentSuppressionRules, ...suppressedRules]
    .sort((left, right) => keyOf(left?.canonicalKey || left?.canonicalWord).localeCompare(keyOf(right?.canonicalKey || right?.canonicalWord)));

  return {
    mappings: [...mappingsByAlias.values()],
    standalone: [...new Set(standalone)].sort(),
    decisions: decisions.sort((left, right) => left.aliasKey.localeCompare(right.aliasKey)),
    activeRules,
    rules,
    suppressedRuleCount: suppressedRules.length + fragmentSuppressionRules.length
  };
}

function main() {
  const write = process.argv.includes("--write");
  const generatedAt = new Date().toISOString();
  const vocabText = fs.readFileSync(VOCAB_PATH, "utf8");
  const reportText = fs.readFileSync(REPORT_PATH, "utf8");
  const compactionText = fs.readFileSync(COMPACTION_PATH, "utf8");
  const vocab = JSON.parse(vocabText);
  const report = JSON.parse(reportText);
  const originalCompaction = JSON.parse(compactionText);
  const retirements = readJson(RETIREMENTS_PATH);
  const masterPayload = readJson(MASTER_PATH);
  const exampleRepairs = readJson(EXAMPLE_REPAIRS_PATH);
  const masterByKey = new Map(masterWords(masterPayload).map((entry) => [keyOf(entry), entry]));
  const retiredKeys = new Set(asArray(retirements?.entries).map((entry) => text(entry?.key)));
  const currentWords = asArray(vocab?.items).filter((entry) => (entry?.entryType || "word") === "word");
  const recordedPriorVisibleWordCount = Number(vocab?.wordOnlyInflectionReview?.priorVisibleWordCount);
  const priorVisibleWordCount = Number.isInteger(recordedPriorVisibleWordCount)
    ? recordedPriorVisibleWordCount
    : currentWords.length;
  const previousAudit = vocab?.wordOnlyInflectionReview || {};
  const currentWordKeys = new Set(currentWords.map(keyOf));
  const aliases = asArray(originalCompaction?.rules).flatMap((rule) => (
    asArray(rule?.aliases).map((alias) => ({ rule, alias, key: keyOf(alias) }))
  ));
  const aliasKeys = new Set(aliases.map((row) => row.key).filter(Boolean));
  const historicalByKey = buildHistoricalEntryIndex(aliasKeys);
  const snapshotsByKey = relationSnapshotByKey(vocab.items);
  const ownerByCanonical = new Map(currentWords.map((entry) => [keyOf(entry), entry]));
  const expandedAdditions = [];
  const expandedKeys = new Set(currentWordKeys);

  for (const { rule, alias, key } of aliases) {
    const canonicalKey = keyOf(rule?.canonicalKey || rule?.canonicalWord);
    const owner = ownerByCanonical.get(canonicalKey);
    const orphanInflectionKind = owner ? "" : classifySurfaceInflection(canonicalKey, key);
    if (!key || expandedKeys.has(key) || retiredKeys.has(`word::${key}`) || SUPPRESSED_NONWORDS.has(key) || orphanInflectionKind) continue;
    expandedAdditions.push(buildExpandedEntry({
      key,
      alias,
      owner: owner || { word: canonicalKey, primaryLayer: "formsFamilyStandalone", layers: [] },
      snapshot: snapshotsByKey.get(key) || null,
      master: masterByKey.get(key) || null,
      historical: historicalByKey.get(key) || null
    }));
    expandedKeys.add(key);
  }

  const expanded = cleanExpandedMorphology([...vocab.items, ...expandedAdditions]);
  const review = buildReviewPlan({
    expandedItems: expanded.items,
    originalCompaction,
    currentWordKeys,
    retiredKeys,
    masterByKey
  });
  const nextCompaction = {
    ...originalCompaction,
    version: VERSION,
    generatedAt,
    updatedAt: generatedAt,
    scope: "reading-g-direct-inflections-only-word-derived-no-family-compaction",
    sourceWordCount: expanded.items.filter((entry) => (entry?.entryType || "word") === "word").length,
    resultingWordCount: expanded.items.filter((entry) => (entry?.entryType || "word") === "word").length - review.mappings.length,
    rules: review.rules,
    stats: {
      familyCount: review.rules.length,
      aliasCount: review.rules.reduce((sum, rule) => sum + asArray(rule?.aliases).length, 0),
      activeInflectionRuleCount: review.activeRules.length,
      activeInflectionAliasCount: review.mappings.length,
      standaloneRestoredCount: Math.max(
        0,
        expanded.items.filter((entry) => (entry?.entryType || "word") === "word").length
          - review.mappings.length
          - priorVisibleWordCount
      ),
      suppressedDeletedCanonicalRuleCount: review.suppressedRuleCount,
      relationTypes: { form: review.mappings.length, family: 0 }
    }
  };
  const compacted = applyReadingGCompaction(expanded.items, nextCompaction);
  const refreshedVocab = { ...structuredClone(vocab), items: compacted.items };
  const refreshedReport = structuredClone(report);
  applyReadingGQuestionBankExpansion({
    vocab: refreshedVocab,
    report: refreshedReport,
    projectRoot: ROOT,
    compactionPayloadOverride: nextCompaction
  });
  const finalItems = sanitizeFinalTeachingRows(refreshedVocab.items, exampleRepairs);
  const totals = recomputeTotals(finalItems);
  const stageCounts = countStageUniques(finalItems);
  const auditMeta = {
    version: VERSION,
    updatedAt: generatedAt,
    scope: "reading-g-only; direct inflections merge; word families and lexicalised forms stay standalone",
    priorVisibleWordCount,
    historicalAliasesReviewed: Math.max(Number(previousAudit.historicalAliasesReviewed) || 0, aliases.length),
    expandedAliasCount: Math.max(Number(previousAudit.expandedAliasCount) || 0, expandedAdditions.length),
    keptMergedInflectionCount: review.mappings.length,
    restoredStandaloneCount: totals.wordCount - priorVisibleWordCount,
    standaloneDecisionCount: totals.wordCount - priorVisibleWordCount,
    suppressedDeletedCanonicalRuleCount: review.suppressedRuleCount,
    relationReclassification: {
      movedFormsToFamily: Math.max(
        Number(previousAudit?.relationReclassification?.movedFormsToFamily) || 0,
        expanded.stats.movedFormsToFamily
      ),
      movedFamilyToForms: Math.max(
        Number(previousAudit?.relationReclassification?.movedFamilyToForms) || 0,
        expanded.stats.movedFamilyToForms
      ),
      duplicateRelationsRemoved: Math.max(
        Number(previousAudit?.relationReclassification?.duplicateRelationsRemoved) || 0,
        expanded.stats.duplicateRelationsRemoved
      )
    },
    stageCounts
  };
  const nextVocab = {
    ...refreshedVocab,
    ...totals,
    items: finalItems,
    reviewedInflectionMerge: auditMeta,
    wordOnlyInflectionReview: auditMeta
  };
  const nextReport = {
    ...refreshedReport,
    itemCount: totals.count,
    wordCount: totals.wordCount,
    phraseCount: totals.phraseCount,
    activeCount: totals.activeCount,
    referenceCount: totals.referenceCount,
    reviewedInflectionMerge: auditMeta,
    wordOnlyInflectionReview: auditMeta
  };
  const compactionOutput = json(nextCompaction);
  nextReport.sourceFiles = nextReport.sourceFiles || {};
  nextReport.sourceFiles["public/data/reading-g-word-family-compaction.json"] = {
    ...(nextReport.sourceFiles["public/data/reading-g-word-family-compaction.json"] || {}),
    bytes: Buffer.byteLength(compactionOutput),
    sha256: sha256(compactionOutput),
    rawCount: nextCompaction.rules.length,
    role: "reading_g_direct_inflections_only",
    removedIndependentWordCount: review.mappings.length
  };

  const finalWords = finalItems.filter((entry) => (entry?.entryType || "word") === "word");
  const finalKeys = new Set(finalWords.map(keyOf));
  const finalIds = finalWords.map((entry) => text(entry?.id));
  assert(finalKeys.size === finalWords.length, "Duplicate visible word keys after review.");
  assert(new Set(finalIds).size === finalIds.length, "Duplicate visible word ids after review.");
  assert(totals.phraseCount === vocab.phraseCount, "Phrase count changed.");
  assert(review.mappings.every((mapping) => classifySurfaceInflection(mapping.canonicalKey, mapping.aliasKey)), "Non-inflection remained merged.");
  assert(review.rules.every((rule) => asArray(rule.aliases).every((alias) => alias.relationType !== "family")), "Family alias remained in compaction.");
  assert(review.standalone.every((key) => finalKeys.has(key) || retiredKeys.has(`word::${key}`)), "Standalone decision is not visible.");
  const finalIndex = buildItemKeyIndex(finalItems);
  for (const mapping of review.mappings) {
    const owner = finalIndex.byNorm.get(mapping.aliasKey) || [];
    assert(owner.some((entry) => keyOf(entry) === mapping.canonicalKey), `Alias ${mapping.aliasKey} does not resolve to ${mapping.canonicalKey}.`);
  }

  const reasonCounts = {};
  for (const decision of review.decisions) {
    reasonCounts[decision.reason] = (reasonCounts[decision.reason] || 0) + 1;
  }
  const output = {
    mode: write ? "write" : "dry-run",
    version: VERSION,
    before: recomputeTotals(vocab.items),
    after: totals,
    stageCounts,
    reviewedAliases: aliases.length,
    expandedAliases: expandedAdditions.length,
    keptMergedInflections: review.mappings.length,
    restoredStandalone: totals.wordCount - priorVisibleWordCount,
    standaloneDecisions: review.standalone.length,
    suppressedDeletedCanonicalRules: review.suppressedRuleCount,
    relationReclassification: expanded.stats,
    reasonCounts,
    standaloneWords: review.standalone
  };

  if (write) {
    const stamp = generatedAt.replace(/[:.]/g, "-");
    const backupDir = path.join(BACKUPS_ROOT, `reading-g-word-only-inflection-review-${stamp}`);
    fs.mkdirSync(backupDir, { recursive: true });
    fs.mkdirSync(REPORTS_ROOT, { recursive: true });
    fs.copyFileSync(VOCAB_PATH, path.join(backupDir, path.basename(VOCAB_PATH)));
    fs.copyFileSync(REPORT_PATH, path.join(backupDir, path.basename(REPORT_PATH)));
    fs.copyFileSync(COMPACTION_PATH, path.join(backupDir, path.basename(COMPACTION_PATH)));
    try {
      atomicWrite(VOCAB_PATH, json(nextVocab));
      atomicWrite(REPORT_PATH, json(nextReport));
      atomicWrite(COMPACTION_PATH, compactionOutput);
    } catch (error) {
      atomicWrite(VOCAB_PATH, vocabText);
      atomicWrite(REPORT_PATH, reportText);
      atomicWrite(COMPACTION_PATH, compactionText);
      throw error;
    }
    const auditPath = path.join(REPORTS_ROOT, `reading-g-word-only-inflection-review-${stamp}.json`);
    fs.writeFileSync(auditPath, json({
      generatedAt,
      backupDir,
      ...output,
      decisions: review.decisions,
      keptMappings: review.mappings
    }), "utf8");
    output.backupDir = backupDir;
    output.auditPath = auditPath;
  }

  console.log(JSON.stringify(output, null, 2));
}

main();
