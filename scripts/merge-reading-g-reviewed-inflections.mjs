import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyReadingGCompaction,
  buildReadingGCompactionPlan
} from "../app/lib/reading-g-vocab/compaction.mjs";
import { buildItemKeyIndex } from "../app/lib/reading-g-vocab/migration.mjs";
import { normalizeReadingGKey } from "../app/lib/reading-g-vocab/normalize.mjs";
import { countStageUniques } from "../app/lib/reading-g-vocab/stages.mjs";
import { applyReadingGQuestionBankExpansion } from "./expand-reading-g-question-bank.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VOCAB_PATH = path.join(ROOT, "public", "data", "reading-g-vocab.json");
const REPORT_PATH = path.join(ROOT, "public", "data", "reading-g-import-report.json");
const COMPACTION_PATH = path.join(ROOT, "public", "data", "reading-g-word-family-compaction.json");
const VERSION = "reading-g-reviewed-inflection-merge-v1-20260804";
const EXPECTED_FORM_CANDIDATES = 815;
const EXPECTED_LEXICALIZED_RETAINS = 92;
const EXPECTED_MERGES = 729;

// These surface forms have a lexicalised meaning or grammatical use that is
// not safely replaceable by drilling only the apparent base form.
const LEXICALIZED_RETAINS = new Set([
  "accepted", "accomplished", "accounting", "aids", "applied", "athletics",
  "belonging", "breeding", "casting", "clothes", "coloured", "committed",
  "commons", "composed", "concerned", "confines", "consulting", "contents",
  "customs", "cuttings", "dedicated", "developed", "developing", "devoted",
  "distinguished", "drawing", "dynamics", "effects", "endangered", "established",
  "exhausted", "expecting", "farming", "filing", "fittings", "following",
  "fulfilled", "funding", "gathering", "gifted", "granted", "housing", "informed",
  "interested", "interesting", "involved", "leading", "leaves", "manufacturing",
  "marketing", "minutes", "offering", "organised", "overalls", "packed", "painting",
  "poisoning", "premises", "pressed", "pros", "provided", "qualified", "quarters",
  "refreshing", "regards", "related", "relaxed", "rewarding", "satisfied", "savings",
  "screening", "shooting", "shorts", "smelt", "sporting", "standing", "striking",
  "suffering", "sustained", "teaching", "tested", "thinking", "thought", "troubled",
  "trousers", "twisted", "understanding", "undertaking", "varied", "woods", "worried",
  "writing"
]);

// These relations were labelled as forms by legacy data but are spelling
// variants, derivations, or independently useful irregular comparisons.
const NON_INFLECTION_RETAINS = new Set([
  "encyclopaedia", "firstly", "fulfil", "generously", "many", "overseas",
  "pleasantly", "programme", "signage"
]);

// The correct lemma (carry / emit / seek) is absent from the current G data.
// Keep these entries independent instead of merging them into another form.
const DIRECTION_UNSAFE_RETAINS = new Set(["carried", "carrying", "emitted", "seeking"]);

// Legacy component scoring selected the wrong head. These aliases are removed
// from the generated direction and added back below with a corrected owner.
const REVERSED_GENERATED_ALIASES = new Set([
  "extra", "family", "loan", "loaning", "users", "trousers"
]);

