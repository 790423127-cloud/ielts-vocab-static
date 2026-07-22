"use client";

/**
 * Satellite lexicon flashcard shell — same layout/classes as main WordFlashcardView
 * (globals.css word-flash styles). Used by /basic and /reading-g.
 *
 * layoutMode="readingG": compact status bar + no body category card + meta in library panel.
 * layoutMode="default": original behavior for /basic.
 */

import { useEffect } from "react";
import StudyRangeSummary from "./StudyRangeSummary";
import VirtualList from "./VirtualList";
import { getPosDisplay } from "../lib/vocab/pos-display.mjs";
import rgStyles from "../reading-g/reading-g.module.css";

function fallback(value, text) {
  return value && String(value).trim() ? value : text;
}

function normalizePhraseItems(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return { phrase: item, chinese: "" };
      return {
        phrase: item?.phrase || item?.text || "",
        chinese: item?.chinese || item?.translation || item?.meaning || ""
      };
    })
    .filter((item) => item.phrase);
}

function filterKeyOf(filter) {
  if (!filter || typeof filter !== "object") return "all";
  if (filter.type === "all") return "all";
  if (filter.type === "everything") return "everything";
  if (filter.type === "stage1") return "stage1";
  if (filter.type === "active") return "active";
  if (filter.type === "reference") return "reference";
  if (filter.type === "paraphrase") return "paraphrase";
  if (filter.type === "paraphraseQuiz") {
    return `paraphraseQuiz:${filter.sessionMode || "guided"}`;
  }
  return `${filter.type}:${filter.value || ""}`;
}

function isSameFilter(a, b) {
  return filterKeyOf(a) === filterKeyOf(b);
}

function layerLabel(id, layerMeta = []) {
  const hit = layerMeta.find((l) => l.id === id);
  return hit?.label || id;
}

function displaySatelliteCategory(value, isReadingG) {
  const s = String(value || "").trim();
  if (isReadingG && (/IELTS\s*G类|阅读核心|G类阅读/i.test(s) || !s)) return "G类阅读提升";
  return s || "";
}

function isRepeatedSenseExample(senses, index) {
  const current = String(senses[index]?.example || senses[index]?.exampleEn || "").trim();
  if (!current) return false;
  return senses.slice(0, index).some((sense) =>
    String(sense?.example || sense?.exampleEn || "").trim() === current
  );
}

/**
 * @param {"default"|"readingG"} [props.layoutMode]
 * @param {string} [props.studyPathNote] - only shown inside 筛选 panel (readingG)
 * @param {Array} [props.layerMeta] - [{id,label}] for library panel
 * @param {Array} [props.relatedParas] - paraphrase groups for library panel
 * @param {object} [props.paraStatusMap]
 * @param {function} [props.onParaphraseMaster]
 */
