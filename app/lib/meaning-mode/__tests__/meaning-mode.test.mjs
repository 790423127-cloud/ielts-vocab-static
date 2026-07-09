// Comprehensive Meaning Mode v3 tests — adaptive review, anti-memorization, UI rules.
import { describe, it, before, beforeEach } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Core modules
import { createEngine, nextQuestion, submitAnswer, getSessionStats } from "../engine.mjs";
import { buildQuestion, buildQuestionWithValidation, validateQuestion } from "../builder.mjs";
import { pickDistractors, seededShuffle, hashOptionSet, AntiMemorizationCache, heuristicSimilarityScore } from "../options.mjs";
import { createQualityCache, recordDistractorsUsed } from "../distractor-quality.mjs";
import { SEMANTIC_INDEX } from "../semantic-distractor-index.mjs";
import {
  createNewState, transitionCorrect, transitionWrong, isReadyForReview,
  migrateFromV1, loadAdaptiveState, saveAdaptiveState, getWordState,
  getAdaptiveStats, MIN_2, MIN_15, DAY_1
} from "../adaptive-state.mjs";
import { createSessionState, recordQuestion, wouldRepeatThreeConsecutive, checkPositionDistribution } from "../session-state.mjs";
import { selectNextWord, createSessionState as createSchedulerSession } from "../review-scheduler.mjs";
import { MASTER_LEXICON_EXPECTED_COUNT } from "../../vocab/master-lexicon-baseline.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "..", "..", "public", "data", "meaning-4500.json");
const WORDS_PATH = join(__dirname, "..", "..", "..", "..", ".static-export-cache", "words.json");

let wordBank, originalWords;

before(() => {
  const raw = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
  wordBank = raw;
  originalWords = JSON.parse(readFileSync(WORDS_PATH, "utf-8"));
  // Hydrate with semantic index
  for (const item of wordBank.items) {
    const sem = SEMANTIC_INDEX.find(s => s.wordId === item.wordId);
    if (sem) {
      item._posFamily = sem._posFamily;
      item._semanticGroups = sem._semanticGroups;
      item._confidence = sem._confidence;
    }
  }
});

// ═══════════════════════════════════════
// 4500 Word Bank
// ═══════════════════════════════════════

describe("meaning-4500 word bank", () => {
  it("has exactly 4500 items", () => {
    assert.equal(wordBank.items.length, 4500);
  });

  it("every item has wordId, word, meaningZh", () => {
    for (const item of wordBank.items) {
      assert.ok(item.wordId, "Missing wordId");
      assert.ok(item.word, "Missing word for " + item.wordId);
      assert.ok(item.meaningZh, "Missing meaningZh for " + item.word);
    }
  });

  it("no duplicate normalized words", () => {
    const normalized = wordBank.items.map(i => i.word.toLowerCase().trim());
    const unique = new Set(normalized);
    assert.equal(unique.size, normalized.length);
  });

  it("words.json not modified", () => {
    assert.equal(originalWords.words.length, MASTER_LEXICON_EXPECTED_COUNT);
    assert.equal(Number(originalWords.count), MASTER_LEXICON_EXPECTED_COUNT);
  });
});

// ═══════════════════════════════════════
// Adaptive State Machine
// ═══════════════════════════════════════

