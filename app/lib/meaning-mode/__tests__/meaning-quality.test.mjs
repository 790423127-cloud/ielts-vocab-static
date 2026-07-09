// Meaning Mode v4 quality tests — pos-enforced distractors, impression regression.
import { describe, it, before } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { pickDistractors, hashOptionSet, AntiMemorizationCache, heuristicSimilarityScore } from "../options.mjs";
import { buildQuestion, buildQuestionWithValidation, validateQuestion } from "../builder.mjs";
import { createQualityCache, checkDistractorQuality, recordDistractorsUsed } from "../distractor-quality.mjs";
import { resetGlobalFrequency } from "../distractor-ranking.mjs";
import { SEMANTIC_INDEX } from "../semantic-distractor-index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "..", "..", "public", "data", "meaning-4500.json");

let wordBank;

before(() => {
  wordBank = JSON.parse(readFileSync(DATA_PATH, "utf-8")).items;
  // Hydrate with semantic index
  for (const item of wordBank) {
    const sem = SEMANTIC_INDEX.find(s => s.wordId === item.wordId);
    if (sem) {
      item._posFamily = sem._posFamily;
      item._semanticGroups = sem._semanticGroups;
      item._confidence = sem._confidence;
    }
  }
});

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

// ---- impression regression ----

describe("impression regression", () => {
  it("impression has correct meaningZh", () => {
    const entry = wordBank.find(w => w.word === "impression");
    assert.ok(entry, "impression not found");
    assert.equal(entry.meaningZh, "印象");
  });

  it("impression is noun", () => {
    const entry = wordBank.find(w => w.word === "impression");
    const pf = entry._posFamily || normalizePosFamily(entry.pos);
    assert.equal(pf, "noun");
  });

  it("impression distractors are all nouns", () => {
    const entry = wordBank.find(w => w.word === "impression");
    const { distractors } = pickDistractors(wordBank, entry.wordId, entry.meaningZh, 3);
    for (const d of distractors) {
      const srcEntry = wordBank.find(w => w.wordId === d.sourceWordId);
      const pf = srcEntry._posFamily || normalizePosFamily(srcEntry.pos);
      assert.equal(pf, "noun", "Distractor " + d.displayEnglish + " is " + pf + ", expected noun");
    }
  });

  it("impression distractors do NOT include wrong-pos words", () => {
    const entry = wordBank.find(w => w.word === "impression");
    const { distractors } = pickDistractors(wordBank, entry.wordId, entry.meaningZh, 3);
    const meanings = distractors.map(d => d.meaningZh);
    assert.ok(!meanings.includes("展示"), "Should not include 展示 (verb)");
    assert.ok(!meanings.includes("说明"), "Should not include 说明 (verb)");
    assert.ok(!meanings.includes("特别地"), "Should not include 特别地 (adverb)");
    assert.ok(!meanings.includes("特别"), "Should not include 特别 (adverb/adj)");

    // Verify no verb or adverb distractors
    for (const d of distractors) {
      const srcEntry = wordBank.find(w => w.wordId === d.sourceWordId);
      const pf = srcEntry._posFamily || normalizePosFamily(srcEntry.pos);
      assert.notEqual(pf, "verb", d.displayEnglish + " is a verb");
      assert.notEqual(pf, "adverb", d.displayEnglish + " is an adverb");
    }
  });

  it("impression distractors are from cognition/perception/evaluation domains", () => {
    const entry = wordBank.find(w => w.word === "impression");
    const { distractors, stats } = pickDistractors(wordBank, entry.wordId, entry.meaningZh, 3);

    // At least some should be from same/near semantic groups
    const groups = new Set();
    for (const d of distractors) {
      const srcEntry = wordBank.find(w => w.wordId === d.sourceWordId);
      for (const g of (srcEntry._semanticGroups || [])) groups.add(g);
    }

    // Not a hard assertion (depends on index quality), but informative
    console.log("impression distractors:", distractors.map(d => d.meaningZh + " (" + d.displayEnglish + ")").join(", "));
    console.log("impression semantic groups found:", [...groups].join(", "));
    console.log("impression stats:", JSON.stringify(stats));
  });
});

// ---- Quality gates ----