const CORRECTED_DIRECTION_MAPPINGS = [
  ["extra", "extras"],
  ["family", "families"],
  ["loan", "loans"],
  ["loan", "loaning"],
  ["user", "users"],
  ["trousers", "trouser"]
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function keyOf(entry) {
  return normalizeReadingGKey(entry?.normalizedKey || entry?.word);
}

function aliasKeyOf(alias) {
  return normalizeReadingGKey(alias?.key || alias?.word);
}

function countKinds(items) {
  return {
    total: items.length,
    words: items.filter((entry) => (entry?.entryType || "word") === "word").length,
    phrases: items.filter((entry) => entry?.entryType === "phrase").length,
    active: items.filter((entry) => entry?.studyMode !== "reference").length,
    reference: items.filter((entry) => entry?.studyMode === "reference").length,
    stages: countStageUniques(items)
  };
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildReviewedMappings(vocab) {
  const words = vocab.items.filter((entry) => (entry?.entryType || "word") === "word");
  const byKey = new Map(words.map((entry) => [keyOf(entry), entry]));
  const generated = buildReadingGCompactionPlan(vocab.items, { generatedAt: "AUDIT" });
  const formCandidates = generated.rules.flatMap((rule) => (
    (rule.aliases || [])
      .filter((alias) => alias.relationType === "form")
      .map((alias) => ({ ownerKey: rule.canonicalKey, aliasKey: alias.key }))
  ));
  assert(
    formCandidates.length === EXPECTED_FORM_CANDIDATES,
    `Expected ${EXPECTED_FORM_CANDIDATES} form candidates, got ${formCandidates.length}.`
  );
  const lexicalizedCandidateCount = formCandidates.filter((row) => (
    LEXICALIZED_RETAINS.has(row.aliasKey)
  )).length;
  assert(
    lexicalizedCandidateCount === EXPECTED_LEXICALIZED_RETAINS,
    `Expected ${EXPECTED_LEXICALIZED_RETAINS} lexicalized retains, got ${lexicalizedCandidateCount}.`
  );

  const selected = formCandidates.filter((row) => (
    !LEXICALIZED_RETAINS.has(row.aliasKey)
    && !NON_INFLECTION_RETAINS.has(row.aliasKey)
    && !DIRECTION_UNSAFE_RETAINS.has(row.aliasKey)
    && !REVERSED_GENERATED_ALIASES.has(row.aliasKey)
  ));

  const selectedAliasKeys = new Set(selected.map((row) => row.aliasKey));
  const possessives = words
    .map(keyOf)
    .filter((key) => key.endsWith("'s") && byKey.has(key.slice(0, -2)))
    .filter((key) => !selectedAliasKeys.has(key))
    .map((aliasKey) => ({ ownerKey: aliasKey.slice(0, -2), aliasKey }));
  const corrected = CORRECTED_DIRECTION_MAPPINGS.map(([ownerKey, aliasKey]) => ({
    ownerKey,
    aliasKey
  }));

  const byAlias = new Map();
  for (const row of [...selected, ...possessives, ...corrected]) {
    const existing = byAlias.get(row.aliasKey);
    assert(!existing || existing.ownerKey === row.ownerKey, `Conflicting owner for ${row.aliasKey}.`);
    byAlias.set(row.aliasKey, row);
  }
  const mappings = [...byAlias.values()].sort((left, right) => (
    left.aliasKey.localeCompare(right.aliasKey)
  ));
  assert(mappings.length === EXPECTED_MERGES, `Expected ${EXPECTED_MERGES} merges, got ${mappings.length}.`);
  for (const row of mappings) {
    assert(byKey.has(row.ownerKey), `Missing owner ${row.ownerKey}.`);
    assert(byKey.has(row.aliasKey), `Missing alias ${row.aliasKey}.`);
    assert(!byAlias.has(row.ownerKey), `Owner ${row.ownerKey} is also scheduled for removal.`);
  }
  return { words, byKey, formCandidates, mappings, possessives };
}

function buildPersistentPlan(existing, audit, generatedAt) {
  const currentKeys = new Set(audit.words.map(keyOf));
  const rulesByCanonical = new Map();

  // Preserve only historical aliases that are already absent. Every currently
  // independent word is re-decided by this full audit below.
  for (const rawRule of existing.rules || []) {
    const canonicalKey = normalizeReadingGKey(rawRule.canonicalKey || rawRule.canonicalWord);
    const aliases = (rawRule.aliases || [])
      .map((alias) => ({ ...alias, key: aliasKeyOf(alias) }))
      .filter((alias) => alias.key && !currentKeys.has(alias.key));
    if (!canonicalKey || !aliases.length) continue;
    rulesByCanonical.set(canonicalKey, { ...rawRule, canonicalKey, aliases });
  }

  for (const mapping of audit.mappings) {
    const owner = audit.byKey.get(mapping.ownerKey);
    const alias = audit.byKey.get(mapping.aliasKey);
    let rule = rulesByCanonical.get(mapping.ownerKey);
    if (!rule) {
      rule = {
        canonicalKey: mapping.ownerKey,
        canonicalId: owner.id,
        canonicalWord: owner.word,
        aliases: []
      };
      rulesByCanonical.set(mapping.ownerKey, rule);
    }
    rule.aliases = (rule.aliases || []).filter((row) => aliasKeyOf(row) !== mapping.aliasKey);
    rule.aliases.push({
      key: mapping.aliasKey,
      id: alias.id,
      word: alias.word,
      relationType: "form"
    });
  }

  const seenAliases = new Map();
  const rules = [...rulesByCanonical.values()]
    .map((rule) => ({
      ...rule,
      aliases: (rule.aliases || []).sort((left, right) => aliasKeyOf(left).localeCompare(aliasKeyOf(right)))
    }))
    .sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey));
  for (const rule of rules) {
    for (const alias of rule.aliases) {
      const key = aliasKeyOf(alias);
      assert(!seenAliases.has(key), `Persistent compaction alias ${key} has multiple owners.`);
      seenAliases.set(key, rule.canonicalKey);
    }
  }

  return {
    ...existing,
    version: VERSION,
    generatedAt,
    scope: "reading-g-persistent-history-plus-reviewed-inflection-only",
    sourceWordCount: audit.words.length,
    resultingWordCount: audit.words.length - audit.mappings.length,
    rules,
    stats: {
      ...(existing.stats || {}),
      familyCount: rules.length,
      aliasCount: [...seenAliases.keys()].length,
      reviewedFormCandidateCount: audit.formCandidates.length,
      reviewedLexicalizedRetainCount: EXPECTED_LEXICALIZED_RETAINS,
      reviewedInflectionMergeCount: audit.mappings.length,
      reviewedPossessiveMergeCount: audit.possessives.length,
      correctedDirectionCount: CORRECTED_DIRECTION_MAPPINGS.length
    }
  };
}

