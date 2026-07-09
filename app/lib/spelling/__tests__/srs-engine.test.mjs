import test from "node:test";
import assert from "node:assert/strict";

import { MS_PER_DAY, createSrsEngine } from "../index.mjs";

const now = Date.UTC(2026, 5, 18, 12, 0, 0);

test("SRS engine returns only words due at or before now", () => {
  const srs = createSrsEngine();
  const due = srs.getDueSrsWords(
    [
      { wordId: "due_now", srs: { stage: 1, nextReviewAt: now } },
      { wordId: "overdue", srs: { stage: 2, nextReviewAt: now - 1 } },
      { wordId: "future", srs: { stage: 1, nextReviewAt: now + 1 } },
      { wordId: "unscheduled", srs: { stage: 0, nextReviewAt: 0 } }
    ],
    now
  );

  assert.deepEqual(due.map((record) => record.wordId), ["due_now", "overdue"]);
});

test("SRS engine schedules the next stage using Ebbinghaus intervals", () => {
  const srs = createSrsEngine();

  assert.deepEqual(srs.scheduleNext("alpha", 0, now), {
    wordId: "alpha",
    stage: 1,
    lastReviewedAt: now,
    nextReviewAt: now + MS_PER_DAY
  });

  assert.equal(srs.scheduleNext("alpha", 1, now).stage, 2);
  assert.equal(srs.scheduleNext("alpha", 1, now).nextReviewAt, now + 3 * MS_PER_DAY);
});
