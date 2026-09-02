"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "next/navigation";
import { useHomeWordSpeech } from "./hooks/useHomeWordSpeech.js";
import { useHomeAudioPrefill } from "./hooks/useHomeAudioPrefill.js";
import { useHomeLexiconAdmin } from "./hooks/useHomeLexiconAdmin.js";
import { useHomeVocabBootstrap } from "./hooks/useHomeVocabBootstrap.js";
import { useWordFlashSession } from "./hooks/useWordFlashSession.js";
import { useWordFlashNavigation } from "./hooks/useWordFlashNavigation.js";
import { useWordStudyOrdering } from "./hooks/useWordStudyOrdering.js";
import { useLexiconTidyReview } from "./hooks/useLexiconTidyReview.js";
import {
  formatOfflineVocabNotice,
  formatVocabCountLabel
} from "./lib/vocab/word-cache-meta.mjs";
import { notifyEffectiveStudyModuleChange } from "./lib/study-time/effective-study-time.mjs";
import PhraseFlashcardPanel from "./components/PhraseFlashcardPanel";
import LrParaphrasePanel from "./components/LrParaphrasePanel";
import WordEditModal from "./components/WordEditModal";
import WordFlashcardView from "./components/WordFlashcardView";
import StableLoadingState from "./components/StableLoadingState";
import {
  ensureIdictationFrequencyData,
  getIdictationSource,
  isIdictationFrequencyLoaded
} from "./lib/spelling/idictation-frequency.mjs";
import {
  effectiveStudyIndex,
  resolveFilterSwitchIndex,
  shouldBlockStudyIndexPersist
} from "./lib/vocab/study-session.mjs";
import { buildLearningEntryCounts } from "./lib/vocab/learning-entry-counts.mjs";
import {
  IDICTATION_FLASH_FILTERS,
  LEARNING_ENTRIES,
  buildFilteredWordIndices,
  buildIdictationFlashWords,
  buildLibraryWordMap,
  buildStudyPoolForFilter,
  buildStudyWordIndices,
  filterKey,
  getFilterName,
  isIdictationFlashFilter,
  isSameFilter,
  resolveStudyWordEntry,
  wordMatchesFilter
} from "./lib/vocab/word-flashcard-study-pool.mjs";
import {
  LEXICON_TIDY_FILTERS,
  LEXICON_TIDY_FILTER_TYPE
} from "./lib/vocab/lexicon-tidy-review.mjs";
import {
  resolveCurrentStudyItem,
  resolveWordStudyIndex
} from "./lib/vocab/word-flashcard-session.mjs";
import { buildAtomicDeletionNavigation } from "./lib/vocab/word-navigation-index.mjs";
import {
  isBrushableWord,
  isReferenceWord,
  findWordSearchMatches,
  resolveWordSearchTarget
} from "./lib/vocab/word-study-eligibility.mjs";
import {
  WORD_STUDY_ORDER_MODE,
  createWordStudyOrderSnapshot,
  isFixedWordStudyOrderMode,
  remapWordStudyOrderSnapshotsAfterDeletion,
  reconcileWordStudyOrderSnapshot,
  updateWordStudyOrderSnapshotCursor,
  orderStudyWordIndices,
  wordStudyOrderSnapshotKey
} from "./lib/vocab/word-study-ordering.mjs";
import {
  WORD_STUDY_DIFFICULTY_MODE,
  createWordInternalDifficultyProfile,
  normalizeWordStudyDifficultyMode
} from "./lib/vocab/word-internal-difficulty.mjs";
import { wordStudyIndexAtPosition } from "./lib/vocab/word-study-position.mjs";
import { SPEECH_WARM_DELAYS_MS } from "./lib/vocab-speech.mjs";
import {
  compactBrowserStorageForCurrentWords,
  enrichDisplayFamily,
  fallback,
  getDisplayForms,
  hasHeadwordRepair,
  isLikelyWrongAiWord,
  isSimpleDictionaryWord,
  normalizePhraseItems,
  normalizeWord,
} from "./lib/vocab/page-word-helpers.mjs";
import { getWordQualityEvaluation } from "./lib/vocab/word-quality-status.mjs";

// Source anchors kept for regression tests: AI工具（会扣费）; 听力阅读同义替换; /data/phrases.json; LR_SYNONYM_URL; asSynonymItems(payload).length;
// Runtime mode counts display an em dash until catalog metadata is ready.

const DEMO_WORDS = [
  {
    word: "accommodation",
    phonetic: "/əˌkɒməˈdeɪʃən/",
    pos: "noun",
    meaning: "住宿；住处",
    definition: "A place where someone lives or stays, especially for a short time.",
    example: "The university should provide affordable accommodation for international students.",
    exampleCn: "大学应该为国际学生提供价格合理的住宿。",
    collocations: [
      { phrase: "student accommodation", chinese: "学生住宿" },
      { phrase: "affordable accommodation", chinese: "价格合理的住宿" },
      { phrase: "temporary accommodation", chinese: "临时住处" }
    ],
    phraseCollocations: [
      { phrase: "accommodation for students", chinese: "给学生的住宿" },
      { phrase: "find accommodation", chinese: "寻找住处" },
      { phrase: "provide accommodation", chinese: "提供住宿" }
    ],
    ieltsUse: ["Listening", "G类书信"],
    topics: ["住房", "旅行"],
    difficulty: "基础高频",
    category: "IELTS G类 · Listening",
    status: "",
    favorite: false
  },
  {
    word: "application",
    phonetic: "/ˌæplɪˈkeɪʃən/",
    pos: "noun",
    meaning: "申请；申请表；应用",
    definition: "A formal request for something, such as a job, course, or service.",
    example: "I submitted my application for the training course last week.",
    exampleCn: "我上周提交了培训课程的申请。",
    collocations: [
      { phrase: "job application", chinese: "求职申请" },
      { phrase: "application form", chinese: "申请表" },
      { phrase: "submit an application", chinese: "提交申请" }
    ],
    phraseCollocations: [
      { phrase: "application for a course", chinese: "课程申请" },
      { phrase: "fill in an application form", chinese: "填写申请表" },
      { phrase: "make an application", chinese: "提出申请" }
    ],
    ieltsUse: ["G类书信", "工作高频"],
    topics: ["工作", "教育"],
    difficulty: "基础高频",
    category: "IELTS G类 · G类书信",
    status: "",
    favorite: false
  },
  {
    word: "reliable",
    phonetic: "/rɪˈlaɪəbl/",
    pos: "adjective",
    meaning: "可靠的；可信赖的",
    definition: "Able to be trusted or depended on.",
    example: "Public transport should be reliable, especially during rush hour.",
    exampleCn: "公共交通应该可靠，尤其是在高峰期。",
    collocations: [
      { phrase: "reliable service", chinese: "可靠的服务" },
      { phrase: "reliable information", chinese: "可靠的信息" },
      { phrase: "a reliable person", chinese: "可靠的人" }
    ],
    phraseCollocations: [
      { phrase: "be reliable in emergencies", chinese: "在紧急情况下可靠" },
      { phrase: "a reliable source of information", chinese: "可靠的信息来源" },
      { phrase: "depend on reliable data", chinese: "依赖可靠数据" }
    ],
    ieltsUse: ["Task 2", "Speaking"],
    topics: ["交通", "公共服务"],
    difficulty: "中级核心",
    category: "IELTS G类 · Task 2",
    status: "",
    favorite: false
  }
];

const IELTS_USE_OPTIONS = ["Listening", "Speaking", "Reading", "G类书信", "Task 2", "生活高频", "工作高频"];
const TOPIC_OPTIONS = ["教育", "工作", "住房", "交通", "健康", "环境", "科技", "政府", "社会", "消费", "旅行", "社区", "法律", "家庭", "公共服务"];
const DIFFICULTY_OPTIONS = ["基础高频", "中级核心", "高级加分", "低频认识即可"];