function verifyResult(beforeVocab, afterVocab, audit) {
  const expectedRemoved = new Set(audit.mappings.map((row) => row.aliasKey));
  const beforeWords = new Map(beforeVocab.items
    .filter((entry) => (entry?.entryType || "word") === "word")
    .map((entry) => [keyOf(entry), entry]));
  const afterWords = new Map(afterVocab.items
    .filter((entry) => (entry?.entryType || "word") === "word")
    .map((entry) => [keyOf(entry), entry]));
  assert(
    afterWords.size === beforeWords.size - EXPECTED_MERGES,
    `Unexpected final word count: expected ${beforeWords.size - EXPECTED_MERGES}, got ${afterWords.size}.`
  );
  for (const key of beforeWords.keys()) {
    assert(afterWords.has(key) === !expectedRemoved.has(key), `Unexpected visibility for ${key}.`);
  }
  for (const key of LEXICALIZED_RETAINS) {
    if (beforeWords.has(key)) assert(afterWords.has(key), `Lexicalized word ${key} was removed.`);
  }
  for (const key of NON_INFLECTION_RETAINS) {
    if (beforeWords.has(key)) assert(afterWords.has(key), `Non-inflection ${key} was removed.`);
  }
  for (const key of DIRECTION_UNSAFE_RETAINS) {
    assert(afterWords.has(key), `Direction-unsafe word ${key} was removed.`);
  }

  const beforePhrases = beforeVocab.items
    .filter((entry) => entry?.entryType === "phrase")
    .map((entry) => `${entry.id}::${keyOf(entry)}`)
    .sort();
  const afterPhrases = afterVocab.items
    .filter((entry) => entry?.entryType === "phrase")
    .map((entry) => `${entry.id}::${keyOf(entry)}`)
    .sort();
  assert(JSON.stringify(afterPhrases) === JSON.stringify(beforePhrases), "Phrase entries changed.");

  const index = buildItemKeyIndex(afterVocab.items);
  for (const mapping of audit.mappings) {
    const alias = beforeWords.get(mapping.aliasKey);
    const owner = index.byId.get(alias.id);
    assert(
      owner && keyOf(owner) === mapping.ownerKey,
      `Old id ${alias.id} for ${mapping.aliasKey} does not resolve to ${mapping.ownerKey}; got ${owner ? keyOf(owner) : "missing"}; owner aliases ${JSON.stringify(afterWords.get(mapping.ownerKey)?.mergedAliases || [])}.`
    );
    const byNorm = index.byNorm.get(mapping.aliasKey) || [];
    assert(byNorm.some((entry) => keyOf(entry) === mapping.ownerKey), `Old key for ${mapping.aliasKey} does not resolve.`);
  }
}

function atomicWrite(filePath, content) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, content, "utf8");
  fs.renameSync(tempPath, filePath);
}

