export const SPELLING_EVENT_SCHEMA_VERSION = 1;

export const SPELLING_EVENT_TYPES = [
  "spell_wrong",
  "spell_correct",
  "repair_start",
  "repair_complete",
  "srs_schedule",
  "word_graduated"
];

export const SPELLING_EVENT_SCHEMA = {
  version: SPELLING_EVENT_SCHEMA_VERSION,
  required: ["type", "wordId", "deviceId", "timestamp", "payload"],
  properties: {
    type: { enum: SPELLING_EVENT_TYPES },
    wordId: { type: "string" },
    deviceId: { type: "string" },
    timestamp: { type: "number" },
    payload: { type: "object" },
    syncKey: { type: "string" },
    sessionDate: { type: "string" },
    schemaVersion: { type: "number" }
  },
  runtimeEnabled: false
};

export function createSpellingEventDraft(options = {}) {
  return {
    schemaVersion: SPELLING_EVENT_SCHEMA_VERSION,
    type: options.type || "",
    wordId: options.wordId || "",
    deviceId: options.deviceId || "",
    timestamp: Number(options.timestamp || Date.now()),
    payload: options.payload || {},
    syncKey: options.syncKey || "",
    sessionDate: options.sessionDate || ""
  };
}

export function validateSpellingEventDraft(event = {}) {
  const errors = [];

  if (!SPELLING_EVENT_TYPES.includes(event.type)) errors.push("invalid_type");
  if (!event.wordId) errors.push("missing_wordId");
  if (!event.deviceId) errors.push("missing_deviceId");
  if (!Number.isFinite(Number(event.timestamp))) errors.push("invalid_timestamp");
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) errors.push("invalid_payload");

  return {
    valid: errors.length === 0,
    errors
  };
}

export default {
  SPELLING_EVENT_SCHEMA_VERSION,
  SPELLING_EVENT_TYPES,
  SPELLING_EVENT_SCHEMA,
  createSpellingEventDraft,
  validateSpellingEventDraft
};
