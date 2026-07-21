import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".static-export-cache", "words.json");
const PUBLIC = path.join(ROOT, "public", "data", "words.json");
const BASELINE = path.join(ROOT, "app", "lib", "vocab", "master-lexicon-baseline.mjs");
const AUDIT = path.join(ROOT, "data", "vocab-morphology", "audit");
const REPORT_DIR = path.join(ROOT, "reports", "vocab-morphology");

export const MORPHOLOGY_PATCH_VERSION = "vocab-morphology-v1-20260721";
export const FIXED_TIME = "2026-07-21T00:00:00.000Z";
export const USER_PROGRESS_FIELDS = new Set([
  "status", "favorite", "reviewCount", "lastReviewedAt", "nextReviewAt",
  "correctCount", "wrongCount", "correctStreak", "srs", "reviewStats",
  "lastSeenAt", "familiarity", "mastery"
]);

const APPLIED_ACTIONS = new Set([
  "SAFE_FORM_MERGE",
  "HYBRID_FORM_KEEP_SENSE",
  "KEEP_LEXICALIZED_LINK_FAMILY"
]);
const REVIEW_ACTIONS = new Set([
  "HIGH_CONFIDENCE_REVIEW_MERGE",
  "MANUAL_REVIEW_AMBIGUOUS"
]);

const RELATION_LABELS = new Map([
  ["plural", "plural"],
  ["third_person_singular", "third-person singular"],
  ["ing_form", "present participle / gerund"],
  ["past_or_participle", "past tense / past participle"],
  ["comparative", "comparative"],
  ["superlative", "superlative"]
]);

export function normalizeMorphologyKey(value = "") {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ");
}

export function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function parseAudit(filePath) {
  const stat = fs.statSync(filePath);
  const files = stat.isDirectory()
    ? fs.readdirSync(filePath).filter((name) => name.endsWith(".json") || name.endsWith(".json.gz.b64")).sort().map((name) => path.join(filePath, name))
    : [filePath];
  const rows = [];
  for (const sourceFile of files) {
    const raw = fs.readFileSync(sourceFile, "utf8");
    const jsonText = sourceFile.endsWith(".json.gz.b64")
      ? zlib.gunzipSync(Buffer.from(raw.trim(), "base64")).toString("utf8")
      : raw;
    const payload = JSON.parse(jsonText);
    if (!Array.isArray(payload)) throw new Error(`${path.basename(sourceFile)} must be an array`);
    for (const item of payload) {
      if (!Array.isArray(item) || item.length < 4) throw new Error(`${path.basename(sourceFile)} contains an invalid row`);
      const [id, word, final_action, rawLinks] = item;
      const links = (Array.isArray(rawLinks) ? rawLinks : []).map((link) => ({
        base: normalizeMorphologyKey(link?.[0]),
        relation: String(link?.[1] || "")
      })).filter((link) => link.base && link.relation);
      rows.push({ id: String(id || ""), word: String(word || ""), final_action: String(final_action || ""), links });
    }
  }
  return rows;
}

function parseLinks(row) {
  return Array.isArray(row.links) ? row.links : [];
}

function selectSafeLink(entry, resolved) {
  if (resolved.length === 1) return resolved;
  const uniqueBases = new Set(resolved.map((link) => normalizeMorphologyKey(link.entry?.word)));
  if (uniqueBases.size !== 1) return resolved;
  const pos = String(entry?.pos || "").toLowerCase();
  const meaning = String(entry?.meaning || "");
  const preferred = [];
  if (/noun|plural|(^|[\s/.,])n([\s/.,]|$)/i.test(pos) || /复数/u.test(meaning)) preferred.push("plural");
  if (/verb|(^|[\s/.,])v([\s/.,]|$)/i.test(pos) || /第三人称/u.test(meaning)) preferred.push("third_person_singular");
  if (/过去式|过去分词|past tense|past participle/i.test(`${pos} ${meaning}`)) preferred.push("past_or_participle");
  if (/现在分词|动名词|present participle|gerund/i.test(`${pos} ${meaning}`)) preferred.push("ing_form");
  if (/比较级|comparative/i.test(`${pos} ${meaning}`)) preferred.push("comparative");
  if (/最高级|superlative/i.test(`${pos} ${meaning}`)) preferred.push("superlative");
  for (const relation of preferred) {
    const match = resolved.find((link) => link.relation === relation);
    if (match) return [match];
  }
  return resolved;
}

