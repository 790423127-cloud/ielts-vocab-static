import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAiSnapshotRequestBody,
  createLatestSnapshotPublisher,
  publishAiSnapshot
} from "../../../hooks/useHomeLexiconAdmin.js";

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function withMockFetch(mock, callback) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await callback();
  } finally {
    globalThis.fetch = original;
  }
}

function response(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return body;
    }
  };
}

test("server publish starts only after the local save promise resolves", async () => {
  const localSave = deferred();
  const order = [];

  await withMockFetch(async () => response({ ok: true, version: "v1" }), async () => {
    const publishing = publishAiSnapshot({
      persistWordsImmediately() {
        order.push("local-start");
        return localSave.promise.then(() => {
          order.push("local-complete");
          order.push("server");
          return { ok: true, status: "published", localSaved: true, serverPublished: true };
        });
      },
      cacheMetaRef: { current: { version: "v1", lexiconHash: "hash" } }
    }, [{ id: "a", word: "alpha" }]);

    await Promise.resolve();
    assert.deepEqual(order, ["local-start"]);
    localSave.resolve();
    const result = await publishing;
    assert.deepEqual(order, ["local-start", "local-complete", "server"]);
    assert.equal(result.status, "published");
  });
});

test("local save failure prevents the server publish", async () => {
  let fetchCalls = 0;

  await withMockFetch(async () => {
    fetchCalls += 1;
    return response({ ok: true });
  }, async () => {
    await assert.rejects(
      publishAiSnapshot({
        async persistWordsImmediately() {
          const error = new Error("local transaction failed");
          error.status = "local-save-failed";
          throw error;
        }
      }, [{ id: "a", word: "alpha" }]),
      { status: "local-save-failed" }
    );
  });

  assert.equal(fetchCalls, 0);
});

test("server failure reports that local storage already succeeded", async () => {
  await withMockFetch(async () => response({ ok: true }), async () => {
      await assert.rejects(
        publishAiSnapshot({
          async persistWordsImmediately() {
            return {
              ok: false,
              status: "server-publish-failed",
              localSaved: true,
              serverPublished: false,
              serverResult: { detail: "disk unavailable" }
            };
          }
        }, [{ id: "a", word: "alpha" }]),
        {
          code: "SERVER_PUBLISH_FAILED",
          status: "server-publish-failed",
          localSaved: true,
          serverPublished: false
        }
      );
    });
});

test("AI checkpoint request body serializes cooperatively without user state", async () => {
  let yields = 0;
  const body = await buildAiSnapshotRequestBody([
    { id: "a", word: "alpha", meaning: "A", status: "known", favorite: true },
    { id: "b", word: "beta", meaning: "B", status: "learning" }
  ], {
    savedAt: "2026-07-23T00:00:00.000Z",
    source: "paid-ai-checkpoint"
  }, {
    asText: true,
    chunkSize: 1,
    yieldControl: async () => {
      yields += 1;
    }
  });
  const parsed = JSON.parse(body);

  assert.equal(yields, 1);
  assert.equal(parsed.words.length, 2);
  assert.equal(parsed.words[0].status, undefined);
  assert.equal(parsed.words[0].favorite, undefined);
  assert.equal(parsed.savedAt, "2026-07-23T00:00:00.000Z");
  assert.equal(parsed.source, "paid-ai-checkpoint");
});

test("continuous checkpoints keep the running snapshot and only the latest queued snapshot", async () => {
  const firstSave = deferred();
  const scheduled = [];
  const published = [];
  const publisher = createLatestSnapshotPublisher({
    schedule(callback) {
      scheduled.push(callback);
    },
    async publish(snapshot) {
      published.push(snapshot);
      if (snapshot === "first") await firstSave.promise;
    }
  });

  publisher.enqueue("first");
  const draining = scheduled.shift()();
  await Promise.resolve();
  publisher.enqueue("second");
  publisher.enqueue("latest");
  firstSave.resolve();
  await draining;
  await publisher.whenIdle();

  assert.deepEqual(published, ["first", "latest"]);
});
