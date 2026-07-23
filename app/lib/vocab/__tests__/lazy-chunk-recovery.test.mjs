import test from "node:test";
import assert from "node:assert/strict";
import {
  isStaleChunkError,
  recoverFromStaleChunk
} from "../lazy-chunk-recovery.mjs";

function createWindowMock(href = "http://localhost:3000/?openAiTools=1") {
  const values = new Map();
  const replacements = [];
  return {
    replacements,
    location: {
      href,
      replace(url) {
        replacements.push(url);
      }
    },
    sessionStorage: {
      getItem(key) {
        return values.get(key) ?? null;
      },
      setItem(key, value) {
        values.set(key, value);
      }
    }
  };
}

test("stale chunk detection is limited to dynamic frontend asset failures", () => {
  assert.equal(isStaleChunkError(new Error(
    "Loading chunk 174 failed. (error: http://localhost:3000/_next/static/chunks/174.js)"
  )), true);
  assert.equal(isStaleChunkError(Object.assign(new Error("load failed"), {
    name: "ChunkLoadError"
  })), true);
  assert.equal(isStaleChunkError(new Error("DeepSeek HTTP 503")), false);
});

test("stale chunk recovery refreshes once with a cache-busting query", () => {
  const windowObject = createWindowMock();
  const result = recoverFromStaleChunk(new Error(
    "Loading chunk 174 failed. (error: http://localhost:3000/_next/static/chunks/174.js)"
  ), {
    windowObject,
    now: 123456,
    cooldownMs: 30_000
  });

  assert.deepEqual(result, { stale: true, reloading: true });
  assert.equal(windowObject.replacements.length, 1);
  const replacement = new URL(windowObject.replacements[0]);
  assert.equal(replacement.searchParams.get("openAiTools"), "1");
  assert.equal(replacement.searchParams.get("_app_refresh"), "123456");
});

test("stale chunk recovery prevents a rapid reload loop", () => {
  const windowObject = createWindowMock();
  const error = Object.assign(new Error("load failed"), { name: "ChunkLoadError" });

  recoverFromStaleChunk(error, { windowObject, now: 100_000 });
  const second = recoverFromStaleChunk(error, { windowObject, now: 105_000 });

  assert.deepEqual(second, { stale: true, reloading: false });
  assert.equal(windowObject.replacements.length, 1);
});
