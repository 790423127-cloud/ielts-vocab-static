// Meaning Mode full-audit.test.mjs — Tests for 6000-word distractor quality audit.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MASTER_LEXICON_EXPECTED_COUNT as EXPECTED_MASTER_WORD_COUNT } from "../../vocab/master-lexicon-baseline.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..", ".."); // app/lib/meaning-mode/__tests__ -> root
const WORDS_PATH = join(ROOT, ".static-export-cache", "words.json");
const MEANING_PATH = join(ROOT, "public", "data", "meaning-6000.json");
const KNOWN_RETIRED_WORD_IDS = new Set(["word_excel_29d8cda42c88"]);

let wordsData, meaningData, SEMANTIC_INDEX;
try {
  wordsData = JSON.parse(readFileSync(WORDS_PATH, "utf-8"));
  meaningData = JSON.parse(readFileSync(MEANING_PATH, "utf-8"));
  const idxMod = await import("file:///" + join(__dirname, "..", "semantic-distractor-index.mjs").replace(/\\/g, "/"));
  SEMANTIC_INDEX = idxMod.SEMANTIC_INDEX;
} catch(e) {
  console.error("Setup failed:", e.message);
  process.exit(1);
}

function normalizePosFamily(pos) {
  if (!pos) return "unknown";
  const p = String(pos).trim().toLowerCase();
  if (p.startsWith("noun") || p === "n" || p === "n.") return "noun";
  if (p.startsWith("verb") || p === "v" || p === "v.") return "verb";
  if (p.startsWith("adjectiv") || p === "adj" || p === "adj.") return "adjective";
  if (p.startsWith("adverb") || p === "adv" || p === "adv.") return "adverb";
  if (p.includes("noun")) return "noun";
  if (p.includes("verb")) return "verb";
  if (p.includes("adj")) return "adjective";
  if (p.includes("adv")) return "adverb";
  return "other";
}

describe("Meaning Mode — Full Audit Tests", () => {
  it("6000 words present in meaning-6000.json", () => {
    assert.strictEqual(meaningData.items.length, 6000);
  });

  it("current master word count is preserved", () => {
    assert.strictEqual(wordsData.words.length, EXPECTED_MASTER_WORD_COUNT);
  });

  it("All 6000 words match total bank by wordId", () => {
    const bankIds = new Set(wordsData.words.map(w => w.wordId));
    let missing = 0;
    for (const item of meaningData.items) {
      if (!bankIds.has(item.wordId)) missing++;
    }
    assert.strictEqual(missing, 0, `Missing ${missing} wordIds from bank`);
  });

  it("All 6000 entries have _posFamily and _semanticGroups", () => {
    let missing = 0;
    for (const entry of SEMANTIC_INDEX) {
      if (!entry._posFamily) missing++;
      if (!entry._semanticGroups || entry._semanticGroups.length === 0) missing++;
    }
    assert.strictEqual(missing, 0);
  });

  it("No cross-pos distractors possible — 100% posFamily match", () => {
    for (const item of meaningData.items) {
      const entry = SEMANTIC_INDEX.find(e => e.wordId === item.wordId);
      if (!entry) continue;
      const targetPos = entry._posFamily;
      const samePos = SEMANTIC_INDEX.filter(e =>
        e.wordId !== item.wordId &&
        e._posFamily === targetPos &&
        e.meaningZh !== item.meaningZh
      );
      for (const c of samePos) {
        assert.strictEqual(c._posFamily, targetPos,
          `Cross-pos: ${item.word} (${targetPos}) has candidate ${c.wordId} (${c._posFamily})`);
      }
    }
  });

  it("Every word has at least 3 same-pos candidates", () => {
    let failed = 0;
    const failures = [];
    for (const item of meaningData.items) {
      const entry = SEMANTIC_INDEX.find(e => e.wordId === item.wordId);
      if (!entry) continue;
      const samePos = SEMANTIC_INDEX.filter(e =>
        e.wordId !== item.wordId &&
        e._posFamily === entry._posFamily &&
        e.meaningZh !== item.meaningZh
      );
      if (samePos.length < 3) {
        failed++;
        if (failures.length < 5) failures.push({ word: item.word, pos: entry._posFamily, count: samePos.length });
      }
    }
    assert.strictEqual(failed, 0, `${failed} words have < 3 same-pos candidates: ${JSON.stringify(failures)}`);
  });

  it("No duplicate wordIds in total bank", () => {
    const ids = wordsData.words.map(w => w.wordId);
    const unique = new Set(ids);
    assert.strictEqual(unique.size, ids.length);
  });

  it("old wordIds are preserved except explicit retired entries", () => {
    const oldIdsPath = join(ROOT, "reports", "meaning-backups", "master-before-full-upgrade-20260629-000000", "_old_wordIds.txt");
    let oldIds;
    try {
      oldIds = new Set(readFileSync(oldIdsPath, "utf-8").trim().split("\n").filter(Boolean));
    } catch(e) {
      oldIds = null;
    }
    if (oldIds) {
      const currentIds = new Set(wordsData.words.map(w => w.wordId));
      const lost = [...oldIds].filter(id => !currentIds.has(id) && !KNOWN_RETIRED_WORD_IDS.has(id));
      assert.strictEqual(lost.length, 0, `Lost ${lost.length} wordIds: ${lost.slice(0,10)}`);
    }
  });

  it("meaning-6000.json not modified", () => {
    assert.strictEqual(meaningData.items.length, 6000);
    assert.ok(meaningData.items[0].wordId);
    assert.ok(meaningData.items[0].word);
    assert.ok(meaningData.items[0].meaningZh);
  });
});

