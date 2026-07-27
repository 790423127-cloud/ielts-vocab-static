import { execFileSync } from "node:child_process";
import fs from "node:fs";

const current = JSON.parse(fs.readFileSync(".static-export-cache/words.json", "utf8"));
const previous = JSON.parse(execFileSync("git", ["show", "10b50240719562289dd4ee3176f2b1e67a17b647:.static-export-cache/words.json"], {
  encoding: "utf8",
  maxBuffer: 150 * 1024 * 1024
}));
const retirements = JSON.parse(fs.readFileSync("app/lib/vocab/master-lexicon-retirements.json", "utf8"));

const norm = (value) => String(value || "").trim().toLowerCase();
const words = current.words || [];
const previousWords = previous.words || [];
const currentMap = new Map(words.map((entry) => [norm(entry.word), entry]));
const previousMap = new Map(previousWords.map((entry) => [norm(entry.word), entry]));
const retired = new Set((retirements.entries || []).map((entry) => norm(entry.word)));
const endings = ["s", "ed", "ing", "er", "est", "en", "ind"];
const isSuffixCandidate = (entry) => endings.some((ending) => norm(entry.word).endsWith(ending));
const isReference = (entry) => entry?.entryType === "inflected-form" && entry?.studyMode === "reference";

const orphanReferences = words.filter((entry) => {
  if (!isReference(entry)) return false;
  const base = currentMap.get(norm(entry.baseWord || entry.redirectToWord));
  return !base || base.id !== entry.baseWordId || isReference(base);
});

const danglingForms = [];
for (const entry of words) {
  for (const form of entry.forms || []) {
    if (!currentMap.has(norm(form.word))) {
      danglingForms.push({ owner: entry.word, form });
    }
  }
}

const meaningZhMismatches = words
  .filter((entry) => Object.prototype.hasOwnProperty.call(entry, "meaningZh") && entry.meaningZh !== entry.meaning)
  .map((entry) => ({ word: entry.word, meaning: entry.meaning, meaningZh: entry.meaningZh }));

const removedSincePrevious = previousWords.filter((entry) => !currentMap.has(norm(entry.word)));
const unregisteredRemovedSuffixWords = removedSincePrevious
  .filter(isSuffixCandidate)
  .filter((entry) => !retired.has(norm(entry.word)))
  .map((entry) => ({ word: entry.word, id: entry.id, entryType: entry.entryType, studyMode: entry.studyMode, baseWord: entry.baseWord }));

const selected = ["carry", "carried", "accompany", "accompanies", "tenancy", "sublease", "redress", "ombudsman", "handover", "worksheet", "cotenant", "finisher", "mediator", "mistreat"];
const entries = Object.fromEntries(selected.map((word) => [word, {
  current: currentMap.get(word) || null,
  previous: previousMap.get(word) || null,
  retired: retired.has(word)
}]));

const report = {
  topLevelKeys: Object.keys(current),
  count: words.length,
  previousCount: previousWords.length,
  morphologyAudit: current.morphologyAudit || null,
  referenceCount: words.filter(isReference).length,
  brushableCount: words.filter((entry) => !isReference(entry)).length,
  storedFormLinks: words.reduce((sum, entry) => sum + (entry.forms || []).length, 0),
  suffixCandidateCount: words.filter(isSuffixCandidate).length,
  retiredSuffixCandidateCount: (retirements.entries || []).filter(isSuffixCandidate).length,
  orphanReferences,
  danglingForms,
  meaningZhMismatches,
  removedSincePreviousCount: removedSincePrevious.length,
  unregisteredRemovedSuffixWords,
  entries
};

fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync("reports/ci-lexicon-diagnosis.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  count: report.count,
  orphanReferences: orphanReferences.length,
  danglingForms: danglingForms.length,
  meaningZhMismatches: meaningZhMismatches.length,
  suffixCandidateCount: report.suffixCandidateCount,
  retiredSuffixCandidateCount: report.retiredSuffixCandidateCount,
  unregisteredRemovedSuffixWords: unregisteredRemovedSuffixWords.length
}, null, 2));
