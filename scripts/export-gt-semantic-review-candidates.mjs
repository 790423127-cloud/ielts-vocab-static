import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORDS_PATH = path.join(ROOT, "public", "data", "words.json");
const OUTPUT_PATH = path.join(ROOT, "reports", "gt-complete-semantic-review-candidates.json");
const OUTPUT_TSV_PATH = path.join(ROOT, "reports", "gt-complete-semantic-review-candidates.tsv");
const MARKERS = ["无中文释义", "（无中文释义)", "(无中文释义)", "；无中文释义", "。无中文释义"];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function cleanTsv(value) {
  return String(value ?? "")
    .replace(/\t/g, " ")
    .replace(/\r?\n/g, " ")
    .trim();
}

function issuesFor(entry) {
  const issues = [];
  const pos = String(entry?.pos || "").trim().toLowerCase();
  const meaning = String(entry?.meaning || "").trim();
  const definition = String(entry?.definition || "").trim();
  const example = String(entry?.example || "").trim();
  const tokens = example.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];

  if (!meaning) issues.push("missing_meaning");
  if (!definition) issues.push("missing_definition");
  if (!pos || ["word", "unknown", "n/a"].includes(pos)) issues.push("generic_or_missing_pos");
  if (tokens.length < 4) issues.push("short_or_broken_example");
  if (MARKERS.some((marker) => meaning.includes(marker) || definition.includes(marker))) {
    issues.push("placeholder_meaning_marker");
  }
  if (/非标准词形或来源残留|专有名词，需结合原文识别|专有名词、非标准词形或来源残留/.test(meaning)) {
    issues.push("reference_requires_contextual_review");
  }
  return issues;
}

const payload = readJson(WORDS_PATH);
const words = Array.isArray(payload) ? payload : Array.isArray(payload.words) ? payload.words : [];
const enriched = words
  .map((entry) => ({ entry, issues: issuesFor(entry) }))
  .filter((item) => item.issues.length)
  .map(({ entry, issues }) => ({
    id: String(entry.id || entry.wordId || ""),
    word: String(entry.word || ""),
    issues,
    pos: String(entry.pos || ""),
    meaning: String(entry.meaning || ""),
    meaningDetailedZh: String(entry.meaningDetailedZh || ""),
    definition: String(entry.definition || ""),
    example: String(entry.example || ""),
    exampleCn: String(entry.exampleCn || ""),
    difficulty: String(entry.difficulty || ""),
    category: String(entry.category || ""),
    studyMode: String(entry.studyMode || ""),
    gtPlanStage: Number(entry.gtPlanStage || 0) || null,
    ieltsUse: Array.isArray(entry.ieltsUse) ? entry.ieltsUse : [],
    topics: Array.isArray(entry.topics) ? entry.topics : [],
    sourceType: String(entry.sourceType || ""),
    entryStatus: String(entry.entryStatus || ""),
    forms: Array.isArray(entry.forms) ? entry.forms : [],
    wordFamily: Array.isArray(entry.wordFamily) ? entry.wordFamily : [],
    meaningsZh: Array.isArray(entry.meaningsZh) ? entry.meaningsZh : [],
    quizSenses: Array.isArray(entry.quizSenses) ? entry.quizSenses : [],
    collocations: Array.isArray(entry.collocations) ? entry.collocations : [],
    phraseCollocations: Array.isArray(entry.phraseCollocations) ? entry.phraseCollocations : []
  }));

enriched.sort((a, b) => a.issues.join(",").localeCompare(b.issues.join(",")) || a.word.localeCompare(b.word));
const summary = {};
for (const item of enriched) {
  for (const issue of item.issues) summary[issue] = (summary[issue] || 0) + 1;
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceWordVersion: String(payload?.version || ""),
  totalCandidates: enriched.length,
  issueSummary: summary,
  candidates: enriched
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
const headers = [
  "id", "word", "issues", "pos", "meaning", "meaningDetailedZh", "definition",
  "example", "exampleCn", "difficulty", "category", "studyMode", "gtPlanStage",
  "ieltsUse", "topics", "sourceType", "entryStatus"
];
const rows = enriched.map((item) => headers.map((header) => {
  const value = item[header];
  return cleanTsv(Array.isArray(value) || (value && typeof value === "object") ? JSON.stringify(value) : value);
}).join("\t"));
fs.writeFileSync(OUTPUT_TSV_PATH, `${headers.join("\t")}\n${rows.join("\n")}\n`);

console.log(JSON.stringify({
  ok: true,
  totalCandidates: enriched.length,
  issueSummary: summary,
  jsonPath: path.relative(ROOT, OUTPUT_PATH).replace(/\\/g, "/"),
  tsvPath: path.relative(ROOT, OUTPUT_TSV_PATH).replace(/\\/g, "/")
}, null, 2));
