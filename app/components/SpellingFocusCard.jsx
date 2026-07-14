"use client";

import SpellingFeedbackPanel from "./SpellingFeedbackPanel.jsx";
import StableLoadingState from "./StableLoadingState.jsx";
import layoutStyles from "./SpellingTrainingLayout.module.css";

export default function SpellingFocusCard({
  isSpellingLoading,
  isBatchComplete,
  current,
  batchSuccessRate,
  completedCount,
  batchWrongWordCount,
  dailyStats,
  formatActiveLearningTime,
  handleNextRound,
  nextRoundTarget,
  spelling,
  listenOnlyMode,
  prompt,
  showExample,
  exampleLine,
  trainingControls,
  handleInputChange,
  submit,
  handleSkip,
  isPhrase,
  errorAnalysisVisible,
  showEnginePreparing,
  showMeaning,
  speech,
  handleReplay,
  practiceSource,
  personalWrongSummary,
  scope,
  errorBank,
  srsReview,
  scopeConfig,
  debugDetails,
  personalWrongUnitProgress,
  currentPosition,
  progressBarPercent,
  sessionTotal,
  canBrowseBatchWords,
  isWordNavBlocked,
  handleGoToPreviousWord,
  handleGoToNextWord,
  autoNextOnCorrect,
  undoLastSpellingAction,
  actionNotice
}) {
  return (
<section className="spelling-focus-card" aria-label="拼写训练主体">
  {isSpellingLoading ? (
    <div className="spelling-empty-state spelling-empty-state--hero">
      <StableLoadingState
        mark="S"
        eyebrow="拼写训练"
        title="正在准备本轮训练"
        note="读取所选词库并恢复批次位置"
        compact
      />
    </div>
  ) : isBatchComplete && !current ? (
    <section className="spelling-completion-summary" aria-label="本批次学习结果">
      <p className="spelling-completion-summary__eyebrow">本批次已完成</p>
      <div className="spelling-completion-summary__rate">
        <strong>{batchSuccessRate}%</strong>
        <span>成功率</span>
      </div>
      <dl className="spelling-completion-summary__metrics">
        <div><dt>完成单词</dt><dd>{completedCount}</dd></div>
        <div><dt>本批错词</dt><dd>{batchWrongWordCount}</dd></div>
        <div><dt>今日学习</dt><dd>{dailyStats.learnedWordIds.length}</dd></div>
        <div><dt>有效学习</dt><dd>{formatActiveLearningTime(dailyStats.activeMs)}</dd></div>
        <div><dt>今日错词</dt><dd>{dailyStats.wrongWordIds.length}</dd></div>
      </dl>
      <button
        type="button"
        className="spelling-next-round-button"
        onClick={handleNextRound}
        disabled={!nextRoundTarget}
      >
        {nextRoundTarget ? "进入下一轮" : "今日范围已全部完成"}
      </button>
    </section>
  ) : current ? (
    <div className={`spelling-focus-stack${spelling.uiState === "correct_feedback" ? " is-correct-settling" : ""}`}>
      <section className={layoutStyles.spellingContentColumn} data-testid="spelling-content-column">
      {listenOnlyMode ? (
        <div className="spelling-listen-only-banner">纯听写模式：请根据发音拼写</div>
      ) : null}

      {!listenOnlyMode && (prompt.example || prompt.examplePendingReview) ? (
        prompt.examplePendingReview ? (
          <p className="spelling-example-collapsed spelling-example-collapsed--hero">例句待补充</p>
        ) : showExample && exampleLine ? (
          <div className={`spelling-example-panel spelling-example-panel--direct is-open ${layoutStyles.spellingWordTitle}`}>
            <p className="spelling-example spelling-example--direct">{exampleLine}</p>
            {prompt.exampleCn ? <p className="spelling-example-cn spelling-example-cn--direct">{prompt.exampleCn}</p> : null}
          </div>
        ) : (
          <p className="spelling-example-collapsed spelling-example-collapsed--hero">
            例句（按 3 或 Space 展开并播放）
          </p>
        )
      ) : null}

      <div className={layoutStyles.spellingInputArea}>
      <form onSubmit={submit} className="spelling-page-form spelling-page-form--hero spelling-page-form--line">
        <input
          ref={trainingControls.inputRef}
          data-testid="spelling-input"
          className={`spelling-line-input${spelling.uiState === "correct_feedback" ? " spelling-line-input--correct" : ""}`}
          value={spelling.inputValue}
          onChange={handleInputChange}
          onKeyDown={trainingControls.handleInputKeyDown}
          onBlur={trainingControls.handleInputBlur}
          readOnly={spelling.uiState === "correct_feedback" || spelling.uiState === "inputting"}
          disabled={!current}
          placeholder={
            listenOnlyMode
              ? "根据发音输入拼写"
              : spelling.uiState === "wrong_feedback"
                ? "请重新输入"
                : spelling.uiState === "correct_feedback"
                  ? ""
                  : isPhrase
                    ? "输入完整词组"
                    : "输入英文拼写"
          }
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          aria-label="拼写输入框"
        />
        <div className="spelling-form-actions" aria-hidden="true">
          <button type="submit" tabIndex={-1} disabled={!current || !spelling.inputValue.trim() || spelling.uiState === "inputting"}>
            提交
          </button>
          <button type="button" tabIndex={-1} disabled={!current || spelling.uiState === "inputting"} onClick={handleSkip}>
            跳过
          </button>
          <button type="button" tabIndex={-1} disabled={!current} onClick={() => spelling.getHint()}>
            提示
          </button>
        </div>
      </form>
      </div>

      <div
        className={`${layoutStyles.spellingErrorMessage}${spelling.uiState === "wrong_feedback" ? ` ${layoutStyles.spellingErrorMessageVisible}` : ""}`}
        role="alert"
        aria-live="polite"
        aria-atomic="true"
        data-testid="spelling-error-message"
      >
        拼写错误，请重试
      </div>

      {errorAnalysisVisible ? (
        <div className={layoutStyles.spellingFeedbackWrap} data-testid="spelling-feedback-wrap">
          <SpellingFeedbackPanel
            diagnosis={spelling.lastDiagnosis}
            expectedAnswer={current?.expectedAnswer || current?.displayText || ""}
          />
        </div>
      ) : null}
      {spelling.uiState !== "wrong_feedback" ? (
        <div className={`spelling-page-feedback spelling-page-feedback--compact ${spelling.uiState}${showEnginePreparing ? " is-preparing" : ""}`}>
          {showEnginePreparing ? (
            <span className="spelling-page-feedback__static">正在初始化拼写引擎…</span>
          ) : (
            <>
              <strong>{spelling.statusText}</strong>
              {spelling.hint ? <span>{spelling.hint}</span> : null}
            </>
          )}
        </div>
      ) : null}

      <div className="spelling-answer-reference">
        {!listenOnlyMode ? (
          <span className={`spelling-hero-phonetic${prompt.phoneticMissing ? " is-missing" : ""}`}>
            {prompt.phoneticPendingReview ? "音标待核验" : prompt.phonetic || "音标暂缺"}
          </span>
        ) : null}
        {!listenOnlyMode && showMeaning ? (
          <span className="spelling-answer-meaning">{prompt.typeLabel} · {prompt.meaning}</span>
        ) : (
          <span className="spelling-answer-meaning spelling-prompt--hidden">中文释义已隐藏（按 2）</span>
        )}
        <span className="spelling-word-error-count" data-testid="spelling-total-wrong-count">
          累计错 {spelling.totalWrongCount || 0} 次
        </span>
        <button
          type="button"
          className={`spelling-pronounce-btn spelling-pronounce-btn--reference${speech.playing === "word" ? " is-playing" : ""}`}
          onClick={() => {
            handleReplay();
            trainingControls.focusInput({ force: true });
          }}
          disabled={!speech.canPlayWord || speech.playing === "word"}
          aria-label={speech.wordAriaLabel}
          title={speech.wordAriaLabel}
        >
          <span className="spelling-pronounce-btn__icon" aria-hidden="true">🔊</span>
        </button>
      </div>
      </section>

    </div>
  ) : (
    <div className="spelling-empty-state spelling-empty-state--hero">
      {practiceSource === "personal_wrong_book" && !(scope === "phrase" ? personalWrongSummary.phrase : personalWrongSummary.word)
        ? "做题错词本还是空的。先在右侧添加真题/练习里遇到的错词。"
        : practiceSource === "error_bank" && !errorBank.count
        ? "错词本还是空的。先去分类练习，拼错的词会自动出现在这里。"
        : practiceSource === "srs_review" && !srsReview.count
          ? "当前没有到期的 SRS 复习内容。"
        : spelling.uiState === "done_today"
          ? "当前范围的今日拼写已完成。"
          : `暂时没有符合条件的${scopeConfig.label}拼写题。`}
    </div>
  )}

  {debugDetails ? (
    <details className="spelling-debug">
      <summary>拼写调试信息</summary>
      <pre>{JSON.stringify(debugDetails, null, 2)}</pre>
    </details>
  ) : null}

  <footer className="spelling-training-footer">
    <div className="spelling-progress spelling-progress--hero" aria-label="当前批次进度">
      <div className="spelling-progress-text">
        进度：{completedCount} / {sessionTotal || 0} {practiceSource === "personal_wrong_book" ? "词" : ""}
        <span className="spelling-progress-current">
          {practiceSource === "personal_wrong_book"
            ? (personalWrongUnitProgress ? ` · ${personalWrongUnitProgress.label}` : ` · 当前第 ${currentPosition || 0} 词`)
            : ` · 当前第 ${currentPosition || 0} 题`}
        </span>
      </div>
      <div className="spelling-progress-track" aria-hidden="true">
        <div className="spelling-progress-fill" style={{ width: `${progressBarPercent}%` }} />
      </div>
    </div>

    <div className="spelling-word-nav-group">
      <button
        type="button"
        className="spelling-undo-btn spelling-word-nav-btn"
        disabled={!current || !canBrowseBatchWords || isWordNavBlocked(spelling)}
        onClick={() => { void handleGoToPreviousWord(); }}
        title="上一个单词（快捷键：Ctrl+←）"
      >
        上一个
      </button>
      <button
        type="button"
        className="spelling-undo-btn spelling-word-nav-btn"
        disabled={!current || !canBrowseBatchWords || isWordNavBlocked(spelling)}
        onClick={() => { void handleGoToNextWord(); }}
        title="下一个单词（快捷键：Ctrl+→）"
      >
        下一个
      </button>
    </div>

    <p className="spelling-shortcuts spelling-shortcuts--hero" aria-label="键盘快捷键">
      <span className="spelling-shortcut-items">
        <span><b>1</b> 重播</span>
        <span><b>2</b> 释义</span>
        <span><b>3</b> 例句</span>
        <span><b>4</b> 熟悉</span>
        <span><b>5</b> 重点复习</span>
        <button
          type="button"
          className="spelling-undo-btn"
          onClick={() => { void undoLastSpellingAction(); }}
          title="撤回刚才操作（快捷键：Ctrl+Z）"
        >
          Ctrl+Z 撤回
        </button>
      </span>
      <span className="spelling-shortcut-items spelling-shortcut-items--secondary">
        {autoNextOnCorrect
          ? "Ctrl+← → 切词 · 拼对自动下一词 · Tab 单词 · Space 例句 · Enter 提交 · Ctrl+Enter 跳过"
          : "Ctrl+← → 切词 · Tab 单词 · Space 例句 · Enter 提交/下一词 · Ctrl+Enter 跳过"}
      </span>
    </p>
    <p
      className={`spelling-action-notice${actionNotice ? "" : " is-empty"}`}
      role="status"
      aria-live="polite"
    >
      {actionNotice || "\u00A0"}
    </p>
  </footer>
</section>

  );
}
