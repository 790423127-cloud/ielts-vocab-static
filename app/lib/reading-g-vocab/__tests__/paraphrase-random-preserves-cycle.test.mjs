import test from "node:test";
import assert from "node:assert/strict";
import { shuffleRemainingParaphraseCycle } from "../paraphrase-cycle.mjs";

test("random preserves allocated prefix, index, cycle and seen ids", () => {
  const ids = ["a", "b", "c", "d", "e"];
  const before = { version: 1, seenGroupIds: ["a"], currentCycleOrder: ids, currentCycleIndex: 2, cycleNumber: 4, lastSessionGroupIds: ["a", "b"] };
  const after = shuffleRemainingParaphraseCycle(before, ids, () => 0);
  assert.deepEqual(after.currentCycleOrder.slice(0, 2), ["a", "b"]);
  assert.equal(after.currentCycleIndex, 2);
  assert.equal(after.cycleNumber, 4);
  assert.deepEqual(after.seenGroupIds, ["a"]);
});
