import fs from "node:fs";
import { isReadingGContentIncomplete, getReadingGContentIssues } from "../app/lib/reading-g-vocab/content-completeness.mjs";
import { isReadingGAiCompletionCandidate } from "../app/lib/reading-g-vocab/ai-completion.mjs";

const g = JSON.parse(fs.readFileSync("public/data/reading-g-vocab.json", "utf8"));
const words = g.items.filter((i) => (i.entryType || "word") === "word");
const incomplete = words.filter(isReadingGContentIncomplete);
const aiCand = words.filter(isReadingGAiCompletionCandidate);
const pendingLayer = words.filter((i) => (i.layers || []).includes("questionBankPending") || i.primaryLayer === "questionBankPending");
console.log({
  items: g.items.length,
  words: words.length,
  incomplete: incomplete.length,
  aiCand: aiCand.length,
  pendingLayer: pendingLayer.length,
});
const issueCounts = {};
for (const item of incomplete) {
  for (const issue of getReadingGContentIssues(item)) {
    issueCounts[issue] = (issueCounts[issue] || 0) + 1;
  }
}
console.log("issues", issueCounts);
console.log("sample", incomplete.slice(0, 8).map((i) => ({
  word: i.word,
  issues: getReadingGContentIssues(i),
  meaning: (i.primaryMeaningZh || i.meaning || "").slice(0, 40),
  detail: (i.meaningDetailZh || "").slice(0, 60),
})));
