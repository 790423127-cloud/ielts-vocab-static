"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SatelliteLexiconFlashcard from "../components/SatelliteLexiconFlashcard";
import StableLoadingState from "../components/StableLoadingState";
import { useOrderedStudyRows } from "../hooks/useOrderedStudyRows.js";
import { loadBasicWords, normalizeBasicWordKey } from "../lib/basic-vocab/load-basic-words.mjs";
import {
  BASIC_LEARNING_ENTRIES,
  BASIC_STATUS,
  buildBasicStudyList,
  filterKey,
  getBasicFilterLabel,
  getBasicWordStatus,
  isBasicFavorite,
  patchBasicWordStatus,
  readBasicDailyCount,
  readBasicPositions,
  readBasicSession,
  readBasicStatusMap,
  writeBasicDailyCount,
  writeBasicPositions,
  writeBasicSession,
  writeBasicStatusMap
} from "../lib/basic-vocab/storage.mjs";
import {
  fetchSpeechAudioResult,
  preloadSpeechAudioUrl
} from "../lib/vocab-speech.mjs";
import {
  playSpeechAudio,
  resolveSpeechPlaybackOptions
} from "../lib/speech-audio-playback.mjs";
import {
  getIelts538ProgressKey,
  loadIelts538Words
} from "../lib/ielts-538/load-ielts-538.mjs";
import { advanceStudyQueueAfterExit } from "../lib/vocab/study-queue-delete.mjs";
import {
  IELTS_538_LEARNING_ENTRIES,
  IELTS_538_STATUS,
  buildIelts538StudyList,
  getIelts538FilterLabel,
  getIelts538WordStatus,
  ielts538FilterKey,
  isIelts538Favorite,
  patchIelts538WordStatus,
  readIelts538DailyCount,
  readIelts538Positions,
  readIelts538Session,
  readIelts538StatusMap,
  writeIelts538DailyCount,
  writeIelts538Positions,
  writeIelts538Session,
  writeIelts538StatusMap
} from "../lib/ielts-538/storage.mjs";

const STATUS_CHIPS = [
  { label: "全部待学", filter: { type: "all", value: "" } },
  { label: "不熟", filter: { type: "status", value: "不熟" } },
  { label: "熟悉", filter: { type: "status", value: "熟悉" } },
  { label: "收藏", filter: { type: "status", value: "收藏" } }
];

const BASIC_CHIP_GROUPS = [
  {
    title: "状态",
    chips: [
      STATUS_CHIPS[0],
      { label: "全部零基础词", filter: { type: "everything", value: "" } },
      ...STATUS_CHIPS.slice(1)
    ]
  },
  {
    title: "主题",
    chips: [
      "问候", "人称", "数字", "颜色", "时间", "家庭", "身体", "学校", "家", "食物",
      "衣服", "地点", "天气", "动物", "动词", "介词", "购物", "健康", "科技", "职业"
    ].map((value) => ({ label: value, filter: { type: "topic", value } }))
  }
];

const IELTS_538_GROUP_FILTERS = [
  ["1:1", "第1类 · 第1组"],
  ["2:1", "第2类 · 第1组"],
  ["2:2", "第2类 · 第2组"],
  ["3:1", "第3类 · 第1组"],
  ["3:2", "第3类 · 第2组"],
  ["3:3", "第3类 · 第3组"],
  ["3:4", "第3类 · 第4组"],
  ["3:5", "第3类 · 第5组"]
];

const IELTS_538_CHIP_GROUPS = [
  {
    title: "状态",
    chips: [
      STATUS_CHIPS[0],
      { label: "全部 376 词", filter: { type: "everything", value: "" } },
      ...STATUS_CHIPS.slice(1)
    ]
  },
  {
    title: "原书分组",
    chips: IELTS_538_GROUP_FILTERS.map(([value, label]) => ({
      label,
      filter: { type: "group", value }
    }))
  }
];

