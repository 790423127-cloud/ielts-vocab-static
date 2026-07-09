import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ensureMeaningRuntimeIndexes,
  getWordBankIndex,
  hydrateMeaningWordBank,
  _semanticByWordId
} from "../runtime-indexes.mjs";
import { selectNextWord, createSessionState } from "../review-scheduler.mjs";

test("hydrates semantic metadata through the module index", async () => {
  await ensureMeaningRuntimeIndexes();
  const [wordId, semantic] = _semanticByWordId.entries().next().value;
  const entry = { wordId, word: semantic.word, meaningZh: semantic.meaningZh };

  hydrateMeaningWordBank([entry]);

  assert.equal(entry._posFamily, semantic._posFamily);
  assert.deepEqual(entry._semanticGroups, semantic._semanticGroups);
  assert.equal(entry._confidence, semantic._confidence);
});

test("reuses a word-bank index without rescanning the array", () => {
  let wordIdReads = 0;
  const bank = Array.from({ length: 200 }, (_, index) => ({
    get wordId() {
      wordIdReads++;
      return "word-" + index;
    },
    _posFamily: index % 2 === 0 ? "noun" : "verb"
  }));

  const first = getWordBankIndex(bank);
  const readsAfterFirstBuild = wordIdReads;
  const second = getWordBankIndex(bank);

  assert.strictEqual(second, first);
  assert.equal(wordIdReads, readsAfterFirstBuild);
  assert.equal(first.byWordId.size, bank.length);
  assert.equal(first.byPosFamily.get("noun").length, bank.length / 2);
});

test("scheduler selects the same priority winner without find or sort", () => {
  const entries = [
    { wordId: "learning-early" },
    { wordId: "weak-later" },
    { wordId: "weak-earliest" }
  ];
  const guardedBank = new Proxy(entries, {
    get(target, property, receiver) {
      if (property === "find" || property === "sort") {
        throw new Error("scheduler hot path accessed Array." + property);
      }
      return Reflect.get(target, property, receiver);
    }
  });
  const now = Date.now();
  const adaptiveState = {
    version: 2,
    words: {
      "learning-early": dueState("learning", now - 30_000),
      "weak-later": {
        ...dueState("weak", now - 10_000),
        lastAnsweredAt: now - 60_000
      },
      "weak-earliest": {
        ...dueState("weak", now - 20_000),
        lastAnsweredAt: now - 60_000
      }
    }
  };

  const selected = selectNextWord(
    entries.map(entry => entry.wordId),
    guardedBank,
    adaptiveState,
    createSessionState()
  );

  assert.equal(selected.wordId, "weak-earliest");
  assert.equal(selected.selectedBecause, "weak-reinforcement");
});

test("engine hydration sources cannot regress to semantic-index linear find", () => {
  const forwardSource = readFileSync(new URL("../engine.mjs", import.meta.url), "utf8");
  const reverseSource = readFileSync(
    new URL("../../meaning-en/engine.mjs", import.meta.url),
    "utf8"
  );
  const runtimeSource = readFileSync(
    new URL("../runtime-indexes.mjs", import.meta.url),
    "utf8"
  );

  for (const source of [forwardSource, reverseSource, runtimeSource]) {
    assert.doesNotMatch(source, /SEMANTIC_INDEX\s*\.\s*find\s*\(/);
  }
});

test("scheduler source does not sort complete priority buckets", () => {
  const source = readFileSync(
    new URL("../review-scheduler.mjs", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(source, /dueReviews\s*\.\s*sort\s*\(/);
  assert.doesNotMatch(source, /weakReinforcements\s*\.\s*sort\s*\(/);
  assert.doesNotMatch(source, /fallbackLearning\s*\.\s*sort\s*\(/);
});

function dueState(status, nextReviewAt) {
  return {
    status,
    learningStage: 0,
    reviewStage: 0,
    correctCount: 1,
    wrongCount: status === "weak" ? 1 : 0,
    repairPasses: 0,
    lastAnsweredAt: Date.now() - 10 * 60 * 1000,
    nextReviewAt,
    lastShownQuestionOrdinal: -10
  };
}
