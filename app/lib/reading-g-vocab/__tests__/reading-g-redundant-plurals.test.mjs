import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { normalizeReadingGKey } from "../normalize.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const vocab = JSON.parse(fs.readFileSync(
  path.join(root, "public/data/reading-g-vocab.json"),
  "utf8"
));
const byKey = new Map(vocab.items.map((entry) => [
  normalizeReadingGKey(entry.normalizedKey || entry.word),
  entry
]));

test("redundant imported plurals are forms of their singular cards and keep progress aliases", () => {
  const mappings = vocab.redundantPluralCompaction?.mappings || [];
  assert.equal(mappings.length, 41);

  for (const mapping of mappings) {
    const pluralKey = normalizeReadingGKey(mapping.plural);
    const headwordKey = normalizeReadingGKey(mapping.headword);
    const headword = byKey.get(headwordKey);
    assert.equal(byKey.has(pluralKey), false, `${mapping.plural} should not remain a standalone card`);
    assert.ok(headword, `missing headword ${mapping.headword}`);
    assert.equal(
      (headword.forms || []).some((form) => normalizeReadingGKey(form.word || form.form) === pluralKey),
      true,
      `${mapping.plural} should be listed under ${mapping.headword} forms`
    );
    assert.equal(
      (headword.mergedAliases || []).some((alias) => normalizeReadingGKey(alias.key || alias.word) === pluralKey),
      true,
      `${mapping.plural} should retain its historic progress alias`
    );
  }
});

test("rack owns racks while lexicalised plural nouns stay independent", () => {
  assert.equal(byKey.has("racks"), false);
  assert.equal(byKey.get("rack")?.forms?.some((form) => form.word === "racks"), true);

  for (const word of ["customs", "premises", "savings", "trousers", "hold-ups"]) {
    assert.ok(byKey.has(word), `${word} has its own meaning and must remain a standalone card`);
  }
});
