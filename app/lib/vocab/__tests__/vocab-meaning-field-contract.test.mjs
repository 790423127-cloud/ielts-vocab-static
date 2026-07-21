import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("core meaning batch uses real English definitions and high-confidence structured senses", () => {
  const payload = JSON.parse(fs.readFileSync(path.join(ROOT, ".static-export-cache", "words.json"), "utf8"));
  const rows = fs.readFileSync(path.join(ROOT, "data", "vocab-semantic-quality", "batch-meaning-core.tsv"), "utf8").trim().split(/\r?\n/).slice(1);
  const ids = new Set(rows.map((line) => line.split("\t")[0]));
  const targets = payload.words.filter((entry) => ids.has(String(entry.id || entry.wordId || "")));
  assert.equal(targets.length, 19);
  for (const entry of targets) {
    assert.match(entry.definition, /[A-Za-z]{3}/, `${entry.word} definition`);
    assert.notEqual(entry.meaningDetailedZh.trim(), entry.meaning.trim(), `${entry.word} detailed meaning`);
    // Chinese can express several clearly separated senses concisely. Eighteen characters
    // still rejects copied glosses while accepting entries such as subject's four-sense summary.
    assert.ok(entry.meaningDetailedZh.length >= 18, `${entry.word} detailed meaning length`);
    assert.match(entry.meaningDetailedZh, /[；，。]|subject to/i, `${entry.word} detailed meaning structure`);
    assert.ok(entry.meaningsZh.length >= 2, `${entry.word} meaningsZh`);
    assert.ok(entry.quizSenses.length >= 2, `${entry.word} quizSenses`);
    const addedQuizSenses = entry.quizSenses.filter((sense) => sense.source === "semantic-quality-v1");
    assert.ok(addedQuizSenses.length >= 2, `${entry.word} semantic quiz senses`);
    assert.equal(addedQuizSenses.every((sense) => sense.confidence === "high"), true, `${entry.word} quiz confidence`);
  }
});
