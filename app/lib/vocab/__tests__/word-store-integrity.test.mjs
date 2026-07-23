import test from "node:test";
import assert from "node:assert/strict";
import {
  applyStoredUserState,
  computeWordStoreContentHash,
  computeWordStoreContentHashFromChunks,
  prepareWordStoreSnapshot,
  validateWordCacheChunks
} from "../word-store.mjs";
import { WORD_CACHE_SCHEMA_VERSION } from "../word-cache-meta.mjs";

function words() {
  return [
    { id: "a", word: "alpha", meaning: "甲" },
    { id: "b", word: "beta", meaning: "乙" },
    { id: "c", word: "gamma", meaning: "丙" },
    { id: "d", word: "delta", meaning: "丁" },
    { id: "e", word: "epsilon", meaning: "戊" }
  ];
}

function manifest(list = words(), overrides = {}) {
  return {
    schemaVersion: WORD_CACHE_SCHEMA_VERSION,
    chunks: 3,
    chunkSize: 2,
    count: list.length,
    totalCount: list.length,
    contentHash: computeWordStoreContentHash(list),
    version: "v-test",
    ...overrides
  };
}

function chunks(list = words()) {
  return [
    JSON.stringify(list.slice(0, 2)),
    JSON.stringify(list.slice(2, 4)),
    JSON.stringify(list.slice(4))
  ];
}

test("missing middle chunk rejects the complete content cache", () => {
  const rawChunks = chunks();
  rawChunks[1] = undefined;
  const result = validateWordCacheChunks(manifest(), rawChunks, { a: { status: "known" } });
  assert.equal(result.status, "cache-invalid");
  assert.deepEqual(result.words, []);
  assert.deepEqual(result.userState, { a: { status: "known" } });
});

test("malformed chunk structure rejects the complete content cache", () => {
  const rawChunks = chunks();
  rawChunks[1] = JSON.stringify({ not: "an array" });
  const result = validateWordCacheChunks(manifest(), rawChunks);
  assert.equal(result.status, "cache-invalid");
  assert.match(result.reason, /结构|长度/);
});

test("merged count must equal manifest totalCount", () => {
  const result = validateWordCacheChunks(
    manifest(words(), { count: 6, totalCount: 6 }),
    chunks()
  );
  assert.equal(result.status, "cache-invalid");
  assert.match(result.reason, /数量不一致/);
});

test("unsupported schema returns cache-version-mismatch", () => {
  const result = validateWordCacheChunks(
    manifest(words(), { schemaVersion: WORD_CACHE_SCHEMA_VERSION + 1 }),
    chunks()
  );
  assert.equal(result.status, "cache-version-mismatch");
  assert.deepEqual(result.words, []);
});

test("content hash mismatch rejects the cache", () => {
  const result = validateWordCacheChunks(
    manifest(words(), { contentHash: "wrong-hash" }),
    chunks()
  );
  assert.equal(result.status, "cache-invalid");
  assert.match(result.reason, /contentHash/);
});

test("invalid content preserves the independently stored user state", () => {
  const state = {
    a: { status: "known", favorite: true },
    c: { status: "unknown" }
  };
  const result = validateWordCacheChunks(manifest(), [chunks()[0], null, chunks()[2]], state);
  assert.equal(result.status, "cache-invalid");
  assert.deepEqual(result.userState, state);
});

test("online fallback reapplies preserved user state by stable identity", () => {
  const state = {
    a: { status: "known", favorite: true },
    c: { status: "unknown" }
  };
  const stored = validateWordCacheChunks(manifest(), [chunks()[0], null, chunks()[2]], state);
  const restored = applyStoredUserState(words(), stored);
  assert.equal(restored[0].status, "known");
  assert.equal(restored[0].favorite, true);
  assert.equal(restored[2].status, "unknown");
  assert.equal(restored[1].status, undefined);
});

test("complete cache remains a cache-hit and restores user state", () => {
  const state = { b: { status: "known", reviewCount: 3 } };
  const result = validateWordCacheChunks(manifest(), chunks(), state);
  assert.equal(result.status, "cache-hit");
  assert.equal(result.words.length, words().length);
  assert.equal(result.words[1].status, "known");
  assert.equal(result.words[1].reviewCount, 3);
});

test("cooperative snapshot preparation preserves the full content hash", async () => {
  const list = words().map((entry, index) => ({
    ...entry,
    status: index % 2 ? "known" : "learning"
  }));
  let yields = 0;
  const prepared = await prepareWordStoreSnapshot(list, {
    chunkSize: 2,
    yieldControl: async () => {
      yields += 1;
    }
  });
  const content = list.map(({ status: _status, ...entry }) => entry);

  assert.equal(prepared.serializedChunks.length, 3);
  assert.equal(yields, 2);
  assert.equal(prepared.contentHash, computeWordStoreContentHash(content));
  assert.equal(
    computeWordStoreContentHashFromChunks(prepared.serializedChunks),
    computeWordStoreContentHash(content)
  );
  assert.equal(prepared.userState.a.status, "learning");
  assert.equal(prepared.userState.b.status, "known");
});

test("missing manifest is reported as cache-miss", () => {
  const result = validateWordCacheChunks(null, [], { a: { status: "known" } });
  assert.equal(result.status, "cache-miss");
  assert.deepEqual(result.userState, { a: { status: "known" } });
});
