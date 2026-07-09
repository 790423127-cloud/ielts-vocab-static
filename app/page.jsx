"use client";

import { startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useHomeWordSpeech } from "./hooks/useHomeWordSpeech.js";
import { useHomeAudioPrefill } from "./hooks/useHomeAudioPrefill.js";
import { useHomeLexiconAdmin } from "./hooks/useHomeLexiconAdmin.js";
import { LEXICON_VERSION_WITHOUT_CONFIRMED_PERSON_NAMES } from "./lib/vocab/lexicon-guard-shared.mjs";
import { PHRASE_FLASH_STUDY_MODE_KEY } from "./lib/vocab/phrase-flashcard-keys.mjs";
import {
  formatOfflineVocabNotice,
  formatVocabCountLabel,
  isWordCacheCurrent,
  mergeWordContentWithUserState
} from "./lib/vocab/word-cache-meta.mjs";
import {
  loadWordsFromIndexedDB,
  postExportCache,
  saveWordUserStateToIndexedDB,
  saveWordsToIndexedDB
} from "./lib/vocab/word-store.mjs";
import PhraseFlashcardPanel from "./components/PhraseFlashcardPanel";
import LrParaphrasePanel from "./components/LrParaphrasePanel";
import StudyRangeSummary from "./components/StudyRangeSummary";
import VirtualList from "./components/VirtualList";
import VocabAdminToolsPanel from "./components/VocabAdminToolsPanel";
import WordEditModal from "./components/WordEditModal";
import WordFlashcardView from "./components/WordFlashcardView";
import {
  ensureIdictationFrequencyData,
  getIdictationSource
} from "./lib/spelling/idictation-frequency.mjs";
import {
  effectiveStudyIndex,
  releaseStudyPersistBlock,
  resolveFilterSwitchIndex,
  shouldBlockStudyIndexPersist,
  shouldReResolveStudyIndex,
  shouldRunFullStudyRestore
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
  findIdictationLibraryWord,
  getFilterName,
  isIdictationFlashFilter,
  isLifeWorkWord,
  isSameFilter,
  resolveStudyWordEntry,
  wordMatchesFilter
} from "./lib/vocab/word-flashcard-study-pool.mjs";
import {
  safeLocalStorageGet as sharedLocalStorageGet,
  safeLocalStorageRemove as sharedLocalStorageRemove,
  safeLocalStorageSet as sharedLocalStorageSet
} from "./lib/browser-storage.mjs";
import { cleanupBrowserCachesForVocab } from "./lib/vocab/cache-cleanup.mjs";
import {
  IDICTATION_FLASH_INDEX_OFFSET,
  WORD_FLASHCARD_POSITIONS_KEY,
  WORD_FLASHCARD_SESSION_KEY,
  clearWordStudySession,
  normalizeWordFlashFilter,
  persistWordFlashSession,
  readWordFlashEntryPositions,
  readWordFlashPendingSession,
  resolveCurrentStudyItem,
  resolveWordStudyIndex,
  restoreMessageForReason
} from "./lib/vocab/word-flashcard-session.mjs";
import { SPEECH_WARM_DELAYS_MS } from "./lib/vocab-speech.mjs";
import {
  compactBrowserStorageForCurrentWords,
  enrichDisplayFamily,
  fallback,
  getDisplayForms,
  getFormChineseType,
  getFormExplanation,
  getFormHint,
  getPosDisplay,
  isProbablyFullVocab,
  isSimpleDictionaryWord,
  normalizePhraseItems,
  normalizeWord,
  runWhenBrowserIdle,
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
  withTimeout
} from "./lib/vocab/page-word-helpers.mjs";

// Source anchors kept for regression tests: AI工具（会扣费）; 听力阅读同义替换; /data/phrases.json; LR_SYNONYM_URL; asSynonymItems(payload).length;
// lrSynonymCount == null ? "加载中" : `${lrSynonymCount.toLocaleString()} 组`

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

