"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SatelliteLexiconFlashcard from "../components/SatelliteLexiconFlashcard";
import StableLoadingState from "../components/StableLoadingState";
import { useOrderedStudyRows } from "../hooks/useOrderedStudyRows.js";
import {
  LAYER_META,
  invalidateReadingGVocabCache,
  loadReadingGParaphrases,
  loadReadingGVocab,
  normalizeReadingGItem,
  normalizeReadingGKey
} from "../lib/reading-g-vocab/load-reading-g.mjs";
import { migrateReadingGProgress } from "../lib/reading-g-vocab/migration.mjs";
import {
  isReadingGContentComplete,
  isReadingGContentIncomplete
} from "../lib/reading-g-vocab/content-completeness.mjs";
import { countStageUniques } from "../lib/reading-g-vocab/stages.mjs";
import {
  DEFAULT_SESSION_MODE,
  PARA_SESSION_SIZE,
  markParaphraseGroupSeen,
  shuffleRemainingParaphraseCycle,
  takeNextParaphraseSession
} from "../lib/reading-g-vocab/paraphrase-cycle.mjs";
import { buildParaphraseMcq, getQuizEligibleGroups } from "../lib/reading-g-vocab/paraphrase-quiz.mjs";
import {
  PARA_DIRECTION,
  PARA_SELF_RATING,
  canMarkParaphraseFamiliar,
  chooseRecallDirection,
  getLegalQuizDirections,
  getParaphraseReviewEntry,
  getParaphraseReviewPriorities,
  markParaphrasePreviewCompleted,
  recordParaphraseQuizResult,
  recordParaphraseRecall
} from "../lib/reading-g-vocab/paraphrase-review.mjs";
import {
  PARA_LEARNING_STAGE,
  advanceParaphraseSession,
  appendParaphraseSessionResult,
  createParaphraseSession,
  hasPendingParaphraseReinsert,
  restartParaphraseSession,
  scheduleParaphraseReinsert,
  summarizeParaphraseSession
} from "../lib/reading-g-vocab/paraphrase-session.mjs";
import {
  RG_LEARN_MODE,
  RG_LEARNING_ENTRIES,
  RG_STATUS,
  buildRgStudyList,
  clearRgParaphraseSession,
  countParaphraseStatus,
  countStatusByMode,
  filterKey,
  getEntryProgressKey,
  getParaphraseStatus,
  getRgFilterLabel,
  getRgStatus,
  isRgFavorite,
  patchParaphraseStatus,
  patchRgStatus,
  readRgDailyCount,
  readRgParaCoverage,
  readRgParaphraseReview,
  readRgParaphraseSession,
  readRgParaphraseStatusMap,
  readRgPositions,
  readRgSession,
  readRgStatusMap,
  resolveLearnMode,
  writeRgDailyCount,
  writeRgParaCoverage,
  writeRgParaphraseReview,
  writeRgParaphraseSession,
  writeRgParaphraseStatusMap,
  writeRgPositions,
  writeRgSession,
  writeRgStatusMap
} from "../lib/reading-g-vocab/storage.mjs";
import {
  fetchSpeechAudioResult,
  preloadSpeechAudioUrl
} from "../lib/vocab-speech.mjs";
import { DELETE_CURRENT_WORD_EVENT } from "../lib/vocab/delete-current-word-request.mjs";
import { shouldHandleStudyDeleteShortcut } from "../lib/vocab/study-keyboard-shortcuts.mjs";
import {
  advanceStudyQueueAfterDelete,
  advanceStudyQueueAfterExit,
  resolveCurrentStudyEntryId
} from "../lib/vocab/study-queue-delete.mjs";
import { wordStudyIndexAtPosition } from "../lib/vocab/word-study-position.mjs";
import {
  playSpeechAudio,
  resolveSpeechPlaybackOptions
} from "../lib/speech-audio-playback.mjs";

const DEFAULT_FILTER = { type: "pathStage", value: "1" };
const AI_COMPLETION_BATCH_SIZE = 10;

function isPendingAiCompletionEntry(entry) {
  return (
    entry?.primaryLayer === "questionBankPending" &&
    entry?.studyMode === "reference" &&
    (entry.qualityFlags || []).includes("missing_master_lexicon")
  );
}

function prioritizeCurrentAiTarget(entries, currentId) {
  const current = entries.find((entry) => entry.id === currentId);
  return current
    ? [current, ...entries.filter((entry) => entry.id !== current.id)]
    : entries;
}

