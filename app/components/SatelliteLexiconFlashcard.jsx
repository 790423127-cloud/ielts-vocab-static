"use client";

/**
 * Satellite lexicon flashcard shell — same layout/classes as main WordFlashcardView
 * (globals.css word-flash styles). Used by /basic and /reading-g.
 *
 * layoutMode="readingG": compact status bar + no body category card + meta in library panel.
 * layoutMode="default": original behavior for /basic.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, PanelRightOpen, Pause, Play, Shuffle } from "lucide-react";
import VirtualList from "./VirtualList";
import WordStudyOverview from "./WordStudyOverview";
import WordStudyProgress from "./WordStudyProgress";
import WordStudyWorkspace from "./WordStudyWorkspace";
import {
  normalizeReadingGForms,
  normalizeReadingGWordFamily
} from "../lib/reading-g-vocab/morphology.mjs";
import { getFormChineseType } from "../lib/vocab/page-word-helpers.mjs";
import StudyMeaningToggle from "./StudyMeaningToggle";
import WordStudyOrderControls from "./WordStudyOrderControls";
import { getPosDisplay } from "../lib/vocab/pos-display.mjs";
import { WORD_CARD_SWIPE_EVENT } from "../lib/vocab/word-flashcard-swipe.mjs";
import rgStyles from "../reading-g/reading-g.module.css";

const AUTO_PLAY_SPEEDS = [2, 4, 6, 10];

function fallback(value, text) {
  return value && String(value).trim() ? value : text;
}

function meaningComparisonKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s，,。；;：:、（）()\[\]【】“”"'·\/\\-]+/g, "");
}

function chineseMeaningParts(value) {
  return String(value || "")
    .split(/[，,。；;：:、\/（）()\[\]【】]+/)
    .map((part) => part.trim())
    .filter((part) => /[\u3400-\u9fff]/u.test(part));
}

function additionalMeaningParts(candidateMeaning, currentMeaning) {
  const currentKeys = new Set(chineseMeaningParts(currentMeaning).map(meaningComparisonKey));
  return chineseMeaningParts(candidateMeaning)
    .filter((part) => !currentKeys.has(meaningComparisonKey(part)))
    .filter((part, index, parts) =>
      parts.findIndex((candidate) =>
        meaningComparisonKey(candidate) === meaningComparisonKey(part)
      ) === index
    )
    .join("；");
}

function compactPosLabel(value) {
  const primary = String(value || "")
    .trim()
    .toLowerCase()
    .split(/\s*(?:\/|\||,|;)\s*/)[0];
  const labels = [
    [/\bpreposition\b|介词/u, "介"],
    [/\bconjunction\b|连词/u, "连"],
    [/\badjective\b|\badj\b|形容词/u, "形"],
    [/\badverb\b|\badv\b|副词/u, "副"],
    [/\bpronoun\b|代词/u, "代"],
    [/\bdeterminer\b|限定词/u, "限"],
    [/\bnumeral\b|\bnumber\b|数词/u, "数"],
    [/\bverb\b|\bv\b|动词/u, "动"],
    [/\bnoun\b|\bn\b|名词/u, "名"],
    [/\bphrase\b|短语/u, "短"]
  ];
  return labels.find(([pattern]) => pattern.test(primary))?.[1] || "";
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
  onPositionCommit = null,
  getPositionPreview = null,
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
  onShuffle = null,
  wordOrderMode = "current",
  wordOrderDifficultyMode = "default",
  wordOrderDifficultyAvailable = true,
  wordOrderDifficultyEnabled = true,
  wordOrderDifficultyProfile = null,
  onWordOrderModeChange = null,
  onWordDifficultyModeChange = null,
  statsLine,
  toast,
  extraLinks = [],
  extraActions = null,
  chipGroups = [],
  layoutMode = "default",
  studyPathNote = "",
  layerMeta = [],
  relatedParas = [],
  paraStatusMap = {},
  onParaphraseMaster,
  contentQuality = null,
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
  sensesExtra = null,
  overviewWords = [],
  overviewStats = {},
  onPrev = null,
  onNext = null
}) {
  const [showInsight, setShowInsight] = useState(true);
  const [showRelatedMeanings, setShowRelatedMeanings] = useState(true);
  const [autoPlayActive, setAutoPlayActive] = useState(false);
  const [autoPlaySeconds, setAutoPlaySeconds] = useState(6);
  const [showSupplementalSenses, setShowSupplementalSenses] = useState(false);
  const [paraphraseSelection, setParaphraseSelection] = useState({
    itemKey: "",
    replacement: ""
  });
  const wordStudyCardRef = useRef(null);
  const autoPlayActiveRef = useRef(false);
  const canAutoPlayRef = useRef(false);
  const onNextRef = useRef(onNext);
  const onSpeakWordRef = useRef(onSpeakWord);
  const isReadingG = layoutMode === "readingG";
  const isIelts538 = layoutMode === "ielts538";
  const insightVisible = !isIelts538 && showInsight;
  const commonCollocations = normalizePhraseItems(item?.collocations);
  const phraseCollocations = normalizePhraseItems(item?.phraseCollocations);
  const displayForms = normalizeReadingGForms(item?.forms, item?.word).slice(0, 6);
  const displayWordFamily = normalizeReadingGWordFamily(item?.wordFamily, item?.word).slice(0, 6);
  const canAutoPlay = isReadingG && !quizMode && !isStudyEmpty && studyCount >= 2 && typeof onNext === "function";
  const collocationFallback = [{ phrase: "暂无搭配", chinese: "" }];
  const phraseCollocationFallback = [{ phrase: "暂无短语搭配", chinese: "" }];
  const speakSmall = onSpeakSmall || (() => {});
  const senses = Array.isArray(item?.senses) ? item.senses : [];
  const supplementalSenses = senses.slice(1);
  const isContentCompletionQueue = isReadingG && Boolean(contentQuality?.isLearningBlocked);
  const contentScoreLabel = contentQuality
    ? `${contentQuality.completedCount}/${contentQuality.totalCount} · ${contentQuality.percent}%`
    : "";
  const overviewStudyWords = overviewWords.length
    ? overviewWords
    : libraryRows.map((row) => row.entry).filter(Boolean);
  const paraphraseExamples = useMemo(() => {
    const seen = new Set();
    return (Array.isArray(item?.paraphraseExamples) ? item.paraphraseExamples : [])
      .filter((pair) => {
        const replacement = String(pair?.replacement || "").trim();
        const sentence = String(pair?.paraphraseSentence || "").trim();
        const key = replacement.toLowerCase();
        if (!replacement || !sentence || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [item]);
  const paraphraseItemKey = String(item?.wordId || item?.id || item?.word || "");
  const recommendedSynonymKeys = useMemo(
    () => new Set(
      (Array.isArray(item?.recommendedSynonyms) ? item.recommendedSynonyms : [])
        .map((word) => String(word || "").trim().toLowerCase())
        .filter(Boolean)
    ),
    [item]
  );
  const synonymSectionByKey = useMemo(
    () => new Map(
      Object.entries(item?.synonymSections || {})
        .map(([word, section]) => [
          String(word || "").trim().toLowerCase(),
          String(section || "").trim()
        ])
        .filter(([word, section]) =>
          word && ["Section 1", "Section 2", "Section 3"].includes(section)
        )
    ),
    [item]
  );
  const synonymDetailByKey = useMemo(
    () => new Map(
      Object.entries(item?.synonymDetails || {})
        .map(([word, detail]) => [
          String(word || "").trim().toLowerCase(),
          {
            pos: String(detail?.pos || "").trim(),
            originalMeaning: String(detail?.originalMeaning || "").trim(),
            contextualMeaning: String(detail?.contextualMeaning || "").trim()
          }
        ])
        .filter(([word, detail]) =>
          word && (detail.originalMeaning || detail.contextualMeaning)
        )
    ),
    [item]
  );
  const relatedWords = useMemo(() => {
    if (isIelts538) {
      const pairByWord = new Map(
        paraphraseExamples.map((pair) => [pair.replacement.trim().toLowerCase(), pair])
      );
      const candidates = [
        ...(item?.synonyms || []),
        ...paraphraseExamples.map((pair) => pair.replacement)
      ];
      const seen = new Set();
      return candidates
        .map((word) => String(word || "").trim())
        .filter((word) => {
          const key = word.toLowerCase();
          if (!word || seen.has(key)) return false;
          seen.add(key);
          return key !== String(item?.word || "").trim().toLowerCase();
        })
        .map((word) => {
          const paraphrase = pairByWord.get(word.toLowerCase()) || null;
          const detail = synonymDetailByKey.get(word.toLowerCase()) || {};
          const contextualMeaning = chineseMeaningParts(detail.contextualMeaning).join("；");
          const additionalMeaning = additionalMeaningParts(
            detail.originalMeaning,
            item?.meaning
          );
          return {
            word,
            meaning: paraphrase
              ? "已审核"
              : "暂无审核例句",
            pos: detail.pos || "",
            posLabel: compactPosLabel(detail.pos),
            originalMeaning: detail.originalMeaning || "",
            additionalMeaning,
            contextualMeaning:
              contextualMeaning &&
              meaningComparisonKey(contextualMeaning) !== meaningComparisonKey(item?.meaning)
                ? contextualMeaning
                : "",
            paraphrase,
            isRecommended: recommendedSynonymKeys.has(word.toLowerCase()),
            readingSection:
              paraphrase?.readingSection ||
              synonymSectionByKey.get(word.toLowerCase()) ||
              ""
          };
        });
    }

    const candidates = [
      ...(item?.synonyms || []),
      ...(item?.wordFamily || []).map((entry) => typeof entry === "string" ? entry : entry?.word)
    ];
    return [...new Set(candidates.map((word) => String(word || "").trim()).filter(Boolean))]
      .filter((word) => word.toLowerCase() !== String(item?.word || "").toLowerCase())
      .slice(0, 3)
      .map((word) => ({ word, meaning: "当前语境的相关表达" }));
  }, [
    isIelts538,
    item,
    paraphraseExamples,
    recommendedSynonymKeys,
    synonymDetailByKey,
    synonymSectionByKey
  ]);
  const isDenseIelts538 = isIelts538 && relatedWords.length > 6;
  const hasDistinctRelatedMeanings = relatedWords.some(
    (relatedWord) =>
      relatedWord.additionalMeaning || relatedWord.contextualMeaning
  );
  const defaultRelatedWord =
    paraphraseExamples[0]?.replacement || relatedWords[0]?.word || "";
  const selectedRelatedWord =
    paraphraseSelection.itemKey === paraphraseItemKey &&
    relatedWords.some((relatedWord) => relatedWord.word === paraphraseSelection.replacement)
      ? paraphraseSelection.replacement
      : defaultRelatedWord;
  const selectedParaphrase = paraphraseExamples.find(
    (pair) => pair.replacement.trim().toLowerCase() === selectedRelatedWord.trim().toLowerCase()
  ) || null;
  const selectedRelatedEntry = relatedWords.find(
    (relatedWord) => relatedWord.word === selectedRelatedWord
  ) || null;
  const selectedReplacementSection =
    selectedParaphrase?.readingSection || selectedRelatedEntry?.readingSection || "";

  autoPlayActiveRef.current = autoPlayActive;
  canAutoPlayRef.current = canAutoPlay;
  onNextRef.current = onNext;
  onSpeakWordRef.current = onSpeakWord;

  const stopAutoPlay = useCallback(() => {
    autoPlayActiveRef.current = false;
    setAutoPlayActive(false);
  }, []);

  const toggleAutoPlay = useCallback(() => {
    if (!canAutoPlayRef.current) return false;
    setAutoPlayActive((active) => {
      const nextActive = !active;
      autoPlayActiveRef.current = nextActive;
      return nextActive;
    });
    return true;
  }, []);

  const cycleAutoPlaySpeed = useCallback((direction = 1) => {
    setAutoPlaySeconds((current) => {
      const currentIndex = AUTO_PLAY_SPEEDS.indexOf(Number(current));
      const safeIndex = currentIndex >= 0 ? currentIndex : AUTO_PLAY_SPEEDS.indexOf(6);
      const nextIndex = (safeIndex + direction + AUTO_PLAY_SPEEDS.length) % AUTO_PLAY_SPEEDS.length;
      return AUTO_PLAY_SPEEDS[nextIndex];
    });
  }, []);

  useEffect(() => {
    if (canAutoPlay || !autoPlayActive) return;
    stopAutoPlay();
  }, [autoPlayActive, canAutoPlay, stopAutoPlay]);

  useEffect(() => {
    setShowSupplementalSenses(false);
  }, [item?.id]);

  useEffect(() => {
    if (!autoPlayActive || !canAutoPlay) return undefined;
    let speakTimer = null;
    let advanceTimer = null;
    let cancelled = false;

    const shouldPause = () => {
      const activeElement = document.activeElement;
      const tagName = activeElement?.tagName?.toLowerCase();
      return (
        document.hidden ||
        document.querySelector("details.menu[open]") ||
        tagName === "input" ||
        tagName === "textarea" ||
        activeElement?.isContentEditable
      );
    };

    const runStep = async () => {
      if (cancelled || !autoPlayActiveRef.current || shouldPause()) {
        if (!cancelled && shouldPause()) stopAutoPlay();
        return;
      }

      try {
        await onSpeakWordRef.current?.();
      } catch {}

      if (cancelled || !autoPlayActiveRef.current || shouldPause()) {
        if (!cancelled && shouldPause()) stopAutoPlay();
        return;
      }

      advanceTimer = window.setTimeout(() => {
        if (cancelled || !autoPlayActiveRef.current || shouldPause()) {
          if (!cancelled && shouldPause()) stopAutoPlay();
          return;
        }
        onNextRef.current?.();
        window.requestAnimationFrame(() => {
          document.querySelector(".word-study-progress")?.scrollIntoView({ block: "start", behavior: "smooth" });
        });
      }, autoPlaySeconds * 1000);
    };

    speakTimer = window.setTimeout(runStep, 220);

    return () => {
      cancelled = true;
      if (speakTimer) window.clearTimeout(speakTimer);
      if (advanceTimer) window.clearTimeout(advanceTimer);
    };
  }, [autoPlayActive, autoPlaySeconds, canAutoPlay, item?.id, item?.word, stopAutoPlay]);

  useEffect(() => {
    function handleWordCardSwipe(event) {
      if (event.detail?.card !== wordStudyCardRef.current || isStudyEmpty) return;
      if (event.detail.direction === "next") onNext?.();
      if (event.detail.direction === "previous") onPrev?.();
    }

    window.addEventListener(WORD_CARD_SWIPE_EVENT, handleWordCardSwipe);
    return () => window.removeEventListener(WORD_CARD_SWIPE_EVENT, handleWordCardSwipe);
  }, [isStudyEmpty, onNext, onPrev]);

  useEffect(() => {
    if (!autoPlayActive) return undefined;
    const onVisibilityChange = () => {
      if (document.hidden) stopAutoPlay();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [autoPlayActive, stopAutoPlay]);

  useEffect(() => {
    function isTextEntryTarget(target) {
      if (!target || !(target instanceof Element)) return false;
      const tagName = target.tagName?.toLowerCase();
      if (tagName === "textarea") return true;
      if (target.isContentEditable) return true;
      if (tagName === "input") {
        const type = String(target.getAttribute("type") || "text").toLowerCase();
        return !["button", "checkbox", "radio", "range", "file", "submit", "reset", "color"].includes(type);
      }
      return false;
    }

    function flashAutoPlayControl() {
      const control = document.querySelector(".reading-g-auto-play-control");
      if (!control) return;
      control.classList.add("is-hotkey-hit");
      window.setTimeout(() => control.classList.remove("is-hotkey-hit"), 220);
    }

    function handleKeyDown(event) {
      if (!isReadingG || quizMode || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (event.isComposing && event.code !== "Escape") return;

      const key = event.key || "";
      const code = event.code || "";
      const inTextField = isTextEntryTarget(event.target);

      if ((key === "Escape" || code === "Escape") && autoPlayActiveRef.current) {
        if (inTextField) return;
        event.preventDefault();
        event.stopPropagation();
        setAutoPlayActive(false);
        flashAutoPlayControl();
        return;
      }

      if (inTextField) return;

      if (code === "KeyA") {
        event.preventDefault();
        event.stopPropagation();
        if (event.target instanceof HTMLElement) {
          const tagName = event.target.tagName?.toLowerCase();
          if (tagName === "select" || tagName === "button") event.target.blur();
        }
        toggleAutoPlay();
        flashAutoPlayControl();
        return;
      }

      if (code === "BracketLeft" || key === "[") {
        event.preventDefault();
        event.stopPropagation();
        cycleAutoPlaySpeed(-1);
        flashAutoPlayControl();
        return;
      }

      if (code === "BracketRight" || key === "]") {
        event.preventDefault();
        event.stopPropagation();
        cycleAutoPlaySpeed(1);
        flashAutoPlayControl();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [cycleAutoPlaySpeed, isReadingG, quizMode, toggleAutoPlay]);

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
          ? "阶段路线互不重复；范围总数相加等于词库总数，当前待学会随熟悉状态减少。"
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
                <span className="entry-meta">{entry.countLabel || `${entry.count} 个`}</span>
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
    <main className={`page page--word-flash${isReadingG ? " reading-g-study" : ""}${isIelts538 ? " ielts-538-study" : ""}${isDenseIelts538 ? " ielts-538-study--dense" : ""}`}>
      <WordStudyWorkspace
        showInsight={insightVisible}
        overview={insightVisible ? (
          <WordStudyOverview
            wordLibraryStats={overviewStats}
            filter={filter}
            filterName={rangeTitle}
            studyWords={overviewStudyWords}
            currentPosition={safeStudyPosition}
            isExternalIdictationItem={false}
            relatedWords={relatedWords}
            speakSmallText={speakSmall}
            onClose={() => setShowInsight(false)}
          />
        ) : null}
      >
        <WordStudyProgress
          label={filter?.type === "status" ? "复习进度" : "浏览进度"}
          title={rangeTitle}
          current={isStudyEmpty ? 0 : safeStudyPosition + 1}
          total={studyCount}
          percent={progressPercent}
          onPositionCommit={onPositionCommit}
          getPositionPreview={getPositionPreview}
          actions={(
          <header className="topbar">
          <div className="previous">
            <div className="previous-label">上一个单词</div>
            <div className="previous-word">{prevItem?.word || "—"}</div>
            <div className="previous-meta study-answer-content">
              {fallback(prevItem?.phonetic, "等待音标")} ·{" "}
              {fallback(getPosDisplay(prevItem?.pos), "词性")} ·{" "}
              {fallback(prevItem?.meaning, "释义")}
            </div>
          </div>

          <div className="top-actions">
            {!quizMode && onWordOrderModeChange ? (
              <WordStudyOrderControls
                mode={wordOrderMode}
                difficultyMode={wordOrderDifficultyMode}
                onModeChange={onWordOrderModeChange}
                onDifficultyModeChange={onWordDifficultyModeChange}
                difficultyAvailable={wordOrderDifficultyAvailable}
                difficultyEnabled={wordOrderDifficultyEnabled}
                difficultyProfile={wordOrderDifficultyProfile}
              />
            ) : null}
            {isReadingG && !quizMode ? (
              <div className={`auto-scroll-control reading-g-auto-play-control${autoPlayActive ? " is-active" : ""}`}>
                <button
                  type="button"
                  className="top-pill auto-scroll-toggle"
                  disabled={!canAutoPlay}
                  aria-pressed={autoPlayActive}
                  aria-label={autoPlayActive ? "暂停自动播放" : "开启自动播放"}
                  title="自动读当前词并切到下一个；快捷键：A 开关 · Esc 暂停 · [ ] 调间隔。"
                  onClick={toggleAutoPlay}
                  data-testid="reading-g-auto-play-toggle"
                >
                  {autoPlayActive ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                  {autoPlayActive ? `暂停播放 · ${autoPlaySeconds}s` : "自动播放 · A"}
                </button>
                <select
                  className="auto-scroll-speed"
                  value={autoPlaySeconds}
                  disabled={!canAutoPlay}
                  onChange={(event) => setAutoPlaySeconds(Number(event.target.value))}
                  aria-label="自动播放间隔"
                  title="自动播放间隔（快捷键 [ 变慢 · ] 变快）"
                >
                  {AUTO_PLAY_SPEEDS.map((seconds) => (
                    <option key={seconds} value={seconds}>
                      {seconds}秒
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {quizMode && onShuffle ? (
              <button type="button" className="top-pill shuffle-pill" onClick={onShuffle}>
                <Shuffle aria-hidden="true" />重排本轮
              </button>
            ) : null}
            <StudyMeaningToggle />
            <a className="top-pill spelling-entry-link" href="/">
              ← 主词库
            </a>
            {extraLinks.map((link) => (
              <a key={link.href} className="top-pill spelling-entry-link" href={link.href}>
                {link.label}
              </a>
            ))}
            {extraActions}

            <details className="menu">
              <summary className="top-pill">学习范围</summary>
              <div className="menu-panel wide">{filterPanelBody}</div>
            </details>

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
          )}
        />

        <article ref={wordStudyCardRef} className="word-study-card">
          <div className="word-canvas-tools">
            <span>{rangeDetail || `${modeLabel} · ${rangeMeta}`}</span>
            <div>
              <button
                className={`word-canvas-icon${isFavorite ? " is-active" : ""}`}
                type="button"
                disabled={isStudyEmpty}
                onClick={onToggleFavorite}
                title="收藏"
                aria-label="收藏当前单词"
              >
                <Bookmark aria-hidden="true" />
              </button>
              {!isIelts538 && !showInsight ? (
                <button
                  className="word-canvas-icon"
                  type="button"
                  onClick={() => setShowInsight(true)}
                  title="打开学习概览"
                  aria-label="打开学习概览"
                >
                  <PanelRightOpen aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>

          <section className="main">
          <div className="center word-study-content">

            <div className="example-box study-answer-content">
              <div className="example-head">
                <button
                  className="hero-sound-btn"
                  type="button"
                  onClick={isContentCompletionQueue ? undefined : onSpeakExample}
                  disabled={isContentCompletionQueue}
                  title="播放例句发音 (空格)"
                  aria-label="播放例句发音，快捷键空格"
                >
                  <span aria-hidden="true">🔊</span>
                  <span>空格·例句</span>
                </button>
                {isIelts538 ? (
                  <div className="ielts-538-example-meta" aria-label="仿雅思 G 类文章句">
                    <span>仿雅思 G 类文章句</span>
                  </div>
                ) : null}
              </div>
              <div
                className="example-clickable"
                onClick={isContentCompletionQueue ? undefined : onSpeakExample}
                role="button"
                tabIndex={isContentCompletionQueue ? -1 : 0}
                onKeyDown={(event) => {
                  if (!isContentCompletionQueue && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    onSpeakExample();
                  }
                }}
              >
                {isContentCompletionQueue ? (
                  <>
                    <div className="example">已转入内容补全队列，补全后才会进入普通刷词。</div>
                    <div className="example-cn">待补：{contentQuality.issueLabels.join("、")}</div>
                  </>
                ) : (
                  <>
                    <div className="example">{fallback(item?.example, "暂无例句")}</div>
                    <div className="example-cn">{fallback(item?.exampleCn, "暂无例句中文")}</div>
                  </>
                )}
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
                    <div className="word-sub study-answer-content">
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
                    {isReadingG && contentQuality?.isScored ? (
                      <div className={rgStyles.rgContentQuality} aria-label={`资料完整度 ${contentScoreLabel}`}>
                        <span>资料完整度</span>
                        <strong>{contentQuality.completedCount}/{contentQuality.totalCount}</strong>
                        <em>{contentQuality.percent}%</em>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="meaning-block study-answer-content">
                  <div className="meaning-primary">{fallback(item?.meaning, "等待释义")}</div>
                  {isReadingG && supplementalSenses.length ? (
                    <div className={rgStyles.rgSensesWrap}>
                      <button
                        type="button"
                        className={rgStyles.rgSensesToggle}
                        aria-expanded={showSupplementalSenses}
                        onClick={() => setShowSupplementalSenses((current) => !current)}
                      >
                        {showSupplementalSenses
                          ? "收起其他义项"
                          : `还有 ${supplementalSenses.length} 个常见义项`}
                      </button>
                      <div className={rgStyles.rgSensesLabel}>补充义项 · {supplementalSenses.length}</div>
                      {showSupplementalSenses ? (
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
                      ) : null}
                    </div>
                  ) : null}
                  {isIelts538 && selectedRelatedWord ? (
                    <div className="block ielts-538-paraphrase" aria-label="阅读同义改写">
                      <div className="block-title">仿雅思 G 类题目改写句</div>
                      <div className="ielts-538-paraphrase__replacement">
                        <span>本句可替换表达</span>
                        <button
                          className="mini-sound"
                          type="button"
                          onClick={() => speakSmall(selectedRelatedWord, "同义表达")}
                          title={`播放 ${selectedRelatedWord}`}
                          aria-label={`播放 ${selectedRelatedWord}`}
                        >
                          🔊
                        </button>
                        <strong>{selectedRelatedWord}</strong>
                        {selectedReplacementSection ? (
                          <em
                            className="ielts-538-section-badge"
                            aria-label={`替换词难度 ${selectedReplacementSection}`}
                          >
                            {selectedReplacementSection}
                          </em>
                        ) : null}
                        {selectedParaphrase?.isRecommended ? (
                          <em className="ielts-538-recommended-badge">★ 最推荐</em>
                        ) : null}
                      </div>
                      {selectedParaphrase ? (
                        <>
                          <div className="ielts-538-paraphrase__sentence">
                            <span>同义改写句</span>
                            <button
                              className="mini-sound"
                              type="button"
                              onClick={() => speakSmall(selectedParaphrase.paraphraseSentence, "同义改写句")}
                              title="播放同义改写句"
                              aria-label="播放同义改写句"
                            >
                              🔊
                            </button>
                            <p>{selectedParaphrase.paraphraseSentence}</p>
                          </div>
                          <p className="ielts-538-paraphrase__meaning">
                            {selectedParaphrase.meaningCn}
                          </p>
                          <p className="ielts-538-paraphrase__note">
                            上方为文章语境，下方为题干式改写；信息对应，但词汇和句法结构可以变化。
                          </p>
                        </>
                      ) : (
                        <div className="ielts-538-paraphrase__empty" role="status">
                          <strong>暂无审核例句</strong>
                          <p>该词来自原词库候选列表，现已完整保留展示，但暂不表示能在当前句中直接替换。</p>
                        </div>
                      )}
                    </div>
                  ) : sensesExtra}
                </div>

                <div className={isReadingG ? rgStyles.rgFooterGrid : undefined}>
                  {isIelts538 ? (
                    relatedWords.length ? (
                      <section
                        className={`grid footer-grid ielts-538-related-grid study-answer-content${isDenseIelts538 ? " is-dense" : ""}${showRelatedMeanings && hasDistinctRelatedMeanings ? " is-meaning-expanded" : ""}`}
                        aria-label="相关单词和同义替换"
                      >
                        <div className="block">
                          <div className="ielts-538-related-heading">
                            <div className="block-title">相关单词 / 同义替换</div>
                            {hasDistinctRelatedMeanings ? (
                              <button
                                className="ielts-538-meaning-toggle"
                                type="button"
                                aria-expanded={showRelatedMeanings}
                                onClick={() => setShowRelatedMeanings((visible) => !visible)}
                              >
                                {showRelatedMeanings ? "收起其他义" : "展开其他义"}
                              </button>
                            ) : null}
                          </div>
                          <div className="list ielts-538-related-list">
                            {relatedWords.map((relatedWord) => {
                              const isSelected =
                                selectedRelatedWord === relatedWord.word;
                              return (
                              <div
                                className={`item with-sound ielts-538-related-item${isSelected ? " is-active" : ""}`}
                                key={relatedWord.word}
                              >
                                <button
                                  className="mini-sound"
                                  type="button"
                                  onClick={() => speakSmall(relatedWord.word, "相关单词")}
                                  title={`播放 ${relatedWord.word} 发音`}
                                  aria-label={`播放 ${relatedWord.word} 发音`}
                                >
                                  🔊
                                </button>
                                <button
                                  className="pair-text ielts-538-related-choice"
                                  type="button"
                                  aria-pressed={isSelected}
                                  onClick={() => setParaphraseSelection({
                                    itemKey: paraphraseItemKey,
                                    replacement: relatedWord.word
                                  })}
                                >
                                  <span className="en">
                                    {relatedWord.word}
                                    {relatedWord.readingSection ? (
                                      <em
                                        className="ielts-538-section-badge"
                                        aria-label={`替换词难度 ${relatedWord.readingSection}`}
                                      >
                                        {relatedWord.readingSection}
                                      </em>
                                    ) : null}
                                    {relatedWord.isRecommended ? (
                                      <em className="ielts-538-recommended-badge">★ 最推荐</em>
                                    ) : null}
                                  </span>
                                  <span className="zh">{relatedWord.meaning}</span>
                                  {showRelatedMeanings && relatedWord.additionalMeaning ? (
                                    <span
                                      className="ielts-538-related-definition"
                                      title={relatedWord.additionalMeaning}
                                    >
                                      <small>其他义</small>
                                      {relatedWord.posLabel ? (
                                        <b
                                          title={relatedWord.pos}
                                          aria-label={`主要词性 ${relatedWord.posLabel}`}
                                        >
                                          {relatedWord.posLabel}
                                        </b>
                                      ) : null}
                                      <span>{relatedWord.additionalMeaning}</span>
                                    </span>
                                  ) : null}
                                  {showRelatedMeanings && relatedWord.contextualMeaning ? (
                                    <span
                                      className="ielts-538-related-context"
                                      title={relatedWord.contextualMeaning}
                                    >
                                      <small>释义</small>
                                      <span>{relatedWord.contextualMeaning}</span>
                                    </span>
                                  ) : null}
                                </button>
                              </div>
                              );
                            })}
                          </div>
                        </div>
                      </section>
                    ) : null
                  ) : (
                  <div className="grid footer-grid">
                    {isReadingG ? (
                      <div className="block">
                        <div className="block-title">变形</div>
                        <div className="list">
                          {displayForms.length ? displayForms.map((form) => (
                            <div className="item with-sound" key={`form-${form.word}`}>
                              <button
                                className="mini-sound"
                                type="button"
                                onClick={() => speakSmall(form.word, "变形")}
                                title="播放变形发音"
                              >
                                🔊
                              </button>
                              <div className="pair-text">
                                <div className="en">{form.word}</div>
                                <div className="zh">{form.meaning || form.note || getFormChineseType(form.type)}</div>
                              </div>
                            </div>
                          )) : <div className="item"><div className="pair-text"><div className="zh">当前词暂无重要变形</div></div></div>}
                        </div>
                      </div>
                    ) : null}

                    {isReadingG ? (
                      <div className="block">
                        <div className="block-title">词族</div>
                        <div className="list">
                          {displayWordFamily.length ? displayWordFamily.map((family) => (
                            <div className="item with-sound" key={`family-${family.word}`}>
                              <button
                                className="mini-sound"
                                type="button"
                                onClick={() => speakSmall(family.word, "词族")}
                                title="播放词族发音"
                              >
                                🔊
                              </button>
                              <div className="pair-text">
                                <div className="en">{family.word}</div>
                                <div className="zh">{[getPosDisplay(family.pos), family.meaning].filter(Boolean).join(" · ") || "同词族词条"}</div>
                              </div>
                            </div>
                          )) : <div className="item"><div className="pair-text"><div className="zh">当前词暂无词族信息</div></div></div>}
                        </div>
                      </div>
                    ) : null}

                    {!isReadingG ? <div className="block">
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
                    </div> : null}

                    {!isReadingG ? <div className="block">
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
                    </div> : null}

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
                  )}
                </div>
              </>
            )}
          </div>
          </section>
        </article>

        <footer className="bottom bottombar">
          <button
            className="study-step-button study-step-button--previous"
            type="button"
            disabled={isStudyEmpty || !onPrev}
            onClick={onPrev || undefined}
          >
            上一个
          </button>
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

          <button
            className="study-step-button study-step-button--next"
            type="button"
            disabled={isStudyEmpty || !onNext}
            onClick={onNext || undefined}
          >
            下一个
          </button>
        </footer>

        <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
      </WordStudyWorkspace>
    </main>
  );
}
