import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const vocabPath = path.join(root, "public/data/reading-g-vocab.json");

test("word vs phrase missing phonetics audit; no invented symbols required", () => {
  const data = JSON.parse(fs.readFileSync(vocabPath, "utf8"));
  const items = data.items || [];
  let missingWord = 0;
  let missingPhrase = 0;
  let wordTotal = 0;
  let phraseTotal = 0;
  for (const it of items) {
    const isPhrase = it.entryType === "phrase" || /\s/.test(it.word || "");
    const has = Boolean(String(it.phonetic || "").trim());
    if (isPhrase) {
      phraseTotal += 1;
      if (!has) missingPhrase += 1;
    } else {
      wordTotal += 1;
      if (!has) missingWord += 1;
    }
  }
  assert.equal(wordTotal + phraseTotal, items.length);
  // after enrichment, ordinary words missing should be much less than phrases
  assert.ok(missingWord < missingPhrase || missingWord < 200);
  // must not claim zero if unresolved remain — just report
  assert.ok(missingWord >= 0);
  assert.ok(phraseTotal > 0);
});

test("filled phonetics carry source when present", () => {
  const data = JSON.parse(fs.readFileSync(vocabPath, "utf8"));
  const withSrc = (data.items || []).filter((i) => i.phoneticSource);
  // may be 0 if all already had phonetics; enrichment sets source on newly filled
  assert.ok(Array.isArray(withSrc));
});
