"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import StableLoadingState from "./StableLoadingState.jsx";
import StudyMeaningToggle from "./StudyMeaningToggle.jsx";
import { readJsonStorage, writeJsonStorage } from "../lib/browser-storage.mjs";
import { loadLrSynonyms } from "../lib/vocab/load-lr-synonyms.mjs";
import { loadParaphrasesWithCache } from "../lib/vocab/lr-paraphrase-store.mjs";
import {
  playSpeechAudio,
  resolveSpeechPlaybackOptions
} from "../lib/speech-audio-playback.mjs";
import { fetchSpeechAudioResult } from "../lib/vocab-speech.mjs";

export const LISTENING_READING_SYNONYM_PROGRESS_KEY = "listeningReadingSynonymProgress";
export const LISTENING_READING_SYNONYM_SESSION_KEY = "listeningReadingSynonymSession";

const VIEW_MODES = ["all", "fresh", "unknown", "known"];
const SESSION_PERSIST_DEBOUNCE_MS = 280;

function readProgress() {
  return readJsonStorage(LISTENING_READING_SYNONYM_PROGRESS_KEY, {});
}

function writeProgress(progress) {
  const saved = writeJsonStorage(LISTENING_READING_SYNONYM_PROGRESS_KEY, progress || {});
  return saved;
}

function readSession() {
  return readJsonStorage(LISTENING_READING_SYNONYM_SESSION_KEY, {});
}

function writeSession(session) {
  return writeJsonStorage(LISTENING_READING_SYNONYM_SESSION_KEY, session || {});
}

function progressStats(progress = {}, items = []) {
  const values = items.map((item) => progress?.[item.id]).filter(Boolean);
  return {
    learned: values.filter((item) => item?.status === "known" || item?.status === "unknown").length,
    known: values.filter((item) => item?.status === "known").length,
    unknown: values.filter((item) => item?.status === "unknown").length,
    fresh: Math.max(0, items.length - values.length)
  };
}

function exampleFallback(item) {
  if (!item?.example || !item?.paraphraseExample) return null;
  return {
    example: item.example,
    paraphraseExample: item.paraphraseExample
  };
}

function filterStudyItems(items, progress, viewMode) {
  if (viewMode === "unknown") return items.filter((entry) => progress?.[entry.id]?.status === "unknown");
  if (viewMode === "known") return items.filter((entry) => progress?.[entry.id]?.status === "known");
  if (viewMode === "fresh") return items.filter((entry) => !progress?.[entry.id]?.status);
  return items;
}

function resolveStudyIndex(studyItems, { itemId = "", index = 0 } = {}) {
  if (!studyItems.length) return 0;
  if (itemId) {
    const found = studyItems.findIndex((entry) => entry.id === itemId);
    if (found >= 0) return found;
  }
  if (Number.isInteger(index) && index >= 0 && index < studyItems.length) return index;
  return 0;
}

