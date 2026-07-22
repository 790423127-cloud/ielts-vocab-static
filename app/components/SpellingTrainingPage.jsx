"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SpellingAiToolsPanel from "./SpellingAiToolsPanel.jsx";
import { AUTO_SUBMIT_DEBOUNCE_MS, useSpellingEngine } from "../hooks/useSpellingEngine.js";
import { useSpellingErrorBank } from "../hooks/useSpellingErrorBank.js";
import { useSpellingSrsReview } from "../hooks/useSpellingSrsReview.js";
import { useSpellingTrainingControls } from "../hooks/useSpellingTrainingControls.js";
import { useSpellingTrainingPreferences } from "../hooks/useSpellingTrainingPreferences.js";
import {
  isSpellingWordNavigationBlocked as isWordNavBlocked,
  resolveSpellingWordKey,
  useSpellingTrainingSessionNavigation
} from "../hooks/useSpellingTrainingSessionNavigation.js";
import { useVocabSpeech } from "../hooks/useVocabSpeech.js";
import {
  preloadSpellingSpeechTexts,
  resolveSpellingSpeechText
} from "../lib/vocab-speech.mjs";
import {
  computeSpellingSessionMetrics,
  createSpellingSessionStats,
  markFamiliar,
  recordAttempt
} from "../lib/spelling/spelling-session-stats.mjs";
import {
  createSpellingDailyStats,
  createLearningActivity,
  finishLearningActivity,
  formatActiveLearningTime,
  normalizeSpellingDailyStats,
  recordSpellingDailyActiveTime,
  recordSpellingDailyAttempt,
  recordLearningActivity
} from "../lib/spelling/spelling-daily-stats.mjs";

import {
  errorBankEntriesToSpellingCandidates,
  shouldExcludeFamiliarSpellingEntries
} from "../lib/spelling/error-bank.mjs";
import {
  PERSONAL_WRONG_BOOK_BASE_REPS,
  PERSONAL_WRONG_BOOK_BATCH_SIZE,
  PERSONAL_WRONG_BOOK_PLURAL_REPS,
  PERSONAL_WRONG_BOOK_REPETITIONS,
  buildPersonalWrongBookCandidates,
  clampPersonalWrongBatchIndex,
  findPersonalWrongBatchIndexForRecordIds,
  formatPersonalWrongUnitLabel,
  getPersonalWrongBookRecordDedupeKey,
  listPersonalWrongBookBatchOptions,
  mergePersonalWrongBookRecords,
  normalizePersonalWrongBookRecords,
  parsePersonalWrongBookInput,
  resolvePersonalWrongBatchIndexAfterAdd,
  selectPersonalWrongBookBatch,
  summarizePersonalWrongBook
} from "../lib/spelling/personal-wrong-book.mjs";
import { loadSpellingLexicon } from "../lib/spelling/load-spelling-lexicon.mjs";
import {
  IDICTATION_PRACTICE_SOURCES,
  ensureIdictationFrequencyData,
  getIdictationSource,
  idictationSourceKeyFromPracticeSource,
  isIdictationPracticeSource,
  listIdictationBatchOptions,
  listIdictationGroupOptions,
  selectIdictationBatch
} from "../lib/spelling/idictation-frequency.mjs";
import { syncPersonalWrongRecordsToLocalLexicon } from "../lib/spelling/personal-wrong-lexicon-sync.mjs";
import { srsReviewEntriesToSpellingCandidates } from "../lib/spelling/srs-review.mjs";
import {
  SPELLING_CATEGORY_TYPES,
  SPELLING_DIFFICULTY_OPTIONS,
  SPELLING_PHRASE_CATEGORY_TYPES,
  SPELLING_PRACTICE_SOURCES,
  SPELLING_SRS_INTERVALS_DAYS,
  countEntriesBySpellingCategories,
  filterBySpellingCategory,
  listSpellingBatchOptions,
  selectSpellingBatch,
  spellingCategoryLabel
} from "../lib/spelling/spelling-categories.mjs";
import { formatSessionTrainingLine } from "../lib/spelling/candidate-breakdown.mjs";
import {
  resolveSpellingProgressBarPercent,
  resolveSpellingStudyPosition
} from "../lib/spelling/batch-progress.mjs";
import {
  buildSpellingDebugDetails,
  formatExampleForPrompt,
  getSpellingPromptView,
  isSpellingDebugMode
} from "../lib/spelling/spelling-display.mjs";
import {
  buildCombinedExportFilename,
  buildCombinedLexiconExportPayload,
  buildCurrentBatchExportFilename,
  buildCurrentBatchExportPayload,
  buildCurrentCategoryExportFilename,
  buildCurrentCategoryExportPayload,
  buildEnglishTxtLines,
  buildScopeLexiconExportFilename,
  buildScopeLexiconExportPayload,
  triggerSpellingExportDownload
} from "../lib/spelling/spelling-export.mjs";
import { isSpellingAnswerCorrect } from "../lib/spelling/state-machine.mjs";
import {
  SPELLING_SCOPE_ROUTES,
  resolveSpellingScope
} from "../lib/spelling/spelling-scope.mjs";
import SpellingPersonalWrongDock from "./SpellingPersonalWrongDock.jsx";
import SpellingFocusCard from "./SpellingFocusCard.jsx";
import SpellingStatsSidebar from "./SpellingStatsSidebar.jsx";
import {
  readDailyStats,
  readPersonalWrongBookRecords,
  readSpellingPosition,
  resolvePersonalWrongNavigationWordId,
  writeDailyStats,
  writePersonalWrongBookRecords,
  writeSpellingPosition
} from "../lib/spelling/spelling-training-page-helpers.mjs";

const EMPTY_COUNT_MAP = new Map();