export default function HomePage() {
  return (
    <Suspense fallback={(
      <main className="page page--word-flash system-loading-page" data-study-surface="flash">
        <StableLoadingState mark="V" eyebrow="主词库刷词" />
      </main>
    )}>
      <Home />
    </Suspense>
  );
}

function Home() {
  const [index, setIndex] = useState(0);
  const [pasteText, setPasteText] = useState("");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [batchInfo, setBatchInfo] = useState("");
  const [aiRunState, setAiRunState] = useState({
    status: "idle",
    rounds: 0,
    processed: 0,
    filled: 0,
    failed: 0,
    remaining: 0,
    initialRemaining: 0
  });
  const [duplicateInfo, setDuplicateInfo] = useState("");
  const [idictationFlashReady, setIdictationFlashReady] = useState(false);
  const [lastLocalChange, setLastLocalChange] = useState(null);
  const [audioMap, setAudioMap] = useState({});
  const [audioCacheStats, setAudioCacheStats] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState(null);
  const [filter, setFilter] = useState({ type: "all", value: "" });

  const {
    words,
    setWords,
    flashStudyMode,
    setFlashStudyMode,
    vocabRuntime,
    phraseRuntimeCount,
    lrSynonymCount,
    storageReadyRef,
    cacheMetaRef,
    persistWordsImmediately,
    markContentSnapshot
  } = useHomeVocabBootstrap({ setToast });

  const {
    ready: lexiconTidyReady,
    review: lexiconTidyReview,
    matchesWord: matchesTidyWord,
    getCandidate: getTidyCandidate,
    keepWord: keepTidyWord,
    recordDeletedWords: recordTidyDeletedWords
  } = useLexiconTidyReview({ words, setToast });

  const matchesActiveFilter = useCallback((word, targetFilter, sourceIndex = -1) => {
    if (targetFilter?.type === LEXICON_TIDY_FILTER_TYPE) {
      const resolvedIndex = Number.isInteger(sourceIndex) && sourceIndex >= 0
        ? sourceIndex
        : words.indexOf(word);
      return matchesTidyWord(
        word,
        resolvedIndex,
        targetFilter.value || LEXICON_TIDY_FILTERS.REVIEW
      );
    }
    return wordMatchesFilter(word, targetFilter);
  }, [matchesTidyWord, words]);

  const {
    audioStatusMapRef,
    audioStatsRevision,
    audioStatusState,
    patchAudioStatusKey,
    prefillWordAudio,
    clearAudioPrefillCursor,
    clearRealAudioPrefillCursor,
    rebuildMissingAudioFromStart,
    rebuildRealAudioFromStart,
    retryRealAudioForCurrentLibrary,
    dedupeLocalAudio,
    refreshAudioCacheStats,
    cleanupFallbackAudioCache
  } = useHomeAudioPrefill({
    words,
    setWords,
    setAudioMap,
    setLoading,
    setToast,
    setBatchInfo,
    setAudioCacheStats
  });
  const toolsMenuRef = useRef(null);
  const aiToolsRef = useRef(null);
  const aiRunControlRef = useRef({ controller: null, running: false });
  const searchParams = useSearchParams();
  const wantOpenAiToolsQuery = searchParams?.get("openAiTools") === "1";
  const [toolsOpen, setToolsOpen] = useState(false);
  const [aiToolsOpen, setAiToolsOpen] = useState(false);
  const [libraryStatsOpen, setLibraryStatsOpen] = useState(false);
  const [difficultyProfileRequestKey, setDifficultyProfileRequestKey] = useState("");

  const warmTtsTimersRef = useRef([]);
  const warmTtsBatchRef = useRef(0);
  const filterSwitchRequestRef = useRef(0);
  const flashStudyModeRef = useRef(flashStudyMode);
  const mainDeleteConfirmationRef = useRef(false);
  const latestStateRef = useRef({
    loading: false,
    isStudyEmpty: false,
    index: 0,
    words: [],
    filter: { type: "all", value: "" },
    studyWordIndices: [],
    studyWords: []
  });

  const {
    studySessionRef,
    entryPositionsRef,
    persistWordFlashSessionNow,
    resetWordStudySessionState
  } = useWordFlashSession({
    words,
    index,
    setIndex,
    filter,
    setFilter,
    setToast,
    storageReadyRef,
    latestStateRef
  });

  // Open AI tools in-place (sidebar event or ?openAiTools=1). Never requires leaving other pages.
  useEffect(() => {
    let pollTimer = 0;

    function openHomeAiTools() {
      if (flashStudyMode !== "word") {
        setFlashStudyMode("word");
      }
      setToolsOpen(true);
      setAiToolsOpen(true);

      if (pollTimer) window.clearInterval(pollTimer);
      let tries = 0;
      pollTimer = window.setInterval(() => {
        tries += 1;
        const ai = aiToolsRef.current || document.getElementById("ai-tools");
        if (ai) {
          ai.scrollIntoView({ block: "nearest", behavior: tries <= 2 ? "smooth" : "auto" });
          window.clearInterval(pollTimer);
          pollTimer = 0;
          return;
        }
        if (tries >= 30) {
          window.clearInterval(pollTimer);
          pollTimer = 0;
        }
      }, 100);
    }

    function onOpenAiToolsEvent(event) {
      if (event?.detail?.page && event.detail.page !== "home") return;
      openHomeAiTools();
    }

    window.addEventListener("ielts:open-ai-tools", onOpenAiToolsEvent);

    const wantOpenAiTools =
      wantOpenAiToolsQuery ||
      (typeof window !== "undefined" && window.location.hash === "#ai-tools");
    if (wantOpenAiTools) {
      openHomeAiTools();
    }

    return () => {
      window.removeEventListener("ielts:open-ai-tools", onOpenAiToolsEvent);
      if (pollTimer) window.clearInterval(pollTimer);
    };
  }, [wantOpenAiToolsQuery, flashStudyMode, setFlashStudyMode]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function closeOtherMenus(openMenu = null) {
      document.querySelectorAll("details.menu").forEach((menu) => {
        if (menu === openMenu) return;
        // Controlled tools panel must close via React state, not only DOM.
        if (toolsMenuRef.current && menu === toolsMenuRef.current) {
          setToolsOpen(false);
          setAiToolsOpen(false);
          return;
        }
        menu.open = false;
      });
    }

    function handleToggle(event) {
      const target = event.target;

      if (target?.matches?.("details.menu") && target.open) {
        closeOtherMenus(target);
      }
    }

    function handlePointerDown(event) {
      const t = event.target;
      // Don't fight sidebar "AI 工具" navigation / open intent.
      if (t.closest?.('a[href*="openAiTools"]') || t.closest?.('a[href*="#ai-tools"]')) {
        return;
      }
      // Clicks inside the active menu keep it usable; other controls close it.
      if (t.closest?.("details.menu")) {
        return;
      }
      closeOtherMenus();
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") closeOtherMenus();
    }

    // Menus render after vocabulary hydration, so delegate instead of taking a
    // one-time snapshot that misses late-mounted <details> elements.
    document.addEventListener("toggle", handleToggle, true);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("toggle", handleToggle, true);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const isWordFlashActive = flashStudyMode === "word";
  const idictationFlashSourceKey = isWordFlashActive && isIdictationFlashFilter(filter) ? filter.value : "";
  const libraryWordMap = useMemo(
    () => (isWordFlashActive ? buildLibraryWordMap(words) : new Map()),
    [isWordFlashActive, words]
  );
  const activeWordPool = useMemo(() => {
    if (!isWordFlashActive) return [];
    if (idictationFlashSourceKey) {
      return idictationFlashReady
        ? buildIdictationFlashWords(idictationFlashSourceKey, words, libraryWordMap)
        : [];
    }
    return words;
  }, [isWordFlashActive, idictationFlashSourceKey, idictationFlashReady, words, libraryWordMap]);

  useEffect(() => {
    if (!idictationFlashSourceKey) return;
    if (isIdictationFrequencyLoaded()) {
      setIdictationFlashReady(true);
      return;
    }

    let cancelled = false;
    setIdictationFlashReady(false);
    ensureIdictationFrequencyData()
      .then(() => {
        if (!cancelled) setIdictationFlashReady(true);
      })
      .catch(() => {
        if (!cancelled) setToast("爱听写词表加载失败，请稍后重试");
      });

    return () => {
      cancelled = true;
    };
  }, [idictationFlashSourceKey]);
  const activeWordByIndex = useMemo(() => {
    if (!isWordFlashActive || !idictationFlashSourceKey) return null;
    return new Map(activeWordPool.map((word) => [word.originalIndex, word]));
  }, [isWordFlashActive, idictationFlashSourceKey, activeWordPool]);
  const activeOrderKey = filterKey(filter);
  const {
    mode: wordOrderMode,
    difficultyMode: storedWordDifficultyMode,
    seed: wordOrderSeed,
    snapshots: wordOrderSnapshots,
    setMode: setWordOrderMode,
    setDifficultyMode: setWordDifficultyMode,
    saveSnapshot: saveWordOrderSnapshot,
    saveCursor: saveWordOrderCursor
  } = useWordStudyOrdering(activeOrderKey);
  const wordOrderDifficultyEnabled = !idictationFlashSourceKey;
  const wordOrderDifficultyMode = wordOrderDifficultyEnabled
    ? storedWordDifficultyMode
    : WORD_STUDY_DIFFICULTY_MODE.DEFAULT;
  const baseStudyWordIndices = useMemo(
    () => (isWordFlashActive
      ? buildStudyWordIndices(activeWordPool, filter, { idictation: Boolean(idictationFlashSourceKey), matchesWord: matchesActiveFilter })
      : []),
    [isWordFlashActive, activeWordPool, filter, idictationFlashSourceKey, matchesActiveFilter]
  );
  const wordOrderDifficultyProfile = useMemo(() => {
    const shouldBuildProfile =
      wordOrderDifficultyMode !== WORD_STUDY_DIFFICULTY_MODE.DEFAULT
      || difficultyProfileRequestKey === activeOrderKey;
    if (!wordOrderDifficultyEnabled || !baseStudyWordIndices.length || !shouldBuildProfile) return null;
    const idictation = Boolean(idictationFlashSourceKey);
    const words = baseStudyWordIndices.map((sourceIndex) => {
      if (idictation) {
        return activeWordPool.find((word) => word?.originalIndex === sourceIndex) || null;
      }
      return activeWordPool[sourceIndex] || null;
    }).filter(Boolean);
    return createWordInternalDifficultyProfile(words);
  }, [
    activeWordPool,
    activeOrderKey,
    baseStudyWordIndices,
    difficultyProfileRequestKey,
    idictationFlashSourceKey,
    wordOrderDifficultyEnabled,
    wordOrderDifficultyMode
  ]);
  const wordOrderDifficultyAvailable = Boolean(
    wordOrderDifficultyEnabled
    && (wordOrderDifficultyProfile?.available || (
      !wordOrderDifficultyProfile && baseStudyWordIndices.length >= 6
    ))
  );
  const activeWordOrderSnapshotKey = wordStudyOrderSnapshotKey(
    wordOrderMode,
    wordOrderDifficultyMode
  );
  const activeWordOrderSnapshot = wordOrderSnapshots[activeWordOrderSnapshotKey] || null;
  const reusableWordOrderSnapshot = useMemo(() => {
    if (
      !baseStudyWordIndices.length
      || !isFixedWordStudyOrderMode(wordOrderMode, wordOrderDifficultyMode)
      || !activeWordOrderSnapshot
    ) {
      return null;
    }
    const candidate = reconcileWordStudyOrderSnapshot(
      activeWordOrderSnapshot,
      baseStudyWordIndices,
      activeWordPool,
      {
        idictation: Boolean(idictationFlashSourceKey),
        fallbackOrder: baseStudyWordIndices
      }
    );
    return candidate.changed ? null : candidate;
  }, [
    activeWordOrderSnapshot,
    activeWordPool,
    baseStudyWordIndices,
    idictationFlashSourceKey,
    wordOrderDifficultyMode,
    wordOrderMode
  ]);
  const generatedStudyWordIndices = useMemo(
    () => reusableWordOrderSnapshot?.indices || orderStudyWordIndices(baseStudyWordIndices, activeWordPool, {
      mode: wordOrderMode,
      difficultyMode: wordOrderDifficultyMode,
      difficultyEnabled: wordOrderDifficultyEnabled,
      difficultyProfile: wordOrderDifficultyProfile,
      seed: wordOrderSeed,
      idictation: Boolean(idictationFlashSourceKey)
    }),
    [
      baseStudyWordIndices,
      activeWordPool,
      wordOrderDifficultyEnabled,
      wordOrderDifficultyMode,
      wordOrderDifficultyProfile,
      wordOrderMode,
      wordOrderSeed,
      idictationFlashSourceKey,
      reusableWordOrderSnapshot
    ]
  );
  const reconciledWordOrder = useMemo(() => {
    if (
      !baseStudyWordIndices.length
      || !isFixedWordStudyOrderMode(wordOrderMode, wordOrderDifficultyMode)
      || !activeWordOrderSnapshot
    ) {
      return null;
    }
    if (reusableWordOrderSnapshot) return reusableWordOrderSnapshot;
    return reconcileWordStudyOrderSnapshot(
      activeWordOrderSnapshot,
      generatedStudyWordIndices,
      activeWordPool,
      {
        idictation: Boolean(idictationFlashSourceKey),
        fallbackOrder: generatedStudyWordIndices
      }
    );
  }, [
    activeWordOrderSnapshot,
    activeWordPool,
    baseStudyWordIndices.length,
    generatedStudyWordIndices,
    idictationFlashSourceKey,
    reusableWordOrderSnapshot,
    wordOrderDifficultyMode,
    wordOrderMode
  ]);
  const studyWordIndices = reconciledWordOrder?.indices || generatedStudyWordIndices;

  useEffect(() => {
    if (!reconciledWordOrder?.changed) return;
    saveWordOrderSnapshot(activeWordOrderSnapshotKey, reconciledWordOrder.snapshot);
  }, [
    activeWordOrderSnapshotKey,
    reconciledWordOrder,
    saveWordOrderSnapshot
  ]);

  const activateWordOrder = useCallback((nextMode, nextDifficultyMode) => {
    const idictation = Boolean(idictationFlashSourceKey);
    const difficultyEnabled = !idictation;
    const normalizedDifficultyMode = difficultyEnabled
      ? normalizeWordStudyDifficultyMode(nextDifficultyMode)
      : WORD_STUDY_DIFFICULTY_MODE.DEFAULT;
    let targetIndex = null;

    if (nextMode === WORD_STUDY_ORDER_MODE.RANDOM) {
      const seed = Date.now();
      const nextOrder = orderStudyWordIndices(baseStudyWordIndices, activeWordPool, {
        mode: nextMode,
        difficultyMode: normalizedDifficultyMode,
        difficultyEnabled,
        seed,
        idictation
      });
      setWordOrderMode(nextMode, { seed });
      setWordDifficultyMode(normalizedDifficultyMode);
      targetIndex = nextOrder[0];
    } else if (isFixedWordStudyOrderMode(nextMode, normalizedDifficultyMode)) {
      const nextSnapshotKey = wordStudyOrderSnapshotKey(
        nextMode,
        normalizedDifficultyMode
      );
      const existingSnapshot = wordOrderSnapshots[nextSnapshotKey];
      if (existingSnapshot) {
        const reusable = reconcileWordStudyOrderSnapshot(
          existingSnapshot,
          baseStudyWordIndices,
          activeWordPool,
          { idictation, fallbackOrder: baseStudyWordIndices }
        );
        const reconciled = reusable.changed ? (() => {
          const freshOrder = orderStudyWordIndices(baseStudyWordIndices, activeWordPool, {
            mode: nextMode,
            difficultyMode: normalizedDifficultyMode,
            difficultyEnabled,
            idictation
          });
          return reconcileWordStudyOrderSnapshot(
            existingSnapshot,
            freshOrder,
            activeWordPool,
            { idictation, fallbackOrder: freshOrder }
          );
        })() : reusable;
        saveWordOrderSnapshot(nextSnapshotKey, reconciled.snapshot);
        saveWordOrderCursor(nextSnapshotKey, reconciled.snapshot.cursorKey);
        targetIndex = reconciled.cursorIndex ?? reconciled.indices[0];
      } else {
        const freshOrder = orderStudyWordIndices(baseStudyWordIndices, activeWordPool, {
          mode: nextMode,
          difficultyMode: normalizedDifficultyMode,
          difficultyEnabled,
          idictation
        });
        const snapshot = createWordStudyOrderSnapshot(freshOrder, activeWordPool, {
          idictation,
          cursorIndex: freshOrder[0]
        });
        saveWordOrderSnapshot(nextSnapshotKey, snapshot);
        saveWordOrderCursor(nextSnapshotKey, snapshot.cursorKey);
        targetIndex = freshOrder[0];
      }
      setWordOrderMode(nextMode);
      setWordDifficultyMode(normalizedDifficultyMode);
    } else {
      setWordOrderMode(nextMode);
      setWordDifficultyMode(normalizedDifficultyMode);
    }

    if (!Number.isInteger(targetIndex)) return;
    const sessionState = studySessionRef.current;
    sessionState.userAdjusted = true;
    sessionState.restoreTargetIndex = null;
    sessionState.persistBlocked = false;
    sessionState.settling = false;
    latestStateRef.current.index = targetIndex;
    setIndex(targetIndex);
    persistWordFlashSessionNow(targetIndex);
  }, [
    activeWordPool,
    baseStudyWordIndices,
    idictationFlashSourceKey,
    latestStateRef,
    persistWordFlashSessionNow,
    saveWordOrderCursor,
    saveWordOrderSnapshot,
    setIndex,
    setWordDifficultyMode,
    setWordOrderMode,
    studySessionRef,
    wordOrderSnapshots
  ]);
  const handleWordOrderModeChange = useCallback(
    (nextMode) => activateWordOrder(nextMode, wordOrderDifficultyMode),
    [activateWordOrder, wordOrderDifficultyMode]
  );
  const handleWordDifficultyModeChange = useCallback(
    (nextDifficultyMode) => activateWordOrder(wordOrderMode, nextDifficultyMode),
    [activateWordOrder, wordOrderMode]
  );
  const studyWords = useMemo(
    () => (isWordFlashActive
      ? studyWordIndices
        .map((poolIndex) => (
          activeWordByIndex
            ? activeWordByIndex.get(poolIndex) || null
            : activeWordPool[poolIndex] || null
        ))
        .filter(Boolean)
      : []),
    [isWordFlashActive, studyWordIndices, activeWordPool, activeWordByIndex]
  );

  const effectiveIndex = effectiveStudyIndex(studySessionRef.current, index);
  const currentStudyPosition = useMemo(
    () => studyWordIndices.indexOf(effectiveIndex),
    [studyWordIndices, effectiveIndex]
  );

  useEffect(() => {
    if (
      !activeWordOrderSnapshot
      || !isFixedWordStudyOrderMode(wordOrderMode, wordOrderDifficultyMode)
    ) {
      return;
    }
    const currentWord = resolveStudyWordEntry(activeWordPool, effectiveIndex, activeWordByIndex);
    const nextSnapshot = updateWordStudyOrderSnapshotCursor(
      activeWordOrderSnapshot,
      currentWord,
      effectiveIndex,
      { idictation: Boolean(idictationFlashSourceKey) }
    );
    if (nextSnapshot !== activeWordOrderSnapshot) {
      saveWordOrderCursor(activeWordOrderSnapshotKey, nextSnapshot.cursorKey);
    }
  }, [
    activeWordByIndex,
    activeWordOrderSnapshot,
    activeWordOrderSnapshotKey,
    activeWordPool,
    effectiveIndex,
    idictationFlashSourceKey,
    saveWordOrderCursor,
    wordOrderDifficultyMode,
    wordOrderMode
  ]);
  const resolvedStudyItem = useMemo(
    () => resolveCurrentStudyItem({
      words,
      index: effectiveIndex,
      filter,
      studyPool: isIdictationFlashFilter(filter) ? activeWordPool : null
    }),
    [words, effectiveIndex, filter, activeWordPool]
  );
  const isIndexInsideStudyQueue = currentStudyPosition >= 0;
  const safeStudyPosition = isIndexInsideStudyQueue ? currentStudyPosition : 0;
  const isStudyEmpty = studyWordIndices.length === 0;
  const seekStudyPosition = useCallback((position) => {
    const targetIndex = wordStudyIndexAtPosition(studyWordIndices, position);
    if (!Number.isInteger(targetIndex)) return;

    const sessionState = studySessionRef.current;
    sessionState.userAdjusted = true;
    sessionState.restoreTargetIndex = null;
    sessionState.persistBlocked = false;
    sessionState.settling = false;
    latestStateRef.current.index = targetIndex;
    setIndex(targetIndex);
    persistWordFlashSessionNow(targetIndex);
  }, [
    latestStateRef,
    persistWordFlashSessionNow,
    setIndex,
    studySessionRef,
    studyWordIndices
  ]);
  latestStateRef.current = {
    loading,
    isStudyEmpty,
    index: effectiveIndex,
    words,
    filter,
    studyWords,
    studyWordIndices,
    wordOrderMode,
    wordOrderSeed
  };

  flashStudyModeRef.current = flashStudyMode;

  useEffect(() => {
    const moduleKey = flashStudyMode === "phrase"
      ? "main-phrases"
      : flashStudyMode === "paraphrase"
        ? "main-paraphrases"
        : "main";
    notifyEffectiveStudyModuleChange(moduleKey);
  }, [flashStudyMode]);

  useEffect(() => {
    const sessionState = studySessionRef.current;
    if (!sessionState.settling || !sessionState.restored) return;

    const targetIndex = Number.isInteger(sessionState.restoreTargetIndex)
      ? sessionState.restoreTargetIndex
      : index;

    if (!studyWords.length) {
      sessionState.settling = false;
      return;
    }
    if (!studyWordIndices.includes(targetIndex)) {
      sessionState.settling = false;
      return;
    }

    sessionState.settling = false;
  }, [studySessionRef, studyWords, studyWordIndices, index]);

  const isWordLexiconLoading = vocabRuntime.status === "loading" || (
    (vocabRuntime.status === "online" || vocabRuntime.status === "offline") &&
    Number(vocabRuntime.count) > 0 &&
    words.length === 0
  );
  const emptyItem = {
    word: isWordLexiconLoading ? "正在读取词库" : "完成",
    phonetic: "",
    pos: "",
    meaning: isWordLexiconLoading ? "请稍候，正在读取正式词库" : "当前范围没有待学习单词",
    example: isWordLexiconLoading ? "词库加载完成后会自动显示当前学习词。" : "这个分类里的单词已经学完，或者还没有符合条件的词。",
    exampleCn: isWordLexiconLoading ? "正在准备真实词库。" : "可以切换到“不熟词库”、其他分类，或者导入新词。",
    collocations: [],
    phraseCollocations: [],
    favorite: false,
    status: ""
  };
  const item = isStudyEmpty
    ? emptyItem
    : resolvedStudyItem || (idictationFlashSourceKey
      ? studyWords[0] || emptyItem
      : studySessionRef.current.restored
        ? emptyItem
        : studyWords[0] || DEMO_WORDS[0]);
  const isExternalIdictationItem = Boolean(item?.__idictationFlash);
  const studyRangeDetail = isWordLexiconLoading
    ? "正在读取正式词库，请稍候。"
    : isStudyEmpty
      ? "当前范围没有待学内容，可以更改范围或切到全部可刷词。"
      : !isIndexInsideStudyQueue && resolvedStudyItem?.word
        ? `已恢复到：${resolvedStudyItem.word}（不在当前待学范围，按 ←/→ 可回到队列）`
        : `当前位置：${safeStudyPosition + 1} / ${studyWords.length} · 当前词：${item.word || "—"}`;
  const commonCollocationFallback = isWordLexiconLoading
    ? [{ phrase: "", chinese: "正在读取词库" }]
    : [{ phrase: "等待 AI 生成搭配", chinese: "" }];
  const phraseCollocationFallback = isWordLexiconLoading
    ? [{ phrase: "", chinese: "正在读取词库" }]
    : [{ phrase: "等待 AI 生成短语搭配", chinese: "" }];
  const prevPoolIndex = studyWordIndices.length
    ? studyWordIndices[(safeStudyPosition - 1 + studyWordIndices.length) % studyWordIndices.length]
    : null;
  const prevItem = resolveStudyWordEntry(activeWordPool, prevPoolIndex, activeWordByIndex);

  const {
    speakWord,
    speakExample,
    speakSmallText,
    warmSpeechAudio
  } = useHomeWordSpeech({
    item,
    setToast,
    patchAudioStatusKey
  });

  useEffect(() => {
    if (!isWordFlashActive) return;

    const sessionState = studySessionRef.current;
    if (!sessionState.restored || !words.length || !studyWordIndices.length) return;
    if (sessionState.settling || shouldBlockStudyIndexPersist(sessionState, index)) return;
    if (studyWordIndices.includes(effectiveIndex)) return;
    if (resolvedStudyItem?.word) return;

    const nearest =
      studyWordIndices.find((poolIndex) => poolIndex > effectiveIndex) ||
      studyWordIndices[studyWordIndices.length - 1];
    if (nearest === undefined || nearest === effectiveIndex) return;

    sessionState.restoreTargetIndex = null;
    latestStateRef.current.index = nearest;
    setIndex(nearest);
    persistWordFlashSessionNow(nearest);
  }, [isWordFlashActive, studySessionRef, studyWordIndices, effectiveIndex, index, words, resolvedStudyItem?.word, persistWordFlashSessionNow]);

  useEffect(() => {
    if (!isWordFlashActive || !item?.word || item.word === "完成" || isStudyEmpty || isWordLexiconLoading) return;
    const batch = warmTtsBatchRef.current + 1;
    warmTtsBatchRef.current = batch;

    warmTtsTimersRef.current.forEach((timer) => clearTimeout(timer));
    warmTtsTimersRef.current = [];

    // 极速音频：不再自动查 pronunciation。
  // 当前词和例句只预热发音音频本地缓存，点击时直接播放。
    const currentText = item.word;
    const candidates = [
      { text: currentText, kind: isSimpleDictionaryWord(currentText) ? "word" : "phrase" },
      { text: item.example, kind: "sentence" }
    ]
      .map((entry) => ({ ...entry, text: String(entry.text || "").trim() }))
      .filter((entry) => entry.text && entry.text !== "完成")
      .filter((entry, pos, list) => list.findIndex((other) => other.kind === entry.kind && other.text === entry.text) === pos);

    const timers = candidates.map((entry, order) => {
      return window.setTimeout(() => {
        if (warmTtsBatchRef.current !== batch) return;
        warmSpeechAudio(entry.text, entry.kind);
      }, SPEECH_WARM_DELAYS_MS[order] ?? 700 + order * 350);
    });

    warmTtsTimersRef.current = timers;

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      if (warmTtsBatchRef.current === batch) {
        warmTtsTimersRef.current = [];
      }
    };
  }, [isWordFlashActive, item?.word, item?.example, index, currentStudyPosition, studyWordIndices.length, isStudyEmpty, isWordLexiconLoading, warmSpeechAudio]);

  const commonCollocations = normalizePhraseItems(item.collocations);
  const phraseCollocations = normalizePhraseItems(item.phraseCollocations);
  const audioInfo = audioMap[normalizeWord(item.word)] || {};
  const displayForms = getDisplayForms(item, { wordMap: libraryWordMap });
  const displayFamily = enrichDisplayFamily(item.wordFamily, libraryWordMap, item.word);

  const filteredWordIndices = useMemo(
    () => (isWordFlashActive && libraryStatsOpen
      ? buildFilteredWordIndices(activeWordPool, filter, search, { idictation: Boolean(idictationFlashSourceKey), matchesWord: matchesActiveFilter })
      : []),
    [isWordFlashActive, libraryStatsOpen, activeWordPool, filter, search, idictationFlashSourceKey, matchesActiveFilter]
  );

  const wordSearchResolution = useMemo(
    () => resolveWordSearchTarget(words, search),
    [words, search]
  );

  const wordSearchMatches = useMemo(
    () => findWordSearchMatches(words, search),
    [words, search]
  );

  const wordLibraryStats = useMemo(() => {
    if (!isWordFlashActive) {
      return { total: 0, physical: 0, references: 0, studyReferences: 0, pending: 0, blurry: 0, unfamiliar: 0, familiar: 0, todayReviewed: 0, missing: 0, classifyMissing: 0, repairMissing: 0, headwordRepair: 0, enrichmentThin: 0, familyReview: 0, familyPromotion: 0 };
    }

    let total = 0;
    let references = 0;
    let studyReferences = 0;
    let pending = 0;
    let blurry = 0;
    let unfamiliar = 0;
    let familiar = 0;
    let todayReviewed = 0;
    let missing = 0;
    let classifyMissing = 0;
    let repairMissing = 0;
    let headwordRepair = 0;
    let enrichmentThin = 0;
    let familyReview = 0;
    let familyPromotion = 0;
    const shouldCalculateQualityStats = libraryStatsOpen || toolsOpen || aiToolsOpen;
    const knownHeadwords = shouldCalculateQualityStats
      ? new Set(libraryWordMap.keys())
      : null;

    for (const word of words) {
      if (isReferenceWord(word)) {
        references += 1;
        continue;
      }
      if (!isBrushableWord(word)) continue;
      total += 1;
      const isStudyReference = word.studyMode === "reference";
      if (isStudyReference) {
        studyReferences += 1;
      } else {
        if (word.status !== "熟悉") pending += 1;
        if (word.status === "模糊") blurry += 1;
        if (word.status === "不熟") unfamiliar += 1;
        if (word.status === "熟悉") familiar += 1;
      }
      if (word.lastReviewedAt && new Date(word.lastReviewedAt).toDateString() === new Date().toDateString()) todayReviewed += 1;
      if (hasHeadwordRepair(word.word)) headwordRepair += 1;
      if (shouldCalculateQualityStats) {
        const quality = getWordQualityEvaluation(word, {
          needsRepair: isLikelyWrongAiWord(word),
          knownHeadwords
        });
        if (quality.lane === "completion") missing += 1;
        if (quality.lane === "classification") classifyMissing += 1;
        if (quality.lane === "repair") repairMissing += 1;
        if (quality.needsOptionalEnrichment) enrichmentThin += 1;
        if (quality.needsFamilyReview) familyReview += 1;
        if (quality.hasFamilyPromotionCandidate) familyPromotion += 1;
      }
    }

    return { total, physical: words.length, references, studyReferences, pending, blurry, unfamiliar, familiar, todayReviewed, missing, classifyMissing, repairMissing, headwordRepair, enrichmentThin, familyReview, familyPromotion };
  }, [
    isWordFlashActive,
    words,
    libraryWordMap,
    libraryStatsOpen,
    toolsOpen,
    aiToolsOpen
  ]);

  const familiarCount = wordLibraryStats.familiar;
  const missingCount = wordLibraryStats.missing;
  const classifyMissingCount = wordLibraryStats.classifyMissing;
  const repairMissingCount = wordLibraryStats.repairMissing;
  const enrichmentThinCount = wordLibraryStats.enrichmentThin;
  const familyReviewCount = wordLibraryStats.familyReview;
  const familyPromotionCount = wordLibraryStats.familyPromotion;

  const audioStats = useMemo(() => {
    if (!isWordFlashActive) {
      return {
        revision: audioStatsRevision,
        state: audioStatusState,
        total: 0,
        has: 0,
        missing: 0,
        unchecked: 0
      };
    }

    let has = 0;
    let missing = 0;
    let unchecked = 0;

    words.forEach((word) => {
      if (!isBrushableWord(word)) return;
      const key = normalizeWord(word.word);
      if (!key) return;

      const cachedAudio = audioMap[key]?.audioUrl;
      const status = audioStatusMapRef.current[key] || {};

      if (cachedAudio || status.hasAudio) {
        has += 1;
      } else if (status.checked) {
        missing += 1;
      } else {
        unchecked += 1;
      }
    });

    return {
      revision: audioStatsRevision,
      state: audioStatusState,
      total: has + missing + unchecked,
      has,
      missing,
      unchecked
    };
  }, [isWordFlashActive, words, audioMap, audioStatsRevision, audioStatusMapRef, audioStatusState]);

  const progressPercent = studyWords.length ? ((safeStudyPosition + 1) / studyWords.length) * 100 : 0;

  const {
    importFromText,
    handleFile,
    undoLastLocalChange,
    clearLastLocalChangeLog,
    undoOneLocalChangeItem,
    localCleanWordList,
    localDedupeWords,
    localMergeWordForms,
    localOptimizeWordList,
    confirmAiCost,
    generateCurrent,
    aiRepairCurrentWordSymbol,
    aiCompletePendingAndUnclassifiedOneByOne,
    aiSlowCompleteMissing10x1,
    aiStableRepairWrongWords10x2,
    generateHundredByFiveBatch,
    startContinuousAiStructureRepair,
    startContinuousAiCompletion,
    stopContinuousAiCompletion,
    categorizeWords,
    exportStaticSite,
    openEditCurrentWord,
    updateEditDraft,
    saveEditCurrentWord,
    recoverWordsFromLocalFiles,
    recoverWordsFromTencentCloud,
    cleanBrowserStorageNow,
    localScanTtsSymbols,
    localRepairTruncatedHeadwords,
    clearWrongAiRepairFlags,
    localScanObscureDerivedWords,
    localDeleteObscureDerivedWords,
    localScanAndRepairWrongWords,
    deleteCurrentWord,
    downloadBlankVocabTemplateJson,
    downloadBlankVocabTemplateCsv,
    importTemplateVocabFile,
    downloadVocabBackup,
    downloadEnglishOnlyTxt,
    importVocabBackup,
    exportJSON
  } = useHomeLexiconAdmin({
    words,
    setWords,
    index,
    setIndex,
    filter,
    lastLocalChange,
    setLastLocalChange,
    setLoading,
    setToast,
    setBatchInfo,
    setAiRunState,
    aiRunControlRef,
    setDuplicateInfo,
    setEditOpen,
    setEditDraft,
    editDraft,
    item,
    isExternalIdictationItem,
    pasteText,
    setPasteText,
    persistWordsImmediately,
    markContentSnapshot,
    resetWordStudySessionState,
    cacheMetaRef,
    latestStateRef,
    mainDeleteConfirmationRef,
    entryPositionsRef,
    persistWordFlashSessionNow,
    compactBrowserStorageForCurrentWords,
    demoWords: DEMO_WORDS,
    setFilter,
    prefillWordAudio
  });

  const deleteCurrentWordWithTidyAudit = useCallback(() => {
    const latest = latestStateRef.current || {};
    const activeFilter = latest.filter || filter;
    const sourceWords = Array.isArray(latest.words) && latest.words.length ? latest.words : words;
    const targetIndex = Number.isInteger(latest.index) ? latest.index : index;
    const deletionPlan = buildAtomicDeletionNavigation({
      words: sourceWords,
      currentIndex: targetIndex,
      filter: activeFilter,
      wordMatchesFilter: matchesActiveFilter,
      normalizeWord,
      orderedQueue: latest.studyWordIndices
    });

    if (!deletionPlan) {
      return deleteCurrentWord();
    }

    let deletionResult = null;
    // Only flush words+index so the successor paints immediately. Snapshot remap
    // and session persist run after, so连点删除 is not blocked by localStorage.
    flushSync(() => {
      deletionResult = deleteCurrentWord(deletionPlan);
      if (!deletionResult?.deleted) return;

      latest.words = deletionResult.words;
      latest.index = deletionResult.index;
      latest.isStudyEmpty = deletionResult.queueLength === 0;
      latest.studyWordIndices = deletionResult.queueIndices;
      latest.studyWords = deletionResult.queueIndices.map(
        (sourceIndex) => deletionResult.words[sourceIndex]
      ).filter(Boolean);
    });

    if (!deletionResult?.deleted) return deletionResult;

    if (activeFilter?.type === LEXICON_TIDY_FILTER_TYPE) {
      recordTidyDeletedWords(sourceWords, targetIndex);
    }

    const remappedSnapshots = remapWordStudyOrderSnapshotsAfterDeletion(
      wordOrderSnapshots,
      sourceWords,
      deletionResult.words
    );
    if (isFixedWordStudyOrderMode(wordOrderMode, wordOrderDifficultyMode)) {
      remappedSnapshots[activeWordOrderSnapshotKey] = createWordStudyOrderSnapshot(
        deletionResult.queueIndices,
        deletionResult.words,
        { cursorIndex: deletionResult.index }
      );
    }
    // Defer snapshot/cursor writes — not needed for the next paint.
    queueMicrotask(() => {
      Object.entries(remappedSnapshots).forEach(([snapshotKey, snapshot]) => {
        saveWordOrderSnapshot(snapshotKey, snapshot);
        saveWordOrderCursor(snapshotKey, snapshot.cursorKey);
      });
    });

    const sessionState = studySessionRef.current;
    sessionState.userAdjusted = true;
    sessionState.restoreTargetIndex = null;
    sessionState.persistBlocked = false;
    sessionState.settling = false;
    queueMicrotask(() => {
      persistWordFlashSessionNow(
        deletionResult.index,
        activeFilter,
        deletionResult.words
      );
    });
    return deletionResult;
  }, [
    activeWordOrderSnapshotKey,
    deleteCurrentWord,
    filter,
    index,
    matchesActiveFilter,
    persistWordFlashSessionNow,
    recordTidyDeletedWords,
    saveWordOrderCursor,
    saveWordOrderSnapshot,
    studySessionRef,
    wordOrderDifficultyMode,
    wordOrderMode,
    wordOrderSnapshots,
    words
  ]);

  const {
    markStatus,
    nextWord,
    prevWord,
    toggleFavorite
  } = useWordFlashNavigation({
    flashStudyMode,
    flashStudyModeRef,
    studySessionRef,
    latestStateRef,
    studyWords,
    words,
    setWords,
    index,
    setIndex,
    filter,
    setToast,
    item,
    isExternalIdictationItem,
    idictationFlashSourceKey,
    persistWordFlashSessionNow,
    speakWord,
    speakExample,
    deleteCurrentWord: deleteCurrentWordWithTidyAudit,
    matchesStudyWord: matchesActiveFilter
  });

  const keepCurrentTidyWord = useCallback(() => {
    if (filter?.type !== LEXICON_TIDY_FILTER_TYPE || isStudyEmpty) return;
    const currentIndex = Number.isInteger(latestStateRef.current?.index)
      ? latestStateRef.current.index
      : effectiveIndex;
    const currentWord = words[currentIndex];
    if (!currentWord || !getTidyCandidate(currentIndex)) return;

    keepTidyWord(currentWord, currentIndex);
    const currentPosition = studyWordIndices.indexOf(currentIndex);
    const remaining = studyWordIndices.filter((wordIndex) => wordIndex !== currentIndex);
    if (remaining.length) {
      const nextPosition = Math.min(Math.max(0, currentPosition), remaining.length - 1);
      const nextIndex = remaining[nextPosition];
      latestStateRef.current.index = nextIndex;
      setIndex(nextIndex);
      persistWordFlashSessionNow(nextIndex, filter, words);
    }
    setToast(`已留在主词库：${currentWord.word}，以后不会再放进这份清单`);
  }, [effectiveIndex, filter, getTidyCandidate, isStudyEmpty, keepTidyWord, persistWordFlashSessionNow, studyWordIndices, words]);

  const learningEntryCounts = useMemo(() => {
    if (!isWordFlashActive) return new Map();

    const counts = buildLearningEntryCounts(words, LEARNING_ENTRIES, {
      filterKey,
      isIdictationFlashFilter,
      getIdictationSource
    });
    counts.set("tidy:review", lexiconTidyReview.counts.review);
    counts.set("tidy:basic", lexiconTidyReview.counts.basic);
    counts.set("tidy:issues", lexiconTidyReview.counts.issues);
    return counts;
  }, [
    isWordFlashActive,
    words,
    lexiconTidyReview.counts.review,
    lexiconTidyReview.counts.basic,
    lexiconTidyReview.counts.issues
  ]);

  const learningEntryGroups = useMemo(() => {
    if (!isWordFlashActive) return [];

    return LEARNING_ENTRIES.map((group) => ({
      ...group,
      items: group.items.map((entry) => {
        const entryFilterKey = filterKey(entry.filter);
        const count = learningEntryCounts.get(entryFilterKey) ?? 0;
        let currentWordLabel = "";

        if (count <= 0) {
          currentWordLabel = "";
        } else if (isSameFilter(filter, entry.filter)) {
          const activeWord = resolvedStudyItem;
          if (activeWord && matchesActiveFilter(activeWord, entry.filter, index)) {
            currentWordLabel = activeWord.word || "";
          }
        } else {
          const currentKey = entryPositionsRef.current[entryFilterKey] || "";

          if (currentKey) {
            if (isIdictationFlashFilter(entry.filter)) {
              const source = idictationFlashReady ? getIdictationSource(entry.filter.value) : null;
              currentWordLabel = source?.entries?.find((word) => normalizeWord(word.word) === currentKey)?.word || "";
            } else {
              const savedWord = libraryWordMap.get(currentKey);
              const savedIndex = savedWord ? words.indexOf(savedWord) : -1;
              if (savedWord && matchesActiveFilter(savedWord, entry.filter, savedIndex)) {
                currentWordLabel = savedWord.word || "";
              }
            }
          }
        }

        return {
          ...entry,
          count,
          currentWord: currentWordLabel
        };
      })
    }));
  }, [
    isWordFlashActive,
    words,
    filter,
    index,
    resolvedStudyItem,
    matchesActiveFilter,
    learningEntryCounts,
    libraryWordMap,
    idictationFlashReady,
    entryPositionsRef
  ]);

  async function setLibraryFilter(type, value) {
    const requestId = filterSwitchRequestRef.current + 1;
    filterSwitchRequestRef.current = requestId;

    if (type === LEXICON_TIDY_FILTER_TYPE && !lexiconTidyReady) {
      setToast("正在准备这份词库整理清单，请稍等一下");
      return;
    }

    studySessionRef.current.userAdjusted = true;
    studySessionRef.current.restoreTargetIndex = null;
    studySessionRef.current.persistBlocked = false;
    persistWordFlashSessionNow();

    const nextFilter = { type, value };
    if (isIdictationFlashFilter(nextFilter)) {
      if (!isIdictationFrequencyLoaded()) {
        setToast(`正在加载${value === "reading" ? "爱听写阅读" : "爱听写听力"}词表…`);
        try {
          await ensureIdictationFrequencyData();
        } catch {
          if (filterSwitchRequestRef.current === requestId) {
            setToast("爱听写词表加载失败，请稍后重试");
          }
          return;
        }

        if (filterSwitchRequestRef.current !== requestId) return;
      }
      setIdictationFlashReady(true);
    }

    const studyPool = buildStudyPoolForFilter(nextFilter, words);
    const targetPool = isIdictationFlashFilter(nextFilter)
      ? buildIdictationFlashWords(nextFilter.value, words, libraryWordMap)
      : words;

    const result = resolveFilterSwitchIndex(resolveWordStudyIndex, {
      words,
      entryPositions: entryPositionsRef.current,
      filter: nextFilter,
      filterKey,
      wordMatchesFilter: matchesActiveFilter,
      normalizeWord,
      studyPool,
      findFirstInFilter: () => {
        if (!isIdictationFlashFilter(nextFilter)) {
          return targetPool.findIndex((word, sourceIndex) => matchesActiveFilter(word, nextFilter, sourceIndex));
        }

        const first = targetPool.find((word, sourceIndex) => matchesActiveFilter(word, nextFilter, sourceIndex));
        return Number.isInteger(first?.originalIndex) ? first.originalIndex : -1;
      }
    });

    setFilter(nextFilter);

    if (result.index >= 0) {
      latestStateRef.current.index = result.index;
      latestStateRef.current.filter = nextFilter;
      setIndex(result.index);
      persistWordFlashSessionNow(result.index, nextFilter);
    }
  }

  function selectLibraryWord(poolIndex) {
    studySessionRef.current.userAdjusted = true;
    studySessionRef.current.restoreTargetIndex = null;
    studySessionRef.current.persistBlocked = false;
    latestStateRef.current.index = poolIndex;
    setIndex(poolIndex);
    persistWordFlashSessionNow(poolIndex);

    if (wordSearchResolution?.redirected && wordSearchResolution.index === poolIndex) {
      const typeLabel = wordSearchResolution.relationType || "语法变形";
      setToast(`${wordSearchResolution.source.word} 是 ${wordSearchResolution.target.word} 的${typeLabel}，已进入基词。`);
    }
  }

  function jumpToWordSearchResult() {
    if (!wordSearchResolution || wordSearchResolution.index < 0) return;
    const nextFilter = { type: "everything", value: "" };
    const targetIndex = wordSearchResolution.index;

    studySessionRef.current.userAdjusted = true;
    studySessionRef.current.restoreTargetIndex = null;
    studySessionRef.current.persistBlocked = false;
    latestStateRef.current.index = targetIndex;
    latestStateRef.current.filter = nextFilter;
    setFilter(nextFilter);
    setIndex(targetIndex);
    persistWordFlashSessionNow(targetIndex, nextFilter);

    if (wordSearchResolution.redirected) {
      const typeLabel = wordSearchResolution.relationType || "语法变形";
      setToast(`${wordSearchResolution.source.word} 是 ${wordSearchResolution.target.word} 的${typeLabel}，已进入基词。`);
    } else {
      setToast(`已跳转到：${wordSearchResolution.target.word}`);
    }
  }

  if (vocabRuntime.status === "loading") {
    return (
      <main className="page page--word-flash system-loading-page" data-study-surface="flash">
        <StableLoadingState
          mark="V"
          eyebrow="主词库刷词"
          note="读取主词库并恢复上次学习位置"
        />
      </main>
    );
  }

  return (
    <main
      className={`page${flashStudyMode === "phrase" || flashStudyMode === "paraphrase" ? " page--flash-training" : " page--word-flash"}`}
      data-study-surface="flash"
      data-effective-study-module={flashStudyMode === "phrase"
        ? "main-phrases"
        : flashStudyMode === "paraphrase"
          ? "main-paraphrases"
          : "main"}
    >
      <div className="flash-mode-switch" role="tablist" aria-label="刷词模式">
        <button
          type="button"
          role="tab"
          aria-selected={flashStudyMode === "word"}
          className={`flash-mode-tab ${flashStudyMode === "word" ? "active" : ""}`}
          onClick={() => setFlashStudyMode("word")}
        >
          单词刷词
          <span className="flash-mode-meta">
            {formatVocabCountLabel(vocabRuntime.status, wordLibraryStats.total)}
            <span className="flash-mode-sub">可刷词</span>
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={flashStudyMode === "phrase"}
          className={`flash-mode-tab ${flashStudyMode === "phrase" ? "active" : ""}`}
          onClick={() => setFlashStudyMode("phrase")}
        >
          词组刷词
          <span className="flash-mode-meta">
            {phraseRuntimeCount == null ? "—" : `${phraseRuntimeCount.toLocaleString()} 词组`}
            <span className="flash-mode-sub">短语层·独立计数</span>
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={flashStudyMode === "paraphrase"}
          className={`flash-mode-tab ${flashStudyMode === "paraphrase" ? "active" : ""}`}
          onClick={() => setFlashStudyMode("paraphrase")}
        >
          听力阅读同义替换
          <span className="flash-mode-meta">
            {lrSynonymCount == null ? "—" : `${lrSynonymCount.toLocaleString()} 组`}
            <span className="flash-mode-sub">同义组·非词条</span>
          </span>
        </button>
      </div>
      {vocabRuntime.status === "offline" ? (
        <div className="vocab-runtime-notice" role="status">
          {formatOfflineVocabNotice(vocabRuntime)}
        </div>
      ) : null}
      {vocabRuntime.status === "error" ? (
        <div className="vocab-runtime-notice vocab-runtime-notice--error" role="alert">
          当前无法加载在线词库，且没有可用的离线词库缓存
        </div>
      ) : null}

      {flashStudyMode === "phrase" ? (
        <PhraseFlashcardPanel />
      ) : flashStudyMode === "paraphrase" ? (
        <LrParaphrasePanel />
      ) : (
        <>
        <WordFlashcardView
          model={{
            prevItem,
            item,
            audioInfo,
            displayForms,
            displayFamily,
            commonCollocations,
            phraseCollocations,
            collocationFallback: commonCollocationFallback,
            phraseCollocationFallback,
            isStudyEmpty,
            isExternalIdictationItem,
            progressPercent,
            safeStudyPosition,
            studyRangeDetail,
            fallback
          }}
          library={{
            filter,
            studyWords,
            learningEntryGroups,
            search,
            setSearch,
            wordSearchResolution,
            wordSearchMatches,
            jumpToWordSearchResult,
            selectLibraryWord,
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
            onLibraryOpenChange: setLibraryStatsOpen,
            familiarCount,
            missingCount,
            classifyMissingCount,
            repairMissingCount,
            enrichmentThinCount,
            familyReviewCount,
            familyPromotionCount
          }}
          speech={{
            speakWord,
            speakExample,
            speakSmallText
          }}
          admin={{
            toolsMenuRef,
            aiToolsRef,
            toolsOpen,
            aiToolsOpen,
            onToolsOpenChange: setToolsOpen,
            onAiToolsOpenChange: setAiToolsOpen,
            loading,
            pasteText,
            setPasteText,
            lastLocalChange,
            audioCacheStats,
            audioStats,
            batchInfo,
            aiRunState,
            qualityStats: wordLibraryStats,
            duplicateInfo,
            adminActions: {
              importFromText, handleFile, openEditCurrentWord, deleteCurrentWord: deleteCurrentWordWithTidyAudit,
              downloadVocabBackup, exportStaticSite, downloadBlankVocabTemplateCsv,
              importTemplateVocabFile, importVocabBackup, downloadEnglishOnlyTxt,
              undoLastLocalChange, clearLastLocalChangeLog, undoOneLocalChangeItem,
              localOptimizeWordList, localCleanWordList, localDedupeWords, localMergeWordForms,
              localScanAndRepairWrongWords, localRepairTruncatedHeadwords, localScanTtsSymbols,
              confirmAiCost, aiRepairCurrentWordSymbol, clearWrongAiRepairFlags,
              localScanObscureDerivedWords, localDeleteObscureDerivedWords,
              refreshAudioCacheStats, cleanupFallbackAudioCache, retryRealAudioForCurrentLibrary,
              prefillWordAudio, rebuildRealAudioFromStart, rebuildMissingAudioFromStart,
              clearRealAudioPrefillCursor, clearAudioPrefillCursor, dedupeLocalAudio,
              recoverWordsFromLocalFiles, recoverWordsFromTencentCloud, cleanBrowserStorageNow,
              downloadBlankVocabTemplateJson, exportJSON, generateCurrent, generateHundredByFiveBatch,
              startContinuousAiStructureRepair, startContinuousAiCompletion, stopContinuousAiCompletion,
              aiSlowCompleteMissing10x1, aiCompletePendingAndUnclassifiedOneByOne,
              aiStableRepairWrongWords10x2, categorizeWords
            }
          }}
          chrome={{
            TOPIC_OPTIONS,
            DIFFICULTY_OPTIONS,
            IELTS_USE_OPTIONS,
            IDICTATION_FLASH_FILTERS,
            wordOrderMode,
            wordOrderDifficultyMode,
            wordOrderDifficultyAvailable,
            wordOrderDifficultyEnabled,
            wordOrderDifficultyProfile,
            requestWordOrderDifficultyProfile: () => setDifficultyProfileRequestKey(activeOrderKey),
            setWordOrderMode: handleWordOrderModeChange,
            setWordDifficultyMode: handleWordDifficultyModeChange,
            nextWord,
            prevWord,
            toggleFavorite,
            markStatus,
            seekStudyPosition,
            tidyReview: {
              active: filter.type === LEXICON_TIDY_FILTER_TYPE,
              ready: lexiconTidyReady,
              candidate: getTidyCandidate(effectiveIndex),
              stats: lexiconTidyReview.counts,
              onKeep: keepCurrentTidyWord,
              onLater: nextWord,
              onDelete: deleteCurrentWordWithTidyAudit
            }
          }}
        />

      <WordEditModal
        open={editOpen}
        draft={editDraft}
        onClose={() => setEditOpen(false)}
        onChangeField={updateEditDraft}
        onSave={saveEditCurrentWord}
      />

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
        </>
      )}
    </main>
  );
}
