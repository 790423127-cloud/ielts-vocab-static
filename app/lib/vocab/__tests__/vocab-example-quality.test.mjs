import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditSemanticVocabulary } from "../../../../scripts/lib/vocab-semantic-quality-v1.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const payload = JSON.parse(fs.readFileSync(path.join(ROOT, ".static-export-cache", "words.json"), "utf8"));
const byWord = new Map(payload.words.map((entry) => [entry.word, entry]));

test("official examples have no deterministic P0 content defects", () => {
  const audit = auditSemanticVocabulary(payload);
  const p0 = audit.issues.filter((issue) => issue.priority === "P0");
  assert.deepEqual(p0, []);
  assert.equal(payload.words.some((entry) => /\s+[,.!?;:](?:\s|$)/.test(entry.example || "")), false);
});

test("known example and translation conflicts are repaired", () => {
  assert.equal(byWord.get("payload").exampleCn.includes("10吨"), true);
  assert.match(byWord.get("janitor").exampleCn, /打扫办公室/u);
  assert.match(byWord.get("hotline").example, /\bhotline\b/i);
  assert.match(byWord.get("prestige").example, /\bprestige\b/i);
  assert.equal(byWord.get("arrears").exampleCn, "如果连续三个月不交房租，你将拖欠租金并面临被驱逐的风险。");
});
