import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const DATA_DIR = path.join(ROOT, "data", "gt-complete");

function parseTsv(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/);
  const headers = lines.shift().split("\t");
  return lines.map((line) => {
    const cells = line.split("\t");
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

const actionFiles = fs.readdirSync(DATA_DIR)
  .filter((name) => /^second-review-.*\.tsv$/i.test(name))
  .sort();
const actions = actionFiles.flatMap((name) => parseTsv(path.join(DATA_DIR, name)));
const byWord = new Map(actions.map((action) => [action.word, action]));

test("second review covers the complete exported candidate queue", () => {
  assert.equal(actions.length, 226);
  assert.equal(actions.filter((action) => action.action === "delete").length, 122);
  assert.equal(actions.filter((action) => action.action === "repair").length, 104);
  assert.equal(new Set(actions.map((action) => action.word)).size, actions.length);
});

test("proper names, noise, inflections and ambiguous abbreviations are deleted", () => {
  for (const word of [
    "arkin", "chomsky", "microsoft", "ruamahanga", "rugg", "trueb", "ss",
    "behaviours", "boiled", "wars", "eighty-eight", "twenty-eighth", "attine", "escovopsis"
  ]) {
    assert.equal(byWord.get(word)?.action, "delete", `${word} should be deleted`);
  }
});

test("transferable vocabulary is retained and repaired", () => {
  for (const word of [
    "abolish", "belonging", "fuel", "involuntarily", "invoke", "oct", "practice",
    "stats", "vat", "waste", "yen"
  ]) {
    assert.equal(byWord.get(word)?.action, "repair", `${word} should be repaired`);
    const patch = JSON.parse(byWord.get(word).set);
    assert.ok(patch.example.split(/\s+/).length >= 4, `${word} needs a complete example`);
    assert.ok(patch.exampleCn, `${word} needs a Chinese example`);
  }
});

test("key semantic corrections are explicit", () => {
  assert.match(byWord.get("involuntarily").set, /不由自主地/);
  assert.match(byWord.get("vat").set, /增值税/);
  assert.match(byWord.get("waste").set, /noun\/verb\/adjective/);
  assert.match(byWord.get("belonging").set, /归属感/);
  assert.match(byWord.get("stats").set, /统计数据/);
});

test("review applier preserves stable IDs and user progress fields", () => {
  const source = fs.readFileSync(path.join(ROOT, "scripts", "apply-gt-second-semantic-review.mjs"), "utf8");
  assert.match(source, /USER_FIELDS/);
  assert.match(source, /status/);
  assert.match(source, /favorite/);
  assert.match(source, /entry\.id \|\| entry\.wordId/);
  assert.match(source, /duplicate stable ID/);
  assert.match(source, /cleanLinks/);
});

test("final semantic queue is recomputed from the final lexicon", () => {
  const source = fs.readFileSync(path.join(ROOT, "scripts", "export-gt-semantic-review-candidates.mjs"), "utf8");
  assert.match(source, /issuesFor\(entry\)/);
  assert.doesNotMatch(source, /PATCH_REPORT_PATH/);
});
