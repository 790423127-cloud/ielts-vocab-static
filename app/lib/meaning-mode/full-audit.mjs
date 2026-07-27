// full-audit.mjs — Full 6000-word distractor quality audit for Meaning Mode.
// Classifies each word: A / B / C / trueSemanticDeferred
// Outputs: reports/meaning-full-distractor-audit-after.json and .md
//
// Usage: node app/lib/meaning-mode/full-audit.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");

const WORDS_PATH = join(ROOT, ".static-export-cache", "words.json");
const MEANING_PATH = join(ROOT, "public", "data", "meaning-6000.json");
const INDEX_PATH = join(__dirname, "semantic-distractor-index.mjs");

// Load data
const wordsData = JSON.parse(readFileSync(WORDS_PATH, "utf-8"));
const meaningData = JSON.parse(readFileSync(MEANING_PATH, "utf-8"));
const indexModule = await import("file:///" + INDEX_PATH.replace(/\\/g, "/"));
const SEMANTIC_INDEX = indexModule.SEMANTIC_INDEX;

// Build word bank
const byWordId = new Map();
for (const w of wordsData.words) {
  if (w.wordId) byWordId.set(w.wordId, w);
}

function normalizePosFamily(pos) {
  if (!pos) return "unknown";
  const p = String(pos).trim().toLowerCase();
  if (p.startsWith("noun") || p === "n" || p === "n.") return "noun";
  if (p.startsWith("verb") || p === "v" || p === "v." || p === "modal") return "verb";
  if (p.startsWith("adjectiv") || p === "adj" || p === "adj.") return "adjective";
  if (p.startsWith("adverb") || p === "adv" || p === "adv.") return "adverb";
  if (p.includes("noun")) return "noun";
  if (p.includes("verb")) return "verb";
  if (p.includes("adj")) return "adjective";
  if (p.includes("adv")) return "adverb";
  return "other";
}

// Build word bank with semantic metadata from index
const indexMap = new Map();
for (const entry of SEMANTIC_INDEX) {
  indexMap.set(entry.wordId, entry);
}

const wordBank = [];
for (const w of wordsData.words) {
  const idx = indexMap.get(w.wordId);
  wordBank.push({
    wordId: w.wordId,
    word: w.word,
    meaningZh: (w.meaning || "").trim(),
    pos: w.pos,
    _posFamily: idx ? idx._posFamily : normalizePosFamily(w.pos),
    _semanticGroups: idx ? idx._semanticGroups : ["general"],
    _confidence: idx ? idx._confidence : "low",
    entry: w
  });
}

// ======== AUDIT LOGIC ========

const results = [];
const stats = {
  total: 0,
  gradeA: 0, gradeB: 0, gradeC: 0, trueDeferred: 0,
  posFamilyBreakdown: {},
  domainBreakdown: {},
  deferredWords: []
};

