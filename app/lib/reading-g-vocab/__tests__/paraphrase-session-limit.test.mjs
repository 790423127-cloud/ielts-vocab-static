import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  PARA_SESSION_SIZE,
  takeNextParaphraseSession
} from "../paraphrase-cycle.mjs";

const groups = JSON.parse(
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../public/data/reading-g-paraphrases.json"),
    "utf8"
  )
).groups;

test("session sizes: guided 10, quick 20, full 80 — all from 233 pool", () => {
  assert.equal(PARA_SESSION_SIZE.guided, 10);
  assert.equal(PARA_SESSION_SIZE.quick, 20);
  assert.equal(PARA_SESSION_SIZE.full, 80);

  for (const [mode, size] of Object.entries(PARA_SESSION_SIZE)) {
    const batch = takeNextParaphraseSession(groups, {}, null, {
      sessionMode: mode,
      sessionSize: size,
      rng: () => 0.42
    });
    assert.equal(batch.poolSize, 233);
    assert.ok(batch.questions.length <= size);
    assert.ok(batch.questions.length > 0);
    assert.ok(batch.sessionIds.length <= size);
  }
});
