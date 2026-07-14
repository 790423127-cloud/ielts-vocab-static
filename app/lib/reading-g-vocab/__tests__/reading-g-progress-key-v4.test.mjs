import test from "node:test";
import assert from "node:assert/strict";
import { getEntryProgressKey } from "../storage.mjs";
import { buildItemKeyIndex, remapStatusToStableKeys } from "../migration.mjs";

const items = [
  { id: "rg_word_issue", word: "issue", entryType: "word", normalizedKey: "issue" },
  {
    id: "rg_phrase_in_advance",
    word: "in advance",
    entryType: "phrase",
    normalizedKey: "in advance"
  },
  // ambiguous surface: also a word "advance"
  { id: "rg_word_advance", word: "advance", entryType: "word", normalizedKey: "advance" }
];

test("stable key prefers id", () => {
  assert.equal(getEntryProgressKey(items[0]), "rg_word_issue");
  assert.equal(
    getEntryProgressKey({ entryType: "word", word: "hello", normalizedKey: "hello" }),
    "word::hello"
  );
});

test("remap migrates id and entryType::key", () => {
  const raw = {
    rg_word_issue: { status: "熟悉" },
    "phrase::in advance": { status: "不熟" }
  };
  const r = remapStatusToStableKeys(raw, items);
  assert.equal(r.entries.rg_word_issue.meaningStatus, "familiar");
  assert.equal(r.entries.rg_phrase_in_advance.meaningStatus, "unfamiliar");
  assert.ok(r.matchedCount >= 2);
});

test("ambiguous normalize(word) does not dual-migrate", () => {
  // invent conflict: two items share normalized key "set"
  const conflictItems = [
    { id: "rg_word_set", word: "set", entryType: "word", normalizedKey: "set" },
    { id: "rg_phrase_set", word: "set", entryType: "phrase", normalizedKey: "set" }
  ];
  const raw = { set: { status: "熟悉" } };
  const r = remapStatusToStableKeys(raw, conflictItems);
  assert.equal(r.ambiguousCount, 1);
  assert.equal(Object.keys(r.entries).length, 0);
});

test("buildItemKeyIndex merge keys", () => {
  const idx = buildItemKeyIndex(items);
  assert.equal(idx.byMerge.get("phrase::in advance").id, "rg_phrase_in_advance");
  assert.equal(idx.byId.get("rg_word_issue").id, "rg_word_issue");
});
