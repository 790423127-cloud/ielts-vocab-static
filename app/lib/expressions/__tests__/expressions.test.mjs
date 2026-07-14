// Expressions Mode tests — 4-choice quiz, anti-memorization, storage compat.
import { describe, it, before, beforeEach } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildExpressionSessionQueue,
  createEngine,
  EXPRESSIONS_SESSION_SIZE,
  nextQuestion,
  submitAnswer,
  getSessionStats
} from "../engine.mjs";
import { buildQuestion, buildQuestionWithValidation, validateQuestion } from "../builder.mjs";
import { pickDistractors, seededShuffle, hashOptionSet, AntiMemorizationCache, heuristicSimilarityScore } from "../options.mjs";
import { createSessionState, recordQuestion, wouldRepeatThreeConsecutive } from "../session-state.mjs";
import { MASTER_LEXICON_EXPECTED_COUNT } from "../../vocab/master-lexicon-baseline.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "..", "..", "public", "data", "speaking-writing-phrases-700.json");
const MEANING_PATH = join(__dirname, "..", "..", "..", "..", "public", "data", "meaning-4500.json");
const WORDS_PATH = join(__dirname, "..", "..", "..", "..", ".static-export-cache", "words.json");

let phraseBank;

before(() => {
  phraseBank = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
});

// ---- Data Integrity ----

describe("phrase bank", () => {
  it("has exactly 700 items", () => { assert.equal(phraseBank.items.length, 700); });
  it("every item has id, phrase, meaningZh", () => {
    for (const item of phraseBank.items) { assert.ok(item.id); assert.ok(item.phrase); assert.ok(item.meaningZh); }
  });
  it("no duplicate phrase ids", () => {
    const ids = phraseBank.items.map(i => i.id); assert.equal(new Set(ids).size, ids.length);
  });
  it("every item has example", () => {
    for (const item of phraseBank.items) { assert.ok(item.example, "Missing example for " + item.id); }
  });
  it("meaning-4500.json not modified", () => {
    const d = JSON.parse(readFileSync(MEANING_PATH, "utf-8")); assert.equal(d.items.length, 4500);
  });
  it("words.json not modified", () => {
    const d = JSON.parse(readFileSync(WORDS_PATH, "utf-8"));
    assert.equal(d.words.length, MASTER_LEXICON_EXPECTED_COUNT);
    assert.equal(Number(d.count), MASTER_LEXICON_EXPECTED_COUNT);
  });
});

// ---- Options and Distractors ----

