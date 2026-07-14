"use client";

import { useState } from "react";
import { Bookmark, PanelRightClose, PanelRightOpen, Volume2 } from "lucide-react";
import StudyRangeSummary from "./StudyRangeSummary";
import VirtualList from "./VirtualList";
import VocabAdminToolsPanel from "./VocabAdminToolsPanel";
import {
  getFormChineseType,
  getFormExplanation,
  getFormHint,
  getPosDisplay
} from "../lib/vocab/page-word-helpers.mjs";

/**
 * Word flashcard shell UI (props grouped v2026-07-10.4).
 *
 * @param {object} props
 * @param {object} props.model - card/session display model
 * @param {object} props.library - range/filter/list model
 * @param {object} props.speech - speak handlers
 * @param {object} props.admin - tools panel state + actions
 * @param {object} props.chrome - constants + shuffle + status actions
 */
export default function WordFlashcardView({ model, library, speech, admin, chrome }) {
  const [detailTab, setDetailTab] = useState("forms");
  const [showInsight, setShowInsight] = useState(true);
  const {
    prevItem,
    item,
    audioInfo,
    displayForms,
    displayFamily,
    commonCollocations,
    phraseCollocations,
    collocationFallback,
    phraseCollocationFallback,
    isStudyEmpty,
    isExternalIdictationItem,
    progressPercent,
    safeStudyPosition,
    studyRangeDetail,
    fallback
  } = model;

  const {
    filter,
    studyWords,
    learningEntryGroups,
    search,
    setSearch,
    setLibraryFilter,
    filteredWordIndices,
    activeWordPool,
    activeWordByIndex,
    index,
    setIndex,
    studySessionRef,
    latestStateRef,
    persistWordFlashSessionNow,
    getFilterName,
    filterKey,
    isSameFilter,
    resolveStudyWordEntry,
    wordLibraryStats,
    familiarCount,
    missingCount,
    classifyMissingCount
  } = library;

  const { speakWord, speakExample, speakSmallText } = speech;

  const {
    toolsMenuRef,
    aiToolsRef,
    toolsOpen = false,
    aiToolsOpen = false,
    onToolsOpenChange,
    onAiToolsOpenChange,
    loading,
    pasteText,
    setPasteText,
    lastLocalChange,
    audioCacheStats,
    audioStats,
    batchInfo,
    duplicateInfo,
    adminActions
  } = admin;

  const {
    TOPIC_OPTIONS,
    DIFFICULTY_OPTIONS,
    IELTS_USE_OPTIONS,
    IDICTATION_FLASH_FILTERS,
    shuffleStudyWords,
    nextWord,
    prevWord,
    toggleFavorite,
    markStatus
  } = chrome;

  const detailTabs = [
    { id: "forms", label: "变形" },
    { id: "family", label: "词族" },
    { id: "collocations", label: "常见搭配" },
    { id: "phrases", label: "短语搭配" }
  ];
  const libraryTotal = Number(wordLibraryStats.total || 0) || Math.max(1, familiarCount + wordLibraryStats.pending + wordLibraryStats.unfamiliar);
  const familiarPercent = Math.round((familiarCount / libraryTotal) * 100);

  return (
    <div className={`word-flash-shell${showInsight ? "" : " is-insight-collapsed"}`}>
      <header className="topbar">
        <div className="previous">
          <div className="previous-label">上一个单词</div>
          <div className="previous-word">{prevItem?.word || "—"}</div>
          <div className="previous-meta">
            {fallback(prevItem?.phonetic, "等待音标")} · {fallback(getPosDisplay(prevItem?.pos), "词性")} · {fallback(prevItem?.meaning, "释义")}
          </div>
        </div>

        <div className="top-actions">
          <button className="top-pill shuffle-pill" onClick={shuffleStudyWords}>随机</button>
          <a className="top-pill spelling-entry-link" href="/basic">零基础单词 · 启蒙词库</a>
          <a className="top-pill spelling-entry-link" href="/reading-g">G类阅读提升</a>
          <details className="menu">
            <summary className="top-pill">更改范围</summary>
            <div className="menu-panel wide">
              <h2 className="panel-title">学习入口</h2>
              <p className="panel-desc">总词库不拆开；这里是不同学习入口。每个入口会单独记当前位置。</p>

              <div className="current-filter">
                当前入口：{getFilterName(filter)} · {studyWords.length} 个词
              </div>

              {learningEntryGroups.map((group) => (
                <div className="entry-group" key={group.group}>
                  <div className="filter-title">{group.group}</div>
                  <div className="entry-grid">
                    {group.items.map((entry) => (
                      <button
                        key={`${entry.title}-${filterKey(entry.filter)}`}
                        className={`entry-btn ${isSameFilter(filter, entry.filter) ? "active" : ""}`}
                        onClick={() => setLibraryFilter(entry.filter.type, entry.filter.value)}
                      >
                        <span className="entry-title">{entry.title}</span>
                        <span className="entry-desc">{entry.desc}</span>
                        <span className="entry-meta">{entry.count} 个{entry.currentWord ? ` · ${entry.currentWord}` : ""}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
          <VocabAdminToolsPanel
            toolsMenuRef={toolsMenuRef}
            aiToolsRef={aiToolsRef}
            toolsOpen={toolsOpen}
            aiToolsOpen={aiToolsOpen}
            onToolsOpenChange={onToolsOpenChange}
            onAiToolsOpenChange={onAiToolsOpenChange}
            loading={loading}
            pasteText={pasteText}
            onPasteTextChange={setPasteText}
            lastLocalChange={lastLocalChange}
            audioCacheStats={audioCacheStats}
            audioStats={audioStats}
            batchInfo={batchInfo}
            duplicateInfo={duplicateInfo}
            isExternalIdictationItem={isExternalIdictationItem}
            actions={adminActions}
          />

          <details className="menu">
            <summary className="top-pill">词库面板</summary>
            <div className="menu-panel wide">
              <h2 className="panel-title">词库</h2>
              <p className="panel-desc">
                待学习 {wordLibraryStats.pending} · 不熟 {wordLibraryStats.unfamiliar} · 已熟悉 {familiarCount} · 待补全 {missingCount} · 待归纳 {classifyMissingCount} · 音频 {audioStats.has}/{audioStats.total}
              </p>

              <div className="current-filter">
                当前学习范围：{getFilterName(filter)} · {studyWords.length} 个词
              </div>

              <div className="field">
                <input
                  type="text"
                  placeholder="搜索单词"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="filter-group">
                <div className="filter-title">状态</div>
                <div className="filter-chips">
                  <button className={`chip-btn ${filter.type === "all" ? "active" : ""}`} onClick={() => setLibraryFilter("all", "")}>全部待学</button>
                  <button className={`chip-btn ${filter.type === "everything" ? "active" : ""}`} onClick={() => setLibraryFilter("everything", "")}>全部单词</button>
                  <button className={`chip-btn ${filter.type === "custom" && filter.value === "life-work" ? "active" : ""}`} onClick={() => setLibraryFilter("custom", "life-work")}>生活/工作高频</button>
                  {["不熟", "熟悉", "收藏", "待补全", "待归纳"].map((value) => (
                    <button key={value} className={`chip-btn ${filter.type === "status" && filter.value === value ? "active" : ""}`} onClick={() => setLibraryFilter("status", value)}>
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div className="filter-group">
                <div className="filter-title">IELTS 用途</div>
                <div className="filter-chips">
                  {IELTS_USE_OPTIONS.map((value) => (
                    <button key={value} className={`chip-btn ${filter.type === "ieltsUse" && filter.value === value ? "active" : ""}`} onClick={() => setLibraryFilter("ieltsUse", value)}>
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div className="filter-group">
                <div className="filter-title">爱听写频率</div>
                <div className="filter-chips">
                  {IDICTATION_FLASH_FILTERS.map((entry) => (
                    <button key={entry.value} className={`chip-btn ${filter.type === "idictation" && filter.value === entry.value ? "active" : ""}`} onClick={() => setLibraryFilter("idictation", entry.value)}>
                      {entry.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="filter-group">
                <div className="filter-title">主题</div>
                <div className="filter-chips">
                  {TOPIC_OPTIONS.map((value) => (
                    <button key={value} className={`chip-btn ${filter.type === "topic" && filter.value === value ? "active" : ""}`} onClick={() => setLibraryFilter("topic", value)}>
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div className="filter-group">
                <div className="filter-title">难度分类</div>
                <div className="filter-chips">
                  {DIFFICULTY_OPTIONS.map((value) => (
                    <button key={value} className={`chip-btn ${filter.type === "difficulty" && filter.value === value ? "active" : ""}`} onClick={() => setLibraryFilter("difficulty", value)}>
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <VirtualList
                className="library-list library-list--virtual"
                items={filteredWordIndices}
                itemHeight={58}
                height={300}
                resetKey={`${filterKey(filter)}:${search}:${filteredWordIndices.length}`}
                getKey={(poolIndex) => {
                  const word = resolveStudyWordEntry(activeWordPool, poolIndex, activeWordByIndex);
                  return `${word?.word || poolIndex}-${poolIndex}`;
                }}
                renderItem={(poolIndex) => {
                  const word = resolveStudyWordEntry(activeWordPool, poolIndex, activeWordByIndex);
                  if (!word) return null;

                  return (
                    <div
                      className={`library-item ${poolIndex === index ? "active" : ""}`}
                      onClick={() => {
                        studySessionRef.current.userAdjusted = true;
                        studySessionRef.current.restoreTargetIndex = null;
                        studySessionRef.current.persistBlocked = false;
                        latestStateRef.current.index = poolIndex;
                        setIndex(poolIndex);
                        persistWordFlashSessionNow(poolIndex);
                      }}
                    >
                      <div className="library-word">{word.word}</div>
                      <div className="library-meta">{word.__idictationFlash ? `${word.category} · ${word.difficulty}` : word.difficulty || "未归纳"}</div>
                    </div>
                  );
                }}
              />
              <p className="library-list-note">
                共 {filteredWordIndices.length} 条，已启用虚拟滚动；继续输入搜索可快速定位。
              </p>
            </div>
          </details>
        </div>
      </header>

      <StudyRangeSummary
        mode="刷单词"
        title={getFilterName(filter)}
        meta={`${studyWords.length} 个词`}
        detail={studyRangeDetail}
        className="word-study-range"
      />

      <section className="main">
        <div className="center">
          <div className="word-canvas-tools">
            <span>刷词 · 当前项目</span>
            <div>
              <button className={`word-canvas-icon${item.favorite ? " is-active" : ""}`} disabled={isStudyEmpty || isExternalIdictationItem} onClick={toggleFavorite} title="收藏" aria-label="收藏当前单词">
                <Bookmark aria-hidden="true" />
              </button>
              <button className="word-canvas-icon" type="button" onClick={() => setShowInsight((value) => !value)} title={showInsight ? "收起学习概览" : "打开学习概览"} aria-label={showInsight ? "收起学习概览" : "打开学习概览"}>
                {showInsight ? <PanelRightClose aria-hidden="true" /> : <PanelRightOpen aria-hidden="true" />}
              </button>
            </div>
          </div>

          <div className="example-box">
            <div className="example-head">
              <button
                className="hero-sound-btn"
                type="button"
                onClick={speakExample}
                title="播放例句发音 (空格)"
                aria-label="播放例句发音，快捷键空格"
              >
                <Volume2 aria-hidden="true" />
                <span>播放例句</span>
              </button>
            </div>
            <div className="example-clickable" onClick={speakExample} role="button" tabIndex={0} onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                speakExample();
              }
            }}>
              <div className="example">{fallback(item.example, "等待 AI 生成雅思例句")}</div>
              <div className="example-cn">{fallback(item.exampleCn, "等待 AI 生成例句中文翻译")}</div>
            </div>
          </div>

          {item.status === "不熟" ? (
            <div className="unfamiliar-alert">当前词标记为不熟，复习时会优先出现</div>
          ) : null}

          <div className="word-hero">
            <button
              className="hero-sound-btn"
              type="button"
              onClick={() => speakWord(true)}
              title="播放单词发音 (Tab)"
              aria-label="播放单词发音，快捷键 Tab"
            >
              <Volume2 aria-hidden="true" />
              <span>播放单词</span>
            </button>
            <div
              className="word-clickable"
              onClick={() => speakWord(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  speakWord(true);
                }
              }}
            >
              <div className="word">{item.word || "—"}</div>
              <div className="word-sub">
                <span className="phonetic">{fallback(item.phonetic || audioInfo.phonetic, "等待音标")}</span>
                <span className="pos">{getPosDisplay(item.pos)}</span>
              </div>
            </div>
          </div>

          <div className="meaning-block">
            <div className="meaning-primary">{fallback(item.meaning, "等待 AI 生成中文释义")}</div>
          </div>

          <section className="word-dictionary-panel" aria-label="词典详情">
            <div className="word-dictionary-tabs" role="tablist" aria-label="词典详情分类">
              {detailTabs.map((tab) => (
                <button key={tab.id} type="button" role="tab" aria-selected={detailTab === tab.id} className={detailTab === tab.id ? "is-active" : ""} onClick={() => setDetailTab(tab.id)}>
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="word-dictionary-content" role="tabpanel">
              {detailTab === "forms" ? (
                displayForms.length ? displayForms.map((form) => (
                  <div className="word-dictionary-row" key={`${form.word}-${form.type}`}>
                    <span>{getFormChineseType(form.type)}</span>
                    <button type="button" onClick={() => speakSmallText(form.word, "变形")}><Volume2 aria-hidden="true" />{form.word}</button>
                    <small>{getFormHint(form)} · {getFormExplanation(item.word, item.meaning, form)}</small>
                  </div>
                )) : <p className="word-dictionary-empty">当前词暂无重要变形。</p>
              ) : null}
              {detailTab === "family" ? (
                displayFamily.length ? displayFamily.map((family) => (
                  <div className="word-dictionary-row" key={`${family.word}-${family.pos}`}>
                    <span>{getPosDisplay(family.pos)}</span>
                    <button type="button" onClick={() => speakSmallText(family.word, "词族")}><Volume2 aria-hidden="true" />{family.word}</button>
                    <small>{family.meaning || "同词族词条"}</small>
                  </div>
                )) : <p className="word-dictionary-empty">当前词暂无词族信息。</p>
              ) : null}
              {detailTab === "collocations" ? (
                (commonCollocations.length ? commonCollocations : collocationFallback).slice(0, 4).map((pair) => (
                  <div className="word-dictionary-row" key={`${pair.phrase}-${pair.chinese}`}>
                    <span>常见搭配</span>
                    <button type="button" disabled={!pair.phrase || pair.phrase.startsWith("等待 AI")} onClick={() => speakSmallText(pair.phrase, "搭配")}><Volume2 aria-hidden="true" />{pair.phrase}</button>
                    <small>{pair.chinese || ""}</small>
                  </div>
                ))
              ) : null}
              {detailTab === "phrases" ? (
                (phraseCollocations.length ? phraseCollocations : phraseCollocationFallback).slice(0, 4).map((pair) => (
                  <div className="word-dictionary-row" key={`${pair.phrase}-${pair.chinese}`}>
                    <span>短语搭配</span>
                    <button type="button" disabled={!pair.phrase || pair.phrase.startsWith("等待 AI")} onClick={() => speakSmallText(pair.phrase, "短语")}><Volume2 aria-hidden="true" />{pair.phrase}</button>
                    <small>{pair.chinese || ""}</small>
                  </div>
                ))
              ) : null}
            </div>
          </section>
        </div>
      </section>

      <aside className="word-insight-panel" aria-label="学习概览">
        <div className="word-insight-head">
          <h2>学习概览</h2>
          <button type="button" className="word-canvas-icon" onClick={() => setShowInsight(false)} aria-label="收起学习概览" title="收起学习概览"><PanelRightClose aria-hidden="true" /></button>
        </div>
        <div className="word-insight-section-title">当前词库</div>
        <div className="word-mastery-line"><strong>{familiarPercent}%</strong><span>已熟悉</span></div>
        <div className="word-mastery-track"><span style={{ width: `${Math.min(100, familiarPercent)}%` }} /></div>
        <div className="word-insight-metrics">
          <div><span>待学习</span><strong>{wordLibraryStats.pending}</strong></div>
          <div><span>不熟词</span><strong>{wordLibraryStats.unfamiliar}</strong></div>
        </div>
        <div className="word-insight-section-title">本词状态</div>
        <dl className="word-insight-records">
          <div><dt>当前状态</dt><dd>{item.status || "待学习"}</dd></div>
          <div><dt>学习范围</dt><dd>{getFilterName(filter)}</dd></div>
          <div><dt>当前位置</dt><dd>{isStudyEmpty ? "0 / 0" : `${safeStudyPosition + 1} / ${studyWords.length}`}</dd></div>
          <div><dt>收藏</dt><dd>{item.favorite ? "已收藏" : "未收藏"}</dd></div>
        </dl>
        <p className="word-insight-note">标记为不熟的词会优先进入后续复习队列。完成当前范围后，可到拼写训练继续巩固。</p>
      </aside>

      <footer className="bottom bottombar">
        <button className="study-step-button study-step-button--previous" type="button" disabled={isStudyEmpty} onClick={prevWord}>
          上一个
        </button>
        <div className="actions">
          <button className="status known" disabled={isStudyEmpty} onClick={() => markStatus("熟悉")} title="快捷键：0">
            {isExternalIdictationItem ? "下一个" : "熟悉"}
          </button>
          <button className={`status unknown ${item.status === "不熟" ? "active-unknown" : ""}`} disabled={isStudyEmpty} onClick={() => markStatus("不熟")} title="快捷键：1">
            {isExternalIdictationItem ? "跳过" : item.status === "不熟" ? "取消不熟" : "不熟"}
          </button>
        </div>

        <div className="progress-row">
          <div className="progress">
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="count">{isStudyEmpty ? "0 / 0" : `${safeStudyPosition + 1} / ${studyWords.length}`}</div>
        </div>
        <button className="study-step-button study-step-button--next" type="button" disabled={isStudyEmpty} onClick={nextWord}>
          下一个
        </button>
      </footer>
    </div>
  );
}