for (const item of meaningData.items) {
  const targetEntry = wordBank.find(wb => wb.wordId === item.wordId);
  if (!targetEntry) continue;

  const targetPos = targetEntry._posFamily;
  const targetGroups = targetEntry._semanticGroups;
  const targetMeaning = targetEntry.meaningZh;

  // Find all same-pos candidates
  const samePosCandidates = wordBank.filter(wb => {
    if (wb.wordId === item.wordId) return false;
    if (!(wb.meaningZh || "").trim()) return false;
    return wb._posFamily === targetPos;
  });

  // Categorize candidates by semantic proximity
  const sameGroup = [];     // shares >= 1 semanticGroups
  const adjacentGroup = []; // different but non-empty groups
  const samePosOnly = [];   // no group overlap

  for (const c of samePosCandidates) {
    const shared = c._semanticGroups.filter(g => targetGroups.includes(g)).length;
    const m = c.meaningZh;
    if (m === targetMeaning) continue; // skip exact meaning match
    if (shared > 0) {
      sameGroup.push(c);
    } else if (c._semanticGroups.length > 0) {
      adjacentGroup.push(c);
    } else {
      samePosOnly.push(c);
    }
  }

  // Determine grade
  let grade = "trueSemanticDeferred";
  let gradeReason = "";

  const A_candidates = sameGroup.filter(c => c._confidence === "high" || c._confidence === "medium");
  const B_candidates = [...A_candidates, ...sameGroup.filter(c => c._confidence === "low"), ...adjacentGroup.filter(c => c._confidence !== "low")];
  const C_candidates = [...B_candidates, ...adjacentGroup, ...samePosOnly.filter(c => c._confidence !== "low")];

  if (A_candidates.length >= 3) {
    grade = "A";
    gradeReason = `${A_candidates.length} high/medium same-group candidates available`;
  } else if (B_candidates.length >= 3) {
    grade = "B";
    gradeReason = `${B_candidates.length} same/adjacent group candidates, ${A_candidates.length} A-tier`;
  } else if (C_candidates.length >= 3) {
    grade = "C";
    gradeReason = `${C_candidates.length} total same-pos candidates, ${B_candidates.length} B-tier or better`;
  } else {
    gradeReason = `Only ${C_candidates.length} same-pos candidates total (need 3+)`;
  }

  // Count combinations
  const totalCombos = Math.min(
    sameGroup.length >= 3 ? 10 : 0 +
    (sameGroup.length + adjacentGroup.length >= 3 ? 5 : 0) +
    (C_candidates.length >= 3 ? 3 : 0),
    10
  );

  const auditEntry = {
    wordId: item.wordId,
    word: item.word,
    meaningZh: targetMeaning,
    posFamily: targetPos,
    semanticGroups: targetGroups,
    grade,
    gradeReason,
    sameGroupCount: sameGroup.length,
    adjacentGroupCount: adjacentGroup.length,
    samePosOnlyCount: samePosOnly.length,
    totalSamePosCount: samePosCandidates.length,
    estimatedCombinations: totalCombos,
    topDistractors: sameGroup.slice(0, 5).map(c => ({
      wordId: c.wordId,
      word: c.word,
      meaningZh: c.meaningZh,
      sharedGroups: c._semanticGroups.filter(g => targetGroups.includes(g))
    }))
  };

  results.push(auditEntry);
  stats.total++;

  if (grade === "A") stats.gradeA++;
  else if (grade === "B") stats.gradeB++;
  else if (grade === "C") stats.gradeC++;
  else {
    stats.trueDeferred++;
    stats.deferredWords.push({ wordId: item.wordId, word: item.word, meaningZh: targetMeaning, posFamily: targetPos, samePosCount: samePosCandidates.length });
  }

  // Track breakdown
  stats.posFamilyBreakdown[targetPos] = stats.posFamilyBreakdown[targetPos] || { A:0,B:0,C:0,Deferred:0,total:0 };
  stats.posFamilyBreakdown[targetPos][grade]++;
  stats.posFamilyBreakdown[targetPos].total++;

  for (const g of targetGroups) {
    stats.domainBreakdown[g] = stats.domainBreakdown[g] || { A:0,B:0,C:0,Deferred:0,total:0 };
    stats.domainBreakdown[g][grade]++;
    stats.domainBreakdown[g].total++;
  }
}

// Write JSON report
const reportDir = join(ROOT, "reports");
mkdirSync(reportDir, { recursive: true });

const jsonReport = {
  generatedAt: new Date().toISOString(),
  totalWords: stats.total,
  summary: {
    A: stats.gradeA,
    B: stats.gradeB,
    C: stats.gradeC,
    trueSemanticDeferred: stats.trueDeferred,
    A_percent: (stats.gradeA / stats.total * 100).toFixed(1) + "%",
    B_percent: (stats.gradeB / stats.total * 100).toFixed(1) + "%",
    C_percent: (stats.gradeC / stats.total * 100).toFixed(1) + "%",
    deferred_percent: (stats.trueDeferred / stats.total * 100).toFixed(1) + "%"
  },
  posFamilyBreakdown: stats.posFamilyBreakdown,
  domainBreakdown: stats.domainBreakdown,
  deferredWords: stats.deferredWords,
  results
};

