import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyReadingGCompaction } from "../app/lib/reading-g-vocab/compaction.mjs";
import { normalizeReadingGKey } from "../app/lib/reading-g-vocab/normalize.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VOCAB_PATH = path.join(ROOT, "public", "data", "reading-g-vocab.json");
const COMPACTION_PATH = path.join(ROOT, "public", "data", "reading-g-word-family-compaction.json");
const REPORT_PATH = path.join(ROOT, "public", "data", "reading-g-import-report.json");
const VERSION = "reading-g-invalid-form-relation-repair-v1-20260810";

// Direct grammatical forms that were imported as independent heads and then
// made to own sibling forms in the wrong direction.
const DIRECT_MERGES = new Map([
  ["graduated", "graduate"],
  ["represented", "represent"],
  ["representing", "represent"],
  ["nesting", "nest"],
  ["tore", "tear"]
]);

// These are confirmed import typos, not English word forms. They must not be
// shown in the form panel, but their old ids must still resolve to the lemma.
const TYPO_TO_LEMMA = new Map([
  ["nensure", "ensure"],
  ["nhoses", "hose"],
  ["lnvolve", "involve"]
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function appendRule(compaction, canonical, alias) {
  const canonicalKey = normalizeReadingGKey(canonical.word);
  const aliasKey = normalizeReadingGKey(alias.word);
  let rule = compaction.rules.find((item) => item.canonicalKey === canonicalKey);
  if (!rule) {
    rule = { canonicalKey, canonicalId: canonical.id, canonicalWord: canonical.word, aliases: [] };
    compaction.rules.push(rule);
  }
  if (!(rule.aliases || []).some((item) => normalizeReadingGKey(item.key || item.word) === aliasKey)) {
    rule.aliases.push({ key: aliasKey, id: alias.id, word: alias.word, relationType: "form" });
  }
}

function appendLegacyTypoAlias(canonical, typoEntry) {
  const key = normalizeReadingGKey(typoEntry.word);
  canonical.mergedAliases = Array.isArray(canonical.mergedAliases) ? canonical.mergedAliases : [];
  canonical.mergedEntries = Array.isArray(canonical.mergedEntries) ? canonical.mergedEntries : [];
  if (!canonical.mergedAliases.some((alias) => normalizeReadingGKey(alias.key || alias.word) === key)) {
    canonical.mergedAliases.push({
      key,
      id: typoEntry.id,
      word: typoEntry.word,
      relationType: "import-typo"
    });
  }
  if (!canonical.mergedEntries.some((entry) => normalizeReadingGKey(entry.key || entry.word) === key)) {
    canonical.mergedEntries.push({
      key,
      id: typoEntry.id,
      word: typoEntry.word,
      relationType: "import-typo",
      sourceFiles: typoEntry.sourceFiles || [],
      qualityFlags: ["reading_g_import_typo_repaired"]
    });
  }
  canonical.sourceFiles = [...new Set([...(canonical.sourceFiles || []), ...(typoEntry.sourceFiles || [])])];
  canonical.qualityFlags = [...new Set([...(canonical.qualityFlags || []), "reading_g_import_typo_alias"] )];
}

function buildRepair(vocab, compaction) {
  const nextVocab = structuredClone(vocab);
  const nextCompaction = structuredClone(compaction);
  const byKey = new Map(nextVocab.items.map((entry) => [normalizeReadingGKey(entry.normalizedKey || entry.word), entry]));

  for (const [aliasWord, lemmaWord] of DIRECT_MERGES) {
    const alias = byKey.get(aliasWord);
    const canonical = byKey.get(lemmaWord);
    assert(alias && canonical, `Missing direct-form mapping ${aliasWord} -> ${lemmaWord}.`);
    appendRule(nextCompaction, canonical, alias);
  }

  const typoIds = [];
  for (const [typo, lemma] of TYPO_TO_LEMMA) {
    const typoEntry = byKey.get(typo);
    const canonical = byKey.get(lemma);
    assert(typoEntry && canonical, `Missing typo mapping ${typo} -> ${lemma}.`);
    appendLegacyTypoAlias(canonical, typoEntry);
    typoIds.push(typoEntry.id);
  }

  const afterTaste = byKey.get("after-taste");
  assert(afterTaste, "Missing after-taste import entry.");
  afterTaste.word = "aftertaste";
  afterTaste.normalizedKey = "aftertaste";
  afterTaste.qualityFlags = [...new Set([...(afterTaste.qualityFlags || []), "reading_g_spelling_format_repaired"] )];
  afterTaste.sourceFiles = [...new Set([...(afterTaste.sourceFiles || []), "reading-g-invalid-form-relation-repair-v1"] )];

  const fighting = byKey.get("fighting");
  assert(fighting, "Missing independent word fighting.");
  fighting.forms = (fighting.forms || []).filter((form) => !["fought", "fights"].includes(normalizeReadingGKey(form.word || form.form)));
  fighting.qualityFlags = [...new Set([...(fighting.qualityFlags || []), "reading_g_invalid_sibling_forms_removed"] )];

  nextCompaction.rules.sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey));
  const withoutTypos = nextVocab.items.filter((entry) => !typoIds.includes(entry.id));
  const compacted = applyReadingGCompaction(withoutTypos, nextCompaction);
  nextVocab.items = compacted.items;
  nextVocab.count = nextVocab.items.length;
  nextVocab.wordCount = nextVocab.items.filter((entry) => (entry.entryType || "word") === "word").length;
  nextVocab.phraseCount = nextVocab.items.filter((entry) => entry.entryType === "phrase").length;
  nextVocab.activeCount = nextVocab.items.filter((entry) => entry.studyMode !== "reference").length;
  nextVocab.referenceCount = nextVocab.items.filter((entry) => entry.studyMode === "reference").length;
  nextVocab.updatedAt = new Date().toISOString();
  const activeAliasCount = nextCompaction.rules
    .filter((rule) => !rule.suppressionOnly)
    .flatMap((rule) => rule.aliases || []).length;
  nextVocab.wordOnlyInflectionReview = {
    ...(nextVocab.wordOnlyInflectionReview || {}),
    keptMergedInflectionCount: activeAliasCount,
    invalidRelationRepairCount: DIRECT_MERGES.size,
    updatedAt: nextVocab.updatedAt
  };
  nextVocab.invalidFormRelationRepair = {
    version: VERSION,
    updatedAt: nextVocab.updatedAt,
    directMergeCount: DIRECT_MERGES.size,
    typoRemovalCount: TYPO_TO_LEMMA.size,
    spellingFormatRepairCount: 1,
    standaloneFormCleanupCount: 1
  };

  const repairedByKey = new Map(nextVocab.items.map((entry) => [normalizeReadingGKey(entry.normalizedKey || entry.word), entry]));
  for (const [alias, lemma] of DIRECT_MERGES) {
    assert(!repairedByKey.has(alias), `Independent form remains: ${alias}.`);
    const canonical = repairedByKey.get(lemma);
    assert(canonical?.forms?.some((form) => normalizeReadingGKey(form.word || form.form) === alias), `Missing displayed form ${alias}.`);
    assert(canonical?.mergedAliases?.some((item) => normalizeReadingGKey(item.key || item.word) === alias), `Missing legacy id map for ${alias}.`);
  }
  for (const [typo, lemma] of TYPO_TO_LEMMA) {
    assert(!repairedByKey.has(typo), `Typo remains visible: ${typo}.`);
    assert(repairedByKey.get(lemma)?.mergedAliases?.some((item) => normalizeReadingGKey(item.key || item.word) === typo), `Missing typo id map for ${typo}.`);
  }
  assert(repairedByKey.has("aftertaste") && !repairedByKey.has("after-taste"), "aftertaste spelling repair failed.");
  assert((repairedByKey.get("fighting")?.forms || []).every((form) => !["fought", "fights"].includes(normalizeReadingGKey(form.word || form.form))), "fighting retains invalid sibling forms.");

  return { nextVocab, nextCompaction, compacted };
}

