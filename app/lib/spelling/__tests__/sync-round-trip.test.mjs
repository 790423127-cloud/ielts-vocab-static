import test from "node:test";
import assert from "node:assert/strict";

import { syncSpellingProgress } from "../sync/cloudbase-sync.mjs";

function createStore(records = []) {
  const map = new Map(records.map((record) => [record.wordId, JSON.parse(JSON.stringify(record))]));

  return {
    putCalls: 0,
    async open() {},
    async getAllRecords() {
      return Array.from(map.values()).map((record) => JSON.parse(JSON.stringify(record)));
    },
    async putRecord(record) {
      this.putCalls += 1;
      map.set(record.wordId, JSON.parse(JSON.stringify(record)));
    },
    values() {
      return Array.from(map.values());
    }
  };
}

function record(wordId, patch = {}) {
  return {
    wordId,
    updatedAt: patch.updatedAt ?? 100,
    revision: patch.revision ?? 1,
    dirty: patch.dirty ?? true,
    today: { repairState: patch.repairState || "normal" },
    errorBank: { everWrong: false, totalWrongCount: 0, latestWrongAt: 0, active: false },
    srs: { stage: patch.stage || 0, nextReviewAt: patch.nextReviewAt || 0, lastReviewedAt: 0 },
    spelling: { totalAttempts: 1, correctAttempts: 1, wrongAttempts: 0 }
  };
}

test("syncSpellingProgress pulls, merges, writes local, pushes merged, and clears dirty flag", async () => {
  const store = createStore([record("alpha", { revision: 1, repairState: "done_today" })]);
  const remoteRecords = [record("alpha", { revision: 2, repairState: "must_repair", stage: 2, nextReviewAt: 2_000 })];
  const pushed = [];
  const client = {
    async pull() {
      return remoteRecords;
    },
    async push(records) {
      pushed.push(...records.map((item) => JSON.parse(JSON.stringify(item))));
    }
  };

  const result = await syncSpellingProgress({ store, client, now: 500 });

  assert.equal(result.pulledCount, 1);
  assert.equal(result.mergedCount, 1);
  assert.equal(store.putCalls, 1);
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].today.repairState, "must_repair");
  assert.equal(pushed[0].dirty, false);
  assert.equal(pushed[0].lastSyncAt, 500);
});
