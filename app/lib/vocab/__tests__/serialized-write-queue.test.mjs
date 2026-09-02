import test from "node:test";
import assert from "node:assert/strict";
import { createSerializedWriteQueue } from "../serialized-write-queue.mjs";

test("serialized write queue waits for an earlier main-lexicon write", async () => {
  const queue = createSerializedWriteQueue();
  const order = [];
  let finishFirst;
  const first = queue.enqueue(() => new Promise((resolve) => {
    order.push("first-start");
    finishFirst = () => {
      order.push("first-finish");
      resolve();
    };
  }));
  const second = queue.enqueue(async () => {
    order.push("second-start");
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, ["first-start"]);
  finishFirst();
  await Promise.all([first, second]);
  assert.deepEqual(order, ["first-start", "first-finish", "second-start"]);
});
