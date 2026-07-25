"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Library, PanelRightOpen, Pause, Play, Search, Shuffle } from "lucide-react";
import VirtualList from "./VirtualList";
import VocabAdminToolsPanel from "./VocabAdminToolsPanel";
import WordDetailGrid from "./WordDetailGrid";
import WordStudyActions from "./WordStudyActions";
import WordStudyContent from "./WordStudyContent";
import WordStudyOverview from "./WordStudyOverview";
import WordStudyProgress from "./WordStudyProgress";
import { getWordStudyProgressLabel } from "../lib/vocab/word-study-overview.mjs";

function getRelatedWords(item, displayFamily, activeWordPool) {
  const found = new Map();
  const curatedRelations = {
    adopt: ["accept", "embrace", "implement"]
  };
  const add = (entry) => {
    const word = String(entry?.word || "").trim();
    if (!word || word.toLowerCase() === String(item?.word || "").toLowerCase() || found.has(word.toLowerCase())) return;
    found.set(word.toLowerCase(), { word, meaning: entry.meaning || "相关词汇" });
  };

  const curatedWords = curatedRelations[String(item?.word || "").toLowerCase()] || [];
  curatedWords.forEach((target) => add(activeWordPool.find((entry) => String(entry?.word || "").toLowerCase() === target)));
  displayFamily.forEach(add);
  if (found.size >= 3) return [...found.values()].slice(0, 3);
  return [...found.values()].slice(0, 3);
}

/**
 * Existing word-study business logic is supplied through grouped props; this
 * component only owns layout, menus, and lightweight presentation state.
 */