function main() {
  const write = process.argv.includes("--write");
  const vocabText = fs.readFileSync(VOCAB_PATH, "utf8");
  const reportText = fs.readFileSync(REPORT_PATH, "utf8");
  const compactionText = fs.readFileSync(COMPACTION_PATH, "utf8");
  const vocab = JSON.parse(vocabText);
  const report = JSON.parse(reportText);
  const existingCompaction = JSON.parse(compactionText);

  if (vocab.reviewedInflectionMerge?.version === VERSION) {
    console.log(JSON.stringify({ mode: "already-applied", version: VERSION }, null, 2));
    return;
  }

  const generatedAt = new Date().toISOString();
  const audit = buildReviewedMappings(vocab);
  const nextCompaction = buildPersistentPlan(existingCompaction, audit, generatedAt);

  const direct = applyReadingGCompaction(structuredClone(vocab.items), nextCompaction);
  assert(direct.stats.removedIndependentWordCount === EXPECTED_MERGES, "Direct compaction count mismatch.");

  const nextVocab = structuredClone(vocab);
  const nextReport = structuredClone(report);
  const expansion = applyReadingGQuestionBankExpansion({
    vocab: nextVocab,
    report: nextReport,
    projectRoot: ROOT,
    compactionPayloadOverride: nextCompaction
  });
  // Expansion refreshes source accounting, but this operation is deliberately
  // scoped to the reviewed inflection aliases. Keep every surviving entry byte-
  // for-byte from the pre-merge dataset except for canonical entries changed by
  // compaction, rather than opportunistically refreshing unrelated form/family
  // metadata from the master sources.
  nextVocab.items = direct.items;
  verifyResult(vocab, nextVocab, audit);

  const beforeCounts = countKinds(vocab.items);
  const afterCounts = countKinds(nextVocab.items);
  assert(afterCounts.total === 7224, `Expected 7224 final items, got ${afterCounts.total}.`);
  assert(afterCounts.words === 6556, `Expected 6556 final words, got ${afterCounts.words}.`);
  assert(afterCounts.phrases === 668, `Expected 668 phrases, got ${afterCounts.phrases}.`);
  assert(JSON.stringify(afterCounts.stages) === JSON.stringify({
    stage1: 1941,
    stage2: 1316,
    stage3: 3509,
    stage4: 458
  }), `Unexpected stage counts: ${JSON.stringify(afterCounts.stages)}.`);

  nextVocab.reviewedInflectionMerge = {
    version: VERSION,
    updatedAt: generatedAt,
    scope: "reading-g-only-inflections-no-word-families",
    reviewedFormCandidateCount: audit.formCandidates.length,
    mergedCount: audit.mappings.length,
    lexicalizedRetainCount: EXPECTED_LEXICALIZED_RETAINS,
    nonInflectionRetainCount: NON_INFLECTION_RETAINS.size,
    directionUnsafeRetainCount: DIRECTION_UNSAFE_RETAINS.size,
    correctedDirectionCount: CORRECTED_DIRECTION_MAPPINGS.length
  };
  nextReport.reviewedInflectionMerge = structuredClone(nextVocab.reviewedInflectionMerge);

  const compactionOutput = json(nextCompaction);
  nextReport.sourceFiles = nextReport.sourceFiles || {};
  nextReport.sourceFiles["public/data/reading-g-word-family-compaction.json"] = {
    ...(nextReport.sourceFiles["public/data/reading-g-word-family-compaction.json"] || {}),
    bytes: Buffer.byteLength(compactionOutput),
    sha256: sha256(compactionOutput),
    rawCount: nextCompaction.rules.length,
    role: "reading_g_persistent_history_plus_reviewed_inflection_only",
    removedIndependentWordCount: EXPECTED_MERGES
  };

  const output = {
    mode: write ? "write" : "dry-run",
    version: VERSION,
    formCandidates: audit.formCandidates.length,
    mergedCount: audit.mappings.length,
    lexicalizedRetainCount: EXPECTED_LEXICALIZED_RETAINS,
    possessiveMergeCount: audit.possessives.length,
    correctedDirectionCount: CORRECTED_DIRECTION_MAPPINGS.length,
    before: beforeCounts,
    after: afterCounts,
    expansion: {
      compaction: expansion.compaction,
      externalSupplementsRestored: expansion.externalSupplementsRestored
    }
  };

  if (write) {
    const stamp = generatedAt.replace(/[:.]/g, "-");
    const backupDir = path.join(ROOT, "backups", `reading-g-reviewed-inflection-merge-${stamp}`);
    const auditDir = path.join(ROOT, "reports");
    fs.mkdirSync(backupDir, { recursive: true });
    fs.mkdirSync(auditDir, { recursive: true });
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
    const auditPath = path.join(auditDir, `reading-g-reviewed-inflection-merge-${stamp}.json`);
    fs.writeFileSync(auditPath, json({
      generatedAt,
      version: VERSION,
      backupDir,
      ...output,
      mappings: audit.mappings,
      lexicalizedRetains: [...LEXICALIZED_RETAINS].sort(),
      nonInflectionRetains: [...NON_INFLECTION_RETAINS].sort(),
      directionUnsafeRetains: [...DIRECTION_UNSAFE_RETAINS].sort()
    }), "utf8");
    output.backupDir = backupDir;
    output.auditPath = auditPath;
  }

  console.log(JSON.stringify(output, null, 2));
}

main();
