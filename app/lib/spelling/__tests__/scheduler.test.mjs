import test from "node:test";
import assert from "node:assert/strict";

import {
  createSpellingRecord,
  selectNextSpellingWord,
  submitSpellingAnswer
} from "../index.mjs";

const now = Date.UTC(2026, 5, 18, 10, 0, 0);

function wrongThenCorrect(wordId, sequence) {
  return submitSpellingAnswer(
    submitSpellingAnswer(createSpellingRecord(wordId), {
      answer: "wrong",
      expectedAnswer: wordId,
      now,
      sequence
    }).record,
    {
      answer: wordId,
      expectedAnswer: wordId,
      now: now + 10_000,
      sequence: sequence + 1
    }
  ).record;
}

test("scheduler prioritizes locked repair before all other queues", () => {
  const records = {
    due_srs: {
      ...createSpellingRecord("due_srs"),
      srs: { stage: 1, nextReviewAt: now - 1, lastReviewedAt: now - 86_400_000 }
    },
    waiting_ready: {
      ...wrongThenCorrect("waiting_ready", 1),
      today: {
        ...wrongThenCorrect("waiting_ready", 1).today,
        nextEligibleAt: now - 1,
        lastSeenSequence: 1,
        minOtherWordsBeforeNext: 8
      }
    },
    must_fix: submitSpellingAnswer(createSpellingRecord("must_fix"), {
      answer: "muts_fix",
      expectedAnswer: "must_fix",
      now,
      sequence: 5
    }).record
  };

  const next = selectNextSpellingWord({
    candidateWordIds: ["ordinary", "due_srs", "waiting_ready", "must_fix"],
    records,
    now,
    sequence: 20,
    lastWordId: "ordinary"
  });

  assert.equal(next.wordId, "must_fix");
  assert.equal(next.source, "in_repair_locked");
});

test("in_repair revisit appears only after spacing constraints are satisfied", () => {
  const waiting = wrongThenCorrect("waiting_word", 4);

  assert.equal(selectNextSpellingWord({
    candidateWordIds: ["ordinary", "waiting_word"],
    records: { waiting_word: waiting },
    now: now + 120_000,
    sequence: 13,
    lastWordId: "ordinary"
  }).wordId, "ordinary");

  assert.equal(selectNextSpellingWord({
    candidateWordIds: ["ordinary", "waiting_word"],
    records: { waiting_word: waiting },
    now: now + 190_000,
    sequence: 14,
    lastWordId: "ordinary"
  }).wordId, "waiting_word");
});

test("scheduler avoids repeating the previous normal word when alternatives exist", () => {
  const next = selectNextSpellingWord({
    candidateWordIds: ["alpha", "bravo"],
    records: {},
    now,
    sequence: 1,
    lastWordId: "alpha"
  });

  assert.equal(next.wordId, "bravo");
  assert.equal(next.source, "ordinary");
});

test("overdue repair revisit is forced ahead of SRS and ordinary words", () => {
  const waiting = wrongThenCorrect("waiting_overdue", 1);
  const overdue = {
    ...waiting,
    today: {
      ...waiting.today,
      nextEligibleAt: now + 60_000,
      lastSeenSequence: 1,
      minOtherWordsBeforeNext: 8
    }
  };

  const records = {
    waiting_overdue: overdue,
    due_srs: {
      ...createSpellingRecord("due_srs"),
      srs: { stage: 1, nextReviewAt: now - 1, lastReviewedAt: now - 86_400_000 }
    }
  };

  const next = selectNextSpellingWord({
    candidateWordIds: ["ordinary", "due_srs", "waiting_overdue"],
    records,
    now: now + 16 * 60_000,
    sequence: 22,
    lastWordId: "ordinary"
  });

  assert.equal(next.wordId, "waiting_overdue");
  assert.equal(next.source, "in_repair_forced");
});

test("a lone repair item remains trainable when spacing cannot be filled", () => {
  const waiting = wrongThenCorrect("only_repair", 1);
  const next = selectNextSpellingWord({
    candidateWordIds: ["only_repair"],
    records: { only_repair: waiting },
    now: now + 20_000,
    sequence: 3,
    lastWordId: "only_repair",
    allowRepairSpacingFallback: true
  });

  assert.equal(next.wordId, "only_repair");
  assert.equal(next.source, "in_repair_only_remaining");
});

test("repair fallback rotates by the least recently seen item", () => {
  const recent = wrongThenCorrect("recent_repair", 8);
  const oldest = wrongThenCorrect("oldest_repair", 2);
  const middle = wrongThenCorrect("middle_repair", 5);
  const next = selectNextSpellingWord({
    candidateWordIds: ["recent_repair", "oldest_repair", "middle_repair"],
    records: { recent_repair: recent, oldest_repair: oldest, middle_repair: middle },
    now: now + 20_000,
    sequence: 10,
    lastWordId: "recent_repair",
    allowRepairSpacingFallback: true
  });

  assert.equal(next.wordId, "oldest_repair");
  assert.equal(next.source, "in_repair_only_remaining");
});
