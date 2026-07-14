export default function StableLoadingState({
  mark = "V",
  eyebrow = "IELTS VOCAB",
  title = "正在准备学习内容",
  note = "读取学习资料并恢复上次进度",
  variant = "loading",
  compact = false,
  actionHref = "",
  actionLabel = "返回首页"
}) {
  const isError = variant === "error";
  const className = [
    "system-loading-state",
    compact ? "system-loading-state--compact" : "",
    isError ? "system-loading-state--error" : ""
  ].filter(Boolean).join(" ");

  return (
    <section
      className={className}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      aria-busy={isError ? undefined : "true"}
    >
      <div className="system-loading-state__mark" aria-hidden="true">
        {isError ? "!" : mark}
      </div>
      <p className="system-loading-state__eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="system-loading-state__note">{note}</p>
      {!isError ? (
        <div className="system-loading-state__track" aria-hidden="true">
          <span />
        </div>
      ) : null}
      {isError && actionHref ? (
        <a className="system-loading-state__action" href={actionHref}>{actionLabel}</a>
      ) : null}
    </section>
  );
}
