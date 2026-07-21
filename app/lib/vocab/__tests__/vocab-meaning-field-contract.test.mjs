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

    const detailedMeaning = String(entry.meaningDetailedZh || "").trim();
    const highConfidenceMeanings = (entry.meaningsZh || []).filter((sense) => sense?.confidence === "high" && String(sense?.gloss || "").trim());
    // V2 intentionally removes copied/template detail fields. A concise editorial detail is
    // accepted when present; otherwise the structured high-confidence senses are the detail.
    if (detailedMeaning) {
      assert.notEqual(detailedMeaning, String(entry.meaning || "").trim(), `${entry.word} detailed meaning`);
      assert.ok(detailedMeaning.length >= 18, `${entry.word} detailed meaning length`);
      assert.match(detailedMeaning, /[；，。]|subject to/i, `${entry.word} detailed meaning structure`);
    } else {
      assert.ok(highConfidenceMeanings.length >= 2, `${entry.word} structured detail fallback`);
    }

    assert.ok(entry.meaningsZh.length >= 2, `${entry.word} meaningsZh`);
    assert.ok(entry.quizSenses.length >= 2, `${entry.word} quizSenses`);
    const addedQuizSenses = entry.quizSenses.filter((sense) => sense.source === "semantic-quality-v1");
    assert.ok(addedQuizSenses.length >= 2, `${entry.word} semantic quiz senses`);
    assert.equal(addedQuizSenses.every((sense) => sense.confidence === "high"), true, `${entry.word} quiz confidence`);
  }
});
