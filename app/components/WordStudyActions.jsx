"use client";

import { useEffect, useRef } from "react";
import { requestCurrentWordDeletion } from "../lib/vocab/delete-current-word-request.mjs";
import { createStudyHoldStepper } from "../lib/vocab/study-hold-step.mjs";

function StudyHoldStepButton({
  className,
  disabled = false,
  direction,
  onStep,
  title,
  children
}) {
  const onStepRef = useRef(onStep);
  const handledByPointerRef = useRef(false);
  const stepperRef = useRef(null);
  onStepRef.current = onStep;
  if (!stepperRef.current) {
    stepperRef.current = createStudyHoldStepper({
      step() {
        onStepRef.current?.();
      }
    });
  }

  useEffect(() => () => stepperRef.current?.stop(), []);

  return (
    <button
      className={className}
      type="button"
      disabled={disabled}
      title={title}
      onPointerDown={(event) => {
        if (disabled) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        handledByPointerRef.current = true;
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        stepperRef.current.start(direction);
      }}
      onPointerUp={() => stepperRef.current.stop()}
      onPointerCancel={() => stepperRef.current.stop()}
      onLostPointerCapture={() => stepperRef.current.stop()}
      onClick={(event) => {
        if (handledByPointerRef.current) {
          handledByPointerRef.current = false;
          event.preventDefault();
          return;
        }
        if (!disabled) onStepRef.current?.();
      }}
    >
      {children}
    </button>
  );
}

export default function WordStudyActions({
  item,
  isStudyEmpty,
  isExternalIdictationItem,
  prevWord,
  nextWord,
  markStatus,
  tidyReview,
  showDirectionArrows = false
}) {
  if (tidyReview?.active) {
    return (
      <footer className="bottom bottombar tidy-review-actions" aria-label="词库整理操作">
        <StudyHoldStepButton className="study-step-button study-step-button--previous" disabled={isStudyEmpty} direction={-1} onStep={prevWord}>
          上一个
        </StudyHoldStepButton>
        <div className="actions">
          <button className="status known" type="button" disabled={isStudyEmpty} onClick={tidyReview.onKeep}>
            留着
          </button>
          <button className="status uncertain" type="button" disabled={isStudyEmpty} onClick={tidyReview.onLater}>
            以后再看
          </button>
          <button className="status unknown active-unknown" type="button" disabled={isStudyEmpty} onClick={requestCurrentWordDeletion} title="只从雅思主词库删除">
            删除
          </button>
        </div>
        <StudyHoldStepButton className="study-step-button study-step-button--next" disabled={isStudyEmpty} direction={1} onStep={nextWord}>
          下一个
        </StudyHoldStepButton>
      </footer>
    );
  }

  return (
    <footer className="bottom bottombar" aria-label="学习操作" data-effective-study-region>
      <StudyHoldStepButton
        className="study-step-button study-step-button--previous"
        disabled={isStudyEmpty}
        direction={-1}
        onStep={prevWord}
        title={showDirectionArrows ? "上一个（快捷键：←）" : undefined}
      >
        {showDirectionArrows ? "← 上一个" : "上一个"}
      </StudyHoldStepButton>
      <div className="actions">
        <button
          className={`status known${item.status === "熟悉" ? " is-selected" : ""}`}
          disabled={isStudyEmpty}
          onClick={() => markStatus("熟悉")}
          title="快捷键：1"
        >
          {isExternalIdictationItem ? "下一个" : "认识"}
        </button>
        <button
          className={`status uncertain${item.status === "模糊" ? " is-selected" : ""}`}
          disabled={isStudyEmpty}
          onClick={() => markStatus("模糊")}
          title="快捷键：2"
        >
          {isExternalIdictationItem ? "稍后" : "模糊"}
        </button>
        <button
          className={`status unknown${item.status === "不熟" ? " is-selected active-unknown" : ""}`}
          disabled={isStudyEmpty}
          onClick={() => markStatus("不熟")}
          title="快捷键：3"
        >
          {isExternalIdictationItem ? "跳过" : item.status === "不熟" ? "取消不熟" : "不熟"}
        </button>
      </div>
      <StudyHoldStepButton
        className="study-step-button study-step-button--next"
        disabled={isStudyEmpty}
        direction={1}
        onStep={nextWord}
        title={showDirectionArrows ? "下一个（快捷键：→）" : undefined}
      >
        {showDirectionArrows ? "下一个 →" : "下一个"}
      </StudyHoldStepButton>
    </footer>
  );
}
