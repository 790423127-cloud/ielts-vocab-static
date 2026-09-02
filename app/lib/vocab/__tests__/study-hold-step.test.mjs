import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  STUDY_HOLD_STEP_DELAY_MS,
  STUDY_HOLD_STEP_INTERVAL_MS,
  createStudyHoldStepper,
  isStudyHoldArrowKey
} from "../study-hold-step.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function createFakeTimers() {
  const timeouts = [];
  const intervals = [];
  let nextId = 1;
  return {
    timeouts,
    intervals,
    setTimeoutFn(fn, ms) {
      const id = nextId++;
      timeouts.push({ id, fn, ms, cleared: false });
      return id;
    },
    clearTimeoutFn(id) {
      const timer = timeouts.find((entry) => entry.id === id);
      if (timer) timer.cleared = true;
    },
    setIntervalFn(fn, ms) {
      const id = nextId++;
      intervals.push({ id, fn, ms, cleared: false });
      return id;
    },
    clearIntervalFn(id) {
      const timer = intervals.find((entry) => entry.id === id);
      if (timer) timer.cleared = true;
    }
  };
}

test("hold stepper steps once immediately, then repeats after the shared delay", () => {
  const steps = [];
  const timers = createFakeTimers();
  const stepper = createStudyHoldStepper({
    step: (dir) => steps.push(dir),
    ...timers
  });

  stepper.start(1);
  assert.deepEqual(steps, [1]);
  assert.equal(timers.timeouts[0].ms, STUDY_HOLD_STEP_DELAY_MS);
  assert.equal(timers.intervals.length, 0);

  timers.timeouts[0].fn();
  assert.equal(timers.intervals[0].ms, STUDY_HOLD_STEP_INTERVAL_MS);
  timers.intervals[0].fn();
  timers.intervals[0].fn();
  assert.deepEqual(steps, [1, 1, 1]);

  stepper.stop();
  assert.equal(timers.timeouts[0].cleared, true);
  assert.equal(timers.intervals[0].cleared, true);
});

test("a second start in the same direction is ignored once the interval is running", () => {
  const steps = [];
  const timers = createFakeTimers();
  const stepper = createStudyHoldStepper({
    step: (dir) => steps.push(dir),
    ...timers
  });

  stepper.start(-1);
  timers.timeouts[0].fn();
  stepper.start(-1);
  assert.deepEqual(steps, [-1]);
  assert.equal(timers.timeouts.length, 1);
});

test("arrow-key detection covers both key and code", () => {
  assert.equal(isStudyHoldArrowKey({ key: "ArrowLeft" }), true);
  assert.equal(isStudyHoldArrowKey({ code: "ArrowRight" }), true);
  assert.equal(isStudyHoldArrowKey({ key: "Tab" }), false);
});

test("reading words surfaces wire hold-to-flip for left and right arrows", () => {
  const page = fs.readFileSync(path.join(root, "app/reading-words/page.jsx"), "utf8");
  const staticSource = fs.readFileSync(path.join(root, "public/assets/reading-words.js"), "utf8");
  assert.match(page, /createStudyHoldStepper/);
  assert.match(page, /isStudyHoldArrowKey/);
  assert.match(page, /addEventListener\("keyup"/);
  assert.match(staticSource, /function startHoldStep/);
  assert.match(staticSource, /addEventListener\("keyup"/);
  assert.match(staticSource, /startHoldStep\(-1\)/);
  assert.match(staticSource, /startHoldStep\(1\)/);
  assert.match(staticSource, /bindHoldButton/);
  const actions = fs.readFileSync(path.join(root, "app/components/WordStudyActions.jsx"), "utf8");
  assert.match(actions, /StudyHoldStepButton/);
  assert.match(actions, /onPointerDown/);
});
