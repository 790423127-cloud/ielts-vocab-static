import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createEngine } from "../engine.mjs";
import { buildQuestionWithValidation, validateQuestion } from "../builder.mjs";
import { resetGlobalFrequency } from "../distractor-ranking.mjs";
import { _BROAD_AXES } from "../sense-relation-engine.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..", "..");
const DATA_PATH = join(ROOT, "public", "data", "meaning-6000.json");
const REPORTS_DIR = join(ROOT, "reports");

function pct(count, total) {
  return total > 0 ? Number((count / total * 100).toFixed(2)) : 0;
}

function hasTraceableEvidence(opt) {
  return !!(
    opt.sourceWordId
    && opt.sourceHeadword
    && opt.posFamily
    && opt.senseKey
    && (opt.senseKeySource === "native" || opt.senseKeySource === "derived")
    && opt.quizMeaningZh
    && opt.meaningDetailedZh
    && opt.relationType
    && opt.relationReason
    && opt.relationReason !== opt.relationType
    && opt.relationEvidence
    && (opt.relationEvidence.kind === "catalog" || opt.relationEvidence.kind === "definition-derived")
    && Array.isArray(opt.relationEvidence.sourceFields)
    && opt.relationEvidence.sourceFields.length > 0
  );
}

function isWideAxisOnly(opt) {
  if (!_BROAD_AXES.has(opt.candidateAxis)) return false;
  const fields = opt.relationEvidence && opt.relationEvidence.sourceFields || [];
  const hasDefinitionFields = fields.some(f => f.includes("quizMeaningZh") || f.includes("meaningDetailedZh") || f.includes("learnerDistinctionZh"));
  return !hasDefinitionFields;
}

function optionProblem(opt) {
  const relation = opt.relationType || opt.relationToTarget || "";
  return relation === "unrelated"
    || relation === "random-same-pos"
    || relation === "same-broad-domain-only"
    || opt.qualityTier === "C"
    || opt.qualityTier === "BAD"
    || opt.relationConfidence === "low";
}

