import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getQuizEligibleGroups } from "../paraphrase-quiz.mjs";
import { auditParaphraseQueuePipeline } from "../paraphrase-cycle.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const groups = JSON.parse(
  fs.readFileSync(path.join(root, "public/data/reading-g-paraphrases.json"), "utf8")
).groups;

test("safe auto-quiz pool is exactly 233; 67 stay out", () => {
  assert.equal(groups.length, 300);
  const eligible = getQuizEligibleGroups(groups);
  assert.equal(eligible.length, 233);
  const disabled = groups.filter((g) => g.canAutoQuiz === false);
  assert.equal(disabled.length, 67);
  const pipe = auditParaphraseQueuePipeline(groups);
  assert.equal(pipe.sessionPoolBeforeLimit, 233);
  assert.equal(pipe.historicalNextLimit, 80);
  assert.equal(pipe.historicalStaticLimit, 60);
  assert.equal(pipe.sessionPoolAfterLimit, 10); // default guided
});
