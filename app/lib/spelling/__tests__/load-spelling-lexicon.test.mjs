import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadSpellingLexicon } from "../load-spelling-lexicon.node.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("loadSpellingLexicon reads authoritative headwords and phrase layer from project files", async () => {
  const lexicon = await loadSpellingLexicon({ root });

  assert.ok(lexicon.counts.headwords >= 9900, `expected >= 9900 headwords, got ${lexicon.counts.headwords}`);
  assert.ok(lexicon.counts.phrases >= 1200, `expected >= 1200 phrases, got ${lexicon.counts.phrases}`);
  assert.equal(lexicon.counts.total, lexicon.counts.headwords + lexicon.counts.phrases);
  assert.ok(lexicon.lexiconVersion);
  assert.ok(lexicon.lexiconHash);
  assert.equal(lexicon.allEntries.length, lexicon.counts.total);
});