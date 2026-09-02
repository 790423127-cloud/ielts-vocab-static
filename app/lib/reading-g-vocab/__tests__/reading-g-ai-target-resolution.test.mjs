import test from "node:test";
import assert from "node:assert/strict";
import { resolveReadingGAiTargets } from "../ai-target-resolution.mjs";

function entry(word, id, options = {}) {
  return {
    id,
    word,
    entryType: "word",
    studyMode: "active",
    pending: options.pending === true,
    mergedAliases: options.mergedAliases || [],
    mergedEntries: options.mergedEntries || [],
    forms: options.forms || []
  };
}

const isEligible = (item) => item.pending === true;

test("stale merged-form id resolves to the current canonical headword", () => {
  const affair = entry("affair", "rg_word_affair", {
    pending: true,
    mergedAliases: [{ id: "rg_word_affairs", word: "affairs" }]
  });
  const result = resolveReadingGAiTargets(
    { items: [affair] },
    ["rg_word_affairs"],
    { isEligible }
  );

  assert.deepEqual(result.targets.map((item) => item.id), ["rg_word_affair"]);
  assert.deepEqual(result.remapped, [{
    requestedId: "rg_word_affairs",
    targetId: "rg_word_affair",
    word: "affair",
    reason: "merged-alias"
  }]);
  assert.deepEqual(result.skipped, []);
});

test("completed or removed stale ids are skipped without failing the batch", () => {
  const affair = entry("affair", "rg_word_affair", {
    pending: false,
    forms: [{ entryId: "rg_word_affairs", word: "affairs" }]
  });
  const coin = entry("coin", "rg_word_coin", { pending: true });
  const result = resolveReadingGAiTargets(
    { items: [affair, coin] },
    ["rg_word_affairs", "rg_word_removed", "rg_word_coin"],
    { isEligible }
  );

  assert.deepEqual(result.targets.map((item) => item.id), ["rg_word_coin"]);
  assert.deepEqual(result.skipped.map((item) => item.reason), [
    "merged-target-already-complete-or-excluded",
    "missing-from-current-vocabulary"
  ]);
});

test("direct and historic ids cannot schedule the same paid target twice", () => {
  const affair = entry("affair", "rg_word_affair", {
    pending: true,
    mergedEntries: [{ id: "rg_word_affairs", word: "affairs" }]
  });
  const result = resolveReadingGAiTargets(
    { items: [affair] },
    ["rg_word_affairs", "rg_word_affair"],
    { isEligible }
  );

  assert.equal(result.targets.length, 1);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].reason, "duplicate-current-target");
});
