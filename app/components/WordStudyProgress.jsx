"use client";

export default function WordStudyProgress({
  label = "学习进度",
  title,
  current,
  total,
  percent,
  actions = null
}) {
  const safePercent = Math.min(100, Math.max(0, Number(percent) || 0));
  const percentLabel = safePercent > 0 && safePercent < 1 ? "<1%" : `${Math.round(safePercent)}%`;

  return (
    <section className="word-study-progress" aria-label="学习进度">
      <div className="word-study-progress__label">
        <span>{label}</span>
        <strong>{title}</strong>
      </div>
      <div className="word-study-progress__track" aria-hidden="true">
        <span style={{ width: `${safePercent}%` }} />
      </div>
      <div className="word-study-progress__count">
        <strong>{current} / {total}</strong>
        <span>{percentLabel}</span>
      </div>
      {actions ? <div className="word-study-progress__actions">{actions}</div> : null}
    </section>
  );
}
