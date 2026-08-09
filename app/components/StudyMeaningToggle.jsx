"use client";

import { Eye, EyeOff } from "lucide-react";
import { useStudyMeaningVisibility } from "../hooks/useStudyMeaningVisibility.js";

export default function StudyMeaningToggle({
  className = "top-pill",
  compact = false
}) {
  const { hidden, toggle } = useStudyMeaningVisibility();

  return (
    <button
      type="button"
      className={className}
      data-state={hidden ? "hidden" : "visible"}
      onClick={toggle}
      title={hidden ? "显示当前学习内容的释义和提示" : "只看单词，隐藏释义和提示"}
      data-testid="study-meaning-toggle"
    >
      {hidden ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
      {compact ? (hidden ? "显示" : "隐藏") : (hidden ? "显示释义" : "隐藏释义")}
    </button>
  );
}
