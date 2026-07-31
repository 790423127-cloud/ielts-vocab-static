"use client";

import {
  WORD_STUDY_ORDER_MODE,
  WORD_STUDY_ORDER_MODES
} from "../lib/vocab/word-study-ordering.mjs";
import {
  WORD_STUDY_DIFFICULTY_MODE,
  WORD_STUDY_DIFFICULTY_MODES
} from "../lib/vocab/word-internal-difficulty.mjs";

function completeSelectAction(control) {
  if (!control) return;
  control.blur();
  window.requestAnimationFrame(() => {
    if (document.activeElement === control) control.blur();
  });
}

export default function WordStudyOrderControls({
  mode,
  difficultyMode = WORD_STUDY_DIFFICULTY_MODE.DEFAULT,
  onModeChange,
  onDifficultyModeChange,
  difficultyAvailable = true,
  difficultyEnabled = true
}) {
  const random = mode === WORD_STUDY_ORDER_MODE.RANDOM;
  const difficultyDisabled = !difficultyEnabled || !difficultyAvailable || random;

  return (
    <div className="word-order-controls" aria-label="刷词排列方式">
      <select
        className="top-pill word-order-select"
        value={mode}
        onChange={(event) => {
          const nextMode = event.currentTarget.value;
          const control = event.currentTarget;
          onModeChange?.(nextMode);
          completeSelectAction(control);
        }}
        aria-label="排列关系"
        title="现有、随机、词族和场景关联排列"
      >
        {WORD_STUDY_ORDER_MODES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {difficultyEnabled ? (
        <select
          className={`top-pill word-difficulty-select${
            difficultyMode !== WORD_STUDY_DIFFICULTY_MODE.DEFAULT ? " is-active" : ""
          }`}
          value={difficultyMode}
          onChange={(event) => {
            const nextMode = event.currentTarget.value;
            const control = event.currentTarget;
            onDifficultyModeChange?.(nextMode);
            completeSelectAction(control);
          }}
          aria-label="入口内部难度"
          title={random
            ? "随机模式本轮暂时忽略难度；退出随机后恢复当前难度设置"
            : "只在当前词汇入口内部划分相对较易、常规和相对较难"}
          disabled={difficultyDisabled}
        >
          {WORD_STUDY_DIFFICULTY_MODES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
