import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyReadingGCompaction,
  findReadingGRedundantPluralAliases
} from "../app/lib/reading-g-vocab/compaction.mjs";
import { normalizeReadingGKey } from "../app/lib/reading-g-vocab/normalize.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VOCAB_PATH = path.join(ROOT, "public", "data", "reading-g-vocab.json");
const COMPACTION_PATH = path.join(ROOT, "public", "data", "reading-g-word-family-compaction.json");
const REPORT_PATH = path.join(ROOT, "public", "data", "reading-g-import-report.json");
const VERSION = "reading-g-redundant-plural-compaction-v1-20260816";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, value) {
  const output = filePath === VOCAB_PATH
    ? JSON.stringify(value)
    : `${JSON.stringify(value, null, 2)}\n`;
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, output, "utf8");
  fs.renameSync(temporary, filePath);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function appendRules(payload, candidates) {
  const next = structuredClone(payload);
  next.rules = Array.isArray(next.rules) ? next.rules : [];
  const aliasOwners = new Map();
  for (const rule of next.rules) {
    const canonicalKey = normalizeReadingGKey(rule.canonicalKey || rule.canonicalWord);
    for (const alias of rule.aliases || []) {
      aliasOwners.set(normalizeReadingGKey(alias.key || alias.word), canonicalKey);
    }
  }

  const added = [];
  for (const candidate of candidates) {
    const previousOwner = aliasOwners.get(candidate.aliasKey);
    if (previousOwner && previousOwner !== candidate.canonicalKey) {
      throw new Error(`Plural alias already belongs to another headword: ${candidate.aliasKey} -> ${previousOwner}`);
    }
    if (previousOwner === candidate.canonicalKey) continue;

    let rule = next.rules.find((entry) => (
      normalizeReadingGKey(entry.canonicalKey || entry.canonicalWord) === candidate.canonicalKey
    ));
    if (!rule) {
      rule = {
        canonicalKey: candidate.canonicalKey,
        canonicalId: candidate.canonicalId,
        canonicalWord: candidate.canonicalWord,
        aliases: []
      };
      next.rules.push(rule);
    }
    rule.aliases = Array.isArray(rule.aliases) ? rule.aliases : [];
    rule.aliases.push({
      key: candidate.aliasKey,
      id: candidate.aliasId,
      word: candidate.aliasWord,
      relationType: "form"
    });
    aliasOwners.set(candidate.aliasKey, candidate.canonicalKey);
    added.push(candidate);
  }

  next.rules.sort((left, right) => (
    normalizeReadingGKey(left.canonicalKey || left.canonicalWord)
      .localeCompare(normalizeReadingGKey(right.canonicalKey || right.canonicalWord))
  ));
  return { payload: next, added };
}

