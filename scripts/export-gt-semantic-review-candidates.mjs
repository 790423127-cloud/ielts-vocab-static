import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORDS_PATH = path.join(ROOT, "public", "data", "words.json");
const PATCH_REPORT_PATH = path.join(ROOT, "reports", "gt-complete-vocab-patch-report.json");
const OUTPUT_PATH = path.join(ROOT, "reports", "gt-complete-semantic-review-candidates.json");
const OUTPUT_TSV_PATH = path.join(ROOT, "reports", "gt-complete-semantic-review-candidates.tsv");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function cleanTsv(value) {
  return String(value ?? "")
    .replace(/\t/g, " ")
    .replace(/\r?\n/g, " ")
    .trim();
}

const payload = readJson(WORDS_PATH);
const words = Array.isArray(payload) ? payload : Array.isArray(payload.words) ? payload.words : [];
const patchReport = readJson(PATCH_REPORT_PATH);
const candidates = Array.isArray(patchReport.semanticReviewCandidates)
  ? patchReport.semanticReviewCandidates
  : [];

const byId = new Map();
const byWord = new Map();
for (const entry of words) {
  const id = String(entry?.id || entry?.wordId || "");
  if (id) byId.set(id, entry);
  const key = normalize(entry?.word);
  if (key && !byWord.has(key)) byWord.set(key, entry);
}

const enriched = candidates.map((candidate) => {
  const entry = byId.get(String(candidate.id || "")) || byWord.get(normalize(candidate.word)) || {};
  return {
    id: String(entry.id || entry.wordId || candidate.id || ""),
    word: String(entry.word || candidate.word || ""),
    issues: Array.isArray(candidate.issues) ? candidate.issues : [],
    pos: String(entry.pos || candidate.currentPos || ""),
    meaning: String(entry.meaning || candidate.currentMeaning || ""),
    meaningDetailedZh: String(entry.meaningDetailedZh || ""),
    definition: String(entry.definition || ""),
    example: String(entry.example || candidate.currentExample || ""),
    exampleCn: String(entry.exampleCn || ""),
    difficulty: String(entry.difficulty || ""),
    category: String(entry.category || ""),
    studyMode: String(entry.studyMode || candidate.studyMode || ""),
    gtPlanStage: Number(entry.gtPlanStage || candidate.gtPlanStage || 0) || null,
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
  };
});

enriched.sort((a, b) => {
  const issueA = a.issues.join(",");
  const issueB = b.issues.join(",");
  return issueA.localeCompare(issueB) || a.word.localeCompare(b.word);
});

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
