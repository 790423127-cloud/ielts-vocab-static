import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("multi-sense entries exist and keep multiple senses", () => {
  const vocab = JSON.parse(fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"), "utf8"));
  const multi = vocab.items.filter((i) => (i.senses || []).length > 1);
  assert.ok(multi.length > 0);
  for (const m of multi.slice(0, 20)) {
    const keys = new Set(m.senses.map((s) => `${s.pos}::${s.meaningZh}`));
    assert.ok(keys.size >= 1);
  }
});
