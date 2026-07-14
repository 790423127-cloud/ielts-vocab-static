"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SatelliteLexiconFlashcard from "../components/SatelliteLexiconFlashcard";
import StableLoadingState from "../components/StableLoadingState";
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

export default function BasicWordsPage() {
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

  useEffect(() => {
    if (loadAttempted.current) return;
    loadAttempted.current = true;
    let cancelled = false;

    async function load() {
      try {
        const loaded = await loadBasicWords();
        if (cancelled) return;

        if (!loaded.words.length) {
          setError("基础词库为空。请确认 public/data/basic-words.json 存在。");
          setPhase("error");
          return;
        }

        const savedStatus = readBasicStatusMap();
        const savedPositions = readBasicPositions();
        const savedSession = readBasicSession();
        const savedDaily = readBasicDailyCount();

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

        const restoreKey = savedSession?.wordKey || positionsRef.current[filterKey({ type: "all", value: "" })] || "";
        if (restoreKey) {
          const found = loaded.words.findIndex(
            (word) => normalizeBasicWordKey(word.word) === restoreKey
          );
          if (found >= 0) setIndex(found);
        }
        restoredRef.current = true;
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "基础词库加载失败");
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
    const timer = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const studyList = useMemo(
    () => buildBasicStudyList(words, filter, statusMap),
    [words, filter, statusMap]
  );

  const currentStudyPosition = useMemo(
    () => studyList.findIndex((item) => item.originalIndex === index),
    [studyList, index]
  );
  const safeStudyPosition = currentStudyPosition >= 0 ? currentStudyPosition : 0;
  const isStudyEmpty = studyList.length === 0;
  const item = isStudyEmpty
    ? {
        word: phase === "loading" ? "正在读取零基础词库" : "完成",
        phonetic: "",
        pos: "",
        meaning: phase === "loading" ? "请稍候" : "当前范围没有待学零基础词",
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

  const familiarCount = useMemo(
    () => words.filter((word) => getBasicWordStatus(word, statusMap) === BASIC_STATUS.FAMILIAR).length,
    [words, statusMap]
  );
  const unfamiliarCount = useMemo(
    () => words.filter((word) => getBasicWordStatus(word, statusMap) === BASIC_STATUS.UNFAMILIAR).length,
    [words, statusMap]
  );

  const learningEntryGroups = useMemo(() => {
    return BASIC_LEARNING_ENTRIES.map((group) => ({
      ...group,
      items: group.items.map((entry) => ({
        ...entry,
        count: buildBasicStudyList(words, entry.filter, statusMap).length
      }))
    }));
  }, [words, statusMap]);

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
    const key = normalizeBasicWordKey(word.word);
    positionsRef.current[filterKey(nextFilter)] = key;
    writeBasicPositions(positionsRef.current);
    writeBasicSession({
      wordKey: key,
      filter: nextFilter,
      index: nextIndex,
      savedAt: new Date().toISOString()
    });
  }, [filter, words]);

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
    const list = buildBasicStudyList(words, nextFilter, statusMap);
    const savedKey = positionsRef.current[filterKey(nextFilter)];
    let nextIndex = list[0]?.originalIndex ?? 0;

    if (savedKey) {
      const found = list.find(
        (row) => normalizeBasicWordKey(row.entry.word) === savedKey
      );
      if (found) nextIndex = found.originalIndex;
    }

    setIndex(nextIndex);
    persistSession(nextIndex, nextFilter);
    setToast(`已切换：${getBasicFilterLabel(nextFilter)}`);
  }

  function markStatus(status) {
    if (isStudyEmpty || !item?.word) return;
    const current = getBasicWordStatus(item, statusMap);
    const nextStatus =
      status === BASIC_STATUS.UNFAMILIAR && current === BASIC_STATUS.UNFAMILIAR
        ? BASIC_STATUS.PENDING
        : status;
    const nextMap = patchBasicWordStatus(statusMap, item, { status: nextStatus });
    setStatusMap(nextMap);
    writeBasicStatusMap(nextMap);

    if (nextStatus === BASIC_STATUS.FAMILIAR || nextStatus === BASIC_STATUS.UNFAMILIAR) {
      const nextDaily = dailyCount + 1;
      setDailyCount(nextDaily);
      writeBasicDailyCount(nextDaily);
    }

    setToast(
      nextStatus === BASIC_STATUS.FAMILIAR
        ? "已标记熟悉"
        : nextStatus === BASIC_STATUS.UNFAMILIAR
          ? "已标记不熟"
          : "已取消不熟"
    );

    window.setTimeout(() => {
      const nextList = buildBasicStudyList(words, filter, nextMap);
      if (!nextList.length) return;
      const stillHere = nextList.some((row) => row.originalIndex === index);
      if (!stillHere) {
        const nextIndex =
          nextList[Math.min(safeStudyPosition, nextList.length - 1)]?.originalIndex ??
          nextList[0].originalIndex;
        setIndex(nextIndex);
        persistSession(nextIndex);
      } else if (nextStatus === BASIC_STATUS.FAMILIAR) {
        goToStudyOffset(1);
      }
    }, 120);
  }

  function toggleFavorite() {
    if (isStudyEmpty || !item?.word) return;
    const nextFavorite = !isBasicFavorite(item, statusMap);
    const nextMap = patchBasicWordStatus(statusMap, item, { favorite: nextFavorite });
    setStatusMap(nextMap);
    writeBasicStatusMap(nextMap);
    setToast(nextFavorite ? "已收藏" : "已取消收藏");
  }

  function shuffleStudy() {
    if (!studyList.length) return;
    const pick = studyList[Math.floor(Math.random() * studyList.length)];
    setIndex(pick.originalIndex);
    persistSession(pick.originalIndex);
    setToast("已随机跳转");
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
      } else if (event.key === "Tab") {
        event.preventDefault();
        speakText(item?.word, "word");
      } else if (event.key === " " || event.key === "Enter") {
        if (event.key === " ") event.preventDefault();
        if (event.key === " ") speakText(item?.example, "sentence");
      } else if (event.key === "0" || event.key === "2") {
        event.preventDefault();
        markStatus(BASIC_STATUS.FAMILIAR);
      } else if (event.key === "1") {
        event.preventDefault();
        markStatus(BASIC_STATUS.UNFAMILIAR);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, item?.word, item?.example, studyList, safeStudyPosition, statusMap, filter, index]);

  if (phase === "loading") {
    return (
      <main className="page page--word-flash system-loading-page">
        <StableLoadingState
          mark="A"
          eyebrow="零基础单词"
          note="读取独立词库并恢复上次学习位置"
        />
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="page page--word-flash system-loading-page">
        <StableLoadingState
          mark="A"
          eyebrow="零基础单词"
          title="词库暂时无法读取"
          note={error}
          variant="error"
          actionHref="/"
          actionLabel="返回主词库"
        />
      </main>
    );
  }

  const rangeTitle = getBasicFilterLabel(filter);
  const studyRangeDetail = isStudyEmpty
    ? "当前范围没有待学内容，可以更改范围或切到全部零基础词。"
    : `当前位置：${safeStudyPosition + 1} / ${studyList.length} · 当前词：${item.word || "—"} · 今日 ${dailyCount}`;

  const chipGroups = [
    {
      title: "状态",
      chips: [
        { label: "全部待学", filter: { type: "all", value: "" } },
        { label: "全部零基础词", filter: { type: "everything", value: "" } },
        { label: "不熟", filter: { type: "status", value: "不熟" } },
        { label: "熟悉", filter: { type: "status", value: "熟悉" } },
        { label: "收藏", filter: { type: "status", value: "收藏" } }
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

  return (
    <SatelliteLexiconFlashcard
      modeLabel="零基础单词"
      rangeTitle={rangeTitle}
      rangeMeta={`${studyList.length} 个词 · 词库 ${meta.count.toLocaleString()}`}
      rangeDetail={studyRangeDetail}
      prevItem={prevItem}
      item={item}
      isStudyEmpty={isStudyEmpty}
      isFavorite={isBasicFavorite(item, statusMap)}
      itemStatus={getBasicWordStatus(item, statusMap)}
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
      onMarkFamiliar={() => markStatus(BASIC_STATUS.FAMILIAR)}
      onMarkUnfamiliar={() => markStatus(BASIC_STATUS.UNFAMILIAR)}
      onToggleFavorite={toggleFavorite}
      onSpeakWord={() => speakText(item?.word, "word")}
      onSpeakExample={() => speakText(item?.example, "sentence")}
      onSpeakSmall={(text) => speakText(text, "phrase")}
      onShuffle={shuffleStudy}
      statsLine={`独立零基础词库 ${meta.count.toLocaleString()} · 熟悉 ${familiarCount} · 不熟 ${unfamiliarCount} · 今日 ${dailyCount} · ${meta.version}`}
      toast={toast}
      extraLinks={[
        { href: "/reading-g", label: "G类阅读提升" },
        { href: "/spelling-words", label: "单词拼写训练" },
        { href: "/meaning", label: "看词选意思 · 核心6000" }
      ]}
      chipGroups={chipGroups}
    />
  );
}
