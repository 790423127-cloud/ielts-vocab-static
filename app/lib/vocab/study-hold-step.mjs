export const STUDY_HOLD_STEP_DELAY_MS = 380;
export const STUDY_HOLD_STEP_INTERVAL_MS = 130;

export function isStudyHoldArrowKey(event = {}) {
  const key = String(event.key || "");
  const code = String(event.code || "");
  return key === "ArrowLeft" || key === "ArrowRight" || code === "ArrowLeft" || code === "ArrowRight";
}

/**
 * Hold-to-flip for study cards. First press steps immediately; after a short
 * delay the same direction keeps stepping at a fixed pace until stop().
 */
export function createStudyHoldStepper({
  step,
  delayMs = STUDY_HOLD_STEP_DELAY_MS,
  intervalMs = STUDY_HOLD_STEP_INTERVAL_MS,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval
} = {}) {
  let dir = 0;
  let delayTimer = 0;
  let intervalTimer = 0;

  function stop() {
    dir = 0;
    if (delayTimer) {
      clearTimeoutFn(delayTimer);
      delayTimer = 0;
    }
    if (intervalTimer) {
      clearIntervalFn(intervalTimer);
      intervalTimer = 0;
    }
  }

  function start(nextDir) {
    const resolved = Number(nextDir);
    if (!resolved || typeof step !== "function") return;
    if (dir === resolved && intervalTimer) return;
    stop();
    dir = resolved;
    step(resolved);
    delayTimer = setTimeoutFn(() => {
      if (dir !== resolved) return;
      intervalTimer = setIntervalFn(() => {
        if (dir !== resolved) {
          stop();
          return;
        }
        step(resolved);
      }, intervalMs);
    }, delayMs);
  }

  return { start, stop };
}