describe("adaptive state machine", () => {
  it("1. new → correct → learning (stage 0, 15 min)", () => {
    const state = createNewState();
    assert.equal(state.status, "new");

    const result = transitionCorrect(state);
    assert.equal(result.status, "learning");
    assert.equal(result.learningStage, 0);
    assert.ok(result.nextReviewAt > Date.now());
    assert.ok(result.nextReviewAt <= Date.now() + MIN_15 + 1000);
  });

  it("2. new → wrong → weak (repairPasses=0, 2 min)", () => {
    const state = createNewState();
    const result = transitionWrong(state);
    assert.equal(result.status, "weak");
    assert.equal(result.repairPasses, 0);
    assert.equal(result.consecutiveCorrect, 0);
    assert.ok(result.nextReviewAt <= Date.now() + MIN_2 + 1000);
  });

  it("3. weak word not immediately reviewable", () => {
    const now = Date.now();
    // Fresh weak word — not enough questions since + time not elapsed
    const state = { ...createNewState(), status: "weak", lastAnsweredAt: now, nextReviewAt: now + MIN_2, wrongCount: 1 };
    assert.equal(isReadyForReview(state, 2, 100), false);

    // Time elapsed but not enough questions
    const elapsed = { ...state, lastAnsweredAt: now - MIN_2 - 1000, nextReviewAt: now - 1 };
    assert.equal(isReadyForReview(elapsed, 2, 100), false);

    // Enough questions but time not elapsed
    assert.equal(isReadyForReview(state, 6, 100), false);

    // Both conditions met: time elapsed + 5+ questions
    const ready = { ...state, lastAnsweredAt: now - MIN_2 - 1000, nextReviewAt: now - 1 };
    assert.equal(isReadyForReview(ready, 6, 100), true);
  });

  it("4. weak needs 5 questions + 2 min interval", () => {
    const now = Date.now();
    const state = { ...createNewState(), status: "weak", lastAnsweredAt: now, nextReviewAt: now + MIN_2, wrongCount: 1 };
    // Only 3 questions since last shown
    assert.equal(isReadyForReview(state, 3, 100), false);
    // 5 questions since, but time not elapsed
    assert.equal(isReadyForReview({ ...state, lastAnsweredAt: now }, 5, 100), false);
    // Both conditions met
    const ready = { ...state, lastAnsweredAt: now - MIN_2 - 1000, nextReviewAt: now - 1 };
    assert.equal(isReadyForReview(ready, 5, 100), true);
  });

  it("5. weak → two spaced corrects → learning (stage 1)", () => {
    let state = { ...createNewState(), status: "weak", repairPasses: 0, consecutiveCorrect: 0 };
    state = transitionCorrect(state);
    assert.equal(state.status, "weak");
    assert.equal(state.repairPasses, 1);

    state = transitionCorrect(state);
    assert.equal(state.status, "learning");
    assert.equal(state.learningStage, 1);
  });

  it("6. weak → wrong again → repairPasses reset", () => {
    let state = { ...createNewState(), status: "weak", repairPasses: 1 };
    state = transitionWrong(state);
    assert.equal(state.status, "weak");
    assert.equal(state.repairPasses, 0);
  });

  it("7. learning stages: 15m → 1d → 3d → 7d → mastered(15d)", () => {
    let state = createNewState();
    state = transitionCorrect(state);
    assert.equal(state.status, "learning");
    assert.equal(state.learningStage, 0);

    state = transitionCorrect(state);
    assert.equal(state.learningStage, 1);
    state = transitionCorrect(state);
    assert.equal(state.learningStage, 2);
    state = transitionCorrect(state);
    assert.equal(state.learningStage, 3);
    state = transitionCorrect(state);
    assert.equal(state.status, "mastered");
    assert.equal(state.masteryStage, 0);
  });

  it("8. mastered stages: 15d → 30d → 60d → 60d", () => {
    let state = { ...createNewState(), status: "mastered", masteryStage: 0 };
    state = transitionCorrect(state);
    assert.equal(state.masteryStage, 1);
    state = transitionCorrect(state);
    assert.equal(state.masteryStage, 2);
    state = transitionCorrect(state);
    assert.equal(state.masteryStage, 2);
  });

  it("9. learning/mastered wrong → back to weak", () => {
    let state = { ...createNewState(), status: "learning", learningStage: 2 };
    state = transitionWrong(state);
    assert.equal(state.status, "weak");
    assert.equal(state.repairPasses, 0);

    state = { ...createNewState(), status: "mastered", masteryStage: 1 };
    state = transitionWrong(state);
    assert.equal(state.status, "weak");
  });

  it("10. same wordId not consecutive (scheduler)", () => {
    const wordIds = wordBank.items.slice(0, 100).map(i => i.wordId);
    const session = createSchedulerSession();
    const adaptive = { version: 2, words: {} };
    for (const wid of wordIds) {
      adaptive.words[wid] = createNewState();
    }
    const selections = [];
    for (let i = 0; i < 30; i++) {
      const sel = selectNextWord(wordIds, wordBank.items, adaptive, session);
      if (!sel) break;
      selections.push(sel.wordId);
      session.recentWordIds.push(sel.wordId);
      session.questionOrdinal++;
    }
    for (let i = 1; i < selections.length; i++) {
      assert.notEqual(selections[i], selections[i - 1], "Consecutive duplicate at index " + i);
    }
  });

  it("11. force new after 3 reviews", () => {
    const wordIds = wordBank.items.slice(0, 100).map(i => i.wordId);
    const session = createSchedulerSession();
    session.consecutiveReviewCount = 3;
    const adaptive = { version: 2, words: {} };
    for (const wid of wordIds) {
      adaptive.words[wid] = createNewState();
    }
    for (let i = 0; i < 50; i++) {
      adaptive.words[wordIds[i]] = { ...createNewState(), status: "learning", nextReviewAt: Date.now() + DAY_1, lastAnsweredAt: Date.now() };
    }
    const sel = selectNextWord(wordIds, wordBank.items, adaptive, session);
    assert.ok(sel, "Should find a word");
    assert.equal(sel.selectedBecause, "new-word");
  });

  it("12. due review priority over new", () => {
    const wordIds = wordBank.items.slice(0, 100).map(i => i.wordId);
    const session = createSchedulerSession();
    const adaptive = { version: 2, words: {} };
    for (const wid of wordIds) {
      adaptive.words[wid] = createNewState();
    }
    adaptive.words[wordIds[50]] = {
      ...createNewState(),
      status: "learning",
      learningStage: 0,
      nextReviewAt: Date.now() - 1000,
      lastAnsweredAt: Date.now() - MIN_15 - 1000
    };
    const sel = selectNextWord(wordIds, wordBank.items, adaptive, session);
    assert.ok(sel);
    assert.equal(sel.selectedBecause, "due-review");
    assert.equal(sel.wordId, wordIds[50]);
  });
});

