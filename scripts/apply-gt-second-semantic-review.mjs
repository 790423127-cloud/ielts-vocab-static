import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data", "gt-complete");
const CACHE_PATH = path.join(ROOT, ".static-export-cache", "words.json");
const PUBLIC_PATH = path.join(ROOT, "public", "data", "words.json");
const PLAN_PATH = path.join(ROOT, "public", "data", "gt-complete-learning-plan.json");
const BASELINE_PATH = path.join(ROOT, "app", "lib", "vocab", "master-lexicon-baseline.mjs");
const REPORT_PATH = path.join(ROOT, "reports", "gt-second-semantic-review-report.json");
const VERSION = "gt-second-semantic-review-20260714-v1";
const FIXED_TIME = "2026-07-14T00:00:00.000Z";
const USER_FIELDS = new Set([
  "status", "favorite", "reviewCount", "lastReviewedAt", "nextReviewAt",
  "correctCount", "wrongCount", "correctStreak"
]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseTsv(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines.shift().split("\t");
  return lines.map((line) => {
    const cells = line.split("\t");
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function readActions() {
  return fs.readdirSync(DATA_DIR)
    .filter((name) => /^second-review-.*\.tsv$/i.test(name))
    .sort()
    .flatMap((name) => parseTsv(path.join(DATA_DIR, name)).map((row) => ({ ...row, sourceFile: name })));
}

function parsePatch(value) {
  const text = String(value || "").trim();
  if (!text) return {};
  return JSON.parse(text);
}

function baselineSource(count, version, fileHash) {
  return `// Baseline metadata for the bundled master lexicon.\n// Keep this in sync with public/data/words.json and .static-export-cache/words.json.\nexport const MASTER_LEXICON_EXPECTED_COUNT = ${count};\nexport const MASTER_LEXICON_VERSION = ${JSON.stringify(version)};\nexport const MASTER_LEXICON_SHA256 = ${JSON.stringify(fileHash)};\n`;
}

function cleanLinks(entry, deletedKeys) {
  for (const field of ["forms", "wordFamily"]) {
    if (!Array.isArray(entry[field])) continue;
    entry[field] = entry[field].filter((item) => !deletedKeys.has(normalize(item?.word)));
  }
}

function updatePlan(remainingIds) {
  if (!fs.existsSync(PLAN_PATH)) return null;
  const plan = readJson(PLAN_PATH);
  for (const stage of Object.values(plan.stages || {})) {
    stage.wordIds = Array.isArray(stage.wordIds)
      ? stage.wordIds.filter((id) => remainingIds.has(String(id)))
      : [];
    stage.phraseIds = Array.isArray(stage.phraseIds) ? [...new Set(stage.phraseIds.map(String))] : [];
    stage.wordCount = stage.wordIds.length;
    stage.phraseCount = stage.phraseIds.length;
    stage.totalCount = stage.wordCount + stage.phraseCount;
  }
  plan.version = "gt-complete-learning-plan-20260714-v2-second-review";
  plan.secondSemanticReview = VERSION;
  fs.writeFileSync(PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`);
  return Object.fromEntries(Object.entries(plan.stages || {}).map(([key, stage]) => [key, stage.totalCount]));
}

function main() {
  const apply = process.argv.includes("--apply");
  const sourcePayload = readJson(CACHE_PATH);
  const words = structuredClone(Array.isArray(sourcePayload) ? sourcePayload : sourcePayload.words || []);
  const actions = readActions();
  const deleteActions = actions.filter((row) => row.action === "delete");
  const repairActions = actions.filter((row) => row.action === "repair");
  const report = {
    version: VERSION,
    mode: apply ? "apply" : "dry-run",
    beforeCount: words.length,
    actionCount: actions.length,
    requestedDeleteCount: deleteActions.length,
    requestedRepairCount: repairActions.length,
    deleted: [],
    alreadyAbsent: [],
    repaired: [],
    unchangedRepairs: [],
    missingRepairTargets: [],
    reasonCounts: {},
    danglingLinksRemoved: 0,
    errors: []
  };

  for (const action of actions) {
    report.reasonCounts[action.reasonCode] = (report.reasonCounts[action.reasonCode] || 0) + 1;
  }

  const byWord = new Map(words.map((entry) => [normalize(entry.word), entry]));
  for (const action of repairActions) {
    const entry = byWord.get(normalize(action.word));
    if (!entry) {
      report.missingRepairTargets.push(action.word);
      continue;
    }
    const before = JSON.stringify(entry);
    const patch = parsePatch(action.set);
    const preserved = Object.fromEntries(
      [...USER_FIELDS].filter((field) => field in entry).map((field) => [field, entry[field]])
    );
    for (const [field, value] of Object.entries(patch)) {
      if (!USER_FIELDS.has(field)) entry[field] = value;
    }
    Object.assign(entry, preserved);
    if (patch.meaning) {
      entry.meaningDetailedZh = patch.meaning;
      entry.meaningDetailZh = `“${entry.word}”经第二批人工复核后释义为：${patch.meaning}。`;
      if ("meaningOriginal" in entry) entry.meaningOriginal = patch.meaning;
    }
    if (JSON.stringify(entry) === before) report.unchangedRepairs.push(action.word);
    else report.repaired.push(action.word);
  }

  const deleteKeys = new Set(deleteActions.map((row) => normalize(row.word)));
  const retained = [];
  for (const entry of words) {
    if (deleteKeys.has(normalize(entry.word))) {
      report.deleted.push({ id: String(entry.id || entry.wordId || ""), word: entry.word });
    } else {
      retained.push(entry);
    }
  }
  const existingKeys = new Set(words.map((entry) => normalize(entry.word)));
  for (const action of deleteActions) {
    if (!existingKeys.has(normalize(action.word))) report.alreadyAbsent.push(action.word);
  }

  for (const entry of retained) {
    const beforeForms = Array.isArray(entry.forms) ? entry.forms.length : 0;
    const beforeFamily = Array.isArray(entry.wordFamily) ? entry.wordFamily.length : 0;
    cleanLinks(entry, deleteKeys);
    report.danglingLinksRemoved += beforeForms - (entry.forms?.length || 0);
    report.danglingLinksRemoved += beforeFamily - (entry.wordFamily?.length || 0);
  }

  const normalizedHeads = new Set();
  const ids = new Set();
  for (const entry of retained) {
    const key = normalize(entry.word);
    const id = String(entry.id || entry.wordId || "");
    if (!key) report.errors.push("empty normalized headword");
    if (normalizedHeads.has(key)) report.errors.push(`duplicate headword: ${entry.word}`);
    normalizedHeads.add(key);
    if (!id) report.errors.push(`missing stable ID: ${entry.word}`);
    if (ids.has(id)) report.errors.push(`duplicate stable ID: ${id}`);
    ids.add(id);
  }
  if (report.missingRepairTargets.length) {
    report.errors.push(`missing repair targets: ${report.missingRepairTargets.join(", ")}`);
  }

  const version = `v9-${retained.length}-gt-complete-20260714-v2-second-review`;
  const payload = Array.isArray(sourcePayload)
    ? retained
    : {
        ...sourcePayload,
        version,
        savedAt: FIXED_TIME,
        count: retained.length,
        lexiconHash: sha256(JSON.stringify(retained)),
        secondSemanticReview: VERSION,
        words: retained
      };
  const raw = `${JSON.stringify(payload, null, 2)}\n`;
  const fileHash = sha256(raw);
  report.afterCount = retained.length;
  report.actualDeleteCount = report.deleted.length;
  report.actualRepairCount = report.repaired.length;
  report.wordVersion = version;
  report.wordsFileHash = fileHash;

  if (report.errors.length) {
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  if (apply) {
    fs.writeFileSync(CACHE_PATH, raw);
    fs.writeFileSync(PUBLIC_PATH, raw);
    fs.writeFileSync(BASELINE_PATH, baselineSource(retained.length, version, fileHash));
    report.planCounts = updatePlan(new Set(retained.map((entry) => String(entry.id || entry.wordId || ""))));
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(JSON.stringify(report, null, 2));
}

main();
