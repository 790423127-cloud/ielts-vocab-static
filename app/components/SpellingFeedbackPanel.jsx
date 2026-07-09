import styles from "./SpellingFeedbackPanel.module.css";

export default function SpellingFeedbackPanel({
  diagnosis,
  expectedAnswer = ""
}) {
  if (!diagnosis || diagnosis.isCorrect) return null;

  const correctText = String(diagnosis.expectedAnswer || expectedAnswer || "").trim() || "—";
  const submittedText = String(diagnosis.submittedAnswer || "").trim() || "（空）";
  const errorText = String(diagnosis.summary || "拼写不匹配").trim();

  return (
    <section
      className={styles.spellingFeedbackPanel}
      data-testid="spelling-feedback-panel"
      aria-label="拼写错误分析"
      aria-live="polite"
    >
      <div className={styles.feedbackRow}>
        <div className={styles.feedbackLabel}>正确答案</div>
        <div className={styles.feedbackValueCorrect}>{correctText}</div>
      </div>
      <div className={styles.feedbackRow}>
        <div className={styles.feedbackLabel}>你的输入</div>
        <div className={styles.feedbackValueWrong}>{submittedText}</div>
      </div>
      <div className={styles.feedbackRow}>
        <div className={styles.feedbackLabel}>错误类型</div>
        <div className={styles.feedbackValueError}>{errorText}</div>
      </div>
    </section>
  );
}