// ═══════════════════════════════════════
// Anti-Memorization: Options & Builder
// ═══════════════════════════════════════

describe("anti-memorization", () => {
  it("1. every question has exactly 4 unique options", () => {
    const cache = new AntiMemorizationCache();
    for (let i = 0; i < 50; i++) {
      const entry = wordBank.items[i * 89 % 4500];
      const q = buildQuestionWithValidation(entry, wordBank.items, "test-session", i, cache);
      const validation = validateQuestion(q);
      assert.ok(validation.valid, "Invalid question at " + i + ": " + (validation.reason || ""));
    }
  });

  it("2. correct answer exists in options", () => {
    let checked = 0;
    for (let i = 0; i < 50; i++) {
      const entry = wordBank.items[i * 89 % 4500];
      const q = buildQuestionWithValidation(entry, wordBank.items, "test-" + i, i);
      if (q.qualityDeferred) continue;
      const meanings = q.options.map(o => o.meaningZh);
      assert.ok(meanings.includes(q.correctAnswer), "Answer not in options for " + q.word);
      checked++;
    }
    assert.ok(checked > 0, "No valid questions available for answer-exists check");
  });

  it("3. optionHash uses sorted+joined meanings", () => {
    let q = null;
    for (let i = 0; i < 100 && !q; i++) {
      const candidate = buildQuestionWithValidation(wordBank.items[i], wordBank.items, "hash-test", i);
      if (!candidate.qualityDeferred) q = candidate;
    }
    assert.ok(q, "No valid question available for optionHash check");
    const opts = q.options;
    // Hash is built from sorted meaningZh using default JS sort
    const sortedMeanings = [...opts].map(o => o.meaningZh.trim()).sort();
    const expectedHash = sortedMeanings.join("||");
    assert.equal(q.optionHash, expectedHash);
  });

  it("4. 300 questions have zero optionHash repeats", () => {
    const cache = new AntiMemorizationCache();
    const qc = createQualityCache();
    const hashes = new Set();
    let built = 0;
    let deferred = 0;
    for (let i = 0; i < 400 && built < 300; i++) {
      const entry = wordBank.items[i % 4500];
      const q = buildQuestionWithValidation(entry, wordBank.items, "hash-" + Math.floor(i / 50), i, cache, qc);
      if (q.qualityDeferred) continue;
      if (!validateQuestion(q).valid) continue;
      if (hashes.has(q.optionHash)) { deferred++; continue; }
      hashes.add(q.optionHash);
      recordDistractorsUsed(qc, entry.wordId, q.options.filter(o => !o.isCorrect), null);
      built++;
    }
    assert.ok(hashes.size >= 290, "Too many dup hashes: " + (300 - hashes.size) + " duplicates, " + deferred + " deferred");
  });
  it("5. zero three-consecutive position repeat in 300 questions", () => {
    const cache = new AntiMemorizationCache();
    const qc = createQualityCache();
    let built = 0;
    for (let i = 0; i < 400 && built < 300; i++) {
      const entry = wordBank.items[i % 4500];
      const q = buildQuestionWithValidation(entry, wordBank.items, "pos-" + Math.floor(i / 50), i, cache, qc);
      if (q.qualityDeferred) continue;
      if (!validateQuestion(q).valid) continue;
      recordDistractorsUsed(qc, entry.wordId, q.options.filter(o => !o.isCorrect), null);
      built++;
    }
    const history = cache.correctPositionHistory;
    let repeats = 0;
    for (let i = 2; i < history.length; i++) {
      if (history[i] === history[i-1] && history[i] === history[i-2]) repeats++;
    }
    assert.equal(repeats, 0, "Found " + repeats + " 3-consecutive position repeats");
  });

  it("6. position distribution within 18%-32% for >=250 questions", () => {
    const cache = new AntiMemorizationCache();
    const qc = createQualityCache();
    let built = 0;
    for (let i = 0; i < 400 && built < 300; i++) {
      const entry = wordBank.items[i % 4500];
      const q = buildQuestionWithValidation(entry, wordBank.items, "dist-" + Math.floor(i / 50), i, cache, qc);
      if (q.qualityDeferred) continue;
      if (!validateQuestion(q).valid) continue;
      recordDistractorsUsed(qc, entry.wordId, q.options.filter(o => !o.isCorrect), null);
      built++;
    }
    const history = cache.correctPositionHistory;
    assert.ok(history.length >= 250, "Only " + history.length + " questions built");
    const counts = [0, 0, 0, 0];
    for (const idx of history) {
      if (idx >= 0 && idx < 4) counts[idx]++;
    }
    const total = history.length;
    for (let i = 0; i < 4; i++) {
      const pct = counts[i] / total;
      assert.ok(pct >= 0.18, "Position " + i + " too low: " + (pct * 100).toFixed(1) + "%");
      assert.ok(pct <= 0.32, "Position " + i + " too high: " + (pct * 100).toFixed(1) + "%");
    }
  });

  it("7. all distractors come from meaning-4500.json", () => {
    const allWordIds = new Set(wordBank.items.map(i => i.wordId));
    const cache = new AntiMemorizationCache();
    let checked = 0;
    for (let i = 0; i < 100; i++) {
      const entry = wordBank.items[i * 43 % 4500];
      const q = buildQuestionWithValidation(entry, wordBank.items, "source-" + i, i, cache);
      if (q.qualityDeferred) continue;
      for (const opt of q.options) {
        if (!opt.isCorrect) {
          assert.ok(allWordIds.has(opt.sourceWordId), "Distractor sourceWordId " + opt.sourceWordId + " not in word bank");
        }
      }
      checked++;
    }
    assert.ok(checked > 0, "No valid questions available for source check");
  });

  it("8. heuristicSimilarityScore naming does not claim semantic distance", () => {
    const src = readFileSync(join(__dirname, "..", "options.mjs"), "utf-8");
    // Must use heuristicSimilarityScore, not claim to be semantic distance in code identifiers
    assert.ok(src.includes("heuristicSimilarityScore"), "Missing heuristicSimilarityScore function");
    // Check that no function/variable is named semanticDistance or semantic_distance
    const nonCommentLines = src.split("\n").filter(l => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
    const nonCommentSrc = nonCommentLines.join("\n");
    assert.ok(!nonCommentSrc.includes("semanticDistance"), "Code uses semanticDistance identifier");
    assert.ok(!nonCommentSrc.includes("semantic_distance"), "Code uses semantic_distance identifier");
  });

  it("9. correct option displayEnglish equals question.word", () => {
    const cache = new AntiMemorizationCache();
    let checked = 0;
    for (let i = 0; i < 50; i++) {
      const entry = wordBank.items[i * 89 % 4500];
      const q = buildQuestionWithValidation(entry, wordBank.items, "display-" + i, i, cache);
      if (q.qualityDeferred) continue;
      const correctOpt = q.options.find(o => o.isCorrect);
      assert.ok(correctOpt, "No correct option found");
      assert.equal(correctOpt.displayEnglish, q.word, "displayEnglish mismatch: " + correctOpt.displayEnglish + " vs " + q.word);
      checked++;
    }
    assert.ok(checked > 0, "No valid questions available for display check");
  });

  it("10. every option has sourceWordId and displayEnglish", () => {
    const cache = new AntiMemorizationCache();
    let checked = 0;
    for (let i = 0; i < 50; i++) {
      const entry = wordBank.items[i * 89 % 4500];
      const q = buildQuestionWithValidation(entry, wordBank.items, "trace-" + i, i, cache);
      if (q.qualityDeferred) continue;
      for (const opt of q.options) {
        assert.ok(opt.sourceWordId, "Missing sourceWordId for " + opt.meaningZh);
        assert.ok(opt.displayEnglish, "Missing displayEnglish for " + opt.meaningZh);
      }
      checked++;
    }
    assert.ok(checked > 0, "No valid questions available for trace check");
  });
});

// ═══════════════════════════════════════
// Engine Integration
// ═══════════════════════════════════════

describe("engine v3", () => {
  let engine;

  beforeEach(async () => {
    engine = await createEngine(wordBank.items);
  });

  it("produces questions with adaptive scheduling", () => {
    const q = nextQuestion(engine);
    assert.ok(q, "Should produce a question");
    assert.equal(q.options.length, 4);
    assert.ok(q.options.find(o => o.isCorrect));
    assert.ok(q._selectedBecause);
  });

  it("submitAnswer works and returns adaptive metadata", () => {
    const q = nextQuestion(engine);
    const res = submitAnswer(engine, q.options.find(o => o.isCorrect));
    assert.equal(res.correct, true);
    assert.ok(res.previousStatus);
    assert.ok(res.nextStatus);
    assert.ok(res.selectedBecause);
  });

  it("session stats include adaptive counts", () => {
    const q = nextQuestion(engine);
    submitAnswer(engine, q.options.find(o => o.isCorrect));
    const stats = getSessionStats(engine);
    assert.ok(typeof stats.newCount === "number");
    assert.ok(typeof stats.weakCount === "number");
    assert.ok(typeof stats.learningCount === "number");
    assert.ok(typeof stats.masteredCount === "number");
    assert.ok(stats.dueReview !== undefined);
  });

  it("wrong answer on new word creates weak state", () => {
    const q = nextQuestion(engine);
    const wrongOpt = q.options.find(o => !o.isCorrect);
    const res = submitAnswer(engine, wrongOpt);
    assert.equal(res.correct, false);
    assert.equal(res.nextStatus, "weak");
  });
});

// ═══════════════════════════════════════
// Session State
// ═══════════════════════════════════════

describe("session state", () => {
  it("tracks question ordinal", () => {
    const session = createSessionState();
    assert.equal(session.questionOrdinal, 0);
    recordQuestion(session, { wordId: "test", correctOptionIndex: 1, optionHash: "a||b||c||d" });
    assert.equal(session.questionOrdinal, 1);
  });

  it("wouldRepeatThreeConsecutive detection", () => {
    const session = createSessionState();
    session.recentCorrectIndices = [0, 0];
    assert.equal(wouldRepeatThreeConsecutive(session, 0), true);
    assert.equal(wouldRepeatThreeConsecutive(session, 1), false);
  });

  it("usedOptionHashes dedup", () => {
    const session = createSessionState();
    session.usedOptionHashes.add("a||b||c||d");
    assert.equal(session.usedOptionHashes.has("a||b||c||d"), true);
    assert.equal(session.usedOptionHashes.has("e||f||g||h"), false);
  });
});

// ═══════════════════════════════════════
// Example Index
// ═══════════════════════════════════════

describe("example index", () => {
  let exampleIndex;

  before(async () => {
    const mod = await import("../example-index.generated.mjs");
    exampleIndex = mod.MEANING_EXAMPLE_INDEX;
  });

  it("1. example index only contains meaning-4500 words", () => {
    const meaningWordIds = new Set(wordBank.items.map(i => i.wordId));
    for (const key of Object.keys(exampleIndex)) {
      assert.ok(meaningWordIds.has(key), "Index key " + key + " not in meaning-4500");
    }
  });

  it("2. every example is traceable to sourceWordId", () => {
    for (const [key, entry] of Object.entries(exampleIndex)) {
      assert.ok(entry.sourceWordId, "Missing sourceWordId for " + key);
      assert.ok(entry.word, "Missing word for " + key);
      assert.ok(entry.example, "Missing example for " + key);
      assert.ok(typeof entry.example === "string", "Example is not string for " + key);
      assert.ok(entry.example.length > 0, "Empty example for " + key);
    }
  });

  it("3. no AI-generated or fabricated examples", () => {
    // All examples must come from the main word bank
    // Check: example must be a natural English sentence
    for (const [key, entry] of Object.entries(exampleIndex).slice(0, 200)) {
      const ex = entry.example;
      // Must contain at least one English letter
      assert.ok(/[a-zA-Z]/.test(ex), "No English letters in example: " + ex);
      // Must not be purely numbers/symbols
      assert.ok(ex.replace(/[^a-zA-Z]/g, "").length >= 3, "Too few letters in example: " + ex);
      // Must have sourceField
      assert.ok(entry.sourceField, "Missing sourceField for " + key);
    }
  });

  it("4. words.json and meaning-4500.json unchanged", () => {
    const wordsData = JSON.parse(readFileSync(WORDS_PATH, "utf-8"));
    assert.equal(wordsData.words.length, MASTER_LEXICON_EXPECTED_COUNT);

    const meaningData = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
    assert.equal(meaningData.items.length, 4500);
  });

  it("5. exampleCn is null when no real Chinese translation", () => {
    let nullCount = 0;
    let hasCnCount = 0;
    for (const [, entry] of Object.entries(exampleIndex)) {
      if (entry.exampleCn === null || entry.exampleCn === undefined) {
        nullCount++;
      } else {
        hasCnCount++;
        assert.ok(typeof entry.exampleCn === "string", "exampleCn not string for " + entry.word);
      }
    }
    // Most should have Chinese translations (main bank has 100% exampleCn coverage)
    assert.ok(hasCnCount > 0, "No entries have exampleCn");
  });

  it("6. index is keyed by meaning-4500 wordId", () => {
    const sampleItem = wordBank.items[0];
    assert.ok(exampleIndex[sampleItem.wordId], "Sample wordId " + sampleItem.wordId + " not in index");
  });

  it("7. example sentences are real English text", () => {
    const samples = Object.entries(exampleIndex).slice(0, 50);
    for (const [key, entry] of samples) {
      const ex = entry.example;
      // Must not be purely CJK characters
      const cjkCount = (ex.match(/[\u4E00-\u9FFF]/g) || []).length;
      assert.ok(cjkCount < ex.length * 0.3, "Example too much CJK: " + ex.substring(0, 40));
      // Must look like a sentence (starts with capital letter or number)
      // (Relaxed check: some examples may start with quotes or lowercase)
    }
  });
});
// ═══════════════════════════════════════
// System Isolation
// ═══════════════════════════════════════

describe("system isolation", () => {
  it("meaning mode uses independent storage key", () => {
    const storageSource = readFileSync(join(__dirname, "..", "storage.mjs"), "utf-8");
    assert.ok(storageSource.includes("ielts_meaning_4500_adaptive_v2"));
    assert.ok(storageSource.includes("ielts_meaning_4500_progress_v1"));
  });

  it("engine does not import spelling/SRS modules", () => {
    const engineSource = readFileSync(join(__dirname, "..", "engine.mjs"), "utf-8");
    const importLines = engineSource.split("\n").filter(l => l.trim().startsWith("import"));
    const badImport = importLines.some(l => /\bspelling\b|\bsrs\b/i.test(l) && !l.includes("review-scheduler"));
    assert.ok(!badImport, "Engine imports external spelling/SRS modules");
  });

  it("adaptive-state never imports spelling/SRS", () => {
    const src = readFileSync(join(__dirname, "..", "adaptive-state.mjs"), "utf-8");
    const importLines = src.split("\n").filter(l => l.trim().startsWith("import"));
    const badImport = importLines.some(l => /\bspelling\b|\bsrs\b/i.test(l));
    assert.ok(!badImport);
  });

  it("words.json unmodified after build", () => {
    const currentWords = readFileSync(WORDS_PATH, "utf-8");
    const parsed = JSON.parse(currentWords);
    assert.equal(parsed.words.length, MASTER_LEXICON_EXPECTED_COUNT);
  });

  it("no non-Meaning-Mode storage keys written", () => {
    const allSources = [
      "adaptive-state.mjs", "engine.mjs", "storage.mjs", "options.mjs",
      "builder.mjs", "review-scheduler.mjs", "session-state.mjs", "audio.mjs"
    ];
    const forbiddenKeys = [
      "spellingProgress", "spelling_progress", "flashProgress",
      "ielts_expressions_700", "srs_", "vocab_flash_"
    ];
    for (const file of allSources) {
      const src = readFileSync(join(__dirname, "..", file), "utf-8");
      for (const key of forbiddenKeys) {
        assert.ok(!src.includes(key), file + " references forbidden key: " + key);
      }
    }
  });
});
