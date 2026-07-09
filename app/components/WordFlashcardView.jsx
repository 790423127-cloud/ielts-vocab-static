"use client";

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
    meaningDetailOpen,
    setMeaningDetailOpen,
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
    toggleFavorite,
    markStatus
  } = chrome;

  return (
    <div className="word-flash-shell">
      <header className="topbar">
        <div className="previous">
          <div className="previous-label">上一个单词</div>
          <div className="previous-word">{prevItem?.word || "—"}</div>
          <div className="previous-meta">
            {fallback(prevItem?.phonetic, "等待音标")} · {fallback(prevItem?.pos, "词性")} · {fallback(prevItem?.meaning, "释义")}
          </div>
        </div>

        <div className="top-actions">
          <button className="top-pill shuffle-pill" onClick={shuffleStudyWords}>随机</button>
          <a className="top-pill spelling-entry-link" href="/spelling-words">单词拼写训练</a>
          <a className="top-pill spelling-entry-link" href="/spelling-phrases">词组拼写训练</a>
          <a className="top-pill spelling-entry-link" href="/meaning">看词选意思 · 核心4500</a>
          <a className="top-pill spelling-entry-link" href="/expressions">口语写作高频表达 · 700</a>
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
          <button className="star-mid" disabled={isStudyEmpty || isExternalIdictationItem} onClick={toggleFavorite} title="收藏">
            {item.favorite ? "⭐" : "☆"}
          </button>

          <div className="example-box">
            <div className="example-head">
              <button
                className="hero-sound-btn"
                type="button"
                onClick={speakExample}
                title="播放例句发音 (空格)"
                aria-label="播放例句发音，快捷键空格"
              >
                <span aria-hidden="true">🔊</span>
                <span>空格·例句</span>
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
              <span aria-hidden="true">🔊</span>
              <span>Tab·单词</span>
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
            <button
              type="button"
              className="meaning-toggle"
              onClick={() => setMeaningDetailOpen((open) => !open)}
              aria-expanded={meaningDetailOpen}
            >
              {meaningDetailOpen ? "收起英文释义" : "展开英文释义"}
            </button>
            {meaningDetailOpen ? (
              <div className="definition meaning-detail">{fallback(item.definition, "等待 AI 生成英文释义")}</div>
            ) : null}
          </div>

          {displayForms.length ? (
            <div className="block">
              <div className="block-title">听力形式 / 重要变形</div>
              <div className="list">
                {displayForms.map((form) => (
                  <div className="item with-sound family-item" key={`${form.word}-${form.type}`}>
                    <button className="mini-sound family-sound" type="button" onClick={() => speakSmallText(form.word, "变形")} title="播放变形发音">
                      🔊
                    </button>
                    <div className="pair-text">
                      <div className="en">{form.word}</div>
                      <div className="zh">{getFormChineseType(form.type)} · {getFormHint(form)}</div>
                      <div className="muted">{getFormExplanation(item.word, item.meaning, form)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {displayFamily.length ? (
            <div className="block">
              <div className="block-title">词族 / 派生词</div>
              <div className="list">
                {displayFamily.map((family) => (
                  <div className="item with-sound family-item" key={`${family.word}-${family.pos}`}>
                    <button className="mini-sound family-sound" type="button" onClick={() => speakSmallText(family.word, "词族")} title="播放词族单词发音">
                      🔊
                    </button>
                    <div className="pair-text">
                      <div className="en">{family.word}</div>
                      <div className="zh">{getPosDisplay(family.pos)}{family.meaning ? ` · ${family.meaning}` : ""}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="block">
            <div className="block-title">常见搭配</div>
            <div className="list">
              {(commonCollocations.length ? commonCollocations : collocationFallback).slice(0, 3).map((pair) => (
                <div className="item with-sound" key={`${pair.phrase}-${pair.chinese}`}>
                  <button className="mini-sound" type="button" disabled={!pair.phrase || pair.phrase.startsWith("等待 AI")} onClick={() => speakSmallText(pair.phrase, "搭配")} title="播放搭配发音">
                    🔊
                  </button>
                  <div className="pair-text">
                    <div className="en">{pair.phrase}</div>
                    {pair.chinese ? <div className="zh">{pair.chinese}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="block">
            <div className="block-title">短语 / 介词搭配</div>
            <div className="list">
              {(phraseCollocations.length ? phraseCollocations : phraseCollocationFallback).slice(0, 3).map((pair) => (
                <div className="item with-sound" key={`${pair.phrase}-${pair.chinese}`}>
                  <button className="mini-sound" type="button" disabled={!pair.phrase || pair.phrase.startsWith("等待 AI")} onClick={() => speakSmallText(pair.phrase, "短语")} title="播放短语发音">
                    🔊
                  </button>
                  <div className="pair-text">
                    <div className="en">{pair.phrase}</div>
                    {pair.chinese ? <div className="zh">{pair.chinese}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="bottombar">
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
      </footer>
    </div>
  );
}
