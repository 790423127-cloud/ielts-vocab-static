import test from "node:test";
import assert from "node:assert/strict";

import { createSpellingSessionRunner } from "../session-runner.mjs";

test("high-frequency continuous correct input completes a 400-item batch exactly once", () => {
  const candidates = Array.from({ length: 400 }, (_, index) => ({
    wordId: `stress-${index}`,
    expectedAnswer: `word${index}`,
    displayText: `word${index}`,
    entryType: "word"
  }));
  const runner = createSpellingSessionRunner({ candidates, now: 1_000, sequence: 0 });
  const seen = new Set();

  for (let index = 0; index < candidates.length; index += 1) {
    const current = runner.getCurrent({ now: 1_000 + index, sequence: index });
    assert.ok(current.currentWord);
    assert.equal(seen.has(current.currentWord.wordId), false);
    seen.add(current.currentWord.wordId);

    const result = runner.submitAnswer(current.currentWord.expectedAnswer, {
      now: 1_000 + index,
      sequence: index
    });
    assert.equal(result.answerMeta.isCorrect, true);
  }

  const done = runner.getCurrent({ now: 2_000, sequence: candidates.length });
  assert.equal(done.currentWord, null);
  assert.equal(done.sessionProgress.batchProgress.completedCount, 400);
  assert.equal(done.sessionProgress.batchProgress.sessionTotal, 400);
  assert.equal(seen.size, 400);
});
