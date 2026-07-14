import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { markParaphraseGroupSeen, takeNextParaphraseSession } from "../paraphrase-cycle.mjs";
import { getQuizEligibleGroups } from "../paraphrase-quiz.mjs";

const groups = JSON.parse(
  fs.readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../public/data/reading-g-paraphrases.json"
    ),
    "utf8"
  )
).groups;

test("refresh resumes cycle — coverage index advances and is restorable", () => {
  const b1 = takeNextParaphraseSession(groups, {}, null, {
    sessionMode: "guided",
    sessionSize: 10,
    rng: () => 0.5
  });
  assert.ok(b1.coverage.currentCycleOrder.length === 233);
  assert.ok(b1.coverage.currentCycleIndex > 0);
  assert.equal(b1.coverage.seenGroupIds.length, 0, "allocation is not completion");
  const eligibleIds = getQuizEligibleGroups(groups).map((group) => group.groupId);
  let saved = b1.coverage;
  for (const id of b1.sessionIds) saved = markParaphraseGroupSeen(saved, id, eligibleIds);
  assert.equal(saved.seenGroupIds.length, b1.sessionIds.length);

  // simulate refresh: pass saved coverage back
  const b2 = takeNextParaphraseSession(groups, {}, saved, {
    sessionMode: "guided",
    sessionSize: 10,
    rng: () => 0.5
  });
  // second batch should not be identical set as first when cycle advances
  const s1 = new Set(b1.sessionIds);
  const overlap = b2.sessionIds.filter((id) => s1.has(id)).length;
  assert.ok(overlap < 10, "expected cycle to move past first batch");
  assert.equal(b2.coverage.seenGroupIds.length, saved.seenGroupIds.length);
});
