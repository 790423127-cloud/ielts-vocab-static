"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Eye,
  EyeOff,
  FileUp,
  RotateCcw,
  Trash2
} from "lucide-react";

import {
  READING_PARAPHRASE_DIRECTION,
  READING_PARAPHRASE_MAX_IMPORT_BYTES,
  READING_PARAPHRASE_STATUS,
  createReadingParaphraseState,
  loadReadingParaphraseState,
  mergeReadingParaphraseState,
  parseReadingParaphraseImport,
  saveReadingParaphraseState
} from "../lib/reading-paraphrases/storage.mjs";
import styles from "./reading-paraphrases.module.css";

const DIRECTION_LABELS = {
  [READING_PARAPHRASE_DIRECTION.QUESTION_TO_SOURCE]: "题目表达 → 原文表达",
  [READING_PARAPHRASE_DIRECTION.SOURCE_TO_QUESTION]: "原文表达 → 题目表达",
  [READING_PARAPHRASE_DIRECTION.BROWSE]: "对照浏览"
};

const STATUS_LABELS = {
  [READING_PARAPHRASE_STATUS.NEW]: "未学习",
  [READING_PARAPHRASE_STATUS.KNOWN]: "认识",
  [READING_PARAPHRASE_STATUS.FUZZY]: "模糊",
  [READING_PARAPHRASE_STATUS.UNFAMILIAR]: "不熟"
};