function main() {
  const write = process.argv.includes("--write");
  const vocab = readJson(VOCAB_PATH);
  const compaction = readJson(COMPACTION_PATH);
  const report = readJson(REPORT_PATH);
  const { nextVocab, nextCompaction, compacted } = buildRepair(vocab, compaction);
  const output = {
    mode: write ? "write" : "dry-run",
    version: VERSION,
    directMergeCount: DIRECT_MERGES.size,
    typoRemovalCount: TYPO_TO_LEMMA.size,
    spellingFormatRepairCount: 1,
    standaloneFormCleanupCount: 1,
    count: nextVocab.count,
    wordCount: nextVocab.wordCount,
    compaction: compacted.stats
  };
  if (!write) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(ROOT, "backups", `reading-g-invalid-form-relation-repair-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  for (const file of [VOCAB_PATH, COMPACTION_PATH, REPORT_PATH]) fs.copyFileSync(file, path.join(backupDir, path.basename(file)));
  const nextReport = structuredClone(report);
  nextReport.invalidFormRelationRepair = { version: VERSION, completedAt: nextVocab.updatedAt, backupDir, ...output };
  try {
    writeJsonAtomic(VOCAB_PATH, nextVocab);
    writeJsonAtomic(COMPACTION_PATH, nextCompaction);
    writeJsonAtomic(REPORT_PATH, nextReport);
  } catch (error) {
    for (const file of [VOCAB_PATH, COMPACTION_PATH, REPORT_PATH]) fs.copyFileSync(path.join(backupDir, path.basename(file)), file);
    throw error;
  }
  console.log(JSON.stringify({ ...output, backupDir }, null, 2));
}

main();
