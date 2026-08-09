"use client";

/**
 * The single structural shell for every word-study surface.
 * Controllers keep their own data, filters, storage and actions; this component
 * owns the global two-column layout so the visual structure cannot drift.
 */
export default function WordStudyWorkspace({
  showInsight = true,
  children,
  overview = null,
  className = "",
  studyColumnClassName = ""
}) {
  return (
    <div className={`word-flash-shell${showInsight ? "" : " is-insight-collapsed"}${className ? ` ${className}` : ""}`}>
      <div className="word-study-layout">
        <section
          className={`word-study-column${studyColumnClassName ? ` ${studyColumnClassName}` : ""}`}
          aria-label="单词学习区"
        >
          {children}
        </section>
        {showInsight ? overview : null}
      </div>
    </div>
  );
}
