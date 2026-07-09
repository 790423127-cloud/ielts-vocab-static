import test from "node:test";
import assert from "node:assert/strict";
import {
  createStudyRestoreController,
  effectiveStudyIndex,
  releaseStudyPersistBlock,
  shouldBlockStudyIndexPersist,
  shouldRunFullStudyRestore
} from "../study-session.mjs";

test("shouldBlockStudyIndexPersist blocks stale index before restore applies", () => {
  const controller = createStudyRestoreController();
  controller.restored = true;
  controller.persistBlocked = true;
  controller.restoreTargetIndex = 500;

  assert.equal(shouldBlockStudyIndexPersist(controller, 0), true);
  assert.equal(shouldBlockStudyIndexPersist(controller, 500), false);
});

test("effectiveStudyIndex uses restore target while React index is stale", () => {
  const controller = createStudyRestoreController();
  controller.persistBlocked = true;
  controller.restoreTargetIndex = 500;

  assert.equal(effectiveStudyIndex(controller, 0), 500);
  assert.equal(effectiveStudyIndex(controller, 500), 500);
});

test("releaseStudyPersistBlock clears gate after restored index is applied", () => {
  const controller = createStudyRestoreController();
  controller.restored = true;
  controller.persistBlocked = true;
  controller.restoreTargetIndex = 500;
  controller.settling = true;

  assert.equal(releaseStudyPersistBlock(controller, 0), false);
  assert.equal(releaseStudyPersistBlock(controller, 500), true);
  assert.equal(controller.persistBlocked, false);
  assert.equal(controller.restoreTargetIndex, null);
  assert.equal(controller.settling, false);
});

test("shouldRunFullStudyRestore is one-shot per page load", () => {
  const controller = createStudyRestoreController();
  assert.equal(shouldRunFullStudyRestore(controller), true);
  controller.restored = true;
  assert.equal(shouldRunFullStudyRestore(controller), false);
});