writeFileSync(join(reportDir, "meaning-full-distractor-audit-after.json"), JSON.stringify(jsonReport, null, 2), "utf-8");
console.log("JSON report written.");

// Write MD report
const md = [
  "# Meaning Mode — Full 6000-Word Distractor Quality Audit",
  "",
  "**Generated:** " + new Date().toISOString(),
  "",
  "## Summary",
  "| Grade | Count | % |",
  "|-------|-------|---|",
  "| A (3+ high-quality same-group distractors) | " + stats.gradeA + " | " + (stats.gradeA / stats.total * 100).toFixed(1) + "% |",
  "| B (3+ same/adjacent-group distractors) | " + stats.gradeB + " | " + (stats.gradeB / stats.total * 100).toFixed(1) + "% |",
  "| C (3+ same-pos distractors, limited semantic) | " + stats.gradeC + " | " + (stats.gradeC / stats.total * 100).toFixed(1) + "% |",
  "| **trueSemanticDeferred** (cannot find 3) | " + stats.trueDeferred + " | " + (stats.trueDeferred / stats.total * 100).toFixed(1) + "% |",
  "| **Total** | " + stats.total + " | 100% |",
  "",
  "## POS Family Breakdown",
  "| Family | A | B | C | Deferred | Total |",
  "|--------|---|---|---|----------|-------|",
  ...Object.entries(stats.posFamilyBreakdown).sort((a,b) => b[1].total - a[1].total).map(([k,v]) =>
    "| " + k + " | " + v.A + " | " + v.B + " | " + v.C + " | " + v.Deferred + " | " + v.total + " |"
  ),
  "",
  "## Domain Breakdown (top 20)",
  "| Domain | A | B | C | Deferred | Total |",
  "|--------|---|---|---|----------|-------|",
  ...Object.entries(stats.domainBreakdown).sort((a,b) => b[1].total - a[1].total).slice(0,20).map(([k,v]) =>
    "| " + k + " | " + v.A + " | " + v.B + " | " + v.C + " | " + v.Deferred + " | " + v.total + " |"
  ),
  "",
  "## Deferred Words (Need Web Supplementation)",
  ...(stats.deferredWords.length > 0 ? [
    "| Word | Meaning | POS | Same-Pos Count |",
    "|------|---------|-----|----------------|",
    ...stats.deferredWords.map(d => "| " + d.word + " | " + d.meaningZh + " | " + d.posFamily + " | " + d.samePosCount + " |")
  ] : ["*None — all words have sufficient distractors!*"]),
  "",
  "## Source Files",
  "- words.json: " + wordsData.words.length + " words",
  "- meaning-6000.json: " + meaningData.items.length + " items",
  "- semantic-distractor-index.mjs: " + SEMANTIC_INDEX.length + " entries",
  ""
].join("\n");

writeFileSync(join(reportDir, "meaning-full-distractor-audit-after.md"), md, "utf-8");
console.log("MD report written.");

// Summary output
console.log("");
console.log("=== AUDIT COMPLETE ===");
console.log("A: " + stats.gradeA + " (" + (stats.gradeA / stats.total * 100).toFixed(1) + "%)");
console.log("B: " + stats.gradeB + " (" + (stats.gradeB / stats.total * 100).toFixed(1) + "%)");
console.log("C: " + stats.gradeC + " (" + (stats.gradeC / stats.total * 100).toFixed(1) + "%)");
console.log("Deferred: " + stats.trueDeferred + " (" + (stats.trueDeferred / stats.total * 100).toFixed(1) + "%)");
console.log("Total: " + stats.total);