export default function ReadingGVocabPage() {
  const [phase, setPhase] = useState("loading");
  const [items, setItems] = useState([]);
  const [paraphraseGroups, setParaphraseGroups] = useState([]);
  const [meta, setMeta] = useState({
    version: "",
    count: 0,
    wordCount: 0,
    phraseCount: 0,
    activeCount: 0,
    referenceCount: 0
  });
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  /** Stable focus for the card on screen — navigation/delete use this, not raw items index. */
  const [currentEntryId, setCurrentEntryId] = useState("");
  const [filter, setFilter] = useState(DEFAULT_FILTER);
  const [statusMap, setStatusMap] = useState({});
  const [paraStatusMap, setParaStatusMap] = useState({});
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [aiRunning, setAiRunning] = useState(false);
  const [aiAutoRunning, setAiAutoRunning] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  /**
   * When non-null, this freezes the visible study queue for rapid deletes so we do
   * NOT re-run easy→hard ordering (~60ms+) on every keypress. Cleared on filter/order change.
   */
  const [studyQueueOverride, setStudyQueueOverride] = useState(null);
  /** Session-long soft deletes so clearing the freeze does not revive removed cards. */
  const deletedIdsRef = useRef(new Set());
  /** Authoritative freeze queue for rapid D/Delete — not overwritten by stale renders. */
  const frozenStudyQueueRef = useRef(null);
  const [dailyCount, setDailyCount] = useState(0);
  const [migrationInfo, setMigrationInfo] = useState(null);

  // paraphrase quiz state
  const [quizQueue, setQuizQueue] = useState([]);
  const [quizPos, setQuizPos] = useState(0);
  const [quizRevealed, setQuizRevealed] = useState(false);
  const [quizSelected, setQuizSelected] = useState(null);
  const [quizSessionMode, setQuizSessionMode] = useState(DEFAULT_SESSION_MODE);
  const [paraCoverage, setParaCoverage] = useState(null);
  const [quizPoolSize, setQuizPoolSize] = useState(0);
  const [quizCumulative, setQuizCumulative] = useState(0);
  const [paraReview, setParaReview] = useState({ version: 1, groups: {}, updatedAt: 0 });
  const [paraSession, setParaSession] = useState(null);
  const [resumeOffer, setResumeOffer] = useState(null);
  const [recallRevealed, setRecallRevealed] = useState(false);

  const audioRef = useRef(null);
  const loadAttempted = useRef(false);
  const storageReadyRef = useRef(false);
  const positionsRef = useRef({});
  const restoredRef = useRef(false);
  const deleteLockRef = useRef(false);
  /** Always-current snapshot for rapid D/Delete (avoids stale closure). */
  const liveDeleteRef = useRef({
    items: [],
    index: 0,
    currentEntryId: "",
    studyList: [],
    filter: DEFAULT_FILTER,
    phase: "loading",
    isQuizMode: false,
    aiRunning: false,
    isStudyEmpty: true
  });
  /** Ids waiting for a batched disk write (merged while the user keeps deleting). */
  const pendingPersistIdsRef = useRef(new Set());
  /** Removed entry snapshots for restore if a batch flush fails. */
  const pendingPersistEntriesRef = useRef(new Map());
  const persistTimerRef = useRef(0);
  const persistInFlightRef = useRef(false);
  const aiAutoStopRef = useRef(false);

  const isQuizMode = filter.type === "paraphraseQuiz";
  const learnMode = useMemo(() => {
    if (isQuizMode) return RG_LEARN_MODE.PARAPHRASE;
    if (filter.type === "learnMode" && filter.value === "phrase") return RG_LEARN_MODE.PHRASE;
    if (filter.type === "learnMode" && filter.value === "meaning") return RG_LEARN_MODE.MEANING;
    if (filter.type === "entryType" && filter.value === "phrase") return RG_LEARN_MODE.PHRASE;
    return RG_LEARN_MODE.MEANING;
  }, [filter, isQuizMode]);

  useEffect(() => {
    if (loadAttempted.current) return;
    loadAttempted.current = true;
    let cancelled = false;

    async function load() {
      try {
        const [loaded, para] = await Promise.all([
          loadReadingGVocab(),
          loadReadingGParaphrases().catch(() => ({ groups: [], count: 0 }))
        ]);
        if (cancelled) return;

        if (!loaded.items.length) {
          setError("G类阅读提升词库为空。请确认 public/data/reading-g-vocab.json 存在。");
          setPhase("error");
          return;
        }

        const mig = migrateReadingGProgress(loaded.items);
        setMigrationInfo(mig);

        const savedStatus = readRgStatusMap();
        const savedPositions = mig.v3?.migrated ? {} : readRgPositions();
        const savedSession = mig.v3?.migrated ? null : readRgSession();
        const savedDaily = mig.v3?.migrated ? 0 : readRgDailyCount();
        const savedPara = readRgParaphraseStatusMap();
        const savedReview = readRgParaphraseReview();
        const savedParaSession = readRgParaphraseSession();
        const shouldResumeParaphraseOnLoad =
          Boolean(savedParaSession) && savedSession?.filter?.type === "paraphraseQuiz";

        positionsRef.current = savedPositions || {};
        setStatusMap(savedStatus);
        setParaStatusMap(savedPara);
        setParaReview(savedReview);
        if (savedParaSession) {
          setResumeOffer(savedParaSession);
          const resumeMode = savedParaSession.mode === "wrongReview" ? "guided" : savedParaSession.mode;
          setQuizSessionMode(resumeMode);
          if (shouldResumeParaphraseOnLoad) {
            setFilter({ type: "paraphraseQuiz", value: "", sessionMode: resumeMode });
          }
        }
        setDailyCount(savedDaily);
        setItems(loaded.items);
        setParaphraseGroups(para.groups || []);
        setMeta({
          version: loaded.version,
          count: loaded.count || loaded.items.length,
          wordCount: loaded.wordCount || 0,
          phraseCount: loaded.phraseCount || 0,
          activeCount: loaded.activeCount || 0,
          referenceCount: loaded.referenceCount || 0
        });

        const savedCoverage = readRgParaCoverage();
        setParaCoverage(savedCoverage);
        const eligible = getQuizEligibleGroups(para.groups || []);
        setQuizPoolSize(eligible.length);
        setQuizCumulative(
          (savedCoverage.seenGroupIds || []).filter((id) =>
            eligible.some((g) => g.groupId === id)
          ).length
        );
        // do not build 80-cap queue at load; first open of quiz mode builds a 10-round session

        setPhase("ready");
        storageReadyRef.current = true;

        if (mig.migrated && (mig.matched || mig.v4?.matchedCount)) {
          setToast(
            `进度已迁移（匹配 ${mig.v4?.matchedCount ?? mig.matched ?? 0}，歧义 ${mig.ambiguousCount || 0}）`
          );
        }

        // Restore study filter + word position. Soft-delete sessions may point at a
        // removed id — fall back to per-filter position, then first study row.
        const sessionIsQuiz = shouldResumeParaphraseOnLoad;
        const restoreFilter =
          !sessionIsQuiz
          && savedSession?.filter
          && typeof savedSession.filter === "object"
          && savedSession.filter.type
            ? savedSession.filter
            : DEFAULT_FILTER;
        if (!sessionIsQuiz && restoreFilter !== DEFAULT_FILTER) {
          const sameDefault =
            restoreFilter.type === DEFAULT_FILTER.type
            && String(restoreFilter.value || "") === String(DEFAULT_FILTER.value || "");
          if (!sameDefault) setFilter(restoreFilter);
        }
        const restoreKey =
          (!sessionIsQuiz && savedSession?.wordKey) ||
          positionsRef.current[filterKey(restoreFilter)] ||
          "";
        if (!sessionIsQuiz) {
          let found = -1;
          if (restoreKey) {
            found = loaded.items.findIndex(
              (row) =>
                getEntryProgressKey(row) === restoreKey ||
                normalizeReadingGKey(row.word) === restoreKey
            );
          }
          if (found < 0) {
            const restoreMode = resolveLearnMode(undefined, null, restoreFilter);
            const fallbackList = buildRgStudyList(
              loaded.items,
              restoreFilter,
              savedStatus,
              restoreMode
            );
            found = fallbackList[0]?.originalIndex ?? -1;
          }
          if (found >= 0) {
            setIndex(found);
            setCurrentEntryId(String(loaded.items[found]?.id || "").trim());
          }
        }
        restoredRef.current = true;
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "G类阅读提升词库加载失败");
          setPhase("error");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  const highQuizParas = useMemo(
    () => getQuizEligibleGroups(paraphraseGroups),
    [paraphraseGroups]
  );
  const verifiedParas = useMemo(
    () => paraphraseGroups.filter((group) => group?.confidence === "high" && group?.sourceType !== "network" && group?.anchor && group?.members?.length),
    [paraphraseGroups]
  );

  const baseStudyList = useMemo(() => {
    if (isQuizMode) return [];
    let list;
    if (filter.type === "paraphrase") {
      const keys = new Set();
      list = [];
      for (const g of verifiedParas) {
        const surfaces = [g.anchor, ...(g.members || [])];
        for (const s of surfaces) {
          const nk = normalizeReadingGKey(s);
          if (!nk || keys.has(nk)) continue;
          keys.add(nk);
          const originalIndex = items.findIndex(
            (it) => normalizeReadingGKey(it.word) === nk || it.normalizedKey === nk
          );
          if (originalIndex >= 0) {
            list.push({ entry: items[originalIndex], originalIndex, group: g });
          }
        }
      }
    } else {
      list = buildRgStudyList(items, filter, statusMap, learnMode);
    }
    if (!deletedIdsRef.current.size) return list;
    return list.filter((row) => row?.entry?.id && !deletedIdsRef.current.has(row.entry.id));
  }, [items, filter, statusMap, verifiedParas, isQuizMode, learnMode, studyQueueOverride]);
  const wordOrdering = useOrderedStudyRows({
    orderKey: `reading-g:${filterKey(filter)}:${learnMode}`,
    rows: baseStudyList,
    pool: items,
    currentIndex: index,
    // While a delete burst freezes the queue, skip expensive reorder work.
    enabled: !isQuizMode && !studyQueueOverride && !frozenStudyQueueRef.current
  });
  // Prefer the freeze ref (sync for rapid deletes) then React state override.
  // Note: empty array is truthy — freeze path always stores null when empty.
  const studyList = frozenStudyQueueRef.current || studyQueueOverride || wordOrdering.rows;

  const activeEntryId = useMemo(
    () => resolveCurrentStudyEntryId({
      focusEntryId: currentEntryId,
      studyList,
      items,
      index
    }),
    [currentEntryId, studyList, items, index]
  );

  const currentStudyPosition = useMemo(() => {
    if (!activeEntryId) return -1;
    return studyList.findIndex((row) => String(row?.entry?.id || "").trim() === activeEntryId);
  }, [studyList, activeEntryId]);
  const safeStudyPosition = isQuizMode
    ? Math.min(quizPos, Math.max(0, (paraSession?.baseGroupCount || quizQueue.length || 1) - 1))
    : currentStudyPosition >= 0
      ? currentStudyPosition
      : 0;
  const isStudyEmpty = isQuizMode ? quizQueue.length === 0 : studyList.length === 0;
  const studyCount = isQuizMode
    ? paraSession?.baseGroupCount || PARA_SESSION_SIZE[quizSessionMode] || 10
    : studyList.length;
  const quizQuestion = isQuizMode ? quizQueue[quizPos] || null : null;
  const currentQuizGroup = useMemo(
    () => paraphraseGroups.find((group) => group.groupId === quizQuestion?.groupId) || null,
    [paraphraseGroups, quizQuestion?.groupId]
  );

  const item = useMemo(() => {
    if (isQuizMode) {
      return {
        word: quizQuestion?.stem || "同义替换",
        phonetic: "",
        pos: "",
        meaning: quizRevealed ? quizQuestion?.correct || "" : "选择最接近的替换",
        example: "",
        exampleCn: "",
        definition: "",
        entryType: "word",
        domain: "",
        layers: [],
        senses: []
      };
    }
    if (isStudyEmpty) {
      return {
        word: phase === "loading" ? "正在读取 G类阅读提升词库" : "完成",
        phonetic: "",
        pos: "",
        meaning: phase === "loading" ? "请稍候" : "当前范围没有待学内容",
        example: "",
        exampleCn: "",
        definition: "",
        entryType: "word",
        domain: "",
        layers: [],
        senses: []
      };
    }
    // Card content always follows the focused entry id inside the active study queue.
    // Never fall back to studyList[0] — that is the classic "delete jumps to first word" bug.
    if (activeEntryId) {
      const focused =
        studyList.find((row) => String(row?.entry?.id || "").trim() === activeEntryId)?.entry
        || items.find((entry) => String(entry?.id || "").trim() === activeEntryId)
        || null;
      if (focused) return focused;
    }
    const byIndex = studyList.find((row) => row.originalIndex === index)?.entry;
    return byIndex || items[index] || {};
  }, [isQuizMode, quizQuestion, quizRevealed, isStudyEmpty, phase, items, index, studyList, activeEntryId]);

  const relatedParas = useMemo(() => {
    if (!item?.word || isQuizMode) return [];
    const nk = normalizeReadingGKey(item.word);
    return verifiedParas.filter((g) => {
      const all = [g.anchor, ...(g.members || [])].map(normalizeReadingGKey);
      return all.includes(nk);
    });
  }, [item?.word, verifiedParas, isQuizMode]);

  const questionBankCompleteCount = useMemo(
    () => items.filter((entry) => (
      entry.primaryLayer === "questionBankActive" && isReadingGContentComplete(entry)
    )).length,
    [items]
  );
  const incompleteContentEntries = useMemo(
    () => items.filter(isReadingGContentIncomplete),
    [items]
  );
  const questionBankAiCompletedCount = useMemo(
    () => items.filter((entry) => entry.primaryLayer === "questionBankAiCompleted").length,
    [items]
  );
  const pendingAiEntries = useMemo(
    () => items.filter(isPendingAiCompletionEntry),
    [items]
  );

  const prevItem = isQuizMode
    ? null
    : studyList.length
      ? studyList[(safeStudyPosition - 1 + studyList.length) % studyList.length]?.entry
      : null;
  const nextItem = isQuizMode
    ? null
    : studyList.length
      ? studyList[(safeStudyPosition + 1) % studyList.length]?.entry
      : null;

  const progressPercent = studyCount
    ? Math.max(1, ((safeStudyPosition + 1) / studyCount) * 100)
    : 0;

  const modeForItem = resolveLearnMode(learnMode, item, filter);
  const itemStatus = isQuizMode
    ? (() => {
        const code = getParaphraseStatus(quizQuestion?.groupId, paraStatusMap);
        if (code === "familiar") return RG_STATUS.FAMILIAR;
        if (code === "unfamiliar") return RG_STATUS.UNFAMILIAR;
        return RG_STATUS.PENDING;
      })()
    : getRgStatus(item, statusMap, modeForItem);

  const statusCounts = useMemo(() => {
    const c = countStatusByMode(items, statusMap);
    const p = countParaphraseStatus(paraStatusMap);
    return {
      meaningFamiliar: c.meaningFamiliar,
      phraseFamiliar: c.phraseFamiliar,
      paraphraseFamiliar: p.familiar
    };
  }, [items, statusMap, paraStatusMap]);

  const familiarCount = statusCounts.meaningFamiliar;

  const stageTotals = useMemo(() => countStageUniques(items), [items]);

  const learningEntryGroups = useMemo(() => {
    return RG_LEARNING_ENTRIES.map((group) => ({
      ...group,
      items: group.items.map((entry) => {
        const count =
          entry.filter.type === "paraphrase"
            ? verifiedParas.length
            : entry.filter.type === "paraphraseQuiz"
              ? highQuizParas.length
              : buildRgStudyList(items, entry.filter, statusMap, learnMode).length;
        const stageTotal = entry.filter.type === "pathStage"
          ? stageTotals[`stage${entry.filter.value}`]
          : null;
        return {
          ...entry,
          count,
          countLabel: Number.isInteger(stageTotal)
            ? entry.filter.value === "4" || stageTotal === count
              ? `范围 ${stageTotal.toLocaleString()} 个`
              : `范围 ${stageTotal.toLocaleString()} · 当前待学 ${count.toLocaleString()} 个`
            : undefined
        };
      })
    }));
  }, [items, statusMap, highQuizParas, verifiedParas, learnMode, stageTotals]);

  const libraryRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .map((entry, originalIndex) => ({ entry, originalIndex }))
      .filter(({ entry }) => {
        if (!q) return true;
        return (
          String(entry.word || "").toLowerCase().includes(q) ||
          String(entry.meaning || "").toLowerCase().includes(q)
        );
      });
  }, [items, search]);

  const persistSession = useCallback(
    (nextIndex, nextFilter = filter, entryOverride = null) => {
      if (!storageReadyRef.current || !restoredRef.current) return;
      if (nextFilter.type === "paraphraseQuiz") {
        writeRgSession({
          wordKey: `quiz:${quizPos}`,
          filter: nextFilter,
          index: nextIndex,
          quizPos,
          savedAt: new Date().toISOString()
        });
        return;
      }
      // Prefer explicit entry (delete path) so soft-deleted queue freezes still save the right word.
      const row =
        entryOverride ||
        items[nextIndex] ||
        (Array.isArray(studyQueueOverride)
          ? studyQueueOverride.find((r) => r?.originalIndex === nextIndex)?.entry
          : null);
      if (!row || (row.id && deletedIdsRef.current.has(row.id))) return;
      const key = getEntryProgressKey(row) || normalizeReadingGKey(row.word);
      if (!key) return;
      positionsRef.current[filterKey(nextFilter)] = key;
      writeRgPositions(positionsRef.current);
      writeRgSession({
        wordKey: key,
        filter: nextFilter,
        index: nextIndex,
        savedAt: new Date().toISOString()
      });
    },
    [filter, items, quizPos, studyQueueOverride]
  );

  const studyIndices = useMemo(
    () => studyList.map((row) => row.originalIndex),
    [studyList]
  );

  const focusStudyRow = useCallback((row, nextFilter = filter) => {
    if (!row?.entry) return;
    const id = String(row.entry.id || "").trim();
    let originalIndex = Number.isInteger(row.originalIndex) ? row.originalIndex : -1;
    if (originalIndex < 0 && id) {
      originalIndex = items.findIndex((entry) => String(entry?.id || "").trim() === id);
    }
    if (id) setCurrentEntryId(id);
    if (originalIndex >= 0) setIndex(originalIndex);
    if (originalIndex >= 0) persistSession(originalIndex, nextFilter, row.entry);
  }, [filter, items, persistSession]);

  useEffect(() => {
    if (
      phase !== "ready" ||
      isQuizMode ||
      !storageReadyRef.current ||
      !restoredRef.current ||
      frozenStudyQueueRef.current ||
      studyQueueOverride
    ) {
      return;
    }
    if (!studyList.length) {
      if (currentEntryId) setCurrentEntryId("");
      return;
    }

    const focusedId = String(currentEntryId || "").trim();
    if (
      focusedId &&
      studyList.some((row) => String(row?.entry?.id || "").trim() === focusedId)
    ) {
      return;
    }

    const cursorRow = Number.isInteger(wordOrdering.cursorIndex)
      ? studyList.find((row) => row.originalIndex === wordOrdering.cursorIndex)
      : null;
    const indexRow = Number.isInteger(index)
      ? studyList.find((row) => row.originalIndex === index)
      : null;
    const row = cursorRow || indexRow || studyList[0] || null;
    if (row?.entry) focusStudyRow(row);
  }, [
    currentEntryId,
    focusStudyRow,
    index,
    isQuizMode,
    phase,
    studyList,
    studyQueueOverride,
    wordOrdering.cursorIndex
  ]);

  const freezeStudyQueueRows = useCallback((rows) => {
    const nextRows = Array.isArray(rows) && rows.length ? rows : null;
    frozenStudyQueueRef.current = nextRows;
    setStudyQueueOverride(nextRows);
  }, []);

  const clearStudyQueueFreeze = useCallback(() => {
    freezeStudyQueueRows(null);
  }, [freezeStudyQueueRows]);

  const seekStudyPosition = useCallback((position) => {
    if (isQuizMode) return;
    const targetIndex = wordStudyIndexAtPosition(studyIndices, position);
    if (!Number.isInteger(targetIndex)) return;
    const row = studyList.find((r) => r.originalIndex === targetIndex)
      || studyList[position - 1]
      || null;
    if (row) focusStudyRow(row);
    else {
      setIndex(targetIndex);
      persistSession(targetIndex);
    }
  }, [isQuizMode, persistSession, studyIndices, studyList, focusStudyRow]);
  const getStudyPositionPreview = useCallback(
    (position) => studyList[position - 1]?.entry?.word || "",
    [studyList]
  );

  const changeWordOrderMode = useCallback((nextMode) => {
    // Drop delete freeze so the new ordering can take over.
    clearStudyQueueFreeze();
    const nextIndex = wordOrdering.changeMode(nextMode);
    if (!Number.isInteger(nextIndex)) return;
    const row = { originalIndex: nextIndex, entry: items[nextIndex] };
    focusStudyRow(row);
  }, [clearStudyQueueFreeze, focusStudyRow, items, wordOrdering]);
  const changeWordDifficultyMode = useCallback((nextMode) => {
    clearStudyQueueFreeze();
    const nextIndex = wordOrdering.changeDifficultyMode(nextMode);
    if (!Number.isInteger(nextIndex)) return;
    const row = { originalIndex: nextIndex, entry: items[nextIndex] };
    focusStudyRow(row);
  }, [clearStudyQueueFreeze, focusStudyRow, items, wordOrdering]);

  const speakText = useCallback(async (text, kind = "word") => {
    const value = String(text || "").trim();
    if (!value || value === "完成" || value.startsWith("正在读取")) return;

    try {
      const result = await fetchSpeechAudioResult(value, kind);
      const options = resolveSpeechPlaybackOptions(result, kind);
      const playback = await playSpeechAudio(result?.url || "", options);
      if (playback?.audio) audioRef.current = playback.audio;
      if (!playback?.played && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(value);
        utterance.lang = "en-US";
        utterance.rate = 0.88;
        window.speechSynthesis.speak(utterance);
      }
    } catch {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(value);
        utterance.lang = "en-US";
        utterance.rate = 0.88;
        window.speechSynthesis.speak(utterance);
      } else {
        setToast("发音暂不可用");
      }
    }
  }, []);

  useEffect(() => {
    if (phase !== "ready" || isStudyEmpty || !item?.word || isQuizMode) return;
    const kind = item.entryType === "phrase" || /\s/.test(item.word) ? "phrase" : "word";
    preloadSpeechAudioUrl(item.word, kind).catch(() => {});
    if (item.example) preloadSpeechAudioUrl(item.example, "sentence").catch(() => {});
    if (nextItem?.word) {
      const nextKind = nextItem.entryType === "phrase" || /\s/.test(nextItem.word) ? "phrase" : "word";
      preloadSpeechAudioUrl(nextItem.word, nextKind).catch(() => {});
    }
    if (nextItem?.example) preloadSpeechAudioUrl(nextItem.example, "sentence").catch(() => {});
  }, [phase, isStudyEmpty, item?.word, item?.example, item?.entryType, nextItem?.word, nextItem?.example, nextItem?.entryType, isQuizMode]);

  function buildQuestionsForSession(groupIds) {
    const byId = new Map(highQuizParas.map((group) => [group.groupId, group]));
    return (groupIds || []).map((groupId) => {
      const group = byId.get(groupId);
      if (!group) return null;
      const legalDirections = getLegalQuizDirections(group);
      return buildParaphraseMcq(group, highQuizParas, Math.random, [], legalDirections[0]);
    }).filter(Boolean);
  }

  function applyParaphraseSession(nextSession, questions = null) {
    if (!nextSession) return;
    const nextQuestions = questions || buildQuestionsForSession(nextSession.currentSessionGroupIds);
    if (nextSession.currentQuestion && nextQuestions[nextSession.currentIndex]) {
      nextQuestions[nextSession.currentIndex] = nextSession.currentQuestion;
    }
    setParaSession(nextSession);
    setQuizSessionMode(nextSession.mode === "wrongReview" ? "guided" : nextSession.mode);
    setQuizQueue(nextQuestions);
    setQuizPos(nextSession.currentIndex || 0);
    setQuizRevealed(nextSession.currentLearningStage === PARA_LEARNING_STAGE.FEEDBACK);
    setQuizSelected(nextSession.selectedIndex ?? null);
    setRecallRevealed(false);
    writeRgParaphraseSession(nextSession);
  }

  function loadQuizSession(mode = quizSessionMode, coverageOverride = null) {
    const sessionMode = mode || DEFAULT_SESSION_MODE;
    const sessionSize = PARA_SESSION_SIZE[sessionMode] || PARA_SESSION_SIZE.guided;
    const cov = coverageOverride || paraCoverage || readRgParaCoverage();
    const batch = takeNextParaphraseSession(paraphraseGroups, paraStatusMap, cov, {
      sessionMode,
      sessionSize,
      reviewState: paraReview
    });
    const session = createParaphraseSession(batch, sessionMode);
    applyParaphraseSession(session, batch.questions || []);
    setParaCoverage(batch.coverage);
    writeRgParaCoverage(batch.coverage);
    setQuizPoolSize(batch.poolSize || highQuizParas.length);
    setQuizCumulative((batch.coverage.seenGroupIds || []).filter((id) => highQuizParas.some((group) => group.groupId === id)).length);
    setResumeOffer(null);
    return batch;
  }

  function continueSavedParaphraseSession(restart = false) {
    const saved = resumeOffer || readRgParaphraseSession();
    if (!saved) {
      loadQuizSession(DEFAULT_SESSION_MODE);
      return;
    }
    const next = restart ? restartParaphraseSession(saved) : saved;
    setFilter({ type: "paraphraseQuiz", value: "", sessionMode: next.mode === "wrongReview" ? "guided" : next.mode });
    applyParaphraseSession(next);
    setResumeOffer(null);
  }

  function persistParaphraseLearning(nextSession, nextReview = paraReview, nextCoverage = paraCoverage) {
    if (nextSession) {
      setParaSession(nextSession);
      writeRgParaphraseSession(nextSession);
    }
    if (nextReview) {
      setParaReview(nextReview);
      writeRgParaphraseReview(nextReview);
    }
    if (nextCoverage) {
      setParaCoverage(nextCoverage);
      writeRgParaCoverage(nextCoverage);
    }
  }

  useEffect(() => {
    if (!isQuizMode || resumeOffer || !quizQuestion?.groupId || !paraCoverage || paraSession?.currentLearningStage === PARA_LEARNING_STAGE.SUMMARY) return;
    const eligibleIds = highQuizParas.map((group) => group.groupId);
    if ((paraCoverage.seenGroupIds || []).includes(quizQuestion.groupId)) return;
    const nextCoverage = markParaphraseGroupSeen(paraCoverage, quizQuestion.groupId, eligibleIds);
    setParaCoverage(nextCoverage);
    writeRgParaCoverage(nextCoverage);
    setQuizCumulative(nextCoverage.seenGroupIds.filter((id) => eligibleIds.includes(id)).length);
  }, [isQuizMode, resumeOffer, quizQuestion?.groupId, paraCoverage, paraSession?.currentLearningStage, highQuizParas]);

  function goToStudyOffset(delta) {
    if (isQuizMode) {
      if (delta > 0 && paraSession?.currentLearningStage === PARA_LEARNING_STAGE.FEEDBACK) handleQuizNext();
      return;
    }
    if (!studyList.length) return;
    // Prefer stable id — never fall back to queue head (that feels like a random jump).
    const currentId = activeEntryId || item?.id || items[index]?.id || "";
    let pos = studyList.findIndex((row) => String(row?.entry?.id || "").trim() === String(currentId || "").trim());
    if (pos < 0) {
      pos = studyList.findIndex((row) => row.originalIndex === index);
    }
    if (pos < 0) {
      pos = Math.min(Math.max(0, safeStudyPosition), studyList.length - 1);
    }
    const nextPos = (pos + delta + studyList.length) % studyList.length;
    focusStudyRow(studyList[nextPos]);
  }

  function setLibraryFilter(nextFilter) {
    setFilter(nextFilter);
    setQuizRevealed(false);
    setQuizSelected(null);

    if (nextFilter.type === "reference" || nextFilter.type === "pathStage" && nextFilter.value === "4") {
      setToast("参考层：只查阅，不纳入默认日常待学");
    }
    if (nextFilter.type === "paraphraseQuiz") {
      const mode = nextFilter.sessionMode || DEFAULT_SESSION_MODE;
      const size = PARA_SESSION_SIZE[mode] || PARA_SESSION_SIZE.guided;
      const batch = loadQuizSession(mode);
      setToast(
        `同义替换训练 · 安全题库 ${batch.poolSize || highQuizParas.length} 组 · 本轮 ${size} 题`
      );
      persistSession(0, nextFilter);
      return;
    }
    if (nextFilter.type === "paraphrase") {
      setToast("高可信同义关系浏览：网络列表不自动出题");
    }

    const mode = resolveLearnMode(undefined, null, nextFilter);
    const rebuilt =
      nextFilter.type === "paraphrase"
        ? (() => {
            const keys = new Set();
            const out = [];
            for (const g of verifiedParas) {
              for (const s of [g.anchor, ...(g.members || [])]) {
                const nk = normalizeReadingGKey(s);
                if (!nk || keys.has(nk)) continue;
                keys.add(nk);
                const originalIndex = items.findIndex(
                  (it) => normalizeReadingGKey(it.word) === nk
                );
                if (originalIndex >= 0) out.push({ originalIndex });
              }
            }
            return out;
          })()
        : buildRgStudyList(items, nextFilter, statusMap, mode);

    const savedKey = positionsRef.current[filterKey(nextFilter)];
    let nextIndex = rebuilt[0]?.originalIndex ?? 0;
    if (savedKey) {
      const found = rebuilt.find((row) => {
        const it = items[row.originalIndex];
        return (
          getEntryProgressKey(it) === savedKey ||
          normalizeReadingGKey(it?.word) === savedKey
        );
      });
      if (found) nextIndex = found.originalIndex;
    }
    clearStudyQueueFreeze();
    const nextRow = {
      originalIndex: nextIndex,
      entry: items[nextIndex] || null
    };
    if (nextRow.entry) focusStudyRow(nextRow, nextFilter);
    else {
      setIndex(nextIndex);
      setCurrentEntryId(String(items[nextIndex]?.id || "").trim());
      persistSession(nextIndex, nextFilter);
    }
    setToast((t) =>
      nextFilter.type === "reference" ||
      nextFilter.type === "paraphrase" ||
      nextFilter.type === "paraphraseQuiz"
        ? t
        : `已切换：${getRgFilterLabel(nextFilter)}`
    );
  }

  function applyAiCompletionResult(result, sourceItems) {
    const updatedById = new Map(
      (result.updatedEntries || []).map((entry, entryIndex) => [
        entry.id,
        normalizeReadingGItem(entry, entryIndex)
      ])
    );
    const nextItems = sourceItems.map((entry) => updatedById.get(entry.id) || entry);
    invalidateReadingGVocabCache();
    setItems(nextItems);
    if (result.totals) {
      setMeta((current) => ({
        ...current,
        count: result.totals.count,
        wordCount: result.totals.wordCount,
        phraseCount: result.totals.phraseCount,
        activeCount: result.totals.activeCount,
        referenceCount: result.totals.referenceCount
      }));
    }

    const nextPendingIndex = nextItems.findIndex(isPendingAiCompletionEntry);
    setFilter({ type: "primaryLayer", value: "questionBankPending" });
    const aiIndex = nextPendingIndex >= 0 ? nextPendingIndex : 0;
    setIndex(aiIndex);
    setCurrentEntryId(String(nextItems[aiIndex]?.id || "").trim());
    return nextItems;
  }

  async function requestAiCompletionBatch(targets, sourceItems) {
    setAiMessage(`正在补全：${targets.map((entry) => entry.word).join("、")}`);
    const response = await fetch("/api/reading-g/complete-pending", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryIds: targets.map((entry) => entry.id) })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      throw new Error(result.error || result.detail || "G类待补词AI补全失败");
    }
    return {
      result,
      nextItems: applyAiCompletionResult(result, sourceItems)
    };
  }

  function stopAutoAiCompletion() {
    aiAutoStopRef.current = true;
    const message = "已请求停止：当前批完成后不再继续自动补全";
    setAiMessage(message);
    setToast(message);
  }

  async function runPendingAiCompletion({ currentOnly = false, autoAll = false } = {}) {
    if (aiRunning) return;
    const prioritizedPending = prioritizeCurrentAiTarget(pendingAiEntries, item?.id);
    const currentPending = prioritizedPending.find((entry) => entry.id === item?.id);
    const targets = autoAll
      ? prioritizedPending
      : currentOnly
      ? (currentPending ? [currentPending] : [])
      : prioritizedPending.slice(0, AI_COMPLETION_BATCH_SIZE);

    if (!targets.length) {
      setToast(currentOnly ? "当前词不是待补词，请先点击“待补词”" : "没有需要AI补全的G类待补词");
      return;
    }

    const confirmed = autoAll
      ? window.confirm(
          `准备自动补全全部 ${targets.length} 个G类待补词，预计 ${Math.ceil(targets.length / AI_COMPLETION_BATCH_SIZE)} 批，每批最多 ${AI_COMPLETION_BATCH_SIZE} 词、1次请求、顺序执行不并发。\n\n` +
          "只写回G类阅读词库，不修改总词库和学习进度。缓存命中不调用付费模型；未命中会调用 DeepSeek，可能产生费用。开始后可点“停止自动补全”，当前批完成后不再继续；失败词本轮不自动重试。\n\n确定继续吗？"
        )
      : window.confirm(
          `准备补全 ${targets.length} 个G类待补词：${targets.map((entry) => entry.word).join("、")}\n\n` +
          "只写回G类阅读词库，不修改总词库和学习进度。缓存未命中时会调用 DeepSeek API，可能产生费用；本批最多发起1次请求，不自动重试。\n\n确定继续吗？"
        );
    if (!confirmed) return;

    try {
      setAiRunning(true);
      setAiAutoRunning(autoAll);
      aiAutoStopRef.current = false;

      let workingItems = items;
      let remainingTargets = targets;
      let completedTotal = 0;
      let cacheHitTotal = 0;
      let deepseekTotal = 0;
      let failedTotal = 0;
      let lastPendingCount = pendingAiEntries.length;
      const attemptedIds = new Set();
      const plannedTotal = targets.length;
      let batchNumber = 0;

      do {
        const batch = remainingTargets.slice(0, AI_COMPLETION_BATCH_SIZE);
        batchNumber += 1;
        batch.forEach((entry) => attemptedIds.add(entry.id));
        if (autoAll) {
          setAiMessage(
            `自动补全第 ${batchNumber} 批：${batch.map((entry) => entry.word).join("、")}（已完成 ${completedTotal}/${plannedTotal}）`
          );
        }

        const { result, nextItems } = await requestAiCompletionBatch(batch, workingItems);
        workingItems = nextItems;
        const stats = result.stats || {};
        completedTotal += Number(stats.completed) || 0;
        cacheHitTotal += Number(stats.cacheHit) || 0;
        deepseekTotal += Number(stats.deepseek) || 0;
        failedTotal += Number(stats.failed) || 0;
        lastPendingCount =
          result.totals?.pendingCount ??
          items.filter(isPendingAiCompletionEntry).length - completedTotal;

        if (!autoAll) break;
        remainingTargets = prioritizeCurrentAiTarget(
          workingItems.filter(isPendingAiCompletionEntry),
          item?.id
        ).filter((entry) => !attemptedIds.has(entry.id));
      } while (autoAll && remainingTargets.length && !aiAutoStopRef.current);

      const stopped = autoAll && aiAutoStopRef.current;
      const message = autoAll
        ? `${stopped ? "自动补全已停止" : "自动补全完成"}：完成 ${completedTotal}/${plannedTotal}，缓存 ${cacheHitTotal}，DeepSeek ${deepseekTotal}，失败/跳过 ${failedTotal}，仍待补 ${lastPendingCount}`
        : `AI补全完成 ${completedTotal} 个：缓存 ${cacheHitTotal}，DeepSeek ${deepseekTotal}，仍待补 ${lastPendingCount}`;
      setAiMessage(message);
      setToast(message);
    } catch (error) {
      const message = error?.message || "G类待补词AI补全失败";
      setAiMessage(message);
      setToast(message);
    } finally {
      aiAutoStopRef.current = false;
      setAiAutoRunning(false);
      setAiRunning(false);
    }
  }

  function markStatus(status) {
    if (isQuizMode) {
      if (!quizQuestion?.groupId) return;
      const legalDirections = getLegalQuizDirections(currentQuizGroup);
      const reviewEntry = getParaphraseReviewEntry(paraReview, quizQuestion.groupId);
      const pending = hasPendingParaphraseReinsert(paraSession, quizQuestion.groupId);
      if (status === RG_STATUS.FAMILIAR && !canMarkParaphraseFamiliar(reviewEntry, legalDirections, pending)) {
        setToast("需完成预览、主动回忆和安全方向验证后才能掌握");
        return;
      }
      const nextCode = status === RG_STATUS.FAMILIAR ? "familiar" : "unfamiliar";
      const next = patchParaphraseStatus(paraStatusMap, quizQuestion.groupId, nextCode);
      setParaStatusMap(next);
      writeRgParaphraseStatusMap(next);
      setToast(nextCode === "familiar" ? "已完成掌握条件" : "已标记未掌握，历史记录保留");
      return;
    }

    if (isStudyEmpty || !item?.word) return;
    const mode = resolveLearnMode(learnMode, item, filter);
    const current = getRgStatus(item, statusMap, mode);
    const nextStatus =
      status === RG_STATUS.UNFAMILIAR && current === RG_STATUS.UNFAMILIAR
        ? RG_STATUS.PENDING
        : status;
    const nextMap = patchRgStatus(statusMap, item, { status: nextStatus }, mode);
    setStatusMap(nextMap);
    writeRgStatusMap(nextMap);

    if (nextStatus === RG_STATUS.FAMILIAR || nextStatus === RG_STATUS.UNFAMILIAR) {
      const nextDaily = dailyCount + 1;
      setDailyCount(nextDaily);
      writeRgDailyCount(nextDaily);
    }

    setToast(
      nextStatus === RG_STATUS.FAMILIAR
        ? mode === RG_LEARN_MODE.PHRASE
          ? "短语已熟悉"
          : "词义已熟悉"
        : nextStatus === RG_STATUS.UNFAMILIAR
          ? "已标记不熟"
          : "已取消不熟"
    );

    window.setTimeout(() => {
      const nextList = buildRgStudyList(items, filter, nextMap, mode);
      const stillHere = nextList.some((row) => String(row?.entry?.id || "").trim() === activeEntryId);
      if (!stillHere) {
        const advanced = advanceStudyQueueAfterExit(studyList, activeEntryId, nextList);
        if (advanced) freezeStudyQueueRows(advanced.nextList);
        const row =
          advanced?.landingRow
          || nextList[Math.min(safeStudyPosition, Math.max(0, nextList.length - 1))]
          || nextList[0]
          || null;
        if (row) {
          const landingId = String(row.entry?.id || "").trim();
          const landingIndex = Number.isInteger(row.originalIndex) ? row.originalIndex : 0;
          liveDeleteRef.current = {
            ...liveDeleteRef.current,
            index: landingIndex,
            currentEntryId: landingId,
            studyList: advanced?.nextList || nextList,
            isStudyEmpty: false,
            safeStudyPosition: Math.max(0, advanced?.landingPos ?? safeStudyPosition)
          };
          focusStudyRow(row);
        } else {
          freezeStudyQueueRows(null);
          setCurrentEntryId("");
          setIndex(0);
          liveDeleteRef.current = {
            ...liveDeleteRef.current,
            index: 0,
            currentEntryId: "",
            studyList: [],
            isStudyEmpty: true,
            safeStudyPosition: 0
          };
        }
      } else if (nextStatus === RG_STATUS.FAMILIAR) {
        goToStudyOffset(1);
      }
    }, 120);
  }

  function toggleFavorite() {
    if (isQuizMode || isStudyEmpty || !item?.word) return;
    const nextFavorite = !isRgFavorite(item, statusMap);
    const nextMap = patchRgStatus(statusMap, item, { favorite: nextFavorite }, learnMode);
    setStatusMap(nextMap);
    writeRgStatusMap(nextMap);
    setToast(nextFavorite ? "已收藏" : "已取消收藏");
  }

  function shuffleStudy() {
    if (isQuizMode) {
      if (!paraSession || paraSession.currentLearningStage === PARA_LEARNING_STAGE.SUMMARY) return;
      const start = paraSession.currentIndex + 1;
      const tail = paraSession.currentSessionGroupIds.slice(start).map((id, offset) => ({
        id,
        kind: paraSession.sessionTaskKinds[start + offset],
        question: quizQueue[start + offset]
      }));
      for (let i = tail.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [tail[i], tail[j]] = [tail[j], tail[i]];
      }
      const nextSession = {
        ...paraSession,
        currentSessionGroupIds: [...paraSession.currentSessionGroupIds.slice(0, start), ...tail.map((row) => row.id)],
        sessionTaskKinds: [...paraSession.sessionTaskKinds.slice(0, start), ...tail.map((row) => row.kind)],
        updatedAt: Date.now()
      };
      const nextCoverage = shuffleRemainingParaphraseCycle(paraCoverage, highQuizParas.map((group) => group.groupId));
      setQuizQueue([...quizQueue.slice(0, start), ...tail.map((row) => row.question)]);
      persistParaphraseLearning(nextSession, paraReview, nextCoverage);
      setToast("已重排本轮未完成任务，覆盖周期未重置");
      return;
    }
    if (!studyList.length) return;
    const pick = studyList[Math.floor(Math.random() * studyList.length)];
    focusStudyRow(pick);
    setToast("已随机跳转");
  }

  function markParaphraseMastered(groupId, mastered) {
    const next = patchParaphraseStatus(
      paraStatusMap,
      groupId,
      mastered ? "familiar" : "unfamiliar"
    );
    setParaStatusMap(next);
    writeRgParaphraseStatusMap(next);
    setToast(mastered ? "同义关系已掌握" : "同义关系标为未掌握");
  }

  function moveToNextParaphraseTask(sessionIn, reviewIn = paraReview) {
    const nextSession = advanceParaphraseSession(sessionIn);
    if (!nextSession) return;
    setRecallRevealed(false);
    setQuizRevealed(false);
    setQuizSelected(null);
    if (nextSession.completed) {
      setParaSession(nextSession);
      clearRgParaphraseSession();
      return;
    }
    setQuizPos(nextSession.currentIndex);
    persistParaphraseLearning(nextSession, reviewIn, paraCoverage);
  }

  function handleQuizStartRecall() {
    if (!currentQuizGroup || !paraSession) return;
    const now = Date.now();
    const nextReview = markParaphrasePreviewCompleted(paraReview, currentQuizGroup.groupId, now);
    const direction = chooseRecallDirection(currentQuizGroup, getParaphraseReviewEntry(nextReview, currentQuizGroup.groupId));
    let nextSession = appendParaphraseSessionResult(paraSession, { type: "preview", groupId: currentQuizGroup.groupId }, now);
    nextSession = {
      ...nextSession,
      currentLearningStage: PARA_LEARNING_STAGE.RECALL,
      currentDirection: direction,
      updatedAt: now
    };
    setRecallRevealed(false);
    persistParaphraseLearning(nextSession, nextReview, paraCoverage);
  }

  function handleQuizRecallRating(rating) {
    if (!currentQuizGroup || !paraSession) return;
    const now = Date.now();
    const nextReview = recordParaphraseRecall(paraReview, currentQuizGroup.groupId, rating, now);
    let nextSession = appendParaphraseSessionResult(paraSession, { type: "recall", groupId: currentQuizGroup.groupId, rating }, now);
    if (rating === PARA_SELF_RATING.KNOW) {
      nextSession = { ...nextSession, currentLearningStage: PARA_LEARNING_STAGE.QUIZ, updatedAt: now };
      setRecallRevealed(false);
      persistParaphraseLearning(nextSession, nextReview, paraCoverage);
      return;
    }
    const kind = rating === PARA_SELF_RATING.UNCERTAIN ? "uncertain" : "wrong";
    const offset = rating === PARA_SELF_RATING.UNCERTAIN ? 4 : 2;
    nextSession = scheduleParaphraseReinsert(nextSession, currentQuizGroup.groupId, kind, offset, now);
    setQuizQueue(buildQuestionsForSession(nextSession.currentSessionGroupIds));
    if (rating === PARA_SELF_RATING.DONT_KNOW) {
      const nextStatus = patchParaphraseStatus(paraStatusMap, currentQuizGroup.groupId, "unfamiliar");
      setParaStatusMap(nextStatus);
      writeRgParaphraseStatusMap(nextStatus);
    }
    moveToNextParaphraseTask(nextSession, nextReview);
  }

  function onQuizSelect(oi) {
    if (!quizQuestion || quizRevealed) return;
    const now = Date.now();
    const correct = oi === quizQuestion.correctIndex;
    const direction = quizQuestion.meta?.direction || PARA_DIRECTION.ANCHOR_TO_MEMBER;
    const wasFamiliar = paraStatusMap[quizQuestion.groupId]?.paraphraseStatus === "familiar";
    const nextReview = recordParaphraseQuizResult(paraReview, quizQuestion.groupId, { correct, direction }, now);
    let nextSession = appendParaphraseSessionResult(paraSession, { type: "quiz", groupId: quizQuestion.groupId, correct, direction, selectedIndex: oi }, now);
    if (!correct) {
      nextSession = scheduleParaphraseReinsert(nextSession, quizQuestion.groupId, "wrong", 2, now);
      const nextStatus = patchParaphraseStatus(paraStatusMap, quizQuestion.groupId, "unfamiliar");
      setParaStatusMap(nextStatus);
      writeRgParaphraseStatusMap(nextStatus);
      const nextQuestions = buildQuestionsForSession(nextSession.currentSessionGroupIds);
      nextQuestions[nextSession.currentIndex] = quizQuestion;
      setQuizQueue(nextQuestions);
    } else {
      const currentKind = nextSession.sessionTaskKinds[nextSession.currentIndex];
      if (currentKind === "wrong" || currentKind === "uncertain") {
        nextSession = {
          ...nextSession,
          wrongReinsertQueue: nextSession.wrongReinsertQueue.filter((id) => id !== quizQuestion.groupId),
          uncertainReinsertQueue: nextSession.uncertainReinsertQueue.filter((id) => id !== quizQuestion.groupId)
        };
      }
      const legalDirections = getLegalQuizDirections(currentQuizGroup);
      const entry = getParaphraseReviewEntry(nextReview, quizQuestion.groupId);
      const pending = hasPendingParaphraseReinsert(nextSession, quizQuestion.groupId);
      if (canMarkParaphraseFamiliar(entry, legalDirections, pending)) {
        const nextStatus = patchParaphraseStatus(paraStatusMap, quizQuestion.groupId, "familiar");
        setParaStatusMap(nextStatus);
        writeRgParaphraseStatusMap(nextStatus);
        nextSession = appendParaphraseSessionResult(nextSession, {
          type: "mastery",
          groupId: quizQuestion.groupId,
          firstMastered: !wasFamiliar,
          legalDirectionsCompleted: true
        }, now);
      }
    }
    nextSession = {
      ...nextSession,
      currentLearningStage: PARA_LEARNING_STAGE.FEEDBACK,
      currentQuestion: quizQuestion,
      selectedIndex: oi,
      updatedAt: now
    };
    setQuizSelected(oi);
    setQuizRevealed(true);
    persistParaphraseLearning(nextSession, nextReview, paraCoverage);
  }

  function handleQuizNext() {
    if (!paraSession || paraSession.currentLearningStage !== PARA_LEARNING_STAGE.FEEDBACK) return;
    moveToNextParaphraseTask(paraSession, paraReview);
  }

  function handleContinueQuizRound() {
    clearRgParaphraseSession();
    loadQuizSession(quizSessionMode);
  }

  function handleReviewWrong() {
    const priorities = getParaphraseReviewPriorities(paraReview, highQuizParas.map((group) => group.groupId));
    const ids = [...new Set([...priorities.wrong, ...priorities.uncertain])].slice(0, 10);
    if (!ids.length) {
      setToast("当前没有待复习错题");
      return;
    }
    const batch = { sessionIds: ids, sessionKinds: ids.map(() => "wrong"), coverage: paraCoverage };
    const session = createParaphraseSession(batch, "wrongReview");
    applyParaphraseSession(session);
    setToast(`错题复习 · ${ids.length} 组`);
  }

  function flushPendingReadingGDeletes() {
    if (persistInFlightRef.current) return;
    const ids = [...pendingPersistIdsRef.current];
    if (!ids.length) {
      setDeleteBusy(false);
      return;
    }
    pendingPersistIdsRef.current = new Set();
    persistInFlightRef.current = true;
    setDeleteBusy(true);
    invalidateReadingGVocabCache();

    fetch("/api/reading-g/delete-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryIds: ids })
    })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) {
          throw new Error(result.error || "删除当前G类词条失败");
        }
        invalidateReadingGVocabCache();
        for (const id of ids) pendingPersistEntriesRef.current.delete(id);
        if (result.totals) {
          setMeta((current) => ({
            ...current,
            count: result.totals.count,
            wordCount: result.totals.wordCount,
            phraseCount: result.totals.phraseCount,
            activeCount: result.totals.activeCount,
            referenceCount: result.totals.referenceCount
          }));
        }
        const count = Number(result.deletedCount) || ids.length;
        if (count > 1) setToast(`已删除 ${count} 个词`);
        else {
          const word = result.deleted?.[0]?.word || "";
          setToast(word ? `已删除：${word}` : "已删除");
        }
      })
      .catch((error) => {
        for (const id of ids) {
          deletedIdsRef.current.delete(id);
          pendingPersistIdsRef.current.delete(id);
        }
        const restoredRows = ids
          .map((id) => pendingPersistEntriesRef.current.get(id))
          .filter(Boolean);
        for (const id of ids) pendingPersistEntriesRef.current.delete(id);
        if (restoredRows.length) {
          setStudyQueueOverride((current) => {
            const list = Array.isArray(current) ? current.slice() : [];
            const have = new Set(list.map((row) => row?.entry?.id).filter(Boolean));
            const prefix = [];
            for (const row of restoredRows) {
              if (have.has(row.entry?.id)) continue;
              prefix.push(row);
              have.add(row.entry?.id);
            }
            const merged = prefix.length ? [...prefix, ...list] : list;
            frozenStudyQueueRef.current = merged.length ? merged : null;
            return merged.length ? merged : null;
          });
        }
        setToast(`${error?.message || "批量删除失败"}；已放回 ${ids.length} 个词`);
      })
      .finally(() => {
        persistInFlightRef.current = false;
        if (pendingPersistIdsRef.current.size) {
          persistTimerRef.current = window.setTimeout(() => {
            flushPendingReadingGDeletes();
          }, 80);
        } else {
          setDeleteBusy(false);
        }
      });
  }

  function scheduleReadingGDeletePersist(entryId, removedRow) {
    pendingPersistIdsRef.current.add(entryId);
    if (removedRow) pendingPersistEntriesRef.current.set(entryId, removedRow);
    setDeleteBusy(true);
    window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      flushPendingReadingGDeletes();
    }, 280);
  }

  function deleteCurrentReadingGEntry() {
    const live = liveDeleteRef.current;
    if (
      live.phase !== "ready"
      || live.isQuizMode
      || live.isStudyEmpty
      || live.aiRunning
      || deleteLockRef.current
    ) {
      return;
    }

    // Authoritative queue: freeze ref (in-burst) → live snapshot from last render.
    const currentStudyList = Array.isArray(frozenStudyQueueRef.current) && frozenStudyQueueRef.current.length
      ? frozenStudyQueueRef.current
      : (Array.isArray(live.studyList) ? live.studyList : []);
    if (!currentStudyList.length) return;

    const currentId = resolveCurrentStudyEntryId({
      focusEntryId: live.currentEntryId || currentEntryId,
      studyList: currentStudyList,
      items: live.items,
      index: live.index
    });
    if (!currentId || deletedIdsRef.current.has(currentId)) return;

    const advanced = advanceStudyQueueAfterDelete(currentStudyList, currentId);
    if (!advanced) return;

    const removedRow = currentStudyList[advanced.pos];
    const removedEntry = removedRow?.entry;
    const removedId = String(removedEntry?.id || currentId).trim();
    if (!removedId || !removedEntry) return;

    const removedIsPhrase = removedEntry.entryType === "phrase";
    const removedIsReference = removedEntry.studyMode === "reference";
    const nextStudyList = advanced.nextList;
    const landingRow = advanced.landingRow;
    const landingIndex = advanced.landingOriginalIndex;
    const landingId = advanced.landingEntryId;

    deleteLockRef.current = true;
    deletedIdsRef.current.add(removedId);

    // Freeze queue order immediately (ref is sync for the next keypress before paint).
    freezeStudyQueueRows(nextStudyList);
    if (landingId && landingRow) {
      setCurrentEntryId(landingId);
      setIndex(landingIndex);
      persistSession(landingIndex, live.filter || filter, landingRow.entry);
    } else {
      setCurrentEntryId("");
      setIndex(0);
    }
    setMeta((current) => ({
      ...current,
      count: Math.max(0, current.count - 1),
      wordCount: Math.max(0, current.wordCount - (removedIsPhrase ? 0 : 1)),
      phraseCount: Math.max(0, current.phraseCount - (removedIsPhrase ? 1 : 0)),
      activeCount: Math.max(0, current.activeCount - (removedIsReference ? 0 : 1)),
      referenceCount: Math.max(0, current.referenceCount - (removedIsReference ? 1 : 0))
    }));

    // Sync live snapshot before React re-renders so rapid D/Delete never sees a stale queue.
    liveDeleteRef.current = {
      ...liveDeleteRef.current,
      index: landingId ? landingIndex : 0,
      currentEntryId: landingId,
      studyList: nextStudyList,
      isStudyEmpty: nextStudyList.length === 0,
      safeStudyPosition: Math.max(0, advanced.landingPos)
    };
    deleteLockRef.current = false;

    scheduleReadingGDeletePersist(removedId, {
      entry: removedEntry,
      originalIndex: removedRow.originalIndex
    });
  }

  // Only leave the delete freeze when the study scope changes.
  // Do NOT depend on wordOrdering.mode/difficultyMode — those used to flip while the
  // freeze disabled ordering, which cleared the queue and made delete jump randomly.
  useEffect(() => {
    clearStudyQueueFreeze();
  }, [filter, learnMode, clearStudyQueueFreeze]);

  // Flush queued deletes when leaving the page.
  useEffect(() => () => {
    window.clearTimeout(persistTimerRef.current);
    const ids = [...pendingPersistIdsRef.current];
    pendingPersistIdsRef.current = new Set();
    if (ids.length) {
      fetch("/api/reading-g/delete-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryIds: ids }),
        keepalive: true
      }).catch(() => {});
    }
  }, []);

  // Belt-and-suspenders: write study position on tab close / hard refresh.
  useEffect(() => {
    function persistLiveSession() {
      if (!storageReadyRef.current || !restoredRef.current) return;
      const live = liveDeleteRef.current;
      if (!live || live.phase !== "ready" || live.isQuizMode || live.isStudyEmpty) return;
      const row =
        live.items?.[live.index]
        || live.studyList?.find((r) => r?.originalIndex === live.index)?.entry
        || null;
      if (!row || (row.id && deletedIdsRef.current.has(row.id))) return;
      const key = getEntryProgressKey(row) || normalizeReadingGKey(row.word);
      if (!key) return;
      const f = live.filter || DEFAULT_FILTER;
      positionsRef.current[filterKey(f)] = key;
      writeRgPositions(positionsRef.current);
      writeRgSession({
        wordKey: key,
        filter: f,
        index: live.index,
        savedAt: new Date().toISOString()
      });
    }
    function onPageHide() {
      persistLiveSession();
    }
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
      persistLiveSession();
    };
  }, []);

  // Keep live delete snapshot in sync every render.
  // Prefer the freeze ref for studyList so a stale render cannot resurrect the pre-delete queue.
  liveDeleteRef.current = {
    items,
    index,
    currentEntryId: activeEntryId || currentEntryId,
    studyList: (frozenStudyQueueRef.current || studyList),
    filter,
    phase,
    isQuizMode,
    aiRunning,
    isStudyEmpty,
    safeStudyPosition
  };

  useEffect(() => {
    function onKeyDown(event) {
      if (phase !== "ready") return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isHorizontalArrow = event.key === "ArrowLeft" || event.key === "ArrowRight";
      if (
        tag === "input"
        || tag === "textarea"
        || (tag === "select" && !isHorizontalArrow)
      ) return;

      if (!isQuizMode && shouldHandleStudyDeleteShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        deleteCurrentReadingGEntry();
        return;
      }

      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        goToStudyOffset(1);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        goToStudyOffset(-1);
      } else if (!isQuizMode && event.key === "Tab") {
        event.preventDefault();
        const kind =
          item?.entryType === "phrase" || /\s/.test(item?.word || "") ? "phrase" : "word";
        speakText(item?.word, kind);
      } else if (!isQuizMode && event.key === " ") {
        event.preventDefault();
        speakText(item?.example, "sentence");
      } else if (!isQuizMode && (event.key === "0" || event.key === "2")) {
        event.preventDefault();
        markStatus(RG_STATUS.FAMILIAR);
      } else if (!isQuizMode && event.key === "1") {
        event.preventDefault();
        markStatus(RG_STATUS.UNFAMILIAR);
      } else if (isQuizMode && !quizRevealed && ["1", "2", "3", "4", "a", "b", "c", "d", "A", "B", "C", "D"].includes(event.key)) {
        // number keys 1-4 conflict with mark — only a-d for options when quiz
        const map = { a: 0, b: 1, c: 2, d: 3, A: 0, B: 1, C: 2, D: 3 };
        if (map[event.key] != null) {
          event.preventDefault();
          onQuizSelect(map[event.key]);
        }
      }
    }

    function onDeleteRequest() {
      if (isQuizMode) return;
      deleteCurrentReadingGEntry();
    }

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener(DELETE_CURRENT_WORD_EVENT, onDeleteRequest);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener(DELETE_CURRENT_WORD_EVENT, onDeleteRequest);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    phase,
    item?.id,
    item?.word,
    item?.example,
    item?.entryType,
    studyList,
    items,
    safeStudyPosition,
    statusMap,
    filter,
    learnMode,
    index,
    isQuizMode,
    quizRevealed,
    quizQuestion,
    deleteBusy,
    aiRunning
  ]);

  // Light overview rows — avoid spreading full lexicon entries on every keypress.
  const overviewWords = useMemo(
    () => studyList.map(({ entry }) => ({
      word: entry.word,
      meaning: entry.meaning || entry.primaryMeaningZh || "",
      status: getRgStatus(entry, statusMap, resolveLearnMode(learnMode, entry, filter)),
      favorite: isRgFavorite(entry, statusMap),
      id: entry.id
    })),
    [studyList, statusMap, learnMode, filter]
  );

  if (phase === "loading") {
    return (
      <main className="page page--word-flash system-loading-page">
        <StableLoadingState
          mark="G"
          eyebrow="G类阅读提升"
          note="读取分层词库并恢复上次学习位置"
        />
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="page page--word-flash system-loading-page">
        <StableLoadingState
          mark="G"
          eyebrow="G类阅读提升"
          title="词库暂时无法读取"
          note={error}
          variant="error"
          actionHref="/"
          actionLabel="返回主词库"
        />
      </main>
    );
  }

  const rangeTitle = isQuizMode
    ? `同义替换训练 · 安全题库${quizPoolSize || highQuizParas.length}组`
    : getRgFilterLabel(filter);
  const sessionLen = paraSession?.baseGroupCount || PARA_SESSION_SIZE[quizSessionMode] || 10;
  const rangeMeta = isQuizMode
    ? `本轮 ${Math.min(quizPos + 1, sessionLen)} / ${sessionLen} · 累计覆盖 ${quizCumulative} / ${quizPoolSize || highQuizParas.length}`
    : "";
  const reviewPriorities = getParaphraseReviewPriorities(
    paraReview,
    highQuizParas.map((group) => group.groupId)
  );
  const quizSummary = paraSession?.currentLearningStage === PARA_LEARNING_STAGE.SUMMARY || paraSession?.completed
    ? summarizeParaphraseSession(paraSession)
    : null;
  const recallMember = currentQuizGroup?.members?.[0] || "—";
  const recallPrompt = paraSession?.currentDirection === PARA_DIRECTION.MEMBER_TO_ANCHOR
    ? recallMember
    : currentQuizGroup?.anchor || "—";
  const recallAnswer = paraSession?.currentDirection === PARA_DIRECTION.MEMBER_TO_ANCHOR
    ? currentQuizGroup?.anchor || "—"
    : recallMember;
  const focusLabels = (quizSummary?.focusGroupIds || []).map((groupId) => {
    const group = paraphraseGroups.find((row) => row.groupId === groupId);
    return group ? `${group.anchor} ↔ ${group.members?.[0] || ""}` : groupId;
  });
  const speechKind =
    item.entryType === "phrase" || /\s/.test(item.word || "") ? "phrase" : "word";

  const chipGroups = [
    {
      title: "更多筛选",
      chips: [
        {
          label: "完整测验·80题",
          filter: { type: "paraphraseQuiz", value: "", sessionMode: "full" }
        },
        { label: "熟悉", filter: { type: "status", value: "熟悉" } },
        { label: "全部含参考", filter: { type: "everything", value: "" } },
        { label: "单词（含参考）", filter: { type: "entryType", value: "word" } },
        { label: "词组（含参考）", filter: { type: "entryType", value: "phrase" } },
        { label: "参考查阅", filter: { type: "reference", value: "" } }
      ]
    },
    {
      title: "专项层",
      chips: [
        { label: "核心1500", filter: { type: "layer", value: "priority1500" } },
        { label: "B层1200", filter: { type: "layer", value: "tierB1200" } },
        { label: "C层800", filter: { type: "layer", value: "tierC800" } },
        { label: "真题同义浏览", filter: { type: "paraphrase", value: "" } },
        { label: "全题库已有", filter: { type: "layer", value: "questionBankActive" } },
        { label: "AI已补全", filter: { type: "layer", value: "questionBankAiCompleted" } },
        { label: "待补资料", filter: { type: "layer", value: "questionBankPending" } }
      ]
    }
  ];

  const studyPathNote =
    "四个阶段按首次进入路线的阶段归类，彼此不重复。建议先阶段1，再阶段2；同义替换单独用训练方式。";

  return (
    <SatelliteLexiconFlashcard
      layoutMode="readingG"
      modeLabel="G类阅读提升"
      rangeTitle={rangeTitle}
      rangeMeta={rangeMeta}
      rangeDetail={
        isQuizMode
          ? `到期复习 ${reviewPriorities.due.length} · 错题 ${reviewPriorities.wrong.length} · 仅浏览关系 ${Math.max(0, 300 - (quizPoolSize || highQuizParas.length))} 组`
          : ""
      }
      prevItem={prevItem}
      item={item}
      isStudyEmpty={isStudyEmpty}
      isFavorite={!isQuizMode && isRgFavorite(item, statusMap)}
      itemStatus={itemStatus}
      filter={filter}
      learningEntryGroups={learningEntryGroups}
      libraryRows={libraryRows}
      index={index}
      safeStudyPosition={safeStudyPosition}
      studyCount={studyCount}
      progressPercent={progressPercent}
      onPositionCommit={isQuizMode ? null : seekStudyPosition}
      getPositionPreview={isQuizMode ? null : getStudyPositionPreview}
      search={search}
      setSearch={setSearch}
      onFilter={setLibraryFilter}
      onJumpIndex={(originalIndex) => {
        if (isQuizMode) return;
        const row = studyList.find((r) => r.originalIndex === originalIndex)
          || { originalIndex, entry: items[originalIndex] };
        if (row?.entry) focusStudyRow(row);
        else {
          setIndex(originalIndex);
          setCurrentEntryId(String(items[originalIndex]?.id || "").trim());
          persistSession(originalIndex);
        }
      }}
      onMarkFamiliar={() => markStatus(RG_STATUS.FAMILIAR)}
      onMarkUnfamiliar={() => markStatus(RG_STATUS.UNFAMILIAR)}
      onToggleFavorite={toggleFavorite}
      onSpeakWord={() => speakText(isQuizMode ? quizQuestion?.stem : item?.word, speechKind)}
      onSpeakExample={() => speakText(item?.example, "sentence")}
      onSpeakSmall={(text) => speakText(text, "phrase")}
      onShuffle={shuffleStudy}
      wordOrderMode={wordOrdering.mode}
      wordOrderDifficultyMode={wordOrdering.difficultyMode}
      wordOrderDifficultyAvailable={wordOrdering.difficultyAvailable}
      wordOrderDifficultyProfile={wordOrdering.difficultyProfile}
      onWordOrderModeChange={changeWordOrderMode}
      onWordDifficultyModeChange={changeWordDifficultyMode}
      onPrev={() => goToStudyOffset(-1)}
      onNext={() => goToStudyOffset(1)}
      overviewWords={overviewWords}
      overviewStats={{
        familiar: familiarCount,
        unfamiliar: items.filter((entry) =>
          getRgStatus(entry, statusMap, resolveLearnMode(learnMode, entry, filter)) === RG_STATUS.UNFAMILIAR
        ).length,
        todayReviewed: dailyCount
      }}
      statsLine={`词库 ${meta.count.toLocaleString()} · 单词 ${meta.wordCount.toLocaleString()} · 词组 ${meta.phraseCount.toLocaleString()} · active ${meta.activeCount.toLocaleString()} · 参考 ${meta.referenceCount.toLocaleString()} · 同义可训 ${highQuizParas.length} · 词义熟悉 ${familiarCount} · 今日 ${dailyCount}${migrationInfo?.v4?.matchedCount != null ? ` · 迁移${migrationInfo.v4.matchedCount}` : ""}`}
      toast={toast}
      extraActions={(
        <>
          <button
            type="button"
            className="top-pill spelling-entry-link"
            onClick={() => setLibraryFilter({ type: "questionBankComplete", value: "" })}
          >
            新增完整词 {questionBankCompleteCount}
          </button>
          <button
            type="button"
            className="top-pill spelling-entry-link"
            onClick={() => setLibraryFilter({ type: "contentIncomplete", value: "" })}
          >
            待补词 {incompleteContentEntries.length}
          </button>
          <details className="menu reading-g-ai-menu">
            <summary className="top-pill">AI补全待补词</summary>
            <div className="menu-panel wide reading-g-ai-panel">
              <h2 className="panel-title">G类待补词专用 AI</h2>
              <p className="panel-desc">
                页面“待补词”按实际字段缺失统计 {incompleteContentEntries.length} 个；其中本专用 AI 仅处理“全题库·待补资料” {pendingAiEntries.length} 个。已由 AI 补全 {questionBankAiCompletedCount} 个，不会修改原有词、总词库或学习进度。
              </p>
              <p className="ai-warning">
                每批最多10词、1次请求、自动重试0次。缓存命中不调用付费模型；未命中会调用 DeepSeek，开始前还会再次确认。
              </p>
              <div className="action-grid">
                <button
                  type="button"
                  className="small-btn warm"
                  disabled={aiRunning || !pendingAiEntries.some((entry) => entry.id === item?.id)}
                  onClick={() => runPendingAiCompletion({ currentOnly: true })}
                >
                  {aiRunning ? "处理中" : "补全当前待补词"}
                </button>
                <button
                  type="button"
                  className="small-btn ai-paid"
                  disabled={aiRunning || !pendingAiEntries.length}
                  onClick={() => runPendingAiCompletion({ currentOnly: false })}
                >
                  {aiRunning ? "处理中" : `补全下一批 ${Math.min(AI_COMPLETION_BATCH_SIZE, pendingAiEntries.length)} 词（可能扣费）`}
                </button>
                <button
                  type="button"
                  className="small-btn ai-paid"
                  disabled={aiRunning || !pendingAiEntries.length}
                  onClick={() => runPendingAiCompletion({ autoAll: true })}
                >
                  {aiRunning ? "处理中" : `自动补全全部 ${pendingAiEntries.length} 词（可能扣费）`}
                </button>
                {aiAutoRunning ? (
                  <button
                    type="button"
                    className="small-btn warm"
                    onClick={stopAutoAiCompletion}
                  >
                    停止自动补全
                  </button>
                ) : null}
              </div>
              {aiMessage ? <div className="status-line">{aiMessage}</div> : null}
            </div>
          </details>
        </>
      )}
      chipGroups={chipGroups}
      studyPathNote={studyPathNote}
      layerMeta={LAYER_META}
      relatedParas={relatedParas}
      paraStatusMap={paraStatusMap}
      onParaphraseMaster={markParaphraseMastered}
      quizMode={isQuizMode}
      quizQuestion={quizQuestion}
      quizRevealed={quizRevealed}
      quizSelectedIndex={quizSelected}
      onQuizSelect={onQuizSelect}
      quizLearning={{
        stage: paraSession?.currentLearningStage || PARA_LEARNING_STAGE.PREVIEW,
        mode: paraSession?.mode || quizSessionMode,
        group: currentQuizGroup,
        context: currentQuizGroup?.sources?.find((source) => source.answerSentence)?.answerSentence || "",
        recallPrompt,
        recallAnswer,
        recallRevealed,
        summary: quizSummary,
        cumulative: quizCumulative,
        poolSize: quizPoolSize || highQuizParas.length,
        focusLabels,
        resumeOffer
      }}
      onQuizStartRecall={handleQuizStartRecall}
      onQuizRevealRecall={() => setRecallRevealed(true)}
      onQuizRateRecall={handleQuizRecallRating}
      onQuizNext={handleQuizNext}
      onQuizContinueRound={handleContinueQuizRound}
      onQuizReviewWrong={handleReviewWrong}
      onQuizResume={() => continueSavedParaphraseSession(false)}
      onQuizRestartSession={() => continueSavedParaphraseSession(true)}
      familiarLabel={isQuizMode ? "掌握" : "熟悉"}
      unfamiliarLabel={isQuizMode ? "未掌握" : "不熟"}
      panelStatusCounts={statusCounts}
    />
  );
}
