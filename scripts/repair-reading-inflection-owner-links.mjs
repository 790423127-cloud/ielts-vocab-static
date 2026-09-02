#!/usr/bin/env node

/**
 * Reconnect passage surface-form cards to their existing master lemmas.
 * The reading card, sentence, context sense, stable id, and learning state
 * stay intact.  Only the incorrect master-card ownership is changed.
 *
 * Usage:
 *   node scripts/repair-reading-inflection-owner-links.mjs --dry-run
 *   node scripts/repair-reading-inflection-owner-links.mjs --apply
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { computeIntegrityHash, computeLexiconHash } from "../app/lib/vocab/lexicon-guard.mjs";
import { renderMasterLexiconBaseline } from "../app/lib/vocab/master-lexicon-baseline-io.mjs";
import { buildLocalOptimizeResult } from "../app/lib/vocab/page-word-helpers.mjs";
import { classifySurfaceInflection } from "../app/lib/vocab/word-surface-morphology.mjs";
import { USER_STATE_FIELDS } from "../app/lib/vocab/word-cache-meta.mjs";

const root = process.cwd();
const shouldApply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run") || !shouldApply;
const now = new Date().toISOString();
const repairVersion = "reading-inflection-owner-repair-v1-20260813";
const publicPath = path.join(root, "public", "data", "words.json");
const staticPath = path.join(root, ".static-export-cache", "words.json");
const personalPath = path.join(root, "public", "data", "personal-reading-words.json");
const meaningPath = path.join(root, "public", "data", "meaning-6000.json");
const baselinePath = path.join(root, "app", "lib", "vocab", "master-lexicon-baseline.mjs");

const REPAIRS = Object.freeze([
  { surface: "determining", base: "determine", relationType: "present participle" },
  { surface: "integrating", base: "integrate", relationType: "present participle" },
  { surface: "risen", base: "rise", relationType: "past participle" },
  { surface: "differs", base: "differ", relationType: "third-person singular" },
  {
    surface: "surveys",
    base: "survey",
    relationType: "plural",
    displayForms: [
      { word: "surveyed", type: "past tense / past participle", note: "动词过去式" },
      { word: "surveying", type: "present participle / gerund", note: "动词现在分词" }
    ]
  },
  {
    surface: "disqualified",
    base: "disqualify",
    relationType: "past participle",
    displayForms: [
      { word: "disqualifies", type: "third-person singular", note: "第三人称单数" },
      { word: "disqualifying", type: "present participle / gerund", note: "现在分词" }
    ]
  }
]);

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function key(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase();
}

function unique(values) {
  const rows = new Map();
  for (const value of values) {
    const id = key(value?.word || value?.form || value);
    if (!id) continue;
    const previous = rows.get(id);
    rows.set(id, previous && typeof previous === "object" && typeof value === "object"
      ? { ...previous, ...value }
      : value);
  }
  return [...rows.values()];
}

function atomicWrite(filePath, content) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temporaryPath, content, "utf8");
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
  }
}

function protectedSnapshot(entry = {}) {
  const snapshot = { id: entry.id, wordId: entry.wordId, word: entry.word };
  for (const field of USER_STATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(entry, field)) snapshot[field] = entry[field];
  }
  return snapshot;
}

function formTypeFor(repair, formWord) {
  const kind = classifySurfaceInflection(repair.base, formWord);
  const types = {
    "plural-or-third-person": key(repair.relationType) === "plural" ? "plural" : "third-person singular",
    "present-participle": "present participle / gerund",
    "past-or-past-participle": "past tense / past participle",
    irregular: key(formWord) === key(repair.surface) ? repair.relationType : "irregular form"
  };
  return types[kind] || "grammatical form";
}

function buildBaseForm(base, surface, repair) {
  return {
    word: surface.word,
    id: surface.id,
    type: formTypeFor(repair, surface.word),
    relation: "reading-inflection-reference",
    pos: surface.pos || base.pos || "",
    meaning: surface.meaning || "",
    source: repairVersion
  };
}

function withoutUpdatedAt(entry = {}) {
  const { updatedAt, ...rest } = entry;
  return rest;
}

function keepTimestampWhenUnchanged(previous, candidate) {
  return JSON.stringify(withoutUpdatedAt(previous)) === JSON.stringify(withoutUpdatedAt(candidate))
    ? previous
    : { ...candidate, updatedAt: now };
}

function repairMaster(payload) {
  const words = payload.words.map((entry) => ({ ...entry }));
  const byKey = new Map(words.map((entry, index) => [key(entry.word), { entry, index }]));
  const changes = [];

  for (const repair of REPAIRS) {
    const surfaceLocation = byKey.get(repair.surface);
    const baseLocation = byKey.get(repair.base);
    if (!surfaceLocation || !baseLocation) {
      throw new Error(`Missing required entry: ${repair.surface} -> ${repair.base}`);
    }
    const surface = surfaceLocation.entry;
    const base = baseLocation.entry;
    if (surface.source !== "personal-reading" && surface.addedFromReadingWords !== true) {
      throw new Error(`Refusing to convert a non-reading entry: ${surface.word}`);
    }
    if (!classifySurfaceInflection(base.word, surface.word)) {
      throw new Error(`Unverified morphology relation: ${surface.word} -> ${base.word}`);
    }

    const carriedForms = (Array.isArray(surface.forms) ? surface.forms : [])
      .filter((form) => classifySurfaceInflection(base.word, form?.word || form))
      .map((form) => ({
        ...form,
        word: String(form?.word || form).trim(),
        type: formTypeFor(repair, form?.word || form),
        relation: "reading-inflection-reference",
        source: repairVersion
      }));
    const declaredDisplayForms = (Array.isArray(repair.displayForms) ? repair.displayForms : [])
      .filter((form) => classifySurfaceInflection(base.word, form?.word))
      .map((form) => ({
        ...form,
        relation: "reading-inflection-reference",
        source: repairVersion
      }));
    const baseForm = buildBaseForm(base, surface, repair);
    const nextBaseCandidate = {
      ...base,
      forms: unique([
        ...(Array.isArray(base.forms) ? base.forms : []),
        baseForm,
        ...carriedForms,
        ...declaredDisplayForms
      ]),
      formsReviewed: true,
      formsReviewSource: repairVersion
    };
    const nextBase = keepTimestampWhenUnchanged(base, nextBaseCandidate);
    const existingRepair = surface?.morphologyOwnerRepair;
    const repairedAt = existingRepair?.version === repairVersion && key(existingRepair?.baseWord) === key(base.word)
      ? existingRepair.repairedAt
      : now;
    const nextSurfaceCandidate = {
      ...surface,
      entryType: "inflected-form",
      studyMode: "reference",
      baseWord: base.word,
      baseWordId: base.id || base.wordId,
      redirectToWord: base.word,
      relationType: formTypeFor(repair, surface.word),
      readingPriority: false,
      forms: [],
      formsReviewed: true,
      formsReviewSource: repairVersion,
      morphologyOwnerRepair: {
        version: repairVersion,
        repairedAt,
        baseWord: base.word
      }
    };
    const nextSurface = keepTimestampWhenUnchanged(surface, nextSurfaceCandidate);
    if (JSON.stringify(protectedSnapshot(surface)) !== JSON.stringify(protectedSnapshot(nextSurface))) {
      throw new Error(`Stable identity or learning state changed: ${surface.word}`);
    }
    words[baseLocation.index] = nextBase;
    words[surfaceLocation.index] = nextSurface;
    byKey.set(repair.base, { entry: nextBase, index: baseLocation.index });
    byKey.set(repair.surface, { entry: nextSurface, index: surfaceLocation.index });
    changes.push({
      surface: surface.word,
      surfaceId: surface.id,
      base: base.word,
      baseId: base.id,
      relationType: repair.relationType,
      movedForms: carriedForms.map((form) => form.word)
    });
  }

  // Apply the same owner validation used by the admin rebuild path. This
  // removes stale sibling links such as emerging -> emerged and
  // mentoring -> mentored, while keeping validated display-only forms.
  const organized = buildLocalOptimizeResult(words);
  if (organized.words.length !== words.length) {
    throw new Error("Local organization unexpectedly changed the physical word count.");
  }

  return { words: organized.words, changes, organizationStats: organized.stats };
}

function repairPersonalTree(value, masterByKey, state) {
  if (Array.isArray(value)) return value.map((item) => repairPersonalTree(item, masterByKey, state));
  if (!value || typeof value !== "object") return value;

  let next = { ...value };
  const repair = REPAIRS.find((item) => item.surface === key(value.word));
  if (repair) {
    const base = masterByKey.get(repair.base);
    if (!base) throw new Error(`Personal repair base missing: ${repair.base}`);
    const candidate = {
      ...next,
      mainWordId: base.id || base.wordId,
      baseWord: base.word,
      baseWordId: base.id || base.wordId,
      relationType: repair.relationType,
      forms: [],
      formsReviewed: true,
      formsReviewSource: repairVersion
    };
    next = keepTimestampWhenUnchanged(value, candidate);
    if (JSON.stringify(protectedSnapshot(value)) !== JSON.stringify(protectedSnapshot(next))) {
      throw new Error(`Personal stable identity or learning state changed: ${value.word}`);
    }
    state.occurrences += 1;
    state.words.add(repair.surface);
  }

  for (const [field, child] of Object.entries(next)) {
    if (child && typeof child === "object") next[field] = repairPersonalTree(child, masterByKey, state);
  }
  return next;
}

function main() {
  if (shouldApply && dryRun) throw new Error("--apply and --dry-run cannot be used together");
  const publicRaw = fs.readFileSync(publicPath);
  const staticRaw = fs.readFileSync(staticPath);
  if (!publicRaw.equals(staticRaw)) throw new Error("The two authoritative master files differ; write stopped.");

  const master = JSON.parse(publicRaw.toString("utf8"));
  const personal = JSON.parse(fs.readFileSync(personalPath, "utf8"));
  const meaning = JSON.parse(fs.readFileSync(meaningPath, "utf8"));
  if (!Array.isArray(master.words) || master.words.length !== Number(master.count)) {
    throw new Error("Master words/count mismatch; write stopped.");
  }

  const beforeIds = master.words.map((entry) => entry.id);
  const beforeBrushable = master.words.filter((entry) => entry.studyMode !== "reference").length;
  const repaired = repairMaster(master);
  const retirementPayload = JSON.parse(fs.readFileSync(
    path.join(root, "app", "lib", "vocab", "master-lexicon-retirements.json"),
    "utf8"
  ));
  const suffixEndings = ["s", "ed", "ing", "er", "est", "en", "ind"];
  const isSuffixCandidate = (entry) => suffixEndings.some((ending) => key(entry?.word).endsWith(ending));
  const referenceCount = repaired.words.filter((entry) => (
    entry?.studyMode === "reference" && (
      key(entry?.baseWord || entry?.redirectToWord)
      || String(entry?.baseWordId || "").trim()
      || entry?.entryType === "word-reference"
      || entry?.entryType === "inflected-form"
    )
  )).length;
  const brushableCount = repaired.words.length - referenceCount;
  const retiredSuffixCount = (Array.isArray(retirementPayload?.entries) ? retirementPayload.entries : [])
    .filter((entry) => entry?.morphologyAuditIncluded !== false && isSuffixCandidate(entry)).length;
  const nextAudit = {
    ...(master.morphologyAudit || {}),
    storedFormLinksReviewed: repaired.words.reduce(
      (sum, entry) => sum + (Array.isArray(entry?.forms) ? entry.forms.length : 0),
      0
    ),
    inflectedReferences: referenceCount,
    brushableHeadwords: brushableCount,
    rawSuffixHeadwordsReviewed: repaired.words.filter(isSuffixCandidate).length + retiredSuffixCount,
    readingInflectionOwnerRepair: repairVersion,
    readingInflectionOwnerRepairs: repaired.changes.length
  };
  const masterEntriesChanged = repaired.words.reduce(
    (sum, entry, index) => sum + (JSON.stringify(entry) === JSON.stringify(master.words[index]) ? 0 : 1),
    0
  );
  const auditChanged = JSON.stringify(nextAudit) !== JSON.stringify(master.morphologyAudit || {});
  if (auditChanged) nextAudit.readingInflectionOwnerRepairAt = now;
  else if (master.morphologyAudit?.readingInflectionOwnerRepairAt) {
    nextAudit.readingInflectionOwnerRepairAt = master.morphologyAudit.readingInflectionOwnerRepairAt;
  }
  const nextMaster = {
    ...master,
    words: repaired.words,
    count: repaired.words.length,
    savedAt: masterEntriesChanged > 0 || auditChanged ? now : master.savedAt,
    lexiconHash: computeLexiconHash(repaired.words),
    integrityHash: computeIntegrityHash(repaired.words),
    morphologyAudit: nextAudit
  };
  const masterByKey = new Map(repaired.words.map((entry) => [key(entry.word), entry]));
  const personalState = { occurrences: 0, words: new Set() };
  let nextPersonal = repairPersonalTree(personal, masterByKey, personalState);
  if (nextPersonal?.transfer && typeof nextPersonal.transfer === "object") {
    const readingWords = Array.isArray(nextPersonal.transfer.readingWords)
      ? nextPersonal.transfer.readingWords
      : [];
    const linkedBaseIds = new Set(readingWords.map((entry) => String(entry?.mainWordId || entry?.baseWordId || "")).filter(Boolean));
    const repairedSurfaceKeys = new Set(REPAIRS.map((repair) => repair.surface));
    const linkedMainEntries = [
      ...(Array.isArray(nextPersonal.transfer.linkedMainEntries)
        ? nextPersonal.transfer.linkedMainEntries.filter((entry) => !repairedSurfaceKeys.has(key(entry?.word)))
        : []),
      ...repaired.words
        .filter((entry) => linkedBaseIds.has(String(entry?.id || entry?.wordId || "")))
        .map((entry) => {
          const stateEntry = {
            id: entry.id,
            wordId: entry.wordId || entry.id,
            word: entry.word,
            transferType: "user-state"
          };
          for (const field of USER_STATE_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(entry, field)) stateEntry[field] = entry[field];
          }
          return stateEntry;
        })
    ];
    const seenLinked = new Set();
    nextPersonal = {
      ...nextPersonal,
      sourceUpdatedAt: now,
      publishedAt: now,
      transfer: {
        ...nextPersonal.transfer,
        exportedAt: now,
        readingWords,
        linkedMainEntries: linkedMainEntries.filter((entry) => {
          const id = String(entry?.id || entry?.wordId || "");
          if (!id || seenLinked.has(id)) return false;
          seenLinked.add(id);
          return true;
        }),
        sourceMainMeta: {
          ...(nextPersonal.transfer.sourceMainMeta || {}),
          version: nextMaster.version,
          lexiconHash: nextMaster.lexiconHash
        }
      }
    };
    nextPersonal.revision = sha256(JSON.stringify({
      readingWords: nextPersonal.transfer.readingWords,
      linkedMainEntries: nextPersonal.transfer.linkedMainEntries,
      sourceMainMeta: nextPersonal.transfer.sourceMainMeta
    }));
  }
  if (personalState.words.size !== REPAIRS.length) {
    throw new Error(`Expected ${REPAIRS.length} personal words, found ${personalState.words.size}`);
  }

  const masterContent = `${JSON.stringify(nextMaster, null, 2)}\n`;
  const masterFileHash = sha256(masterContent);
  const nextMeaning = {
    ...meaning,
    sourceLexiconVersion: nextMaster.version,
    sourceLexiconCount: nextMaster.count,
    sourceLexiconSha256: masterFileHash
  };
  const meaningContent = `${JSON.stringify(nextMeaning, null, 2)}\n`;
  const personalContent = `${JSON.stringify(nextPersonal, null, 2)}\n`;
  const baselineContent = renderMasterLexiconBaseline({
    count: nextMaster.count,
    version: nextMaster.version,
    fileHash: masterFileHash
  });
  const report = {
    mode: shouldApply ? "apply" : "dry-run",
    version: repairVersion,
    changes: repaired.changes,
    masterEntriesChanged,
    personalOccurrencesChanged: personalState.occurrences,
    physicalEntriesBefore: master.words.length,
    physicalEntriesAfter: repaired.words.length,
    brushableEntriesBefore: beforeBrushable,
    brushableEntriesAfter: repaired.words.filter((entry) => entry.studyMode !== "reference").length,
    stableIdsChanged: beforeIds.filter((id, index) => id !== repaired.words[index].id).length,
    headwordsChanged: master.words.filter((entry, index) => entry.word !== repaired.words[index].word).length,
    networkCalls: 0,
    paidAiCalls: 0,
    sourceLexiconSha256: masterFileHash
  };

  if (!shouldApply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const stamp = now.replace(/[:.]/g, "-");
  const rollbackDirectory = path.join(root, "backups", "reading-inflection-owner-repair", stamp);
  fs.mkdirSync(rollbackDirectory, { recursive: true });
  const rollbackPayload = {
    version: repairVersion,
    createdAt: now,
    masterMeta: {
      savedAt: master.savedAt,
      lexiconHash: master.lexiconHash,
      integrityHash: master.integrityHash,
      morphologyAudit: master.morphologyAudit
    },
    meaningMeta: {
      sourceLexiconVersion: meaning.sourceLexiconVersion,
      sourceLexiconCount: meaning.sourceLexiconCount,
      sourceLexiconSha256: meaning.sourceLexiconSha256
    },
    masterEntries: REPAIRS.flatMap((repair) => [
      master.words.find((entry) => key(entry.word) === repair.base),
      master.words.find((entry) => key(entry.word) === repair.surface)
    ]),
    personalOccurrences: (() => {
      const found = [];
      function visit(node, pointer = "$.") {
        if (Array.isArray(node)) return node.forEach((item, index) => visit(item, `${pointer}[${index}]`));
        if (!node || typeof node !== "object") return;
        if (REPAIRS.some((repair) => repair.surface === key(node.word))) found.push({ pointer, entry: node });
        for (const [field, child] of Object.entries(node)) if (child && typeof child === "object") visit(child, `${pointer}.${field}`);
      }
      visit(personal, "$");
      return found;
    })()
  };
  fs.writeFileSync(
    path.join(rollbackDirectory, "affected-records.rollback.json"),
    `${JSON.stringify(rollbackPayload, null, 2)}\n`,
    "utf8"
  );

  try {
    atomicWrite(publicPath, masterContent);
    atomicWrite(staticPath, masterContent);
    atomicWrite(personalPath, personalContent);
    atomicWrite(meaningPath, meaningContent);
    atomicWrite(baselinePath, baselineContent);
  } catch (error) {
    // The rollback file is intentionally small, but it contains every affected
    // record and the previous master metadata needed for a targeted restore.
    error.message = `${error.message}; targeted rollback: ${path.relative(root, rollbackDirectory)}`;
    throw error;
  }
  report.rollbackDirectory = path.relative(root, rollbackDirectory).replaceAll("\\", "/");
  fs.writeFileSync(path.join(rollbackDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main();