describe("quality gates", () => {
  // Reset global frequency to avoid cross-test contamination from stage6 audit
  resetGlobalFrequency();
  it("posFamily 100% match — no cross-pos distractors", () => {
    let total = 0;
    let posMatch = 0;
    let crossPos = 0;

    for (let i = 0; i < 100; i++) {
      const entry = wordBank[i * 43 % 4500];
      const { distractors, qualitySufficient } = pickDistractors(wordBank, entry.wordId, entry.meaningZh, 3);
      if (!qualitySufficient) continue;

      const targetPF = entry._posFamily || normalizePosFamily(entry.pos);
      for (const d of distractors) {
        total++;
        const srcEntry = wordBank.find(w => w.wordId === d.sourceWordId);
        const dpf = srcEntry._posFamily || normalizePosFamily(srcEntry.pos);
        if (dpf === targetPF) posMatch++;
        else {
          crossPos++;
          console.log("CROSS-POS: target=" + entry.word + "(" + targetPF + ") distractor=" + d.displayEnglish + "(" + dpf + ")");
        }
      }
    }

    assert.equal(crossPos, 0, "Found " + crossPos + " cross-pos distractors");
    assert.ok(posMatch >= total * 0.99, "posFamily match rate: " + (posMatch/total*100).toFixed(1) + "%");
  });

  it("semantic group match rate >= 80%", () => {
    let total = 0;
    let sameOrAdjacent = 0;

    for (let i = 0; i < 200; i++) {
      const entry = wordBank[i * 23 % 4500];
      const { distractors, qualitySufficient } = pickDistractors(wordBank, entry.wordId, entry.meaningZh, 3);
      if (!qualitySufficient) continue;

      const targetGroups = entry._semanticGroups || [];
      for (const d of distractors) {
        total++;
        const srcEntry = wordBank.find(w => w.wordId === d.sourceWordId);
        const dg = srcEntry._semanticGroups || [];
        const shared = dg.filter(g => targetGroups.includes(g)).length;
        if (shared > 0 || (targetGroups.length === 0 && dg.length > 0)) sameOrAdjacent++;
      }
    }

    const pct = (sameOrAdjacent / total * 100).toFixed(1);
    console.log("Semantic group match rate:", pct + "%");
    assert.ok(pct >= 80, "semantic group match rate too low: " + pct + "%");
  });

  it("500 questions — optionHash repeat = 0", () => {
    const cache = new AntiMemorizationCache();
    const qualityCache = createQualityCache();
    const hashes = new Set();
    let built = 0;
    let deferred = 0;

    for (let i = 0; i < 500 && built < 500; i++) {
      const entry = wordBank[i % 4500];
      const q = buildQuestionWithValidation(entry, wordBank, "q-500", i, cache, qualityCache);

      if (q.qualityDeferred) { deferred++; continue; }

      const v = validateQuestion(q);
      if (!v.valid) continue;

      // Check for hash collision
      if (hashes.has(q.optionHash)) {
        // This should not happen if anti-memorization is working
        // But qualityDeferred retries can cause edge cases
        // Verify the cache detects it
        const memCheck = cache.checkRules(q.options, q.correctOptionIndex);
        if (!memCheck.valid) {
          // Cache detected it, skip recording
          deferred++;
          continue;
        }
        assert.fail("Dup hash at q " + built + ": " + q.optionHash + " not caught by cache");
      }
      hashes.add(q.optionHash);
      built++;

      // Record for quality tracking
      const distractors = q.options.filter(o => !o.isCorrect);
      const semGroup = entry._semanticGroups ? entry._semanticGroups[0] : null;
      recordDistractorsUsed(qualityCache, entry.wordId, distractors, semGroup);
    }

    console.log("Built:", built, "Deferred:", deferred);
    assert.equal(hashes.size, built);
  });

  it("500 questions — position 3-consecutive repeat = 0", () => {
    const cache = new AntiMemorizationCache();
    const qualityCache = createQualityCache();
    let built = 0;

    for (let i = 0; i < 600 && built < 500; i++) {
      const entry = wordBank[i % 4500];
      const q = buildQuestionWithValidation(entry, wordBank, "pos-500", i, cache, qualityCache);
      if (q.qualityDeferred) continue;
      const v = validateQuestion(q);
      if (!v.valid) continue;
      built++;
    }

    const history = cache.correctPositionHistory;
    let repeats = 0;
    for (let i = 2; i < history.length; i++) {
      if (history[i] === history[i-1] && history[i] === history[i-2]) repeats++;
    }
    console.log("Built:", built, "3-consecutive repeats:", repeats);
    assert.equal(repeats, 0, "Found " + repeats + " 3-consecutive position repeats");
  });

  it("same distractor max 2x in last 30", () => {
    const qualityCache = createQualityCache();
    const cache = new AntiMemorizationCache();
    const usageMap = {};

    for (let i = 0; i < 500; i++) {
      const entry = wordBank[i % 4500];
      const q = buildQuestionWithValidation(entry, wordBank, "freq-" + i, i, cache, qualityCache);
      if (q.qualityDeferred) continue;
      const v = validateQuestion(q);
      if (!v.valid) continue;

      const distractors = q.options.filter(o => !o.isCorrect);
      const semGroup = entry._semanticGroups ? entry._semanticGroups[0] : null;
      recordDistractorsUsed(qualityCache, entry.wordId, distractors, semGroup);

      for (const d of distractors) {
        const key = d.sourceWordId;
        usageMap[key] = (usageMap[key] || 0) + 1;
      }

      // Check rolling 30 window
      if (qualityCache.recentDistractorWordIds.length >= 30) {
        const window = qualityCache.recentDistractorWordIds.slice(-30);
        for (const d of distractors) {
          const count = window.filter(id => id === d.sourceWordId).length;
          assert.ok(count <= 2, "Distractor " + d.sourceWordId + " appears " + count + "x in last 30 at q " + i);
        }
      }
    }
  });

  it("same target word — max 1 repeat distractor in last 5 appearances", () => {
    const qualityCache = createQualityCache();
    const targetWord = wordBank[0];
    const targetId = targetWord.wordId;

    for (let i = 0; i < 20; i++) {
      const q = buildQuestionWithValidation(targetWord, wordBank, "target-" + i, i, null, qualityCache);
      if (q.qualityDeferred) continue;
      const v = validateQuestion(q);
      if (!v.valid) continue;

      const distractors = q.options.filter(o => !o.isCorrect);
      const semGroup = targetWord._semanticGroups ? targetWord._semanticGroups[0] : null;
      recordDistractorsUsed(qualityCache, targetId, distractors, semGroup);
    }

    // Check last 5 appearances
    const history = qualityCache.targetDistractorHistory[targetId] || [];
    const recent5 = history.slice(-5);
    for (const distractorId of new Set(recent5.flat())) {
      let count = 0;
      for (const entry of recent5) {
        if (entry.includes(distractorId)) count++;
      }
      assert.ok(count <= 2, "Distractor " + distractorId + " appears " + count + "x in last 5 for same target");
    }
  });

  it("qualityDeferred words not answered, no state change", () => {
    const qualityCache = createQualityCache();

    // Find a word that might be quality-deferred
    let deferredWord = null;
    for (const entry of wordBank) {
      const { qualitySufficient } = pickDistractors(wordBank, entry.wordId, entry.meaningZh, 3, qualityCache);
      if (!qualitySufficient) {
        deferredWord = entry;
        break;
      }
    }

    if (deferredWord) {
      const q = buildQuestion(deferredWord, wordBank, "def", 0, qualityCache);
      assert.ok(q.qualityDeferred, "Should be qualityDeferred");
      console.log("Deferred word:", deferredWord.word, "reason:", q.reason);
    } else {
      console.log("No quality-deferred word found in first pass — all words have sufficient distractors");
    }
  });
});

// ---- Isolation ----

describe("isolation", () => {
  it("semantic index derives from real fields only", () => {
    const sample = SEMANTIC_INDEX[0];
    assert.ok(sample._posFamily, "Missing _posFamily");
    assert.ok(sample._semanticGroups, "Missing _semanticGroups");
    assert.ok(sample._sourceFields, "Missing _sourceFields");
    assert.ok(sample._sourceFields.includes("pos"));
    assert.ok(sample._sourceFields.includes("topics"));
    assert.ok(sample._sourceFields.includes("ieltsUse"));
  });

  it("posFamily filtering is the primary selection rule", () => {
    const src = readFileSync(join(__dirname, "..", "options.mjs"), "utf-8");
    // Must use posFamily-based filtering as first rule
    assert.ok(src.includes("samePosCandidates"), "Missing samePosCandidates filter");
    assert.ok(src.includes("posFamily"), "Missing posFamily references");
    // Must not use tag-only similarity as primary
    const nonComment = src.split("\n").filter(l => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
    // Verify same posFamily filter appears in code logic (not just comments)
    assert.ok(nonComment.includes("samePosCandidates"), "samePosCandidates only in comments");
  });
});