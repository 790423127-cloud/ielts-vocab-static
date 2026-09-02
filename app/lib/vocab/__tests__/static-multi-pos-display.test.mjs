import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("static G-reading deduplicates supplemental senses by POS and meaning", () => {
  const source = fs.readFileSync(path.join(ROOT, "public/assets/reading-g.js"), "utf8");
  assert.match(source, /staticPosKey\(primaryPos\) \+ "::" \+ part/);
  assert.match(source, /identityKey = posKey \+ "::" \+ key/);
  assert.match(source, /declaredPos: String\(entry\.declaredPos \|\| entry\.declaredPartOfSpeech \|\| entry\.pos/);
  assert.match(source, /return declaredPos\.some\(function \(pos\) \{ return coveredPos\.indexOf\(pos\) < 0; \}\)/);
});

test("static reading notebook keeps the same Chinese gloss for a different POS", () => {
  const source = fs.readFileSync(path.join(ROOT, "public/assets/reading-words.js"), "utf8");
  assert.match(source, /`\$\{displayPosKey\(primaryPos\)\}::\$\{meaningKey\}`/);
  assert.match(source, /identityKey = `\$\{posKey\}::\$\{senseKey\}`/);
  assert.match(source, /const hasContextualMeaning = Boolean\(clean\(next\.readingMeaning\)/);
  assert.match(source, /\(!hasContextualMeaning \|\| !clean\(next\.pos\)\)/);
  assert.match(source, /hasContextualMeaning && \["otherMeanings", "senses", "meaningsZh"\]\.includes\(field\)/);
  assert.match(source, /\|\| needsMultiPosSenseRepair\(word\)/);
  assert.match(source, /needsContextSenseMigration/);
  assert.match(source, /STATIC_CONTEXT_SENSE_MIGRATION_KEY/);
});
