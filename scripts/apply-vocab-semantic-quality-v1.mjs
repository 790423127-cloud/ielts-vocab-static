import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALLOWED_ACTIONS,
  PATCH_COLUMNS,
  SEMANTIC_QUALITY_VERSION,
  USER_PROGRESS_FIELDS,
  hashExample,
  hashMeaning,
  normalizeText,
  sha256,
  toTsv
} from "./lib/vocab-semantic-quality-v1.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".static-export-cache", "words.json");
const PUBLIC = path.join(ROOT, "public", "data", "words.json");
const BASELINE = path.join(ROOT, "app", "lib", "vocab", "master-lexicon-baseline.mjs");
const DATA_DIR = path.join(ROOT, "data", "vocab-semantic-quality");
const REPORT_DIR = path.join(ROOT, "reports", "vocab-semantic-quality");
const FIXED_TIME = "2026-07-15T00:00:00.000Z";
const BATCH_FILES = new Map([
  ["p0", ["batch-p0.tsv", "batch-p0-followup.tsv"]], ["example-review", ["batch-example-review.tsv"]], ["meaning-core", ["batch-meaning-core.tsv"]]
]);
const V2_MANAGED_FIELDS = new Set(["definition", "meaningDetailedZh", "meaningDetailZh"]);

function isV2Managed(entry, field) {
  return Boolean(entry?.semanticQualityV2 && (
    V2_MANAGED_FIELDS.has(field) || entry?.semanticQualityV2ManagedFields?.includes(field)
  ));
}

function parseTsv(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const headers = lines.shift()?.split("\t") || [];
  for (const column of PATCH_COLUMNS) if (!headers.includes(column)) throw new Error(`${path.basename(filePath)} missing ${column}`);
  return lines.map((line) => Object.fromEntries(headers.map((header, index) => [header, line.split("\t")[index] ?? ""])));
}

function parseJson(value, fallback) {
  return String(value || "").trim() ? JSON.parse(value) : fallback;
}

function mergeBy(items, additions, keyFn) {
  const map = new Map((Array.isArray(items) ? items : []).map((item) => [keyFn(item), item]));
  for (const item of additions || []) {
    const key = keyFn(item);
    map.set(key, map.has(key) ? { ...map.get(key), ...item } : item);
  }
  return [...map.values()];
}

function desiredState(entry, patch) {
  const set = parseJson(patch.setJson, {});
  const forms = parseJson(patch.addFormsJson, []);
  const meanings = parseJson(patch.addMeaningsJson, []);
  const quiz = parseJson(patch.addQuizSensesJson, []);
  if (!Object.entries(set).every(([key, value]) => isV2Managed(entry, key) || JSON.stringify(entry?.[key]) === JSON.stringify(value))) return false;
  const formKeys = new Set((entry?.forms || []).map((item) => normalizeText(item?.word ?? item)));
  if (!forms.every((item) => formKeys.has(normalizeText(item?.word ?? item)))) return false;
  const meaningKeys = new Set((entry?.meaningsZh || []).map((item) => `${normalizeText(item?.gloss)}::${normalizeText(item?.posFamily)}`));
  if (!meanings.every((item) => meaningKeys.has(`${normalizeText(item?.gloss)}::${normalizeText(item?.posFamily)}`))) return false;
  const quizIds = new Set((entry?.quizSenses || []).map((item) => String(item?.senseId || "")));
  return quiz.every((item) => quizIds.has(String(item?.senseId || "")));
}

function patchHashesMatch(entry, patch, original) {
  const set = parseJson(patch.setJson, {});
  const fields = new Set(Object.keys(set));
  const touchesExample = fields.has("example") || fields.has("exampleCn") || patch.action === "delete";
  const touchesMeaning = [...fields].some((field) => ["meaning", "definition", "meaningDetailedZh", "meaningDetailZh", "meaningsZh", "quizSenses"].includes(field))
    || Boolean(String(patch.addMeaningsJson || "").trim())
    || Boolean(String(patch.addQuizSensesJson || "").trim())
    || patch.action === "delete";
  const currentMeaningMatches = hashMeaning(entry) === patch.expectedMeaningHash;
  const currentExampleMatches = hashExample(entry) === patch.expectedExampleHash;
  const originalMeaningMatches = original?.meaning === patch.expectedMeaningHash;
  const originalExampleMatches = original?.example === patch.expectedExampleHash;
  if (touchesMeaning && !currentMeaningMatches && !originalMeaningMatches && !entry?.semanticQualityV2) return false;
  if (touchesExample && !currentExampleMatches && !originalExampleMatches && !isV2Managed(entry, "example")) return false;
  if (!touchesMeaning && !touchesExample) return currentMeaningMatches || originalMeaningMatches || currentExampleMatches || originalExampleMatches;
  return true;
}

