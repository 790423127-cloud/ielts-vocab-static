import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditSemanticVocabulary, exampleTargetStatus } from "../../../../scripts/lib/vocab-semantic-quality-v1.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("semantic audit reports no P0 issue in the official lexicon", () => {
  const payload = JSON.parse(fs.readFileSync(path.join(ROOT, ".static-export-cache", "words.json"), "utf8"));
  const audit = auditSemanticVocabulary(payload);
  assert.equal(audit.summary.p0IssueCount, 0);
  assert.equal(audit.methodology.paidApiCalls, 0);
  assert.equal(audit.methodology.externalPerWordLookups, 0);
});

test("example target detection accepts required inflections and compound variants", () => {
  const cases = [
    ["accuse", "He was accused of fraud."], ["accessory", "The shop sells accessories."],
    ["fight", "They fought for fair treatment."], ["flee", "The family fled the fire."],
    ["meet", "We met at the station."], ["overtake", "The car overtook the bus."],
    ["spin", "The wheel spun quickly."], ["swear", "She swore to tell the truth."],
    ["weep", "He wept after the news."], ["win", "Our team won the match."],
    ["leaf", "The leaves fell in autumn."], ["wolf", "Wolves live in packs."],
    ["claimform", "Please complete the claim form."]
  ];
  for (const [word, example] of cases) {
    assert.equal(exampleTargetStatus({ word, example }).morphologyMatch, true, `${word} should match`);
  }
});
