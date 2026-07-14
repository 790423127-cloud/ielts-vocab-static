/**
 * Refresh reading-g-import-report.json audit fields (does not change vocab entries).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { auditParaphraseQuizSafety } from "../app/lib/reading-g-vocab/paraphrase-quiz.mjs";
import { countPhraseStages, countStageUniques } from "../app/lib/reading-g-vocab/stages.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const vocabPath = path.join(root, "public/data/reading-g-vocab.json");
const paraPath = path.join(root, "public/data/reading-g-paraphrases.json");
const reportPath = path.join(root, "public/data/reading-g-import-report.json");

const vocab = JSON.parse(fs.readFileSync(vocabPath, "utf8"));
const para = JSON.parse(fs.readFileSync(paraPath, "utf8"));
const report = fs.existsSync(reportPath)
  ? JSON.parse(fs.readFileSync(reportPath, "utf8"))
  : {};

const items = vocab.items || [];
const quizAudit = auditParaphraseQuizSafety(para.groups || []);
const phraseStages = countPhraseStages(items);
const stageUniques = countStageUniques(items);

let missingWordPhonetics = 0;
let missingPhrasePhonetics = 0;
let meaningFamiliar = 0; // placeholder — runtime only
for (const it of items) {
  const isPhrase = it.entryType === "phrase" || /\s/.test(it.word || "");
  const has = Boolean(String(it.phonetic || "").trim());
  if (isPhrase) {
    if (!has) missingPhrasePhonetics += 1;
  } else if (!has) missingWordPhonetics += 1;
}

report.updatedAt = new Date().toISOString();
report.completionV3 = {
  safeParaphraseQuizGroupCount: quizAudit.safeParaphraseQuizGroupCount,
  skippedParaphraseQuizGroupCount: quizAudit.skippedParaphraseQuizGroupCount,
  skippedGroupReasons: quizAudit.skippedGroupReasons,
  meaningStatusCounts: { note: "runtime localStorage" },
  phraseStatusCounts: { note: "runtime localStorage" },
  paraphraseStatusCounts: { note: "runtime localStorage" },
  phraseStage1Count: phraseStages.phraseStage1Count,
  phraseStage2Count: phraseStages.phraseStage2Count,
  phrases400Count: phraseStages.phrases400Count,
  stageUniqueCounts: stageUniques,
  missingWordPhonetics,
  missingPhrasePhonetics,
  migrationMatchedCount: null,
  migrationAmbiguousCount: null,
  cloudExportFiles: [
    "data/reading-g-vocab.json",
    "data/reading-g-paraphrases.json",
    "data/reading-g-import-report.json",
    "reading-g.html",
    "assets/reading-g.js"
  ],
  itemCount: items.length,
  activeCount: items.filter((i) => i.studyMode === "active").length,
  referenceCount: items.filter((i) => i.studyMode === "reference").length
};

// also top-level convenience fields per spec
report.safeParaphraseQuizGroupCount = quizAudit.safeParaphraseQuizGroupCount;
report.skippedParaphraseQuizGroupCount = quizAudit.skippedParaphraseQuizGroupCount;
report.skippedGroupReasons = quizAudit.skippedGroupReasons;
report.phraseStage1Count = phraseStages.phraseStage1Count;
report.phraseStage2Count = phraseStages.phraseStage2Count;
report.missingWordPhonetics = missingWordPhonetics;
report.missingPhrasePhonetics = missingPhrasePhonetics;
report.cloudExportFiles = report.completionV3.cloudExportFiles;

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report.completionV3, null, 2));
