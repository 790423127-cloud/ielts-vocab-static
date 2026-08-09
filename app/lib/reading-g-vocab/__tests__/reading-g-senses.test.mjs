import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("multi-sense entries exist and keep multiple senses", () => {
  const vocab = JSON.parse(fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"), "utf8"));
  const multi = vocab.items.filter((i) => (i.senses || []).length > 1);
  assert.ok(multi.length > 0);
  for (const m of multi.slice(0, 20)) {
    const keys = new Set(m.senses.map((s) => `${s.pos}::${s.meaningZh}`));
    assert.ok(keys.size >= 1);
  }
});

test("multi-pos source rows do not keep a duplicate combined sense", () => {
  const vocab = JSON.parse(fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"), "utf8"));
  const combined = vocab.items.flatMap((item) =>
    (item.senses || [])
      .filter((sense) => /(?:^|[；;，,\s])(?:n|v|adj|adv)\.?\s+/i.test(sense.meaningZh || ""))
      .map((sense) => `${item.word}: ${sense.meaningZh}`)
  );
  assert.deepEqual(combined, []);
});

test("access keeps distinct noun and verb senses without a combined duplicate", () => {
  const vocab = JSON.parse(fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"), "utf8"));
  const access = vocab.items.find((item) => item.word === "access");
  assert.ok(access);
  assert.equal(access.senses.length, 3);
  assert.deepEqual(access.senses.map((sense) => sense.pos), ["noun", "noun", "verb"]);
});

test("same-part-of-speech senses do not repeat a contained meaning", () => {
  const vocab = JSON.parse(fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"), "utf8"));
  const tokens = (value) => String(value || "")
    .split(/[；;，,、/]+/)
    .map((token) => token.replace(/\s+/g, "").toLowerCase())
    .filter(Boolean);
  const duplicates = [];
  for (const item of vocab.items) {
    const senses = item.senses || [];
    for (let left = 0; left < senses.length; left += 1) {
      for (let right = left + 1; right < senses.length; right += 1) {
        if (senses[left].pos !== senses[right].pos) continue;
        const leftTokens = tokens(senses[left].meaningZh);
        const rightTokens = tokens(senses[right].meaningZh);
        const leftSet = new Set(leftTokens);
        const rightSet = new Set(rightTokens);
        if (leftTokens.every((token) => rightSet.has(token)) || rightTokens.every((token) => leftSet.has(token))) {
          duplicates.push(`${item.word}: ${senses[left].meaningZh} / ${senses[right].meaningZh}`);
        }
      }
    }
  }
  assert.deepEqual(duplicates, []);
});

test("flashcard appends supplemental senses to the primary meaning without a separate card", () => {
  const source = fs.readFileSync(path.join(root, "app/components/SatelliteLexiconFlashcard.jsx"), "utf8");
  assert.match(source, /const supplementalSenses = itemDisplay\.supplementalSenses/);
  assert.match(source, /<InlineStudyMeaning/);
  assert.match(source, /supplementalSenses=\{supplementalSenses\}/);
  assert.doesNotMatch(source, /补充义项|其他释义|showSupplementalSenses|熟词生义/);
});