export default function WordFlashcardView({ model, library, speech, admin, chrome }) {
  const [showInsight, setShowInsight] = useState(true);
  const [autoScrollActive, setAutoScrollActive] = useState(false);
  const [autoScrollSeconds, setAutoScrollSeconds] = useState(6);
  const libraryMenuRef = useRef(null);
  const pendingSearchRef = useRef("");
  const initialLibraryIntentHandledRef = useRef(false);
  const nextWordRef = useRef(() => {});

  const {
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
    wordSearchResolution,
    jumpToWordSearchResult,
    selectLibraryWord,
    setLibraryFilter,
    filteredWordIndices,
    activeWordPool,
    activeWordByIndex,
    index,
    getFilterName,
    filterKey,
    isSameFilter,
    resolveStudyWordEntry,
    wordLibraryStats,
    familiarCount,
    missingCount,
    classifyMissingCount,
    repairMissingCount,
    enrichmentThinCount,
    familyReviewCount,
    familyPromotionCount
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
    aiRunState,
    qualityStats,
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
    markStatus,
    tidyReview
  } = chrome;

  const relatedWords = useMemo(
    () => getRelatedWords(item, displayFamily, activeWordPool),
    [activeWordPool, displayFamily, item]
  );

  nextWordRef.current = nextWord;

  useEffect(() => {
    if (!autoScrollActive || isStudyEmpty || studyWords.length < 2) return undefined;

    const timer = window.setInterval(() => {
      const activeElement = document.activeElement;
      const tagName = activeElement?.tagName?.toLowerCase();
      if (
        document.hidden ||
        document.querySelector("details.menu[open]") ||
        tagName === "input" ||
        tagName === "textarea" ||
        activeElement?.isContentEditable
      ) return;

      nextWordRef.current();
      window.requestAnimationFrame(() => {
        document.querySelector(".word-study-progress")?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    }, autoScrollSeconds * 1000);

    return () => window.clearInterval(timer);
  }, [autoScrollActive, autoScrollSeconds, isStudyEmpty, studyWords.length]);

  useEffect(() => {
    const openLibrary = () => {
      if (libraryMenuRef.current) libraryMenuRef.current.open = true;
    };
    const handleSearch = (event) => {
      const query = String(event.detail?.query || "").trim();
      if (!query) return;
      setSearch(query);
      pendingSearchRef.current = query;
      openLibrary();
    };
    const handleFilter = (event) => {
      const type = event.detail?.type;
      if (!type) return;
      setLibraryFilter(type, event.detail?.value || "");
    };

    window.addEventListener("ielts:open-library", openLibrary);
    window.addEventListener("ielts:search-word", handleSearch);
    window.addEventListener("ielts:set-library-filter", handleFilter);

    // Query parameters are navigation intents, not persistent controlled state.
    // setLibraryFilter is supplied by the page and can receive a new identity
    // after a word change, so consume the initial intent only once per mount.
    if (!initialLibraryIntentHandledRef.current) {
      initialLibraryIntentHandledRef.current = true;
      const params = new URLSearchParams(window.location.search);
      if (params.get("openLibrary") === "1") openLibrary();
      const initialFilterType = params.get("filterType");
      if (initialFilterType) setLibraryFilter(initialFilterType, params.get("filterValue") || "");
      const initialSearch = String(params.get("search") || "").trim();
      if (initialSearch) handleSearch({ detail: { query: initialSearch } });
    }

    return () => {
      window.removeEventListener("ielts:open-library", openLibrary);
      window.removeEventListener("ielts:search-word", handleSearch);
      window.removeEventListener("ielts:set-library-filter", handleFilter);
    };
  }, [setLibraryFilter, setSearch]);

  useEffect(() => {
    if (!pendingSearchRef.current || !wordSearchResolution?.target) return;
    jumpToWordSearchResult();
    pendingSearchRef.current = "";
    if (libraryMenuRef.current) libraryMenuRef.current.open = false;
  }, [jumpToWordSearchResult, wordSearchResolution]);

  const rangeMenu = (
    <details className="menu word-study-menu">
      <summary className="top-pill">学习范围</summary>
      <div className="menu-panel wide">
        <h2 className="panel-title">学习入口</h2>
        <p className="panel-desc">主词库保持统一，只切换学习范围和独立进度。</p>
        <div className="current-filter">当前：{getFilterName(filter)} · {studyWords.length} 个词</div>
        {learningEntryGroups.map((group) => (
          <div className="entry-group" key={group.group}>
            <div className="filter-title">{group.group}</div>
            <div className="entry-grid">
              {group.items.map((entry) => (
                <button
                  type="button"
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
  );

  const libraryMenu = (
    <details className="menu word-study-menu" ref={libraryMenuRef}>
      <summary className="top-pill"><Library aria-hidden="true" />词库管理</summary>
      <div className="menu-panel wide">
        <h2 className="panel-title">词库管理</h2>
        <p className="panel-desc">
          可刷 {wordLibraryStats.total} · 词形参考 {wordLibraryStats.references} · 总记录 {wordLibraryStats.physical} · 待学习 {wordLibraryStats.pending} · 不熟 {wordLibraryStats.unfamiliar} · 已认识 {familiarCount} · 必须补全 {missingCount} · 结构异常 {repairMissingCount} · 仅缺分类 {classifyMissingCount} · 可选丰富 {enrichmentThinCount} · 词族复核 {familyReviewCount} · 独立词候选 {familyPromotionCount} · 待整理 {tidyReview?.stats?.review || 0} · 音频 {audioStats.state === "error" ? "核对失败" : audioStats.state !== "ready" ? "核对中" : `${audioStats.has}/${audioStats.total}`}
        </p>
        <div className="current-filter">当前学习范围：{getFilterName(filter)} · {studyWords.length} 个词</div>

        <div className="field word-library-search-field">
          <Search aria-hidden="true" />
          <input type="search" placeholder="搜索单词并跳转" value={search} onChange={(event) => setSearch(event.target.value)} />
          {wordSearchResolution ? (
            <div className="word-search-result" role="status">
              <span>
                {wordSearchResolution.redirected
                  ? `${wordSearchResolution.source.word} 是词形参考，将进入基词 ${wordSearchResolution.target.word}。`
                  : `已找到 ${wordSearchResolution.target.word}。`}
              </span>
              <button type="button" className="chip-btn active" onClick={jumpToWordSearchResult}>跳转到 {wordSearchResolution.target.word}</button>
            </div>
          ) : null}
        </div>

        <div className="filter-group">
          <div className="filter-title">学习状态</div>
          <div className="filter-chips">
            <button type="button" className={`chip-btn ${filter.type === "all" ? "active" : ""}`} onClick={() => setLibraryFilter("all", "")}>全部待学</button>
            <button type="button" className={`chip-btn ${filter.type === "everything" ? "active" : ""}`} onClick={() => setLibraryFilter("everything", "")}>全部可刷词</button>
            <button type="button" className={`chip-btn ${filter.type === "custom" && filter.value === "life-work" ? "active" : ""}`} onClick={() => setLibraryFilter("custom", "life-work")}>生活/工作高频</button>
            {["模糊", "不熟", "熟悉", "收藏"].map((value) => (
              <button type="button" key={value} className={`chip-btn ${filter.type === "status" && filter.value === value ? "active" : ""}`} onClick={() => setLibraryFilter("status", value)}>{value}</button>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <div className="filter-title">词库整理</div>
          <div className="filter-chips">
            {[
              ["review", "看看这些词"],
              ["basic", "基础词候选"],
              ["issues", "可能有问题"]
            ].map(([value, label]) => (
              <button type="button" key={value} className={`chip-btn ${filter.type === "tidy" && filter.value === value ? "active" : ""}`} onClick={() => setLibraryFilter("tidy", value)}>{label}</button>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <div className="filter-title">资料质量</div>
          <div className="filter-chips">
            {[["待补全", "必须补全"], ["待修复", "结构异常"], ["待归纳", "仅缺分类"], ["待丰富", "可选丰富"]].map(([value, label]) => (
              <button type="button" key={value} className={`chip-btn ${filter.type === "status" && filter.value === value ? "active" : ""}`} onClick={() => setLibraryFilter("status", value)}>{label}</button>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <div className="filter-title">IELTS 用途</div>
          <div className="filter-chips">
            {IELTS_USE_OPTIONS.map((value) => <button type="button" key={value} className={`chip-btn ${filter.type === "ieltsUse" && filter.value === value ? "active" : ""}`} onClick={() => setLibraryFilter("ieltsUse", value)}>{value}</button>)}
          </div>
        </div>

        <div className="filter-group">
          <div className="filter-title">爱听写频率</div>
          <div className="filter-chips">
            {IDICTATION_FLASH_FILTERS.map((entry) => <button type="button" key={entry.value} className={`chip-btn ${filter.type === "idictation" && filter.value === entry.value ? "active" : ""}`} onClick={() => setLibraryFilter("idictation", entry.value)}>{entry.label}</button>)}
          </div>
        </div>

        <div className="filter-group">
          <div className="filter-title">主题</div>
          <div className="filter-chips">
            {TOPIC_OPTIONS.map((value) => <button type="button" key={value} className={`chip-btn ${filter.type === "topic" && filter.value === value ? "active" : ""}`} onClick={() => setLibraryFilter("topic", value)}>{value}</button>)}
          </div>
        </div>

        <div className="filter-group">
          <div className="filter-title">难度分类</div>
          <div className="filter-chips">
            {DIFFICULTY_OPTIONS.map((value) => <button type="button" key={value} className={`chip-btn ${filter.type === "difficulty" && filter.value === value ? "active" : ""}`} onClick={() => setLibraryFilter("difficulty", value)}>{value}</button>)}
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
              <button type="button" className={`library-item ${poolIndex === index ? "active" : ""}`} onClick={() => selectLibraryWord(poolIndex)}>
                <span className="library-word">{word.word}</span>
                <span className="library-meta">{word.__idictationFlash ? `${word.category} · ${word.difficulty}` : word.difficulty || "未归纳"}</span>
              </button>
            );
          }}
        />
        <p className="library-list-note">共 {filteredWordIndices.length} 条；继续输入可快速定位。</p>
      </div>
    </details>
  );

  return (
    <div className={`word-flash-shell${showInsight ? "" : " is-insight-collapsed"}`}>
      <div className="word-study-layout">
        <section className="word-study-column" aria-label="单词学习区">
          <WordStudyProgress
            label={getWordStudyProgressLabel(filter, isExternalIdictationItem)}
            title={getFilterName(filter)}
            current={isStudyEmpty ? 0 : safeStudyPosition + 1}
            total={studyWords.length}
            percent={progressPercent}
            actions={(
              <header className="topbar">
                <button type="button" className="top-pill shuffle-pill" onClick={shuffleStudyWords}><Shuffle aria-hidden="true" />随机</button>
                <div className={`auto-scroll-control${autoScrollActive ? " is-active" : ""}`}>
                  <button
                    type="button"
                    className="top-pill auto-scroll-toggle"
                    disabled={isStudyEmpty || studyWords.length < 2}
                    aria-pressed={autoScrollActive}
                    aria-label={autoScrollActive ? "暂停自动滚动" : "开启自动滚动"}
                    title="自动切换到下一个词，不会自动标记熟悉"
                    onClick={() => setAutoScrollActive((active) => !active)}
                  >
                    {autoScrollActive ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                    {autoScrollActive ? "暂停滚动" : "自动滚动"}
                  </button>
                  <select
                    className="auto-scroll-speed"
                    value={autoScrollSeconds}
                    onChange={(event) => setAutoScrollSeconds(Number(event.target.value))}
                    aria-label="自动滚动间隔"
                    title="自动滚动间隔"
                  >
                    <option value={4}>4秒</option>
                    <option value={6}>6秒</option>
                    <option value={10}>10秒</option>
                  </select>
                </div>
                {rangeMenu}
                {libraryMenu}
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
                  aiRunState={aiRunState}
                  qualityStats={qualityStats}
                  pendingAiCount={missingCount}
                  duplicateInfo={duplicateInfo}
                  isExternalIdictationItem={isExternalIdictationItem}
                  actions={adminActions}
                  summaryLabel="工具"
                />
              </header>
            )}
          />

          <article className="word-study-card">
            <div className="word-canvas-tools">
              <span>{studyRangeDetail || "刷词 · 当前项目"}</span>
              <div>
                <button className={`word-canvas-icon${item.favorite ? " is-active" : ""}`} type="button" disabled={isStudyEmpty || isExternalIdictationItem} onClick={toggleFavorite} title="收藏" aria-label="收藏当前单词"><Bookmark aria-hidden="true" /></button>
                {!showInsight ? <button className="word-canvas-icon" type="button" onClick={() => setShowInsight(true)} title="打开学习概览" aria-label="打开学习概览"><PanelRightOpen aria-hidden="true" /></button> : null}
              </div>
            </div>

            {tidyReview?.active && !isStudyEmpty ? (
              <div className="tidy-review-panel" role="status">
                <div>
                  <strong>这个词可能不需要留在主词库</strong>
                  <span>{tidyReview.candidate?.reasons?.join(" · ") || "由整理规则选出"}</span>
                </div>
                <p>你点“留着”后它不会再出现；删除成功后会写入正式主词库文件。</p>
                <small>待看 {tidyReview.stats?.review || 0} · 已留 {tidyReview.stats?.manuallyKept || 0} · 已删记录 {tidyReview.stats?.deleted || 0}</small>
              </div>
            ) : null}

            {item.status === "不熟" ? <div className="unfamiliar-alert">当前词标记为不熟，复习时会优先出现</div> : null}

            <WordStudyContent
              item={item}
              audioInfo={audioInfo}
              displayForms={displayForms}
              fallback={fallback}
              speakExample={speakExample}
              speakWord={speakWord}
            />
            <WordDetailGrid
              item={item}
              displayForms={displayForms}
              displayFamily={displayFamily}
              commonCollocations={commonCollocations}
              phraseCollocations={phraseCollocations}
              collocationFallback={collocationFallback}
              phraseCollocationFallback={phraseCollocationFallback}
              speakSmallText={speakSmallText}
            />
          </article>

          <WordStudyActions
            item={item}
            isStudyEmpty={isStudyEmpty}
            isExternalIdictationItem={isExternalIdictationItem}
            prevWord={prevWord}
            nextWord={nextWord}
            markStatus={markStatus}
            tidyReview={tidyReview}
          />
        </section>

        {showInsight ? (
          <WordStudyOverview
            wordLibraryStats={wordLibraryStats}
            filter={filter}
            filterName={getFilterName(filter)}
            studyWords={studyWords}
            currentPosition={safeStudyPosition}
            isExternalIdictationItem={isExternalIdictationItem}
            relatedWords={relatedWords}
            speakSmallText={speakSmallText}
            onClose={() => setShowInsight(false)}
          />
        ) : null}
      </div>
    </div>
  );
}
