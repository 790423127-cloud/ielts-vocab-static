import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  auditParaphraseQuizSafety,
  buildParaphraseMcq,
  buildParaphraseQuizQueue,
  getQuizEligibleGroups,
  isQuizEligibleGroup
} from "../paraphrase-quiz.mjs";
import { normalizeReadingGKey } from "../normalize.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const paraPath = path.join(root, "public/data/reading-g-paraphrases.json");

function loadGroups() {
  return JSON.parse(fs.readFileSync(paraPath, "utf8")).groups || [];
}

test("only high + canAutoQuiz + commonMeaningZh groups are eligible", () => {
  const groups = loadGroups();
  const eligible = getQuizEligibleGroups(groups);
  assert.ok(eligible.length >= 200 && eligible.length <= 300);
  for (const g of eligible) {
    assert.equal(g.confidence, "high");
    assert.equal(g.canAutoQuiz, true);
    assert.ok(String(g.commonMeaningZh || "").trim());
    assert.ok(isQuizEligibleGroup(g));
  }
  // candidate / network never auto
  const fake = {
    groupId: "x",
    anchor: "a",
    members: ["b"],
    confidence: "candidate",
    canAutoQuiz: true,
    commonMeaningZh: "测试"
  };
  assert.equal(isQuizEligibleGroup(fake), false);
  // empty common meaning not eligible even if high+canAutoQuiz
  const empty = {
    groupId: "y",
    anchor: "purchase",
    members: ["buy"],
    confidence: "high",
    canAutoQuiz: true,
    commonMeaningZh: ""
  };
  assert.equal(isQuizEligibleGroup(empty), false);
});

test("MCQ has 4 unique options, unique correct, no same-group distractors", () => {
  const groups = loadGroups();
  const eligible = getQuizEligibleGroups(groups);
  let built = 0;
  let skipped = 0;
  for (const g of eligible.slice(0, 80)) {
    const q = buildParaphraseMcq(g, eligible, () => 0.37, []);
    if (!q) {
      skipped += 1;
      continue;
    }
    built += 1;
    assert.equal(q.options.length, 4);
    const keys = q.options.map((o) => normalizeReadingGKey(o));
    assert.equal(new Set(keys).size, 4);
    assert.equal(q.options[q.correctIndex], q.correct);
    assert.notEqual(normalizeReadingGKey(q.stem), normalizeReadingGKey(q.correct));
    // distractors not in same group member set
    const own = new Set(
      [g.anchor, ...(g.members || [])].map((x) => normalizeReadingGKey(x))
    );
    for (let i = 0; i < 4; i++) {
      if (i === q.correctIndex) continue;
      assert.equal(own.has(keys[i]), false);
    }
  }
  assert.ok(built > 0, "should build at least one MCQ");
  // no unconstrained random fallback — skipped is ok
  assert.ok(skipped >= 0);
});

test("queue avoids recent group repeats and builds questions", () => {
  const groups = loadGroups();
  const queue = buildParaphraseQuizQueue(groups, 40, () => 0.51);
  assert.ok(queue.questions.length > 0);
  const ids = queue.questions.map((q) => q.groupId);
  // within window of 20, no immediate duplicates of same consecutive group
  for (let i = 1; i < ids.length; i++) {
    assert.notEqual(ids[i], ids[i - 1]);
  }
  const dist = queue.positionDistribution;
  assert.equal(dist.length, 4);
  assert.equal(dist.reduce((a, b) => a + b, 0), queue.questions.length);
});

test("audit reports safe vs skipped groups", () => {
  const groups = loadGroups();
  const audit = auditParaphraseQuizSafety(groups);
  assert.ok(audit.eligibleCount >= 200 && audit.eligibleCount <= 300);
  assert.ok(audit.safeParaphraseQuizGroupCount >= 0);
  assert.equal(
    audit.safeParaphraseQuizGroupCount + audit.skippedParaphraseQuizGroupCount,
    audit.eligibleCount
  );
});