function buildRepair(vocab, compaction, report) {
  const candidates = findReadingGRedundantPluralAliases(vocab.items);
  const extended = appendRules(compaction, candidates);
  const incrementalRules = extended.added.map((candidate) => ({
    canonicalKey: candidate.canonicalKey,
    canonicalId: candidate.canonicalId,
    canonicalWord: candidate.canonicalWord,
    aliases: [{
      key: candidate.aliasKey,
      id: candidate.aliasId,
      word: candidate.aliasWord,
      relationType: "form"
    }]
  }));
  const compacted = applyReadingGCompaction(vocab.items, { rules: incrementalRules });
  const updatedAt = new Date().toISOString();
  const nextVocab = {
    ...structuredClone(vocab),
    items: compacted.items,
    updatedAt
  };
  nextVocab.count = nextVocab.items.length;
  nextVocab.wordCount = nextVocab.items.filter((entry) => (entry.entryType || "word") === "word").length;
  nextVocab.phraseCount = nextVocab.items.filter((entry) => entry.entryType === "phrase").length;
  nextVocab.activeCount = nextVocab.items.filter((entry) => entry.studyMode !== "reference").length;
  nextVocab.referenceCount = nextVocab.items.filter((entry) => entry.studyMode === "reference").length;
  const mergedMappings = new Map(
    (Array.isArray(vocab.redundantPluralCompaction?.mappings)
      ? vocab.redundantPluralCompaction.mappings
      : [])
      .map((entry) => [normalizeReadingGKey(entry.plural), entry])
  );
  for (const entry of extended.added) {
    mergedMappings.set(entry.aliasKey, { plural: entry.aliasWord, headword: entry.canonicalWord });
  }
  const byKey = new Map(nextVocab.items.map((entry) => [
    normalizeReadingGKey(entry.normalizedKey || entry.word),
    entry
  ]));
  for (const mapping of mergedMappings.values()) {
    const pluralKey = normalizeReadingGKey(mapping.plural);
    const canonical = byKey.get(normalizeReadingGKey(mapping.headword));
    const form = (canonical?.forms || []).find((entry) => (
      normalizeReadingGKey(entry.word || entry.form) === pluralKey
    ));
    if (!form) continue;
    form.type = "plural";
    delete form.meaning;
    delete form.note;
  }
  nextVocab.redundantPluralCompaction = {
    version: VERSION,
    updatedAt,
    mergedPluralCount: mergedMappings.size,
    mappings: [...mergedMappings.values()].sort((left, right) => left.plural.localeCompare(right.plural))
  };

  const nextCompaction = {
    ...extended.payload,
    updatedAt,
    redundantPluralCompaction: {
      version: VERSION,
      mergedPluralCount: mergedMappings.size
    },
    stats: {
      ...(extended.payload.stats || {}),
      redundantPluralAliasCount: mergedMappings.size
    }
  };
  const activeRules = nextCompaction.rules.filter((rule) => !rule.suppressionOnly);
  const activeAliases = activeRules.flatMap((rule) => rule.aliases || []);
  nextCompaction.stats.activeInflectionRuleCount = activeRules.length;
  nextCompaction.stats.activeInflectionAliasCount = activeAliases.length;
  nextCompaction.stats.relationTypes = {
    form: activeAliases.filter((alias) => alias.relationType !== "family").length,
    family: activeAliases.filter((alias) => alias.relationType === "family").length
  };
  if (nextVocab.wordOnlyInflectionReview) {
    nextVocab.wordOnlyInflectionReview = {
      ...nextVocab.wordOnlyInflectionReview,
      keptMergedInflectionCount: activeAliases.length,
      updatedAt
    };
  }
  const nextReport = {
    ...structuredClone(report),
    redundantPluralCompaction: {
      version: VERSION,
      completedAt: updatedAt,
      mergedPluralCount: mergedMappings.size,
      mappings: nextVocab.redundantPluralCompaction.mappings
    }
  };

  for (const mapping of mergedMappings.values()) {
    const aliasKey = normalizeReadingGKey(mapping.plural);
    const canonicalKey = normalizeReadingGKey(mapping.headword);
    assert(!byKey.has(aliasKey), `${mapping.plural} remains an independent flashcard.`);
    const canonical = byKey.get(canonicalKey);
    assert(canonical, `Missing canonical headword ${mapping.headword}.`);
    assert(
      (canonical.forms || []).some((form) => (
        normalizeReadingGKey(form.word || form.form) === aliasKey && form.type === "plural"
      )),
      `Missing displayed plural ${mapping.plural} under ${mapping.headword}.`
    );
    assert(
      (canonical.mergedAliases || []).some((alias) => normalizeReadingGKey(alias.key || alias.word) === aliasKey),
      `Missing progress alias ${mapping.plural}.`
    );
  }

  return { candidates, added: extended.added, compacted, nextVocab, nextCompaction, nextReport };
}

function main() {
  const write = process.argv.includes("--write");
  const vocab = readJson(VOCAB_PATH);
  const compaction = readJson(COMPACTION_PATH);
  const report = readJson(REPORT_PATH);
  const result = buildRepair(vocab, compaction, report);
  const summary = {
    mode: write ? "write" : "dry-run",
    version: VERSION,
    detectedCount: result.candidates.length,
    mergedCount: result.added.length,
    totalMergedCount: result.nextVocab.redundantPluralCompaction.mergedPluralCount,
    mappings: result.added.map((entry) => `${entry.aliasWord} -> ${entry.canonicalWord}`),
    beforeCount: vocab.items.length,
    afterCount: result.nextVocab.items.length
  };

  if (!write) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(ROOT, "backups", `reading-g-redundant-plurals-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  for (const filePath of [VOCAB_PATH, COMPACTION_PATH, REPORT_PATH]) {
    fs.copyFileSync(filePath, path.join(backupDir, path.basename(filePath)));
  }
  try {
    writeJsonAtomic(VOCAB_PATH, result.nextVocab);
    writeJsonAtomic(COMPACTION_PATH, result.nextCompaction);
    writeJsonAtomic(REPORT_PATH, result.nextReport);
  } catch (error) {
    for (const filePath of [VOCAB_PATH, COMPACTION_PATH, REPORT_PATH]) {
      fs.copyFileSync(path.join(backupDir, path.basename(filePath)), filePath);
    }
    throw error;
  }
  console.log(JSON.stringify({ ...summary, backupDir }, null, 2));
}

main();