const BASIC_CONFIG = {
  modeLabel: "零基础单词",
  loadingWord: "正在读取零基础词库",
  loadingEyebrow: "零基础单词",
  loadingNote: "读取独立词库并恢复上次学习位置",
  emptyMeaning: "当前范围没有待学零基础词",
  emptyDetail: "当前范围没有待学内容，可以更改范围或切到全部零基础词。",
  loadEmptyError: "基础词库为空。请确认 public/data/basic-words.json 存在。",
  loadFallbackError: "基础词库加载失败",
  loadWords: loadBasicWords,
  wordKey: (word) => normalizeBasicWordKey(word?.word || word),
  learningEntries: BASIC_LEARNING_ENTRIES,
  status: BASIC_STATUS,
  buildStudyList: buildBasicStudyList,
  getFilterLabel: getBasicFilterLabel,
  getWordStatus: getBasicWordStatus,
  isFavorite: isBasicFavorite,
  patchWordStatus: patchBasicWordStatus,
  storageFilterKey: filterKey,
  readDailyCount: readBasicDailyCount,
  readPositions: readBasicPositions,
  readSession: readBasicSession,
  readStatusMap: readBasicStatusMap,
  writeDailyCount: writeBasicDailyCount,
  writePositions: writeBasicPositions,
  writeSession: writeBasicSession,
  writeStatusMap: writeBasicStatusMap,
  chipGroups: BASIC_CHIP_GROUPS,
  statsPrefix: "独立零基础词库",
  extraLinks: [
    { href: "/ielts-538", label: "538考点" },
    { href: "/reading-g", label: "G类阅读提升" },
    { href: "/spelling-words", label: "单词拼写训练" },
    { href: "/meaning", label: "看词选意思 · 核心6000" }
  ]
};

const IELTS_538_CONFIG = {
  modeLabel: "538考点",
  loadingWord: "正在读取 538 考点词库",
  loadingEyebrow: "538考点",
  loadingNote: "读取 376 条独立词库并恢复上次学习位置",
  emptyMeaning: "当前范围没有待学的 538 考点词",
  emptyDetail: "当前范围没有待学内容，可以更改范围或切到全部 376 词。",
  loadEmptyError: "538 考点词库为空。请确认 public/data/ielts-538-words.json 存在。",
  loadFallbackError: "538 考点词库加载失败",
  loadWords: loadIelts538Words,
  wordKey: getIelts538ProgressKey,
  learningEntries: IELTS_538_LEARNING_ENTRIES,
  status: IELTS_538_STATUS,
  buildStudyList: buildIelts538StudyList,
  getFilterLabel: getIelts538FilterLabel,
  getWordStatus: getIelts538WordStatus,
  isFavorite: isIelts538Favorite,
  patchWordStatus: patchIelts538WordStatus,
  storageFilterKey: ielts538FilterKey,
  readDailyCount: readIelts538DailyCount,
  readPositions: readIelts538Positions,
  readSession: readIelts538Session,
  readStatusMap: readIelts538StatusMap,
  writeDailyCount: writeIelts538DailyCount,
  writePositions: writeIelts538Positions,
  writeSession: writeIelts538Session,
  writeStatusMap: writeIelts538StatusMap,
  chipGroups: IELTS_538_CHIP_GROUPS,
  statsPrefix: "独立 538 考点词库",
  extraLinks: [
    { href: "/reading-g", label: "G类阅读提升" },
    { href: "/basic", label: "零基础词库" },
    { href: "/spelling-words", label: "单词拼写训练" }
  ]
};