async function main() {
  mkdirSync(REPORTS_DIR, { recursive: true });
  resetGlobalFrequency();

  const wordBankRaw = JSON.parse(readFileSync(DATA_PATH, "utf-8")).items;
  const engine = await createEngine(wordBankRaw);
  const bank = engine.distractorPool || engine.wordBank;

  const stats = {
    totalTargetWords: engine.wordBank.length,
    builtQuestions: 0,
    validationFailures: 0,
    semanticQualityDeferred: 0,
    qualityDeferred: 0,
    finalOptions: 0,
    finalDistractors: 0,
    P1: 0,
    P2: 0,
    P3InFinal: 0,
    P4InFinal: 0,
    learnerDistinctionMissing: 0,
    relationEvidenceMissing: 0,
    untraceableFieldSource: 0,
    derivedSenseKey: 0,
    mixedTargetSense: 0,
    wideAxisOnlySupportInFinal: 0,
    unrelatedCBadLowConfidence: 0,
    top30DistractorFrequency: [],
    maxDistractorFrequency: null,
    samples: [],
    deferredReasons: {},
    knownPairViolations: []
  };

  const targetWords = new Set(["commitment", "experience", "limited", "aggressive", "impression", "approach", "consequence", "assumption", "evaluation", "drawback"]);
  const blockedPairs = new Map([
    ["commitment", new Set(["culture", "relation", "independence"])],
    ["experience", new Set(["satisfaction", "anxiety", "happiness"])],
    ["limited", new Set(["early", "extra", "all", "quick", "rapid", "fast"])],
    ["aggressive", new Set(["meaningful", "used", "asian"])]
  ]);
  const distractorFreq = new Map();

  for (let i = 0; i < engine.wordBank.length; i++) {
    const entry = engine.wordBank[i];
    const q = buildQuestionWithValidation(entry, bank, "stage11-full", i, engine.antiCache, engine.qualityCache, 2);
    if (q.qualityDeferred) {
      stats.qualityDeferred++;
      if (q.semanticQualityDeferred) {
        stats.semanticQualityDeferred++;
        if (q.reason && q.reason.includes("mixed-target-sense")) stats.mixedTargetSense++;
      }
      stats.deferredReasons[q.reason || "unknown"] = (stats.deferredReasons[q.reason || "unknown"] || 0) + 1;
      continue;
    }

    const validation = validateQuestion(q);
    if (!validation.valid) {
      stats.validationFailures++;
      stats.deferredReasons["validation:" + validation.reason] = (stats.deferredReasons["validation:" + validation.reason] || 0) + 1;
      continue;
    }

    stats.builtQuestions++;
    const sample = {
      word: q.word,
      wordId: q.wordId,
      correctAnswer: q.correctAnswer,
      options: q.options.map(o => ({
        sourceHeadword: o.sourceHeadword,
        quizMeaningZh: o.quizMeaningZh,
        qualityClass: o.qualityClass,
        qualityTier: o.qualityTier,
        relationType: o.relationType,
        learnerDistinctionZh: o.learnerDistinctionZh
      }))
    };
    if (targetWords.has(q.word) || stats.samples.length < 10) stats.samples.push(sample);

    const blocked = blockedPairs.get(q.word);
    if (blocked) {
      for (const opt of q.options.filter(o => !o.isCorrect)) {
        if (blocked.has(String(opt.sourceHeadword || "").toLowerCase())) {
          stats.knownPairViolations.push({ target: q.word, distractor: opt.sourceHeadword });
        }
      }
    }

    for (const opt of q.options) {
      stats.finalOptions++;
      if (!opt.isCorrect) {
        stats.finalDistractors++;
        distractorFreq.set(opt.sourceHeadword, (distractorFreq.get(opt.sourceHeadword) || 0) + 1);
      }
      if (opt.qualityClass === "P1") stats.P1++;
      if (opt.qualityClass === "P2") stats.P2++;
      if (opt.qualityClass === "P3") stats.P3InFinal++;
      if (opt.qualityClass === "P4") stats.P4InFinal++;
      if (!opt.learnerDistinctionZh) stats.learnerDistinctionMissing++;
      if (!opt.relationEvidence) stats.relationEvidenceMissing++;
      if (!hasTraceableEvidence(opt)) stats.untraceableFieldSource++;
      if (opt.senseKeySource === "derived") stats.derivedSenseKey++;
      if (isWideAxisOnly(opt)) stats.wideAxisOnlySupportInFinal++;
      if (optionProblem(opt)) stats.unrelatedCBadLowConfidence++;
    }
  }

  const totalDistractorSlots = Math.max(1, stats.finalDistractors);
  const freqRows = [...distractorFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word, count]) => ({ word, count, pct: pct(count, totalDistractorSlots) }));
  stats.top30DistractorFrequency = freqRows.slice(0, 30);
  stats.maxDistractorFrequency = freqRows[0] || null;
  stats.samples = stats.samples.slice(0, 10);

  stats.pass = stats.P3InFinal === 0
    && stats.P4InFinal === 0
    && stats.learnerDistinctionMissing === 0
    && stats.relationEvidenceMissing === 0
    && stats.untraceableFieldSource === 0
    && stats.wideAxisOnlySupportInFinal === 0
    && stats.unrelatedCBadLowConfidence === 0
    && stats.knownPairViolations.length === 0;

  const out = {
    generatedAt: new Date().toISOString(),
    productionPath: ["engine", "builder", "distractor-ranking", "sense-relation-engine", "final option selection"],
    stats,
    repairBefore: {
      note: "Not rerun by instruction; this pass reports post-repair production output only."
    },
    testResult: null,
    webRegression: null,
    conclusion: stats.pass ? "PASS" : "PARTIAL"
  };

  writeFileSync(join(REPORTS_DIR, "meaning-stage11-repair.json"), JSON.stringify(out, null, 2), "utf-8");
  console.log(JSON.stringify({
    builtQuestions: stats.builtQuestions,
    semanticQualityDeferred: stats.semanticQualityDeferred,
    P1: stats.P1,
    P2: stats.P2,
    P3InFinal: stats.P3InFinal,
    P4InFinal: stats.P4InFinal,
    maxDistractorFrequency: stats.maxDistractorFrequency,
    pass: stats.pass
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
