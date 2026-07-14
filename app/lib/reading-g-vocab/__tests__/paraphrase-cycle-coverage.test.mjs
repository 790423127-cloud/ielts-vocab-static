import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { simulateCoverageRounds, takeNextParaphraseSession } from "../paraphrase-cycle.mjs";

const groups = JSON.parse(
  fs.readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../public/data/reading-g-paraphrases.json"
    ),
    "utf8"
  )
).groups;

test("multi-round guided sessions eventually cover all 233", () => {
  const sim = simulateCoverageRounds(groups, 50, 10, () => 0.33);
  assert.equal(sim.poolSize, 233);
  assert.equal(sim.coversAll, true);
  assert.ok(sim.roundsRun <= 30); // ceil(233/10)=24 + slack
  assert.equal(sim.finalUnique, 233);
});

test("guided, quick and full all cover the first 233 cycle", () => {
  for (const size of [10, 20, 80]) {
    const sim = simulateCoverageRounds(groups, 40, size, () => 0.31);
    assert.equal(sim.coversAll, true);
    assert.equal(sim.finalUnique, 233);
    assert.equal(sim.roundsRun, Math.ceil(233 / size));
    assert.ok(sim.history.every((row) => row.normalRepeatCount === 0));
  }
});

test("unseen groups are preferred over pure re-shuffle of only first 80", () => {
  let cov = null;
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    const b = takeNextParaphraseSession(groups, {}, cov, {
      sessionMode: "guided",
      sessionSize: 10,
      rng: () => 0.2 + i * 0.01
    });
    cov = b.coverage;
    b.sessionIds.forEach((id) => seen.add(id));
  }
  // 8 rounds * 10 = 80 slots; should see well above 80 unique if rotating (or at least 70+)
  assert.ok(seen.size >= 70, "expected broad coverage, got " + seen.size);
});