export default function SpellingTrainingPage({ scope: scopeProp = "word" }) {
  const scopeConfig = useMemo(() => resolveSpellingScope(scopeProp), [scopeProp]);
  const scope = scopeConfig.scope;
  const isPhrase = scope === "phrase";
  const unit = isPhrase ? "条" : "词";
  const otherRoute = isPhrase ? SPELLING_SCOPE_ROUTES.word : SPELLING_SCOPE_ROUTES.phrase;
  const otherLabel = isPhrase ? "单词拼写训练" : "词组拼写训练";
  const categoryTypes = isPhrase ? SPELLING_PHRASE_CATEGORY_TYPES : SPELLING_CATEGORY_TYPES;

  const [lexicon, setLexicon] = useState(null);
  const [includeFamiliar, setIncludeFamiliar] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [personalWrongPanelOpen, setPersonalWrongPanelOpen] = useState(false);
  const [aiToolsPanelOpen, setAiToolsPanelOpen] = useState(false);

  // Sidebar global "AI 工具" opens spelling AI dock without leaving this page.
  useEffect(() => {
    function onOpenAiTools(event) {
      if (event?.detail?.page && event.detail.page !== "spelling") return;
      setAiToolsPanelOpen(true);
      window.setTimeout(() => {
        document.querySelector(".spelling-ai-tools-dock")?.scrollIntoView({
          block: "nearest",
          behavior: "smooth"
        });
      }, 50);
    }

    // Support deep link: /spelling-words?openAiTools=1
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search);
      if (q.get("openAiTools") === "1") {
        setAiToolsPanelOpen(true);
      }
    }

    window.addEventListener("ielts:open-ai-tools", onOpenAiTools);
    return () => window.removeEventListener("ielts:open-ai-tools", onOpenAiTools);
  }, []);
  const [sessionStats, setSessionStats] = useState(() => createSpellingSessionStats());
  const [dailyStats, setDailyStats] = useState(() => createSpellingDailyStats({ date: "" }));
  const [dailyStatsHydrated, setDailyStatsHydrated] = useState(false);
  const [errorAnalysisVisible, setErrorAnalysisVisible] = useState(false);
  const {
    rangeSettingsExpanded,
    setRangeSettingsExpanded,
    turboMode,
    setTurboMode,
    autoNextOnCorrect,
    setAutoNextOnCorrect,
    listenOnlyMode,
    setListenOnlyMode,
    showMeaning,
    setShowMeaning,
    showExample,
    setShowExample,
    statsSidebarOpen,
    setStatsSidebarOpen,
    soundEffectsEnabled,
    setSoundEffectsEnabled,
    storedPrefs,
    patchStoredPrefs,
    patchCategoryPrefs,
    patchIdictationPrefs
  } = useSpellingTrainingPreferences(scope);
  const [actionNotice, setActionNotice] = useState("");
  const [personalWrongInput, setPersonalWrongInput] = useState("");
  const [personalWrongRecords, setPersonalWrongRecords] = useState(() => readPersonalWrongBookRecords());
  const [personalWrongHydrated, setPersonalWrongHydrated] = useState(false);
  const [idictationDataReady, setIdictationDataReady] = useState(false);
  const learningActivityRef = useRef(createLearningActivity());
  const sessionStatsRef = useRef(sessionStats);
  const spellingUndoStackRef = useRef([]);
  const personalWrongLexiconReconciledRef = useRef(false);

  const commitLearningActivity = useCallback(() => {
    const result = finishLearningActivity(learningActivityRef.current);
    learningActivityRef.current = result.next;
    if (result.activeMs > 0) {
      setDailyStats((stats) => recordSpellingDailyActiveTime(stats, result.activeMs));
    }
    return result;
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        commitLearningActivity();
        return;
      }
      learningActivityRef.current = createLearningActivity();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [commitLearningActivity]);

  useEffect(() => {
    sessionStatsRef.current = sessionStats;
  }, [sessionStats]);

  useEffect(() => {
    if (!actionNotice) return undefined;
    const timer = window.setTimeout(() => setActionNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [actionNotice]);

  function pushSpellingUndo(entry) {
    spellingUndoStackRef.current.push(entry);
    if (spellingUndoStackRef.current.length > 25) {
      spellingUndoStackRef.current.shift();
    }
  }

  function showActionNotice(message) {
    setActionNotice(message);
  }

  useEffect(() => {
    setDailyStatsHydrated(false);
    setDailyStats(normalizeSpellingDailyStats(readDailyStats(scope)));
    setDailyStatsHydrated(true);
  }, [scope]);

  useEffect(() => {
    setPersonalWrongRecords(readPersonalWrongBookRecords());
    setPersonalWrongHydrated(true);
  }, []);

  useEffect(() => {
    if (!dailyStatsHydrated) return;
    writeDailyStats(scope, dailyStats);
  }, [scope, dailyStats, dailyStatsHydrated]);

  useEffect(() => {
    if (!personalWrongHydrated) return;
    writePersonalWrongBookRecords(personalWrongRecords);
  }, [personalWrongRecords, personalWrongHydrated]);

  useEffect(() => {
    if (!personalWrongHydrated || personalWrongLexiconReconciledRef.current) return;
    personalWrongLexiconReconciledRef.current = true;

    const hasScopedPersonalWrongRecords = normalizePersonalWrongBookRecords(personalWrongRecords)
      .some((record) => record.active !== false && record.scope === scope);
    if (!hasScopedPersonalWrongRecords) return;

    syncPersonalWrongRecordsToLocalLexicon(personalWrongRecords, { scope })
      .then(async (syncResult) => {
        if (Number(syncResult?.removed || 0) <= 0 && Number(syncResult?.added || 0) <= 0) return;
        const refreshed = await loadSpellingLexicon({ force: true, scope });
        setLexicon(refreshed);
      })
      .catch((error) => {
        console.warn("[personal-wrong-lexicon-sync]", error);
      });
  }, [personalWrongHydrated, personalWrongRecords, scope]);

  useEffect(() => {
    let cancelled = false;

    loadSpellingLexicon({ scope })
      .then((payload) => {
        if (cancelled) return;
        setLexicon(payload);
        const count = isPhrase ? payload.counts.phrases : payload.counts.headwords;
        if (!count) {
          setLoadError(isPhrase
            ? "没有读到词组库。请检查 public/data/phrases.json。"
            : "没有读到单词库。请检查 .static-export-cache/words.json 与 public/data/words.json。");
        }
      })
      .catch((error) => {
        if (!cancelled) setLoadError(`读取词库失败：${error?.message || error}`);
      });

    return () => {
      cancelled = true;
    };
  }, [isPhrase, scope]);

  const lexiconEntries = useMemo(
    () => (isPhrase ? lexicon?.phrases : lexicon?.headwords) || [],
    [lexicon, isPhrase]
  );

  const availablePracticeSources = useMemo(
    () => isPhrase ? SPELLING_PRACTICE_SOURCES : [...SPELLING_PRACTICE_SOURCES, ...IDICTATION_PRACTICE_SOURCES],
    [isPhrase]
  );
  const { practiceSource, category: categoryPrefs, personalWrongBatchIndex, errorBankBatchIndex, srsBatchIndex, idictation } = storedPrefs;
  const idictationSourceKey = idictationSourceKeyFromPracticeSource(practiceSource);
  const idictationSource = idictationSourceKey ? getIdictationSource(idictationSourceKey) : null;
  const idictationPrefs = idictationSourceKey ? idictation?.[idictationSourceKey] : null;

  useEffect(() => {
    if (!idictationSourceKey) return;

    let cancelled = false;
    ensureIdictationFrequencyData()
      .then(() => {
        if (!cancelled) setIdictationDataReady(true);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [idictationSourceKey]);
  const errorBank = useSpellingErrorBank(lexiconEntries, { scope });
  const srsReview = useSpellingSrsReview(lexiconEntries, { scope, refreshKey: practiceSource });
  const refreshErrorBank = errorBank.refresh;
  const refreshSrsReview = srsReview.refresh;

  const batchPrefs = useMemo(
    () => ({ ...categoryPrefs, scopeKind: scope }),
    [categoryPrefs, scope]
  );

  const batchSelection = useMemo(
    () => ({
      ...selectSpellingBatch(lexiconEntries, batchPrefs),
      label: spellingCategoryLabel(categoryPrefs.categoryType, categoryPrefs.categoryValue, {
        scopeKind: isPhrase ? "phrase" : ""
      })
    }),
    [lexiconEntries, batchPrefs, categoryPrefs.categoryType, categoryPrefs.categoryValue, isPhrase]
  );

  const currentCategoryEntries = useMemo(
    () => filterBySpellingCategory(
      lexiconEntries,
      categoryPrefs.categoryType,
      categoryPrefs.categoryValue,
      scope
    ),
    [lexiconEntries, categoryPrefs.categoryType, categoryPrefs.categoryValue, scope]
  );

  const errorBankSourceEntries = useMemo(
    () => errorBankEntriesToSpellingCandidates(errorBank.items),
    [errorBank.items]
  );

  const errorBankBatchSelection = useMemo(
    () => ({
      ...selectSpellingBatch(errorBankSourceEntries, {
        categoryType: "all",
        categoryValue: "",
        batchIndex: errorBankBatchIndex,
        scopeKind: scope,
        preserveSourceOrder: true
      }),
      label: "错词本"
    }),
    [errorBankSourceEntries, errorBankBatchIndex, scope]
  );

  const personalWrongScopedRecords = useMemo(
    () => normalizePersonalWrongBookRecords(personalWrongRecords)
      .filter((record) => record.active !== false && record.scope === scope),
    [personalWrongRecords, scope]
  );

  const personalWrongSourceEntries = useMemo(
    () => lexicon ? buildPersonalWrongBookCandidates(personalWrongScopedRecords, lexiconEntries, { scope }) : [],
    [lexicon, personalWrongScopedRecords, lexiconEntries, scope]
  );

  const personalWrongSummary = useMemo(
    () => summarizePersonalWrongBook(personalWrongRecords),
    [personalWrongRecords]
  );

  const personalWrongBatchSelection = useMemo(
    () => ({
      ...selectPersonalWrongBookBatch(personalWrongRecords, lexiconEntries, {
        scope,
        batchIndex: personalWrongBatchIndex
      }),
      label: "做题错词"
    }),
    [personalWrongRecords, lexiconEntries, personalWrongBatchIndex, scope]
  );
  const personalWrongCurrentBatchRecords = personalWrongBatchSelection.records || [];
  const personalWrongScopedCount = Number(personalWrongBatchSelection.totalInCategory ?? personalWrongScopedRecords.length) || 0;
  const personalWrongCurrentBatchWriteCount = Number(personalWrongBatchSelection.writeCount ?? personalWrongBatchSelection.entries?.length ?? 0) || 0;
  const personalWrongTotalWriteCount = personalWrongSourceEntries.length;
  const personalWrongCurrentBatchLabel = personalWrongBatchSelection.batchCount > 1
    ? `第${personalWrongBatchSelection.batchIndex + 1}/${personalWrongBatchSelection.batchCount}组`
    : `第${personalWrongBatchSelection.batchIndex + 1}组`;

  const srsSourceEntries = useMemo(
    () => srsReviewEntriesToSpellingCandidates(srsReview.items),
    [srsReview.items]
  );

  const srsBatchSelection = useMemo(
    () => ({
      ...selectSpellingBatch(srsSourceEntries, {
        categoryType: "all",
        categoryValue: "",
        batchIndex: srsBatchIndex,
        scopeKind: scope,
        preserveSourceOrder: true
      }),
      label: "SRS 复习"
    }),
    [srsSourceEntries, srsBatchIndex, scope]
  );

  const idictationGroupOptions = useMemo(
    () => idictationDataReady && idictationSourceKey ? listIdictationGroupOptions(idictationSourceKey) : [],
    [idictationDataReady, idictationSourceKey]
  );

  const idictationBatchSelection = useMemo(
    () => idictationDataReady && idictationSourceKey
      ? selectIdictationBatch(idictationSourceKey, idictationPrefs)
      : { entries: [], batchIndex: 0, batchCount: 1, batchEntryCount: 0, totalInCategory: 0 },
    [idictationDataReady, idictationSourceKey, idictationPrefs]
  );

  const idictationBatchOptions = useMemo(
    () => idictationDataReady && idictationSourceKey
      ? listIdictationBatchOptions(idictationSourceKey, idictationBatchSelection.groupKey)
      : [],
    [idictationDataReady, idictationSourceKey, idictationBatchSelection.groupKey]
  );

  const activeBatchSelection = practiceSource === "personal_wrong_book"
    ? personalWrongBatchSelection
    : practiceSource === "error_bank"
      ? errorBankBatchSelection
      : practiceSource === "srs_review"
        ? srsBatchSelection
        : isIdictationPracticeSource(practiceSource)
          ? idictationBatchSelection
          : batchSelection;

  const spellingEntries = useMemo(() => {
    if (!lexicon) return [];
    return practiceSource === "personal_wrong_book"
      ? personalWrongBatchSelection.entries
      : practiceSource === "error_bank"
        ? errorBankBatchSelection.entries
        : practiceSource === "srs_review"
          ? srsBatchSelection.entries
          : isIdictationPracticeSource(practiceSource)
            ? idictationBatchSelection.entries
            : batchSelection.entries;
  }, [lexicon, practiceSource, personalWrongBatchSelection.entries, errorBankBatchSelection.entries, srsBatchSelection.entries, idictationBatchSelection.entries, batchSelection.entries]);

  const batchOptions = useMemo(
    () => listSpellingBatchOptions(lexiconEntries, batchPrefs),
    [lexiconEntries, batchPrefs]
  );

  const errorBankBatchOptions = useMemo(
    () => listSpellingBatchOptions(errorBankSourceEntries, {
      categoryType: "all",
      scopeKind: scope,
      preserveSourceOrder: true
    }),
    [errorBankSourceEntries, scope]
  );

  const personalWrongBatchOptions = useMemo(
    () => listPersonalWrongBookBatchOptions(personalWrongRecords, { scope }),
    [personalWrongRecords, scope]
  );

  const srsBatchOptions = useMemo(
    () => listSpellingBatchOptions(srsSourceEntries, {
      categoryType: "all",
      scopeKind: scope,
      preserveSourceOrder: true
    }),
    [srsSourceEntries, scope]
  );

  const categoryCounts = useMemo(
    () => countEntriesBySpellingCategories(
      lexiconEntries,
      isPhrase
        ? ["difficulty", "topic", "ielts_use", "lr_high_frequency"]
        : ["difficulty", "topic", "lr_high_frequency"],
      scope
    ),
    [lexiconEntries, isPhrase, scope]
  );

  const difficultyCounts = categoryCounts.difficulty || EMPTY_COUNT_MAP;
  const topicCounts = categoryCounts.topic || EMPTY_COUNT_MAP;
  const ieltsUseCounts = categoryCounts.ielts_use || EMPTY_COUNT_MAP;
  const listeningReadingCounts = categoryCounts.lr_high_frequency || EMPTY_COUNT_MAP;

  const activeBatchId = useMemo(() => {
    if (practiceSource === "personal_wrong_book") {
      return `${scope}:personal-wrong:batch:${personalWrongBatchSelection.batchIndex}`;
    }
    if (practiceSource === "error_bank") {
      return `${scope}:error-bank:${errorBankBatchSelection.batchIndex}`;
    }
    if (practiceSource === "srs_review") {
      return `${scope}:srs-review:${srsBatchSelection.batchIndex}`;
    }
    if (isIdictationPracticeSource(practiceSource)) {
      return `${scope}:${practiceSource}:${idictationBatchSelection.groupKey}:batch:${idictationBatchSelection.batchIndex}`;
    }
    return `${scope}:${categoryPrefs.categoryType}:${categoryPrefs.categoryValue}:${batchSelection.batchIndex}`;
  }, [practiceSource, scope, categoryPrefs, batchSelection.batchIndex, personalWrongBatchSelection.batchIndex, errorBankBatchSelection.batchIndex, srsBatchSelection.batchIndex, idictationBatchSelection.groupKey, idictationBatchSelection.batchIndex]);

  const activeRangeLine = useMemo(() => {
    if (practiceSource === "personal_wrong_book") {
      return `做题错词 · 总计${personalWrongScopedCount}${unit} · ${personalWrongBatchSelection.batchCount}组（每组最多${PERSONAL_WRONG_BOOK_BATCH_SIZE}${unit}） · ${personalWrongCurrentBatchLabel}${personalWrongBatchSelection.batchEntryCount}${unit} · 本组练习${personalWrongCurrentBatchWriteCount}遍 · 全部练习${personalWrongTotalWriteCount}遍`;
    }
    if (practiceSource === "error_bank") {
      const batchPart = errorBankBatchSelection.batchCount > 1
        ? `第${errorBankBatchSelection.batchIndex + 1}/${errorBankBatchSelection.batchCount}批`
        : `第${errorBankBatchSelection.batchIndex + 1}批`;
      return `错词本 · ${errorBank.count} 词 · 累计错 ${errorBank.totalWrongAttempts || errorBank.summary?.totalWrongAttempts || 0} 次 · ${batchPart} · 原始${errorBankBatchSelection.batchEntryCount}${unit}`;
    }
    if (practiceSource === "srs_review") {
      const batchPart = srsBatchSelection.batchCount > 1
        ? `第${srsBatchSelection.batchIndex + 1}/${srsBatchSelection.batchCount}批`
        : `第${srsBatchSelection.batchIndex + 1}批`;
      return `SRS 到期 · ${srsReview.count} 条 · ${batchPart} · 原始${srsBatchSelection.batchEntryCount}${unit}`;
    }
    if (isIdictationPracticeSource(practiceSource)) {
      const batchPart = idictationBatchSelection.batchCount > 1
        ? `第${idictationBatchSelection.batchIndex + 1}/${idictationBatchSelection.batchCount}组`
        : `第${idictationBatchSelection.batchIndex + 1}组`;
      return `${idictationSource?.label || "爱听写"} · ${idictationBatchSelection.groupLabel || "原表章节"} · ${batchPart} · 本组${idictationBatchSelection.batchEntryCount}词 · 入口总计${idictationBatchSelection.uniqueWords || 0}词`;
    }
    const batchPart = batchSelection.batchCount > 1
      ? `第${batchSelection.batchIndex + 1}/${batchSelection.batchCount}批`
      : `第${batchSelection.batchIndex + 1}批`;
    return `${batchSelection.label} · ${batchPart} · 原始${batchSelection.batchEntryCount}${unit}`;
  }, [practiceSource, personalWrongScopedCount, personalWrongBatchSelection, personalWrongCurrentBatchLabel, personalWrongCurrentBatchWriteCount, personalWrongTotalWriteCount, errorBank.count, errorBank.totalWrongAttempts, errorBank.summary?.totalWrongAttempts, errorBankBatchSelection, srsReview.count, srsBatchSelection, idictationSource, idictationBatchSelection, batchSelection, unit]);

  const categoryScope = useMemo(
    () => ({
      scope,
      practiceSource,
      activeMode: scopeConfig.entryMode,
      category: categoryPrefs,
      personalWrongBatchIndex,
      errorBankBatchIndex,
      srsBatchIndex,
      currentBatchId: activeBatchId,
      label: practiceSource === "personal_wrong_book" ? "做题错词" : practiceSource === "error_bank" ? "错词本" : practiceSource === "srs_review" ? "SRS 复习" : isIdictationPracticeSource(practiceSource) ? (idictationSource?.label || "爱听写") : batchSelection.label,
      personalWrongTotal: personalWrongSummary.total,
      errorBankTotal: errorBank.count,
      errorBankWrongAttempts: errorBank.totalWrongAttempts || errorBank.summary?.totalWrongAttempts || 0,
      srsReviewTotal: srsReview.count,
      idictationTotal: idictationBatchSelection.uniqueWords || 0
    }),
    [scope, practiceSource, scopeConfig.entryMode, categoryPrefs, personalWrongBatchIndex, errorBankBatchIndex, srsBatchIndex, activeBatchId, batchSelection.label, personalWrongSummary.total, errorBank.count, errorBank.totalWrongAttempts, errorBank.summary?.totalWrongAttempts, srsReview.count, idictationSource, idictationBatchSelection.uniqueWords]
  );

  const lexiconMeta = useMemo(
    () => (lexicon
      ? {
          lexiconVersion: lexicon.lexiconVersion,
          lexiconHash: lexicon.lexiconHash,
          counts: isPhrase
            ? { phrases: lexicon.counts.phrases }
            : { headwords: lexicon.counts.headwords }
        }
      : null),
    [lexicon, isPhrase]
  );

  const candidateOptions = useMemo(() => ({
    entryMode: scopeConfig.entryMode,
    scope,
    practiceSource,
    excludeFamiliarFlashcards: shouldExcludeFamiliarSpellingEntries(practiceSource, includeFamiliar)
  }), [scopeConfig.entryMode, scope, practiceSource, includeFamiliar]);

  const spelling = useSpellingEngine(spellingEntries, {
    spellingScope: scope,
    candidateOptions,
    lexiconMeta,
    categoryScope,
    turboMode,
    autoNextOnCorrect,
    soundEffectsEnabled
  });

  const undoLastSpellingAction = useCallback(async () => {
    const entry = spellingUndoStackRef.current.pop();
    if (!entry) {
      showActionNotice("没有可撤回的操作");
      return;
    }

    if (entry.type === "toggle_meaning") {
      setShowMeaning(entry.before);
      showActionNotice(`已撤回：${entry.label}`);
      return;
    }

    if (entry.type === "toggle_example") {
      setShowExample(entry.before);
      showActionNotice(`已撤回：${entry.label}`);
      return;
    }

    if (!entry.checkpoint) {
      showActionNotice("撤回失败：缺少状态快照");
      return;
    }

    const restored = await spelling.restoreCheckpoint(entry.checkpoint);
    if (!restored) {
      showActionNotice("撤回失败：无法恢复拼写状态");
      spellingUndoStackRef.current.push(entry);
      return;
    }

    if (entry.beforeSessionStats) {
      setSessionStats(entry.beforeSessionStats);
    }
    if (entry.inputValue !== undefined) {
      spelling.setInputValue(entry.inputValue);
    }
    if (entry.refreshErrorBank) {
      errorBank.refresh();
    }
    showActionNotice(`已撤回：${entry.label}`);
  }, [spelling, errorBank, setShowExample, setShowMeaning]);

  const handleToggleMeaning = useCallback(() => {
    learningActivityRef.current = recordLearningActivity(learningActivityRef.current);
    pushSpellingUndo({
      type: "toggle_meaning",
      label: showMeaning ? "隐藏释义" : "显示释义",
      before: showMeaning
    });
    setShowMeaning((open) => !open);
  }, [showMeaning, setShowMeaning]);

  const handleToggleExample = useCallback(() => {
    learningActivityRef.current = recordLearningActivity(learningActivityRef.current);
    pushSpellingUndo({
      type: "toggle_example",
      label: showExample ? "隐藏例句" : "显示例句",
      before: showExample
    });
    setShowExample((open) => !open);
  }, [showExample, setShowExample]);

  const handleSkip = useCallback(async () => {
    if (!spelling.ready || spelling.uiState === "inputting") return null;
    const checkpoint = spelling.captureCheckpoint();
    if (!checkpoint?.navigator?.currentWordId) return null;
    pushSpellingUndo({
      type: "skip",
      label: "跳过",
      checkpoint,
      beforeSessionStats: sessionStatsRef.current,
      inputValue: spelling.inputValue
    });

    commitLearningActivity();
    const result = await spelling.skip();
    if (result) {
      setSessionStats((current) => recordAttempt(current, { skipped: true, activeMs: 0 }));
    } else {
      spellingUndoStackRef.current.pop();
    }
    return result;
  }, [spelling, commitLearningActivity]);

  const handleMarkFamiliar = useCallback(async () => {
    if (!spelling.ready || spelling.uiState === "inputting") return null;

    const checkpoint = spelling.captureCheckpoint();
    if (!checkpoint?.navigator?.currentWordId) return null;
    pushSpellingUndo({
      type: "mark_familiar",
      label: "标记熟悉",
      checkpoint,
      beforeSessionStats: sessionStatsRef.current,
      inputValue: spelling.inputValue
    });

    commitLearningActivity();
    setSessionStats((current) => markFamiliar(current));
    const result = await spelling.markFamiliar();
    if (!result) {
      spellingUndoStackRef.current.pop();
    }
    return result;
  }, [spelling, commitLearningActivity]);

  const handleEnqueuePriorityReview = useCallback(async () => {
    if (!spelling.ready || spelling.uiState === "inputting") return null;

    const checkpoint = spelling.captureCheckpoint();
    if (!checkpoint?.navigator?.currentWordId) return null;
    pushSpellingUndo({
      type: "priority_review",
      label: "加入重点复习",
      checkpoint,
      beforeSessionStats: sessionStatsRef.current,
      inputValue: spelling.inputValue,
      refreshErrorBank: true
    });

    commitLearningActivity();
    const result = await spelling.enqueuePriorityReview();
    if (result) {
      errorBank.refresh();
    } else {
      spellingUndoStackRef.current.pop();
    }
    return result;
  }, [spelling, errorBank, commitLearningActivity]);

  async function handleAddPersonalWrongWords() {
    const parsed = parsePersonalWrongBookInput(personalWrongInput, { scopeHint: scope, now: Date.now() });
    if (!parsed.length) {
      showActionNotice("没有识别到可添加的英文错词");
      return;
    }

    const beforeRecords = normalizePersonalWrongBookRecords(personalWrongRecords);
    const beforeKeys = new Set(beforeRecords.map((record) => getPersonalWrongBookRecordDedupeKey(record)).filter(Boolean));
    const mergedRecords = mergePersonalWrongBookRecords(beforeRecords, parsed);
    const parsedScopedCount = parsed.filter((item) => item.scope === scope).length;
    const parsedOtherScopeCount = parsed.length - parsedScopedCount;
    const scopedAddedRecords = mergedRecords.filter((record) => (
      record.scope === scope && !beforeKeys.has(getPersonalWrongBookRecordDedupeKey(record))
    ));
    const scopedAdded = scopedAddedRecords.length;
    const otherScopeAdded = mergedRecords.filter((record) => (
      record.scope !== scope && !beforeKeys.has(getPersonalWrongBookRecordDedupeKey(record))
    )).length;
    const mergedDuplicateCount = Math.max(0, parsedScopedCount - scopedAdded)
      + Math.max(0, parsedOtherScopeCount - otherScopeAdded);
    const otherScopeLabel = scope === "word" ? "词组" : "单词";
    const nextBatchIndex = resolvePersonalWrongBatchIndexAfterAdd(mergedRecords, {
      scope,
      currentBatchIndex: personalWrongBatchIndex,
      addedRecordIds: scopedAddedRecords.map((record) => record.id)
    });
    const newWordsBatchIndex = scopedAdded
      ? findPersonalWrongBatchIndexForRecordIds(mergedRecords, scopedAddedRecords.map((record) => record.id), { scope })
      : personalWrongBatchIndex;
    const newWordsBatchNumber = newWordsBatchIndex + 1;

    setPersonalWrongRecords(mergedRecords);
    setPersonalWrongInput("");

    let lexiconAdded = 0;

    try {
      const syncResult = await syncPersonalWrongRecordsToLocalLexicon(mergedRecords, { scope });
      lexiconAdded = Number(syncResult?.added || 0);
      if (lexiconAdded > 0) {
        const refreshed = await loadSpellingLexicon({ force: true, scope });
        setLexicon(refreshed);
      }
    } catch (error) {
      console.warn("[personal-wrong-lexicon-sync]", error);
    }

    if (scopedAdded > 0) {
      patchStoredPrefs({
        practiceSource: "personal_wrong_book",
        personalWrongBatchIndex: nextBatchIndex
      });
    }

    const addedCount = scopedAdded + otherScopeAdded;
    const duplicateNote = mergedDuplicateCount > 0 ? `，已合并/跳过重复 ${mergedDuplicateCount} 词` : "";
    const lexiconNote = lexiconAdded > 0 ? `，已补充 ${lexiconAdded} 条到本地词库` : "";
    const batchNote = scopedAdded > 0
      ? (nextBatchIndex === newWordsBatchIndex
        ? `，新词在第 ${newWordsBatchNumber} 组，继续当前组练习`
        : `，新词在第 ${newWordsBatchNumber} 组，当前仍在本组（第 ${nextBatchIndex + 1} 组）继续，已练进度会保留`)
      : "";

    if (otherScopeAdded > 0 && scopedAdded === 0) {
      showActionNotice(`已加入 ${otherScopeAdded} 条${otherScopeLabel}错词，请切换到${otherScopeLabel}拼写页后在「做题错词」来源练习${duplicateNote}${lexiconNote}${batchNote}`);
      return;
    }

    if (otherScopeAdded > 0) {
      showActionNotice(`已加入 ${addedCount} 词（本页 ${scopedAdded} 词，另有 ${otherScopeAdded} 词${otherScopeLabel}请切换页面）；原形词练 ${PERSONAL_WRONG_BOOK_BASE_REPS} 遍，原形+复数词练 ${PERSONAL_WRONG_BOOK_REPETITIONS} 遍${duplicateNote}${lexiconNote}${batchNote}`);
      return;
    }

    showActionNotice(`已加入做题错词本：${scopedAdded} 词；原形词练 ${PERSONAL_WRONG_BOOK_BASE_REPS} 遍，原形+复数词练 ${PERSONAL_WRONG_BOOK_REPETITIONS} 遍（原形 ${PERSONAL_WRONG_BOOK_BASE_REPS} + 复数 ${PERSONAL_WRONG_BOOK_PLURAL_REPS}）${duplicateNote}${lexiconNote}${batchNote}`);
  }

  async function handleClearPersonalWrongBook() {
    const scopedCount = scope === "phrase" ? personalWrongSummary.phrase : personalWrongSummary.word;
    if (!scopedCount) return;
    if (!window.confirm(`确认清空当前${scopeConfig.label}做题错词本？`)) return;
    const nextRecords = normalizePersonalWrongBookRecords(personalWrongRecords).filter((record) => record.scope !== scope);
    setPersonalWrongRecords(nextRecords);
    if (practiceSource === "personal_wrong_book") {
      patchStoredPrefs({ practiceSource: "category", personalWrongBatchIndex: 0 });
    }
    try {
      const syncResult = await syncPersonalWrongRecordsToLocalLexicon(nextRecords, { scope });
      if (Number(syncResult?.removed || 0) > 0 || Number(syncResult?.added || 0) > 0) {
        const refreshed = await loadSpellingLexicon({ force: true, scope });
        setLexicon(refreshed);
      }
      const removedNote = Number(syncResult?.removed || 0) > 0
        ? `，已回收本地补充 ${syncResult.removed} 条`
        : "";
      showActionNotice(`已清空当前做题错词本${removedNote}`);
      return;
    } catch (error) {
      console.warn("[personal-wrong-lexicon-sync]", error);
      showActionNotice("已清空当前做题错词本，本地补充词库回收稍后重试");
      return;
    }
    showActionNotice("已清空当前做题错词本");
  }

  async function handleDeletePersonalWrongRecord(record) {
    const recordId = String(record?.id || "").trim();
    if (!recordId) return;

    const beforeRecords = normalizePersonalWrongBookRecords(personalWrongRecords);
    const nextRecords = beforeRecords.filter((item) => item.id !== recordId);
    if (nextRecords.length === beforeRecords.length) return;

    const nextBatchIndex = clampPersonalWrongBatchIndex(personalWrongBatchIndex, nextRecords, { scope });
    setPersonalWrongRecords(nextRecords);
    patchStoredPrefs({
      practiceSource: nextRecords.some((item) => item.scope === scope) ? practiceSource : "category",
      personalWrongBatchIndex: nextBatchIndex
    });

    try {
      const syncResult = await syncPersonalWrongRecordsToLocalLexicon(nextRecords, { scope });
      if (Number(syncResult?.removed || 0) > 0 || Number(syncResult?.added || 0) > 0) {
        const refreshed = await loadSpellingLexicon({ force: true, scope });
        setLexicon(refreshed);
      }
      showActionNotice(`已删除错词：${formatPersonalWrongUnitLabel(record)}`);
    } catch (error) {
      console.warn("[personal-wrong-lexicon-sync]", error);
      showActionNotice(`已删除错词：${formatPersonalWrongUnitLabel(record)}，本地补充词库稍后同步`);
    }
  }

  const isSpellingLoading = !lexicon || !spelling.ready;
  const showEnginePreparing = isSpellingLoading;
  const current = !isSpellingLoading ? spelling.currentWord : null;

  useEffect(() => {
    learningActivityRef.current = createLearningActivity();
  }, [activeBatchId, current?.wordId]);

  const progress = spelling.progress || {};
  const candidateBreakdown = progress.candidateBreakdown || null;
  const fallbackRawBatchTotal = practiceSource === "personal_wrong_book"
    ? personalWrongBatchSelection.batchEntryCount
    : practiceSource === "error_bank"
      ? errorBankBatchSelection.batchEntryCount
      : practiceSource === "srs_review"
        ? srsBatchSelection.batchEntryCount
        : batchSelection.batchEntryCount;
  const rawBatchTotal = candidateBreakdown?.rawBatchTotal ?? fallbackRawBatchTotal ?? 0;
  const batchProgress = progress.batchProgress || {
    rawBatchTotal,
    sessionTotal: rawBatchTotal,
    completedCount: 0,
    currentNumber: rawBatchTotal ? 1 : 0,
    percent: 0,
    filteredOutTotal: 0
  };
  const candidateTotal = candidateBreakdown?.candidateTotal ?? batchProgress.sessionTotal ?? rawBatchTotal;
  const sessionTotal = batchProgress.sessionTotal ?? batchProgress.total ?? 0;
  const completedCount = batchProgress.completedCount ?? batchProgress.completed ?? 0;
  const remainingCount = (progress.todaySpellingRemainingCount ?? 0) + (progress.todayRepairPendingCount ?? 0);
  const filteredOutTotal = batchProgress.filteredOutTotal ?? Math.max(0, rawBatchTotal - sessionTotal);
  const sessionTrainingLine = formatSessionTrainingLine({
    sessionTotal,
    filteredOutTotal,
    filteredByFamiliar: batchProgress.filteredByFamiliar,
    filteredByInvalidAnswer: batchProgress.filteredByInvalidAnswer,
    filteredByMode: batchProgress.filteredByMode,
    filteredOther: batchProgress.filteredOther,
    currentMode: candidateBreakdown?.currentMode || scopeConfig.entryMode
  });
  const batchProgressCurrentNumber = Number(batchProgress.currentNumber || 0);
  const currentPosition = batchProgressCurrentNumber > 0
    ? Math.min(sessionTotal || batchProgressCurrentNumber, batchProgressCurrentNumber)
    : resolveSpellingStudyPosition(
      sessionTotal,
      completedCount,
      Boolean(current)
    );
  const masteryPercent = sessionTotal > 0 ? Math.round((completedCount / sessionTotal) * 100) : 0;
  const progressPercent = masteryPercent;
  const progressBarPercent = resolveSpellingProgressBarPercent(sessionTotal, completedCount, currentPosition);
  const personalWrongUnitProgress = practiceSource === "personal_wrong_book"
    ? batchProgress.personalWrongUnitProgress || null
    : null;
  const personalWrongSessionReady = practiceSource === "personal_wrong_book" && spelling.ready;
  // The navigation hook reports a successful jump using resultBatchProgress.currentNumber.
  const {
    batchNavigationWordIds,
    personalWrongNavigationUnits,
    currentBatchIndex,
    canBrowseBatchWords,
    handleGoToPreviousWord,
    handleGoToNextWord,
    restoredPositionBatchRef,
    restoringPositionRef
  } = useSpellingTrainingSessionNavigation({
    spelling,
    spellingEntries,
    current,
    practiceSource,
    personalWrongSessionReady,
    candidateBreakdown,
    batchProgress,
    activeBatchId,
    scope,
    categoryPrefs,
    sessionTotal,
    currentPosition,
    commitLearningActivity,
    setErrorAnalysisVisible,
    setActionNotice
  });
  const spellingReady = spelling.ready;
  const navigateToWord = spelling.navigateToWord;

  useEffect(() => {
    if (!spellingReady || !activeBatchId || !batchNavigationWordIds.length || restoredPositionBatchRef.current === activeBatchId) return;

    const saved = readSpellingPosition(scope, activeBatchId);
    const rawSavedWordId = String(saved?.navigationWordId || saved?.wordId || "").trim();
    const savedWordId = practiceSource === "personal_wrong_book"
      ? resolvePersonalWrongNavigationWordId(rawSavedWordId, personalWrongNavigationUnits)
      : rawSavedWordId;
    const currentWordId = resolveSpellingWordKey(current);
    const currentNavigationWordId = practiceSource === "personal_wrong_book"
      ? resolvePersonalWrongNavigationWordId(currentWordId, personalWrongNavigationUnits)
      : currentWordId;

    if (!savedWordId || savedWordId === currentNavigationWordId) {
      restoredPositionBatchRef.current = activeBatchId;
      return;
    }

    if (!batchNavigationWordIds.includes(savedWordId)) return;

    restoredPositionBatchRef.current = activeBatchId;
    let cancelled = false;
    restoringPositionRef.current = true;
    navigateToWord(savedWordId).then((result) => {
      if (!cancelled && result?.currentWord) {
        setErrorAnalysisVisible(false);
      }
    }).finally(() => {
      if (!cancelled) restoringPositionRef.current = false;
    });

    return () => {
      cancelled = true;
      restoringPositionRef.current = false;
    };
  }, [spellingReady, navigateToWord, activeBatchId, batchNavigationWordIds, scope, current, restoredPositionBatchRef, restoringPositionRef, practiceSource, personalWrongNavigationUnits]);

  useEffect(() => {
    if (!spellingReady || !activeBatchId || restoredPositionBatchRef.current !== activeBatchId || restoringPositionRef.current || !current) return;
    const wordId = resolveSpellingWordKey(current);
    if (!wordId) return;
    const navigationWordId = practiceSource === "personal_wrong_book"
      ? resolvePersonalWrongNavigationWordId(wordId, personalWrongNavigationUnits)
      : wordId;
    writeSpellingPosition(scope, {
      activeBatchId,
      wordId,
      navigationWordId,
      currentBatchIndex,
      practiceSource,
      category: categoryPrefs,
      savedAt: Date.now()
    });
  }, [spellingReady, activeBatchId, current, currentBatchIndex, scope, restoredPositionBatchRef, restoringPositionRef, practiceSource, categoryPrefs, personalWrongNavigationUnits]);

  const isBatchComplete = sessionTotal > 0 && completedCount >= sessionTotal && remainingCount === 0;
  const batchWrongWordCount = Math.max(0, Number(progress.repairedCount || 0));
  const batchFirstTryCount = Math.max(0, Number(progress.newWordsPassed ?? (completedCount - batchWrongWordCount)));
  const batchSuccessRate = completedCount > 0
    ? Math.round((batchFirstTryCount / completedCount) * 100)
    : 0;
  const prompt = getSpellingPromptView(current);
  const maskOptions = useMemo(() => {
    const source = current?.sourceWord || {};
    const formWords = [
      ...(Array.isArray(source.forms) ? source.forms : []),
      ...(Array.isArray(source.wordFamily) ? source.wordFamily : [])
    ]
      .map((item) => (typeof item === "string" ? item : item?.word))
      .filter(Boolean);

    return {
      targetWord: current?.expectedAnswer || current?.displayText || "",
      lemma: current?.lemma,
      formWords,
      variants: Array.isArray(current?.acceptedAnswers)
        ? current.acceptedAnswers.filter((answer) => answer && answer !== current?.expectedAnswer)
        : undefined
    };
  }, [current]);
  const exampleLine = formatExampleForPrompt(prompt.example, maskOptions);
  const speech = useVocabSpeech({
    entry: current,
    word: resolveSpellingSpeechText(current),
    example: prompt.example
  });
  const playCurrentSpellingWord = speech.playWord;

  useEffect(() => {
    if (practiceSource !== "personal_wrong_book" || !spellingEntries.length) return undefined;
    void preloadSpellingSpeechTexts(spellingEntries.slice(0, 12));
    return undefined;
  }, [practiceSource, spellingEntries]);

  useEffect(() => {
    if (listenOnlyMode) return undefined;
    if (!spelling.ready || !current) return undefined;
    if (!resolveSpellingSpeechText(current)) return undefined;
    if (!["show_question", "in_repair", "wrong_feedback"].includes(spelling.uiState)) return undefined;

    const timer = window.setTimeout(() => {
      void playCurrentSpellingWord();
    }, 280);

    return () => window.clearTimeout(timer);
  }, [
    spelling.ready,
    spelling.uiState,
    current,
    listenOnlyMode,
    playCurrentSpellingWord
  ]);

  const sessionMetrics = useMemo(
    () => computeSpellingSessionMetrics(sessionStats, { remaining: remainingCount }),
    [sessionStats, remainingCount]
  );

  const nextRoundTarget = useMemo(() => {
    if (practiceSource === "personal_wrong_book") {
      return personalWrongBatchIndex + 1 < personalWrongBatchOptions.length
        ? { source: "personal_wrong_book", batchIndex: personalWrongBatchIndex + 1 }
        : null;
    }

    if (practiceSource === "error_bank") {
      return errorBankBatchIndex + 1 < errorBankBatchOptions.length
        ? { source: "error_bank", batchIndex: errorBankBatchIndex + 1 }
        : null;
    }

    if (practiceSource === "srs_review") {
      return srsBatchIndex + 1 < srsBatchOptions.length
        ? { source: "srs_review", batchIndex: srsBatchIndex + 1 }
        : null;
    }

    if (isIdictationPracticeSource(practiceSource)) {
      if (idictationBatchSelection.batchIndex + 1 < idictationBatchOptions.length) {
        return {
          source: practiceSource,
          sourceKey: idictationSourceKey,
          groupKey: idictationBatchSelection.groupKey,
          batchIndex: idictationBatchSelection.batchIndex + 1
        };
      }

      const currentGroupIndex = idictationGroupOptions.findIndex((group) => group.value === idictationBatchSelection.groupKey);
      const nextGroup = idictationGroupOptions[currentGroupIndex + 1];
      return nextGroup
        ? { source: practiceSource, sourceKey: idictationSourceKey, groupKey: nextGroup.value, batchIndex: 0 }
        : null;
    }

    if (categoryPrefs.batchIndex + 1 < batchOptions.length) {
      return { source: "category", batchIndex: categoryPrefs.batchIndex + 1 };
    }

    if (categoryPrefs.categoryType === "difficulty") {
      const currentIndex = SPELLING_DIFFICULTY_OPTIONS.findIndex((item) => item.value === categoryPrefs.categoryValue);
      const nextDifficulty = SPELLING_DIFFICULTY_OPTIONS
        .slice(currentIndex + 1)
        .find((item) => Number(difficultyCounts.get(item.value) || 0) > 0);
      if (nextDifficulty) {
        return { source: "category", categoryValue: nextDifficulty.value, batchIndex: 0 };
      }
    }

    return null;
  }, [
    practiceSource,
    personalWrongBatchIndex,
    personalWrongBatchOptions.length,
    errorBankBatchIndex,
    errorBankBatchOptions.length,
    srsBatchIndex,
    srsBatchOptions.length,
    idictationSourceKey,
    idictationBatchSelection,
    idictationBatchOptions.length,
    idictationGroupOptions,
    categoryPrefs,
    batchOptions.length,
    difficultyCounts
  ]);

  useEffect(() => {
    if (!dailyStatsHydrated || !spelling.ready) return;
    const masteredCount = Math.max(0, Number(progress.masteredCount || 0));
    if (!masteredCount) return;

    setDailyStats((stats) => {
      const normalized = normalizeSpellingDailyStats(stats);
      if (normalized.totalAttempts > 0 || normalized.learnedWordIds.length > 0) return normalized;
      const repairedCount = Math.min(masteredCount, Math.max(0, Number(progress.repairedCount || 0)));
      return {
        ...normalized,
        learnedWordIds: Array.from({ length: masteredCount }, (_, index) => `${activeBatchId}:restored:${index}`),
        wrongWordIds: Array.from({ length: repairedCount }, (_, index) => `${activeBatchId}:restored-wrong:${index}`)
      };
    });
  }, [dailyStatsHydrated, spelling.ready, progress.masteredCount, progress.repairedCount, activeBatchId]);

  function handleNextRound() {
    if (!nextRoundTarget) return;

    if (nextRoundTarget.source === "personal_wrong_book") {
      patchStoredPrefs({ personalWrongBatchIndex: nextRoundTarget.batchIndex });
    } else if (nextRoundTarget.source === "error_bank") {
      patchStoredPrefs({ errorBankBatchIndex: nextRoundTarget.batchIndex });
    } else if (nextRoundTarget.source === "srs_review") {
      patchStoredPrefs({ srsBatchIndex: nextRoundTarget.batchIndex });
    } else if (isIdictationPracticeSource(nextRoundTarget.source)) {
      patchIdictationPrefs(nextRoundTarget.sourceKey, {
        groupKey: nextRoundTarget.groupKey,
        batchIndex: nextRoundTarget.batchIndex
      });
    } else {
      patchCategoryPrefs({
        batchIndex: nextRoundTarget.batchIndex,
        ...(nextRoundTarget.categoryValue ? { categoryValue: nextRoundTarget.categoryValue } : {})
      });
    }

    learningActivityRef.current = createLearningActivity();
    setSessionStats(createSpellingSessionStats());
  }

  const handlePlayExample = useCallback(() => {
    learningActivityRef.current = recordLearningActivity(learningActivityRef.current);
    setShowExample(true);
    speech.playExample();
  }, [speech, setShowExample]);

  const handleReplay = useCallback(() => {
    learningActivityRef.current = recordLearningActivity(learningActivityRef.current);
    speech.playWord();
  }, [speech]);

  const handleSubmit = useCallback(async () => {
    if (!current || !spelling.inputValue.trim() || spelling.uiState === "inputting") return null;
    const attemptedWordId = current.wordId || current.id || current.expectedAnswer || current.displayText;
    const learningResult = finishLearningActivity(learningActivityRef.current);
    const result = await spelling.submit();
    if (result?.answerMeta) {
      learningActivityRef.current = learningResult.next;
      setSessionStats((stats) => recordAttempt(stats, {
        isCorrect: result.answerMeta.isCorrect,
        skipped: result.answerMeta.skipped,
        activeMs: learningResult.activeMs
      }));
      setDailyStats((stats) => recordSpellingDailyAttempt(stats, {
        wordId: result.answerMeta.wordId || attemptedWordId,
        isCorrect: result.answerMeta.isCorrect,
        skipped: result.answerMeta.skipped,
        activeMs: learningResult.activeMs
      }));
    }
    if (result?.answerMeta && !result.answerMeta.isCorrect) {
      void refreshErrorBank();
    }
    if (result?.answerMeta && practiceSource === "srs_review") {
      void refreshSrsReview();
    }
    return result;
  }, [current, spelling, practiceSource, refreshErrorBank, refreshSrsReview]);

  useEffect(() => {
    if (practiceSource === "srs_review" && spelling.uiState === "done_today") {
      refreshSrsReview();
    }
  }, [practiceSource, spelling.uiState, refreshSrsReview]);

  useEffect(() => {
    if (!spelling.ready) return;
    refreshErrorBank();
    refreshSrsReview();
  }, [spelling.ready, refreshErrorBank, refreshSrsReview]);

  const handleContinueAfterCorrect = useCallback(async () => {
    if (!spelling.awaitingAdvance || spelling.uiState !== "correct_feedback") return null;
    return spelling.continueAfterCorrect();
  }, [spelling]);

  const trainingControls = useSpellingTrainingControls({
    enabled: spelling.ready && Boolean(current),
    current,
    spelling,
    speech,
    listenOnlyMode,
    showMeaning,
    showExample,
    onToggleMeaning: handleToggleMeaning,
    onToggleExample: handleToggleExample,
    onSubmit: handleSubmit,
    onPlayExample: handlePlayExample,
    onSkip: handleSkip,
    onMarkFamiliar: handleMarkFamiliar,
    onEnqueuePriorityReview: handleEnqueuePriorityReview,
    onReplay: handleReplay,
    onContinueAfterCorrect: handleContinueAfterCorrect,
    onUndo: undoLastSpellingAction,
    onPreviousWord: handleGoToPreviousWord,
    onNextWord: handleGoToNextWord
  });

  const debugDetails = isSpellingDebugMode()
    ? buildSpellingDebugDetails(current, {
        entryMode: scopeConfig.entryMode,
        lexiconVersion: lexicon?.lexiconVersion,
        lexiconHash: lexicon?.lexiconHash,
        counts: lexiconMeta?.counts,
        schedulerReason: spelling.debug?.schedulerReason
      })
    : null;

  async function submit(event) {
    event.preventDefault();
    await handleSubmit();
  }

  const handleSubmitRef = useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;

  useEffect(() => {
    if (
      spelling.uiState === "wrong_feedback"
      && spelling.lastDiagnosis
      && !spelling.lastDiagnosis.isCorrect
    ) {
      setErrorAnalysisVisible(true);
      return;
    }

    if (spelling.uiState !== "wrong_feedback") {
      setErrorAnalysisVisible(false);
    }
  }, [spelling.uiState, spelling.lastDiagnosis, current?.wordId]);

  const handleInputChange = useCallback((event) => {
    learningActivityRef.current = recordLearningActivity(learningActivityRef.current);
    spelling.setInputValue(event.target.value);
    if (event.target.value && errorAnalysisVisible) setErrorAnalysisVisible(false);
  }, [spelling, errorAnalysisVisible]);

  useEffect(() => {
    if (!autoNextOnCorrect || !spelling.ready || !current) return undefined;
    if (spelling.uiState === "inputting" || spelling.uiState === "correct_feedback") return undefined;

    const value = spelling.inputValue.trim();
    if (!value) return undefined;

    const expected = current.expectedAnswer || current.displayText || "";
    const accepted = Array.isArray(current.acceptedAnswers) ? current.acceptedAnswers : [];
    if (!isSpellingAnswerCorrect(value, expected, accepted)) return undefined;

    const timer = window.setTimeout(() => {
      handleSubmitRef.current();
    }, AUTO_SUBMIT_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [
    autoNextOnCorrect,
    spelling.ready,
    spelling.uiState,
    spelling.inputValue,
    current
  ]);

  const srsIntervalText = SPELLING_SRS_INTERVALS_DAYS.join(" → ");
  const showPersonalWrongGroupSelect = personalWrongScopedCount > 0 && personalWrongBatchOptions.length > 0;

  function handlePersonalWrongBatchChange(batchIndex) {
    patchStoredPrefs({ personalWrongBatchIndex: batchIndex });
  }

  const handleExportCombinedLexicon = useCallback(() => {
    if (!lexicon) {
      showActionNotice("词库尚未加载完成，请稍后再导出");
      return;
    }

    const wordCount = lexicon.counts?.headwords || lexicon.headwords?.length || 0;
    const phraseCount = lexicon.counts?.phrases || lexicon.phrases?.length || 0;
    if (!wordCount && !phraseCount) {
      showActionNotice("当前没有可导出的单词或词组");
      return;
    }

    const payload = buildCombinedLexiconExportPayload(lexicon);
    triggerSpellingExportDownload({
      filename: buildCombinedExportFilename(payload.counts),
      content: JSON.stringify(payload, null, 2),
      mimeType: "application/json;charset=utf-8"
    });
    showActionNotice(`已导出：${wordCount} 个单词、${phraseCount} 条词组`);
  }, [lexicon]);

  const handleExportScopeLexicon = useCallback(() => {
    if (!lexicon) {
      showActionNotice("词库尚未加载完成，请稍后再导出");
      return;
    }

    const payload = buildScopeLexiconExportPayload(lexicon, scope);
    if (!payload.count) {
      showActionNotice(`当前没有可导出的${scopeConfig.label}`);
      return;
    }

    triggerSpellingExportDownload({
      filename: buildScopeLexiconExportFilename(scope, payload.count),
      content: JSON.stringify(payload, null, 2),
      mimeType: "application/json;charset=utf-8"
    });
    showActionNotice(`已导出全部${scopeConfig.label}：${payload.count} 条`);
  }, [lexicon, scope, scopeConfig.label]);

  const handleExportCurrentBatch = useCallback((format = "json") => {
    if (!spellingEntries.length) {
      showActionNotice("当前范围没有可导出内容");
      return;
    }

    const exportedAt = new Date();
    if (format === "txt") {
      const lines = buildEnglishTxtLines(spellingEntries);
      triggerSpellingExportDownload({
        filename: buildCurrentBatchExportFilename(scope, lines.length, "txt", exportedAt),
        content: `${lines.join("\n")}\n`,
        mimeType: "text/plain;charset=utf-8"
      });
      showActionNotice(`已导出当前批次 TXT：${lines.length} 行`);
      return;
    }

    const payload = buildCurrentBatchExportPayload({
      entries: spellingEntries,
      scope,
      practiceSource,
      rangeLabel: activeRangeLine,
      exportedAt: exportedAt.toISOString()
    });
    triggerSpellingExportDownload({
      filename: buildCurrentBatchExportFilename(scope, payload.count, "json", exportedAt),
      content: JSON.stringify(payload, null, 2),
      mimeType: "application/json;charset=utf-8"
    });
    showActionNotice(`已导出当前批次 JSON：${payload.count} 条`);
  }, [spellingEntries, scope, practiceSource, activeRangeLine]);

  const handleExportCurrentCategory = useCallback((format = "json") => {
    if (!currentCategoryEntries.length) {
      showActionNotice("当前分类没有可导出内容");
      return;
    }

    const exportedAt = new Date();
    if (format === "txt") {
      const lines = buildEnglishTxtLines(currentCategoryEntries);
      triggerSpellingExportDownload({
        filename: buildCurrentCategoryExportFilename(scope, lines.length, "txt", exportedAt),
        content: `${lines.join("\n")}\n`,
        mimeType: "text/plain;charset=utf-8"
      });
      showActionNotice(`已导出${batchSelection.label}全部 TXT：${lines.length} 行`);
      return;
    }

    const payload = buildCurrentCategoryExportPayload({
      entries: currentCategoryEntries,
      scope,
      categoryType: categoryPrefs.categoryType,
      categoryValue: categoryPrefs.categoryValue,
      rangeLabel: batchSelection.label,
      exportedAt: exportedAt.toISOString()
    });
    triggerSpellingExportDownload({
      filename: buildCurrentCategoryExportFilename(scope, payload.count, "json", exportedAt),
      content: JSON.stringify(payload, null, 2),
      mimeType: "application/json;charset=utf-8"
    });
    showActionNotice(`已导出${batchSelection.label}全部 JSON：${payload.count} 条`);
  }, [currentCategoryEntries, scope, categoryPrefs, batchSelection.label]);

  return (
    <main className="spelling-page-shell">
      <header className="spelling-topbar" aria-label="拼写训练顶栏">
        <div className="spelling-topbar__nav">
          <Link className="spelling-back-link spelling-back-link--compact" href="/">← 刷词</Link>
          <Link className="spelling-back-link spelling-back-link--compact" href={otherRoute}>{otherLabel}</Link>
        </div>

        <div className="spelling-status-bar" aria-label="训练状态">
          <span className="spelling-status-bar__item">{activeBatchSelection?.label || "准备中"}</span>
          <span className="spelling-status-bar__sep" aria-hidden="true">·</span>
          <span className="spelling-status-bar__item">
            {completedCount}/{sessionTotal || "—"} {unit}
            {sessionTotal > 0 ? ` (${progressPercent}%)` : ""}
          </span>
          <span className="spelling-status-bar__sep" aria-hidden="true">·</span>
          <span className="spelling-status-bar__item">错词 {errorBank.count} · 累计 {errorBank.totalWrongAttempts || 0}</span>
          <span className="spelling-status-bar__sep" aria-hidden="true">·</span>
          <span className="spelling-status-bar__item">SRS {srsReview.count}</span>
        </div>

        <div className="spelling-topbar__actions">
          <button
            type="button"
            className="spelling-topbar__toggle"
            aria-expanded={aiToolsPanelOpen}
            onMouseDown={trainingControls.markSettingsInteraction}
            onClick={() => setAiToolsPanelOpen((open) => !open)}
            title="在拼写页使用 AI 工具"
          >
            AI工具
          </button>
          <button
            type="button"
            className="spelling-export-btn spelling-export-btn--primary"
            data-testid="spelling-export-combined"
            disabled={!lexicon}
            onMouseDown={trainingControls.markSettingsInteraction}
            onClick={handleExportCombinedLexicon}
            title="导出完整单词库与词组库（JSON）"
          >
            一键导出
          </button>
          <button
            type="button"
            className="spelling-topbar__toggle"
            aria-expanded={personalWrongPanelOpen}
            onMouseDown={trainingControls.markSettingsInteraction}
            onClick={() => setPersonalWrongPanelOpen((open) => !open)}
          >
            做题错词本
          </button>
          <button
            type="button"
            className="spelling-topbar__toggle"
            aria-expanded={statsSidebarOpen}
            onMouseDown={trainingControls.markSettingsInteraction}
            onClick={() => setStatsSidebarOpen((open) => !open)}
          >
            {statsSidebarOpen ? "收起侧栏" : "统计/设置"}
          </button>
        </div>
      </header>

      {loadError ? <p className="spelling-load-error spelling-load-error--inline">{loadError}</p> : null}

      {aiToolsPanelOpen ? (
        <SpellingAiToolsPanel
          scope={scope}
          currentEntry={current}
          onLexiconUpdated={setLexicon}
          onNotice={showActionNotice}
        />
      ) : null}

      {personalWrongPanelOpen ? (
        <SpellingPersonalWrongDock
          scope={scope}
          scopeConfig={scopeConfig}
          unit={unit}
          personalWrongInput={personalWrongInput}
          setPersonalWrongInput={setPersonalWrongInput}
          personalWrongSummary={personalWrongSummary}
          personalWrongScopedCount={personalWrongScopedCount}
          personalWrongCurrentBatchLabel={personalWrongCurrentBatchLabel}
          personalWrongBatchSelection={personalWrongBatchSelection}
          personalWrongCurrentBatchWriteCount={personalWrongCurrentBatchWriteCount}
          personalWrongTotalWriteCount={personalWrongTotalWriteCount}
          showPersonalWrongGroupSelect={showPersonalWrongGroupSelect}
          personalWrongBatchOptions={personalWrongBatchOptions}
          personalWrongCurrentBatchRecords={personalWrongCurrentBatchRecords}
          personalWrongSourceEntries={personalWrongSourceEntries}
          trainingControls={trainingControls}
          onClose={() => setPersonalWrongPanelOpen(false)}
          onAdd={handleAddPersonalWrongWords}
          onClear={handleClearPersonalWrongBook}
          onPractice={() => {
            patchStoredPrefs({ practiceSource: "personal_wrong_book", personalWrongBatchIndex: 0 });
            setPersonalWrongPanelOpen(false);
          }}
          onBatchChange={handlePersonalWrongBatchChange}
          onDeleteRecord={handleDeletePersonalWrongRecord}
          patchStoredPrefs={patchStoredPrefs}
        />
      ) : null}

      <div className={`spelling-page-layout${statsSidebarOpen ? " is-sidebar-open" : ""}`}>
        <SpellingFocusCard
          isSpellingLoading={isSpellingLoading}
          isBatchComplete={isBatchComplete}
          current={current}
          batchSuccessRate={batchSuccessRate}
          completedCount={completedCount}
          batchWrongWordCount={batchWrongWordCount}
          dailyStats={dailyStats}
          formatActiveLearningTime={formatActiveLearningTime}
          handleNextRound={handleNextRound}
          nextRoundTarget={nextRoundTarget}
          spelling={spelling}
          listenOnlyMode={listenOnlyMode}
          prompt={prompt}
          showExample={showExample}
          exampleLine={exampleLine}
          trainingControls={trainingControls}
          handleInputChange={handleInputChange}
          submit={submit}
          handleSkip={handleSkip}
          isPhrase={isPhrase}
          errorAnalysisVisible={errorAnalysisVisible}
          showEnginePreparing={showEnginePreparing}
          showMeaning={showMeaning}
          speech={speech}
          handleReplay={handleReplay}
          practiceSource={practiceSource}
          personalWrongSummary={personalWrongSummary}
          scope={scope}
          errorBank={errorBank}
          srsReview={srsReview}
          scopeConfig={scopeConfig}
          debugDetails={debugDetails}
          personalWrongUnitProgress={personalWrongUnitProgress}
          currentPosition={currentPosition}
          progressBarPercent={progressBarPercent}
          sessionTotal={sessionTotal}
          canBrowseBatchWords={canBrowseBatchWords}
          isWordNavBlocked={isWordNavBlocked}
          handleGoToPreviousWord={handleGoToPreviousWord}
          handleGoToNextWord={handleGoToNextWord}
          autoNextOnCorrect={autoNextOnCorrect}
          undoLastSpellingAction={undoLastSpellingAction}
          actionNotice={actionNotice}
        />

        <SpellingStatsSidebar
          statsSidebarOpen={statsSidebarOpen}
          onClose={() => setStatsSidebarOpen(false)}
          dailyStats={dailyStats}
          formatActiveLearningTime={formatActiveLearningTime}
          sessionMetrics={sessionMetrics}
          unit={unit}
          progress={progress}
          candidateTotal={candidateTotal}
          rawBatchTotal={rawBatchTotal}
          errorBank={errorBank}
          completedCount={completedCount}
          remainingCount={remainingCount}
          rangeBarProps={{
            isPhrase,
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
          }}
          personalWrongInput={personalWrongInput}
          setPersonalWrongInput={setPersonalWrongInput}
          trainingControls={trainingControls}
          handleAddPersonalWrongWords={handleAddPersonalWrongWords}
          handleClearPersonalWrongBook={handleClearPersonalWrongBook}
          personalWrongSummary={personalWrongSummary}
          scope={scope}
          scopeConfig={scopeConfig}
          personalWrongScopedCount={personalWrongScopedCount}
          personalWrongCurrentBatchLabel={personalWrongCurrentBatchLabel}
          personalWrongBatchSelection={personalWrongBatchSelection}
          personalWrongCurrentBatchWriteCount={personalWrongCurrentBatchWriteCount}
          personalWrongTotalWriteCount={personalWrongTotalWriteCount}
          personalWrongCurrentBatchRecords={personalWrongCurrentBatchRecords}
          personalWrongSourceEntries={personalWrongSourceEntries}
          handleDeletePersonalWrongRecord={handleDeletePersonalWrongRecord}
          lexicon={lexicon}
          handleExportCombinedLexicon={handleExportCombinedLexicon}
          handleExportScopeLexicon={handleExportScopeLexicon}
          spellingEntries={spellingEntries}
          handleExportCurrentBatch={handleExportCurrentBatch}
          practiceSource={practiceSource}
          currentCategoryEntries={currentCategoryEntries}
          handleExportCurrentCategory={handleExportCurrentCategory}
          batchSelection={batchSelection}
          srsReview={srsReview}
          srsIntervalText={srsIntervalText}
        />

      </div>
    </main>
  );
}
