import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("import outputs three files with consistent counts", () => {
  const vocab = JSON.parse(fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"), "utf8"));
  const para = JSON.parse(fs.readFileSync(path.join(root, "public/data/reading-g-paraphrases.json"), "utf8"));
  const report = JSON.parse(
    fs.readFileSync(path.join(root, "public/data/reading-g-import-report.json"), "utf8")
  );
  assert.equal(vocab.datasetVersion || vocab.version, "reading-g-core-v3");
  assert.equal(vocab.items.length, vocab.count);
  assert.equal(vocab.wordCount + vocab.phraseCount, vocab.items.length);
  assert.equal(para.groups.length, 300);
  assert.equal(report.summary.emptyWord, 0);
  assert.equal(report.summary.emptyMeaning, 0);
  assert.ok(report.summary.itemCount > 0);
});

test("stable ids are unique", () => {
  const vocab = JSON.parse(fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"), "utf8"));
  const ids = new Set(vocab.items.map((i) => i.id));
  assert.equal(ids.size, vocab.items.length);
});
