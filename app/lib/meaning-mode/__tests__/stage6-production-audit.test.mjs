// Production audit for the 6000-word Meaning Mode bank.
// Uses the current builder and generated indexes; no legacy inline ranking copy.

import { describe, it, before } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { buildQuestionWithValidation, validateQuestion } from "../builder.mjs";
import { resetGlobalFrequency } from "../distractor-ranking.mjs";
import { AntiMemorizationCache } from "../options.mjs";
import { createQualityCache } from "../distractor-quality.mjs";
import { SEMANTIC_INDEX } from "../semantic-distractor-index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..", "..");
const DATA_PATH = join(ROOT, "public", "data", "meaning-6000.json");

let bank;
let byWord;

before(() => {
  const raw = JSON.parse(readFileSync(DATA_PATH, "utf-8")).items;
  const semanticById = new Map(SEMANTIC_INDEX.map(entry => [entry.wordId, entry]));
  bank = raw.map(item => {
    const semantic = semanticById.get(item.wordId);
    return {
      ...item,
      _posFamily: semantic?._posFamily || item.posFamily || "unknown",
      _semanticGroups: semantic?._semanticGroups || ["general"],
      _confidence: semantic?._confidence || "low"
    };
  });
  byWord = new Map(bank.map(entry => [entry.word.toLowerCase(), entry]));
});

describe("Stage 6 production audit — current pipeline", () => {
  it("loads exactly 6000 unique, trainable entries", () => {
    assert.equal(bank.length, 6000);
    assert.equal(new Set(bank.map(entry => entry.wordId)).size, 6000);
    assert.equal(new Set(bank.map(entry => entry.word.toLowerCase().trim())).size, 6000);
    for (const entry of bank) {
      assert.ok(entry.wordId);
      assert.ok(entry.word);
      assert.ok(entry.meaningZh);
      assert.match(entry._posFamily, /^(noun|verb|adjective|adverb)$/);
    }
  });

  it("every target has a sufficiently large same-POS pool", () => {
    const counts = new Map();
    for (const entry of bank) counts.set(entry._posFamily, (counts.get(entry._posFamily) || 0) + 1);
    for (const entry of bank) {
      assert.ok((counts.get(entry._posFamily) || 0) >= 4, `${entry.word}: insufficient ${entry._posFamily} pool`);
    }
  });

  it("builds and validates 1200 evenly distributed production questions", () => {
    resetGlobalFrequency();
    const antiCache = new AntiMemorizationCache();
    const qualityCache = createQualityCache();
    let built = 0;
    const step = 37;

    for (let i = 0; i < 1200; i++) {
      const entry = bank[(i * step) % bank.length];
      const question = buildQuestionWithValidation(
        entry, bank, "stage6-current", i, antiCache, qualityCache, 5
      );
      if (question.qualityDeferred) continue;
      const validation = validateQuestion(question);
      assert.equal(validation.valid, true, `${entry.word}: ${validation.reason}`);
      built++;
    }
    assert.ok(built >= 1180, `Only ${built}/1200 questions built`);
  });

  it("known complaint words never receive their blocked distractors", () => {
    resetGlobalFrequency();
    const forbidden = new Map([
      ["commitment", new Set(["culture", "relation", "independence"])],
      ["experience", new Set(["satisfaction", "anxiety", "happiness"])],
      ["limited", new Set(["early", "extra", "all", "quick", "rapid", "fast"])],
      ["aggressive", new Set(["meaningful", "used", "asian"])]
    ]);

    let ordinal = 0;
    for (const [word, blocked] of forbidden) {
      const target = byWord.get(word);
      assert.ok(target, `${word} missing`);
      const question = buildQuestionWithValidation(target, bank, "stage6-blocked", ordinal++, null, null, 5);
      assert.equal(question.qualityDeferred, undefined, `${word} deferred`);
      assert.equal(validateQuestion(question).valid, true);
      for (const option of question.options.filter(option => !option.isCorrect)) {
        assert.equal(blocked.has(option.sourceHeadword.toLowerCase()), false,
          `${word} received blocked distractor ${option.sourceHeadword}`);
      }
    }
  });
});
