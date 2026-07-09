import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRetrievalQuestion, createBuilderCaches, validateRetrievalQuestion } from "./builder.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../..");
const wordBankPath = path.join(projectRoot, "public", "data", "meaning-4500.json");
const reportDir = path.join(projectRoot, "reports");

export function runMeaningEnAudit(limit = Infinity) {
  const data = JSON.parse(fs.readFileSync(wordBankPath, "utf8"));
  const wordBank = data.items || [];
  const caches = createBuilderCaches();
  const summary = {
    mode: "meaning-en",
    generatedAt: new Date().toISOString(),
    totalTargets: Math.min(wordBank.length, limit),
    built: 0,
    deferred: 0,
    needsReview: 0,
    p1: 0,
    p2: 0,
    p3p4: 0,
    missingLearnerDistinction: 0,
    missingRelationEvidence: 0,
    posMismatch: 0,
    duplicateEnglishOptions: 0,
    shortPromptNeedsReview: 0,
    answerPosition: [0, 0, 0, 0],
    deferredReasons: {},
    reviewItems: []
  };

  const max = Math.min(wordBank.length, limit);
  for (let i = 0; i < max; i++) {
    const entry = wordBank[i];
    const question = buildRetrievalQuestion(entry, wordBank, "meaning-en-audit", i, caches);
    if (!question || question.qualityDeferred) {
      summary.deferred++;
      const reason = question ? question.reason || "unknown" : "empty-question";
      summary.deferredReasons[reason] = (summary.deferredReasons[reason] || 0) + 1;
      continue;
    }

    const validation = validateRetrievalQuestion(question);
    if (!validation.valid) {
      summary.needsReview++;
      addReview(summary, entry, question, validation.reason);
      continue;
    }

    summary.built++;
    summary.answerPosition[question.correctOptionIndex]++;

    const labels = question.options.map(option => normalize(option.headword));
    if (new Set(labels).size !== labels.length) {
      summary.duplicateEnglishOptions++;
      addReview(summary, entry, question, "duplicate-english-options");
    }

    if (isPromptTooShort(question.chinesePromptZh)) {
      summary.shortPromptNeedsReview++;
      addReview(summary, entry, question, "short-chinese-prompt");
    }

    for (const option of question.options) {
      if (option.qualityClass === "P1") summary.p1++;
      else if (option.qualityClass === "P2") summary.p2++;
      else summary.p3p4++;
      if (!option.learnerDistinctionZh) summary.missingLearnerDistinction++;
      if (!option.relationEvidence || !option.relationEvidence.kind) summary.missingRelationEvidence++;
      if (option.posFamily !== question.posFamily) summary.posMismatch++;
    }
  }

  summary.needsReview = Math.max(summary.needsReview, summary.shortPromptNeedsReview);
  return summary;
}

export function writeMeaningEnAudit(summary) {
  fs.mkdirSync(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, "meaning-en-audit.json");
  const mdPath = path.join(reportDir, "meaning-en-audit.md");
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf8");
  fs.writeFileSync(mdPath, renderMarkdown(summary), "utf8");
  return { jsonPath, mdPath };
}

function addReview(summary, entry, question, reason) {
  if (summary.reviewItems.length >= 200) return;
  summary.reviewItems.push({
    reason,
    wordId: entry.wordId,
    headword: entry.word,
    prompt: question ? question.chinesePromptZh : null,
    answer: question ? question.canonicalAnswer : null
  });
}

function isPromptTooShort(value) {
  const text = String(value || "").replace(/[，。；;、\s]/g, "");
  return text.length > 0 && text.length <= 2;
}

function renderMarkdown(summary) {
  return [
    "# Meaning-En Audit",
    "",
    `Generated: ${summary.generatedAt}`,
    "",
    `- Total targets: ${summary.totalTargets}`,
    `- BUILT: ${summary.built}`,
    `- DEFERRED: ${summary.deferred}`,
    `- NEEDS_REVIEW: ${summary.needsReview}`,
    `- P1 options: ${summary.p1}`,
    `- P2 options: ${summary.p2}`,
    `- P3/P4 options: ${summary.p3p4}`,
    `- Missing learnerDistinctionZh: ${summary.missingLearnerDistinction}`,
    `- Missing relationEvidence: ${summary.missingRelationEvidence}`,
    `- POS mismatch: ${summary.posMismatch}`,
    `- Duplicate English options: ${summary.duplicateEnglishOptions}`,
    `- Short prompt review count: ${summary.shortPromptNeedsReview}`,
    `- Answer positions: ${summary.answerPosition.join(", ")}`,
    "",
    "## Deferred Reasons",
    "",
    ...Object.entries(summary.deferredReasons).map(([reason, count]) => `- ${reason}: ${count}`),
    "",
    "## Review Sample",
    "",
    ...summary.reviewItems.slice(0, 50).map(item => `- ${item.reason}: ${item.headword} (${item.wordId}) -> ${item.prompt || ""}`)
  ].join("\n");
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const limitArg = process.argv.find(arg => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : Infinity;
  const summary = runMeaningEnAudit(Number.isFinite(limit) && limit > 0 ? limit : Infinity);
  const paths = writeMeaningEnAudit(summary);
  console.log(JSON.stringify({ summary, paths }, null, 2));
}