function triggerDownload(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function evidenceParts(evidence, terms) {
  const cleanTerms = terms.filter(Boolean).sort((a, b) => b.length - a.length);
  if (!evidence || !cleanTerms.length) return [evidence];
  const escaped = cleanTerms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return evidence.split(new RegExp(`(${escaped.join("|")})`, "gi"));
}

function sourceLabel(source) {
  return [
    source.testTitle,
    source.partNumber ? `Part ${source.partNumber}` : "",
    source.questionNumber ? `Q${source.questionNumber}` : ""
  ].filter(Boolean).join(" · ");
}

export default function ReadingParaphrasesPage() {
  const [state, setState] = useState(createReadingParaphraseState);
  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [filter, setFilter] = useState("all");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [persistenceError, setPersistenceError] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    const loaded = loadReadingParaphraseState();
    setState(loaded);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const saved = saveReadingParaphraseState(state);
    setPersistenceError(saved ? "" : "本机存储空间不足，本次进度尚未保存。请先导出备份并清理浏览器存储空间。");
  }, [ready, state]);

  const visibleItems = useMemo(() => {
    if (filter === "all") return state.items;
    if (filter === "new") {
      return state.items.filter((item) => !item.study?.status);
    }
    return state.items.filter((item) => item.study?.status === filter);
  }, [filter, state.items]);

  const current = visibleItems[index] || null;
  const answerVisible = state.direction === READING_PARAPHRASE_DIRECTION.BROWSE || revealed;
  const promptText = state.direction === READING_PARAPHRASE_DIRECTION.SOURCE_TO_QUESTION
    ? current?.sourcePhrase
    : current?.questionPhrase;
  const answerText = state.direction === READING_PARAPHRASE_DIRECTION.SOURCE_TO_QUESTION
    ? current?.questionPhrase
    : current?.sourcePhrase;
  const cursorKey = `${state.direction}:${filter}`;
  const savedCursorId = state.positions?.[cursorKey];

  useEffect(() => {
    const nextIndex = savedCursorId
      ? visibleItems.findIndex((item) => item.id === savedCursorId)
      : -1;
    setIndex(nextIndex >= 0 ? nextIndex : 0);
    setRevealed(false);
  }, [cursorKey, savedCursorId, visibleItems]);

  const goToIndex = useCallback((requestedIndex) => {
    if (!visibleItems.length) return;
    const nextIndex = Math.min(visibleItems.length - 1, Math.max(0, requestedIndex));
    const nextItem = visibleItems[nextIndex];
    setIndex(nextIndex);
    setRevealed(false);
    setState((existing) => existing.positions?.[cursorKey] === nextItem.id
      ? existing
      : {
          ...existing,
          positions: { ...existing.positions, [cursorKey]: nextItem.id },
          updatedAt: Date.now()
        });
  }, [cursorKey, visibleItems]);

  const move = useCallback((delta) => {
    goToIndex(index + delta);
  }, [goToIndex, index]);

  function setDirection(direction) {
    setState((existing) => ({ ...existing, direction, updatedAt: Date.now() }));
    setRevealed(false);
  }

  function mark(status) {
    if (!current) return;
    const now = Date.now();
    const leavesCurrentRange = filter !== "all"
      && (filter === "new" ? Boolean(status) : filter !== status);
    const nextVisibleItems = leavesCurrentRange
      ? visibleItems.filter((item) => item.id !== current.id)
      : visibleItems;
    const nextIndex = nextVisibleItems.length
      ? Math.min(
          leavesCurrentRange ? index : index + 1,
          nextVisibleItems.length - 1
        )
      : 0;
    const nextItem = nextVisibleItems[nextIndex];
    setState((existing) => ({
      ...existing,
      items: existing.items.map((item) => item.id === current.id
        ? { ...item, study: { status, updatedAt: now } }
        : item),
      positions: nextItem
        ? { ...existing.positions, [cursorKey]: nextItem.id }
        : existing.positions,
      updatedAt: now
    }));
    setIndex(nextIndex);
    setRevealed(false);
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setNotice("");
    try {
      if (file.size > READING_PARAPHRASE_MAX_IMPORT_BYTES) {
        throw new Error("导入文件过大，请拆分为不超过 4 MB 的学习包");
      }
      const incoming = parseReadingParaphraseImport(await file.text());
      if (!incoming.length) throw new Error("文件中没有可识别的同义替换记录");
      const result = mergeReadingParaphraseState(state, incoming);
      setState(result.state);
      setNotice(`导入完成：新增 ${result.added} 组，合并更新 ${result.updated} 组。`);
      setRevealed(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "导入失败");
    }
  }

  function exportBackup() {
    triggerDownload(
      { ...state, source: "ielts-vocab-reading-paraphrases" },
      `阅读同义替换记录本-${new Date().toISOString().slice(0, 10)}.json`
    );
    setNotice("记录本备份已导出。");
  }

  function deleteCurrent() {
    if (!current || !window.confirm(`确定删除“${current.questionPhrase} = ${current.sourcePhrase}”吗？`)) return;
    const nextVisibleItems = visibleItems.filter((item) => item.id !== current.id);
    const nextIndex = nextVisibleItems.length ? Math.min(index, nextVisibleItems.length - 1) : 0;
    const nextItem = nextVisibleItems[nextIndex];
    setState((existing) => ({
      ...existing,
      items: existing.items.filter((item) => item.id !== current.id),
      positions: nextItem
        ? { ...existing.positions, [cursorKey]: nextItem.id }
        : existing.positions,
      updatedAt: Date.now()
    }));
    setIndex(nextIndex);
    setRevealed(false);
  }

  if (!ready) {
    return <main className={styles.page}><div className={styles.loading}>正在读取阅读同义替换记录本…</div></main>;
  }

  const counts = state.items.reduce((result, item) => {
    const status = item.study?.status || "new";
    result[status] = (result[status] || 0) + 1;
    return result;
  }, {});

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>READING PARAPHRASE NOTEBOOK</p>
          <h1>阅读同义替换记录本</h1>
          <p>从阅读网站导入错题替换关系；这里单独负责刷词、记忆状态和复习位置。</p>
        </div>
        <div className={styles.headerActions}>
          <input ref={fileRef} type="file" accept=".json,.txt,application/json,text/plain" hidden onChange={importFile} />
          <button type="button" onClick={() => fileRef.current?.click()}><FileUp size={17} />导入学习包</button>
          <button type="button" onClick={exportBackup} disabled={!state.items.length}><Download size={17} />导出备份</button>
        </div>
      </header>

      {notice ? <div className={styles.notice} role="status" aria-live="polite">{notice}</div> : null}
      {error || persistenceError ? (
        <div className={styles.error} role="alert">{error || persistenceError}</div>
      ) : null}

      <section className={styles.toolbar} aria-label="学习设置">
        <label>
          <span>回忆方向</span>
          <select value={state.direction} onChange={(event) => setDirection(event.target.value)}>
            {Object.entries(DIRECTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>学习范围</span>
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">全部 {state.items.length}</option>
            <option value="new">未学习 {counts.new || 0}</option>
            <option value={READING_PARAPHRASE_STATUS.FUZZY}>模糊 {counts.fuzzy || 0}</option>
            <option value={READING_PARAPHRASE_STATUS.UNFAMILIAR}>不熟 {counts.unfamiliar || 0}</option>
            <option value={READING_PARAPHRASE_STATUS.KNOWN}>认识 {counts.known || 0}</option>
          </select>
        </label>
        <div className={styles.stats} aria-live="polite">
          <strong>{visibleItems.length ? index + 1 : 0} / {visibleItems.length}</strong>
          <span>{current ? `错题来源 ${current.occurrenceCount} 次` : "等待导入"}</span>
        </div>
      </section>

      {!current ? (
        <section className={styles.empty}>
          <FileUp size={32} />
          <h2>还没有可刷的同义替换</h2>
          <p>请从雅思阅读网站导出 JSON 学习包，再点击“导入学习包”。TXT 旧格式也可以继续导入。</p>
          <button type="button" onClick={() => fileRef.current?.click()}>选择导入文件</button>
        </section>
      ) : (
        <>
          <section className={styles.card}>
            <div className={styles.cardMeta}>
              <span>{DIRECTION_LABELS[state.direction]}</span>
              <span className={styles.status}>{STATUS_LABELS[current.study?.status || ""]}</span>
            </div>
            <div className={styles.prompt}>
              <span>{state.direction === READING_PARAPHRASE_DIRECTION.SOURCE_TO_QUESTION ? "原文表达" : "题目表达"}</span>
              <h2>{promptText}</h2>
            </div>

            <button
              type="button"
              className={styles.reveal}
              onClick={() => setRevealed((value) => !value)}
              disabled={state.direction === READING_PARAPHRASE_DIRECTION.BROWSE}
            >
              {answerVisible ? <EyeOff size={18} /> : <Eye size={18} />}
              {state.direction === READING_PARAPHRASE_DIRECTION.BROWSE
                ? "对照模式"
                : answerVisible ? "隐藏答案" : "显示答案"}
            </button>

            <div className={`${styles.answer} ${answerVisible ? styles.answerVisible : ""}`} aria-hidden={!answerVisible}>
              <span>{state.direction === READING_PARAPHRASE_DIRECTION.SOURCE_TO_QUESTION ? "题目表达" : "原文表达"}</span>
              <h3>{answerVisible ? answerText : "点击后查看"}</h3>
              {answerVisible && current.note ? <p className={styles.note}>{current.note}</p> : null}
            </div>

            {answerVisible && current.sources?.length ? (
              <div className={styles.sources}>
                <strong>原题证据</strong>
                {current.sources.slice(0, 3).map((source) => (
                  <article key={source.id}>
                    <span>{sourceLabel(source) || "阅读错题来源"}</span>
                    {source.evidence ? (
                      <blockquote>
                        {evidenceParts(source.evidence, [current.questionPhrase, current.sourcePhrase]).map((part, partIndex) => (
                          [current.questionPhrase, current.sourcePhrase].some((term) => term && part.toLocaleLowerCase() === term.toLocaleLowerCase())
                            ? <mark key={`${part}-${partIndex}`}>{part}</mark>
                            : part
                        ))}
                      </blockquote>
                    ) : null}
                    {source.questionPrompt ? <p>{source.questionPrompt}</p> : null}
                  </article>
                ))}
              </div>
            ) : null}
          </section>

          <section className={styles.progress}>
            <label htmlFor="reading-paraphrase-position">拖动或点击回到指定位置</label>
            <input
              id="reading-paraphrase-position"
              type="range"
              min="1"
              max={Math.max(1, visibleItems.length)}
              value={Math.min(index + 1, Math.max(1, visibleItems.length))}
              onChange={(event) => goToIndex(Number(event.target.value) - 1)}
            />
          </section>

          <footer className={styles.actions}>
            <button type="button" onClick={() => move(-1)} disabled={index === 0}><ArrowLeft size={18} />上一个</button>
            <div className={styles.ratings}>
              <button type="button" className={styles.known} onClick={() => mark(READING_PARAPHRASE_STATUS.KNOWN)}><Check size={17} />认识</button>
              <button type="button" className={styles.fuzzy} onClick={() => mark(READING_PARAPHRASE_STATUS.FUZZY)}><RotateCcw size={17} />模糊</button>
              <button type="button" className={styles.unfamiliar} onClick={() => mark(READING_PARAPHRASE_STATUS.UNFAMILIAR)}>不熟</button>
            </div>
            <button type="button" onClick={() => move(1)} disabled={index >= visibleItems.length - 1}>下一个<ArrowRight size={18} /></button>
            <button type="button" className={styles.delete} onClick={deleteCurrent} aria-label="删除当前同义替换"><Trash2 size={18} /></button>
          </footer>
        </>
      )}
    </main>
  );
}
