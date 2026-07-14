"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SatelliteLexiconFlashcard from "../components/SatelliteLexiconFlashcard";
import StableLoadingState from "../components/StableLoadingState";
import {
  LAYER_META,
  loadReadingGParaphrases,
  loadReadingGVocab,
  normalizeReadingGKey
} from "../lib/reading-g-vocab/load-reading-g.mjs";
import { migrateReadingGProgress } from "../lib/reading-g-vocab/migration.mjs";
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
import {
  playSpeechAudio,
  resolveSpeechPlaybackOptions
} from "../lib/speech-audio-playback.mjs";

const DEFAULT_FILTER = { type: "pathStage", value: "1" };

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
  const [filter, setFilter] = useState(DEFAULT_FILTER);
  const [statusMap, setStatusMap] = useState({});
  const [paraStatusMap, setParaStatusMap] = useState({});
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
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

        positionsRef.current = savedPositions || {};
        setStatusMap(savedStatus);
        setParaStatusMap(savedPara);
        setParaReview(savedReview);
        if (savedParaSession) {
          setResumeOffer(savedParaSession);
          const resumeMode = savedParaSession.mode === "wrongReview" ? "guided" : savedParaSession.mode;
          setQuizSessionMode(resumeMode);
          setFilter({ type: "paraphraseQuiz", value: "", sessionMode: resumeMode });
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

        const restoreKey =
          savedSession?.wordKey ||
          positionsRef.current[filterKey(DEFAULT_FILTER)] ||
          "";
        if (restoreKey && savedSession?.filter?.type !== "paraphraseQuiz") {
          const found = loaded.items.findIndex(
            (row) =>
              getEntryProgressKey(row) === restoreKey ||
              normalizeReadingGKey(row.word) === restoreKey
          );
          if (found >= 0) setIndex(found);
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

  const studyList = useMemo(() => {
    if (isQuizMode) return [];
    if (filter.type === "paraphrase") {
      const keys = new Set();
      const list = [];
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
      return list;
    }
    return buildRgStudyList(items, filter, statusMap, learnMode);
  }, [items, filter, statusMap, verifiedParas, isQuizMode, learnMode]);

  const currentStudyPosition = useMemo(
    () => studyList.findIndex((row) => row.originalIndex === index),
    [studyList, index]
  );
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
    const baseItem = isStudyEmpty
      ? {
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
        }
      : items[index] || studyList[0]?.entry || {};
    return baseItem;
  }, [isQuizMode, quizQuestion, quizRevealed, isStudyEmpty, phase, items, index, studyList]);

  const relatedParas = useMemo(() => {
    if (!item?.word || isQuizMode) return [];
    const nk = normalizeReadingGKey(item.word);
    return verifiedParas.filter((g) => {
      const all = [g.anchor, ...(g.members || [])].map(normalizeReadingGKey);
      return all.includes(nk);
    });
  }, [item?.word, verifiedParas, isQuizMode]);

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

  const learningEntryGroups = useMemo(() => {
    return RG_LEARNING_ENTRIES.map((group) => ({
      ...group,
      items: group.items.map((entry) => ({
        ...entry,
        count:
          entry.filter.type === "paraphrase"
            ? verifiedParas.length
            : entry.filter.type === "paraphraseQuiz"
              ? highQuizParas.length
            : buildRgStudyList(items, entry.filter, statusMap, learnMode).length
      }))
    }));
  }, [items, statusMap, highQuizParas, verifiedParas, learnMode]);

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
    (nextIndex, nextFilter = filter) => {
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
      const row = items[nextIndex];
      if (!row) return;
      const key = getEntryProgressKey(row) || normalizeReadingGKey(row.word);
      positionsRef.current[filterKey(nextFilter)] = key;
      writeRgPositions(positionsRef.current);
      writeRgSession({
        wordKey: key,
        filter: nextFilter,
        index: nextIndex,
        savedAt: new Date().toISOString()
      });
    },
    [filter, items, quizPos]
  );

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
    const nextPos = (safeStudyPosition + delta + studyList.length) % studyList.length;
    const nextIndex = studyList[nextPos].originalIndex;
    setIndex(nextIndex);
    persistSession(nextIndex);
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
    setIndex(nextIndex);
    persistSession(nextIndex, nextFilter);
    setToast((t) =>
      nextFilter.type === "reference" ||
      nextFilter.type === "paraphrase" ||
      nextFilter.type === "paraphraseQuiz"
        ? t
        : `已切换：${getRgFilterLabel(nextFilter)}`
    );
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
      if (!nextList.length) return;
      const stillHere = nextList.some((row) => row.originalIndex === index);
      if (!stillHere) {
        const nextIndex =
          nextList[Math.min(safeStudyPosition, nextList.length - 1)]?.originalIndex ??
          nextList[0].originalIndex;
        setIndex(nextIndex);
        persistSession(nextIndex);
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
    setIndex(pick.originalIndex);
    persistSession(pick.originalIndex);
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

  useEffect(() => {
    function onKeyDown(event) {
      if (phase !== "ready") return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

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

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    phase,
    item?.word,
    item?.example,
    item?.entryType,
    studyList,
    safeStudyPosition,
    statusMap,
    filter,
    index,
    isQuizMode,
    quizRevealed,
    quizQuestion
  ]);

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
      title: "模式",
      chips: [
        { label: "词义学习", filter: { type: "learnMode", value: "meaning" } },
        { label: "短语学习", filter: { type: "learnMode", value: "phrase" } },
        {
          label: "引导学习·10组",
          filter: { type: "paraphraseQuiz", value: "", sessionMode: "guided" }
        },
        {
          label: "快速测验·20题",
          filter: { type: "paraphraseQuiz", value: "", sessionMode: "quick" }
        },
        {
          label: "完整测验·80题",
          filter: { type: "paraphraseQuiz", value: "", sessionMode: "full" }
        }
      ]
    },
    {
      title: "阶段",
      chips: [
        { label: "阶段1", filter: { type: "pathStage", value: "1" } },
        { label: "阶段2", filter: { type: "pathStage", value: "2" } },
        { label: "阶段3", filter: { type: "pathStage", value: "3" } },
        { label: "阶段4", filter: { type: "pathStage", value: "4" } }
      ]
    },
    {
      title: "路径",
      chips: [
        { label: "默认待学", filter: { type: "active", value: "" } },
        { label: "全部含参考", filter: { type: "everything", value: "" } },
        { label: "不熟", filter: { type: "status", value: "不熟" } },
        { label: "熟悉", filter: { type: "status", value: "熟悉" } },
        { label: "收藏", filter: { type: "status", value: "收藏" } }
      ]
    },
    {
      title: "分层",
      chips: [
        { label: "优先核心1500", filter: { type: "layer", value: "priority1500" } },
        { label: "答案词强化250", filter: { type: "layer", value: "answerCore250" } },
        { label: "逻辑连接120", filter: { type: "layer", value: "logic120" } },
        { label: "高频词组400", filter: { type: "layer", value: "phrases400" } },
        { label: "B层1200", filter: { type: "layer", value: "tierB1200" } },
        { label: "真题同义300", filter: { type: "paraphrase", value: "" } },
        { label: "表达识别核心", filter: { type: "layer", value: "paraCore600" } },
        { label: "C层800", filter: { type: "layer", value: "tierC800" } },
        { label: "表达识别扩展", filter: { type: "layer", value: "paraExt500" } },
        { label: "参考701", filter: { type: "reference", value: "" } }
      ]
    },
    {
      title: "形态",
      chips: [
        { label: "仅单词", filter: { type: "entryType", value: "word" } },
        { label: "仅词组", filter: { type: "entryType", value: "phrase" } }
      ]
    }
  ];

  const studyPathNote =
    "已验证同义关系：安全题库233组；仅浏览关系67组。表达识别核心1006个表达、扩展500个表达，用于扩展阅读表达识别，不代表每个词都已建立可靠同义关系。";

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
      search={search}
      setSearch={setSearch}
      onFilter={setLibraryFilter}
      onJumpIndex={(originalIndex) => {
        if (isQuizMode) return;
        setIndex(originalIndex);
        persistSession(originalIndex);
      }}
      onMarkFamiliar={() => markStatus(RG_STATUS.FAMILIAR)}
      onMarkUnfamiliar={() => markStatus(RG_STATUS.UNFAMILIAR)}
      onToggleFavorite={toggleFavorite}
      onSpeakWord={() => speakText(isQuizMode ? quizQuestion?.stem : item?.word, speechKind)}
      onSpeakExample={() => speakText(item?.example, "sentence")}
      onSpeakSmall={(text) => speakText(text, "phrase")}
      onShuffle={shuffleStudy}
      statsLine={`词库 ${meta.count.toLocaleString()} · 单词 ${meta.wordCount.toLocaleString()} · 词组 ${meta.phraseCount.toLocaleString()} · active ${meta.activeCount.toLocaleString()} · 参考 ${meta.referenceCount.toLocaleString()} · 同义可训 ${highQuizParas.length} · 词义熟悉 ${familiarCount} · 今日 ${dailyCount}${migrationInfo?.v4?.matchedCount != null ? ` · 迁移${migrationInfo.v4.matchedCount}` : ""}`}
      toast={toast}
      extraLinks={[
        { href: "/basic", label: "零基础单词" },
        { href: "/spelling-words", label: "单词拼写训练" },
        { href: "/meaning", label: "看词选意思 · 核心6000" }
      ]}
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
