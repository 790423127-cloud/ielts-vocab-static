import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getReadingGContentIssues } from "../content-completeness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const vocab = JSON.parse(fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"), "utf8"));

const deletedProperNames = [
  "atherton", "fenton", "sasha", "wessex", "hatcliff", "brene", "coffs", "ffyona",
  "helmsley", "locksley", "logitech", "marshbrook", "sloane", "darren's", "bramley",
  "hanugoldi", "microsoft", "tang", "percil", "ripton", "wychwood", "croyde",
  "lillee's", "maplehampton", "sture", "bingham", "buchanan", "caldy", "cambourne",
  "carey", "dingle", "palmer's", "sinclair", "skybag", "cameron", "grafton", "wollongbar"
];

const repairedWords = [
  ["aining", "training"], ["onlyfrom", "only from"], ["artlingly", "Artlingly"],
  ["nylso", "Nylso"], ["ifces", "office"], ["poppi", "Poppi"], ["imeet", "meet"],
  ["abusiness", "business"], ["appropriatefor", "appropriate for"], ["arevery", "very"],
  ["aselection", "selection"], ["atcertain", "certain"], ["beremoved", "remove"],
  ["co-operatewithin", "cooperate within"], ["firstterm", "first term"], ["fordelivery", "delivery"],
  ["gobridge", "Gobridge"], ["inacting", "enact"], ["intheir", "their"], ["onany", "any"],
  ["receivetransition", "transition"], ["smpentitlement", "SMP entitlement"], ["takingchildren", "child"],
  ["thanimmigrants", "immigrant"], ["thegiant", "giant"], ["thei", "they"], ["theirnew", "new"],
  ["travellingby", "travel by"], ["vement", "movement"], ["walkor", "walk"], ["climb-and", "climb"],
  ["j'guide", "guide"], ["yourself-your", "yourself"], ["weldown", "well"], ["mychoice", "choice"],
  ["paps", "map"]
];

test("G-reading removes only confirmed proper names and repairs all malformed pending tokens", () => {
  const visibleWords = new Set(vocab.items.map((entry) => entry.word));
  for (const word of deletedProperNames) assert.equal(visibleWords.has(word), false, `${word} must be removed`);

  for (const [raw, repaired] of repairedWords) {
    assert.equal(visibleWords.has(raw), false, `${raw} must not remain visible`);
    const entry = vocab.items.find((item) => item.word === repaired);
    assert.ok(entry, `${repaired} must be visible`);
    if ((entry.entryType || "word") === "word") {
      assert.deepEqual(getReadingGContentIssues(entry), [], `${repaired} must be complete`);
    }
  }
});
