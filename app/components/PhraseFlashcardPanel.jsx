"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import StableLoadingState from "./StableLoadingState.jsx";
import {
  readJsonStorage,
  writeJsonStorage
} from "../lib/browser-storage.mjs";
import { loadPhrases, normalizePhraseKey } from "../lib/vocab/load-phrases.mjs";
import { loadPhrasesWithCache } from "../lib/vocab/phrase-flashcard-store.mjs";
import {
  PHRASE_FLASHCARD_DAILY_KEY,
  PHRASE_FLASHCARD_STATUS_KEY
} from "../lib/vocab/phrase-flashcard-keys.mjs";
import {
  readPhraseFlashEntryPositions,
  readPhraseFlashSession,
  writePhraseFlashEntryPositions,
  writePhraseFlashSession
} from "../lib/vocab/phrase-flashcard-progress.mjs";
import {
  PHRASE_FILTER_STATUS,
  PHRASE_PRIORITY_FILTERS,
  PHRASE_STUDY_STATUS,
  buildPhraseStudyList,
  collectPhraseFilterOptions,
  getPhraseFilterLabel,
  getPhraseStatus,
  migratePhraseEntryPositions,
  migratePhraseStatusMap,
  phraseFilterKey
} from "../lib/vocab/phrase-flashcard-utils.mjs";
import {
  buildPhraseFlashSessionPayload,
  resolvePhraseFilterSwitchIndex,
  resolvePhraseStudyIndex,
  restoreMessageForPhraseReason
} from "../lib/vocab/phrase-flashcard-session.mjs";
import {
  effectiveStudyIndex,
  releaseStudyPersistBlock,
  shouldBlockStudyIndexPersist,
  shouldRunFullStudyRestore
} from "../lib/vocab/study-session.mjs";
import StudyRangeSummary from "./StudyRangeSummary.jsx";
import StudyMeaningToggle from "./StudyMeaningToggle.jsx";
import VirtualList from "./VirtualList.jsx";
import {
  playSpeechAudio,
  resolveSpeechPlaybackOptions
} from "../lib/speech-audio-playback.mjs";
import {
  fetchSpeechAudioResult,
  preloadSpeechAudioUrl,
  SPEECH_WARM_DELAYS_MS,
  SPEECH_WARM_OPTIONS
} from "../lib/vocab-speech.mjs";

const PERSIST_DEBOUNCE_MS = 280;
const FILTER_STATUS_OPTIONS = [
  PHRASE_FILTER_STATUS.UNFAMILIAR,
  PHRASE_STUDY_STATUS.FAMILIAR,
  PHRASE_FILTER_STATUS.FAVORITE
];

function fallback(value, text) {
  return value && String(value).trim() ? value : text;
}

