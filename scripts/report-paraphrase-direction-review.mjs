import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "public", "data", "reading-g-paraphrases.json");
const target = path.join(root, "reports", "paraphrase-direction-manual-review.json");
const data = JSON.parse(fs.readFileSync(source, "utf8"));
const safeGroups = data.groups.filter((group) =>
  group.confidence === "high" &&
  group.canAutoQuiz === true &&
  String(group.commonMeaningZh || "").trim()
);
const groups = safeGroups
  .filter((group) => !group.direction && !group.quizDirection && group.isBidirectional !== true)
  .map((group) => ({
    groupId: group.groupId,
    anchor: group.anchor,
    members: group.members,
    relationType: group.relationType,
    automaticQuizDirection: "anchorToMember",
    reverseUse: "activeRecallOnly",
    reviewReason: "No explicit direction metadata; do not infer bidirectional automatic mastery."
  }));

const report = {
  generatedAt: new Date().toISOString(),
  safePoolCount: safeGroups.length,
  explicitDirectionCount: safeGroups.length - groups.length,
  manualReviewCount: groups.length,
  currentSafetyPolicy: {
    automaticQuiz: "anchorToMember only unless a future explicit direction field permits otherwise",
    activeRecall: "both faces may be shown, but reverse recall does not establish automatic bidirectional mastery",
    dataMutation: false
  },
  groups
};
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ target, safePoolCount: safeGroups.length, manualReviewCount: groups.length }, null, 2));
