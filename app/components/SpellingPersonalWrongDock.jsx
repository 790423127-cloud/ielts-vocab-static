"use client";

import VirtualList from "./VirtualList.jsx";
import { BatchPicker } from "./SpellingTrainingChrome.jsx";
import {
  PERSONAL_WRONG_BOOK_BASE_REPS,
  PERSONAL_WRONG_BOOK_BATCH_SIZE,
  PERSONAL_WRONG_BOOK_REPETITIONS,
  formatPersonalWrongUnitLabel
} from "../lib/spelling/personal-wrong-book.mjs";
import { formatPersonalWrongRepeatLabel } from "../lib/spelling/spelling-training-page-helpers.mjs";

export default function SpellingPersonalWrongDock({
  scope,
  scopeConfig,
  unit,
  personalWrongInput,
  setPersonalWrongInput,
  personalWrongSummary,
  personalWrongScopedCount,
  personalWrongCurrentBatchLabel,
  personalWrongBatchSelection,
  personalWrongCurrentBatchWriteCount,
  personalWrongTotalWriteCount,
  showPersonalWrongGroupSelect,
  personalWrongBatchOptions,
  personalWrongCurrentBatchRecords,
  personalWrongSourceEntries,
  trainingControls,
  onClose,
  onAdd,
  onClear,
  onPractice,
  onBatchChange,
  onDeleteRecord,
  patchStoredPrefs
}) {
  return (
    <section className="spelling-personal-wrong-dock" aria-label="做题错词本管理">
      <div className="spelling-personal-wrong-dock__head">
        <div>
          <h2 className="spelling-personal-wrong-dock__title">做题错词本</h2>
          <p className="spelling-export-panel__hint">
            独立记录真题/练习错词；按 {PERSONAL_WRONG_BOOK_BATCH_SIZE} 词一组分类练习。只有原形的词练 {PERSONAL_WRONG_BOOK_BASE_REPS} 遍；原形+复数词练 {PERSONAL_WRONG_BOOK_REPETITIONS} 遍。后续加新词不会重置已练进度，也不会强制从头开始。
          </p>
        </div>
        <button
          type="button"
          className="spelling-export-btn"
          onMouseDown={trainingControls.markSettingsInteraction}
          onClick={onClose}
        >
          收起
        </button>
      </div>
      <div className="spelling-personal-wrong-dock__body">
        <div className="spelling-personal-wrong-dock__input">
          <textarea
            className="spelling-personal-wrong-input"
            value={personalWrongInput}
            onChange={(event) => setPersonalWrongInput(event.target.value)}
            onMouseDown={trainingControls.markSettingsInteraction}
            placeholder={`一行一个：\naccommodation | 住宿\nvacancy -> vacancies | 职位空缺\ncity +ies\non the other hand | 另一方面`}
            rows={5}
          />
          <div className="spelling-export-panel__actions spelling-personal-wrong-dock__actions">
            <button
              type="button"
              className="spelling-export-btn spelling-export-btn--primary"
              onMouseDown={trainingControls.markSettingsInteraction}
              onClick={onAdd}
            >
              加入做题错词本
            </button>
            <button
              type="button"
              className="spelling-export-btn"
              disabled={!(scope === "phrase" ? personalWrongSummary.phrase : personalWrongSummary.word)}
              onMouseDown={trainingControls.markSettingsInteraction}
              onClick={onClear}
            >
              清空当前{scopeConfig.label}
            </button>
            <button
              type="button"
              className="spelling-export-btn"
              disabled={!(scope === "phrase" ? personalWrongSummary.phrase : personalWrongSummary.word)}
              onMouseDown={trainingControls.markSettingsInteraction}
              onClick={onPractice}
            >
              去练习
            </button>
          </div>
        </div>
        <div className="spelling-personal-wrong-dock__list">
          <p className="spelling-export-panel__meta">
            错词本总计：{personalWrongScopedCount} {unit} · 当前{personalWrongCurrentBatchLabel}：{personalWrongBatchSelection.batchEntryCount} {unit} · 本组练习 {personalWrongCurrentBatchWriteCount} 遍 · 全部练习 {personalWrongTotalWriteCount} 遍
          </p>
          {showPersonalWrongGroupSelect ? (
            <div className="spelling-personal-wrong-dock__group-select">
              <span className="spelling-control-label">练习组别</span>
              <BatchPicker
                value={personalWrongBatchSelection.batchIndex}
                options={personalWrongBatchOptions}
                ariaLabel="做题错词练习组别"
                onInteract={trainingControls.markSettingsInteraction}
                onChange={(batchIndex) => {
                  onBatchChange(batchIndex);
                  patchStoredPrefs({ practiceSource: "personal_wrong_book" });
                }}
              />
            </div>
          ) : null}
          {personalWrongCurrentBatchRecords.length ? (
            <VirtualList
              className="spelling-personal-wrong-list spelling-personal-wrong-list--virtual"
              items={personalWrongCurrentBatchRecords}
              itemHeight={96}
              height={220}
              resetKey={`${scope}:personal-wrong:${personalWrongBatchSelection.batchIndex}:${personalWrongCurrentBatchRecords.length}`}
              getKey={(record) => record.id}
              renderItem={(record, itemIndex) => {
                const linked = personalWrongSourceEntries.some((entry) => entry.personalWrong?.recordId === record.id && entry.personalWrong.linkedToLexicon);
                const sequence = (personalWrongBatchSelection.batchIndex * PERSONAL_WRONG_BOOK_BATCH_SIZE) + itemIndex + 1;
                return (
                  <div className={`spelling-personal-wrong-record ${linked ? "is-linked" : "is-local"}`}>
                    <div className="spelling-personal-wrong-list__top">
                      <span className="spelling-personal-wrong-list__index">{sequence}</span>
                      <strong>{formatPersonalWrongUnitLabel(record)}</strong>
                      <button
                        type="button"
                        className="spelling-personal-wrong-list__delete"
                        onMouseDown={trainingControls.markSettingsInteraction}
                        onClick={() => onDeleteRecord(record)}
                        title="从做题错词本删除"
                      >
                        删除
                      </button>
                    </div>
                    <span>{record.meaning || (linked ? "已匹配总词库" : "本地补充")}</span>
                    <em>{formatPersonalWrongRepeatLabel(record)}</em>
                  </div>
                );
              }}
            />
          ) : (
            <p className="spelling-error-bank-empty">这里还没有做题错词。添加后可在右侧“来源”切到“做题错词”单独练习。</p>
          )}
        </div>
      </div>
    </section>
  );
}
