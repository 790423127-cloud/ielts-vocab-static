import test from "node:test";
import assert from "node:assert/strict";
import { createParaphraseSession, scheduleParaphraseReinsert } from "../paraphrase-session.mjs";

test("wrong and uncertain reinsert 2-5 tasks later and stay under half base session", () => {
  const batch = { sessionIds: Array.from({ length: 10 }, (_, i) => `g${i}`), sessionKinds: Array(10).fill("new"), coverage: {} };
  let session = createParaphraseSession(batch, "guided", 1);
  session = scheduleParaphraseReinsert(session, "g0", "wrong", 2, 2);
  assert.equal(session.currentSessionGroupIds[3], "g0");
  session = scheduleParaphraseReinsert(session, "g1", "uncertain", 4, 3);
  assert.ok(session.currentSessionGroupIds.indexOf("g1", 2) <= 5);
  for (let i = 2; i < 10; i++) session = scheduleParaphraseReinsert(session, `g${i}`, "wrong", 2, 4 + i);
  assert.ok(session.sessionTaskKinds.filter((kind) => kind === "wrong" || kind === "uncertain").length <= 5);
});