function cloneProgress(words) {
  return new Map(words.map((entry) => {
    const id = String(entry?.id || entry?.wordId || "");
    const values = Object.fromEntries([...USER_PROGRESS_FIELDS]
      .filter((field) => field in entry)
      .map((field) => [field, structuredClone(entry[field])]));
    return [id, values];
  }));
}

function mergeObjects(items, additions, keyFn) {
  const map = new Map((Array.isArray(items) ? items : []).map((item) => [keyFn(item), item]));
  for (const addition of additions) {
    const key = keyFn(addition);
    const current = map.get(key);
    map.set(key, current && typeof current === "object" ? { ...current, ...addition } : addition);
  }
  return [...map.values()];
}

function addForm(baseEntry, formEntry, relation) {
  const type = RELATION_LABELS.get(relation) || relation;
  baseEntry.forms = mergeObjects(baseEntry.forms, [{
    word: formEntry.word,
    type,
    note: "已复核词形；阅读刷词以基词为主，拼写与搜索仍保留该形式。",
    source: MORPHOLOGY_PATCH_VERSION,
    sourceEntryId: String(formEntry.id || formEntry.wordId || "")
  }], (item) => normalizeMorphologyKey(item?.word ?? item));
}

function addFamilyLink(entry, relative, relation) {
  entry.wordFamily = mergeObjects(entry.wordFamily, [{
    word: relative.word,
    wordId: String(relative.id || relative.wordId || ""),
    relation,
    note: "词形外观相关但具有独立学习义项，保留独立词条。",
    source: MORPHOLOGY_PATCH_VERSION
  }], (item) => `${normalizeMorphologyKey(item?.word ?? item)}::${normalizeMorphologyKey(item?.relation || "")}`);
}

function baselineSource(count, version, fileHash) {
  return `// Baseline metadata for the bundled master lexicon.\n// Keep this in sync with public/data/words.json and .static-export-cache/words.json.\nexport const MASTER_LEXICON_EXPECTED_COUNT = ${count};\nexport const MASTER_LEXICON_VERSION = ${JSON.stringify(version)};\nexport const MASTER_LEXICON_SHA256 = ${JSON.stringify(fileHash)};\n`;
}

function writeWithRetry(filePath, content, attempts = 6) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
      return;
    } catch (error) {
      lastError = error;
      if (!["EBUSY", "EPERM", "EACCES", "UNKNOWN"].includes(error?.code) || attempt === attempts - 1) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (attempt + 1));
    }
  }
  throw lastError;
}

function reportTsv(rows) {
  const headers = ["id", "word", "bases", "relations", "final_action", "result"];
  const escape = (value) => String(value ?? "").replace(/[\t\r\n]+/g, " ");
  return `${headers.join("\t")}\n${rows.map((row) => headers.map((header) => escape(row[header])).join("\t")).join("\n")}\n`;
}