function preserveSnapshot(words) {
  return new Map(words.map((entry) => [String(entry.id || entry.wordId || ""), Object.fromEntries([...USER_PROGRESS_FIELDS].filter((field) => field in entry).map((field) => [field, structuredClone(entry[field])]))]));
}

function baselineSource(count, version, fileHash) {
  return `// Baseline metadata for the bundled master lexicon.\n// Keep this in sync with public/data/words.json and .static-export-cache/words.json.\nexport const MASTER_LEXICON_EXPECTED_COUNT = ${count};\nexport const MASTER_LEXICON_VERSION = ${JSON.stringify(version)};\nexport const MASTER_LEXICON_SHA256 = ${JSON.stringify(fileHash)};\n`;
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function writeFileWithRetry(filePath, content, attempts = 6) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      fs.writeFileSync(filePath, content);
      return;
    } catch (error) {
      lastError = error;
      if (!["EBUSY", "EPERM", "EACCES", "UNKNOWN"].includes(error?.code) || attempt === attempts - 1) throw error;
      sleep(50 * (attempt + 1));
    }
  }
  throw lastError;
}

export function applySemanticPatches({ sourcePath = CACHE, batch = "all", apply = false } = {}) {
  const sourcePayload = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const words = structuredClone(Array.isArray(sourcePayload) ? sourcePayload : sourcePayload.words || []);
  const beforeCount = words.length;
  const beforeProgress = preserveSnapshot(words);
  const selectedGroups = batch === "all" ? [...BATCH_FILES.values()] : [BATCH_FILES.get(batch)];
  if (selectedGroups.some((value) => !value)) throw new Error(`unknown batch: ${batch}`);
  const selected = selectedGroups.flat();
  const patches = selected.flatMap((name) => parseTsv(path.join(DATA_DIR, name)).map((row) => ({ ...row, sourceFile: name })));
  const patchIndexesById = new Map();
  patches.forEach((patch, index) => patchIndexesById.set(patch.id, [...(patchIndexesById.get(patch.id) || []), index]));
  const byId = new Map(words.map((entry) => [String(entry.id || entry.wordId || ""), entry]));
  const originalHashes = new Map(words.map((entry) => [String(entry.id || entry.wordId || ""), { meaning: hashMeaning(entry), example: hashExample(entry) }]));
  const deletedIds = new Set();
  const report = { version: SEMANTIC_QUALITY_VERSION, mode: apply ? "apply" : "dry-run", batch, beforeCount, patchCount: patches.length, modified: [], addedForms: [], addedMeanings: [], addedQuizSenses: [], deleted: [], alreadyApplied: [], deferred: [], kept: [], rejected: [], missingTargets: [], idChanges: 0, progressChanges: 0, errors: [], paidApiCalls: 0, externalPerWordLookups: 0 };

  for (let patchIndex = 0; patchIndex < patches.length; patchIndex += 1) {
    const patch = patches[patchIndex];
    if (!ALLOWED_ACTIONS.has(patch.action)) { report.errors.push(`invalid action ${patch.action}: ${patch.id}`); continue; }
    const entry = byId.get(patch.id);
    if (patch.action === "delete") {
      if (!entry) { report.alreadyApplied.push(patch.id); continue; }
      const original = originalHashes.get(patch.id);
      if (!patchHashesMatch(entry, patch, original)) { report.rejected.push({ id: patch.id, reason: "old-value-hash-changed" }); continue; }
      deletedIds.add(patch.id); report.deleted.push({ id: patch.id, word: patch.word, reason: patch.reason }); continue;
    }
    if (!entry) { report.missingTargets.push(patch.id); continue; }
    if (["keep", "defer"].includes(patch.action)) { report[patch.action === "keep" ? "kept" : "deferred"].push({ id: patch.id, word: patch.word, reason: patch.reason }); continue; }
    const laterDesiredPatch = (patchIndexesById.get(patch.id) || [])
      .filter((index) => index > patchIndex)
      .map((index) => patches[index])
      .find((candidate) => !["keep", "defer", "delete"].includes(candidate.action) && desiredState(entry, candidate));
    if (laterDesiredPatch) { report.alreadyApplied.push(patch.id); continue; }
    if (desiredState(entry, patch)) { report.alreadyApplied.push(patch.id); continue; }
    const original = originalHashes.get(patch.id);
    if (!patchHashesMatch(entry, patch, original)) { report.rejected.push({ id: patch.id, word: patch.word, reason: "old-value-hash-changed" }); continue; }
    const before = JSON.stringify(entry);
    const preserved = Object.fromEntries([...USER_PROGRESS_FIELDS].filter((field) => field in entry).map((field) => [field, structuredClone(entry[field])]));
    const set = parseJson(patch.setJson, {});
    for (const [field, value] of Object.entries(set)) if (!USER_PROGRESS_FIELDS.has(field) && !isV2Managed(entry, field)) entry[field] = value;
    const forms = parseJson(patch.addFormsJson, []);
    const meanings = parseJson(patch.addMeaningsJson, []);
    const quiz = parseJson(patch.addQuizSensesJson, []);
    const beforeForms = entry.forms?.length || 0;
    const beforeMeanings = entry.meaningsZh?.length || 0;
    const beforeQuiz = entry.quizSenses?.length || 0;
    entry.forms = mergeBy(entry.forms, forms, (item) => normalizeText(item?.word ?? item));
    entry.meaningsZh = mergeBy(entry.meaningsZh, meanings, (item) => `${normalizeText(item?.gloss)}::${normalizeText(item?.posFamily)}`);
    entry.quizSenses = mergeBy(entry.quizSenses, quiz, (item) => String(item?.senseId || ""));
    Object.assign(entry, preserved);
    if ((entry.forms?.length || 0) > beforeForms) report.addedForms.push(patch.id);
    if ((entry.meaningsZh?.length || 0) > beforeMeanings) report.addedMeanings.push(patch.id);
    if ((entry.quizSenses?.length || 0) > beforeQuiz) report.addedQuizSenses.push(patch.id);
    if (JSON.stringify(entry) !== before) report.modified.push({ id: patch.id, word: patch.word, action: patch.action, sourceFile: patch.sourceFile });
  }

  const retained = words.filter((entry) => !deletedIds.has(String(entry.id || entry.wordId || "")));
  const ids = new Set();
  for (const entry of retained) {
    const id = String(entry.id || entry.wordId || "");
    if (!id || ids.has(id)) report.errors.push(`invalid or duplicate stable id: ${id}`);
    ids.add(id);
    const before = beforeProgress.get(id) || {};
    const after = Object.fromEntries([...USER_PROGRESS_FIELDS].filter((field) => field in entry).map((field) => [field, entry[field]]));
    if (JSON.stringify(before) !== JSON.stringify(after)) report.progressChanges += 1;
  }
  report.idChanges = [...ids].filter((id) => !beforeProgress.has(id)).length;
  if (report.missingTargets.length) report.errors.push(`missing targets: ${report.missingTargets.join(",")}`);
  if (report.rejected.length) report.errors.push(`hash-rejected patches: ${report.rejected.length}`);
  if (report.progressChanges) report.errors.push(`progress fields changed: ${report.progressChanges}`);

  const version = `v9-${retained.length}-semantic-quality-v1`;
  const payload = Array.isArray(sourcePayload) ? retained : { ...sourcePayload, version, count: retained.length, savedAt: FIXED_TIME, lexiconHash: sha256(JSON.stringify(retained)), semanticQualityPatch: SEMANTIC_QUALITY_VERSION, words: retained };
  const raw = `${JSON.stringify(payload, null, 2)}\n`;
  const fileHash = sha256(raw);
  report.afterCount = retained.length;
  report.versionAfter = version;
  report.fileHash = fileHash;
  report.lexiconHash = payload.lexiconHash || sha256(JSON.stringify(retained));

  if (apply && !report.errors.length) {
    writeFileWithRetry(CACHE, raw);
    writeFileWithRetry(PUBLIC, raw);
    writeFileWithRetry(BASELINE, baselineSource(retained.length, version, fileHash));
  }
  if (process.argv.includes("--report")) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(path.join(REPORT_DIR, `apply-${batch}-report.json`), `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(path.join(REPORT_DIR, `apply-${batch}-modified.tsv`), toTsv(report.modified, ["id", "word", "action", "sourceFile"]));
  }
  return report;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const batchIndex = process.argv.indexOf("--batch");
  const batch = batchIndex >= 0 ? process.argv[batchIndex + 1] : "all";
  const report = applySemanticPatches({ batch, apply: process.argv.includes("--apply") });
  const output = process.argv.includes("--verbose") ? report : {
    version: report.version,
    mode: report.mode,
    batch: report.batch,
    beforeCount: report.beforeCount,
    afterCount: report.afterCount,
    patchCount: report.patchCount,
    modifiedCount: report.modified.length,
    deletedCount: report.deleted.length,
    addedFormsCount: report.addedForms.length,
    addedMeaningsCount: report.addedMeanings.length,
    addedQuizSensesCount: report.addedQuizSenses.length,
    deferredCount: report.deferred.length,
    rejectedCount: report.rejected.length,
    progressChanges: report.progressChanges,
    errors: report.errors,
    paidApiCalls: report.paidApiCalls,
    externalPerWordLookups: report.externalPerWordLookups
  };
  console.log(JSON.stringify(output, null, 2));
  if (report.errors.length) process.exitCode = 1;
}
