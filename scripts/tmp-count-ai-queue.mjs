import fs from "node:fs";
import {
  isReadingGAiCompletionCandidate
} from "../app/lib/reading-g-vocab/ai-completion.mjs";
import {
  getReadingGCompleteness,
  getReadingGContentIssues
} from "../app/lib/reading-g-vocab/content-completeness.mjs";
import { needsMeaningCoverageReview } from "../app/lib/vocab/meaning-coverage-audit.mjs";

const g = JSON.parse(fs.readFileSync("public/data/reading-g-vocab.json", "utf8"));
const cands = g.items.filter(isReadingGAiCompletionCandidate);
const fail = {
  meaning: 0, phonetic: 0, example: 0, forms: 0, wordFamily: 0, synonyms: 0,
  collocations: 0, phraseCollocations: 0, posIssue: 0, meaningCoverage: 0
};
const onlyReviewedFlags = [];
const needTeaching = [];
for (const entry of cands) {
  const fields = getReadingGCompleteness(entry).fields;
  const issues = getReadingGContentIssues(entry);
  const reasons = [];
  if (!fields.meaning) { fail.meaning += 1; reasons.push("meaning"); }
  if (!fields.phonetic) { fail.phonetic += 1; reasons.push("phonetic"); }
  if (!fields.example) { fail.example += 1; reasons.push("example"); }
  if (!fields.forms) { fail.forms += 1; reasons.push("forms"); }
  if (!fields.wordFamily) { fail.wordFamily += 1; reasons.push("wordFamily"); }
  if (!fields.synonyms) { fail.synonyms += 1; reasons.push("synonyms"); }
  const colo = Array.isArray(entry.collocations) && entry.collocations.length || entry.collocationsReviewed === true;
  const pcolo = Array.isArray(entry.phraseCollocations) && entry.phraseCollocations.length || entry.phraseCollocationsReviewed === true;
  if (!colo) { fail.collocations += 1; reasons.push("collocations"); }
  if (!pcolo) { fail.phraseCollocations += 1; reasons.push("phraseCollocations"); }
  if (issues.includes("pos") || issues.includes("multiPosNeedsSplit")) { fail.posIssue += 1; reasons.push("pos"); }
  if (needsMeaningCoverageReview(entry)) { fail.meaningCoverage += 1; reasons.push("coverage"); }
  const teaching = reasons.some((r) => ["meaning", "phonetic", "example", "pos", "coverage"].includes(r));
  if (!teaching) onlyReviewedFlags.push(entry.word);
  else needTeaching.push({ word: entry.word, reasons });
}
console.log("candidates", cands.length);
console.log("fail", fail);
console.log("only reviewed flags", onlyReviewedFlags.length);
console.log("need teaching", needTeaching.length);
console.log("need teaching sample", needTeaching.slice(0, 15));
console.log("reason combos top");
const combos = {};
for (const row of needTeaching) {
  const k = row.reasons.sort().join("+");
  combos[k] = (combos[k] || 0) + 1;
}
console.log(Object.entries(combos).sort((a, b) => b[1] - a[1]).slice(0, 20));