export function applyMorphologyCleanup({
  sourcePath = CACHE,
  auditPath = AUDIT,
  apply = false,
  writePaths = [CACHE, PUBLIC],
  baselinePath = BASELINE,
  reportDir = null
} = {}) {
  const sourcePayload = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const words = structuredClone(Array.isArray(sourcePayload) ? sourcePayload : sourcePayload.words || []);
  const originalWordsJson = JSON.stringify(words);
  const beforeProgress = cloneProgress(words);
  const originalIds = new Set(words.map((entry) => String(entry.id || entry.wordId || "")));
  const byId = new Map(words.map((entry) => [String(entry.id || entry.wordId || ""), entry]));
  const byWord = new Map(words.map((entry) => [normalizeMorphologyKey(entry.word), entry]));
  const auditRows = parseAudit(auditPath);

  const report = {
    version: MORPHOLOGY_PATCH_VERSION,
    mode: apply ? "apply" : "dry-run",
    totalWords: words.length,
    auditRows: auditRows.length,
    actionCounts: {},
    safeFormEntries: [],
    hybridEntries: [],
    lexicalizedEntries: [],
    highConfidenceReviewEntries: [],
    ambiguousReviewEntries: [],
    linkedForms: [],
    linkedFamilies: [],
    alreadyApplied: [],
    missingTargets: [],
    missingBases: [],
    skippedMultipleSafeBases: [],
    changedEntryIds: [],
    idChanges: 0,
    progressChanges: 0,
    errors: [],
    paidApiCalls: 0,
    externalPerWordLookups: 0
  };

  for (const row of auditRows) {
    report.actionCounts[row.final_action] = (report.actionCounts[row.final_action] || 0) + 1;
    if (REVIEW_ACTIONS.has(row.final_action)) {
      const target = row.final_action === "HIGH_CONFIDENCE_REVIEW_MERGE"
        ? report.highConfidenceReviewEntries
        : report.ambiguousReviewEntries;
      target.push({ id: row.id, word: row.word, bases: row.links.map((link) => link.base).join("|"), relations: row.links.map((link) => link.relation).join("|") });
      continue;
    }
    if (!APPLIED_ACTIONS.has(row.final_action)) {
      report.errors.push(`unknown final_action ${row.final_action}: ${row.id}`);
      continue;
    }

    const entry = byId.get(String(row.id || ""));
    if (!entry) {
      report.missingTargets.push({ id: row.id, word: row.word });
      continue;
    }
    const links = parseLinks(row);
    let resolved = links.map((link) => ({ ...link, entry: byWord.get(link.base) })).filter((link) => link.entry);
    if (row.final_action === "SAFE_FORM_MERGE") resolved = selectSafeLink(entry, resolved);
    for (const link of links) if (!byWord.has(link.base)) report.missingBases.push({ id: row.id, word: row.word, base: link.base, relation: link.relation });
    if (!resolved.length) continue;
    if (row.final_action === "SAFE_FORM_MERGE" && resolved.length !== 1) {
      report.skippedMultipleSafeBases.push({ id: row.id, word: row.word, links: resolved.map(({ base, relation }) => ({ base, relation })) });
      continue;
    }

    const beforeEntry = JSON.stringify(entry);
    const linkDetails = resolved.map(({ base, relation, entry: baseEntry }) => ({
      baseWord: baseEntry.word,
      baseWordId: String(baseEntry.id || baseEntry.wordId || ""),
      relation,
      relationLabel: RELATION_LABELS.get(relation) || relation
    }));
    entry.morphologyReview = {
      version: MORPHOLOGY_PATCH_VERSION,
      action: row.final_action,
      reviewedAt: FIXED_TIME,
      links: linkDetails
    };

    if (row.final_action === "SAFE_FORM_MERGE") {
      const [{ entry: baseEntry, relation }] = resolved;
      addForm(baseEntry, entry, relation);
      entry.entryType = "inflected-form";
      entry.studyMode = "reference";
      entry.readingPriority = false;
      entry.baseWord = baseEntry.word;
      entry.baseWordId = String(baseEntry.id || baseEntry.wordId || "");
      entry.relationType = relation;
      entry.redirectToWord = baseEntry.word;
      entry.entryStatus = "reviewed-inflected-form-20260721";
      report.safeFormEntries.push({ id: row.id, word: row.word, base: baseEntry.word, relation });
      report.linkedForms.push({ base: baseEntry.word, form: entry.word, relation, mode: "hide-from-default-reading" });
    } else if (row.final_action === "HYBRID_FORM_KEEP_SENSE") {
      for (const { entry: baseEntry, relation } of resolved) {
        addForm(baseEntry, entry, relation);
        report.linkedForms.push({ base: baseEntry.word, form: entry.word, relation, mode: "keep-independent-sense" });
      }
      entry.relatedBaseWords = linkDetails;
      report.hybridEntries.push({ id: row.id, word: row.word, links: linkDetails });
    } else if (row.final_action === "KEEP_LEXICALIZED_LINK_FAMILY") {
      for (const { entry: baseEntry } of resolved) {
        addFamilyLink(entry, baseEntry, "derived-from-or-related-to");
        addFamilyLink(baseEntry, entry, "lexicalized-form");
        report.linkedFamilies.push({ base: baseEntry.word, member: entry.word });
      }
      report.lexicalizedEntries.push({ id: row.id, word: row.word, links: linkDetails });
    }

    if (JSON.stringify(entry) === beforeEntry && row.final_action === "SAFE_FORM_MERGE") report.alreadyApplied.push(row.id);
  }

  const changedEntryIds = [];
  const currentById = new Map(words.map((entry) => [String(entry.id || entry.wordId || ""), entry]));
  const originalPayload = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const originalWords = Array.isArray(originalPayload) ? originalPayload : originalPayload.words || [];
  const originalById = new Map(originalWords.map((entry) => [String(entry.id || entry.wordId || ""), entry]));
  for (const [id, entry] of currentById) {
    if (JSON.stringify(entry) !== JSON.stringify(originalById.get(id))) changedEntryIds.push(id);
    const before = beforeProgress.get(id) || {};
    const after = Object.fromEntries([...USER_PROGRESS_FIELDS]
      .filter((field) => field in entry)
      .map((field) => [field, entry[field]]));
    if (JSON.stringify(before) !== JSON.stringify(after)) report.progressChanges += 1;
  }
  report.changedEntryIds = changedEntryIds;
  report.idChanges = [...currentById.keys()].filter((id) => !originalIds.has(id)).length
    + [...originalIds].filter((id) => !currentById.has(id)).length;

  if (report.missingTargets.length) report.errors.push(`missing targets: ${report.missingTargets.length}`);
  if (report.missingBases.length) report.errors.push(`missing bases: ${report.missingBases.length}`);
  if (report.skippedMultipleSafeBases.length) report.errors.push(`safe rows with multiple bases: ${report.skippedMultipleSafeBases.length}`);
  if (report.idChanges) report.errors.push(`stable IDs changed: ${report.idChanges}`);
  if (report.progressChanges) report.errors.push(`progress fields changed: ${report.progressChanges}`);

  const version = `v9-${words.length}-morphology-v1`;
  const payload = Array.isArray(sourcePayload) ? words : {
    ...sourcePayload,
    version,
    count: words.length,
    savedAt: FIXED_TIME,
    lexiconHash: sha256(JSON.stringify(words)),
    morphologyPatch: MORPHOLOGY_PATCH_VERSION,
    words
  };
  const raw = `${JSON.stringify(payload, null, 2)}\n`;
  const fileHash = sha256(raw);
  report.versionAfter = version;
  report.fileHash = fileHash;
  report.changed = JSON.stringify(words) !== originalWordsJson;

  if (apply && !report.errors.length) {
    for (const targetPath of writePaths || []) writeWithRetry(targetPath, raw);
    if (baselinePath) writeWithRetry(baselinePath, baselineSource(words.length, version, fileHash));
  }

  if (reportDir) {
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(path.join(reportDir, `apply-${apply ? "apply" : "dry-run"}.json`), `${JSON.stringify(report, null, 2)}\n`);
    const rows = [
      ...report.safeFormEntries.map((item) => ({ ...item, bases: item.base, relations: item.relation, final_action: "SAFE_FORM_MERGE", result: "linked-and-hidden-from-default-reading" })),
      ...report.hybridEntries.map((item) => ({ ...item, bases: item.links.map((link) => link.baseWord).join("|"), relations: item.links.map((link) => link.relation).join("|"), final_action: "HYBRID_FORM_KEEP_SENSE", result: "linked-and-kept" })),
      ...report.lexicalizedEntries.map((item) => ({ ...item, bases: item.links.map((link) => link.baseWord).join("|"), relations: item.links.map((link) => link.relation).join("|"), final_action: "KEEP_LEXICALIZED_LINK_FAMILY", result: "family-linked-and-kept" })),
      ...report.highConfidenceReviewEntries.map((item) => ({ ...item, final_action: "HIGH_CONFIDENCE_REVIEW_MERGE", result: "review-queue" })),
      ...report.ambiguousReviewEntries.map((item) => ({ ...item, final_action: "MANUAL_REVIEW_AMBIGUOUS", result: "manual-review-queue" }))
    ];
    fs.writeFileSync(path.join(reportDir, "morphology-actions.tsv"), reportTsv(rows));
  }

  return report;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const apply = process.argv.includes("--apply");
  const report = applyMorphologyCleanup({
    apply,
    reportDir: process.argv.includes("--report") ? REPORT_DIR : null
  });
  console.log(JSON.stringify({
    version: report.version,
    mode: report.mode,
    totalWords: report.totalWords,
    auditRows: report.auditRows,
    actionCounts: report.actionCounts,
    safeFormEntries: report.safeFormEntries.length,
    hybridEntries: report.hybridEntries.length,
    lexicalizedEntries: report.lexicalizedEntries.length,
    highConfidenceReviewEntries: report.highConfidenceReviewEntries.length,
    ambiguousReviewEntries: report.ambiguousReviewEntries.length,
    linkedForms: report.linkedForms.length,
    linkedFamilies: report.linkedFamilies.length,
    changedEntryIds: report.changedEntryIds.length,
    idChanges: report.idChanges,
    progressChanges: report.progressChanges,
    errors: report.errors,
    paidApiCalls: 0,
    externalPerWordLookups: 0
  }, null, 2));
  if (report.errors.length) process.exitCode = 1;
}
