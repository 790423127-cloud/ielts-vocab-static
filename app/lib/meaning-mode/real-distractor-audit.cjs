// real-distractor-audit.cjs — READ-ONLY audit of actual Meaning Mode distractor quality.
// Uses the REAL builder/distractor-ranking/options pipeline via dynamic import.
// Modifies NOTHING. Run with: node app/lib/meaning-mode/real-distractor-audit.cjs

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..", "..");
const REPORT_DIR = path.join(ROOT, "reports");
fs.mkdirSync(REPORT_DIR, { recursive: true });

async function main() {
  const wordsData = JSON.parse(fs.readFileSync(path.join(ROOT, ".static-export-cache", "words.json"), "utf-8"));
  const meaningData = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "data", "meaning-6000.json"), "utf-8"));
  const idxMod = await import("file:///" + path.join(__dirname, "semantic-distractor-index.mjs").replace(/\\/g, "/"));
  const SEMANTIC_INDEX = idxMod.SEMANTIC_INDEX;
  const rankingMod = await import("file:///" + path.join(__dirname, "distractor-ranking.mjs").replace(/\\/g, "/"));
  const { generateDistractorCombinations } = rankingMod;

  const indexMap = new Map();
  for (const entry of SEMANTIC_INDEX) indexMap.set(entry.wordId, entry);
  const allWordsMap = new Map();
  for (const w of wordsData.words) allWordsMap.set(w.wordId, w);

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

  // Build full distractor bank
  const distractorBank = [];
  for (const w of wordsData.words) {
    const idx = indexMap.get(w.wordId);
    distractorBank.push({
      wordId: w.wordId, word: w.word,
      meaningZh: (w.meaning || "").trim(), pos: w.pos,
      definition: (w.definition || "").trim(),
      _posFamily: idx ? idx._posFamily : normalizePosFamily(w.pos),
      _semanticGroups: idx ? idx._semanticGroups : ["general"],
      _confidence: idx ? idx._confidence : "low"
    });
  }
  const distractorById = new Map();
  for (const db of distractorBank) distractorById.set(db.wordId, db);

  const targetById = new Map();
  for (const item of meaningData.items) {
    const mw = allWordsMap.get(item.wordId);
    const idx = indexMap.get(item.wordId);
    if (!mw) continue;
    targetById.set(item.wordId, {
      wordId: item.wordId, word: item.word,
      meaningZh: (mw.meaning || "").trim(), pos: mw.pos,
      definition: (mw.definition || "").trim(),
      _posFamily: idx ? idx._posFamily : "unknown",
      _semanticGroups: idx ? idx._semanticGroups : ["general"],
      _confidence: idx ? idx._confidence : "low"
    });
  }

  // HONEST proximity classifier — based on ACTUAL meaning overlap, not domain tags
  function classifyProximity(correctMeaning, correctDefinition, correctGroups,
                              distractorMeaning, distractorDefinition, distractorGroups) {
    const cm = (correctMeaning || "").trim().toLowerCase().replace(/[；;，,\s\/]/g, "");
    const dm = (distractorMeaning || "").trim().toLowerCase().replace(/[；;，,\s\/]/g, "");
    const cd = (correctDefinition || "").trim().toLowerCase();
    const dd = (distractorDefinition || "").trim().toLowerCase();

    // Chinese character 2-gram overlap
    let charOverlap = 0;
    if (cm.length >= 2 && dm.length >= 2) {
      for (let i = 0; i <= cm.length - 2; i++) {
        if (dm.includes(cm.substring(i, i + 2))) charOverlap++;
      }
    }

    // Definition keyword overlap (English)
    const cdWords = new Set(cd.split(/[\s,;.]+/).filter(w => w.length > 2));
    const ddWords = new Set(dd.split(/[\s,;.]+/).filter(w => w.length > 2));
    const defOverlap = [...cdWords].filter(w => ddWords.has(w)).length;

    const sharedGroups = correctGroups.filter(g => distractorGroups.includes(g)).length;

    // STRICT: actual meaning overlap required
    if (charOverlap >= 4 || defOverlap >= 3) return "very-close";    // genuine lexical/definitional overlap
    if (charOverlap >= 2 || defOverlap >= 2) return "same-domain";   // mild connection
    if (sharedGroups >= 1 && (charOverlap >= 1 || defOverlap >= 1)) return "adjacent-domain";
    if (sharedGroups >= 2) return "same-broad-domain-only";          // same broad tag, no real overlap
    return "distant";
  }

  // Chinese synonym pairs
  const CN_SYNONYM_PAIRS = [
    ["观点","看法"],["观点","见解"],["看法","见解"],["解释","说明"],["解释","阐释"],
    ["影响","作用"],["影响","效果"],["作用","效果"],["态度","立场"],["态度","看法"],
    ["判断","评估"],["推测","猜测"],["推测","假设"],["猜测","假设"],["理解","领悟"],
    ["感受","感觉"],["情绪","情感"],["感情","情感"],["意见","建议"],["提议","建议"],
    ["方法","方式"],["方法","手段"],["策略","战术"],["目标","目的"],["意图","动机"],
    ["特征","特点"],["特征","特性"],["优点","长处"],["缺点","短处"],["好处","利益"],
    ["结果","后果"],["原因","理由"],["因素","原因"],["重要","关键"],["必须","必要"],
    ["困难","挑战"],["机会","机遇"],["发展","进步"],["改善","改进"],["变化","改变"],
  ];

  function areSynonyms(a, b) {
    const an = (a||"").trim().toLowerCase(); const bn = (b||"").trim().toLowerCase();
    for (const [x,y] of CN_SYNONYM_PAIRS) {
      if ((an.includes(x) && bn.includes(y)) || (an.includes(y) && bn.includes(x))) return true;
    }
    return false;
  }

  function meaningsTooClose(correctMeaning, distractorMeaning) {
    const cn = (correctMeaning||"").trim().toLowerCase().replace(/[；;，,\s\/]/g,"");
    const dn = (distractorMeaning||"").trim().toLowerCase().replace(/[；;，,\s\/]/g,"");
    if (cn === dn) return true;
    if (areSynonyms(cn, dn)) return true;
    // Shared 2-gram count >= 3 in short meanings
    let overlap = 0;
    if (cn.length >= 2 && dn.length >= 2) {
      for (let i = 0; i <= cn.length - 2; i++) {
        if (dn.includes(cn.substring(i, i+2))) overlap++;
      }
    }
    return overlap >= 3;
  }

  console.log("Auditing all " + meaningData.items.length + " words with honest proximity classifier...");

  const gradeCounts = { A:0, B:0, C:0, RISK:0, BAD:0 };
  const posGradeCounts = { noun:{A:0,B:0,C:0,RISK:0,BAD:0}, verb:{A:0,B:0,C:0,RISK:0,BAD:0}, adjective:{A:0,B:0,C:0,RISK:0,BAD:0}, adverb:{A:0,B:0,C:0,RISK:0,BAD:0}, other:{A:0,B:0,C:0,RISK:0,BAD:0} };
  const distractorFrequency = new Map();
  const domainIssues = {};
  const allResults = [];
  let processed = 0;

  for (const item of meaningData.items) {
    const targetEntry = targetById.get(item.wordId);
    if (!targetEntry) continue;

    const { combinations, totalAvailable } = generateDistractorCombinations(
      distractorBank, item.wordId, targetEntry.meaningZh, 5, null
    );

    if (!combinations || combinations.length === 0) {
      allResults.push({
        wordId: item.wordId, word: item.word, meaningZh: targetEntry.meaningZh,
        posFamily: targetEntry._posFamily, semanticGroups: targetEntry._semanticGroups,
        definition: targetEntry.definition,
        grade: "BAD", reason: "no-combinations", totalSamePos: totalAvailable,
        bestCombo: null
      });
      gradeCounts.BAD++;
      posGradeCounts[targetEntry._posFamily].BAD++;
      processed++;
      continue;
    }

    const comboAnalyses = [];
    let bestGrade = "A";

    for (let ci = 0; ci < Math.min(3, combinations.length); ci++) {
      const combo = combinations[ci];
      let hasDistant = false, hasTooClose = false, hasSynonymRisk = false, hasBroadOnly = false;
      const da = [];

      for (const d of combo.distractors) {
        const dEntry = distractorById.get(d.sourceWordId);
        const proximity = classifyProximity(
          targetEntry.meaningZh, targetEntry.definition, targetEntry._semanticGroups,
          d.meaningZh, dEntry ? dEntry.definition : "", d.semanticGroups
        );
        const tooClose = meaningsTooClose(targetEntry.meaningZh, d.meaningZh);
        const synonymRisk = areSynonyms(targetEntry.meaningZh, d.meaningZh);

        if (proximity === "distant" || proximity === "same-broad-domain-only") hasDistant = true;
        if (tooClose) hasTooClose = true;
        if (synonymRisk) hasSynonymRisk = true;

        const freq = (distractorFrequency.get(d.sourceWordId) || 0) + 1;
        distractorFrequency.set(d.sourceWordId, freq);

        da.push({ wordId: d.sourceWordId, word: d.displayEnglish, meaningZh: d.meaningZh,
          posFamily: d.posFamily, semanticGroups: d.semanticGroups,
          definition: dEntry ? dEntry.definition : "",
          proximity, tooClose, synonymRisk });
      }

      // Grade
      let grade;
      if (hasSynonymRisk) grade = "RISK";
      else if (hasTooClose) grade = "RISK";
      else if (hasDistant) {
        const closeCount = da.filter(d => d.proximity === "very-close" || d.proximity === "same-domain").length;
        if (closeCount >= 3) grade = "A";
        else if (closeCount >= 2) grade = "B";
        else if (closeCount >= 1) grade = "C";
        else grade = "C"; // all broad-tag-only = functionally distant
      } else {
        grade = "A";
      }

      if (ci === 0) bestGrade = grade;
      comboAnalyses.push({ comboIndex: ci, score: combo.score, strategy: combo.strategy, hash: combo.hash, grade, da });
    }

    gradeCounts[bestGrade]++;
    const pf = targetEntry._posFamily;
    if (posGradeCounts[pf]) posGradeCounts[pf][bestGrade]++;

    for (const g of targetEntry._semanticGroups) {
      if (!domainIssues[g]) domainIssues[g] = { total:0, RISK:0, BAD:0, C:0, distantOnly:0 };
      domainIssues[g].total++;
      if (bestGrade === "RISK") domainIssues[g].RISK++;
      if (bestGrade === "BAD") domainIssues[g].BAD++;
      if (bestGrade === "C") domainIssues[g].C++;
      if (comboAnalyses[0] && comboAnalyses[0].da.every(d => d.proximity === "distant" || d.proximity === "same-broad-domain-only"))
        domainIssues[g].distantOnly++;
    }

    allResults.push({
      wordId: item.wordId, word: item.word, meaningZh: targetEntry.meaningZh,
      posFamily: pf, semanticGroups: targetEntry._semanticGroups,
      definition: targetEntry.definition,
      totalSamePos: totalAvailable, combinationCount: combinations.length,
      grade: bestGrade, bestCombo: comboAnalyses[0]
    });

    processed++;
    if (processed % 1000 === 0) console.log("  Processed: " + processed);
  }

  console.log("Audit complete: " + processed + " words");
  console.log("A: " + gradeCounts.A + " (" + (gradeCounts.A/processed*100).toFixed(1) + "%)");
  console.log("B: " + gradeCounts.B + " (" + (gradeCounts.B/processed*100).toFixed(1) + "%)");
  console.log("C: " + gradeCounts.C + " (" + (gradeCounts.C/processed*100).toFixed(1) + "%)");
  console.log("RISK: " + gradeCounts.RISK + " (" + (gradeCounts.RISK/processed*100).toFixed(1) + "%)");
  console.log("BAD: " + gradeCounts.BAD + " (" + (gradeCounts.BAD/processed*100).toFixed(1) + "%)");

  // Top distractors
  const topDistractors = [...distractorFrequency.entries()]
    .sort((a,b) => b[1]-a[1]).slice(0,50)
    .map(([id,c]) => { const db = distractorById.get(id); return { wordId:id, word:db?db.word:"?", meaningZh:db?db.meaningZh:"?", posFamily:db?db._posFamily:"?", count:c }; });

  console.log("\nTop 10 overused distractors:");
  topDistractors.slice(0,10).forEach((d,i) => console.log("  " + (i+1) + ". " + d.word + " (" + d.meaningZh + ") — " + d.count + " uses (" + (d.count/processed*100).toFixed(1) + "%)"));

  // High-interest words
  const hiWords = ["impression","perspective","interpretation","attitude","assumption","approach","perception","consideration","evaluation","consequence"];
  const hiDetails = [];
  for (const word of hiWords) {
    const r = allResults.find(x => x.word === word);
    if (!r) continue;
    const combos = r.bestCombo ? [r.bestCombo] : [];
    hiDetails.push({
      word: r.word, meaningZh: r.meaningZh, posFamily: r.posFamily,
      semanticGroups: r.semanticGroups, definition: r.definition,
      grade: r.grade, totalSamePos: r.totalSamePos,
      bestCombo: r.bestCombo ? {
        score: r.bestCombo.score, strategy: r.bestCombo.strategy, grade: r.bestCombo.grade,
        distractors: r.bestCombo.da.map(d => ({
          word: d.word, meaningZh: d.meaningZh, proximity: d.proximity,
          tooClose: d.tooClose, synonymRisk: d.synonymRisk
        }))
      } : null
    });
  }

  // Root cause analysis
  const causes = { broadDomainOnly:0, insufficientCandidates:0, synonymRisk:0, trulyDistant:0 };
  for (const r of allResults) {
    if (r.grade === "C" || r.grade === "BAD") {
      if (r.totalSamePos < 5) causes.insufficientCandidates++;
      else if (r.bestCombo && r.bestCombo.da.every(d => d.proximity === "distant" || d.proximity === "same-broad-domain-only")) causes.broadDomainOnly++;
      else causes.trulyDistant++;
    }
    if (r.grade === "RISK") causes.synonymRisk++;
  }

  // Samples
  function pickSamples(results, total) {
    const byPos = {};
    for (const r of results) { const pf = r.posFamily; if (!byPos[pf]) byPos[pf] = []; byPos[pf].push(r); }
    const samples = [];
    const targets = { noun:90, verb:90, adjective:80, adverb:50 };
    for (const [pos, n] of Object.entries(targets)) {
      const pool = (byPos[pos]||[]).sort(() => Math.random()-0.5);
      for (let i=0; i<Math.min(n,pool.length); i++) {
        if (!samples.find(s => s.wordId === pool[i].wordId)) samples.push(pool[i]);
      }
    }
    const worst = [...results].sort((a,b) => {
      const o = { A:4,B:3,C:2,RISK:1,BAD:0 };
      return o[a.grade] - o[b.grade];
    });
    for (const w of worst) { if (samples.length >= total) break; if (!samples.find(s=>s.wordId===w.wordId)) samples.push(w); }
    for (const word of hiWords) { const r = results.find(x=>x.word===word); if (r && !samples.find(s=>s.wordId===r.wordId)) samples.push(r); }
    return samples.slice(0, total);
  }
  const samples = pickSamples(allResults, 320);

  // Write JSON
  const jsonReport = {
    generatedAt: new Date().toISOString(),
    totalWords: processed,
    gradeCounts, posGradeCounts, domainIssues,
    topDistractors, rootCauseAnalysis: causes,
    highInterestDetails: hiDetails, sampleCount: samples.length
  };
  fs.writeFileSync(path.join(REPORT_DIR, "meaning-real-distractor-audit.json"), JSON.stringify(jsonReport, null, 2), "utf-8");

  // Write MD
  const md = [
    "# Meaning Mode — Real Distractor Quality Audit (Honest)",
    "",
    "**Generated:** " + new Date().toISOString(),
    "**Total words:** " + processed,
    "",
    "## Grade Distribution",
    "| Grade | Count | % |",
    "|-------|-------|---|",
    "| A (natural, close but distinct) | " + gradeCounts.A + " | " + (gradeCounts.A/processed*100).toFixed(1) + "% |",
    "| B (mostly natural, 1 minor issue) | " + gradeCounts.B + " | " + (gradeCounts.B/processed*100).toFixed(1) + "% |",
    "| C (functional but semantically distant) | " + gradeCounts.C + " | " + (gradeCounts.C/processed*100).toFixed(1) + "% |",
    "| RISK (synonym/multi-answer risk) | " + gradeCounts.RISK + " | " + (gradeCounts.RISK/processed*100).toFixed(1) + "% |",
    "| BAD (no valid combinations) | " + gradeCounts.BAD + " | " + (gradeCounts.BAD/processed*100).toFixed(1) + "% |",
    "",
    "## By POS Family",
    "| POS | A | B | C | RISK | BAD |",
    "|-----|---|---|---|------|-----|",
    ...Object.entries(posGradeCounts).filter(([k]) => k !== "other" || posGradeCounts[k].total > 0).map(([k,v]) =>
      "| " + k + " | " + v.A + " | " + v.B + " | " + v.C + " | " + v.RISK + " | " + v.BAD + " |"),
    "",
    "## Root Cause Analysis",
    "- Broad domain only (no real meaning overlap): " + causes.broadDomainOnly + " words",
    "- Insufficient same-pos candidates: " + causes.insufficientCandidates + " words",
    "- Synonym/multi-answer risk: " + causes.synonymRisk + " words",
    "- Truly distant distractors: " + causes.trulyDistant + " words",
    "",
    "## CRITICAL: Top 20 Overused Distractors",
    "",
    "These words appear as distractors in a very high % of questions. Users will memorize them, defeating the purpose.",
    "",
    "| # | Word | Meaning | POS | Uses | % of Questions |",
    "|---|------|---------|-----|------|----------------|",
    ...topDistractors.slice(0,20).map((d,i) =>
      "| " + (i+1) + " | " + d.word + " | " + d.meaningZh + " | " + d.posFamily + " | " + d.count + " | " + (d.count/processed*100).toFixed(1) + "% |"),
    "",
    "## Domain Issues",
    "| Domain | Total | RISK | BAD | C | All-Distant % |",
    "|--------|-------|------|-----|---|---------------|",
    ...Object.entries(domainIssues).sort((a,b) => (b[1].RISK+b[1].BAD+b[1].C) - (a[1].RISK+a[1].BAD+a[1].C)).slice(0,12).map(([k,v]) =>
      "| " + k + " | " + v.total + " | " + v.RISK + " | " + v.BAD + " | " + v.C + " | " + (v.distantOnly/v.total*100).toFixed(1) + "% |"),
    "",
    "## High-Interest Word Audit",
    ...hiDetails.map(h => {
      let out = "### " + h.word + " (" + h.meaningZh + ") — Grade: " + h.grade + "\n\n";
      out += "- POS: " + h.posFamily + " | Groups: " + (h.semanticGroups||[]).join(", ") + "\n";
      out += "- Definition: " + (h.definition||"N/A") + " | Same-pos pool: " + h.totalSamePos + "\n\n";
      if (h.bestCombo) {
        out += "**Selected combination** (score: " + h.bestCombo.score + ", strategy: " + h.bestCombo.strategy + ")\n\n";
        out += "| Role | Word | Meaning | Proximity | Issues |\n";
        out += "|------|------|---------|-----------|--------|\n";
        out += "| CORRECT | **" + h.word + "** | **" + h.meaningZh + "** | — | — |\n";
        for (const d of h.bestCombo.distractors) {
          const issues = [];
          if (d.tooClose) issues.push("TOO CLOSE");
          if (d.synonymRisk) issues.push("SYNONYM");
          out += "| Distractor | " + d.word + " | " + d.meaningZh + " | " + d.proximity + " | " + (issues.length ? issues.join(",") : "ok") + " |\n";
        }
      }
      return out + "\n";
    }),
    "",
    "## Minimum Fix Recommendations (DO NOT IMPLEMENT NOW)",
    "",
    "1. **Subdivide broad domains**: education-academic (4,493 words) and communication-language (3,726 words) need 3-5 subdomains each.",
    "2. **Introduce distractor max-frequency cap**: No distractor should appear in more than 5% of questions.",
    "3. **Require actual meaning overlap**: Replace sharedGroups count with Chinese character n-gram overlap for proximity ranking.",
    "4. **Add definition-based filtering**: If two words share >= 3 keywords in their English definitions, treat as too-close.",
    "5. **Implement distractor freshness rotation**: Track per-distractor usage and rotate out overused ones.",
    "6. **Increase combination diversity**: Current strategies (top/spread/mid/tail) don't explore enough of the 8,000+ same-pos candidates.",
    "",
    "---",
    "Source code modified: 0 | words.json modified: 0 | meaning-6000.json modified: 0 | New words: 0",
    ""
  ].join("\n");
  fs.writeFileSync(path.join(REPORT_DIR, "meaning-real-distractor-audit.md"), md, "utf-8");

  // Risk list
  const riskItems = allResults.filter(r => r.grade === "RISK" || r.grade === "BAD");
  const riskMd = [
    "# Meaning Mode — RISK/BAD Words",
    "",
    "**Total RISK:** " + gradeCounts.RISK + " | **BAD:** " + gradeCounts.BAD,
    "",
    "| Word | POS | Meaning | Grade | Issue |",
    "|------|-----|---------|-------|-------|",
    ...riskItems.map(r => {
      const bc = r.bestCombo;
      let issue = r.reason || "";
      if (bc) {
        const iss = [];
        if (bc.da.some(d => d.synonymRisk)) iss.push("synonym risk");
        if (bc.da.some(d => d.tooClose)) iss.push("meanings too close");
        if (bc.da.every(d => d.proximity === "distant" || d.proximity === "same-broad-domain-only")) iss.push("all distant");
        issue = iss.join(", ");
      }
      return "| " + r.word + " | " + r.posFamily + " | " + r.meaningZh + " | " + r.grade + " | " + issue + " |";
    }),
    ""
  ].join("\n");
  fs.writeFileSync(path.join(REPORT_DIR, "meaning-real-distractor-risk-list.md"), riskMd, "utf-8");

  // Samples
  const sampleMd = [
    "# Meaning Mode — 300+ Real Question Samples (Honest Audit)",
    "",
    "**Generated:** " + new Date().toISOString(),
    "",
    ...samples.map((s, idx) => {
      let out = "---\n\n## " + (idx+1) + ". " + s.word + " — Grade: " + s.grade + "\n\n";
      out += "POS: " + s.posFamily + " | Meaning: " + s.meaningZh + " | Groups: " + (s.semanticGroups||[]).join(", ") + "\n\n";
      if (s.bestCombo) {
        out += "| Role | Word | Meaning | Proximity | Issues |\n";
        out += "|------|------|---------|-----------|--------|\n";
        out += "| CORRECT | **" + s.word + "** | **" + s.meaningZh + "** | — | — |\n";
        for (const d of s.bestCombo.da) {
          const is = []; if (d.tooClose) is.push("TOO CLOSE"); if (d.synonymRisk) is.push("SYNONYM");
          out += "| D" + " | " + d.word + " | " + d.meaningZh + " | " + d.proximity + " | " + (is.length?is.join(","):"ok") + " |\n";
        }
        out += "\n**Verdict:** ";
        if (s.grade === "A") out += "Good distractors.";
        else if (s.grade === "B") out += "Mostly OK, minor issue.";
        else if (s.grade === "C") out += "Distant distractors — same broad topic, different meaning.";
        else if (s.grade === "RISK") out += "Synonym/multi-answer risk!";
        else out += "No valid combination.";
      }
      return out;
    }),
    ""
  ].join("\n");
  fs.writeFileSync(path.join(REPORT_DIR, "meaning-real-distractor-samples.md"), sampleMd, "utf-8");

  console.log("\nReports written to reports/");
  console.log("ZERO source modifications. ZERO data modifications.");
}

main().catch(e => { console.error(e); process.exit(1); });
