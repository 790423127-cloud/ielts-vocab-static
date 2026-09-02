"use client";

import { useMemo } from "react";
import { PanelRightClose, Volume2 } from "lucide-react";
import {
  buildWordStudyOverviewModel,
  countWordStudyQueue
} from "../lib/vocab/word-study-overview.mjs";

export default function WordStudyOverview({
  wordLibraryStats,
  filter,
  filterName,
  studyWords,
  currentPosition,
  isExternalIdictationItem,
  relatedWords,
  speakSmallText,
  onClose
}) {
  const queueCounts = useMemo(
    () => countWordStudyQueue(studyWords),
    [studyWords]
  );
  const overview = buildWordStudyOverviewModel({
    filter,
    filterName,
    studyWords,
    queueCounts,
    currentPosition,
    wordLibraryStats,
    isExternalIdictationItem
  });

  return (
    <aside className="word-insight-panel" aria-label="学习概览">
      <div className="word-insight-head">
        <div>
          <span>当前模式</span>
          <h2>{overview.title}</h2>
        </div>
        <button type="button" className="word-canvas-icon" onClick={onClose} aria-label="收起学习概览" title="收起学习概览">
          <PanelRightClose aria-hidden="true" />
        </button>
      </div>

      <section className="word-overview-card word-overview-card--mastery">
        <div
          className="word-mastery-ring"
          style={{ "--progress": `${overview.progressPercent}%` }}
          aria-label={overview.progressAria}
        >
          <strong>{overview.progressPercent}%</strong>
          <span>{overview.ringLabel}</span>
        </div>
        <dl className="word-mastery-legend">
          {overview.metrics.map((entry) => (
            <div className={`is-${entry.tone}`} key={entry.label}>
              <dt>{entry.label}</dt>
              <dd>{entry.value}</dd>
            </div>
          ))}
        </dl>
        <p className="word-overview-note">{overview.note}</p>
      </section>

      <section className="word-overview-card word-overview-today">
        <dl>
          {overview.facts.map((entry) => (
            <div key={entry.label}><dt>{entry.label}</dt><dd>{entry.value}</dd></div>
          ))}
        </dl>
      </section>

      <section className="word-overview-card word-related-card study-answer-content">
        <h3>相关单词</h3>
        {relatedWords.length ? (
          <ul>
            {relatedWords.map((word) => (
              <li key={word.word}>
                <button type="button" onClick={() => speakSmallText(word.word, "相关单词")} aria-label={`播放 ${word.word} 发音`}>
                  <Volume2 aria-hidden="true" />
                  <strong>{word.word}</strong>
                </button>
                <span>{word.meaning || "相关词汇"}</span>
              </li>
            ))}
          </ul>
        ) : <p>当前词暂无可靠的相关词。</p>}
      </section>
    </aside>
  );
}
