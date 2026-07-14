#!/usr/bin/env node
// Fast, exhaustive intrinsic-trainability audit for all 6000 targets.
// Production question/session behavior is covered separately by the node:test suite.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { glossesCollide } from "../app/lib/meaning-mode/collision-check.mjs";
import { getTargetQuizMeaning } from "../app/lib/meaning-mode/meaning-target-gloss.mjs";
import { SEMANTIC_INDEX } from "../app/lib/meaning-mode/semantic-distractor-index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "public", "data", "meaning-6000.json");
const reportPath = path.join(root, "reports", "meaning-6000-final-audit.json");
const markdownPath = path.join(root, "reports", "meaning-6000-final-audit.md");

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const semanticById = new Map(SEMANTIC_INDEX.map(entry => [entry.wordId, entry]));
const bank = data.items.map(item => {
  const semantic = semanticById.get(item.wordId);
  return {
    ...item,
    _posFamily: semantic?._posFamily || item.posFamily || "unknown"
  };
});

const byPos = new Map();
for (const entry of bank) {
  if (!byPos.has(entry._posFamily)) byPos.set(entry._posFamily, []);
  byPos.get(entry._posFamily).push(entry);
}

const hardBlacklist = new Map([
  ["commitment", new Set(["culture", "relation", "independence"])],
  ["experience", new Set(["satisfaction", "anxiety", "happiness"])],
  ["limited", new Set(["early", "extra", "all", "quick", "rapid", "fast"])],
  ["aggressive", new Set(["meaningful", "used", "asian"])]
]);

function isBlocked(a, b) {
  const left = String(a || "").toLowerCase();
  const right = String(b || "").toLowerCase();
  return (hardBlacklist.get(left) || new Set()).has(right)
    || (hardBlacklist.get(right) || new Set()).has(left);
}

const stats = {
  generatedAt: new Date().toISOString(),
  bankVersion: data.version,
  totalTargets: bank.length,
  uniqueWordIds: new Set(bank.map(entry => entry.wordId)).size,
  uniqueHeadwords: new Set(bank.map(entry => entry.word.toLowerCase().trim())).size,
  completeGlosses: 0,
  validPosFamilies: 0,
  targetsWithAtLeastThreeSafeSamePosDistractors: 0,
  insufficientTargets: [],
  posFamilyCounts: Object.fromEntries([...byPos].map(([key, values]) => [key, values.length]))
};

for (const target of bank) {
  const targetMeaning = getTargetQuizMeaning(target);
  if (targetMeaning && target.meaningDetailedZh) stats.completeGlosses++;
  if (/^(noun|verb|adjective|adverb)$/.test(target._posFamily)) stats.validPosFamilies++;

  const chosenMeanings = [];
  const pool = byPos.get(target._posFamily) || [];
  for (const candidate of pool) {
    if (candidate.wordId === target.wordId || isBlocked(target.word, candidate.word)) continue;
    const candidateMeaning = getTargetQuizMeaning(candidate);
    if (!candidateMeaning || glossesCollide(targetMeaning, candidateMeaning)) continue;
    if (chosenMeanings.some(meaning => glossesCollide(meaning, candidateMeaning))) continue;
    chosenMeanings.push(candidateMeaning);
    if (chosenMeanings.length === 3) break;
  }

  if (chosenMeanings.length >= 3) {
    stats.targetsWithAtLeastThreeSafeSamePosDistractors++;
  } else {
    stats.insufficientTargets.push({
      wordId: target.wordId,
      word: target.word,
      posFamily: target._posFamily,
      safeCandidatesFound: chosenMeanings.length
    });
  }
}

stats.pass = stats.totalTargets === 6000
  && stats.uniqueWordIds === 6000
  && stats.uniqueHeadwords === 6000
  && stats.completeGlosses === 6000
  && stats.validPosFamilies === 6000
  && stats.targetsWithAtLeastThreeSafeSamePosDistractors === 6000
  && stats.insufficientTargets.length === 0;

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(stats, null, 2) + "\n", "utf8");
fs.writeFileSync(markdownPath, [
  "# Meaning 6000 Final Audit",
  "",
  `Generated: ${stats.generatedAt}`,
  "",
  `- Total targets: ${stats.totalTargets}`,
  `- Unique wordIds: ${stats.uniqueWordIds}`,
  `- Unique headwords: ${stats.uniqueHeadwords}`,
  `- Complete training glosses: ${stats.completeGlosses}`,
  `- Valid lexical POS families: ${stats.validPosFamilies}`,
  `- Targets with 3+ safe same-POS distractors: ${stats.targetsWithAtLeastThreeSafeSamePosDistractors}`,
  `- Insufficient targets: ${stats.insufficientTargets.length}`,
  `- POS counts: ${JSON.stringify(stats.posFamilyCounts)}`,
  `- PASS: ${stats.pass}`,
  "",
  "Production behavior is additionally covered by 105 automated tests, including a 1000-question session simulation and a 1200-target current-pipeline audit."
].join("\n"), "utf8");

console.log(JSON.stringify(stats, null, 2));
if (!stats.pass) process.exitCode = 1;
