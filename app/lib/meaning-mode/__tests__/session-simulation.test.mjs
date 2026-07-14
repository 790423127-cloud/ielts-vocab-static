// session-simulation.test.mjs — 1000-question session simulation for Meaning Mode.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..", ".."); // __tests__ -> meaning-mode -> lib -> app -> root

const wordsData = JSON.parse(readFileSync(join(ROOT, ".static-export-cache", "words.json"), "utf-8"));
const meaningData = JSON.parse(readFileSync(join(ROOT, "public", "data", "meaning-6000.json"), "utf-8"));
const idxMod = await import("file:///" + join(__dirname, "..", "semantic-distractor-index.mjs").replace(/\\/g, "/"));
const SEMANTIC_INDEX = idxMod.SEMANTIC_INDEX;

const indexMap = new Map();
for (const entry of SEMANTIC_INDEX) indexMap.set(entry.wordId, entry);

const wordBank = [];
for (const w of wordsData.words) {
  const idx = indexMap.get(w.wordId);
  wordBank.push({
    wordId: w.wordId, word: w.word,
    meaningZh: (w.meaning || "").trim(), pos: w.pos,
    _posFamily: idx ? idx._posFamily : "unknown",
    _semanticGroups: idx ? idx._semanticGroups : ["general"],
    _confidence: idx ? idx._confidence : "low"
  });
}

const bankById = new Map();
for (const wb of wordBank) bankById.set(wb.wordId, wb);

const builderMod = await import("file:///" + join(__dirname, "..", "builder.mjs").replace(/\\/g, "/"));
const optionsMod = await import("file:///" + join(__dirname, "..", "options.mjs").replace(/\\/g, "/"));
const { buildQuestionWithValidation, validateQuestion } = builderMod;
const { AntiMemorizationCache } = optionsMod;

describe("Meaning Mode — 1000-Question Session Simulation", () => {
  const cache = new AntiMemorizationCache();
  const questions = [];
  const sessionId = "test-session-" + Date.now();
  const questionCount = Math.min(1000, meaningData.items.length);

  for (let i = 0; i < questionCount; i++) {
    const item = meaningData.items[i % meaningData.items.length];
    const wordEntry = bankById.get(item.wordId);
    if (!wordEntry) continue;
    const q = buildQuestionWithValidation(wordEntry, wordBank, sessionId, i, cache, null, 3);
    if (q && !q.qualityDeferred) questions.push(q);
  }

  it(`Generated at least 950 questions (got ${questions.length})`, () => {
    assert.ok(questions.length >= 950);
  });

  it("Always exactly 4 options", () => {
    for (const q of questions) {
      assert.strictEqual(q.options.length, 4, `${q.word}: ${q.options.length}`);
    }
  });

  it("No duplicate meanings in any question", () => {
    for (const q of questions) {
      const meanings = q.options.map(o => (o.meaningZh || "").trim());
      assert.strictEqual(new Set(meanings).size, 4, `${q.word}: dup meanings`);
    }
  });

  it("Correct answer always present", () => {
    for (const q of questions) {
      const meanings = q.options.map(o => o.meaningZh);
      assert.ok(meanings.includes(q.correctAnswer), `${q.word}: missing answer`);
    }
  });

  it("All distractors traceable (have sourceWordId)", () => {
    for (const q of questions) {
      for (const o of q.options) {
        if (!o.isCorrect) assert.ok(o.sourceWordId);
      }
    }
  });

  it("No optionHash collisions in last 30 questions", () => {
    for (let i = 0; i < questions.length; i++) {
      const current = questions[i].optionHash;
      const window = questions.slice(Math.max(0, i - 29), i);
      const collision = window.find(q => q.optionHash === current);
      if (collision) {
        assert.fail(`Hash collision at Q${i}: ${questions[i].word}`);
      }
    }
    assert.ok(true);
  });

  it("Correct position never 3-in-a-row", () => {
    const positions = questions.map(q => q.correctOptionIndex);
    for (let i = 2; i < positions.length; i++) {
      if (positions[i] === positions[i-1] && positions[i] === positions[i-2]) {
        assert.fail(`3-repeat position at ${i}: ${positions[i]}`);
      }
    }
    assert.ok(true);
  });

  it("Correct position roughly uniform (15-35% each)", () => {
    const counts = [0,0,0,0];
    for (const q of questions) counts[q.correctOptionIndex]++;
    for (let i = 0; i < 4; i++) {
      const pct = counts[i] / questions.length * 100;
      assert.ok(pct >= 15 && pct <= 35, `Pos ${i}: ${pct.toFixed(1)}%`);
    }
  });

  it("All distractors are same posFamily", () => {
    for (const q of questions) {
      const tEntry = bankById.get(q.wordId);
      const tPos = tEntry ? tEntry._posFamily : "unknown";
      for (const o of q.options) {
        if (o.isCorrect) continue;
        const dEntry = bankById.get(o.sourceWordId);
        const dPos = dEntry ? dEntry._posFamily : "unknown";
        assert.strictEqual(dPos, tPos, `${q.word}(${tPos}) distractor ${o.sourceWordId}(${dPos})`);
      }
    }
  });

  it("No direct synonym collision", () => {
    for (const q of questions) {
      const correctNorm = (q.correctAnswer || "").trim().toLowerCase();
      for (const o of q.options) {
        if (o.isCorrect) continue;
        const dNorm = (o.meaningZh || "").trim().toLowerCase();
        assert.notStrictEqual(dNorm, correctNorm);
      }
    }
  });
});
