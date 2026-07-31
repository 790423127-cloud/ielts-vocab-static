"use client";

import { useEffect, useRef, useState } from "react";
import {
  clampWordStudyPosition,
  wordStudyPositionPercent
} from "../lib/vocab/word-study-position.mjs";

export default function WordStudyProgress({
  label = "学习进度",
  title,
  current,
  total,
  percent,
  onPositionCommit = null,
  getPositionPreview = null,
  actions = null
}) {
  const safeCurrent = clampWordStudyPosition(current, total);
  const [draftPosition, setDraftPosition] = useState(null);
  const [seeking, setSeeking] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpValue, setJumpValue] = useState(String(safeCurrent || 1));
  const jumpInputRef = useRef(null);
  const canSeek = typeof onPositionCommit === "function" && Number(total) > 1;
  const displayPosition = draftPosition ?? safeCurrent;
  const safePercent = draftPosition == null
    ? Math.min(100, Math.max(0, Number(percent) || 0))
    : wordStudyPositionPercent(displayPosition, total);
  const percentLabel = safePercent > 0 && safePercent < 1 ? "<1%" : `${Math.round(safePercent)}%`;
  const previewWord = typeof getPositionPreview === "function"
    ? String(getPositionPreview(displayPosition) || "").trim()
    : "";

  useEffect(() => {
    setDraftPosition(null);
    setSeeking(false);
    setJumpValue(String(safeCurrent || 1));
  }, [safeCurrent, total]);

  useEffect(() => {
    if (!jumpOpen) return;
    jumpInputRef.current?.focus();
    jumpInputRef.current?.select();
  }, [jumpOpen]);

  function commitPosition(value) {
    if (!canSeek) return;
    const nextPosition = clampWordStudyPosition(value, total);
    setSeeking(false);
    if (!nextPosition || nextPosition === safeCurrent) {
      setDraftPosition(null);
      return;
    }
    setDraftPosition(nextPosition);
    onPositionCommit(nextPosition);
  }

  function submitJump(event) {
    event.preventDefault();
    const nextPosition = clampWordStudyPosition(jumpValue, total);
    setJumpOpen(false);
    setJumpValue(String(nextPosition || 1));
    commitPosition(nextPosition);
  }

  return (
    <section className="word-study-progress" aria-label="学习进度">
      <div className="word-study-progress__label">
        <span>{label}</span>
        <strong>{title}</strong>
      </div>
      <div
        className={`word-study-progress__track${canSeek ? " is-seekable" : ""}`}
        style={{ "--study-seek-percent": `${safePercent}%` }}
      >
        <span aria-hidden="true" style={{ width: `${safePercent}%` }} />
        {canSeek ? (
          <input
            type="range"
            min="1"
            max={total}
            step="1"
            value={displayPosition || 1}
            aria-label="拖动跳转到词表位置"
            aria-valuetext={`第 ${displayPosition} / ${total} 个词${previewWord ? `：${previewWord}` : ""}`}
            onPointerDown={() => {
              setJumpOpen(false);
              setSeeking(true);
            }}
            onPointerUp={(event) => commitPosition(event.currentTarget.value)}
            onPointerCancel={() => {
              setSeeking(false);
              setDraftPosition(null);
            }}
            onInput={(event) => {
              setSeeking(true);
              setDraftPosition(clampWordStudyPosition(event.currentTarget.value, total));
            }}
            onKeyUp={(event) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
                commitPosition(event.currentTarget.value);
              }
            }}
          />
        ) : null}
      </div>
      <div className="word-study-progress__count">
        <button
          type="button"
          disabled={!canSeek}
          aria-label={`精确跳转位置，当前第 ${safeCurrent} / ${total} 个词`}
          aria-expanded={jumpOpen}
          onClick={() => {
            setJumpValue(String(safeCurrent || 1));
            setJumpOpen((open) => !open);
          }}
        >
          <strong>{displayPosition} / {total}</strong>
        </button>
        {canSeek && seeking ? (
          <output className="word-study-progress__preview" aria-live="polite">
            {previewWord || percentLabel}
          </output>
        ) : (
          <span>{percentLabel}</span>
        )}
      </div>
      {canSeek && jumpOpen ? (
        <form className="word-study-progress__jump" onSubmit={submitJump}>
          <label htmlFor="word-study-position-input">跳转到第</label>
          <input
            ref={jumpInputRef}
            id="word-study-position-input"
            type="number"
            min="1"
            max={total}
            step="1"
            inputMode="numeric"
            value={jumpValue}
            onChange={(event) => setJumpValue(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setJumpOpen(false);
              }
            }}
          />
          <span>/ {total}</span>
          <button type="submit">跳转</button>
          <button type="button" aria-label="取消位置跳转" onClick={() => setJumpOpen(false)}>×</button>
        </form>
      ) : null}
      {actions ? <div className="word-study-progress__actions">{actions}</div> : null}
    </section>
  );
}
