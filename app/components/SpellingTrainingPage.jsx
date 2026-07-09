"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SpellingAiToolsPanel from "./SpellingAiToolsPanel.jsx";
import SpellingFeedbackPanel from "./SpellingFeedbackPanel.jsx";
import VirtualList from "./VirtualList.jsx";
import layoutStyles from "./SpellingTrainingLayout.module.css";
import { AUTO_SUBMIT_DEBOUNCE_MS, useSpellingEngine } from "../hooks/useSpellingEngine.js";
import { useSpellingErrorBank } from "../hooks/useSpellingErrorBank.js";
import { useSpellingSrsReview } from "../hooks/useSpellingSrsReview.js";
import { useSpellingTrainingControls } from "../hooks/useSpellingTrainingControls.js";
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
  formatErrorBankSeverity,
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
  normalizeIdictationPrefs,
  selectIdictationBatch
} from "../lib/spelling/idictation-frequency.mjs";
import { syncPersonalWrongRecordsToLocalLexicon } from "../lib/spelling/personal-wrong-lexicon-sync.mjs";
import { srsReviewEntriesToSpellingCandidates } from "../lib/spelling/srs-review.mjs";
import {
  SPELLING_CATEGORY_TYPES,
  SPELLING_DIFFICULTY_OPTIONS,
  SPELLING_IELTS_USE_OPTIONS,
  SPELLING_LISTENING_READING_OPTIONS,
  SPELLING_PHRASE_CATEGORY_TYPES,
  SPELLING_PRACTICE_SOURCES,
  SPELLING_SRS_INTERVALS_DAYS,
  SPELLING_TOPIC_OPTIONS,
  countEntriesBySpellingCategories,
  filterBySpellingCategory,
  listSpellingBatchOptions,
  selectSpellingBatch,
  spellingCategoryLabel
} from "../lib/spelling/spelling-categories.mjs";
import { formatCandidateBreakdownSummary, formatSessionTrainingLine } from "../lib/spelling/candidate-breakdown.mjs";
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
import { getWordId, normalizeSpellingAnswer } from "../lib/spelling/word-id.mjs";
import {
  SPELLING_SCOPE_ROUTES,
  normalizeSpellingScope,
  resolveSpellingScope
} from "../lib/spelling/spelling-scope.mjs";
import {
  DEFAULT_SPELLING_PREFS as DEFAULT_PREFS
} from "../lib/spelling/spelling-training-prefs.mjs";

