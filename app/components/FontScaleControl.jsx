"use client";

import { useEffect, useState } from "react";
import {
  FONT_SCALE_CHANGE_EVENT,
  FONT_SCALE_DEFAULT,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
  formatFontScaleLabel,
  readStoredFontScale,
  writeStoredFontScale
} from "../lib/ui/font-scale.mjs";

export default function FontScaleControl({ className = "" }) {
  const [scale, setScale] = useState(FONT_SCALE_DEFAULT);

  useEffect(() => {
    setScale(readStoredFontScale());

    function handleChange(event) {
      const next = event?.detail?.scale;
      if (typeof next === "number") setScale(next);
      else setScale(readStoredFontScale());
    }

    window.addEventListener(FONT_SCALE_CHANGE_EVENT, handleChange);
    return () => window.removeEventListener(FONT_SCALE_CHANGE_EVENT, handleChange);
  }, []);

  function adjust(delta) {
    setScale(writeStoredFontScale(scale + delta));
  }

  function reset() {
    setScale(writeStoredFontScale(FONT_SCALE_DEFAULT));
  }

  const atMin = scale <= FONT_SCALE_MIN + 0.001;
  const atMax = scale >= FONT_SCALE_MAX - 0.001;
  const atDefault = Math.abs(scale - FONT_SCALE_DEFAULT) < 0.001;

  return (
    <div
      className={`font-scale-control${className ? ` ${className}` : ""}`}
      role="group"
      aria-label="全站字号"
      title="仅放大文字，按钮和布局尺寸不变；全页面同步，刷新后仍保留"
    >
      <span className="font-scale-control__label">仅字号</span>
      <button
        type="button"
        className="font-scale-control__btn"
        aria-label="减小字号"
        disabled={atMin}
        onClick={() => adjust(-FONT_SCALE_STEP)}
      >
        A−
      </button>
      <button
        type="button"
        className="font-scale-control__value"
        aria-label={`当前字号 ${formatFontScaleLabel(scale)}，点击恢复默认`}
        onClick={reset}
        title={atDefault ? "已是默认字号" : "点击恢复默认 100%"}
      >
        {formatFontScaleLabel(scale)}
      </button>
      <button
        type="button"
        className="font-scale-control__btn"
        aria-label="增大字号"
        disabled={atMax}
        onClick={() => adjust(FONT_SCALE_STEP)}
      >
        A+
      </button>
    </div>
  );
}