export function StandaloneWordsPage({ lexicon = "basic" }) {
  const config = lexicon === "ielts538" ? IELTS_538_CONFIG : BASIC_CONFIG;
  const {
    buildStudyList,
    getFilterLabel,
    getWordStatus,
    isFavorite,
    learningEntries,
    loadWords,
    patchWordStatus,
    readDailyCount,
    readPositions,
    readSession,
    readStatusMap,
    status,
    storageFilterKey,
    wordKey,
    writeDailyCount,
    writePositions,
    writeSession,
    writeStatusMap
  } = config;
  const [phase, setPhase] = useState("loading");
  const [words, setWords] = useState([]);
  const [meta, setMeta] = useState({ version: "", count: 0 });
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [filter, setFilter] = useState({ type: "all", value: "" });
  const [statusMap, setStatusMap] = useState({});
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [dailyCount, setDailyCount] = useState(0);

  const audioRef = useRef(null);
  const loadAttempted = useRef(false);
  const storageReadyRef = useRef(false);
  const positionsRef = useRef({});
  const restoredRef = useRef(false);
  const liveStudyRef = useRef({
    words: [],
    index: 0,
    filter: { type: "all", value: "" },
    statusMap: {},
    studyList: [],
    safeStudyPosition: 0,
    dailyCount: 0
  });

  useEffect(() => {
    if (loadAttempted.current) return;
    loadAttempted.current = true;
    let cancelled = false;

    async function load() {
      try {
        const loaded = await loadWords();
        if (cancelled) return;

        if (!loaded.words.length) {
          setError(config.loadEmptyError);
          setPhase("error");
          return;
        }

        const savedStatus = readStatusMap();
        const savedPositions = readPositions();
        const savedSession = readSession();
        const savedDaily = readDailyCount();

        positionsRef.current = savedPositions;
        setStatusMap(savedStatus);
        setDailyCount(savedDaily);
        setWords(loaded.words);
        setMeta({
          version: loaded.version,
          count: loaded.count || loaded.words.length
        });
        setPhase("ready");
        storageReadyRef.current = true;

        const restoreFilter =
          savedSession?.filter
          && typeof savedSession.filter === "object"
          && savedSession.filter.type
            ? savedSession.filter
            : { type: "all", value: "" };
        setFilter(restoreFilter);
        const restoreKey =
          savedSession?.wordKey
          || positionsRef.current[storageFilterKey(restoreFilter)]
          || "";
        const restoreList = buildStudyList(loaded.words, restoreFilter, savedStatus);
        const restoredRow = restoreKey
          ? restoreList.find((row) => wordKey(row.entry) === restoreKey)
          : null;
        const restoredIndex = restoredRow?.originalIndex ?? restoreList[0]?.originalIndex;
        if (Number.isInteger(restoredIndex)) setIndex(restoredIndex);
        restoredRef.current = true;
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || config.loadFallbackError);
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
  }, [
    config.loadEmptyError,
    config.loadFallbackError,
    buildStudyList,
    loadWords,
    readDailyCount,
    readPositions,
    readSession,
    readStatusMap,
    storageFilterKey,
    wordKey
  ]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const baseStudyList = useMemo(
    () => buildStudyList(words, filter, statusMap),
    [buildStudyList, words, filter, statusMap]
  );
  const wordOrdering = useOrderedStudyRows({
    orderKey: `${lexicon}:${storageFilterKey(filter)}`,
    rows: baseStudyList,
    pool: words,
    currentIndex: index,
    difficultyEnabled: lexicon !== "ielts538"
  });
  const studyList = wordOrdering.rows;

  const currentStudyPosition = useMemo(
    () => studyList.findIndex((item) => item.originalIndex === index),
    [studyList, index]
  );
  const safeStudyPosition = currentStudyPosition >= 0 ? currentStudyPosition : 0;
  const isStudyEmpty = studyList.length === 0;
  const item = isStudyEmpty
    ? {
        word: phase === "loading" ? config.loadingWord : "完成",
        phonetic: "",
        pos: "",
        meaning: phase === "loading" ? "请稍候" : config.emptyMeaning,
        example: "",
        exampleCn: "",
        definition: ""
      }
    : words[index] || studyList[0]?.entry || {};

  const prevItem = studyList.length
    ? studyList[(safeStudyPosition - 1 + studyList.length) % studyList.length]?.entry
    : null;

  const progressPercent = studyList.length
    ? Math.max(1, ((safeStudyPosition + 1) / studyList.length) * 100)
    : 0;

  liveStudyRef.current = {
    words,
    index,
    filter,
    statusMap,
    studyList,
    safeStudyPosition,
    dailyCount
  };

  const familiarCount = useMemo(
    () => words.filter((word) => getWordStatus(word, statusMap) === status.FAMILIAR).length,
    [getWordStatus, status, words, statusMap]
  );
  const unfamiliarCount = useMemo(
    () => words.filter((word) => getWordStatus(word, statusMap) === status.UNFAMILIAR).length,
    [getWordStatus, status, words, statusMap]
  );

  const learningEntryGroups = useMemo(() => {
    return learningEntries.map((group) => ({
      ...group,
      items: group.items.map((entry) => ({
        ...entry,
        count: buildStudyList(words, entry.filter, statusMap).length
      }))
    }));
  }, [buildStudyList, learningEntries, words, statusMap]);

  const libraryRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return words
      .map((entry, originalIndex) => ({ entry, originalIndex }))
      .filter(({ entry }) => {
        if (!q) return true;
        return (
          String(entry.word || "").toLowerCase().includes(q) ||
          String(entry.meaning || "").includes(q)
        );
      });
  }, [words, search]);

  const persistSession = useCallback((nextIndex, nextFilter = filter) => {
    if (!storageReadyRef.current || !restoredRef.current) return;
    const word = words[nextIndex];
    if (!word) return;
    const key = wordKey(word);
    positionsRef.current[storageFilterKey(nextFilter)] = key;
    writePositions(positionsRef.current);
    writeSession({
      wordKey: key,
      filter: nextFilter,
      index: nextIndex,
      savedAt: new Date().toISOString()
    });
  }, [filter, storageFilterKey, wordKey, words, writePositions, writeSession]);

  const changeWordOrderMode = useCallback((nextMode) => {
    const nextIndex = wordOrdering.changeMode(nextMode);
    if (!Number.isInteger(nextIndex)) return;
    setIndex(nextIndex);
    persistSession(nextIndex);
  }, [persistSession, wordOrdering]);
  const changeWordDifficultyMode = useCallback((nextMode) => {
    const nextIndex = wordOrdering.changeDifficultyMode(nextMode);
    if (!Number.isInteger(nextIndex)) return;
    setIndex(nextIndex);
    persistSession(nextIndex);
  }, [persistSession, wordOrdering]);

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
        utterance.rate = 0.86;
        window.speechSynthesis.speak(utterance);
      }
    } catch {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(value);
        utterance.lang = "en-US";
        utterance.rate = 0.86;
        window.speechSynthesis.speak(utterance);
      } else {
        setToast("发音暂不可用");
      }
    }
  }, []);

  useEffect(() => {
    if (phase !== "ready" || isStudyEmpty || !item?.word) return;
    preloadSpeechAudioUrl(item.word, "word").catch(() => {});
    if (item.example) preloadSpeechAudioUrl(item.example, "sentence").catch(() => {});
  }, [phase, isStudyEmpty, item?.word, item?.example]);


  function goToStudyOffset(delta) {
    if (!studyList.length) return;
    const nextPos = (safeStudyPosition + delta + studyList.length) % studyList.length;
    const nextIndex = studyList[nextPos].originalIndex;
    setIndex(nextIndex);
    persistSession(nextIndex);
  }

  function setLibraryFilter(nextFilter) {
    setFilter(nextFilter);
    const list = buildStudyList(words, nextFilter, statusMap);
    const savedKey = positionsRef.current[storageFilterKey(nextFilter)];
    let nextIndex = list[0]?.originalIndex ?? 0;

    if (savedKey) {
      const found = list.find(
        (row) => wordKey(row.entry) === savedKey
      );
      if (found) nextIndex = found.originalIndex;
    }

    setIndex(nextIndex);
    persistSession(nextIndex, nextFilter);
    setToast(`已切换：${getFilterLabel(nextFilter)}`);
  }

  function markStatus(nextRequestedStatus) {
    const live = liveStudyRef.current;
    const activeWords = Array.isArray(live.words) ? live.words : [];
    const activeStudyList = Array.isArray(live.studyList) ? live.studyList : [];
    const activeFilter = live.filter || { type: "all", value: "" };
    const activeStatusMap = live.statusMap || {};
    const currentItem = activeWords[live.index]
      || activeStudyList.find((row) => row.originalIndex === live.index)?.entry
      || null;
    if (!activeStudyList.length || !currentItem?.word) return;

    const current = getWordStatus(currentItem, activeStatusMap);
    const nextStatus =
      nextRequestedStatus === status.UNFAMILIAR && current === status.UNFAMILIAR
        ? status.PENDING
        : nextRequestedStatus;
    const nextMap = patchWordStatus(activeStatusMap, currentItem, { status: nextStatus });
    setStatusMap(nextMap);
    writeStatusMap(nextMap);

    let nextDaily = live.dailyCount;
    if (nextStatus === status.FAMILIAR || nextStatus === status.UNFAMILIAR) {
      nextDaily += 1;
      setDailyCount(nextDaily);
      writeDailyCount(nextDaily);
    }

    setToast(
      nextStatus === status.FAMILIAR
        ? "已标记熟悉"
        : nextStatus === status.UNFAMILIAR
          ? "已标记不熟"
          : "已取消不熟"
    );

    const nextEligibleList = buildStudyList(activeWords, activeFilter, nextMap);
    const currentId = String(currentItem.id || "").trim();
    const stillHere = nextEligibleList.some((row) => row.originalIndex === live.index);
    let nextRow = null;
    let nextStudyList = activeStudyList;

    if (!stillHere) {
      const advanced = advanceStudyQueueAfterExit(activeStudyList, currentId, nextEligibleList);
      nextStudyList = advanced?.nextList || nextEligibleList;
      nextRow =
        advanced?.landingRow
        || nextEligibleList[Math.min(live.safeStudyPosition, Math.max(0, nextEligibleList.length - 1))]
        || nextEligibleList[0]
        || null;
    } else {
      const currentPos = activeStudyList.findIndex((row) => row.originalIndex === live.index);
      const nextPos = currentPos >= 0
        ? (currentPos + 1) % activeStudyList.length
        : Math.min(live.safeStudyPosition, activeStudyList.length - 1);
      nextRow = activeStudyList[nextPos] || null;
    }

    const nextIndex = Number.isInteger(nextRow?.originalIndex) ? nextRow.originalIndex : live.index;
    liveStudyRef.current = {
      ...live,
      index: nextIndex,
      statusMap: nextMap,
      studyList: nextStudyList,
      safeStudyPosition: nextRow
        ? Math.max(0, nextStudyList.findIndex((row) => row.originalIndex === nextIndex))
        : 0,
      dailyCount: nextDaily
    };

    if (nextRow) {
      setIndex(nextIndex);
      persistSession(nextIndex, activeFilter);
    } else if (!nextEligibleList.length) {
      setIndex(0);
    }
  }

  function toggleFavorite() {
    if (isStudyEmpty || !item?.word) return;
    const nextFavorite = !isFavorite(item, statusMap);
    const nextMap = patchWordStatus(statusMap, item, { favorite: nextFavorite });
    setStatusMap(nextMap);
    writeStatusMap(nextMap);
    setToast(nextFavorite ? "已收藏" : "已取消收藏");
  }

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

      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        goToStudyOffset(1);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        goToStudyOffset(-1);
      } else if (event.key === "Tab") {
        event.preventDefault();
        speakText(item?.word, "word");
      } else if (event.key === " " || event.key === "Enter") {
        if (event.key === " ") event.preventDefault();
        if (event.key === " ") speakText(item?.example, "sentence");
      } else if (event.key === "1") {
        event.preventDefault();
        markStatus(status.FAMILIAR);
      } else if (event.key === "3") {
        event.preventDefault();
        markStatus(status.UNFAMILIAR);
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, item?.word, item?.example, studyList, safeStudyPosition, statusMap, filter, index]);

  if (phase === "loading") {
    return (
      <main className="page page--word-flash system-loading-page">
        <StableLoadingState
          mark="A"
          eyebrow={config.loadingEyebrow}
          note={config.loadingNote}
        />
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="page page--word-flash system-loading-page">
        <StableLoadingState
          mark="A"
          eyebrow={config.loadingEyebrow}
          title="词库暂时无法读取"
          note={error}
          variant="error"
          actionHref="/"
          actionLabel="返回主词库"
        />
      </main>
    );
  }

  const rangeTitle = getFilterLabel(filter);
  const studyRangeDetail = isStudyEmpty
    ? config.emptyDetail
    : `当前位置：${safeStudyPosition + 1} / ${studyList.length} · 当前词：${item.word || "—"} · 今日 ${dailyCount}`;

  return (
    <SatelliteLexiconFlashcard
      layoutMode={lexicon === "ielts538" ? "ielts538" : "default"}
      modeLabel={config.modeLabel}
      rangeTitle={rangeTitle}
      rangeMeta={`${studyList.length} 个词 · 词库 ${meta.count.toLocaleString()}`}
      rangeDetail={studyRangeDetail}
      prevItem={prevItem}
      item={item}
      isStudyEmpty={isStudyEmpty}
      isFavorite={isFavorite(item, statusMap)}
      itemStatus={getWordStatus(item, statusMap)}
      filter={filter}
      learningEntryGroups={learningEntryGroups}
      libraryRows={libraryRows}
      index={index}
      safeStudyPosition={safeStudyPosition}
      studyCount={studyList.length}
      progressPercent={progressPercent}
      search={search}
      setSearch={setSearch}
      onFilter={setLibraryFilter}
      onJumpIndex={(originalIndex) => {
        setIndex(originalIndex);
        persistSession(originalIndex);
      }}
      onMarkFamiliar={() => markStatus(status.FAMILIAR)}
      onMarkUnfamiliar={() => markStatus(status.UNFAMILIAR)}
      onToggleFavorite={toggleFavorite}
      onSpeakWord={() => speakText(item?.word, "word")}
      onSpeakExample={() => speakText(item?.example, "sentence")}
      onSpeakSmall={(text) => speakText(text, "phrase")}
      wordOrderMode={wordOrdering.mode}
      wordOrderDifficultyMode={wordOrdering.difficultyMode}
      wordOrderDifficultyAvailable={wordOrdering.difficultyAvailable}
      wordOrderDifficultyEnabled={lexicon !== "ielts538"}
      wordOrderDifficultyProfile={wordOrdering.difficultyProfile}
      onWordOrderModeChange={changeWordOrderMode}
      onWordDifficultyModeChange={changeWordDifficultyMode}
      onPrev={() => goToStudyOffset(-1)}
      onNext={() => goToStudyOffset(1)}
      overviewWords={studyList.map(({ entry }) => ({
        ...entry,
        status: getWordStatus(entry, statusMap),
        favorite: isFavorite(entry, statusMap)
      }))}
      overviewStats={{
        familiar: familiarCount,
        unfamiliar: unfamiliarCount,
        todayReviewed: dailyCount
      }}
      statsLine={`${config.statsPrefix} ${meta.count.toLocaleString()} · 熟悉 ${familiarCount} · 不熟 ${unfamiliarCount} · 今日 ${dailyCount} · ${meta.version}`}
      toast={toast}
      extraLinks={config.extraLinks}
      chipGroups={config.chipGroups}
    />
  );
}

export default function BasicWordsPage() {
  return <StandaloneWordsPage lexicon="basic" />;
}
