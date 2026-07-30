import test from "node:test";
import assert from "node:assert/strict";

import {
  ensureSpellingStoreIndexes,
  SpellingIndexedDbStore,
  withSpellingSyncMetadata
} from "../indexeddb-store.mjs";

test("withSpellingSyncMetadata adds deviceId, version, lastSyncAt, and dirty without breaking existing records", () => {
  const record = {
    wordId: "alpha",
    updatedAt: 100,
    revision: 2,
    spelling: {},
    today: {},
    errorBank: {},
    srs: {}
  };

  const next = withSpellingSyncMetadata(record, {
    deviceId: "device-a",
    now: 200,
    dirty: true
  });

  assert.equal(next.wordId, "alpha");
  assert.equal(next.deviceId, "device-a");
  assert.equal(next.version, 1);
  assert.equal(next.lastSyncAt, 0);
  assert.equal(next.dirty, true);
  assert.equal(record.deviceId, undefined);
});

test("ensureSpellingStoreIndexes is idempotent for SRS stores", () => {
  const indexNames = new Set();
  const created = [];
  const store = {
    indexNames: {
      contains(name) {
        return indexNames.has(name);
      }
    },
    createIndex(name, keyPath, options) {
      indexNames.add(name);
      created.push({ name, keyPath, options });
    }
  };

  ensureSpellingStoreIndexes(store, "word-srs");
  ensureSpellingStoreIndexes(store, "word-srs");

  assert.deepEqual(created, [{
    name: "nextReviewAt",
    keyPath: "nextReviewAt",
    options: { unique: false }
  }]);
});

test("getDueSrsReviews uses the nextReviewAt index range", async () => {
  let capturedRange = null;
  const dueRecords = [
    { wordId: "alpha", nextReviewAt: 100 },
    { wordId: "beta", nextReviewAt: 200 }
  ];
  const createRequest = (result) => {
    const request = {};
    queueMicrotask(() => {
      request.result = result;
      request.onsuccess?.();
    });
    return request;
  };
  const objectStore = {
    indexNames: {
      contains(name) {
        return name === "nextReviewAt";
      }
    },
    index(name) {
      assert.equal(name, "nextReviewAt");
      return {
        getAll(range) {
          capturedRange = range;
          return createRequest(dueRecords);
        }
      };
    },
    getAll() {
      throw new Error("full-store scan should not run");
    }
  };
  const db = {
    transaction() {
      return {
        objectStore() {
          return objectStore;
        }
      };
    }
  };
  const keyRange = {
    bound(lower, upper, lowerOpen, upperOpen) {
      return { lower, upper, lowerOpen, upperOpen };
    }
  };
  const store = new SpellingIndexedDbStore({
    indexedDB: {},
    IDBKeyRange: keyRange
  });
  store.open = async () => db;

  const result = await store.getDueSrsReviews(250);

  assert.deepEqual(result, dueRecords);
  assert.deepEqual(capturedRange, {
    lower: 0,
    upper: 250,
    lowerOpen: true,
    upperOpen: false
  });
});

test("putRecords writes progress and derived queues in one transaction", async () => {
  const writes = new Map();
  const deletes = new Map();
  let transactionCount = 0;
  let transactionMode = "";
  let transactionStores = [];

  const db = {
    transaction(storeNames, mode) {
      transactionCount += 1;
      transactionMode = mode;
      transactionStores = storeNames;
      const transaction = {
        objectStore(storeName) {
          return {
            put(value) {
              const items = writes.get(storeName) || [];
              items.push(value);
              writes.set(storeName, items);
            },
            delete(wordId) {
              const ids = deletes.get(storeName) || [];
              ids.push(wordId);
              deletes.set(storeName, ids);
            }
          };
        }
      };
      queueMicrotask(() => transaction.oncomplete?.());
      return transaction;
    }
  };
  const store = new SpellingIndexedDbStore({
    indexedDB: {},
    deviceId: "device-b",
    scope: "word"
  });
  store.open = async () => db;

  const records = [
    {
      wordId: "alpha",
      updatedAt: 100,
      revision: 2,
      spelling: {},
      today: {
        repairState: "in_repair",
        sessionDate: "2026-06-18",
        nextEligibleAt: 200,
        minOtherWordsBeforeNext: 2,
        lastSeenSequence: 1
      },
      errorBank: { everWrong: true, active: true },
      srs: { stage: 1, nextReviewAt: 300, lastReviewedAt: 150 }
    },
    {
      wordId: "beta",
      updatedAt: 110,
      revision: 1,
      spelling: {},
      today: { repairState: "mastered" },
      errorBank: { everWrong: false },
      srs: { stage: 0, nextReviewAt: 0, lastReviewedAt: 0 }
    }
  ];

  const persisted = await store.putRecords(records);

  assert.equal(transactionCount, 1);
  assert.equal(transactionMode, "readwrite");
  assert.deepEqual(transactionStores, Object.values(store.stores));
  assert.equal(writes.get(store.stores.spellingProgress).length, 2);
  assert.equal(writes.get(store.stores.errorBank).length, 1);
  assert.equal(writes.get(store.stores.todayRepairQueue).length, 1);
  assert.equal(writes.get(store.stores.srsReviewQueue).length, 1);
  assert.deepEqual(deletes.get(store.stores.errorBank), ["beta"]);
  assert.deepEqual(deletes.get(store.stores.todayRepairQueue), ["beta"]);
  assert.deepEqual(deletes.get(store.stores.srsReviewQueue), ["beta"]);
  assert.equal(persisted[0].deviceId, "device-b");
  assert.equal(persisted[1].deviceId, "device-b");
});
