/**
 * G-reading must not create a second flashcard for a surface form that the
 * master lexicon has already classified as a reference-only inflection.
 *
 * The master lexicon remains the authority here.  This module only creates a
 * G-reading compaction plan and, when necessary, asks the caller to materialise
 * the real headword before the alias is compacted into it.
 */
import { normalizeReadingGKey, stableReadingGId } from "./normalize.mjs";
import { normalizeReadingGCompactionPlan } from "./compaction.mjs";
import {
  buildEligibilityWordMap,
  isReferenceWord,
  resolveBrushableWord
} from "../vocab/word-study-eligibility.mjs";
import { getReadingGRetirementKey, normalizeReadingGRetirements } from "./retirements.mjs";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value == null ? "" : value).trim();
}

function wordKey(value) {
  return normalizeReadingGKey(value?.normalizedKey || value?.word || value);
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function wordItemsByKey(items) {
  const byKey = new Map();
  for (const item of asArray(items)) {
    if ((item?.entryType || "word") !== "word") continue;
    const key = wordKey(item);
    if (key && !byKey.has(key)) byKey.set(key, item);
  }
  return byKey;
}

function candidateWords(items, additionalWords) {
  const keys = new Set(asArray(additionalWords).map(wordKey).filter(Boolean));
  for (const item of asArray(items)) {
    if ((item?.entryType || "word") !== "word") continue;
    const key = wordKey(item);
    if (key) keys.add(key);
  }
  return [...keys].sort((left, right) => left.localeCompare(right));
}

/**
 * Finds every G-facing surface word whose exact master record is a reference
 * rather than an independently studyable headword.
 */
export function collectReadingGMasterReferenceForms({
  items = [],
  masterWords = [],
  additionalWords = []
} = {}) {
  const masterByKey = buildEligibilityWordMap(masterWords);
  const itemsByKey = wordItemsByKey(items);
  const candidates = [];
  const unresolved = [];

  for (const aliasKey of candidateWords(items, additionalWords)) {
    const masterAlias = masterByKey.get(aliasKey);
    if (!isReferenceWord(masterAlias)) continue;

    const masterBase = resolveBrushableWord(masterAlias, masterByKey);
    const baseKey = wordKey(masterBase);
    if (!baseKey || baseKey === aliasKey) {
      unresolved.push({
        aliasKey,
        aliasWord: text(masterAlias?.word || aliasKey),
        baseWord: text(masterAlias?.baseWord || masterAlias?.redirectToWord),
        relationType: text(masterAlias?.relationType)
      });
      continue;
    }

    const existingItem = itemsByKey.get(aliasKey) || null;
    candidates.push({
      aliasKey,
      aliasWord: text(existingItem?.word || masterAlias?.word || aliasKey),
      aliasId: text(existingItem?.id) || stableReadingGId("word", aliasKey),
      hasIndependentItem: Boolean(existingItem),
      baseKey,
      baseWord: text(masterBase?.word || baseKey),
      masterAlias,
      masterBase
    });
  }

  return {
    candidates,
    unresolved,
    masterByKey,
    itemsByKey
  };
}

function aliasRow({ key, id, word, relationType = "form" }) {
  return {
    key: normalizeReadingGKey(key || word),
    id: text(id),
    word: text(word || key),
    relationType: relationType === "family" ? "family" : "form"
  };
}

function makeRuleGroup(groups, canonicalKey, itemsByKey, masterByKey) {
  const key = normalizeReadingGKey(canonicalKey);
  if (!key) return null;
  if (groups.has(key)) return groups.get(key);

  const item = itemsByKey.get(key);
  const master = masterByKey.get(key);
  const group = {
    canonicalKey: key,
    canonicalId: text(item?.id) || stableReadingGId("word", key),
    canonicalWord: text(item?.word || master?.word || key),
    aliases: new Map()
  };
  groups.set(key, group);
  return group;
}

function putAlias(group, alias) {
  if (!group) return;
  const row = aliasRow(alias);
  if (!row.key || row.key === group.canonicalKey) return;
  const previous = group.aliases.get(row.key);
  if (!previous) {
    group.aliases.set(row.key, row);
    return;
  }
  // Prefer an actual historic item id if either source has one.  It is the
  // only part required to preserve an existing learner's progress.
  group.aliases.set(row.key, {
    key: row.key,
    id: previous.id || row.id,
    word: previous.word || row.word,
    relationType: previous.relationType === "family" || row.relationType === "family"
      ? "family"
      : "form"
  });
}

function resolveRedirect(key, redirects) {
  let current = normalizeReadingGKey(key);
  const seen = new Set();
  while (redirects.has(current) && !seen.has(current)) {
    seen.add(current);
    const next = redirects.get(current);
    if (!next || next === current) break;
    current = next;
  }
  return current;
}

/**
 * Extends the persisted family-compaction plan with the master lexicon's
 * reference-only forms.  Existing G compaction chains are flattened, so an
 * obsolete intermediate canonical (for example a misspelling) cannot keep a
 * hidden second flashcard alive.
 */
export function buildReadingGMasterReferenceCompactionPlan({
  items = [],
  masterWords = [],
  additionalWords = [],
  compactionPayload = {}
} = {}) {
  const collected = collectReadingGMasterReferenceForms({
    items,
    masterWords,
    additionalWords
  });
  if (collected.unresolved.length) {
    const preview = collected.unresolved
      .slice(0, 8)
      .map((entry) => entry.aliasWord)
      .join(", ");
    throw new Error(`Master reference form has no usable headword: ${preview}`);
  }

  const redirects = new Map(
    collected.candidates.map((entry) => [entry.aliasKey, entry.baseKey])
  );
  const normalized = normalizeReadingGCompactionPlan(compactionPayload);
  const groups = new Map();

  for (const rule of normalized.rules) {
    const originalCanonicalKey = rule.canonicalKey;
    const canonicalKey = resolveRedirect(originalCanonicalKey, redirects);
    const group = makeRuleGroup(
      groups,
      canonicalKey,
      collected.itemsByKey,
      collected.masterByKey
    );

    // If the old canonical itself is a master reference, make it an alias of
    // the real headword and carry all of its former aliases over as well.
    if (canonicalKey !== originalCanonicalKey) {
      const original = collected.itemsByKey.get(originalCanonicalKey);
      const masterOriginal = collected.masterByKey.get(originalCanonicalKey);
      putAlias(group, {
        key: originalCanonicalKey,
        id: text(original?.id || rule.canonicalId) || stableReadingGId("word", originalCanonicalKey),
        word: text(original?.word || masterOriginal?.word || rule.canonicalWord || originalCanonicalKey),
        relationType: "form"
      });
    }

    for (const alias of rule.aliases) {
      const aliasKey = normalizeReadingGKey(alias.key || alias.word);
      const targetKey = redirects.has(aliasKey)
        ? resolveRedirect(aliasKey, redirects)
        : canonicalKey;
      const targetGroup = makeRuleGroup(
        groups,
        targetKey,
        collected.itemsByKey,
        collected.masterByKey
      );
      const currentItem = collected.itemsByKey.get(aliasKey);
      const masterAlias = collected.masterByKey.get(aliasKey);
      putAlias(targetGroup, {
        key: aliasKey,
        id: text(currentItem?.id || alias.id) || stableReadingGId("word", aliasKey),
        word: text(currentItem?.word || masterAlias?.word || alias.word || aliasKey),
        relationType: alias.relationType
      });
    }
  }

  for (const candidate of collected.candidates) {
    const targetKey = resolveRedirect(candidate.baseKey, redirects);
    const group = makeRuleGroup(
      groups,
      targetKey,
      collected.itemsByKey,
      collected.masterByKey
    );
    putAlias(group, {
      key: candidate.aliasKey,
      id: candidate.aliasId,
      word: candidate.aliasWord,
      relationType: "form"
    });
  }

  const rules = [...groups.values()]
    .map((group) => ({
      canonicalKey: group.canonicalKey,
      canonicalId: group.canonicalId,
      canonicalWord: group.canonicalWord,
      aliases: [...group.aliases.values()].sort((left, right) => left.key.localeCompare(right.key))
    }))
    .filter((rule) => rule.aliases.length)
    .sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey));

  const mappedIndependentCount = collected.candidates.filter((entry) => entry.hasIndependentItem).length;
  const baseKeys = [...new Set(collected.candidates.map((entry) => entry.baseKey))];
  const missingBaseKeys = baseKeys.filter((key) => !collected.itemsByKey.has(key));
  const nextPayload = {
    ...clone(compactionPayload),
    version: text(compactionPayload?.version || normalized.version),
    rules,
    masterReferenceForms: {
      version: "reading-g-master-reference-forms-v1",
      source: "public/data/words.json",
      sourceAliasCount: collected.candidates.length,
      independentAliasCount: mappedIndependentCount,
      canonicalHeadwordCount: baseKeys.length,
      missingCanonicalHeadwordCount: missingBaseKeys.length
    }
  };

  return {
    compactionPayload: nextPayload,
    candidates: collected.candidates,
    missingBaseKeys,
    masterByKey: collected.masterByKey,
    itemsByKey: collected.itemsByKey,
    stats: {
      sourceAliasCount: collected.candidates.length,
      independentAliasCount: mappedIndependentCount,
      canonicalHeadwordCount: baseKeys.length,
      missingCanonicalHeadwordCount: missingBaseKeys.length,
      resultingRuleCount: rules.length
    }
  };
}