export default function SatelliteLexiconFlashcard({
  modeLabel,
  rangeTitle,
  rangeMeta,
  rangeDetail,
  prevItem,
  item,
  isStudyEmpty,
  isFavorite,
  itemStatus,
  filter,
  learningEntryGroups = [],
  libraryRows = [],
  index,
  safeStudyPosition,
  studyCount,
  progressPercent,
  search,
  setSearch,
  onFilter,
  onJumpIndex,
  onMarkFamiliar,
  onMarkUnfamiliar,
  onToggleFavorite,
  onSpeakWord,
  onSpeakExample,
  onSpeakSmall,
  onShuffle,
  statsLine,
  toast,
  extraLinks = [],
  chipGroups = [],
  layoutMode = "default",
  studyPathNote = "",
  layerMeta = [],
  relatedParas = [],
  paraStatusMap = {},
  onParaphraseMaster,
  /** paraphrase MCQ mode */
  quizMode = false,
  quizQuestion = null,
  quizRevealed = false,
  quizSelectedIndex = null,
  onQuizSelect = null,
  quizLearning = null,
  onQuizStartRecall = null,
  onQuizRevealRecall = null,
  onQuizRateRecall = null,
  onQuizNext = null,
  onQuizContinueRound = null,
  onQuizReviewWrong = null,
  onQuizResume = null,
  onQuizRestartSession = null,
  familiarLabel = "熟悉",
  unfamiliarLabel = "不熟",
  panelStatusCounts = null,
  sensesExtra = null
}) {
  const isReadingG = layoutMode === "readingG";
  const commonCollocations = normalizePhraseItems(item?.collocations);
  const phraseCollocations = normalizePhraseItems(item?.phraseCollocations);
  const collocationFallback = [{ phrase: "暂无搭配", chinese: "" }];
  const phraseCollocationFallback = [{ phrase: "暂无短语搭配", chinese: "" }];
  const speakSmall = onSpeakSmall || (() => {});
  const progressLabel = isStudyEmpty
    ? "0 / 0"
    : `${safeStudyPosition + 1} / ${studyCount}`;
  const senses = Array.isArray(item?.senses) ? item.senses : [];
  const supplementalSenses = senses.slice(1);
  const selectFilter = (nextFilter) => {
    onFilter(nextFilter);
    document.querySelectorAll("details.menu[open]").forEach((menu) => {
      menu.open = false;
    });
  };

  useEffect(() => {
    function closeOtherMenus(openMenu) {
      document.querySelectorAll("details.menu").forEach((menu) => {
        if (menu !== openMenu) menu.open = false;
      });
    }

    function handleToggle(event) {
      if (event.currentTarget?.open) closeOtherMenus(event.currentTarget);
    }

    function handlePointerDown(event) {
      if (!event.target.closest(".top-actions") && !event.target.closest(`.${rgStyles.rgStatusBar}`)) {
        document.querySelectorAll("details.menu").forEach((menu) => {
          menu.open = false;
        });
      }
    }

    const menus = Array.from(document.querySelectorAll("details.menu"));
    menus.forEach((menu) => menu.addEventListener("toggle", handleToggle));
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      menus.forEach((menu) => menu.removeEventListener("toggle", handleToggle));
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  const filterPanelBody = (
    <>
      <h2 className="panel-title">筛选</h2>
      <p className="panel-desc">
        {isReadingG
          ? "选择学习范围。完整路线见面板底部说明。"
          : `${modeLabel}独立词库；每个入口单独记当前位置，不改动主词库。`}
      </p>

      <div className="current-filter">
        当前：{rangeTitle} · {studyCount} 个词
      </div>

      {panelStatusCounts ? (
        <p className="panel-desc" style={{ marginTop: 4 }}>
          词义熟悉 {panelStatusCounts.meaningFamiliar ?? 0} · 短语熟悉{" "}
          {panelStatusCounts.phraseFamiliar ?? 0} · 同义替换掌握{" "}
          {panelStatusCounts.paraphraseFamiliar ?? 0}
        </p>
      ) : null}

      {learningEntryGroups.map((group) => (
        <div className="entry-group" key={group.group}>
          <div className="filter-title">{group.group}</div>
          <div className="entry-grid">
            {group.items.map((entry) => (
              <button
                key={`${entry.title}-${filterKeyOf(entry.filter)}`}
                type="button"
                className={`entry-btn ${isSameFilter(filter, entry.filter) ? "active" : ""}`}
                onClick={() => selectFilter(entry.filter)}
              >
                <span className="entry-title">{entry.title}</span>
                <span className="entry-desc">{entry.desc}</span>
                <span className="entry-meta">{entry.count} 个</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {chipGroups.map((group) => (
        <div className="filter-group" key={group.title}>
          <div className="filter-title">{group.title}</div>
          <div className="filter-chips">
            {group.chips.map((chip) => (
              <button
                key={`${group.title}-${chip.label}`}
                type="button"
                className={`chip-btn ${isSameFilter(filter, chip.filter) ? "active" : ""}`}
                onClick={() => selectFilter(chip.filter)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {isReadingG && studyPathNote ? (
        <p className={rgStyles.rgPathNote}>{studyPathNote}</p>
      ) : null}
    </>
  );

  const libraryCurrentWordMeta =
    isReadingG && item?.word && !isStudyEmpty ? (
      <div className={rgStyles.rgMetaSection}>
        <div className={rgStyles.rgMetaTitle}>1. 当前词条基本信息</div>
        <p className={rgStyles.rgMetaLine}>
          <strong>{item.word}</strong>
          {item.entryType === "phrase" ? " · 词组" : " · 单词"}
        </p>
        <p className={rgStyles.rgMetaLine}>
          {fallback(getPosDisplay(item.pos), "词性")} · {fallback(item.meaning, "—")}
        </p>
        <p className={rgStyles.rgMetaLine}>
          学习模式：{item.studyMode === "reference" ? "reference（查阅）" : "active（待学）"}
          {item.primaryLayer ? ` · 主层 ${layerLabel(item.primaryLayer, layerMeta)}` : ""}
        </p>

        <div className={rgStyles.rgMetaTitle}>2. 所属学习层</div>
        <div className={rgStyles.rgTagRow}>
          {(item.layers || []).length ? (
            (item.layers || []).map((id) => (
              <span key={id} className={rgStyles.rgTag}>
                {layerLabel(id, layerMeta)}
              </span>
            ))
          ) : (
            <span className={rgStyles.rgMetaLine}>—</span>
          )}
        </div>

        <div className={rgStyles.rgMetaTitle}>3. 主题领域</div>
        <div className={rgStyles.rgTagRow}>
          {item.domain ? <span className={rgStyles.rgTagNeutral}>{item.domain}</span> : null}
          {item.category ? <span className={rgStyles.rgTagNeutral}>{displaySatelliteCategory(item.category, isReadingG)}</span> : null}
          {(item.topics || []).map((t) => (
            <span key={`t-${t}`} className={rgStyles.rgTagNeutral}>
              {t}
            </span>
          ))}
          {(item.ieltsUse || []).map((u) => (
            <span key={`u-${u}`} className={rgStyles.rgTagNeutral}>
              {u}
            </span>
          ))}
          {!item.domain &&
          !item.category &&
          !(item.topics || []).length &&
          !(item.ieltsUse || []).length ? (
            <span className={rgStyles.rgMetaLine}>—</span>
          ) : null}
        </div>

        <div className={rgStyles.rgMetaTitle}>4. 同义替换关系</div>
        {relatedParas.length ? (
          relatedParas.map((g) => {
            const st = paraStatusMap[g.groupId] || {};
            return (
              <div key={g.groupId} className={rgStyles.rgParaItem}>
                <div>
                  <strong>
                    {g.anchor} ↔ {(g.members || []).join(" / ")}
                  </strong>
                </div>
                <div>
                  {g.relationType}
                  {g.commonMeaningZh ? ` · ${g.commonMeaningZh}` : ""}
                  {g.canAutoQuiz ? " · 可训练" : ""}
                </div>
                {g.differenceZh ? <div>差别：{g.differenceZh}</div> : null}
                {onParaphraseMaster ? (
                  <div className={rgStyles.rgParaActions}>
                    <button type="button" onClick={() => onParaphraseMaster(g.groupId, true)}>
                      {st.mastered ? "已掌握 ✓" : "标记掌握"}
                    </button>
                    <button type="button" onClick={() => onParaphraseMaster(g.groupId, false)}>
                      未掌握
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <p className={rgStyles.rgMetaLine}>本词暂无高可信同义关系</p>
        )}

        <div className={rgStyles.rgMetaTitle}>5. 熟词生义</div>
        {(item.senses || []).length > 1 ? (
          (item.senses || []).map((s, i) => (
            <p key={s.senseId || i} className={rgStyles.rgMetaLine}>
              {i + 1}. [{getPosDisplay(s.pos) || "—"}] {s.meaningZh || ""}
            </p>
          ))
        ) : (
          <p className={rgStyles.rgMetaLine}>
            {(item.senses || [])[0]?.meaningZh || item.meaning || "—"}
          </p>
        )}

        <div className={rgStyles.rgMetaTitle}>6. 来源信息</div>
        <p className={rgStyles.rgMetaLine}>
          {(item.sourceFiles || []).length
            ? (item.sourceFiles || []).join(" · ")
            : "—"}
        </p>
        {(item.qualityFlags || []).length ? (
          <div className={rgStyles.rgTagRow}>
            {(item.qualityFlags || []).slice(0, 12).map((f) => (
              <span key={f} className={rgStyles.rgTagNeutral}>
                {f}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    ) : null;

  return (
    <main className={`page page--word-flash${isReadingG ? " reading-g-study" : ""}`}>
      <div className="word-flash-shell is-insight-collapsed">
        <header className="topbar">
          <div className="previous">
            <div className="previous-label">上一个单词</div>
            <div className="previous-word">{prevItem?.word || "—"}</div>
            <div className="previous-meta">
              {fallback(prevItem?.phonetic, "等待音标")} ·{" "}
              {fallback(getPosDisplay(prevItem?.pos), "词性")} ·{" "}
              {fallback(prevItem?.meaning, "释义")}
            </div>
          </div>

          <div className="top-actions">
            {onShuffle ? (
              <button type="button" className="top-pill shuffle-pill" onClick={onShuffle}>
                随机
              </button>
            ) : null}
            <a className="top-pill spelling-entry-link" href="/">
              ← 主词库
            </a>
            {extraLinks.map((link) => (
              <a key={link.href} className="top-pill spelling-entry-link" href={link.href}>
                {link.label}
              </a>
            ))}

            {!isReadingG ? (
              <details className="menu">
                <summary className="top-pill">更改范围</summary>
                <div className="menu-panel wide">{filterPanelBody}</div>
              </details>
            ) : null}

            <details className="menu">
              <summary className="top-pill">词库面板</summary>
              <div className="menu-panel wide">
                <h2 className="panel-title">词库</h2>
                {isReadingG ? (
                  <p className="panel-desc">当前词详细信息与词表检索。类目/层级仅在此查看。</p>
                ) : (
                  <p className="panel-desc">{statsLine}</p>
                )}

                {libraryCurrentWordMeta}

                {!isReadingG ? (
                  <div className="current-filter">
                    当前学习范围：{rangeTitle} · {studyCount} 个词
                  </div>
                ) : null}

                <div className="field">
                  <input
                    type="text"
                    placeholder="搜索单词"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                {!isReadingG
                  ? chipGroups.map((group) => (
                      <div className="filter-group" key={group.title}>
                        <div className="filter-title">{group.title}</div>
                        <div className="filter-chips">
                          {group.chips.map((chip) => (
                            <button
                              key={`${group.title}-${chip.label}`}
                              type="button"
                              className={`chip-btn ${isSameFilter(filter, chip.filter) ? "active" : ""}`}
                              onClick={() => selectFilter(chip.filter)}
                            >
                              {chip.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  : null}

                <VirtualList
                  className="library-list library-list--virtual"
                  items={libraryRows}
                  itemHeight={58}
                  height={300}
                  resetKey={`${filterKeyOf(filter)}:${search}:${libraryRows.length}`}
                  getKey={(row) => `${row.entry?.word || ""}-${row.originalIndex}`}
                  renderItem={(row) => {
                    const word = row.entry;
                    if (!word) return null;
                    const metaBits = [];
                    if (word.primaryLayer) {
                      metaBits.push(layerLabel(word.primaryLayer, layerMeta));
                    }
                    if (word.entryType === "phrase") metaBits.push("词组");
                    if (word.studyMode === "reference") metaBits.push("查阅");
                    return (
                      <div
                        className={`library-item ${row.originalIndex === index ? "active" : ""}`}
                        onClick={() => onJumpIndex(row.originalIndex)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onJumpIndex(row.originalIndex);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="library-word">
                          {word.entryType === "phrase" ? "[词组] " : ""}
                          {word.word}
                        </div>
                        <div className="library-meta">
                          {metaBits.length
                            ? metaBits.join(" · ")
                            : word.difficulty || displaySatelliteCategory(word.category, isReadingG) || "—"}
                        </div>
                      </div>
                    );
                  }}
                />
                <p className="library-list-note">
                  共 {libraryRows.length} 条，已启用虚拟滚动；继续输入搜索可快速定位。
                </p>
                {isReadingG && statsLine ? (
                  <p className={rgStyles.rgPathNote}>{statsLine}</p>
                ) : null}
              </div>
            </details>
          </div>
        </header>

        {isReadingG ? (
          <div className={rgStyles.rgStatusBar}>
            <div className={rgStyles.rgStatusLeft}>
              <span className={rgStyles.rgModePill}>{modeLabel || "G类阅读提升"}</span>
              <span className={rgStyles.rgFilterName} title={rangeMeta || rangeTitle}>
                {rangeTitle}
                {rangeMeta ? (
                  <span style={{ display: "block", fontSize: 11, fontWeight: 650, color: "#6b7c8a" }}>
                    {rangeMeta}
                  </span>
                ) : null}
              </span>
            </div>
            <div className={rgStyles.rgStatusRight}>
              <span className={rgStyles.rgProgressText}>{progressLabel}</span>
              <details className="menu">
                <summary className={rgStyles.rgFilterBtn}>筛选</summary>
                <div className={`menu-panel wide ${rgStyles.rgFilterPanel}`}>{filterPanelBody}</div>
              </details>
            </div>
          </div>
        ) : (
          <StudyRangeSummary
            mode={modeLabel}
            title={rangeTitle}
            meta={rangeMeta}
            detail={rangeDetail}
            className="word-study-range"
          />
        )}

        <section className="main">
          <div className="center">
            <button
              className="star-mid"
              type="button"
              disabled={isStudyEmpty}
              onClick={onToggleFavorite}
              title="收藏"
            >
              {isFavorite ? "⭐" : "☆"}
            </button>

            <div className="example-box">
              <div className="example-head">
                <button
                  className="hero-sound-btn"
                  type="button"
                  onClick={onSpeakExample}
                  title="播放例句发音 (空格)"
                  aria-label="播放例句发音，快捷键空格"
                >
                  <span aria-hidden="true">🔊</span>
                  <span>空格·例句</span>
                </button>
              </div>
              <div
                className="example-clickable"
                onClick={onSpeakExample}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSpeakExample();
                  }
                }}
              >
                <div className="example">{fallback(item?.example, "暂无例句")}</div>
                <div className="example-cn">{fallback(item?.exampleCn, "暂无例句中文")}</div>
              </div>
            </div>

            {itemStatus === "不熟" ? (
              <div className="unfamiliar-alert">当前词标记为不熟，复习时会优先出现</div>
            ) : null}

            {quizMode ? (
              <div className={rgStyles.rgQuizWrap}>
                {quizLearning?.resumeOffer ? (
                  <div className={rgStyles.rgLearningCard}>
                    <div className={rgStyles.rgStageEyebrow}>未完成的同义学习</div>
                    <h2>继续上次同义学习</h2>
                    <p>上次停在第 {quizLearning.resumeOffer.currentIndex + 1} 个任务，长期覆盖与旧掌握状态均已保留。</p>
                    <div className={rgStyles.rgActionRow}>
                      <button type="button" className={rgStyles.rgPrimaryAction} onClick={onQuizResume}>继续</button>
                      <button type="button" className={rgStyles.rgSecondaryAction} onClick={onQuizRestartSession}>重新开始本轮</button>
                    </div>
                  </div>
                ) : quizLearning?.stage === "summary" ? (
                  <div className={rgStyles.rgLearningCard}>
                    <div className={rgStyles.rgStageEyebrow}>本轮总结</div>
                    <h2>{quizLearning.mode === "guided" ? "引导学习完成" : quizLearning.mode === "full" ? "完整测验完成" : "快速测验完成"}</h2>
                    <div className={rgStyles.rgSummaryGrid}>
                      <span>本轮组数 <strong>{quizLearning.summary?.groupCount || 0}</strong></span>
                      <span>关系预览 <strong>{quizLearning.summary?.previewCompleted || 0}</strong></span>
                      <span>主动回忆通过 <strong>{quizLearning.summary?.recallPassed || 0}</strong></span>
                      <span>四选一正确 <strong>{quizLearning.summary?.correct || 0}</strong></span>
                      <span>错误 <strong>{quizLearning.summary?.wrong || 0}</strong></span>
                      <span>模糊 <strong>{quizLearning.summary?.uncertain || 0}</strong></span>
                      <span>首次掌握 <strong>{quizLearning.summary?.firstMastered || 0}</strong></span>
                      <span>合法方向完成 <strong>{quizLearning.summary?.legalDirectionsCompleted || 0}</strong></span>
                      <span>进入复习 <strong>{quizLearning.summary?.reviewCount || 0}</strong></span>
                      <span>累计覆盖 <strong>{quizLearning.cumulative || 0} / {quizLearning.poolSize || 233}</strong></span>
                    </div>
                    {quizLearning.focusLabels?.length ? (
                      <div className={rgStyles.rgFocusList}>本轮重点：{quizLearning.focusLabels.join(" · ")}</div>
                    ) : null}
                    <div className={rgStyles.rgActionRow}>
                      <button type="button" className={rgStyles.rgPrimaryAction} onClick={onQuizContinueRound}>继续下一轮</button>
                      {quizLearning.summary?.reviewCount ? <button type="button" className={rgStyles.rgSecondaryAction} onClick={onQuizReviewWrong}>复习本轮错题</button> : null}
                      <button type="button" className={rgStyles.rgSecondaryAction} onClick={() => selectFilter({ type: "learnMode", value: "meaning" })}>返回词义学习</button>
                    </div>
                  </div>
                ) : quizLearning?.stage === "preview" ? (
                  <div className={rgStyles.rgLearningCard}>
                    <div className={rgStyles.rgStageEyebrow}>阶段 1 · 关系预览</div>
                    <div className={rgStyles.rgRelationPair}>
                      <strong>{quizLearning.group?.anchor || "—"}</strong>
                      <span>↔</span>
                      <strong>{quizLearning.group?.members?.[0] || "—"}</strong>
                    </div>
                    {quizLearning.group?.commonMeaningZh ? <div className={rgStyles.rgMeaningLine}>共同义：{quizLearning.group.commonMeaningZh}</div> : null}
                    {quizLearning.group?.differenceZh ? <div className={rgStyles.rgDifferenceLine}>区别：{quizLearning.group.differenceZh}</div> : null}
                    {quizLearning.context ? <div className={rgStyles.rgContextLine}>真题语境：{quizLearning.context}</div> : null}
                    <div className={rgStyles.rgActionRow}>
                      <button type="button" className={rgStyles.rgPrimaryAction} onClick={onQuizStartRecall}>开始回忆</button>
                    </div>
                  </div>
                ) : quizLearning?.stage === "recall" ? (
                  <div className={rgStyles.rgLearningCard}>
                    <div className={rgStyles.rgStageEyebrow}>阶段 2 · 主动回忆</div>
                    <div className={rgStyles.rgRecallPrompt}>
                      <strong>{quizLearning.recallPrompt}</strong><span>→</span><strong>?</strong>
                    </div>
                    {quizLearning.recallRevealed ? (
                      <>
                        <div className={rgStyles.rgRecallAnswer}>{quizLearning.recallAnswer}</div>
                        <div className={rgStyles.rgActionRow}>
                          <button type="button" className={rgStyles.rgPrimaryAction} onClick={() => onQuizRateRecall?.("know")}>会</button>
                          <button type="button" className={rgStyles.rgSecondaryAction} onClick={() => onQuizRateRecall?.("uncertain")}>模糊</button>
                          <button type="button" className={rgStyles.rgDangerAction} onClick={() => onQuizRateRecall?.("dontKnow")}>不会</button>
                        </div>
                      </>
                    ) : (
                      <div className={rgStyles.rgActionRow}>
                        <button type="button" className={rgStyles.rgPrimaryAction} onClick={onQuizRevealRecall}>显示答案</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={rgStyles.rgLearningCard}>
                    <div className={rgStyles.rgStageEyebrow}>{quizLearning?.stage === "feedback" ? "阶段 3 · 验证反馈" : quizLearning?.mode === "guided" ? "阶段 3 · 四选一验证" : "四选一验证"}</div>
                    <div className={rgStyles.rgQuizStem}>{quizQuestion?.stem || "—"}</div>
                    <div className={rgStyles.rgQuizHint}>选择最接近的替换表达</div>
                    <div className={rgStyles.rgQuizOptions}>
                    {(quizQuestion?.options || []).map((opt, oi) => {
                    let cls = rgStyles.rgQuizOpt;
                    if (quizRevealed && oi === quizQuestion.correctIndex) {
                      cls += ` ${rgStyles.rgQuizCorrect}`;
                    } else if (
                      quizRevealed &&
                      quizSelectedIndex === oi &&
                      oi !== quizQuestion.correctIndex
                    ) {
                      cls += ` ${rgStyles.rgQuizWrong}`;
                    } else if (!quizRevealed && quizSelectedIndex === oi) {
                      cls += ` ${rgStyles.rgQuizPicked}`;
                    }
                    return (
                      <button
                        key={`${opt}-${oi}`}
                        type="button"
                        className={cls}
                        disabled={quizRevealed}
                        onClick={() => onQuizSelect && onQuizSelect(oi)}
                      >
                        <span className={rgStyles.rgQuizLetter}>
                          {String.fromCharCode(65 + oi)}.
                        </span>{" "}
                        {opt}
                      </button>
                    );
                    })}
                    </div>
                {quizRevealed && quizQuestion ? (
                  <div className={rgStyles.rgQuizExplain}>
                    <div>
                      正确答案：<strong>{quizQuestion.correct}</strong>
                    </div>
                    {quizQuestion.meta?.commonMeaningZh ? (
                      <div>共同中文义：{quizQuestion.meta.commonMeaningZh}</div>
                    ) : null}
                    {quizQuestion.meta?.relationType ? (
                      <div>关系：{quizQuestion.meta.relationType}</div>
                    ) : null}
                    <div>
                      差别：
                      {quizQuestion.meta?.differenceZh ||
                        "两者在本题语境中意义接近，使用场景可能不同。"}
                    </div>
                    {quizQuestion.meta?.posConstraint ? (
                      <div>词性限制：{quizQuestion.meta.posConstraint}</div>
                    ) : null}
                    <div className={rgStyles.rgMetaLine}>
                      题干「{quizQuestion.stem}」与「{quizQuestion.correct}
                      」在当前语境中最接近。
                    </div>
                    <div className={rgStyles.rgMetaLine}>你选择：{quizSelectedIndex == null ? "未选择" : quizQuestion.options?.[quizSelectedIndex]}</div>
                  </div>
                ) : null}
                    {quizLearning?.stage === "feedback" ? (
                      <div className={rgStyles.rgActionRow}>
                        <button type="button" className={rgStyles.rgPrimaryAction} onClick={onQuizNext}>下一题</button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="word-hero">
                  <button
                    className="hero-sound-btn"
                    type="button"
                    onClick={onSpeakWord}
                    title="播放单词发音 (Tab)"
                    aria-label="播放单词发音，快捷键 Tab"
                  >
                    <span aria-hidden="true">🔊</span>
                    <span>Tab·单词</span>
                  </button>
                  <div
                    className="word-clickable"
                    onClick={onSpeakWord}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSpeakWord();
                      }
                    }}
                  >
                    <div className="word">{item?.word || "—"}</div>
                    <div className="word-sub">
                      <span className="phonetic">{fallback(item?.phonetic, "等待音标")}</span>
                      <span className="pos">
                        {fallback(
                          getPosDisplay(
                            item?.pos || (item?.entryType === "phrase" ? "phrase" : "")
                          ),
                          item?.entryType === "phrase" ? "phrase 短语" : "词性"
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="meaning-block">
                  <div className="meaning-primary">{fallback(item?.meaning, "等待释义")}</div>
                  {isReadingG && supplementalSenses.length ? (
                    <div className={rgStyles.rgSensesWrap}>
                      <div className={rgStyles.rgSensesLabel}>补充义项 · {supplementalSenses.length}</div>
                      <div
                        className={rgStyles.rgSensesPanel}
                        aria-label={`${supplementalSenses.length} 个补充义项`}
                      >
                        {supplementalSenses.map((s, i) => {
                          const sourceIndex = i + 1;
                          const repeatedExample = isRepeatedSenseExample(senses, sourceIndex);
                          const example = s.example || s.exampleEn || "";
                          const exampleZh = s.exampleCn || s.exampleZh || "";
                          const hasUniqueExample = !repeatedExample && Boolean(example || exampleZh);
                          return (
                            <div
                              key={s.senseId || sourceIndex}
                              className={rgStyles.rgSenseRow}
                              data-has-example={hasUniqueExample ? "true" : "false"}
                            >
                              <div className={rgStyles.rgSenseMeaning}>
                                <strong>[{getPosDisplay(s.pos) || "—"}]</strong>{" "}
                                {s.meaningZh || s.meaning || "—"}
                                {s.isPrimary || s.readingCommon ? (
                                  <span className={rgStyles.rgSenseTag}>阅读常用</span>
                                ) : null}
                              </div>
                              {hasUniqueExample ? (
                                <div className={rgStyles.rgSenseExample}>
                                  {example ? <div className={rgStyles.rgSenseExampleEn}>{example}</div> : null}
                                  {exampleZh ? <div className={rgStyles.rgSenseExampleZh}>{exampleZh}</div> : null}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  {sensesExtra}
                </div>

                <div className={isReadingG ? rgStyles.rgFooterGrid : undefined}>
                  <div className="grid footer-grid">
                    <div className="block">
                      <div className="block-title">常见搭配</div>
                      <div className="list">
                        {(commonCollocations.length ? commonCollocations : collocationFallback)
                          .slice(0, 3)
                          .map((pair) => (
                            <div
                              className="item with-sound"
                              key={`${pair.phrase}-${pair.chinese}`}
                            >
                              <button
                                className="mini-sound"
                                type="button"
                                disabled={!pair.phrase || pair.phrase === "暂无搭配"}
                                onClick={() => speakSmall(pair.phrase, "搭配")}
                                title="播放搭配发音"
                              >
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
                        {(phraseCollocations.length
                          ? phraseCollocations
                          : phraseCollocationFallback
                        )
                          .slice(0, 3)
                          .map((pair) => (
                            <div
                              className="item with-sound"
                              key={`${pair.phrase}-${pair.chinese}`}
                            >
                              <button
                                className="mini-sound"
                                type="button"
                                disabled={!pair.phrase || pair.phrase === "暂无短语搭配"}
                                onClick={() => speakSmall(pair.phrase, "短语")}
                                title="播放短语发音"
                              >
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

                    {/* 分类标签卡片：readingG 模式正文彻底不展示；default 保留给 /basic */}
                    {!isReadingG &&
                    (item?.domain || item?.ieltsUse?.length || item?.topics?.length) ? (
                      <div className="block">
                        <div className="block-title">分类标签</div>
                        <div className="list">
                          {item.domain ? (
                            <div className="item">
                              <div className="pair-text">
                                <div className="en">领域</div>
                                <div className="zh">{item.domain}</div>
                              </div>
                            </div>
                          ) : null}
                          {(item.ieltsUse || []).slice(0, 6).map((tag) => (
                            <div className="item" key={`use-${tag}`}>
                              <div className="pair-text">
                                <div className="en">{tag}</div>
                                <div className="zh">IELTS 用途</div>
                              </div>
                            </div>
                          ))}
                          {(item.topics || []).slice(0, 6).map((tag) => (
                            <div className="item" key={`topic-${tag}`}>
                              <div className="pair-text">
                                <div className="en">{tag}</div>
                                <div className="zh">主题</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        <footer className="bottom bottombar bottombar--status-only">
          {!quizMode ? <div className="actions">
            <button
              type="button"
              className="status known"
              disabled={isStudyEmpty && !quizMode}
              onClick={onMarkFamiliar}
              title="快捷键：0 / 2"
            >
              {familiarLabel}
            </button>
            <button
              type="button"
              className={`status unknown ${itemStatus === "不熟" ? "active-unknown" : ""}`}
              disabled={isStudyEmpty && !quizMode}
              onClick={onMarkUnfamiliar}
              title="快捷键：1"
            >
              {itemStatus === "不熟"
                ? unfamiliarLabel === "未掌握" || unfamiliarLabel === "不熟此替换"
                  ? `取消${unfamiliarLabel}`
                  : "取消不熟"
                : unfamiliarLabel}
            </button>
          </div> : null}

          <div className="progress-row">
            <div className="progress">
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="count">
              {isStudyEmpty ? "0 / 0" : `${safeStudyPosition + 1} / ${studyCount}`}
            </div>
          </div>
        </footer>

        <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
      </div>
    </main>
  );
}
