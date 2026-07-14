"use client";

import VirtualList from "./VirtualList.jsx";
import SpellingRangeBar from "./SpellingRangeBar.jsx";
import FontScaleControl from "./FontScaleControl.jsx";
import {
  PERSONAL_WRONG_BOOK_BASE_REPS,
  PERSONAL_WRONG_BOOK_BATCH_SIZE,
  PERSONAL_WRONG_BOOK_REPETITIONS,
  formatPersonalWrongUnitLabel
} from "../lib/spelling/personal-wrong-book.mjs";
import { formatErrorBankSeverity } from "../lib/spelling/error-bank.mjs";
import {
  formatPersonalWrongRepeatLabel,
  formatWrongTime
} from "../lib/spelling/spelling-training-page-helpers.mjs";

export default function SpellingStatsSidebar({
  statsSidebarOpen,
  onClose,
  dailyStats,
  formatActiveLearningTime,
  sessionMetrics,
  unit,
  progress,
  candidateTotal,
  rawBatchTotal,
  errorBank,
  completedCount,
  remainingCount,
  rangeBarProps,
  personalWrongInput,
  setPersonalWrongInput,
  trainingControls,
  handleAddPersonalWrongWords,
  handleClearPersonalWrongBook,
  personalWrongSummary,
  scope,
  scopeConfig,
  personalWrongScopedCount,
  personalWrongCurrentBatchLabel,
  personalWrongBatchSelection,
  personalWrongCurrentBatchWriteCount,
  personalWrongTotalWriteCount,
  personalWrongCurrentBatchRecords,
  personalWrongSourceEntries,
  handleDeletePersonalWrongRecord,
  lexicon,
  handleExportCombinedLexicon,
  handleExportScopeLexicon,
  spellingEntries,
  handleExportCurrentBatch,
  practiceSource,
  currentCategoryEntries,
  handleExportCurrentCategory,
  batchSelection,
  srsReview,
  srsIntervalText
}) {
  return (
<aside className={`spelling-stats-sidebar${statsSidebarOpen ? " is-open" : ""}`} aria-label="统计与设置">
  <div className="spelling-sidebar-header">
    <strong>统计与设置</strong>
    <button type="button" className="spelling-sidebar-close" onClick={onClose} aria-label="关闭统计与设置">
      ×
    </button>
  </div>
  <div className="spelling-sidebar-font-scale">
    <FontScaleControl />
  </div>
  <section className="spelling-sidebar-block" aria-label="今日统计">
    <h2 className="spelling-sidebar-block__title">今日统计</h2>
    <dl className="spelling-sidebar-stats spelling-sidebar-stats--daily">
      <div><dt>学习单词</dt><dd>{dailyStats.learnedWordIds.length}</dd></div>
      <div><dt>有效学习</dt><dd>{formatActiveLearningTime(dailyStats.activeMs)}</dd></div>
      <div><dt>错词数量</dt><dd>{dailyStats.wrongWordIds.length}</dd></div>
    </dl>
  </section>

  <section className="spelling-sidebar-block" aria-label="训练统计">
    <h2 className="spelling-sidebar-block__title">训练统计</h2>
    <dl className="spelling-sidebar-stats">
      <div><dt>正确率</dt><dd>{sessionMetrics.accuracy}%</dd></div>
      <div><dt>速度</dt><dd>{sessionMetrics.wordsPerMinute} {unit}/分</dd></div>
      <div><dt>预计</dt><dd>{sessionMetrics.etaMinutes ? `约 ${sessionMetrics.etaMinutes} 分钟` : "—"}</dd></div>
      <div><dt>连对</dt><dd>{sessionMetrics.consecutiveCorrect}</dd></div>
      <div><dt>SRS 到期</dt><dd>{progress.todaySrsDueCount ?? 0}</dd></div>
      <div><dt>候选池</dt><dd>{candidateTotal}</dd></div>
      <div><dt>原始批次</dt><dd>{rawBatchTotal}</dd></div>
      <div><dt>错词本</dt><dd>{errorBank.count}</dd></div>
      <div><dt>新词通过</dt><dd>{progress.newWordsPassed ?? 0}</dd></div>
      <div><dt>掌握</dt><dd>{progress.masteredCount ?? completedCount}</dd></div>
      <div><dt>剩余</dt><dd>{remainingCount}{unit}</dd></div>
    </dl>
  </section>

  <section className="spelling-sidebar-block spelling-page-controls" aria-label="学习范围">
        <SpellingRangeBar {...rangeBarProps} />

          {false ? (
  <section className="spelling-sidebar-block spelling-personal-wrong-panel" aria-label="做题错词本">
    <h2 className="spelling-sidebar-block__title">做题错词本</h2>
    <p className="spelling-export-panel__hint">
      用来记录真题/练习里的错词；只有原形的词练 {PERSONAL_WRONG_BOOK_BASE_REPS} 遍，原形+复数词练 {PERSONAL_WRONG_BOOK_REPETITIONS} 遍。
    </p>
    <textarea
      className="spelling-personal-wrong-input"
      value={personalWrongInput}
      onChange={(event) => setPersonalWrongInput(event.target.value)}
      onMouseDown={trainingControls.markSettingsInteraction}
      placeholder={`一行一个：\naccommodation | 住宿\nvacancy -> vacancies | 职位空缺\ncity +ies\non the other hand | 另一方面`}
      rows={4}
    />
    <div className="spelling-export-panel__actions">
      <button
        type="button"
        className="spelling-export-btn spelling-export-btn--primary"
        onMouseDown={trainingControls.markSettingsInteraction}
        onClick={handleAddPersonalWrongWords}
      >
        加入做题错词本
      </button>
      <button
        type="button"
        className="spelling-export-btn"
        disabled={!(scope === "phrase" ? personalWrongSummary.phrase : personalWrongSummary.word)}
        onMouseDown={trainingControls.markSettingsInteraction}
        onClick={handleClearPersonalWrongBook}
      >
        清空当前错词
      </button>
    </div>
    <p className="spelling-export-panel__meta">
      错词本总计：{personalWrongScopedCount} {unit} · 当前{personalWrongCurrentBatchLabel}：{personalWrongBatchSelection.batchEntryCount} {unit} · 本组练习 {personalWrongCurrentBatchWriteCount} 遍 · 全部练习 {personalWrongTotalWriteCount} 遍
    </p>
    {personalWrongCurrentBatchRecords.length ? (
      <ul className="spelling-personal-wrong-list">
        {personalWrongCurrentBatchRecords.map((record, index) => {
          const linked = personalWrongSourceEntries.some((entry) => entry.personalWrong?.recordId === record.id && entry.personalWrong.linkedToLexicon);
          const sequence = (personalWrongBatchSelection.batchIndex * PERSONAL_WRONG_BOOK_BATCH_SIZE) + index + 1;
          return (
            <li key={record.id} className={linked ? "is-linked" : "is-local"}>
              <div className="spelling-personal-wrong-list__top">
                <span className="spelling-personal-wrong-list__index">{sequence}</span>
                <strong>{formatPersonalWrongUnitLabel(record)}</strong>
                <button
                  type="button"
                  className="spelling-personal-wrong-list__delete"
                  onMouseDown={trainingControls.markSettingsInteraction}
                  onClick={() => handleDeletePersonalWrongRecord(record)}
                  title="从做题错词本删除"
                >
                  删除
                </button>
              </div>
              <span>{record.meaning || (linked ? "已匹配总词库" : "本地补充")}</span>
              <em>{formatPersonalWrongRepeatLabel(record)}</em>
            </li>
          );
        })}
      </ul>
    ) : null}
  </section>
  ) : null}

  <section className="spelling-sidebar-block spelling-export-panel" aria-label="导出">
    <h2 className="spelling-sidebar-block__title">导出</h2>
    <p className="spelling-export-panel__hint">
      可导出完整词库、当前批次，或当前所选分类的完整词表。
    </p>
    <div className="spelling-export-panel__actions">
      <button
        type="button"
        className="spelling-export-btn spelling-export-btn--primary"
        data-testid="spelling-export-combined-sidebar"
        disabled={!lexicon}
        onMouseDown={trainingControls.markSettingsInteraction}
        onClick={handleExportCombinedLexicon}
      >
        一键导出单词+词组
      </button>
      <button
        type="button"
        className="spelling-export-btn"
        disabled={!lexicon}
        onMouseDown={trainingControls.markSettingsInteraction}
        onClick={handleExportScopeLexicon}
      >
        导出全部{scopeConfig.label}
      </button>
      <button
        type="button"
        className="spelling-export-btn"
        data-testid="spelling-export-current-batch"
        disabled={!spellingEntries.length}
        onMouseDown={trainingControls.markSettingsInteraction}
        onClick={() => handleExportCurrentBatch("json")}
      >
        导出当前批次 JSON
      </button>
      <button
        type="button"
        className="spelling-export-btn"
        disabled={!spellingEntries.length}
        onMouseDown={trainingControls.markSettingsInteraction}
        onClick={() => handleExportCurrentBatch("txt")}
      >
        导出当前批次 TXT
      </button>
      {practiceSource === "category" ? (
        <>
          <button
            type="button"
            className="spelling-export-btn"
            data-testid="spelling-export-current-category-json"
            disabled={!currentCategoryEntries.length}
            onMouseDown={trainingControls.markSettingsInteraction}
            onClick={() => handleExportCurrentCategory("json")}
          >
            导出当前分类全部 JSON
          </button>
          <button
            type="button"
            className="spelling-export-btn"
            data-testid="spelling-export-current-category-txt"
            disabled={!currentCategoryEntries.length}
            onMouseDown={trainingControls.markSettingsInteraction}
            onClick={() => handleExportCurrentCategory("txt")}
          >
            导出当前分类全部 TXT
          </button>
        </>
      ) : null}
    </div>
    <p className="spelling-export-panel__meta">
      词库：{lexicon?.counts?.headwords || 0} 词 · {lexicon?.counts?.phrases || 0} 组
      {spellingEntries.length ? ` · 当前批次 ${spellingEntries.length} 条` : ""}
      {practiceSource === "category" && currentCategoryEntries.length
        ? ` · 当前分类：${batchSelection.label} ${currentCategoryEntries.length} 条`
        : ""}
    </p>
  </section>

<details className="spelling-error-bank-panel spelling-aux-panel">
  <summary>
    {scopeConfig.label}错词本
    <span className="spelling-tab-count">{errorBank.count}</span>
    {errorBank.totalWrongAttempts ? (
      <span className="spelling-tab-count">累计错 {errorBank.totalWrongAttempts}</span>
    ) : null}
  </summary>
  {errorBank.loading ? (
    <p className="spelling-error-bank-empty">正在加载错词本…</p>
  ) : errorBank.count ? (
    <VirtualList
      className="spelling-error-bank-list spelling-error-bank-list--virtual"
      items={errorBank.items}
      itemHeight={96}
      height={280}
      resetKey={`${scope}:error-bank:${errorBank.count}:${errorBank.totalWrongAttempts || 0}`}
      getKey={(item) => item.errorBank?.dedupeKey || item.wordId}
      renderItem={(item) => (
        <div className={`spelling-error-bank-item severity-${item.errorBank?.severity || "low"}`}>
          <div className="spelling-error-bank-item__main">
            <strong>{item.expectedAnswer || item.word}</strong>
            <span>{item.meaning || "—"}</span>
          </div>
          <div className="spelling-error-bank-item__meta">
            <span>{formatErrorBankSeverity(item.errorBank?.severity)}</span>
            <span>错 {item.errorBank?.totalWrongCount || 0} 次</span>
            <span>最近：{formatWrongTime(item.errorBank?.latestWrongAt)}</span>
            {item.errorBank?.lastWrongAnswer ? (
              <span className="spelling-error-bank-item__wrong">误填：{item.errorBank.lastWrongAnswer}</span>
            ) : null}
          </div>
        </div>
      )}
    />
  ) : (
    <p className="spelling-error-bank-empty">还没有错词。拼写错误后会自动收录到本页专用错词本。</p>
  )}
</details>

  <details className="spelling-srs-info spelling-sidebar-block">
    <summary>艾宾浩斯 SRS · 到期 {srsReview.count}</summary>
    <p>
      {scopeConfig.label}独立 SRS，复习间隔 <strong>{srsIntervalText}</strong> 天。
    </p>
    {srsReview.count ? (
      <ul className="spelling-error-bank-list">
        {srsReview.items.slice(0, 10).map((item) => (
          <li key={item.wordId} className="spelling-error-bank-item">
            <div className="spelling-error-bank-item__main">
              <strong>{item.expectedAnswer || item.word}</strong>
              <span>{item.meaning || "—"}</span>
            </div>
            <div className="spelling-error-bank-item__meta">
              <span>SRS 第 {item.srs?.stage || 1} 阶段</span>
            </div>
          </li>
        ))}
      </ul>
    ) : null}
  </details>
  </section>
</aside>
  );
}
