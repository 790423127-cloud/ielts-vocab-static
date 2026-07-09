import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildRetrievalQuestion, createBuilderCaches, validateRetrievalQuestion } from "../builder.mjs";
import { createEngine } from "../engine.mjs";

const wordBank = JSON.parse(fs.readFileSync(new URL("../../../../public/data/meaning-4500.json", import.meta.url), "utf8")).items;

test("builds valid Chinese-to-English retrieval questions from existing audited candidates", () => {
  const caches = createBuilderCaches();
  let built = 0;
  let deferred = 0;

  for (let i = 0; i < Math.min(120, wordBank.length); i++) {
    const question = buildRetrievalQuestion(wordBank[i], wordBank, "meaning-en-test", i, caches);
    if (question.qualityDeferred) {
      deferred++;
      continue;
    }

    const validation = validateRetrievalQuestion(question);
    assert.equal(validation.valid, true, validation.reason);
    assert.equal(question.options.length, 4);
    assert.equal(question.options.filter(option => option.isCorrect).length, 1);
    assert.equal(question.canonicalAnswer, question.options.find(option => option.isCorrect).headword);
    assert.ok(question.chinesePromptZh);

    for (const option of question.options) {
      assert.match(option.qualityClass, /^P[12]$/);
      assert.match(option.qualityTier, /^[AB]$/);
      assert.ok(option.relationEvidence.kind);
      assert.ok(option.learnerDistinctionZh);
      assert.ok(option.sourceWordId);
      assert.ok(option.headword);
    }
    built++;
  }

  assert.ok(built > 0);
  assert.ok(deferred >= 0);
});

test("engine hydration preserves public word-bank shape and indexed metadata", async () => {
  const input = wordBank.slice(0, 25).map(entry => ({ ...entry }));
  const engine = await createEngine(input);

  assert.equal(engine.wordBank.length, input.length);
  assert.deepEqual(
    engine.wordBank.map(entry => entry.wordId),
    input.map(entry => entry.wordId)
  );
  for (const entry of engine.wordBank) {
    assert.ok(entry._posFamily);
    assert.ok(Array.isArray(entry._semanticGroups));
    assert.ok(entry._confidence);
  }
});
