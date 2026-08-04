"use client";

import {
  WORD_STUDY_ORDER_MODE,
  WORD_STUDY_ORDER_MODES
} from "../lib/vocab/word-study-ordering.mjs";
import {
  WORD_STUDY_DIFFICULTY_MODE,
  listWordStudyDifficultyModeOptions
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
  difficultyEnabled = true,
  difficultyProfile = null
}) {
  const random = mode === WORD_STUDY_ORDER_MODE.RANDOM;
  const difficultyDisabled = !difficultyEnabled || !difficultyAvailable;
  const difficultyOptions = listWordStudyDifficultyModeOptions(
    difficultyAvailable ? difficultyProfile : null
  );

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
          aria-label="入口内部相对难度"
          title={
            difficultyDisabled
              ? "当前词量太少或分数区分不够，暂无法划分相对难度"
              : random
                ? "随机会在当前难度档内部洗牌（例如只刷较难里随机）"
                : "按当前入口内的相对较易 / 常规 / 较难划分，不是官方难度标签"
          }
          disabled={difficultyDisabled}
        >
          {difficultyOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
