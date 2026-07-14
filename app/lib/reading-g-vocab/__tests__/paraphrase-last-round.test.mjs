import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getQuizEligibleGroups } from "../paraphrase-quiz.mjs";
import { takeNextParaphraseSession } from "../paraphrase-cycle.mjs";

const groups = JSON.parse(fs.readFileSync("public/data/reading-g-paraphrases.json", "utf8")).groups;

test("guided final round takes remaining 3 first then marks 7 as next-cycle", () => {
  const ids = getQuizEligibleGroups(groups).map((group) => group.groupId);
  const coverage = { version: 1, seenGroupIds: ids.slice(0, 230), currentCycleOrder: ids, currentCycleIndex: 230, cycleNumber: 1, lastSessionGroupIds: [] };
  const batch = takeNextParaphraseSession(groups, {}, coverage, { sessionMode: "guided", sessionSize: 10, includeReview: false, rng: () => 0.4 });
  assert.equal(batch.sessionIds.length, 10);
  assert.deepEqual(batch.sessionIds.slice(0, 3), ids.slice(230));
  assert.deepEqual(batch.sessionKinds.slice(0, 3), ["new", "new", "new"]);
  assert.ok(batch.sessionKinds.slice(3).every((kind) => kind === "nextCycle"));
  assert.equal(batch.cycleCompletions[0].sessionOffset, 3);
});