import { BatchPicker, RangeSettingRow } from "./SpellingTrainingChrome.jsx";
import SpellingPersonalWrongDock from "./SpellingPersonalWrongDock.jsx";
import {
  formatPersonalWrongRepeatLabel,
  formatWrongTime,
  normalizePrefs,
  normalizeStoredPrefs,
  readCategoryPrefs,
  readDailyStats,
  readPersonalWrongBookRecords,
  readRangeSettingsExpanded,
  readSpellingPosition,
  readUxPrefs,
  resolvePersonalWrongNavigationWordId,
  writeCategoryPrefs,
  writeDailyStats,
  writePersonalWrongBookRecords,
  writeRangeSettingsExpanded,
  writeSpellingPosition,
  writeUxPrefs
} from "../lib/spelling/spelling-training-page-helpers.mjs";

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
  const [rangeSettingsExpanded, setRangeSettingsExpanded] = useState(false);
  const [turboMode, setTurboMode] = useState(false);
  const [autoNextOnCorrect, setAutoNextOnCorrect] = useState(true);
  const [listenOnlyMode, setListenOnlyMode] = useState(false);
  const [showMeaning, setShowMeaning] = useState(true);
  const [showExample, setShowExample] = useState(false);
  const [statsSidebarOpen, setStatsSidebarOpen] = useState(false);
  const [personalWrongPanelOpen, setPersonalWrongPanelOpen] = useState(false);
  const [aiToolsPanelOpen, setAiToolsPanelOpen] = useState(false);
  const [soundEffectsEnabled, setSoundEffectsEnabled] = useState(true);
  const [sessionStats, setSessionStats] = useState(() => createSpellingSessionStats());
  const [dailyStats, setDailyStats] = useState(() => createSpellingDailyStats({ date: "" }));
  const [dailyStatsHydrated, setDailyStatsHydrated] = useState(false);
  const [errorAnalysisVisible, setErrorAnalysisVisible] = useState(false);
  const [storedPrefs, setStoredPrefs] = useState(() => normalizeStoredPrefs({}, scope));
  const [prefsHydrated, setPrefsHydrated] = useState(false);
  const [actionNotice, setActionNotice] = useState("");
  const [personalWrongInput, setPersonalWrongInput] = useState("");
  const [personalWrongRecords, setPersonalWrongRecords] = useState(() => readPersonalWrongBookRecords());
  const [personalWrongHydrated, setPersonalWrongHydrated] = useState(false);
  const [idictationDataRevision, setIdictationDataRevision] = useState(0);
  const learningActivityRef = useRef(createLearningActivity());
  const sessionStatsRef = useRef(sessionStats);
  const spellingUndoStackRef = useRef([]);
  const restoredPositionBatchRef = useRef("");
  const restoringPositionRef = useRef(false);
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

  function resolveSpellingWordKey(word) {
    return getWordId(word) || String(word?.wordId || word?.id || "").trim();
  }

  function isWordNavBlocked(spellingState) {
    return spellingState.uiState === "inputting";
  }

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
    const uxPrefs = readUxPrefs(scope);
    setRangeSettingsExpanded(readRangeSettingsExpanded(scope));
    setTurboMode(Boolean(uxPrefs.turboMode));
    setAutoNextOnCorrect(uxPrefs.autoNextOnCorrect !== false);
    setListenOnlyMode(Boolean(uxPrefs.listenOnlyMode));
    setShowMeaning(uxPrefs.showMeaning !== false);
    setShowExample(uxPrefs.showExample === true);
    setStatsSidebarOpen(uxPrefs.statsSidebarOpen === true);
    setSoundEffectsEnabled(uxPrefs.soundEffectsEnabled !== false);
    setStoredPrefs(normalizeStoredPrefs(readCategoryPrefs(scope) || {}, scope));
    setPrefsHydrated(true);
  }, [scope]);

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

  useEffect(() => {
    if (!prefsHydrated) return;
    writeCategoryPrefs(scope, storedPrefs);
  }, [storedPrefs, scope, prefsHydrated]);

  useEffect(() => {
    if (!prefsHydrated) return;
    writeRangeSettingsExpanded(scope, rangeSettingsExpanded);
  }, [rangeSettingsExpanded, scope, prefsHydrated]);

  useEffect(() => {
    if (!prefsHydrated) return;
    writeUxPrefs(scope, {
      turboMode,
      autoNextOnCorrect,
      listenOnlyMode,
      showMeaning,
      showExample,
      statsSidebarOpen,
      soundEffectsEnabled
    });
  }, [scope, turboMode, autoNextOnCorrect, listenOnlyMode, showMeaning, showExample, statsSidebarOpen, soundEffectsEnabled, prefsHydrated]);

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
        if (!cancelled) setIdictationDataRevision((value) => value + 1);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [idictationSourceKey]);
  const errorBank = useSpellingErrorBank(lexiconEntries, { scope });
  const srsReview = useSpellingSrsReview(lexiconEntries, { scope, refreshKey: practiceSource });

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
    () => idictationSourceKey ? listIdictationGroupOptions(idictationSourceKey) : [],
    [idictationSourceKey, idictationDataRevision]
  );

  const idictationBatchSelection = useMemo(
    () => idictationSourceKey
      ? selectIdictationBatch(idictationSourceKey, idictationPrefs)
      : { entries: [], batchIndex: 0, batchCount: 1, batchEntryCount: 0, totalInCategory: 0 },
    [idictationSourceKey, idictationPrefs, idictationDataRevision]
  );

  const idictationBatchOptions = useMemo(
    () => idictationSourceKey
      ? listIdictationBatchOptions(idictationSourceKey, idictationBatchSelection.groupKey)
      : [],
    [idictationSourceKey, idictationBatchSelection.groupKey, idictationDataRevision]
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

  const difficultyCounts = categoryCounts.difficulty || new Map();
  const topicCounts = categoryCounts.topic || new Map();
  const ieltsUseCounts = categoryCounts.ielts_use || new Map();
  const listeningReadingCounts = categoryCounts.lr_high_frequency || new Map();

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
  }, [practiceSource, personalWrongScopedCount, personalWrongBatchSelection, personalWrongCurrentBatchLabel, personalWrongCurrentBatchWriteCount, personalWrongTotalWriteCount, errorBank.count, errorBankBatchSelection, srsReview.count, srsBatchSelection, idictationSource, idictationBatchSelection, batchSelection, unit]);

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
    [scope, practiceSource, scopeConfig.entryMode, categoryPrefs, personalWrongBatchIndex, errorBankBatchIndex, srsBatchIndex, activeBatchId, batchSelection.label, personalWrongSummary.total, errorBank.count, srsReview.count, idictationSource, idictationBatchSelection.uniqueWords]
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

  const captureNavEntry = useCallback(() => {
    const checkpoint = spelling.captureCheckpoint();
    const fallbackWordId = resolveSpellingWordKey(spelling.currentWord);
    const navigatorWordId = String(checkpoint?.navigator?.currentWordId || "").trim();
    const wordId = navigatorWordId || fallbackWordId;
    if (!checkpoint || !wordId) return null;

    return {
      checkpoint: {
        ...checkpoint,
        navigator: {
          ...(checkpoint.navigator || {}),
          currentWordId: wordId
        }
      },
      inputValue: spelling.inputValue || ""
    };
  }, [spelling]);

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
  }, [spelling, errorBank]);

  const handleToggleMeaning = useCallback(() => {
    learningActivityRef.current = recordLearningActivity(learningActivityRef.current);
    pushSpellingUndo({
      type: "toggle_meaning",
      label: showMeaning ? "隐藏释义" : "显示释义",
      before: showMeaning
    });
    setShowMeaning((open) => !open);
  }, [showMeaning]);

  const handleToggleExample = useCallback(() => {
    learningActivityRef.current = recordLearningActivity(learningActivityRef.current);
    pushSpellingUndo({
      type: "toggle_example",
      label: showExample ? "隐藏例句" : "显示例句",
      before: showExample
    });
    setShowExample((open) => !open);
  }, [showExample]);

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

  function patchStoredPrefs(patch) {
    setStoredPrefs((current) => normalizeStoredPrefs({ ...current, ...patch }, scope));
  }

  function patchCategoryPrefs(patch) {
    setStoredPrefs((current) => ({
      ...current,
      category: normalizePrefs({ ...current.category, ...patch }, scope)
    }));
  }

  function patchIdictationPrefs(sourceKey, patch) {
    if (!sourceKey) return;
    setStoredPrefs((current) => ({
      ...current,
      idictation: {
        ...(current.idictation || {}),
        [sourceKey]: normalizeIdictationPrefs(sourceKey, {
          ...(current.idictation?.[sourceKey] || {}),
          ...patch
        })
      }
    }));
  }

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
  const batchWordIds = useMemo(() => {
    const engineIds = spelling.ready && typeof spelling.getSessionWordIds === "function"
      ? spelling.getSessionWordIds()
      : [];
    if (Array.isArray(engineIds) && engineIds.length) {
      return engineIds.map((id) => String(id || "").trim()).filter(Boolean);
    }

    if (practiceSource === "personal_wrong_book" && spelling.ready) {
      return [];
    }

    const breakdownIds = candidateBreakdown?.sessionWordIds;
    if (Array.isArray(breakdownIds) && breakdownIds.length) {
      return breakdownIds.map((id) => String(id || "").trim()).filter(Boolean);
    }

    return spellingEntries.map((entry) => getWordId(entry)).filter(Boolean);
  }, [practiceSource, spelling.ready, spelling.getSessionWordIds, candidateBreakdown?.sessionWordIds, spellingEntries]);

  const personalWrongNavigationUnits = useMemo(() => {
    if (practiceSource !== "personal_wrong_book") return [];
    const units = batchProgress.personalWrongWordUnits || candidateBreakdown?.personalWrongWordUnits || [];
    return Array.isArray(units)
      ? units.filter((unit) => Array.isArray(unit?.writeWordIds) && unit.writeWordIds.length)
      : [];
  }, [practiceSource, batchProgress.personalWrongWordUnits, candidateBreakdown?.personalWrongWordUnits]);

  const batchNavigationWordIds = useMemo(() => {
    if (personalWrongNavigationUnits.length) {
      return personalWrongNavigationUnits
        .map((unit) => unit.writeWordIds[0])
        .map((id) => String(id || "").trim())
        .filter(Boolean);
    }
    return batchWordIds;
  }, [personalWrongNavigationUnits, batchWordIds]);

  const currentBatchIndex = useMemo(() => {
    if (!current || !batchNavigationWordIds.length) return -1;

    const key = resolveSpellingWordKey(current);
    if (personalWrongNavigationUnits.length) {
      return personalWrongNavigationUnits.findIndex((unit) => unit.writeWordIds.includes(key));
    }

    const byId = batchNavigationWordIds.indexOf(key);
    if (byId >= 0) return byId;

    const answer = normalizeSpellingAnswer(
      current.expectedAnswer || current.displayText || current.word || ""
    );
    return spellingEntries.findIndex((entry) => {
      const entryAnswer = normalizeSpellingAnswer(
        entry.expectedAnswer || entry.word || entry.displayText || ""
      );
      return entryAnswer === answer;
    });
  }, [current, batchNavigationWordIds, personalWrongNavigationUnits, spellingEntries]);

  const canBrowseBatchWords = batchNavigationWordIds.length > 1 && currentBatchIndex >= 0;

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

  const navigateToBatchWord = useCallback(async (targetIndex) => {
    if (!spelling.ready) return null;

    if (isWordNavBlocked(spelling)) {
      showActionNotice("请等待拼写判定完成");
      return null;
    }

    if (!batchNavigationWordIds.length || currentBatchIndex < 0) {
      showActionNotice("当前词不在本批次列表中");
      return null;
    }

    if (batchNavigationWordIds.length === 1) {
      showActionNotice("当前批次只有一个单词");
      return null;
    }

    const normalizedIndex = ((targetIndex % batchNavigationWordIds.length) + batchNavigationWordIds.length) % batchNavigationWordIds.length;
    if (normalizedIndex === currentBatchIndex) {
      showActionNotice("当前批次只有一个可切换单词");
      return null;
    }

    const targetWordId = batchNavigationWordIds[normalizedIndex]
      || getWordId(spellingEntries[normalizedIndex]);
    if (!targetWordId) {
      showActionNotice("无法定位目标单词");
      return null;
    }

    commitLearningActivity();
    const result = await spelling.navigateToWord(targetWordId);
    if (!result?.currentWord) {
      showActionNotice("切换单词失败");
      return null;
    }

    if (activeBatchId) {
      const currentWordId = resolveSpellingWordKey(result.currentWord) || targetWordId;
      const navigationWordId = practiceSource === "personal_wrong_book"
        ? resolvePersonalWrongNavigationWordId(currentWordId, personalWrongNavigationUnits)
        : currentWordId;
      writeSpellingPosition(scope, {
        activeBatchId,
        wordId: currentWordId,
        navigationWordId,
        currentBatchIndex: normalizedIndex,
        practiceSource,
        category: categoryPrefs,
        savedAt: Date.now()
      });
    }

    setErrorAnalysisVisible(false);
    const label = result.currentWord.displayText || result.currentWord.expectedAnswer || "单词";
    const resultBatchProgress = result.sessionProgress?.batchProgress || {};
    const noticeTotal = Number(resultBatchProgress.sessionTotal || sessionTotal || batchNavigationWordIds.length) || 0;
    const noticePosition = Math.max(
      1,
      Math.min(noticeTotal || 1, Number(resultBatchProgress.currentNumber || currentPosition || 1))
    );
    showActionNotice(`已切换到：${label}（${noticePosition}/${noticeTotal}）`);
    return result;
  }, [spelling, batchNavigationWordIds, spellingEntries, currentBatchIndex, commitLearningActivity, currentPosition, sessionTotal, activeBatchId, practiceSource, personalWrongNavigationUnits, scope, categoryPrefs]);

  const handleGoToPreviousWord = useCallback(async () => {
    if (currentBatchIndex < 0) {
      showActionNotice("当前词不在本批次列表中");
      return null;
    }
    return navigateToBatchWord(currentBatchIndex - 1);
  }, [currentBatchIndex, navigateToBatchWord]);

  const handleGoToNextWord = useCallback(async () => {
    if (currentBatchIndex < 0) {
      showActionNotice("当前词不在本批次列表中");
      return null;
    }
    return navigateToBatchWord(currentBatchIndex + 1);
  }, [currentBatchIndex, navigateToBatchWord]);

  useEffect(() => {
    restoredPositionBatchRef.current = "";
  }, [activeBatchId]);

  useEffect(() => {
    if (!spelling.ready || !activeBatchId || !batchNavigationWordIds.length || restoredPositionBatchRef.current === activeBatchId) return;

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
    spelling.navigateToWord(savedWordId).then((result) => {
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
  }, [spelling.ready, activeBatchId, batchNavigationWordIds, scope, current?.wordId, spelling.navigateToWord, practiceSource, personalWrongNavigationUnits]);

  useEffect(() => {
    if (!spelling.ready || !activeBatchId || restoredPositionBatchRef.current !== activeBatchId || restoringPositionRef.current || !current) return;
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
  }, [spelling.ready, activeBatchId, current?.wordId, currentBatchIndex, scope, practiceSource, categoryPrefs, personalWrongNavigationUnits]);

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
      void speech.playWord();
    }, 280);

    return () => window.clearTimeout(timer);
  }, [
    spelling.ready,
    spelling.uiState,
    current,
    listenOnlyMode,
    speech.playWord
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
  }, [speech]);

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
      void errorBank.refresh();
    }
    if (result?.answerMeta && practiceSource === "srs_review") {
      void srsReview.refresh();
    }
    return result;
  }, [current, spelling, errorBank.refresh, practiceSource, srsReview.refresh]);

  useEffect(() => {
    if (practiceSource === "srs_review" && spelling.uiState === "done_today") {
      srsReview.refresh();
    }
  }, [practiceSource, spelling.uiState, srsReview.refresh]);

  useEffect(() => {
    if (!spelling.ready) return;
    errorBank.refresh();
    srsReview.refresh();
  }, [spelling.ready, errorBank.refresh, srsReview.refresh]);

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
      {!lexicon && !loadError ? <p className="spelling-load-error spelling-load-error--inline">正在读取词库…</p> : null}

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

      <div className="spelling-page-layout">
        <section className="spelling-focus-card" aria-label="拼写训练主体">
          {isSpellingLoading ? (
            <div className="spelling-empty-state spelling-empty-state--hero">
              正在读取词库，请稍候…
            </div>
          ) : isBatchComplete && !current ? (
            <section className="spelling-completion-summary" aria-label="本批次学习结果">
              <p className="spelling-completion-summary__eyebrow">本批次已完成</p>
              <div className="spelling-completion-summary__rate">
                <strong>{batchSuccessRate}%</strong>
                <span>成功率</span>
              </div>
              <dl className="spelling-completion-summary__metrics">
                <div><dt>完成单词</dt><dd>{completedCount}</dd></div>
                <div><dt>本批错词</dt><dd>{batchWrongWordCount}</dd></div>
                <div><dt>今日学习</dt><dd>{dailyStats.learnedWordIds.length}</dd></div>
                <div><dt>有效学习</dt><dd>{formatActiveLearningTime(dailyStats.activeMs)}</dd></div>
                <div><dt>今日错词</dt><dd>{dailyStats.wrongWordIds.length}</dd></div>
              </dl>
              <button
                type="button"
                className="spelling-next-round-button"
                onClick={handleNextRound}
                disabled={!nextRoundTarget}
              >
                {nextRoundTarget ? "进入下一轮" : "今日范围已全部完成"}
              </button>
            </section>
          ) : current ? (
            <div className={`spelling-focus-stack${spelling.uiState === "correct_feedback" ? " is-correct-settling" : ""}`}>
              <section className={layoutStyles.spellingContentColumn} data-testid="spelling-content-column">
              {listenOnlyMode ? (
                <div className="spelling-listen-only-banner">纯听写模式：请根据发音拼写</div>
              ) : null}

              {!listenOnlyMode && (prompt.example || prompt.examplePendingReview) ? (
                prompt.examplePendingReview ? (
                  <p className="spelling-example-collapsed spelling-example-collapsed--hero">例句待补充</p>
                ) : showExample && exampleLine ? (
                  <div className={`spelling-example-panel spelling-example-panel--direct is-open ${layoutStyles.spellingWordTitle}`}>
                    <p className="spelling-example spelling-example--direct">{exampleLine}</p>
                    {prompt.exampleCn ? <p className="spelling-example-cn spelling-example-cn--direct">{prompt.exampleCn}</p> : null}
                  </div>
                ) : (
                  <p className="spelling-example-collapsed spelling-example-collapsed--hero">
                    例句（按 3 或 Space 展开并播放）
                  </p>
                )
              ) : null}

              <div className={layoutStyles.spellingInputArea}>
              <form onSubmit={submit} className="spelling-page-form spelling-page-form--hero spelling-page-form--line">
                <input
                  ref={trainingControls.inputRef}
                  data-testid="spelling-input"
                  className={`spelling-line-input${spelling.uiState === "correct_feedback" ? " spelling-line-input--correct" : ""}`}
                  value={spelling.inputValue}
                  onChange={handleInputChange}
                  onKeyDown={trainingControls.handleInputKeyDown}
                  onBlur={trainingControls.handleInputBlur}
                  readOnly={spelling.uiState === "correct_feedback" || spelling.uiState === "inputting"}
                  disabled={!current}
                  placeholder={
                    listenOnlyMode
                      ? "根据发音输入拼写"
                      : spelling.uiState === "wrong_feedback"
                        ? "请重新输入"
                        : spelling.uiState === "correct_feedback"
                          ? ""
                          : isPhrase
                            ? "输入完整词组"
                            : "输入英文拼写"
                  }
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  aria-label="拼写输入框"
                />
                <div className="spelling-form-actions" aria-hidden="true">
                  <button type="submit" tabIndex={-1} disabled={!current || !spelling.inputValue.trim() || spelling.uiState === "inputting"}>
                    提交
                  </button>
                  <button type="button" tabIndex={-1} disabled={!current || spelling.uiState === "inputting"} onClick={handleSkip}>
                    跳过
                  </button>
                  <button type="button" tabIndex={-1} disabled={!current} onClick={() => spelling.getHint()}>
                    提示
                  </button>
                </div>
              </form>
              </div>

              <div
                className={`${layoutStyles.spellingErrorMessage}${spelling.uiState === "wrong_feedback" ? ` ${layoutStyles.spellingErrorMessageVisible}` : ""}`}
                role="alert"
                aria-live="polite"
                aria-atomic="true"
                data-testid="spelling-error-message"
              >
                拼写错误，请重试
              </div>

              {errorAnalysisVisible ? (
                <div className={layoutStyles.spellingFeedbackWrap} data-testid="spelling-feedback-wrap">
                  <SpellingFeedbackPanel
                    diagnosis={spelling.lastDiagnosis}
                    expectedAnswer={current?.expectedAnswer || current?.displayText || ""}
                  />
                </div>
              ) : null}
              </section>

              {spelling.uiState !== "wrong_feedback" ? (
                <div className={`spelling-page-feedback spelling-page-feedback--compact ${spelling.uiState}${showEnginePreparing ? " is-preparing" : ""}`}>
                  {showEnginePreparing ? (
                    <span className="spelling-page-feedback__static">正在初始化拼写引擎…</span>
                  ) : (
                    <>
                      <strong>{spelling.statusText}</strong>
                      {spelling.hint ? <span>{spelling.hint}</span> : null}
                    </>
                  )}
                </div>
              ) : null}

              <div className="spelling-answer-reference">
                {!listenOnlyMode ? (
                  <span className={`spelling-hero-phonetic${prompt.phoneticMissing ? " is-missing" : ""}`}>
                    {prompt.phoneticPendingReview ? "音标待核验" : prompt.phonetic || "音标暂缺"}
                  </span>
                ) : null}
                {!listenOnlyMode && showMeaning ? (
                  <span className="spelling-answer-meaning">{prompt.typeLabel} · {prompt.meaning}</span>
                ) : (
                  <span className="spelling-answer-meaning spelling-prompt--hidden">中文释义已隐藏（按 2）</span>
                )}
                <span className="spelling-word-error-count" data-testid="spelling-total-wrong-count">
                  累计错 {spelling.totalWrongCount || 0} 次
                </span>
                <button
                  type="button"
                  className={`spelling-pronounce-btn spelling-pronounce-btn--reference${speech.playing === "word" ? " is-playing" : ""}`}
                  onClick={() => {
                    handleReplay();
                    trainingControls.focusInput({ force: true });
                  }}
                  disabled={!speech.canPlayWord || speech.playing === "word"}
                  aria-label={speech.wordAriaLabel}
                  title={speech.wordAriaLabel}
                >
                  <span className="spelling-pronounce-btn__icon" aria-hidden="true">🔊</span>
                </button>
              </div>

            </div>
          ) : (
            <div className="spelling-empty-state spelling-empty-state--hero">
              {practiceSource === "personal_wrong_book" && !(scope === "phrase" ? personalWrongSummary.phrase : personalWrongSummary.word)
                ? "做题错词本还是空的。先在右侧添加真题/练习里遇到的错词。"
                : practiceSource === "error_bank" && !errorBank.count
                ? "错词本还是空的。先去分类练习，拼错的词会自动出现在这里。"
                : practiceSource === "srs_review" && !srsReview.count
                  ? "当前没有到期的 SRS 复习内容。"
                : spelling.uiState === "done_today"
                  ? "当前范围的今日拼写已完成。"
                  : `暂时没有符合条件的${scopeConfig.label}拼写题。`}
            </div>
          )}

          {debugDetails ? (
            <details className="spelling-debug">
              <summary>拼写调试信息</summary>
              <pre>{JSON.stringify(debugDetails, null, 2)}</pre>
            </details>
          ) : null}

          <footer className="spelling-training-footer">
            <div className="spelling-progress spelling-progress--hero" aria-label="当前批次进度">
              <div className="spelling-progress-text">
                进度：{completedCount} / {sessionTotal || 0} {practiceSource === "personal_wrong_book" ? "词" : ""}
                <span className="spelling-progress-current">
                  {practiceSource === "personal_wrong_book"
                    ? (personalWrongUnitProgress ? ` · ${personalWrongUnitProgress.label}` : ` · 当前第 ${currentPosition || 0} 词`)
                    : ` · 当前第 ${currentPosition || 0} 题`}
                </span>
              </div>
              <div className="spelling-progress-track" aria-hidden="true">
                <div className="spelling-progress-fill" style={{ width: `${progressBarPercent}%` }} />
              </div>
            </div>

            <div className="spelling-word-nav-group">
              <button
                type="button"
                className="spelling-undo-btn spelling-word-nav-btn"
                disabled={!current || !canBrowseBatchWords || isWordNavBlocked(spelling)}
                onClick={() => { void handleGoToPreviousWord(); }}
                title="上一个单词（快捷键：Ctrl+←）"
              >
                上一个
              </button>
              <button
                type="button"
                className="spelling-undo-btn spelling-word-nav-btn"
                disabled={!current || !canBrowseBatchWords || isWordNavBlocked(spelling)}
                onClick={() => { void handleGoToNextWord(); }}
                title="下一个单词（快捷键：Ctrl+→）"
              >
                下一个
              </button>
            </div>

            <p className="spelling-shortcuts spelling-shortcuts--hero" aria-label="键盘快捷键">
              <span className="spelling-shortcut-items">
                <span><b>1</b> 重播</span>
                <span><b>2</b> 释义</span>
                <span><b>3</b> 例句</span>
                <span><b>4</b> 熟悉</span>
                <span><b>5</b> 重点复习</span>
                <button
                  type="button"
                  className="spelling-undo-btn"
                  onClick={() => { void undoLastSpellingAction(); }}
                  title="撤回刚才操作（快捷键：Ctrl+Z）"
                >
                  Ctrl+Z 撤回
                </button>
              </span>
              <span className="spelling-shortcut-items spelling-shortcut-items--secondary">
                {autoNextOnCorrect
                  ? "Ctrl+← → 切词 · 拼对自动下一词 · Tab 单词 · Space 例句 · Enter 提交 · Ctrl+Enter 跳过"
                  : "Ctrl+← → 切词 · Tab 单词 · Space 例句 · Enter 提交/下一词 · Ctrl+Enter 跳过"}
              </span>
            </p>
            <p
              className={`spelling-action-notice${actionNotice ? "" : " is-empty"}`}
              role="status"
              aria-live="polite"
            >
              {actionNotice || "\u00A0"}
            </p>
          </footer>
        </section>

        <aside className={`spelling-stats-sidebar${statsSidebarOpen ? " is-open" : ""}`} aria-label="统计与设置">
          <section className="spelling-sidebar-block" aria-label="今日统计">
            <h2 className="spelling-sidebar-block__title">今日统计</h2>
            <dl className="spelling-sidebar-stats spelling-sidebar-stats--daily">
              <div><dt>学习单词</dt><dd>{dailyStats.learnedWordIds.length}</dd></div>
              <div><dt>有效学习</dt><dd>{formatActiveLearningTime(dailyStats.activeMs)}</dd></div>
              <div><dt>错词数量</dt><dd>{dailyStats.wrongWordIds.length}</dd></div>
            </dl>
          </section>

          <section className="spelling-sidebar-block" aria-label="训练统计">
            <h2 className="spelling-sidebar-block__title">训练统计</h2>
            <dl className="spelling-sidebar-stats">
              <div><dt>正确率</dt><dd>{sessionMetrics.accuracy}%</dd></div>
              <div><dt>速度</dt><dd>{sessionMetrics.wordsPerMinute} {unit}/分</dd></div>
              <div><dt>预计</dt><dd>{sessionMetrics.etaMinutes ? `约 ${sessionMetrics.etaMinutes} 分钟` : "—"}</dd></div>
              <div><dt>连对</dt><dd>{sessionMetrics.consecutiveCorrect}</dd></div>
              <div><dt>SRS 到期</dt><dd>{progress.todaySrsDueCount ?? 0}</dd></div>
              <div><dt>候选池</dt><dd>{candidateTotal}</dd></div>
              <div><dt>原始批次</dt><dd>{rawBatchTotal}</dd></div>
              <div><dt>错词本</dt><dd>{errorBank.count}</dd></div>
              <div><dt>新词通过</dt><dd>{progress.newWordsPassed ?? 0}</dd></div>
              <div><dt>掌握</dt><dd>{progress.masteredCount ?? completedCount}</dd></div>
              <div><dt>剩余</dt><dd>{remainingCount}{unit}</dd></div>
            </dl>
          </section>

          <section className="spelling-sidebar-block spelling-page-controls" aria-label="学习范围">
        <div className="spelling-range-bar">
          <div className="spelling-range-bar__head">
            <span className="spelling-range-bar__title">学习范围</span>
            <button
              type="button"
              className="spelling-range-expand"
              aria-expanded={rangeSettingsExpanded}
              onMouseDown={trainingControls.markSettingsInteraction}
              onClick={() => setRangeSettingsExpanded((open) => !open)}
            >
              {rangeSettingsExpanded ? "收起设置" : "展开设置"}
            </button>
          </div>

          {rangeSettingsExpanded ? (
          <div className="spelling-range-bar__toolbar compact-summary">
            <div className="spelling-range-bar__group">
              <span className="spelling-control-label">来源</span>
              <div className="spelling-mode-tabs spelling-mode-tabs--compact">
                {availablePracticeSources.map((entry) => (
                  <button
                    key={entry.value}
                    type="button"
                    className={practiceSource === entry.value ? "active" : ""}
                    onClick={() => patchStoredPrefs({ practiceSource: entry.value })}
                  >
                    {entry.label}
                    {entry.value === "personal_wrong_book" ? (
                      <span className="spelling-tab-count">{scope === "phrase" ? personalWrongSummary.phrase : personalWrongSummary.word}</span>
                    ) : entry.value === "error_bank" ? (
                      <span className="spelling-tab-count">{errorBank.count}</span>
                    ) : entry.value === "srs_review" ? (
                      <span className="spelling-tab-count">{srsReview.count}</span>
                    ) : isIdictationPracticeSource(entry.value) ? (
                      <span className="spelling-tab-count">{getIdictationSource(entry.sourceKey)?.uniqueWords || 0}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            {practiceSource === "personal_wrong_book" && showPersonalWrongGroupSelect ? (
              <div className="spelling-range-bar__group spelling-range-bar__group--batch-select">
                <span className="spelling-control-label">组别</span>
                <BatchPicker
                  value={personalWrongBatchSelection.batchIndex}
                  options={personalWrongBatchOptions}
                  ariaLabel="做题错词组别选择"
                  onInteract={trainingControls.markSettingsInteraction}
                  onChange={handlePersonalWrongBatchChange}
                />
              </div>
            ) : null}

            <label className="spelling-toggle spelling-toggle--compact">
              <input
                type="checkbox"
                checked={includeFamiliar}
                onChange={(event) => setIncludeFamiliar(event.target.checked)}
                onMouseDown={trainingControls.markSettingsInteraction}
              />
              包含刷词已熟悉内容
            </label>

            <label className="spelling-toggle spelling-toggle--compact">
              <input
                type="checkbox"
                checked={autoNextOnCorrect}
                onChange={(event) => setAutoNextOnCorrect(event.target.checked)}
                onMouseDown={trainingControls.markSettingsInteraction}
              />
              拼对自动下一词
            </label>

            <label className="spelling-toggle spelling-toggle--compact">
              <input
                type="checkbox"
                checked={turboMode}
                onChange={(event) => setTurboMode(event.target.checked)}
                onMouseDown={trainingControls.markSettingsInteraction}
              />
              极速模式（缩短拼对停留，仍有延迟）
            </label>

            <label className="spelling-toggle spelling-toggle--compact">
              <input
                type="checkbox"
                checked={listenOnlyMode}
                onChange={(event) => setListenOnlyMode(event.target.checked)}
                onMouseDown={trainingControls.markSettingsInteraction}
              />
              纯听写模式
            </label>

            <label className="spelling-toggle spelling-toggle--compact">
              <input
                type="checkbox"
                checked={soundEffectsEnabled}
                onChange={(event) => setSoundEffectsEnabled(event.target.checked)}
                onMouseDown={trainingControls.markSettingsInteraction}
              />
              答对/答错音效
            </label>
          </div>
          ) : null}

          <div className="spelling-range-summary">
            <p className="spelling-range-summary__line">
              <span className="spelling-range-summary__label">当前范围</span>
              <span className="spelling-range-summary__text">{activeRangeLine}</span>
            </p>
            {spelling.ready ? (
              <p className="spelling-range-summary__line spelling-range-summary__line--session">
                <span className="spelling-range-summary__label">本次训练</span>
                <span className="spelling-range-summary__text">{sessionTrainingLine.replace(/^本次训练：/, "")}</span>
              </p>
            ) : null}
          </div>

          <div className={`spelling-range-settings${rangeSettingsExpanded ? " is-open" : ""}`}>
            {practiceSource === "category" ? (
              <div className="spelling-range-settings__block">
                <p className="spelling-range-settings__title">{scopeConfig.label}范围</p>
                <RangeSettingRow label="分类">
                  <div className="spelling-mode-tabs spelling-mode-tabs--compact spelling-mode-tabs--wrap">
                    {categoryTypes.map((entry) => (
                      <button
                        key={entry.value}
                        type="button"
                        className={categoryPrefs.categoryType === entry.value ? "active" : ""}
                        onClick={() => patchCategoryPrefs({
                          categoryType: entry.value,
                          categoryValue: entry.value === "difficulty"
                            ? DEFAULT_PREFS.categoryValue
                            : entry.value === "topic"
                              ? SPELLING_TOPIC_OPTIONS[0]
                              : entry.value === "ielts_use"
                                ? SPELLING_IELTS_USE_OPTIONS[0].value
                                : entry.value === "lr_high_frequency"
                                  ? SPELLING_LISTENING_READING_OPTIONS[0].value
                                : "",
                          batchIndex: 0
                        })}
                      >
                        {entry.label.replace("分类", "").replace("全部短语", "全部")}
                      </button>
                    ))}
                  </div>
                </RangeSettingRow>

                {categoryPrefs.categoryType === "difficulty" ? (
                  <RangeSettingRow label="难度">
                    <div className="spelling-mode-tabs spelling-mode-tabs--compact spelling-mode-tabs--wrap">
                      {SPELLING_DIFFICULTY_OPTIONS.map((entry) => (
                        <button
                          key={entry.value}
                          type="button"
                          className={categoryPrefs.categoryValue === entry.value ? "active" : ""}
                          onClick={() => patchCategoryPrefs({ categoryValue: entry.value, batchIndex: 0 })}
                        >
                          {entry.label}
                          <span className="spelling-tab-count">{difficultyCounts.get(entry.value) || 0}</span>
                        </button>
                      ))}
                    </div>
                  </RangeSettingRow>
                ) : null}

                {categoryPrefs.categoryType === "topic" ? (
                  <RangeSettingRow label="主题">
                    <div className="spelling-mode-tabs spelling-mode-tabs--compact spelling-mode-tabs--wrap">
                      {SPELLING_TOPIC_OPTIONS.map((topic) => (
                        <button
                          key={topic}
                          type="button"
                          className={categoryPrefs.categoryValue === topic ? "active" : ""}
                          onClick={() => patchCategoryPrefs({ categoryValue: topic, batchIndex: 0 })}
                        >
                          {topic}
                          <span className="spelling-tab-count">{topicCounts.get(topic) || 0}</span>
                        </button>
                      ))}
                    </div>
                  </RangeSettingRow>
                ) : null}

                {categoryPrefs.categoryType === "lr_high_frequency" ? (
                  <RangeSettingRow label="训练重点">
                    <div className="spelling-mode-tabs spelling-mode-tabs--compact spelling-mode-tabs--wrap">
                      {SPELLING_LISTENING_READING_OPTIONS.map((entry) => (
                        <button
                          key={entry.value}
                          type="button"
                          className={categoryPrefs.categoryValue === entry.value ? "active" : ""}
                          onClick={() => patchCategoryPrefs({ categoryValue: entry.value, batchIndex: 0 })}
                        >
                          {entry.label}
                          <span className="spelling-tab-count">{listeningReadingCounts.get(entry.value) || 0}</span>
                        </button>
                      ))}
                    </div>
                  </RangeSettingRow>
                ) : null}

                {isPhrase && categoryPrefs.categoryType === "ielts_use" ? (
                  <RangeSettingRow label="场景">
                    <div className="spelling-mode-tabs spelling-mode-tabs--compact spelling-mode-tabs--wrap">
                      {SPELLING_IELTS_USE_OPTIONS.map((entry) => (
                        <button
                          key={entry.value}
                          type="button"
                          className={categoryPrefs.categoryValue === entry.value ? "active" : ""}
                          onClick={() => patchCategoryPrefs({ categoryValue: entry.value, batchIndex: 0 })}
                        >
                          {entry.label}
                          <span className="spelling-tab-count">{ieltsUseCounts.get(entry.value) || 0}</span>
                        </button>
                      ))}
                    </div>
                  </RangeSettingRow>
                ) : null}

                {batchOptions.length > 1 ? (
                  <RangeSettingRow label="批次">
                    <BatchPicker
                      value={batchSelection.batchIndex}
                      options={batchOptions}
                      onInteract={trainingControls.markSettingsInteraction}
                      onChange={(batchIndex) => patchCategoryPrefs({ batchIndex })}
                    />
                  </RangeSettingRow>
                ) : null}
              </div>
            ) : isIdictationPracticeSource(practiceSource) ? (
              <div className="spelling-range-settings__block">
                <p className="spelling-range-settings__title">
                  {idictationSource?.label || "爱听写"}原表章节
                </p>
                <p className="spelling-category-summary">
                  原始 {idictationBatchSelection.rawRows || 0} 行 · 去重 {idictationBatchSelection.uniqueWords || 0} 词 · 按 Excel 章节分组练习
                </p>
                <RangeSettingRow label="章节">
                  <div className="spelling-mode-tabs spelling-mode-tabs--compact spelling-mode-tabs--wrap">
                    {idictationGroupOptions.map((entry) => (
                      <button
                        key={entry.value}
                        type="button"
                        className={idictationBatchSelection.groupKey === entry.value ? "active" : ""}
                        onClick={() => patchIdictationPrefs(idictationSourceKey, { groupKey: entry.value, batchIndex: 0 })}
                      >
                        {entry.label}
                      </button>
                    ))}
                  </div>
                </RangeSettingRow>
                {idictationBatchOptions.length > 1 ? (
                  <RangeSettingRow label="组别">
                    <BatchPicker
                      value={idictationBatchSelection.batchIndex}
                      options={idictationBatchOptions}
                      ariaLabel={`${idictationSource?.label || "爱听写"}组别选择`}
                      onInteract={trainingControls.markSettingsInteraction}
                      onChange={(batchIndex) => patchIdictationPrefs(idictationSourceKey, { batchIndex })}
                    />
                  </RangeSettingRow>
                ) : null}
              </div>
            ) : (
              <div className="spelling-range-settings__block">
                <p className="spelling-range-settings__title">
                  {scopeConfig.label}{practiceSource === "personal_wrong_book" ? " 做题错词练习" : practiceSource === "srs_review" ? " SRS 复习" : "错词本练习"}
                </p>
                <p className="spelling-category-summary">
                  共 {practiceSource === "personal_wrong_book" ? (scope === "phrase" ? personalWrongSummary.phrase : personalWrongSummary.word) : practiceSource === "srs_review" ? srsReview.count : errorBank.count} 条
                </p>
                {practiceSource === "personal_wrong_book" && showPersonalWrongGroupSelect ? (
                  <RangeSettingRow label="组别">
                    <BatchPicker
                      value={personalWrongBatchSelection.batchIndex}
                      options={personalWrongBatchOptions}
                      ariaLabel="做题错词组别选择"
                      onInteract={trainingControls.markSettingsInteraction}
                      onChange={handlePersonalWrongBatchChange}
                    />
                  </RangeSettingRow>
                ) : (practiceSource === "personal_wrong_book" ? personalWrongBatchOptions : practiceSource === "srs_review" ? srsBatchOptions : errorBankBatchOptions).length > 1 ? (
                  <RangeSettingRow label="批次">
                    <BatchPicker
                      value={practiceSource === "srs_review" ? srsBatchSelection.batchIndex : errorBankBatchSelection.batchIndex}
                      options={practiceSource === "srs_review" ? srsBatchOptions : errorBankBatchOptions}
                      onInteract={trainingControls.markSettingsInteraction}
                      onChange={(batchIndex) => patchStoredPrefs(practiceSource === "srs_review"
                        ? { srsBatchIndex: batchIndex }
                        : { errorBankBatchIndex: batchIndex })}
                    />
                  </RangeSettingRow>
                ) : null}
              </div>
            )}
          </div>
        </div>

          {false ? (
          <section className="spelling-sidebar-block spelling-personal-wrong-panel" aria-label="做题错词本">
            <h2 className="spelling-sidebar-block__title">做题错词本</h2>
            <p className="spelling-export-panel__hint">
              用来记录真题/练习里的错词；只有原形的词练 {PERSONAL_WRONG_BOOK_BASE_REPS} 遍，原形+复数词练 {PERSONAL_WRONG_BOOK_REPETITIONS} 遍。
            </p>
            <textarea
              className="spelling-personal-wrong-input"
              value={personalWrongInput}
              onChange={(event) => setPersonalWrongInput(event.target.value)}
              onMouseDown={trainingControls.markSettingsInteraction}
              placeholder={`一行一个：\naccommodation | 住宿\nvacancy -> vacancies | 职位空缺\ncity +ies\non the other hand | 另一方面`}
              rows={4}
            />
            <div className="spelling-export-panel__actions">
              <button
                type="button"
                className="spelling-export-btn spelling-export-btn--primary"
                onMouseDown={trainingControls.markSettingsInteraction}
                onClick={handleAddPersonalWrongWords}
              >
                加入做题错词本
              </button>
              <button
                type="button"
                className="spelling-export-btn"
                disabled={!(scope === "phrase" ? personalWrongSummary.phrase : personalWrongSummary.word)}
                onMouseDown={trainingControls.markSettingsInteraction}
                onClick={handleClearPersonalWrongBook}
              >
                清空当前错词
              </button>
            </div>
            <p className="spelling-export-panel__meta">
              错词本总计：{personalWrongScopedCount} {unit} · 当前{personalWrongCurrentBatchLabel}：{personalWrongBatchSelection.batchEntryCount} {unit} · 本组练习 {personalWrongCurrentBatchWriteCount} 遍 · 全部练习 {personalWrongTotalWriteCount} 遍
            </p>
            {personalWrongCurrentBatchRecords.length ? (
              <ul className="spelling-personal-wrong-list">
                {personalWrongCurrentBatchRecords.map((record, index) => {
                  const linked = personalWrongSourceEntries.some((entry) => entry.personalWrong?.recordId === record.id && entry.personalWrong.linkedToLexicon);
                  const sequence = (personalWrongBatchSelection.batchIndex * PERSONAL_WRONG_BOOK_BATCH_SIZE) + index + 1;
                  return (
                    <li key={record.id} className={linked ? "is-linked" : "is-local"}>
                      <div className="spelling-personal-wrong-list__top">
                        <span className="spelling-personal-wrong-list__index">{sequence}</span>
                        <strong>{formatPersonalWrongUnitLabel(record)}</strong>
                        <button
                          type="button"
                          className="spelling-personal-wrong-list__delete"
                          onMouseDown={trainingControls.markSettingsInteraction}
                          onClick={() => handleDeletePersonalWrongRecord(record)}
                          title="从做题错词本删除"
                        >
                          删除
                        </button>
                      </div>
                      <span>{record.meaning || (linked ? "已匹配总词库" : "本地补充")}</span>
                      <em>{formatPersonalWrongRepeatLabel(record)}</em>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
          ) : null}

          <section className="spelling-sidebar-block spelling-export-panel" aria-label="导出">
            <h2 className="spelling-sidebar-block__title">导出</h2>
            <p className="spelling-export-panel__hint">
              可导出完整词库、当前批次，或当前所选分类的完整词表。
            </p>
            <div className="spelling-export-panel__actions">
              <button
                type="button"
                className="spelling-export-btn spelling-export-btn--primary"
                data-testid="spelling-export-combined-sidebar"
                disabled={!lexicon}
                onMouseDown={trainingControls.markSettingsInteraction}
                onClick={handleExportCombinedLexicon}
              >
                一键导出单词+词组
              </button>
              <button
                type="button"
                className="spelling-export-btn"
                disabled={!lexicon}
                onMouseDown={trainingControls.markSettingsInteraction}
                onClick={handleExportScopeLexicon}
              >
                导出全部{scopeConfig.label}
              </button>
              <button
                type="button"
                className="spelling-export-btn"
                data-testid="spelling-export-current-batch"
                disabled={!spellingEntries.length}
                onMouseDown={trainingControls.markSettingsInteraction}
                onClick={() => handleExportCurrentBatch("json")}
              >
                导出当前批次 JSON
              </button>
              <button
                type="button"
                className="spelling-export-btn"
                disabled={!spellingEntries.length}
                onMouseDown={trainingControls.markSettingsInteraction}
                onClick={() => handleExportCurrentBatch("txt")}
              >
                导出当前批次 TXT
              </button>
              {practiceSource === "category" ? (
                <>
                  <button
                    type="button"
                    className="spelling-export-btn"
                    data-testid="spelling-export-current-category-json"
                    disabled={!currentCategoryEntries.length}
                    onMouseDown={trainingControls.markSettingsInteraction}
                    onClick={() => handleExportCurrentCategory("json")}
                  >
                    导出当前分类全部 JSON
                  </button>
                  <button
                    type="button"
                    className="spelling-export-btn"
                    data-testid="spelling-export-current-category-txt"
                    disabled={!currentCategoryEntries.length}
                    onMouseDown={trainingControls.markSettingsInteraction}
                    onClick={() => handleExportCurrentCategory("txt")}
                  >
                    导出当前分类全部 TXT
                  </button>
                </>
              ) : null}
            </div>
            <p className="spelling-export-panel__meta">
              词库：{lexicon?.counts?.headwords || 0} 词 · {lexicon?.counts?.phrases || 0} 组
              {spellingEntries.length ? ` · 当前批次 ${spellingEntries.length} 条` : ""}
              {practiceSource === "category" && currentCategoryEntries.length
                ? ` · 当前分类：${batchSelection.label} ${currentCategoryEntries.length} 条`
                : ""}
            </p>
          </section>

        <details className="spelling-error-bank-panel spelling-aux-panel">
          <summary>
            {scopeConfig.label}错词本
            <span className="spelling-tab-count">{errorBank.count}</span>
            {errorBank.totalWrongAttempts ? (
              <span className="spelling-tab-count">累计错 {errorBank.totalWrongAttempts}</span>
            ) : null}
          </summary>
          {errorBank.loading ? (
            <p className="spelling-error-bank-empty">正在加载错词本…</p>
          ) : errorBank.count ? (
            <VirtualList
              className="spelling-error-bank-list spelling-error-bank-list--virtual"
              items={errorBank.items}
              itemHeight={96}
              height={280}
              resetKey={`${scope}:error-bank:${errorBank.count}:${errorBank.totalWrongAttempts || 0}`}
              getKey={(item) => item.errorBank?.dedupeKey || item.wordId}
              renderItem={(item) => (
                <div className={`spelling-error-bank-item severity-${item.errorBank?.severity || "low"}`}>
                  <div className="spelling-error-bank-item__main">
                    <strong>{item.expectedAnswer || item.word}</strong>
                    <span>{item.meaning || "—"}</span>
                  </div>
                  <div className="spelling-error-bank-item__meta">
                    <span>{formatErrorBankSeverity(item.errorBank?.severity)}</span>
                    <span>错 {item.errorBank?.totalWrongCount || 0} 次</span>
                    <span>最近：{formatWrongTime(item.errorBank?.latestWrongAt)}</span>
                    {item.errorBank?.lastWrongAnswer ? (
                      <span className="spelling-error-bank-item__wrong">误填：{item.errorBank.lastWrongAnswer}</span>
                    ) : null}
                  </div>
                </div>
              )}
            />
          ) : (
            <p className="spelling-error-bank-empty">还没有错词。拼写错误后会自动收录到本页专用错词本。</p>
          )}
        </details>

          <details className="spelling-srs-info spelling-sidebar-block">
            <summary>艾宾浩斯 SRS · 到期 {srsReview.count}</summary>
            <p>
              {scopeConfig.label}独立 SRS，复习间隔 <strong>{srsIntervalText}</strong> 天。
            </p>
            {srsReview.count ? (
              <ul className="spelling-error-bank-list">
                {srsReview.items.slice(0, 10).map((item) => (
                  <li key={item.wordId} className="spelling-error-bank-item">
                    <div className="spelling-error-bank-item__main">
                      <strong>{item.expectedAnswer || item.word}</strong>
                      <span>{item.meaning || "—"}</span>
                    </div>
                    <div className="spelling-error-bank-item__meta">
                      <span>SRS 第 {item.srs?.stage || 1} 阶段</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </details>
          </section>
        </aside>
      </div>
    </main>
  );
}