function formatSpeechSourceLabel(result = {}) {
  if (!result || result.source === "empty") return "发音";
  return "兜底发音";
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function buildStudyListForFilter(phrases, nextFilter, statusMap) {
  return buildPhraseStudyList(phrases, nextFilter, statusMap);
}

export default function PhraseFlashcardPanel() {
  const [phrases, setPhrases] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [loadError, setLoadError] = useState("");
  const [lexiconMeta, setLexiconMeta] = useState({ version: "", phraseLexiconHash: "", count: 0 });
  const [index, setIndex] = useState(0);
  const [filter, setFilter] = useState({ type: "all", value: "" });
  const [statusMap, setStatusMap] = useState({});
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [exampleOpen, setExampleOpen] = useState(true);
  const [dailyCount, setDailyCount] = useState(0);

  const entryPositionsRef = useRef({});
  const pendingSessionRef = useRef(null);
  const audioRef = useRef(null);
  const speechRequestRef = useRef({ key: "", at: 0 });
  const warmTtsTimersRef = useRef([]);
  const warmTtsBatchRef = useRef(0);
  const storageReadyRef = useRef(false);
  const sessionPersistTimerRef = useRef(null);
  const pendingSessionPersistRef = useRef(null);
  const statusPersistTimerRef = useRef(null);
  const studySessionRef = useRef({
    restored: false,
    userAdjusted: false,
    persistBlocked: true,
    restoreTargetIndex: null,
    settling: false,
    toastShown: false,
    wordsGeneration: 0
  });
  const latestPhraseStateRef = useRef({
    index: 0,
    filter: { type: "all", value: "" },
    phrases: [],
    studyPhrases: []
  });
  const nextPhraseRef = useRef(() => {});
  const prevPhraseRef = useRef(() => {});

  const filterOptions = useMemo(() => collectPhraseFilterOptions(phrases), [phrases]);
  const priorityPhraseFilters = useMemo(() => {
    return PHRASE_PRIORITY_FILTERS.map((entry) => ({
      ...entry,
      count: buildPhraseStudyList(phrases, entry.filter, statusMap).length
    })).filter((entry) => entry.count > 0);
  }, [phrases, statusMap]);

  const studyPhrases = useMemo(
    () => buildPhraseStudyList(phrases, filter, statusMap),
    [phrases, filter, statusMap]
  );

  const effectiveIndex = effectiveStudyIndex(studySessionRef.current, index);
  const currentStudyPosition = useMemo(
    () => studyPhrases.findIndex((item) => item.originalIndex === effectiveIndex),
    [studyPhrases, effectiveIndex]
  );
  const safeStudyPosition = currentStudyPosition >= 0 ? currentStudyPosition : 0;
  const isStudyEmpty = !studyPhrases.length;
  const resolvedPhrase = phrases[effectiveIndex] || null;
  const item = useMemo(() => isStudyEmpty
    ? {
        word: "完成",
        phonetic: "",
        meaning: "当前范围没有待学习词组",
        example: "可以切换筛选条件，或标记更多词组为待复习。",
        exampleCn: ""
      }
    : resolvedPhrase || studyPhrases[0]?.entry || {}, [isStudyEmpty, resolvedPhrase, studyPhrases]);

  const prevInStudy = studyPhrases.length
    ? studyPhrases[(safeStudyPosition - 1 + studyPhrases.length) % studyPhrases.length]
    : null;
  const prevItem = prevInStudy?.entry || null;

  const familiarCount = useMemo(
    () => phrases.filter((entry) => getPhraseStatus(entry, statusMap).status === PHRASE_STUDY_STATUS.FAMILIAR).length,
    [phrases, statusMap]
  );

  const filteredLibrary = useMemo(() => {
    const q = search.trim().toLowerCase();
    return phrases
      .map((entry, originalIndex) => ({ entry, originalIndex }))
      .filter(({ entry }) => {
        if (q && !String(entry.word || "").toLowerCase().includes(q)) return false;
        if (filter.type === "everything" || filter.type === "all") {
          return filter.type === "everything"
            ? true
            : getPhraseStatus(entry, statusMap).status !== PHRASE_STUDY_STATUS.FAMILIAR;
        }
        return buildPhraseStudyList([entry], filter, statusMap).length > 0;
      });
  }, [phrases, search, filter, statusMap]);

  const progressPercent = studyPhrases.length
    ? Math.max(1, ((safeStudyPosition + 1) / studyPhrases.length) * 100)
    : 0;

  latestPhraseStateRef.current = {
    index: effectiveIndex,
    filter,
    phrases,
    studyPhrases
  };

  const persistPhraseSessionNow = useCallback((nextIndex = index, nextFilter = filter, nextPhrases = phrases) => {
    if (sessionPersistTimerRef.current) {
      clearTimeout(sessionPersistTimerRef.current);
      sessionPersistTimerRef.current = null;
    }
    pendingSessionPersistRef.current = null;

    if (!storageReadyRef.current || !studySessionRef.current.restored) return false;
    if (!Array.isArray(nextPhrases) || !nextPhrases.length) return false;

    const entry = nextPhrases[nextIndex];
    if (entry) {
      entryPositionsRef.current[phraseFilterKey(nextFilter)] = normalizePhraseKey(entry);
    }

    const payload = buildPhraseFlashSessionPayload({
      phrases: nextPhrases,
      index: nextIndex,
      filter: nextFilter,
      entryPositions: entryPositionsRef.current
    });

    const positionsSaved = writePhraseFlashEntryPositions(entryPositionsRef.current);
    const sessionSaved = writePhraseFlashSession(payload);

    if (!positionsSaved || !sessionSaved) {
      setToast("学习位置保存失败，请检查浏览器存储空间");
    }

    return positionsSaved && sessionSaved;
  }, [index, filter, phrases]);

  const queuePhraseSessionPersist = useCallback((nextIndex = index, nextFilter = filter, nextPhrases = phrases) => {
    pendingSessionPersistRef.current = { index: nextIndex, filter: nextFilter, phrases: nextPhrases };
    if (sessionPersistTimerRef.current) clearTimeout(sessionPersistTimerRef.current);
    sessionPersistTimerRef.current = window.setTimeout(() => {
      const pending = pendingSessionPersistRef.current;
      if (!pending) return;
      persistPhraseSessionNow(pending.index, pending.filter, pending.phrases);
    }, PERSIST_DEBOUNCE_MS);
  }, [index, filter, phrases, persistPhraseSessionNow]);

  const flushQueuedPhraseSessionPersist = useCallback(() => {
    const pending = pendingSessionPersistRef.current;
    if (!pending) return false;
    return persistPhraseSessionNow(pending.index, pending.filter, pending.phrases);
  }, [persistPhraseSessionNow]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setLoadState("loading");
      setLoadError("");

      try {
        const loaded = await loadPhrasesWithCache(async () => {
          const fresh = await loadPhrases();
          return {
            phrases: fresh.phrases,
            meta: {
              version: fresh.version,
              phraseLexiconHash: fresh.phraseLexiconHash,
              count: fresh.count,
              generatedAt: fresh.generatedAt
            }
          };
        });

        if (cancelled) return;

        let savedStatus = migratePhraseStatusMap(readJsonStorage(PHRASE_FLASHCARD_STATUS_KEY, {}));
        const savedPositions = migratePhraseEntryPositions(readPhraseFlashEntryPositions());
        const savedSession = readPhraseFlashSession();
        const savedDaily = readJsonStorage(PHRASE_FLASHCARD_DAILY_KEY, {});

        if (savedDaily?.date === todayKey()) {
          setDailyCount(Number(savedDaily.count) || 0);
        }

        entryPositionsRef.current = savedPositions;
        pendingSessionRef.current = savedSession && typeof savedSession === "object" ? savedSession : null;
        setStatusMap(savedStatus);
        writeJsonStorage(PHRASE_FLASHCARD_STATUS_KEY, savedStatus);
        writePhraseFlashEntryPositions(savedPositions);

        setPhrases(loaded.phrases);
        setLexiconMeta({
          version: loaded.version,
          phraseLexiconHash: loaded.phraseLexiconHash,
          count: loaded.count
        });
        setLoadState("ready");
        storageReadyRef.current = true;
      } catch (error) {
        if (cancelled) return;
        setPhrases([]);
        setLoadState("error");
        setLoadError(String(error?.message || error || "词组库加载失败"));
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    if (!storageReadyRef.current || !phrases.length || loadState !== "ready") return;

    const sessionState = studySessionRef.current;
    sessionState.wordsGeneration += 1;

    if (sessionState.userAdjusted) {
      sessionState.restored = true;
      sessionState.persistBlocked = false;
      return;
    }

    if (!shouldRunFullStudyRestore(sessionState)) return;

    const pending = pendingSessionRef.current || readPhraseFlashSession();
    if (!pending) {
      sessionState.restored = true;
      sessionState.persistBlocked = false;
      return;
    }

    const restoreFilter = pending?.filter && typeof pending.filter === "object"
      ? pending.filter
      : filter;
    const studyList = buildStudyListForFilter(phrases, restoreFilter, statusMap);
    const result = resolvePhraseStudyIndex(phrases, {
      session: pending,
      entryPositions: entryPositionsRef.current,
      filter: restoreFilter,
      statusMap,
      studyList,
      buildStudyList: buildStudyListForFilter
    });

    if (result.filter) setFilter(result.filter);

    sessionState.restored = true;
    sessionState.persistBlocked = true;
    sessionState.settling = result.index >= 0;
    sessionState.restoreTargetIndex = result.index >= 0 ? result.index : null;

    if (result.index >= 0) {
      latestPhraseStateRef.current.index = result.index;
      setIndex(result.index);
    } else {
      sessionState.persistBlocked = false;
      sessionState.settling = false;
      sessionState.restoreTargetIndex = null;
    }

    if (!sessionState.toastShown) {
      const restoredEntry = result.index >= 0 ? phrases[result.index] : null;
      const message = result.restored
        ? restoreMessageForPhraseReason(result.reason, restoredEntry?.word || "")
        : restoreMessageForPhraseReason("notFound");
      if (message) setToast(message);
      sessionState.toastShown = true;
    }
  }, [phrases, loadState, statusMap, filter]);

  useEffect(() => {
    if (!storageReadyRef.current || !studySessionRef.current.restored) return;
    if (shouldBlockStudyIndexPersist(studySessionRef.current, index)) return;
    releaseStudyPersistBlock(studySessionRef.current, index);
    queuePhraseSessionPersist();
  }, [index, filter, queuePhraseSessionPersist]);

  useEffect(() => {
    if (!storageReadyRef.current) return;

    if (statusPersistTimerRef.current) {
      clearTimeout(statusPersistTimerRef.current);
    }

    statusPersistTimerRef.current = window.setTimeout(() => {
      writeJsonStorage(PHRASE_FLASHCARD_STATUS_KEY, statusMap);
    }, 300);

    return () => {
      if (statusPersistTimerRef.current) {
        clearTimeout(statusPersistTimerRef.current);
      }
    };
  }, [statusMap]);

  useEffect(() => {
    function flushStatusMap() {
      if (!storageReadyRef.current) return;
      if (statusPersistTimerRef.current) {
        clearTimeout(statusPersistTimerRef.current);
        statusPersistTimerRef.current = null;
      }
      writeJsonStorage(PHRASE_FLASHCARD_STATUS_KEY, statusMap);
    }

    window.addEventListener("pagehide", flushStatusMap);
    return () => {
      window.removeEventListener("pagehide", flushStatusMap);
      flushStatusMap();
    };
  }, [statusMap]);

  useEffect(() => {
    const sessionState = studySessionRef.current;
    if (!sessionState.restored || loadState !== "ready" || !studyPhrases.length) return;
    if (sessionState.settling || shouldBlockStudyIndexPersist(sessionState, index)) return;
    if (studyPhrases.some((item) => item.originalIndex === effectiveIndex)) return;
    if (resolvedPhrase?.word) return;

    const nearest =
      studyPhrases.find((item) => item.originalIndex > effectiveIndex) ||
      studyPhrases[studyPhrases.length - 1];
    if (!nearest || nearest.originalIndex === effectiveIndex) return;

    sessionState.restoreTargetIndex = null;
    latestPhraseStateRef.current.index = nearest.originalIndex;
    setIndex(nearest.originalIndex);
    persistPhraseSessionNow(nearest.originalIndex);
  }, [studyPhrases, effectiveIndex, index, loadState, resolvedPhrase?.word, persistPhraseSessionNow]);

  useEffect(() => {
    function handlePageHide() {
      const latest = latestPhraseStateRef.current;
      if (!storageReadyRef.current || !studySessionRef.current.restored) return;
      if (!latest.phrases?.length) return;
      if (flushQueuedPhraseSessionPersist()) return;
      persistPhraseSessionNow(latest.index, latest.filter, latest.phrases);
    }

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      if (sessionPersistTimerRef.current) clearTimeout(sessionPersistTimerRef.current);
      flushQueuedPhraseSessionPersist();
    };
  }, [flushQueuedPhraseSessionPersist, persistPhraseSessionNow]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const playAudioUrl = useCallback(async (url, options = {}) => {
    if (!url) return false;
    try {
      const result = await playSpeechAudio(url, options);
      audioRef.current = result.audio || null;
      return Boolean(result.played);
    } catch {
      return false;
    }
  }, []);

  const getSpeechAudioResult = useCallback(async (text, kind = "phrase") => {
    const cleanText = String(text || "").trim();
    if (!cleanText) return { url: "", source: "empty", realAudio: false };
    return fetchSpeechAudioResult(cleanText, kind);
  }, []);

  const warmSpeechAudio = useCallback((text, kind = "phrase") => {
    const cleanText = String(text || "").trim();
    if (!cleanText || cleanText === "完成") return;
    preloadSpeechAudioUrl(cleanText, kind, SPEECH_WARM_OPTIONS).catch(() => {});
  }, []);

  useEffect(() => {
    if (loadState !== "ready" || isStudyEmpty) return;
    const batch = warmTtsBatchRef.current + 1;
    warmTtsBatchRef.current = batch;
    warmTtsTimersRef.current.forEach((timer) => clearTimeout(timer));
    warmTtsTimersRef.current = [];

    const targets = [
      { text: item.word, kind: "phrase" },
      { text: item.example, kind: "sentence" }
    ]
      .map((entry) => ({ ...entry, text: String(entry.text || "").trim() }))
      .filter((entry) => entry.text && entry.text !== "完成")
      .filter((entry, pos, list) => list.findIndex((other) => other.kind === entry.kind && other.text === entry.text) === pos);

    const timers = targets.map((entry, order) => window.setTimeout(() => {
      if (warmTtsBatchRef.current !== batch) return;
      warmSpeechAudio(entry.text, entry.kind);
    }, SPEECH_WARM_DELAYS_MS[order] ?? 500 + order * 300));

    warmTtsTimersRef.current = timers;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      if (warmTtsBatchRef.current === batch) warmTtsTimersRef.current = [];
    };
  }, [loadState, isStudyEmpty, item.word, item.example, warmSpeechAudio]);

  const shouldIgnoreDuplicateSpeech = useCallback((text, kind) => {
    const cleanText = String(text || "").trim();
    if (!cleanText) return false;
    const key = `${kind}:${cleanText}`;
    const now = Date.now();
    if (speechRequestRef.current.key === key && now - speechRequestRef.current.at < 700) return true;
    speechRequestRef.current = { key, at: now };
    return false;
  }, []);

  const speakPhrase = useCallback(async () => {
    const text = String(item.word || "").trim();
    if (shouldIgnoreDuplicateSpeech(text, "phrase")) return;
    if (!text) {
      setToast("没有词组可发音");
      return;
    }
    try {
      setToast("正在准备词组发音");
      const staticAudio = String(item.audio || "").trim();
      if (staticAudio && !staticAudio.startsWith("http")) {
        const played = await playAudioUrl(staticAudio.startsWith("/") ? staticAudio : `/${staticAudio}`);
        if (played) {
          setToast("播放词组发音");
          return;
        }
      }
      const result = await getSpeechAudioResult(text, "phrase");
      const played = await playAudioUrl(result.url, resolveSpeechPlaybackOptions(result, "phrase"));
      if (played) setToast(`播放词组 ${formatSpeechSourceLabel(result)}`);
    } catch {
      setToast("词组发音失败");
    }
  }, [item, getSpeechAudioResult, playAudioUrl, shouldIgnoreDuplicateSpeech]);

  const speakExample = useCallback(async () => {
    const text = String(item.example || "").trim();
    if (shouldIgnoreDuplicateSpeech(text, "sentence")) return;
    if (!text) {
      setToast("没有例句可发音");
      return;
    }
    try {
      setToast("正在准备例句发音");
      const result = await getSpeechAudioResult(text, "sentence");
      const played = await playAudioUrl(result.url, resolveSpeechPlaybackOptions(result, "sentence"));
      if (played) setToast(`播放例句 ${formatSpeechSourceLabel(result)}`);
    } catch {
      setToast("例句发音失败");
    }
  }, [item, getSpeechAudioResult, playAudioUrl, shouldIgnoreDuplicateSpeech]);

  const markUserAdjusted = useCallback(() => {
    studySessionRef.current.userAdjusted = true;
    studySessionRef.current.restoreTargetIndex = null;
    studySessionRef.current.persistBlocked = false;
  }, []);

  const setPhraseFilter = useCallback((type, value) => {
    markUserAdjusted();
    persistPhraseSessionNow(index, filter);

    const nextFilter = { type, value };
    const result = resolvePhraseFilterSwitchIndex(phrases, {
      session: { phraseKey: entryPositionsRef.current[phraseFilterKey(nextFilter)] || "", filter: nextFilter },
      entryPositions: entryPositionsRef.current,
      filter: nextFilter,
      statusMap,
      buildStudyList: buildStudyListForFilter,
      findFirstInFilter: () => {
        const first = buildPhraseStudyList(phrases, nextFilter, statusMap)[0];
        return Number.isInteger(first?.originalIndex) ? first.originalIndex : -1;
      }
    });

    setFilter(nextFilter);
    if (result.index >= 0) {
      latestPhraseStateRef.current.index = result.index;
      latestPhraseStateRef.current.filter = nextFilter;
      setIndex(result.index);
      persistPhraseSessionNow(result.index, nextFilter);
    }
  }, [phrases, statusMap, index, filter, markUserAdjusted, persistPhraseSessionNow]);

  const nextPhrase = useCallback(() => {
    markUserAdjusted();
    const latest = latestPhraseStateRef.current;
    if (!latest.studyPhrases?.length) return;

    let position = latest.studyPhrases.findIndex((entry) => entry.originalIndex === latest.index);
    if (position < 0) position = 0;
    const next = latest.studyPhrases[(position + 1) % latest.studyPhrases.length];
    latest.index = next.originalIndex;
    setIndex(next.originalIndex);
  }, [markUserAdjusted]);

  const prevPhrase = useCallback(() => {
    markUserAdjusted();
    const latest = latestPhraseStateRef.current;
    if (!latest.studyPhrases?.length) return;

    let position = latest.studyPhrases.findIndex((entry) => entry.originalIndex === latest.index);
    if (position < 0) position = 0;
    const prev = latest.studyPhrases[(position - 1 + latest.studyPhrases.length) % latest.studyPhrases.length];
    latest.index = prev.originalIndex;
    setIndex(prev.originalIndex);
  }, [markUserAdjusted]);

  nextPhraseRef.current = nextPhrase;
  prevPhraseRef.current = prevPhrase;

  const shuffleStudy = useCallback(() => {
    if (!studyPhrases.length) return;
    markUserAdjusted();
    const random = studyPhrases[Math.floor(Math.random() * studyPhrases.length)];
    latestPhraseStateRef.current.index = random.originalIndex;
    setIndex(random.originalIndex);
    persistPhraseSessionNow(random.originalIndex);
    setToast("已随机跳转");
  }, [studyPhrases, markUserAdjusted, persistPhraseSessionNow]);

  const bumpDailyCount = useCallback(() => {
    const next = dailyCount + 1;
    setDailyCount(next);
    writeJsonStorage(PHRASE_FLASHCARD_DAILY_KEY, { date: todayKey(), count: next });
  }, [dailyCount]);

  const markStatus = useCallback((status) => {
    const entry = phrases[effectiveIndex];
    if (!entry) return;
    markUserAdjusted();

    const key = normalizePhraseKey(entry);
    const current = getPhraseStatus(entry, statusMap);
    let nextStatus = status;
    if (status === PHRASE_STUDY_STATUS.UNFAMILIAR && current.status === PHRASE_STUDY_STATUS.UNFAMILIAR) {
      nextStatus = "";
    }

    setStatusMap((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        status: nextStatus,
        favorite: prev[key]?.favorite ?? current.favorite
      }
    }));

    bumpDailyCount();
    nextPhrase();
  }, [phrases, effectiveIndex, statusMap, bumpDailyCount, nextPhrase, markUserAdjusted]);

  const toggleFavorite = useCallback(() => {
    const entry = phrases[effectiveIndex];
    if (!entry) return;
    markUserAdjusted();

    const key = normalizePhraseKey(entry);
    const current = getPhraseStatus(entry, statusMap);
    setStatusMap((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        status: prev[key]?.status ?? current.status,
        favorite: !current.favorite
      }
    }));
    setToast(!current.favorite ? "已收藏" : "已取消收藏");
  }, [phrases, effectiveIndex, statusMap, markUserAdjusted]);

  useEffect(() => {
    function isTypingTarget(target) {
      const tag = target?.tagName?.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
    }

    function handleKeyDown(event) {
      if (isTypingTarget(event.target)) return;
      if (loadState !== "ready" || isStudyEmpty) return;

      if (event.key === "Tab") {
        if (event.repeat) return;
        event.preventDefault();
        speakPhrase();
        return;
      }
      if (event.key === " " || event.code === "Space") {
        if (event.repeat) return;
        event.preventDefault();
        speakExample();
        return;
      }
      if (event.key === "ArrowRight") {
        if (event.repeat) return;
        event.preventDefault();
        nextPhraseRef.current();
      }
      if (event.key === "ArrowLeft") {
        if (event.repeat) return;
        event.preventDefault();
        prevPhraseRef.current();
      }
      if (event.key === "0") {
        event.preventDefault();
        markStatus(PHRASE_STUDY_STATUS.FAMILIAR);
      }
      if (event.key === "1") {
        event.preventDefault();
        markStatus(PHRASE_STUDY_STATUS.UNFAMILIAR);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [loadState, isStudyEmpty, speakPhrase, speakExample, markStatus]);

  const itemStatus = getPhraseStatus(item, statusMap);

  if (loadState === "loading") {
    return (
      <div className="phrase-flashcard phrase-flashcard--loading">
        <StableLoadingState
          mark="P"
          eyebrow="词组刷词"
          title="正在准备词组训练"
          note="读取独立词组库并恢复学习位置"
          compact
        />
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="phrase-flashcard phrase-flashcard--error">
        <h2>词组库加载失败</h2>
        <p>{loadError}</p>
        <p className="phrase-flashcard-hint">请检查 public/data/phrases.json 是否可访问，然后刷新页面。</p>
        <button className="small-btn warm" type="button" onClick={() => window.location.reload()}>
          重新加载
        </button>
      </div>
    );
  }

  return (
    <div className="flash-training-page flash-training-page--phrase">
      <header className="topbar phrase-topbar flash-training-topbar">
        <div className="previous">
          <div className="previous-label">上一个词组</div>
          <div className="previous-word phrase-previous-word">{prevItem?.word || "—"}</div>
          <div className="previous-meta study-answer-content">{fallback(prevItem?.meaning, "释义")}</div>
        </div>

        <div className="top-actions">
          <button className="top-pill shuffle-pill" type="button" onClick={shuffleStudy} disabled={isStudyEmpty}>
            随机
          </button>
          <StudyMeaningToggle />
          <a className="top-pill spelling-entry-link" href="/spelling-words">单词拼写训练</a>
          <a className="top-pill spelling-entry-link" href="/spelling-phrases">词组拼写训练</a>

          <details className="menu">
            <summary className="top-pill">更改范围</summary>
            <div className="menu-panel wide">
              <h2 className="panel-title">词组库 · {phrases.length} 条</h2>
              <p className="panel-desc">
                已熟悉 {familiarCount} · 今日完成 {dailyCount} · 版本 {lexiconMeta.version || "—"}
              </p>
              <div className="current-filter">
                当前范围：{getPhraseFilterLabel(filter)} · {studyPhrases.length} 个词组
              </div>

              <div className="field">
                <input
                  type="text"
                  placeholder="搜索词组"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="filter-group">
                <div className="filter-title">状态</div>
                <div className="filter-chips">
                  <button className={`chip-btn ${filter.type === "all" ? "active" : ""}`} type="button" onClick={() => setPhraseFilter("all", "")}>全部待学</button>
                  <button className={`chip-btn ${filter.type === "everything" ? "active" : ""}`} type="button" onClick={() => setPhraseFilter("everything", "")}>全部词组</button>
                  {FILTER_STATUS_OPTIONS.map((value) => (
                    <button
                      key={value}
                      className={`chip-btn ${filter.type === "status" && filter.value === value ? "active" : ""}`}
                      type="button"
                      onClick={() => setPhraseFilter("status", value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div className="filter-group">
                <div className="filter-title">训练重点</div>
                <div className="phrase-priority-grid">
                  {priorityPhraseFilters.map((entry) => (
                    <button
                      key={`${entry.title}-${phraseFilterKey(entry.filter)}`}
                      className={`entry-btn phrase-priority-btn ${filter.type === entry.filter.type && filter.value === entry.filter.value ? "active" : ""}`}
                      type="button"
                      onClick={() => setPhraseFilter(entry.filter.type, entry.filter.value)}
                    >
                      <span className="entry-title">{entry.title}</span>
                      <span className="entry-desc">{entry.desc}</span>
                      <span className="entry-meta">{entry.count} 条</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="filter-group">
                <div className="filter-title">IELTS 用途</div>
                <div className="filter-chips">
                  {filterOptions.ieltsUse.map((value) => (
                    <button key={value} className={`chip-btn ${filter.type === "ielts" && filter.value === value ? "active" : ""}`} type="button" onClick={() => setPhraseFilter("ielts", value)}>
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div className="filter-group">
                <div className="filter-title">主题</div>
                <div className="filter-chips">
                  {filterOptions.topics.slice(0, 24).map((value) => (
                    <button key={value} className={`chip-btn ${filter.type === "topic" && filter.value === value ? "active" : ""}`} type="button" onClick={() => setPhraseFilter("topic", value)}>
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div className="filter-group">
                <div className="filter-title">难度</div>
                <div className="filter-chips">
                  {filterOptions.difficulties.map((value) => (
                    <button key={value} className={`chip-btn ${filter.type === "difficulty" && filter.value === value ? "active" : ""}`} type="button" onClick={() => setPhraseFilter("difficulty", value)}>
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <VirtualList
                className="library-list library-list--virtual"
                items={filteredLibrary}
                itemHeight={60}
                height={300}
                resetKey={`${phraseFilterKey(filter)}:${search}:${filteredLibrary.length}`}
                getKey={({ entry, originalIndex }) => `${entry.id || entry.word}-${originalIndex}`}
                renderItem={({ entry, originalIndex }) => (
                  <div
                    className={`library-item ${originalIndex === effectiveIndex ? "active" : ""}`}
                    onClick={() => {
                      markUserAdjusted();
                      latestPhraseStateRef.current.index = originalIndex;
                      setIndex(originalIndex);
                      persistPhraseSessionNow(originalIndex);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      markUserAdjusted();
                      latestPhraseStateRef.current.index = originalIndex;
                      setIndex(originalIndex);
                      persistPhraseSessionNow(originalIndex);
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`跳转到词组 ${entry.word}`}
                  >
                    <div className="library-word">{entry.word}</div>
                    <div className="library-meta">{entry.difficulty || "—"}</div>
                  </div>
                )}
              />
              <p className="library-list-note">
                共 {filteredLibrary.length} 条，已启用虚拟滚动；继续输入搜索可快速定位。
              </p>
            </div>
          </details>
        </div>
      </header>

      <StudyRangeSummary
        mode="刷词组"
        title={getPhraseFilterLabel(filter)}
        meta={`${studyPhrases.length} 个词组`}
        detail={
          isStudyEmpty
            ? "当前范围没有待学词组，可以更改范围或切到全部词组。"
            : !isStudyEmpty && currentStudyPosition < 0 && resolvedPhrase?.word
              ? `已恢复到：${resolvedPhrase.word}（不在当前待学范围，按 ←/→ 可回到队列）`
              : `当前位置：${safeStudyPosition + 1} / ${studyPhrases.length} · 当前词组：${item.word || "—"}`
        }
        className="phrase-study-range"
      />

      <section className="main phrase-main flash-training-main">
          <div className="center phrase-center flash-training-card">
          <div className="phrase-type-badge">词组</div>

          <div className="flash-training-toolbar">
            <div className="flash-training-toolbar__media">
              <button className="hero-sound-btn hero-sound-btn--word" type="button" onClick={speakPhrase} title="播放词组 (Tab)" aria-label="播放词组">
                <span aria-hidden="true">🔊</span>
                <span>Tab·词组</span>
              </button>
              <button className="hero-sound-btn" type="button" onClick={speakExample} title="播放例句 (空格)" aria-label="播放例句">
                <span aria-hidden="true">🔊</span>
                <span>空格·例句</span>
              </button>
              <button className="phrase-toggle-btn" type="button" onClick={() => setExampleOpen((v) => !v)}>
                {exampleOpen ? "收起例句" : "展开例句"}
              </button>
            </div>
            <button className="star-mid flash-training-star" type="button" disabled={isStudyEmpty} onClick={toggleFavorite} title="收藏" aria-label="收藏">
              {itemStatus.favorite ? "★" : "☆"}
            </button>
          </div>

          <div className={`phrase-example-box flash-training-example study-answer-content ${exampleOpen ? "open" : "collapsed"}`}>
            {exampleOpen ? (
              <div
                className="example-clickable"
                onClick={speakExample}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    speakExample();
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label="播放例句"
              >
                <div className="example">{fallback(item.example, "暂无例句")}</div>
                {item.exampleCn ? <div className="example-cn phrase-example-cn">{item.exampleCn}</div> : null}
              </div>
            ) : null}
          </div>

          {itemStatus.status === PHRASE_STUDY_STATUS.UNFAMILIAR ? (
            <div className="unfamiliar-alert">
              <span className="unfamiliar-dot">!</span>
              已标记为不熟，优先复习
            </div>
          ) : null}

          <div className="phrase-word-row phrase-hero-row">
            <div
              className="phrase-text"
              onClick={speakPhrase}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  speakPhrase();
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`播放词组 ${item.word || ""}`}
            >
              {fallback(item.word, "—")}
            </div>
          </div>

          <div className="phrase-basic-line study-answer-content">
            {item.phonetic ? <span className="phonetic">{item.phonetic}</span> : null}
            {item.phonetic ? <span className="dot">·</span> : null}
            <span className="phrase-meaning">{fallback(item.meaning, "等待释义")}</span>
          </div>

          {item.definition ? <div className="phrase-definition study-answer-content">{item.definition}</div> : null}

          {(item.ieltsUse?.length || item.topics?.length) ? (
            <div className="phrase-tags study-answer-content">
              {(item.ieltsUse || []).map((tag) => (
                <span className="phrase-tag" key={`use-${tag}`}>{tag}</span>
              ))}
              {(item.topics || []).map((tag) => (
                <span className="phrase-tag phrase-tag--topic" key={`topic-${tag}`}>{tag}</span>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <footer className="bottom phrase-bottom flash-training-footer">
        <div className="flash-training-nav-group phrase-nav-row">
          <button className="small-btn ghost flash-training-nav-btn" type="button" disabled={isStudyEmpty} onClick={prevPhrase}>上一个</button>
          <button className="small-btn ghost flash-training-nav-btn" type="button" disabled={isStudyEmpty} onClick={nextPhrase}>下一个</button>
        </div>

        <div className="flash-training-decision-group actions">
          <button
            className="status known"
            type="button"
            disabled={isStudyEmpty}
            onClick={() => markStatus(PHRASE_STUDY_STATUS.FAMILIAR)}
            title="快捷键：0"
          >
            熟悉
          </button>
          <button
            className={`status unknown ${itemStatus.status === PHRASE_STUDY_STATUS.UNFAMILIAR ? "active-unknown" : ""}`}
            type="button"
            disabled={isStudyEmpty}
            onClick={() => markStatus(PHRASE_STUDY_STATUS.UNFAMILIAR)}
            title="快捷键：1"
          >
            {itemStatus.status === PHRASE_STUDY_STATUS.UNFAMILIAR ? "取消不熟" : "不熟"}
          </button>
        </div>

        <div className="flash-training-progress progress-row">
          <div className="progress">
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="count">
            {isStudyEmpty ? "0 / 0" : `${safeStudyPosition + 1} / ${studyPhrases.length}`}
            <span className="phrase-daily-count"> · 今日 {dailyCount}</span>
          </div>
        </div>
      </footer>

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}