/**
 * Adds any missing real headwords before compaction.  The caller supplies the
 * project-specific G entry builder so all normal G fields stay identical to a
 * regular master-backed entry.
 */
export function prepareReadingGMasterReferenceForms({
  items = [],
  masterWords = [],
  additionalWords = [],
  compactionPayload = {},
  retirementPayload = {},
  createBaseEntry
} = {}) {
  if (typeof createBaseEntry !== "function") {
    throw new Error("prepareReadingGMasterReferenceForms requires createBaseEntry");
  }
  const plan = buildReadingGMasterReferenceCompactionPlan({
    items,
    masterWords,
    additionalWords,
    compactionPayload
  });
  const nextItems = [...asArray(items)];
  const existingKeys = wordItemsByKey(nextItems);
  const retiredKeys = new Set(normalizeReadingGRetirements(retirementPayload).map((entry) => entry.key));
  const addedHeadwords = [];
  const skippedRetiredHeadwords = [];

  for (const key of plan.missingBaseKeys) {
    const master = plan.masterByKey.get(key);
    if (retiredKeys.has(getReadingGRetirementKey({ word: key, entryType: "word" }))) {
      // Deletion is an explicit user decision.  A reference-only surface form
      // can remain a search/progress alias, but must not silently recreate a
      // deleted base-word flashcard during a later rebuild.
      skippedRetiredHeadwords.push(key);
      continue;
    }
    const next = createBaseEntry(master);
    const nextKey = wordKey(next);
    if (!next || nextKey !== key || (next.entryType || "word") !== "word") {
      throw new Error(`Cannot materialise master headword for G reading: ${key}`);
    }
    if (existingKeys.has(key)) continue;
    nextItems.push(next);
    existingKeys.set(key, next);
    addedHeadwords.push(key);
  }

  return {
    ...plan,
    items: nextItems,
    addedHeadwords,
    skippedRetiredHeadwords,
    stats: {
      ...plan.stats,
      addedCanonicalHeadwordCount: addedHeadwords.length,
      skippedRetiredCanonicalHeadwordCount: skippedRetiredHeadwords.length
    }
  };
}