export default function LrParaphrasePanel() {
  const [items, setItems] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [loadError, setLoadError] = useState("");
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState({});
  const [viewMode, setViewMode] = useState("all");
  const [toast, setToast] = useState("");

  const toastTimerRef = useRef(null);
  const sessionPersistTimerRef = useRef(null);
  const restoredRef = useRef(false);
  const viewPositionsRef = useRef({});
  const pendingSessionRef = useRef({});
  const latestSessionRef = useRef({ viewMode: "all", index: 0, itemId: "", positions: {} });

  const stats = useMemo(() => progressStats(progress, items), [progress, items]);
  const studyItems = useMemo(
    () => filterStudyItems(items, progress, viewMode),
    [items, progress, viewMode]
  );
  const item = studyItems[index] || null;
  const currentPosition = item ? index + 1 : 0;
  const examples = exampleFallback(item);
  const visibleSynonyms = useMemo(() => {
    if (!item) return [];
    return (Array.isArray(item.synonyms) ? item.synonyms : [])
      .filter((synonym) => String(synonym || "").trim().toLowerCase() !== String(item.baseWord || "").trim().toLowerCase());
  }, [item]);
  const clusterMembers = useMemo(() => {
    if (!item || !Array.isArray(item.members)) return [];
    const seen = new Set();
    return item.members.filter((member) => {
      const key = String(member?.word || "").trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [item]);

  const viewTabs = useMemo(() => ([
    { value: "all", label: "全部", count: items.length },
    { value: "fresh", label: "未学", count: stats.fresh },
    { value: "unknown", label: "不熟", count: stats.unknown },
    { value: "known", label: "已认识", count: stats.known }
  ]), [items.length, stats]);

  useEffect(() => {
    setProgress(readProgress());
    const saved = readSession();
    pendingSessionRef.current = saved;
    viewPositionsRef.current = saved?.positions && typeof saved.positions === "object" ? saved.positions : {};
    if (saved.viewMode && VIEW_MODES.includes(saved.viewMode)) {
      setViewMode(saved.viewMode);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const loaded = await loadParaphrasesWithCache(async () => {
          const fresh = await loadLrSynonyms();
          return {
            entries: fresh.items,
            count: fresh.count,
            version: fresh.version,
            paraphraseLexiconHash: fresh.synonymLexiconHash,
            synonymLexiconHash: fresh.synonymLexiconHash
          };
        });

        if (cancelled) return;
        setItems(loaded.entries);
        setLoadState("ready");
      } catch (error) {
        if (cancelled) return;
        setLoadState("error");
        setLoadError(String(error?.message || error));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    if (!studyItems.length) return;

    if (!restoredRef.current) {
      const saved = pendingSessionRef.current || readSession();
      const savedForMode = saved?.positions?.[viewMode] || saved;
      const nextIndex = resolveStudyIndex(studyItems, {
        itemId: savedForMode?.itemId || saved?.itemId || "",
        index: Number.isInteger(savedForMode?.index) ? savedForMode.index : saved?.index
      });
      setIndex(nextIndex);
      restoredRef.current = true;
      return;
    }

    const savedForMode = viewPositionsRef.current[viewMode];
    const nextIndex = resolveStudyIndex(studyItems, savedForMode || {});
    setIndex(nextIndex);
  }, [viewMode, studyItems]);

  useEffect(() => {
    if (index >= studyItems.length && studyItems.length) {
      setIndex(Math.max(0, studyItems.length - 1));
    }
  }, [index, studyItems.length]);

  const flushSessionPersist = useCallback(() => {
    const latest = latestSessionRef.current;
    if (!latest.itemId) return false;
    if (sessionPersistTimerRef.current) {
      clearTimeout(sessionPersistTimerRef.current);
      sessionPersistTimerRef.current = null;
    }
    return writeSession({
      viewMode: latest.viewMode,
      index: latest.index,
      itemId: latest.itemId,
      positions: latest.positions,
      updatedAt: Date.now()
    });
  }, []);

  const queueSessionPersist = useCallback((nextViewMode, nextIndex, nextItem) => {
    if (!nextItem?.id) return;

    viewPositionsRef.current[nextViewMode] = {
      index: nextIndex,
      itemId: nextItem.id,
      updatedAt: Date.now()
    };

    latestSessionRef.current = {
      viewMode: nextViewMode,
      index: nextIndex,
      itemId: nextItem.id,
      positions: viewPositionsRef.current
    };

    if (sessionPersistTimerRef.current) {
      clearTimeout(sessionPersistTimerRef.current);
    }

    sessionPersistTimerRef.current = window.setTimeout(() => {
      flushSessionPersist();
    }, SESSION_PERSIST_DEBOUNCE_MS);
  }, [flushSessionPersist]);

  useEffect(() => {
    if (loadState !== "ready" || !item) return;
    queueSessionPersist(viewMode, index, item);
  }, [loadState, viewMode, index, item, queueSessionPersist]);

  useEffect(() => {
    function handlePageHide() {
      flushSessionPersist();
    }

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      flushSessionPersist();
    };
  }, [flushSessionPersist]);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 1400);
  }, []);

  const nextItem = useCallback(() => {
    if (!studyItems.length) return;
    setIndex((current) => (current + 1) % studyItems.length);
  }, [studyItems.length]);

  const prevItem = useCallback(() => {
    if (!studyItems.length) return;
    setIndex((current) => (current - 1 + studyItems.length) % studyItems.length);
  }, [studyItems.length]);

  const speakText = useCallback(async (text, kind = "word", label = "发音") => {
    const cleanText = String(text || "").trim();
    if (!cleanText) {
      showToast(`没有可播放的${label}`);
      return;
    }

    try {
      showToast(`正在准备${label}`);
      const result = await fetchSpeechAudioResult(cleanText, kind);
      const playback = await playSpeechAudio(result.url, resolveSpeechPlaybackOptions(result, kind));
      if (playback.played) showToast(`播放${label}`);
    } catch {
      showToast(`${label}失败`);
    }
  }, [showToast]);

  const speakBaseWord = useCallback(() => {
    speakText(item?.baseWord, "word", "核心词");
  }, [item?.baseWord, speakText]);

  const speakExample = useCallback(() => {
    speakText(examples?.example, "sentence", "例句");
  }, [examples?.example, speakText]);

  const mark = useCallback((status) => {
    if (!item) return;
    setProgress((current) => {
      const next = {
        ...current,
        [item.id]: {
          status,
          updatedAt: Date.now()
        }
      };
      if (!writeProgress(next)) {
        showToast("进度保存失败，请检查浏览器存储空间");
      }
      return next;
    });
    showToast(status === "known" ? "已标记认识" : "已加入不熟");
    nextItem();
  }, [item, nextItem, showToast]);

  useEffect(() => {
    function onKey(event) {
      if (loadState !== "ready") return;
      const tag = event.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      if (event.key === "Tab") {
        event.preventDefault();
        speakBaseWord();
        return;
      }
      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        speakExample();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        nextItem();
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        prevItem();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        nextItem();
      }
      if (event.key === "1") {
        event.preventDefault();
        mark("known");
      }
      if (event.key === "2") {
        event.preventDefault();
        mark("unknown");
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loadState, mark, nextItem, prevItem, speakBaseWord, speakExample]);

  if (loadState === "loading") {
    return (
      <div className="lr-panel lr-panel--loading">
        <StableLoadingState
          mark="S"
          eyebrow="听力阅读同义替换"
          title="正在准备同义替换训练"
          note="读取训练库并恢复学习位置"
          compact
        />
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="lr-panel lr-panel--error">
        <h2>同义替换库加载失败</h2>
        <p>{loadError}</p>
        <button type="button" className="small-btn warm" onClick={() => window.location.reload()}>重试</button>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="lr-panel lr-panel--empty lr-empty-state">
        <h2>听力阅读同义替换</h2>
        <p>{items.length ? "当前筛选下没有同义替换组。" : "暂时没有有效同义替换组。"}</p>
        {items.length ? (
          <button type="button" className="small-btn warm" onClick={() => setViewMode("all")}>查看全部</button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flash-training-page flash-training-page--paraphrase">
      <header className="topbar lr-topbar flash-training-topbar">
        <div className="previous">
          <div className="previous-label">听力阅读同义替换</div>
          <div className="previous-word">{items.length} 组</div>
          <div className="previous-meta">已学 {stats.learned} · 不熟 {stats.unknown} · 未学 {stats.fresh}</div>
        </div>

        <div className="lr-view-tabs" role="tablist" aria-label="同义替换筛选">
          {viewTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={viewMode === tab.value}
              className={`lr-view-tab ${viewMode === tab.value ? "active" : ""}`}
              onClick={() => setViewMode(tab.value)}
            >
              <span>{tab.label}</span>
              <strong>{tab.count}</strong>
            </button>
          ))}
        </div>
        <StudyMeaningToggle />
      </header>

      <section className="main lr-main flash-training-main">
        <article className="lr-card lr-study-card flash-training-card" aria-label="听力阅读同义替换卡片">
          <div className="lr-card-head">
            <span className="phrase-type-badge">同义替换组</span>
            <span className="lr-source-label">
              {item.clusterTitle ? `词群：${item.clusterTitle}` : item.source || "阅读/听力高频"}
            </span>
          </div>

          <div className="flash-training-toolbar lr-audio-toolbar">
            <button className="hero-sound-btn hero-sound-btn--word" type="button" onClick={speakBaseWord} aria-label="播放核心词">
              Tab·核心词
            </button>
            <button className="hero-sound-btn" type="button" onClick={speakExample} disabled={!examples?.example} aria-label="播放例句">
              空格·例句
            </button>
          </div>

          <div className="lr-study-grid">
            <section className="lr-core-panel" aria-label="核心词">
              <div className="lr-section-label">核心词</div>
              <h1>{item.baseWord}</h1>
              <p className="study-answer-content">{item.meaning || "释义待补充"}</p>
            </section>

            <section className="lr-replacement-panel study-answer-content" aria-label="常见替换">
              <div className="lr-section-label">常见替换</div>
              <div className="lr-synonym-chips">
                {visibleSynonyms.length ? (
                  visibleSynonyms.map((synonym, synonymIndex) => (
                    <span key={synonym} className={`lr-synonym-chip ${synonymIndex === 0 ? "primary" : ""}`}>{synonym}</span>
                  ))
                ) : (
                  <span className="lr-synonym-chip lr-synonym-chip--pending">替换待补充</span>
                )}
              </div>
            </section>
          </div>

          {clusterMembers.length ? (
            <section className="lr-member-panel study-answer-content" aria-label="同组词群">
              <div className="lr-member-head">
                <div className="lr-section-label">同组词群</div>
                <span>{clusterMembers.length} 个相关词</span>
              </div>
              <div className="lr-member-grid">
                {clusterMembers.map((member) => (
                  <div
                    key={`${item.id}-${member.word}`}
                    className={`lr-member-card ${String(member.word).toLowerCase() === String(item.baseWord).toLowerCase() ? "active" : ""}`}
                  >
                    <strong>{member.word}</strong>
                    {member.phonetic ? <small>{member.phonetic}</small> : null}
                    <p>{member.meaning || "释义待补充"}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="lr-example-panel study-answer-content" aria-label="例句对照">
            <div className="lr-section-label">例句对照</div>
            {examples ? (
              <div className="lr-example-pair">
                <p><strong>原句</strong><span>{examples.example}</span></p>
                <p><strong>替换</strong><span>{examples.paraphraseExample}</span></p>
              </div>
            ) : (
              <p className="lr-example-missing">例句待补充</p>
            )}
          </section>

          {item.notesZh ? <p className="lr-synonym-note study-answer-content">{item.notesZh}</p> : null}

          <div className="lr-actions">
            <button type="button" className="small-btn ghost" onClick={prevItem}>上一个</button>
            <button type="button" className="small-btn warm" onClick={() => mark("known")}>认识</button>
            <button type="button" className="small-btn ghost" onClick={() => mark("unknown")}>不熟</button>
            <button type="button" className="small-btn ghost" onClick={nextItem}>下一个</button>
          </div>
        </article>
      </section>

      <footer className="bottom lr-bottom flash-training-footer">
        <div className="count">进度：{currentPosition} / {studyItems.length} · 总库 {items.length} 组</div>
        <div className="shortcut-hint">Tab 核心词 · 空格 例句 · ← 上一个 · →/Enter 下一个 · 1 认识 · 2 不熟</div>
      </footer>
      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}
