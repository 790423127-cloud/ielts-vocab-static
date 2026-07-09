import test from "node:test";
import assert from "node:assert/strict";

import schema from "../events/spelling-events.schema.js";

const {
  SPELLING_EVENT_TYPES,
  SPELLING_EVENT_SCHEMA_VERSION,
  createSpellingEventDraft,
  validateSpellingEventDraft
} = schema;

test("spelling event schema defines all reserved event types without executing runtime logic", () => {
  assert.equal(SPELLING_EVENT_SCHEMA_VERSION, 1);
  assert.deepEqual(SPELLING_EVENT_TYPES, [
    "spell_wrong",
    "spell_correct",
    "repair_start",
    "repair_complete",
    "srs_schedule",
    "word_graduated"
  ]);
});

test("event schema validates future event drafts", () => {
  const event = createSpellingEventDraft({
    type: "spell_wrong",
    wordId: "alpha",
    deviceId: "device-a",
    payload: { answer: "alhpa" },
    timestamp: 100
  });

  assert.equal(validateSpellingEventDraft(event).valid, true);
  assert.equal(validateSpellingEventDraft({ ...event, type: "unknown" }).valid, false);
});
