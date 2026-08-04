import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceStudyQueueAfterDelete,
  advanceStudyQueueAfterExit,
  resolveCurrentStudyEntryId
} from "../study-queue-delete.mjs";

function row(id, originalIndex, word = id) {
  return { entry: { id, word }, originalIndex };
}

test("delete lands on the next queue card, not the head", () => {
  const list = [row("a", 10), row("b", 3), row("c", 7), row("d", 1)];
  const result = advanceStudyQueueAfterDelete(list, "b");
  assert.equal(result.landingEntryId, "c");
  assert.equal(result.landingOriginalIndex, 7);
  assert.equal(result.landingPos, 1);
  assert.deepEqual(result.nextList.map((r) => r.entry.id), ["a", "c", "d"]);
});

test("delete first lands on former second", () => {
  const list = [row("a", 10), row("b", 3), row("c", 7)];
  const result = advanceStudyQueueAfterDelete(list, "a");
  assert.equal(result.landingEntryId, "b");
  assert.equal(result.landingPos, 0);
});

test("delete last lands on previous, not first", () => {
  const list = [row("a", 10), row("b", 3), row("c", 7)];
  const result = advanceStudyQueueAfterDelete(list, "c");
  assert.equal(result.landingEntryId, "b");
  assert.equal(result.landingPos, 1);
  assert.notEqual(result.landingEntryId, "a");
});

test("delete only card empties queue", () => {
  const list = [row("solo", 4)];
  const result = advanceStudyQueueAfterDelete(list, "solo");
  assert.equal(result.nextList.length, 0);
  assert.equal(result.landingEntryId, "");
  assert.equal(result.landingPos, -1);
});

test("unknown id returns null (no accidental jump)", () => {
  const list = [row("a", 1), row("b", 2)];
  assert.equal(advanceStudyQueueAfterDelete(list, "missing"), null);
});

test("queue exit in difficulty order lands on the former next card", () => {
  const visibleDifficultyQueue = [
    row("easy", 17),
    row("current", 2500),
    row("next", 41),
    row("tail", 53)
  ];
  const rebuiltEligibleRows = [
    row("easy", 17),
    row("next", 41),
    row("tail", 53)
  ];

  const result = advanceStudyQueueAfterExit(
    visibleDifficultyQueue,
    "current",
    rebuiltEligibleRows
  );

  assert.equal(result.landingEntryId, "next");
  assert.equal(result.landingOriginalIndex, 41);
  assert.deepEqual(result.nextList.map((entry) => entry.entry.id), ["easy", "next", "tail"]);
});

test("queue exit skips rows no longer eligible without falling back to raw order", () => {
  const visibleDifficultyQueue = [
    row("easy", 17),
    row("current", 2500),
    row("next-hidden", 41),
    row("tail", 53)
  ];
  const rebuiltEligibleRows = [
    row("easy", 17),
    row("tail", 53)
  ];

  const result = advanceStudyQueueAfterExit(
    visibleDifficultyQueue,
    "current",
    rebuiltEligibleRows
  );

  assert.equal(result.landingEntryId, "tail");
  assert.equal(result.landingOriginalIndex, 53);
  assert.deepEqual(result.nextList.map((entry) => entry.entry.id), ["easy", "tail"]);
});

test("resolveCurrentStudyEntryId prefers focus id in queue", () => {
  const list = [row("a", 10), row("b", 3), row("c", 7)];
  assert.equal(
    resolveCurrentStudyEntryId({
      focusEntryId: "c",
      studyList: list,
      items: [{ id: "x" }, { id: "y" }],
      index: 0
    }),
    "c"
  );
});

test("resolveCurrentStudyEntryId falls back to originalIndex match", () => {
  const list = [row("a", 10), row("b", 3)];
  assert.equal(
    resolveCurrentStudyEntryId({
      focusEntryId: "",
      studyList: list,
      items: [],
      index: 3
    }),
    "b"
  );
});

test("resolveCurrentStudyEntryId never invents queue head when focus is stale", () => {
  const list = [row("a", 10), row("b", 3)];
  assert.equal(
    resolveCurrentStudyEntryId({
      focusEntryId: "deleted-id",
      studyList: list,
      items: [{ id: "x" }],
      index: 0
    }),
    "deleted-id"
  );
});
