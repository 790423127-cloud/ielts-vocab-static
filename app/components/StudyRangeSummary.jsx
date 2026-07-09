"use client";

export default function StudyRangeSummary({
  mode = "学习",
  title = "",
  meta = "",
  detail = "",
  actions = null,
  className = ""
}) {
  return (
    <section className={`study-range-summary${className ? ` ${className}` : ""}`} aria-label={`${mode}范围`}>
      <div className="study-range-summary__main">
        <span className="study-range-summary__mode">{mode}</span>
        <strong>{title}</strong>
        {meta ? <span>{meta}</span> : null}
      </div>
      {detail ? <p className="study-range-summary__detail">{detail}</p> : null}
      {actions ? <div className="study-range-summary__actions">{actions}</div> : null}
    </section>
  );
}
