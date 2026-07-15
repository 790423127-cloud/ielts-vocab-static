import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applySemanticPatches } from "../../../../scripts/apply-vocab-semantic-quality-v1.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("semantic patch preserves user progress fields and synchronized payloads", () => {
  const report = applySemanticPatches({ batch: "all", apply: false });
  assert.equal(report.progressChanges, 0);
  assert.equal(report.idChanges, 0);
  const cache = fs.readFileSync(path.join(ROOT, ".static-export-cache", "words.json"), "utf8");
  const publicData = fs.readFileSync(path.join(ROOT, "public", "data", "words.json"), "utf8");
  assert.equal(cache, publicData);
  const payload = JSON.parse(cache);
  assert.equal(payload.count, payload.words.length);
  assert.equal(payload.words.some((entry) => entry.word === "neff"), false);
});
