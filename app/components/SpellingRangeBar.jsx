"use client";

import { BatchPicker, RangeSettingRow } from "./SpellingTrainingChrome.jsx";
import {
  DEFAULT_SPELLING_PREFS as DEFAULT_PREFS
} from "../lib/spelling/spelling-training-prefs.mjs";
import {
  SPELLING_DIFFICULTY_OPTIONS,
  SPELLING_IELTS_USE_OPTIONS,
  SPELLING_LISTENING_READING_OPTIONS,
  SPELLING_TOPIC_OPTIONS
} from "../lib/spelling/spelling-categories.mjs";
import {
  getIdictationSource,
  isIdictationPracticeSource
} from "../lib/spelling/idictation-frequency.mjs";

export default function SpellingRangeBar({
  isPhrase = false,
  rangeSettingsExpanded,
  setRangeSettingsExpanded,
  trainingControls,
  availablePracticeSources,
  practiceSource,
  patchStoredPrefs,
  personalWrongSummary,
  scope,
  errorBank,
  srsReview,
  showPersonalWrongGroupSelect,
  personalWrongBatchSelection,
  personalWrongBatchOptions,
  handlePersonalWrongBatchChange,
  includeFamiliar,
  setIncludeFamiliar,
  autoNextOnCorrect,
  setAutoNextOnCorrect,
  turboMode,
  setTurboMode,
  listenOnlyMode,
  setListenOnlyMode,
  soundEffectsEnabled,
  setSoundEffectsEnabled,
  activeRangeLine,
  spelling,
  sessionTrainingLine,
  categoryPrefs,
  patchCategoryPrefs,
  categoryTypes,
  scopeConfig,
  difficultyCounts,
  topicCounts,
  ieltsUseCounts,
  lrCounts: listeningReadingCounts,
  batchSelection,
  batchOptions,
  idictationSourceKey,
  idictationSource,
  idictationBatchSelection,
  idictationGroupOptions,
  idictationBatchOptions,
  patchIdictationPrefs,
  srsBatchOptions,
  srsBatchSelection,
  errorBankBatchOptions,
  errorBankBatchSelection
}) {
  return (
        <div className="spelling-range-bar">
<div className="spelling-range-bar__head">
  <span className="spelling-range-bar__title">学习范围</span>
  <button
    type="button"
    className="spelling-range-expand"
    aria-expanded={rangeSettingsExpanded}
    onMouseDown={trainingControls.markSettingsInteraction}
    onClick={() => setRangeSettingsExpanded((open) => !open)}
  >
    {rangeSettingsExpanded ? "收起设置" : "展开设置"}
  </button>
</div>

{rangeSettingsExpanded ? (
<div className="spelling-range-bar__toolbar compact-summary">
  <div className="spelling-range-bar__group">
    <span className="spelling-control-label">来源</span>
    <div className="spelling-mode-tabs spelling-mode-tabs--compact">
      {availablePracticeSources.map((entry) => (
        <button
          key={entry.value}
          type="button"
          className={practiceSource === entry.value ? "active" : ""}
          onClick={() => patchStoredPrefs({ practiceSource: entry.value })}
        >
          {entry.label}
          {entry.value === "personal_wrong_book" ? (
            <span className="spelling-tab-count">{scope === "phrase" ? personalWrongSummary.phrase : personalWrongSummary.word}</span>
          ) : entry.value === "error_bank" ? (
            <span className="spelling-tab-count">{errorBank.count}</span>
          ) : entry.value === "srs_review" ? (
            <span className="spelling-tab-count">{srsReview.count}</span>
          ) : isIdictationPracticeSource(entry.value) ? (
            <span className="spelling-tab-count">{getIdictationSource(entry.sourceKey)?.uniqueWords || 0}</span>
          ) : null}
        </button>
      ))}
    </div>
  </div>

  {practiceSource === "personal_wrong_book" && showPersonalWrongGroupSelect ? (
    <div className="spelling-range-bar__group spelling-range-bar__group--batch-select">
      <span className="spelling-control-label">组别</span>
      <BatchPicker
        value={personalWrongBatchSelection.batchIndex}
        options={personalWrongBatchOptions}
        ariaLabel="做题错词组别选择"
        onInteract={trainingControls.markSettingsInteraction}
        onChange={handlePersonalWrongBatchChange}
      />
    </div>
  ) : null}

  <label className="spelling-toggle spelling-toggle--compact">
    <input
      type="checkbox"
      checked={includeFamiliar}
      onChange={(event) => setIncludeFamiliar(event.target.checked)}
      onMouseDown={trainingControls.markSettingsInteraction}
    />
    包含刷词已熟悉内容
  </label>

  <label className="spelling-toggle spelling-toggle--compact">
    <input
      type="checkbox"
      checked={autoNextOnCorrect}
      onChange={(event) => setAutoNextOnCorrect(event.target.checked)}
      onMouseDown={trainingControls.markSettingsInteraction}
    />
    拼对自动下一词
  </label>

  <label className="spelling-toggle spelling-toggle--compact">
    <input
      type="checkbox"
      checked={turboMode}
      onChange={(event) => setTurboMode(event.target.checked)}
      onMouseDown={trainingControls.markSettingsInteraction}
    />
    极速模式（缩短拼对停留，仍有延迟）
  </label>

  <label className="spelling-toggle spelling-toggle--compact">
    <input
      type="checkbox"
      checked={listenOnlyMode}
      onChange={(event) => setListenOnlyMode(event.target.checked)}
      onMouseDown={trainingControls.markSettingsInteraction}
    />
    纯听写模式
  </label>

  <label className="spelling-toggle spelling-toggle--compact">
    <input
      type="checkbox"
      checked={soundEffectsEnabled}
      onChange={(event) => setSoundEffectsEnabled(event.target.checked)}
      onMouseDown={trainingControls.markSettingsInteraction}
    />
    答对/答错音效
  </label>
</div>
) : null}

<div className="spelling-range-summary">
  <p className="spelling-range-summary__line">
    <span className="spelling-range-summary__label">当前范围</span>
    <span className="spelling-range-summary__text">{activeRangeLine}</span>
  </p>
  {spelling.ready ? (
    <p className="spelling-range-summary__line spelling-range-summary__line--session">
      <span className="spelling-range-summary__label">本次训练</span>
      <span className="spelling-range-summary__text">{sessionTrainingLine.replace(/^本次训练：/, "")}</span>
    </p>
  ) : null}
</div>

<div className={`spelling-range-settings${rangeSettingsExpanded ? " is-open" : ""}`}>
  {practiceSource === "category" ? (
    <div className="spelling-range-settings__block">
      <p className="spelling-range-settings__title">{scopeConfig.label}范围</p>
      <RangeSettingRow label="分类">
        <div className="spelling-mode-tabs spelling-mode-tabs--compact spelling-mode-tabs--wrap">
          {categoryTypes.map((entry) => (
            <button
              key={entry.value}
              type="button"
              className={categoryPrefs.categoryType === entry.value ? "active" : ""}
              onClick={() => patchCategoryPrefs({
                categoryType: entry.value,
                categoryValue: entry.value === "difficulty"
                  ? DEFAULT_PREFS.categoryValue
                  : entry.value === "topic"
                    ? SPELLING_TOPIC_OPTIONS[0]
                    : entry.value === "ielts_use"
                      ? SPELLING_IELTS_USE_OPTIONS[0].value
                      : entry.value === "lr_high_frequency"
                        ? SPELLING_LISTENING_READING_OPTIONS[0].value
                      : "",
                batchIndex: 0
              })}
            >
              {entry.label.replace("分类", "").replace("全部短语", "全部")}
            </button>
          ))}
        </div>
      </RangeSettingRow>

      {categoryPrefs.categoryType === "difficulty" ? (
        <RangeSettingRow label="难度">
          <div className="spelling-mode-tabs spelling-mode-tabs--compact spelling-mode-tabs--wrap">
            {SPELLING_DIFFICULTY_OPTIONS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                className={categoryPrefs.categoryValue === entry.value ? "active" : ""}
                onClick={() => patchCategoryPrefs({ categoryValue: entry.value, batchIndex: 0 })}
              >
                {entry.label}
                <span className="spelling-tab-count">{difficultyCounts.get(entry.value) || 0}</span>
              </button>
            ))}
          </div>
        </RangeSettingRow>
      ) : null}

      {categoryPrefs.categoryType === "topic" ? (
        <RangeSettingRow label="主题">
          <div className="spelling-mode-tabs spelling-mode-tabs--compact spelling-mode-tabs--wrap">
            {SPELLING_TOPIC_OPTIONS.map((topic) => (
              <button
                key={topic}
                type="button"
                className={categoryPrefs.categoryValue === topic ? "active" : ""}
                onClick={() => patchCategoryPrefs({ categoryValue: topic, batchIndex: 0 })}
              >
                {topic}
                <span className="spelling-tab-count">{topicCounts.get(topic) || 0}</span>
              </button>
            ))}
          </div>
        </RangeSettingRow>
      ) : null}

      {categoryPrefs.categoryType === "lr_high_frequency" ? (
        <RangeSettingRow label="训练重点">
          <div className="spelling-mode-tabs spelling-mode-tabs--compact spelling-mode-tabs--wrap">
            {SPELLING_LISTENING_READING_OPTIONS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                className={categoryPrefs.categoryValue === entry.value ? "active" : ""}
                onClick={() => patchCategoryPrefs({ categoryValue: entry.value, batchIndex: 0 })}
              >
                {entry.label}
                <span className="spelling-tab-count">{listeningReadingCounts.get(entry.value) || 0}</span>
              </button>
            ))}
          </div>
        </RangeSettingRow>
      ) : null}

      {isPhrase && categoryPrefs.categoryType === "ielts_use" ? (
        <RangeSettingRow label="场景">
          <div className="spelling-mode-tabs spelling-mode-tabs--compact spelling-mode-tabs--wrap">
            {SPELLING_IELTS_USE_OPTIONS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                className={categoryPrefs.categoryValue === entry.value ? "active" : ""}
                onClick={() => patchCategoryPrefs({ categoryValue: entry.value, batchIndex: 0 })}
              >
                {entry.label}
                <span className="spelling-tab-count">{ieltsUseCounts.get(entry.value) || 0}</span>
              </button>
            ))}
          </div>
        </RangeSettingRow>
      ) : null}

      {batchOptions.length > 1 ? (
        <RangeSettingRow label="批次">
          <BatchPicker
            value={batchSelection.batchIndex}
            options={batchOptions}
            onInteract={trainingControls.markSettingsInteraction}
            onChange={(batchIndex) => patchCategoryPrefs({ batchIndex })}
          />
        </RangeSettingRow>
      ) : null}
    </div>
  ) : isIdictationPracticeSource(practiceSource) ? (
    <div className="spelling-range-settings__block">
      <p className="spelling-range-settings__title">
        {idictationSource?.label || "爱听写"}原表章节
      </p>
      <p className="spelling-category-summary">
        原始 {idictationBatchSelection.rawRows || 0} 行 · 去重 {idictationBatchSelection.uniqueWords || 0} 词 · 按 Excel 章节分组练习
      </p>
      <RangeSettingRow label="章节">
        <div className="spelling-mode-tabs spelling-mode-tabs--compact spelling-mode-tabs--wrap">
          {idictationGroupOptions.map((entry) => (
            <button
              key={entry.value}
              type="button"
              className={idictationBatchSelection.groupKey === entry.value ? "active" : ""}
              onClick={() => patchIdictationPrefs(idictationSourceKey, { groupKey: entry.value, batchIndex: 0 })}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </RangeSettingRow>
      {idictationBatchOptions.length > 1 ? (
        <RangeSettingRow label="组别">
          <BatchPicker
            value={idictationBatchSelection.batchIndex}
            options={idictationBatchOptions}
            ariaLabel={`${idictationSource?.label || "爱听写"}组别选择`}
            onInteract={trainingControls.markSettingsInteraction}
            onChange={(batchIndex) => patchIdictationPrefs(idictationSourceKey, { batchIndex })}
          />
        </RangeSettingRow>
      ) : null}
    </div>
  ) : (
    <div className="spelling-range-settings__block">
      <p className="spelling-range-settings__title">
        {scopeConfig.label}{practiceSource === "personal_wrong_book" ? " 做题错词练习" : practiceSource === "srs_review" ? " SRS 复习" : "错词本练习"}
      </p>
      <p className="spelling-category-summary">
        共 {practiceSource === "personal_wrong_book" ? (scope === "phrase" ? personalWrongSummary.phrase : personalWrongSummary.word) : practiceSource === "srs_review" ? srsReview.count : errorBank.count} 条
      </p>
      {practiceSource === "personal_wrong_book" && showPersonalWrongGroupSelect ? (
        <RangeSettingRow label="组别">
          <BatchPicker
            value={personalWrongBatchSelection.batchIndex}
            options={personalWrongBatchOptions}
            ariaLabel="做题错词组别选择"
            onInteract={trainingControls.markSettingsInteraction}
            onChange={handlePersonalWrongBatchChange}
          />
        </RangeSettingRow>
      ) : (practiceSource === "personal_wrong_book" ? personalWrongBatchOptions : practiceSource === "srs_review" ? srsBatchOptions : errorBankBatchOptions).length > 1 ? (
        <RangeSettingRow label="批次">
          <BatchPicker
            value={practiceSource === "srs_review" ? srsBatchSelection.batchIndex : errorBankBatchSelection.batchIndex}
            options={practiceSource === "srs_review" ? srsBatchOptions : errorBankBatchOptions}
            onInteract={trainingControls.markSettingsInteraction}
            onChange={(batchIndex) => patchStoredPrefs(practiceSource === "srs_review"
              ? { srsBatchIndex: batchIndex }
              : { errorBankBatchIndex: batchIndex })}
          />
        </RangeSettingRow>
      ) : null}
    </div>
  )}
</div>
        </div>

  );
}