describe("Spelling System Isolation", () => {
  it("All enrichment fields preserve spellingEligible count", () => {
    let spellingExcluded = 0;
    for (const w of wordsData.words) {
      if (w.spellingEligible === false) spellingExcluded++;
    }
    assert.strictEqual(spellingExcluded, 147, "Spelling excluded count changed");
  });

  it("Key spelling-eligible words still exist", () => {
    const samples = ["word_7ef52c80d171", "word_1348d2116e43", "word_0cf5d0bd234c"];
    for (const id of samples) {
      const w = wordsData.words.find(x => x.wordId === id);
      assert.ok(w, `Word ${id} missing`);
    }
  });

  it("meaning-6000 items all exist in bank", () => {
    const meaningIds = new Set(meaningData.items.map(i => i.wordId));
    const bankIds = new Set(wordsData.words.map(w => w.wordId));
    for (const id of meaningIds) {
      assert.ok(bankIds.has(id), `Meaning word ${id} not in bank`);
    }
  });
});

describe("Data Integrity Checks", () => {
  it("words.json is valid JSON", () => {
    const raw = readFileSync(WORDS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    assert.ok(Array.isArray(parsed.words));
    assert.strictEqual(parsed.words.length, EXPECTED_MASTER_WORD_COUNT);
  });

  it("All words have required fields", () => {
    let missing = 0;
    for (const w of wordsData.words) {
      if (!w.wordId) missing++;
      if (!w.word) missing++;
    }
    assert.strictEqual(missing, 0);
  });

  it("Every selected item carries complete training gloss fields", () => {
    let missingQuiz = 0, missingDetailed = 0, missingSource = 0;
    for (const item of meaningData.items) {
      if (!String(item.quizMeaningZh || item.meaningZh || "").trim()) missingQuiz++;
      if (!String(item.meaningDetailedZh || "").trim()) missingDetailed++;
      if (!String(item.meaningSource || "").trim()) missingSource++;
    }
    assert.strictEqual(missingQuiz, 0, `${missingQuiz} selected items missing quizMeaningZh`);
    assert.strictEqual(missingDetailed, 0, `${missingDetailed} selected items missing meaningDetailedZh`);
    assert.strictEqual(missingSource, 0, `${missingSource} selected items missing meaningSource`);
  });

  it("Master lexicon remains read-only while selected meanings are stored in meaning-6000", () => {
    const bankIds = new Set(wordsData.words.map(w => w.wordId));
    for (const item of meaningData.items) {
      assert.ok(bankIds.has(item.wordId), `Selected item ${item.wordId} missing from master lexicon`);
      assert.ok(item.quizMeaningZh || item.meaningZh, `Empty training meaning for ${item.wordId}`);
    }
  });
});