export default function Home() {
  const [words, setWords] = useState([]);

  function persistWordsImmediately(nextWords) {
    if (!isProbablyFullVocab(nextWords)) {
      setToast(`已阻止少量词覆盖大词库：当前只有 ${Array.isArray(nextWords) ? nextWords.length : 0} 个词，请先恢复词库`);
      return;
    }

    saveWordsToIndexedDB(nextWords, cacheMetaRef.current).catch(() => {
      compactBrowserStorageForCurrentWords(nextWords, cacheMetaRef.current)
        .then(() => setToast("已清理浏览器旧缓存并重新保存大词库"))
        .catch(() => setToast("本地保存失败：请先恢复词库，再点“清理浏览器存储空间”"));
    });

  }
  const [flashStudyMode, setFlashStudyMode] = useState("word");
  const [index, setIndex] = useState(0);
  const [pasteText, setPasteText] = useState("");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [batchInfo, setBatchInfo] = useState("");
  const [duplicateInfo, setDuplicateInfo] = useState("");
  const [vocabRuntime, setVocabRuntime] = useState({
    status: "loading",
    count: null,
    version: "",
    lexiconHash: ""
  });
  const [phraseRuntimeCount, setPhraseRuntimeCount] = useState(null);
  const [lrSynonymCount, setLrSynonymCount] = useState(null);
  const [idictationFlashRevision, setIdictationFlashRevision] = useState(0);
  const [lastLocalChange, setLastLocalChange] = useState(null);
  const [audioMap, setAudioMap] = useState({});
  const [audioCacheStats, setAudioCacheStats] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState(null);
  const [filter, setFilter] = useState({ type: "all", value: "" });
  const [meaningDetailOpen, setMeaningDetailOpen] = useState(false);

  const {
    audioStatusMapRef,
    audioStatsRevision,
    patchAudioStatusKey,
    mergeAudioStatusMap,
    prefillWordAudio,
    batchPrefillRealAudio,
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
  const pronunciationInFlightRef = useRef(new Map());

  const quickStatusLockRef = useRef(false);
  const markStatusRef = useRef(null);
  const storageReadyRef = useRef(false);
  const hydratedWordsRef = useRef(null);
  const studySessionRef = useRef({
    restored: false,
    userAdjusted: false,
    persistBlocked: true,
    restoreTargetIndex: null,
    settling: false,
    toastShown: false,
    wordsGeneration: 0
  });
  const sessionPersistTimerRef = useRef(null);
  const pendingSessionPersistRef = useRef(null);
  const pendingSessionRef = useRef(null);
  const nextWordRef = useRef(() => {});
  const prevWordRef = useRef(() => {});
  const speakWordRef = useRef(() => {});
  const speakExampleRef = useRef(() => {});
  const warmTtsTimersRef = useRef([]);
  const warmTtsBatchRef = useRef(0);
  const flashStudyModeRef = useRef(flashStudyMode);
  const cacheMetaRef = useRef({
    version: LEXICON_VERSION_WITHOUT_CONFIRMED_PERSON_NAMES,
    lexiconHash: "",
    savedAt: ""
  });
  const entryPositionsRef = useRef({});
  const latestStateRef = useRef({
    loading: false,
    isStudyEmpty: false,
    index: 0,
    words: [],
    filter: { type: "all", value: "" },
    studyWords: []
  });

  useEffect(() => {
    const savedMode = safeLocalStorageGet(PHRASE_FLASH_STUDY_MODE_KEY);
    if (savedMode === "word" || savedMode === "phrase" || savedMode === "paraphrase") {
      setFlashStudyMode(savedMode);
    }
  }, []);

  useEffect(() => {
    safeLocalStorageSet(PHRASE_FLASH_STUDY_MODE_KEY, flashStudyMode);
  }, [flashStudyMode]);

  useEffect(() => {
    let cancelled = false;

    async function loadRuntimeCounts() {
      const meta = await fetch("/api/catalog-meta", { cache: "no-store" })
        .then((response) => response.ok ? response.json() : null)
        .catch(() => null);

      if (cancelled) return;

      setPhraseRuntimeCount(Number.isFinite(meta?.phraseCount) ? meta.phraseCount : null);
      setLrSynonymCount(Number.isFinite(meta?.lrSynonymCount) ? meta.lrSynonymCount : null);
    }

    loadRuntimeCounts();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const openAiTools =
      window.location.hash === "#ai-tools" ||
      new URLSearchParams(window.location.search).get("openAiTools") === "1";

    if (!openAiTools) return;

    setFlashStudyMode("word");
    window.requestAnimationFrame(() => {
      if (toolsMenuRef.current) toolsMenuRef.current.open = true;
      if (aiToolsRef.current) {
        aiToolsRef.current.open = true;
        aiToolsRef.current.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    });
  }, []);

  useEffect(() => {
    let loadedWords = null;
    let cancelled = false;

    const saved = safeLocalStorageGet("ielts_vocab_words_deepseek");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length) {
          loadedWords = parsed;
          hydratedWordsRef.current = parsed;
          setWords(parsed);
          saveWordsToIndexedDB(parsed).catch(() => {});
        }
      } catch {
        safeLocalStorageRemove("ielts_vocab_words_deepseek");
      }

      // 大词库不适合长期放 localStorage，迁移后清理旧数据，避免 quota 报错。
      safeLocalStorageRemove("ielts_vocab_words_deepseek");
    }

    entryPositionsRef.current = readWordFlashEntryPositions(safeLocalStorageGet);
    pendingSessionRef.current = readWordFlashPendingSession(safeLocalStorageGet);
    if (pendingSessionRef.current?.filter) {
      setFilter(normalizeWordFlashFilter(pendingSessionRef.current.filter));
    }

    async function loadActiveWords() {
      let cachedWords = loadedWords;
      let cachedMeta = null;

      try {
        const stored = await withTimeout(loadWordsFromIndexedDB().catch(() => null), 2500, null);
        if (stored?.words?.length) {
          cachedWords = stored.words;
          cachedMeta = stored.meta || null;

          if (!cancelled) {
            if (cachedMeta) cacheMetaRef.current = cachedMeta;
            hydratedWordsRef.current = stored.words;
            startTransition(() => setWords(stored.words));
            setVocabRuntime({
              status: "loading",
              count: cachedMeta?.count || stored.words.length,
              version: cachedMeta?.version || "",
              lexiconHash: cachedMeta?.lexiconHash || "",
              savedAt: cachedMeta?.savedAt || ""
            });
          }
        }

        const metaResponse = await fetch("/api/vocab-meta", { cache: "no-store" });
        const apiMeta = metaResponse?.ok ? await metaResponse.json().catch(() => null) : null;

        if (cachedWords?.length && apiMeta?.lexiconHash && isWordCacheCurrent(cachedMeta || {}, apiMeta)) {
          if (!cancelled) {
            cacheMetaRef.current = { ...(cachedMeta || {}), ...apiMeta };
            setVocabRuntime({ status: "online", ...apiMeta });
          }
          return;
        }

        const response = await fetch("/api/vocab-data", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (!payload?.words?.length || Number(payload.count) !== payload.words.length) {
          throw new Error("词库响应数量不一致");
        }
        if (!payload.version || !payload.lexiconHash || !payload.savedAt) {
          throw new Error("词库响应缺少版本元数据");
        }

        const mergedMeta = {
          count: payload.count,
          version: payload.version,
          lexiconHash: payload.lexiconHash,
          savedAt: payload.savedAt,
          fileHash: payload.fileHash || "",
          wordsHash: payload.wordsHash || ""
        };
        const onlineWords = mergeWordContentWithUserState(payload.words, cachedWords || []);

        cacheMetaRef.current = mergedMeta;
        if (!cancelled) {
          hydratedWordsRef.current = onlineWords;
          startTransition(() => setWords(onlineWords));
          setVocabRuntime({ status: "online", ...mergedMeta });
        }

        runWhenBrowserIdle(async () => {
          if (cancelled) return;

          const wordsForCache = mergeWordContentWithUserState(payload.words, cachedWords || onlineWords);
          if (!isWordCacheCurrent(cachedMeta || {}, mergedMeta) || !stored?.words?.length) {
            await saveWordsToIndexedDB(wordsForCache, mergedMeta);
          }
        });
      } catch {
        if (cancelled) return;
        const stored = await withTimeout(loadWordsFromIndexedDB().catch(() => null), 2500, null);
        if (stored?.words?.length) {
          cachedWords = stored.words;
          cachedMeta = stored.meta || null;
          if (cachedMeta) cacheMetaRef.current = cachedMeta;
          hydratedWordsRef.current = stored.words;
          startTransition(() => setWords(stored.words));
        }

        if (cachedWords?.length) {
          const offlineMeta = {
            count: cachedMeta?.count || cachedWords.length,
            version: cachedMeta?.version || "未知版本",
            lexiconHash: cachedMeta?.lexiconHash || "",
            savedAt: cachedMeta?.savedAt || ""
          };
          cacheMetaRef.current = offlineMeta;
          setVocabRuntime({ status: "offline", ...offlineMeta });
        } else {
          setVocabRuntime({ status: "error", count: null, version: "", lexiconHash: "" });
        }
      }
    }

    loadActiveWords();

    // 音频状态表可能非常大，不能放 localStorage；旧版本缓存会导致 quota 报错，启动时清掉。
    safeLocalStorageRemove("ielts_vocab_audio_status_v1");

    storageReadyRef.current = true;

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!storageReadyRef.current) return;

    // Loading API/IndexedDB content must not be treated as a user edit or rewrite words.json metadata.
    if (hydratedWordsRef.current === words) {
      hydratedWordsRef.current = null;
      return;
    }

    // Learning actions only update the compact user-state record. Content edits
    // call persistWordsImmediately explicitly.
    if (!isProbablyFullVocab(words)) {
      return;
    }

    saveWordUserStateToIndexedDB(words).catch(() => {});
    cleanupOldLargeLocalStorageKeys();
  }, [words]);

  function resetWordStudySessionState({ resetIndex = true } = {}) {
    entryPositionsRef.current = {};
    pendingSessionRef.current = null;
    clearWordStudySession(safeLocalStorageRemove);
    studySessionRef.current = {
      restored: true,
      userAdjusted: true,
      persistBlocked: false,
      restoreTargetIndex: null,
      settling: false,
      toastShown: true,
      wordsGeneration: studySessionRef.current.wordsGeneration
    };
    if (resetIndex) {
      latestStateRef.current.index = 0;
      setIndex(0);
    }
  }

  function persistWordFlashSessionNow(nextIndex = index, nextFilter = filter, nextWords = words) {
    if (sessionPersistTimerRef.current) {
      clearTimeout(sessionPersistTimerRef.current);
      sessionPersistTimerRef.current = null;
    }
    pendingSessionPersistRef.current = null;

    if (!storageReadyRef.current || !studySessionRef.current.restored) return false;
    if (!Array.isArray(nextWords) || !nextWords.length) return false;

    const studyPool = buildStudyPoolForFilter(nextFilter, nextWords);
    if (isIdictationFlashFilter(nextFilter) && !studyPool?.length) return false;

    const result = persistWordFlashSession({
      words: nextWords,
      index: nextIndex,
      filter: nextFilter,
      entryPositions: entryPositionsRef.current,
      filterKey,
      normalizeWord,
      studyPool,
      storageSet: safeLocalStorageSet
    });

    entryPositionsRef.current = result.entryPositions;

    if (!result.saved) {
      setToast("学习位置保存失败，请检查浏览器存储空间");
    }

    return result.saved;
  }

  function queueWordFlashSessionPersist(nextIndex = index, nextFilter = filter, nextWords = words) {
    pendingSessionPersistRef.current = {
      index: nextIndex,
      filter: nextFilter,
      words: nextWords
    };

    if (sessionPersistTimerRef.current) {
      clearTimeout(sessionPersistTimerRef.current);
    }

    sessionPersistTimerRef.current = window.setTimeout(() => {
      const pending = pendingSessionPersistRef.current;
      if (!pending) return;

      persistWordFlashSessionNow(pending.index, pending.filter, pending.words);
    }, 280);
  }

  function flushQueuedWordFlashSessionPersist() {
    const pending = pendingSessionPersistRef.current;
    if (!pending) return false;

    return persistWordFlashSessionNow(pending.index, pending.filter, pending.words);
  }

  useLayoutEffect(() => {
    if (!storageReadyRef.current || !words.length) return;

    const sessionState = studySessionRef.current;
    sessionState.wordsGeneration += 1;

    if (sessionState.userAdjusted) {
      sessionState.restored = true;
      sessionState.persistBlocked = false;
      return;
    }

    const pending = pendingSessionRef.current || readWordFlashPendingSession(safeLocalStorageGet);

    if (!shouldRunFullStudyRestore(sessionState)) {
      if (!shouldReResolveStudyIndex(sessionState, pending || {})) return;

      const restoreFilter = normalizeWordFlashFilter(pending?.filter || filter);
      const studyPool = buildStudyPoolForFilter(restoreFilter, words);
      const result = resolveWordStudyIndex(words, {
        session: pending,
        entryPositions: entryPositionsRef.current,
        filter: restoreFilter,
        wordMatchesFilter,
        filterKey,
        normalizeWord,
        studyPool
      });

      if (result.index >= 0 && result.index !== index) {
        sessionState.restoreTargetIndex = result.index;
        sessionState.persistBlocked = true;
        sessionState.settling = true;
        latestStateRef.current.index = result.index;
        setIndex(result.index);
      }
      return;
    }

    if (!pending) {
      sessionState.restored = true;
      sessionState.persistBlocked = false;
      sessionState.restoreTargetIndex = null;
      return;
    }

    const restoreFilter = normalizeWordFlashFilter(pending?.filter || filter);
    const studyPool = buildStudyPoolForFilter(restoreFilter, words);

    const result = resolveWordStudyIndex(words, {
      session: pending,
      entryPositions: entryPositionsRef.current,
      filter: restoreFilter,
      wordMatchesFilter,
      filterKey,
      normalizeWord,
      studyPool
    });

    if (result.filter) {
      latestStateRef.current.filter = result.filter;
      setFilter(result.filter);
    }

    sessionState.restored = true;
    sessionState.persistBlocked = true;
    sessionState.settling = result.index >= 0;
    sessionState.restoreTargetIndex = result.index >= 0 ? result.index : null;

    if (result.index >= 0) {
      latestStateRef.current.index = result.index;
      setIndex(result.index);
    } else {
      sessionState.persistBlocked = false;
      sessionState.settling = false;
      sessionState.restoreTargetIndex = null;
    }

    const restoredItem = resolveCurrentStudyItem({
      words,
      index: result.index,
      filter: result.filter || restoreFilter,
      studyPool
    });

    if (!sessionState.toastShown) {
      const message = result.restored
        ? restoreMessageForReason(result.reason, restoredItem?.word || "")
        : restoreMessageForReason("notFound");

      if (message) setToast(message);
      sessionState.toastShown = true;
    }
  }, [words]);

  useEffect(() => {
    if (!storageReadyRef.current || !studySessionRef.current.restored) return;
    if (shouldBlockStudyIndexPersist(studySessionRef.current, index)) return;

    releaseStudyPersistBlock(studySessionRef.current, index);
    queueWordFlashSessionPersist();
  }, [index]);

  useEffect(() => {
    function handlePageHide() {
      const latest = latestStateRef.current;
      if (!storageReadyRef.current || !studySessionRef.current.restored) return;
      if (!Array.isArray(latest.words) || !latest.words.length) return;

      if (flushQueuedWordFlashSessionPersist()) return;

      const studyPool = buildStudyPoolForFilter(latest.filter, latest.words);

      persistWordFlashSession({
        words: latest.words,
        index: latest.index,
        filter: latest.filter,
        entryPositions: entryPositionsRef.current,
        filterKey,
        normalizeWord,
        studyPool,
        storageSet: safeLocalStorageSet
      });
    }

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      if (sessionPersistTimerRef.current) {
        clearTimeout(sessionPersistTimerRef.current);
      }
      flushQueuedWordFlashSessionPersist();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function closeOtherMenus(openMenu) {
      document.querySelectorAll("details.menu").forEach((menu) => {
        if (menu !== openMenu) {
          menu.open = false;
        }
      });
    }

    function handleToggle(event) {
      const target = event.currentTarget;

      if (target?.open) {
        closeOtherMenus(target);
      }
    }

    function handlePointerDown(event) {
      if (!event.target.closest(".top-actions")) {
        document.querySelectorAll("details.menu").forEach((menu) => {
          menu.open = false;
        });
      }
    }

    const menus = Array.from(document.querySelectorAll("details.menu"));

    menus.forEach((menu) => {
      menu.addEventListener("toggle", handleToggle);
    });

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      menus.forEach((menu) => {
        menu.removeEventListener("toggle", handleToggle);
      });

      document.removeEventListener("pointerdown", handlePointerDown);
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
    if (idictationFlashSourceKey) return buildIdictationFlashWords(idictationFlashSourceKey, words, libraryWordMap);
    return words.map((word, originalIndex) => ({ ...word, originalIndex }));
  }, [isWordFlashActive, idictationFlashSourceKey, idictationFlashRevision, words, libraryWordMap]);

  useEffect(() => {
    if (!idictationFlashSourceKey) return;

    let cancelled = false;
    ensureIdictationFrequencyData()
      .then(() => {
        if (!cancelled) setIdictationFlashRevision((value) => value + 1);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [idictationFlashSourceKey]);
  const activeWordByIndex = useMemo(() => {
    if (!isWordFlashActive) return new Map();
    return new Map(activeWordPool.map((word) => [word.originalIndex, word]));
  }, [isWordFlashActive, activeWordPool]);
  const studyWordIndices = useMemo(
    () => (isWordFlashActive
      ? buildStudyWordIndices(activeWordPool, filter, { idictation: Boolean(idictationFlashSourceKey) })
      : []),
    [isWordFlashActive, activeWordPool, filter, idictationFlashSourceKey]
  );
  const studyWords = useMemo(
    () => (isWordFlashActive
      ? studyWordIndices
        .map((poolIndex) => resolveStudyWordEntry(activeWordPool, poolIndex, activeWordByIndex))
        .filter(Boolean)
      : []),
    [isWordFlashActive, studyWordIndices, activeWordPool, activeWordByIndex]
  );

  const effectiveIndex = effectiveStudyIndex(studySessionRef.current, index);
  const currentStudyPosition = useMemo(
    () => studyWordIndices.indexOf(effectiveIndex),
    [studyWordIndices, effectiveIndex]
  );
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

  latestStateRef.current = {
    loading,
    isStudyEmpty,
    index: effectiveIndex,
    words,
    filter,
    studyWords
  };

  flashStudyModeRef.current = flashStudyMode;

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
    if (!studyWords.some((word) => word.originalIndex === targetIndex)) {
      sessionState.settling = false;
      return;
    }

    sessionState.settling = false;
  }, [studyWords, index]);

  useEffect(() => {
    function handleQuickStatus(event) {
      if (flashStudyModeRef.current !== "word") return;

      const target = event.target;
      const tagName = target?.tagName?.toLowerCase();

      if (
        tagName === "input" ||
        tagName === "textarea" ||
        target?.isContentEditable ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.repeat
      ) {
        return;
      }

      const key = event.key || "";
      const code = event.code || "";
      const isDelete = key === "Delete" || code === "Delete" || event.keyCode === 46 || event.which === 46;

      if (isDelete) {
        event.preventDefault();
        event.stopPropagation();

        const latest = latestStateRef.current;

        if (latest.loading || latest.isStudyEmpty || quickStatusLockRef.current) {
          return;
        }

        quickStatusLockRef.current = true;
        deleteCurrentWord();

        window.setTimeout(() => {
          quickStatusLockRef.current = false;
        }, 180);

        return;
      }

      const isZero = key === "0" || code === "Digit0" || code === "Numpad0";
      const isOne = key === "1" || code === "Digit1" || code === "Numpad1";

      if (!isZero && !isOne) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const latest = latestStateRef.current;

      if (latest.loading || latest.isStudyEmpty || quickStatusLockRef.current) {
        return;
      }

      quickStatusLockRef.current = true;
      const quickStatus = isZero ? "熟悉" : "不熟";

      if (typeof markStatusRef.current === "function") {
        markStatusRef.current(quickStatus);
      }

      window.setTimeout(() => {
        quickStatusLockRef.current = false;
      }, 90);
    }

    window.addEventListener("keydown", handleQuickStatus, true);

    return () => {
      window.removeEventListener("keydown", handleQuickStatus, true);
    };
  }, []);

  const isWordLexiconLoading = vocabRuntime.status === "loading";
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
    : resolvedStudyItem || (studySessionRef.current.restored ? emptyItem : studyWords[0] || DEMO_WORDS[0]);
  const isExternalIdictationItem = Boolean(item?.__idictationFlash);
  const studyRangeDetail = isWordLexiconLoading
    ? "正在读取正式词库，请稍候。"
    : isStudyEmpty
      ? "当前范围没有待学内容，可以更改范围或切到全部单词。"
      : !isIndexInsideStudyQueue && resolvedStudyItem?.word
        ? `已恢复到：${resolvedStudyItem.word}（不在当前待学范围，按 ←/→ 可回到队列）`
        : `当前位置：${safeStudyPosition + 1} / ${studyWords.length} · 当前词：${item.word || "—"}`;
  const commonCollocationFallback = isWordLexiconLoading
    ? [{ phrase: "", chinese: "正在读取词库" }]
    : [{ phrase: "等待 AI 生成搭配", chinese: "" }];
  const phraseCollocationFallback = isWordLexiconLoading
    ? [{ phrase: "", chinese: "正在读取词库" }]
    : [{ phrase: "等待 AI 生成短语搭配", chinese: "" }];
  const prevInStudy = studyWords.length ? studyWords[(safeStudyPosition - 1 + studyWords.length) % studyWords.length] : null;
  const prevItem = prevInStudy ? activeWordByIndex.get(prevInStudy.originalIndex) : null;

  const {
    audioRef,
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
  }, [isWordFlashActive, studyWordIndices, effectiveIndex, index, words, resolvedStudyItem?.word]);

  useEffect(() => {
    if (!isWordFlashActive) return;
    setMeaningDetailOpen(false);
  }, [isWordFlashActive, index, item?.id, item?.word]);

  useEffect(() => {
    if (!isWordFlashActive || !item?.word || isStudyEmpty) return;
    const batch = warmTtsBatchRef.current + 1;
    warmTtsBatchRef.current = batch;

    warmTtsTimersRef.current.forEach((timer) => clearTimeout(timer));
    warmTtsTimersRef.current = [];

    // 极速音频：不再自动查 pronunciation。
    // 当前词、例句和下一个词只预热发音音频本地缓存，点击时直接播放。
    const currentText = item.word;
    const nextStudyIndex = studyWordIndices.length
      ? studyWordIndices[(safeStudyPosition + 1) % studyWordIndices.length]
      : null;
    const nextItem = resolveStudyWordEntry(activeWordPool, nextStudyIndex, activeWordByIndex);

    const candidates = [
      { text: currentText, kind: isSimpleDictionaryWord(currentText) ? "word" : "phrase" },
      { text: item.example, kind: "sentence" },
      { text: nextItem?.word, kind: isSimpleDictionaryWord(nextItem?.word) ? "word" : "phrase" },
      { text: nextItem?.example, kind: "sentence" }
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
  }, [isWordFlashActive, item?.word, item?.example, index, currentStudyPosition, studyWordIndices.length, isStudyEmpty, activeWordPool, activeWordByIndex]);

  speakWordRef.current = speakWord;
  speakExampleRef.current = speakExample;

  useEffect(() => {
    function isTypingTarget(target) {
      const tag = target?.tagName?.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
    }

    function handleKeyDown(event) {
      if (flashStudyMode !== "word") return;
      if (isTypingTarget(event.target)) return;

      if (event.key === "Tab") {
        if (event.repeat) return;
        event.preventDefault();
        speakWordRef.current(true);
      }

      if (event.key === " " || event.code === "Space" || event.key === "Spacebar") {
        if (event.repeat) return;
        event.preventDefault();
        speakExampleRef.current();
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        nextWordRef.current();
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        prevWordRef.current();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [flashStudyMode]);

  const commonCollocations = normalizePhraseItems(item.collocations);
  const phraseCollocations = normalizePhraseItems(item.phraseCollocations);
  const audioInfo = audioMap[normalizeWord(item.word)] || {};
  const displayForms = getDisplayForms(item);
  const displayFamily = enrichDisplayFamily(item.wordFamily, libraryWordMap, item.word);

  const filteredWordIndices = useMemo(
    () => (isWordFlashActive
      ? buildFilteredWordIndices(activeWordPool, filter, search, { idictation: Boolean(idictationFlashSourceKey) })
      : []),
    [isWordFlashActive, activeWordPool, filter, search, idictationFlashSourceKey]
  );

  const wordLibraryStats = useMemo(() => {
    if (!isWordFlashActive) {
      return { pending: 0, unfamiliar: 0, familiar: 0, missing: 0, classifyMissing: 0 };
    }

    let pending = 0;
    let unfamiliar = 0;
    let familiar = 0;
    let missing = 0;
    let classifyMissing = 0;

    for (const word of words) {
      if (word.status !== "熟悉") pending += 1;
      if (word.status === "不熟") unfamiliar += 1;
      if (word.status === "熟悉") familiar += 1;
      if (isMissingAiFields(word)) missing += 1;
      if (isMissingClassification(word)) classifyMissing += 1;
    }

    return { pending, unfamiliar, familiar, missing, classifyMissing };
  }, [isWordFlashActive, words, idictationFlashRevision]);

  const familiarCount = wordLibraryStats.familiar;
  const missingCount = wordLibraryStats.missing;
  const classifyMissingCount = wordLibraryStats.classifyMissing;

  const audioStats = useMemo(() => {
    if (!isWordFlashActive) {
      return { total: 0, has: 0, missing: 0, unchecked: 0 };
    }

    let has = 0;
    let missing = 0;
    let unchecked = 0;

    words.forEach((word) => {
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
      total: has + missing + unchecked,
      has,
      missing,
      unchecked
    };
  }, [isWordFlashActive, words, audioMap, audioStatsRevision]);

  const progressPercent = studyWords.length ? Math.max(1, ((safeStudyPosition + 1) / studyWords.length) * 100) : 0;

  function updateCurrent(patch) {
    if (isExternalIdictationItem) {
      setToast("爱听写独立入口不写入总词库，请到总词库里编辑已有词。");
      return;
    }

    setWords((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function markStatus(status) {
    if (isExternalIdictationItem) {
      nextWord();
      setToast("爱听写独立入口按表格练习，不改变总词库状态。");
      return;
    }

    const latest = latestStateRef.current;
    const currentOriginalIndex = latest.index;
    const currentWord = latest.words[currentOriginalIndex];
    if (!currentWord) return;

    const currentStatus = currentWord.status || "";
    const nextStatus = status === "不熟" && currentStatus === "不熟" ? "" : status;

    const oldStudyWords = latest.studyWords?.length ? latest.studyWords : studyWords;
    const oldPosition = Math.max(
      0,
      oldStudyWords.findIndex((word) => word.originalIndex === currentOriginalIndex)
    );

    const simulatedStudyWords = oldStudyWords
      .map((word) => (word.originalIndex === currentOriginalIndex ? { ...word, status: nextStatus } : word))
      .filter((word) => wordMatchesFilter(word, filter));
    const stillVisiblePosition = simulatedStudyWords.findIndex(
      (word) => word.originalIndex === currentOriginalIndex
    );
    const candidateStudyWords = nextStatus === "熟悉"
      ? simulatedStudyWords.filter((word) => word.originalIndex !== currentOriginalIndex)
      : simulatedStudyWords;

    let targetIndex = currentOriginalIndex;
    if (candidateStudyWords.length) {
      let targetPosition;
      if (nextStatus === "熟悉" || stillVisiblePosition < 0) {
        targetPosition = Math.min(oldPosition, candidateStudyWords.length - 1);
      } else {
        targetPosition = (stillVisiblePosition + 1) % candidateStudyWords.length;
      }
      targetIndex = candidateStudyWords[targetPosition].originalIndex;
    }

    studySessionRef.current.userAdjusted = true;
    studySessionRef.current.restoreTargetIndex = null;
    studySessionRef.current.persistBlocked = false;

    startTransition(() => {
      setWords((prev) => {
        const word = prev[currentOriginalIndex];
        if (!word) return prev;
        if (word.status === nextStatus) return prev;
        return prev.toSpliced(currentOriginalIndex, 1, { ...word, status: nextStatus });
      });

      if (targetIndex !== currentOriginalIndex) {
        latestStateRef.current.index = targetIndex;
        setIndex(targetIndex);
      }
    });

    if (status === "熟悉") {
      setToast("已标记熟悉，并从所有学习词库隐藏");
    } else if (status === "不熟" && currentStatus === "不熟") {
      setToast("已取消不熟状态");
    } else if (status === "不熟") {
      setToast("已加入不熟词库");
    } else {
      setToast(`已标记：${status}`);
    }
  }

  markStatusRef.current = markStatus;

  function toggleFavorite() {
    if (isExternalIdictationItem) {
      setToast("爱听写独立入口不写入总词库收藏。");
      return;
    }

    updateCurrent({ favorite: !item.favorite });
    setToast(item.favorite ? "已取消收藏" : "已收藏");
  }

  function nextWord() {
    studySessionRef.current.userAdjusted = true;
    studySessionRef.current.restoreTargetIndex = null;
    studySessionRef.current.persistBlocked = false;
    const latest = latestStateRef.current;
    if (!latest.studyWords?.length) return;

    let position = latest.studyWords.findIndex((word) => word.originalIndex === latest.index);
    if (position < 0) position = 0;
    const next = latest.studyWords[(position + 1) % latest.studyWords.length];
    const nextIndex = next.originalIndex;

    latest.index = nextIndex;
    startTransition(() => setIndex(nextIndex));
  }

  function prevWord() {
    studySessionRef.current.userAdjusted = true;
    studySessionRef.current.restoreTargetIndex = null;
    studySessionRef.current.persistBlocked = false;
    const latest = latestStateRef.current;
    if (!latest.studyWords?.length) return;

    let position = latest.studyWords.findIndex((word) => word.originalIndex === latest.index);
    if (position < 0) position = 0;
    const prev = latest.studyWords[(position - 1 + latest.studyWords.length) % latest.studyWords.length];
    const prevIndex = prev.originalIndex;

    latest.index = prevIndex;
    startTransition(() => setIndex(prevIndex));
  }

  nextWordRef.current = nextWord;
  prevWordRef.current = prevWord;


  function shuffleStudyWords() {
    studySessionRef.current.userAdjusted = true;
    studySessionRef.current.restoreTargetIndex = null;
    studySessionRef.current.persistBlocked = false;

    if (idictationFlashSourceKey) {
      if (studyWords.length < 2) {
        setToast("当前范围单词太少，无法随机");
        return;
      }

      const random = studyWords[Math.floor(Math.random() * studyWords.length)];
      latestStateRef.current.index = random.originalIndex;
      setIndex(random.originalIndex);
      persistWordFlashSessionNow(random.originalIndex);
      setToast(`${getFilterName(filter)} 已随机跳转；表格顺序保持不变`);
      return;
    }

    const currentMatches = words
      .map((word, originalIndex) => ({ word, originalIndex }))
      .filter(({ word }) => wordMatchesFilter(word, filter));

    if (currentMatches.length < 2) {
      setToast("当前范围单词太少，无法随机");
      return;
    }

    const targetIndices = currentMatches.map((item) => item.originalIndex);
    const shuffledWords = currentMatches.map((item) => item.word);

    for (let i = shuffledWords.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledWords[i], shuffledWords[j]] = [shuffledWords[j], shuffledWords[i]];
    }

    setWords((prev) => {
      const next = [...prev];

      targetIndices.forEach((targetIndex, orderIndex) => {
        next[targetIndex] = shuffledWords[orderIndex];
      });

      return next;
    });

    const randomIndex = targetIndices[0];
    latestStateRef.current.index = randomIndex;
    setIndex(randomIndex);
    persistWordFlashSessionNow(randomIndex);
    setToast(`${getFilterName(filter)} 已随机打乱`);
  }

  const {
    importWords,
    importFromText,
    handleFile,
    recordLocalChange,
    undoLastLocalChange,
    clearLastLocalChangeLog,
    undoOneLocalChangeItem,
    localCleanWordList,
    localDedupeWords,
    localMergeWordForms,
    localOptimizeWordList,
    cleanWordList,
    confirmAiCost,
    generateCurrent,
    aiRepairCurrentWordSymbol,
    generateMissingBatch,
    aiCompletePendingAndUnclassifiedOneByOne,
    aiSlowCompleteMissing10x1,
    aiStableRepairWrongWords10x2,
    generateHundredByFiveBatch,
    completeMeaningAndAudio,
    categorizeWords,
    aiDedupe,
    clearAll,
    exportStaticSite,
    openEditCurrentWord,
    updateEditDraft,
    saveEditCurrentWord,
    recoverWordsFromLocalFiles,
    recoverWordsFromTencentCloud,
    cleanBrowserStorageNow,
    localCleanCurrentTtsSymbols,
    localScanTtsSymbols,
    localCleanTtsSymbols,
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
    setDuplicateInfo,
    setEditOpen,
    setEditDraft,
    editDraft,
    item,
    isExternalIdictationItem,
    pasteText,
    setPasteText,
    persistWordsImmediately,
    resetWordStudySessionState,
    cacheMetaRef,
    latestStateRef,
    entryPositionsRef,
    persistWordFlashSessionNow,
    compactBrowserStorageForCurrentWords
  });


  const learningEntryCounts = useMemo(() => {
    if (!isWordFlashActive) return new Map();

    return buildLearningEntryCounts(words, LEARNING_ENTRIES, {
      filterKey,
      isIdictationFlashFilter,
      getIdictationSource
    });
  }, [isWordFlashActive, words]);

  const learningEntryGroups = useMemo(() => {
    if (!isWordFlashActive) return [];

    const activeCurrentWord = words[index]?.word || "";

    return LEARNING_ENTRIES.map((group) => ({
      ...group,
      items: group.items.map((entry) => {
        const entryFilterKey = filterKey(entry.filter);
        const count = learningEntryCounts.get(entryFilterKey) ?? 0;
        let currentWordLabel = "";

        if (isSameFilter(filter, entry.filter)) {
          currentWordLabel = activeCurrentWord;
        } else {
          const currentKey = entryPositionsRef.current[entryFilterKey] || "";

          if (currentKey) {
            if (isIdictationFlashFilter(entry.filter)) {
              const source = getIdictationSource(entry.filter.value);
              currentWordLabel = source?.entries?.find((word) => normalizeWord(word.word) === currentKey)?.word || "";
            } else {
              currentWordLabel = libraryWordMap.get(currentKey)?.word || "";
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
  }, [isWordFlashActive, words, filter, index, learningEntryCounts, libraryWordMap, idictationFlashRevision]);

  function setLibraryFilter(type, value) {
    studySessionRef.current.userAdjusted = true;
    studySessionRef.current.restoreTargetIndex = null;
    studySessionRef.current.persistBlocked = false;
    persistWordFlashSessionNow();

    const nextFilter = { type, value };
    const studyPool = buildStudyPoolForFilter(nextFilter, words);
    const targetPool = isIdictationFlashFilter(nextFilter)
      ? buildIdictationFlashWords(nextFilter.value, words, libraryWordMap)
      : words.map((word, originalIndex) => ({ ...word, originalIndex }));

    const result = resolveFilterSwitchIndex(resolveWordStudyIndex, {
      words,
      entryPositions: entryPositionsRef.current,
      filter: nextFilter,
      filterKey,
      wordMatchesFilter,
      normalizeWord,
      studyPool,
      findFirstInFilter: () => {
        const first = targetPool.find((word) => wordMatchesFilter(word, nextFilter));
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

  return (
    <main className={`page${flashStudyMode === "phrase" || flashStudyMode === "paraphrase" ? " page--flash-training" : " page--word-flash"}`}>
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
            {formatVocabCountLabel(vocabRuntime.status, vocabRuntime.count)}
            <span className="flash-mode-sub">主词库</span>
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
            {phraseRuntimeCount == null ? "加载中" : `${phraseRuntimeCount.toLocaleString()} 词组`}
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
            {lrSynonymCount == null ? "加载中" : `${lrSynonymCount.toLocaleString()} 组`}
            <span className="flash-mode-sub">同义组·非词条</span>
          </span>
        </button>
      </div>
      <p className="product-scope-note" style={{ margin: "8px 12px 0", fontSize: 12, opacity: 0.75, lineHeight: 1.45 }}>
        各模式独立计数，勿相加。主词库 / 短语层 / 同义组 / 训练子集口径见项目根目录 <code>PRODUCT.md</code>。
        拼写正式入口：<a href="/spelling-words">/spelling-words</a> · <a href="/spelling-phrases">/spelling-phrases</a>
        （<code>spelling.html</code> 为遗留静态页）。
      </p>

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
            meaningDetailOpen,
            setMeaningDetailOpen,
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
          }}
          speech={{
            speakWord,
            speakExample,
            speakSmallText
          }}
          admin={{
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
            adminActions: {
              importFromText, handleFile, openEditCurrentWord, deleteCurrentWord,
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
              aiSlowCompleteMissing10x1, aiCompletePendingAndUnclassifiedOneByOne,
              aiStableRepairWrongWords10x2, categorizeWords
            }
          }}
          chrome={{
            TOPIC_OPTIONS,
            DIFFICULTY_OPTIONS,
            IELTS_USE_OPTIONS,
            IDICTATION_FLASH_FILTERS,
            shuffleStudyWords,
            toggleFavorite,
            markStatus
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