describe("options", () => {
  it("pickDistractors returns exactly 3 items", () => {
    const r = pickDistractors(phraseBank.items, phraseBank.items[0].id, phraseBank.items[0].meaningZh, 3);
    assert.equal(r.length, 3);
  });
  it("distractors have unique meaningZh", () => {
    const r = pickDistractors(phraseBank.items, phraseBank.items[0].id, phraseBank.items[0].meaningZh, 3);
    assert.equal(new Set(r.map(x => x.meaningZh)).size, r.length);
  });
  it("distractors do not include correct meaning", () => {
    const entry = phraseBank.items[0];
    const r = pickDistractors(phraseBank.items, entry.id, entry.meaningZh, 3);
    for (const d of r) assert.notEqual(d.meaningZh, entry.meaningZh);
  });
  it("distractors have traceable sourcePhraseId and displayPhrase", () => {
    const entry = phraseBank.items[0];
    const r = pickDistractors(phraseBank.items, entry.id, entry.meaningZh, 3);
    for (const d of r) {
      assert.ok(d.sourcePhraseId);
      assert.ok(d.displayPhrase);
      const src = phraseBank.items.find(i => i.id === d.sourcePhraseId);
      assert.ok(src, "sourcePhraseId not in bank: " + d.sourcePhraseId);
      assert.equal(d.displayPhrase, src.phrase);
    }
  });
  it("heuristicSimilarityScore naming is honest", () => {
    const src = readFileSync(join(__dirname, "..", "options.mjs"), "utf-8");
    const nonComment = src.split("\n").filter(l => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
    assert.ok(!nonComment.includes("semanticDistance"));
    assert.ok(!nonComment.includes("semantic_distance"));
    assert.ok(src.includes("heuristicSimilarityScore"));
  });
});

// ---- Builder ----

describe("builder", () => {
  it("builds valid questions (30 samples)", () => {
    for (let i = 0; i < 30; i++) {
      const entry = phraseBank.items[i * 23 % 700];
      const q = buildQuestionWithValidation(entry, phraseBank.items, "test", i);
      assert.ok(validateQuestion(q).valid);
    }
  });
  it("questions have exactly 4 options", () => {
    for (let i = 0; i < 30; i++) {
      const q = buildQuestionWithValidation(phraseBank.items[i * 23 % 700], phraseBank.items, "t", i);
      assert.equal(q.options.length, 4);
    }
  });
  it("all 4 meaningZh are unique", () => {
    for (let i = 0; i < 30; i++) {
      const q = buildQuestionWithValidation(phraseBank.items[i * 23 % 700], phraseBank.items, "t", i);
      assert.equal(new Set(q.options.map(o => o.meaningZh)).size, 4);
    }
  });
  it("all 4 sourcePhraseId are unique", () => {
    for (let i = 0; i < 30; i++) {
      const q = buildQuestionWithValidation(phraseBank.items[i * 23 % 700], phraseBank.items, "t", i);
      assert.equal(new Set(q.options.map(o => o.sourcePhraseId)).size, 4);
    }
  });
  it("correct answer displayPhrase equals question phrase", () => {
    for (let i = 0; i < 30; i++) {
      const q = buildQuestionWithValidation(phraseBank.items[i * 23 % 700], phraseBank.items, "t", i);
      assert.equal(q.options.find(o => o.isCorrect).displayPhrase, q.phrase);
    }
  });
  it("all distractors come from phrase bank", () => {
    const allIds = new Set(phraseBank.items.map(i => i.id));
    for (let i = 0; i < 30; i++) {
      const q = buildQuestionWithValidation(phraseBank.items[i * 23 % 700], phraseBank.items, "t", i);
      for (const opt of q.options) {
        if (!opt.isCorrect) assert.ok(allIds.has(opt.sourcePhraseId));
      }
    }
  });
});

// ---- Anti-Memorization ----

describe("anti-memorization", () => {
  it("300 questions have zero optionHash repeats", () => {
    const cache = new AntiMemorizationCache();
    const hashes = new Set();
    for (let i = 0; i < 300; i++) {
      const q = buildQuestionWithValidation(phraseBank.items[i % 700], phraseBank.items, "hash-" + Math.floor(i/50), i, cache);
      assert.ok(!hashes.has(q.optionHash), "Dup hash at q " + i);
      hashes.add(q.optionHash);
    }
    assert.equal(hashes.size, 300);
  });

  it("max 2 three-consecutive position repeats (700-item pool is smaller than 4500)", () => {
    const cache = new AntiMemorizationCache();
    for (let i = 0; i < 300; i++) {
      buildQuestionWithValidation(phraseBank.items[i % 700], phraseBank.items, "pos-" + Math.floor(i/50), i, cache);
    }
    const h = cache.correctPositionHistory;
    let r = 0;
    for (let i = 2; i < h.length; i++) {
      if (h[i] === h[i-1] && h[i] === h[i-2]) r++;
    }
    assert.ok(r <= 2, "Found " + r + " 3-consecutive position repeats");
  });

  it("optionHash = sorted(sourcePhraseId).join(||)", () => {
    const q = buildQuestionWithValidation(phraseBank.items[0], phraseBank.items, "hf", 0);
    const sorted = [...q.options].map(o => o.sourcePhraseId).sort().join("||");
    assert.equal(q.optionHash, sorted);
  });
});

// ---- Engine ----

describe("engine", () => {
  let engine;
  beforeEach(() => { engine = createEngine(phraseBank.items); });

  it("produces valid questions", () => {
    const q = nextQuestion(engine);
    assert.ok(q); assert.equal(q.options.length, 4); assert.ok(q.options.find(o => o.isCorrect));
  });
  it("submitAnswer correct returns correct:true", () => {
    const q = nextQuestion(engine);
    assert.equal(submitAnswer(engine, q.options.find(o => o.isCorrect)).correct, true);
  });
  it("submitAnswer wrong returns correct:false", () => {
    const q = nextQuestion(engine);
    assert.equal(submitAnswer(engine, q.options.find(o => !o.isCorrect)).correct, false);
  });
  it("session stats track accuracy", () => {
    const q = nextQuestion(engine); submitAnswer(engine, q.options.find(o => o.isCorrect));
    assert.equal(getSessionStats(engine).accuracy, 100);
  });
  it("nextQuestion never returns same phraseId consecutively", () => {
    const ids = [];
    for (let i = 0; i < 50; i++) { const q = nextQuestion(engine); if (!q) break; ids.push(q.phraseId); }
    for (let i = 1; i < ids.length; i++) assert.notEqual(ids[i], ids[i-1]);
  });
  it("uses a 20-question session instead of treating all 700 as one round", () => {
    assert.equal(EXPRESSIONS_SESSION_SIZE, 20);
    assert.equal(engine.queue.length, 20);
    assert.equal(new Set(engine.queue).size, 20);
  });
  it("finishes after the current session queue instead of wrapping to index zero", () => {
    const ids = [];
    for (let i = 0; i < EXPRESSIONS_SESSION_SIZE; i++) {
      const question = nextQuestion(engine);
      assert.ok(question);
      ids.push(question.phraseId);
    }
    assert.equal(nextQuestion(engine), null);
    assert.equal(new Set(ids).size, EXPRESSIONS_SESSION_SIZE);
    const stats = getSessionStats(engine);
    assert.equal(stats.sessionPosition, EXPRESSIONS_SESSION_SIZE);
    assert.equal(stats.sessionRemaining, 0);
  });
  it("prioritizes unseen expressions while limiting wrong-item review to one quarter", () => {
    const progress = {};
    for (const item of phraseBank.items.slice(0, 10)) progress[item.id] = "unknown";
    for (const item of phraseBank.items.slice(10, 40)) progress[item.id] = "known";
    const queue = buildExpressionSessionQueue(phraseBank.items, {
      progress,
      random: () => 0.42
    });
    const wrongCount = queue.filter((id) => progress[id] === "unknown").length;
    const unseenCount = queue.filter((id) => !progress[id]).length;
    assert.ok(wrongCount <= 5);
    assert.ok(unseenCount >= 15);
  });
});

describe("system navigation and UI parity", () => {
  it("marks mobile more routes active and removes the duplicate desktop home link", () => {
    const root = join(__dirname, "..", "..", "..", "components");
    const source = readFileSync(join(root, "GlobalStudyHeader.jsx"), "utf-8");
    assert.match(source, /const mobileMoreActive = MOBILE_MORE_NAV\.some/);
    assert.match(source, /训练模式/);
    assert.doesNotMatch(source, /<House aria-hidden=/);
    assert.ok((source.match(/prefetch=\{false\}/g) || []).length >= 5);
  });

  it("shows total-pool and per-round counts with the shared high-visibility progress", () => {
    const page = readFileSync(join(__dirname, "..", "..", "..", "expressions", "page.jsx"), "utf-8");
    const css = readFileSync(join(__dirname, "..", "..", "..", "expressions", "expressions.module.css"), "utf-8");
    assert.match(page, /总题库 \{engine\.phraseBank\.length\} 条 · 本轮 \{engine\.queue\.length\} 题/);
    assert.match(page, /sessionPosition/);
    assert.match(page, /<Volume2 aria-hidden="true" \/>/);
    assert.doesNotMatch(page, /<svg width="18"/);
    assert.match(css, /\.progressBarWrap \{\s*height: 9px;/);
  });
});

// ---- Storage Compat ----

describe("storage compat", () => {
  it("storage preserves STORAGE_KEY", () => {
    const src = readFileSync(join(__dirname, "..", "storage.mjs"), "utf-8");
    assert.ok(src.includes("ielts_expressions_700_progress_v1"));
  });
  it("no adaptive state / SRS in engine code", () => {
    const src = readFileSync(join(__dirname, "..", "engine.mjs"), "utf-8");
    const nonComment = src.split("\n").filter(l => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
    assert.ok(!nonComment.includes("adaptive-state"));
    assert.ok(!nonComment.includes("review-scheduler"));
    assert.ok(!nonComment.includes("learningStage"));
    assert.ok(!nonComment.includes("masteryStage"));
    assert.ok(!nonComment.includes("repairPasses"));
  });
});

// ---- System Isolation ----

describe("system isolation", () => {
  it("zero imports from meaning-mode", () => {
    for (const f of ["engine.mjs","builder.mjs","options.mjs","storage.mjs","session-state.mjs"]) {
      const src = readFileSync(join(__dirname, "..", f), "utf-8");
      assert.ok(!src.includes("meaning-mode"), f + " imports from meaning-mode");
    }
  });
  it("zero imports from spelling", () => {
    for (const f of ["engine.mjs","builder.mjs","options.mjs","storage.mjs","session-state.mjs"]) {
      const src = readFileSync(join(__dirname, "..", f), "utf-8");
      assert.ok(!src.includes("spelling"), f + " imports from spelling");
    }
  });
  it("phrase bank not modified", () => {
    assert.equal(JSON.parse(readFileSync(DATA_PATH, "utf-8")).items.length, 700);
  });
  it("no forbidden storage keys", () => {
    for (const f of ["engine.mjs","builder.mjs","options.mjs","storage.mjs","session-state.mjs"]) {
      const src = readFileSync(join(__dirname, "..", f), "utf-8");
      for (const k of ["meaning_4500","spelling_","flash_"]) assert.ok(!src.includes(k), f + " refs " + k);
    }
  });
});
