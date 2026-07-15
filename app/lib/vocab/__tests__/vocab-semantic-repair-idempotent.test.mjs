import test from "node:test";
import assert from "node:assert/strict";
import { applySemanticPatches } from "../../../../scripts/apply-vocab-semantic-quality-v1.mjs";

test("semantic patch is idempotent after the official batches are applied", () => {
  const first = applySemanticPatches({ batch: "all", apply: false });
  const second = applySemanticPatches({ batch: "all", apply: false });
  for (const report of [first, second]) {
    assert.equal(report.modified.length, 0);
    assert.equal(report.deleted.length, 0);
    assert.equal(report.addedForms.length, 0);
    assert.equal(report.addedMeanings.length, 0);
    assert.equal(report.addedQuizSenses.length, 0);
    assert.deepEqual(report.errors, []);
  }
});
