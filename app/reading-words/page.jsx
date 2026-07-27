"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bookmark,
  Bot,
  BookOpenText,
  BookPlus,
  Download,
  FileSpreadsheet,
  Search,
  Sparkles,
  Star,
  Upload,
  Volume2,
  X
} from "lucide-react";
import WordStudyActions from "../components/WordStudyActions.jsx";
import WordStudyContent from "../components/WordStudyContent.jsx";
import {
  applyMainEntryToReadingWord,
  isMainEntryClassificationIncomplete,
  mergeAiProfileIntoMainEntry,
  needsReadingAiProcessing,
  reconcileReadingImportsWithMain
} from "../lib/reading-words/main-lexicon-sync.mjs";
import {
  buildReadingWordsTransferPackage,
  importReadingWordsTransferPackage
} from "../lib/reading-words/transfer.mjs";
import {
  buildReadingWordsBackup,
  getReadingWordMissingFields,
  isReadingWordIncomplete,
  mergeReadingWordAiProfile,
  normalizeReadingWord,
  normalizeReadingWordKey,
  parseReadingWordsTable,
  readReadingWords,
  readReadingWordsRollback,
  writeReadingWords,
  writeReadingWordsWithBackup
} from "../lib/reading-words/storage.mjs";
import {
  loadActiveWordsForSync,
  loadWordsImportBackupFromIndexedDB,
  saveWordsToIndexedDB,
  saveWordsToIndexedDBWithBackup
} from "../lib/vocab/word-store.mjs";
import styles from "./reading-words.module.css";

const EMPTY_DRAFT = {
  word: "",
  meaning: "",
  definition: "",
  pos: "",
  phonetic: "",
  example: "",
  exampleCn: "",
  synonyms: ""
};

const MISSING_FIELD_LABELS = {
  pos: "词性",
  meaning: "中文释义",
  definition: "英文释义",
  example: "英文例句",
  exampleCn: "例句翻译"
};

function speak(text) {
  const value = String(text || "").trim();
  if (!value || typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(value);
  utterance.lang = "en-GB";
  utterance.rate = 0.92;
  window.speechSynthesis.speak(utterance);
}

function wordMatchesSearch(word, query) {
  const cleanQuery = String(query || "").trim().toLowerCase();
  if (!cleanQuery) return true;
  return [
    word.word,
    word.meaning,
    word.definition,
    ...(Array.isArray(word.synonyms) ? word.synonyms : [])
  ].some((value) => String(value || "").toLowerCase().includes(cleanQuery));
}

function buildMainWordIndex(words = []) {
  return new Map(
    (Array.isArray(words) ? words : []).map((entry, index) => [
      normalizeReadingWordKey(entry?.word),
      { entry, index }
    ])
  );
}

function DetailList({ title, items, emptyText, renderItem }) {
  return (
    <section className={styles.detailSection}>
      <h3>{title}</h3>
      {items.length ? (
        <div className={styles.detailList}>
          {items.map((item, index) => renderItem(item, index))}
        </div>
      ) : (
        <p className={styles.emptyDetail}>{emptyText}</p>
      )}
    </section>
  );
}

export default function ReadingWordsPage() {
  const [ready, setReady] = useState(false);
  const [words, setWords] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [onlyFrequent, setOnlyFrequent] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [batchText, setBatchText] = useState("");
  const [notice, setNotice] = useState("");
  const [storageError, setStorageError] = useState("");
  const [mainLexiconStatus, setMainLexiconStatus] = useState({
    status: "loading",
    count: 0,
    message: "正在核对浏览器主词库…"
  });
  const [rollbackAvailable, setRollbackAvailable] = useState(false);
  const [mainWriteBusy, setMainWriteBusy] = useState(false);
  const [aiConfirmed, setAiConfirmed] = useState(false);
  const [aiRun, setAiRun] = useState({
    status: "idle",
    processed: 0,
    total: 0,
    filled: 0,
    failed: 0,
    message: ""
  });
  const aiControlRef = useRef({ controller: null, stopped: false });
  const mainLexiconRef = useRef({ words: [], meta: {}, index: new Map() });
  const mainMutationInFlightRef = useRef(false);

  useEffect(() => {
    const savedWords = readReadingWords();
    setWords(savedWords);
    setSelectedId(savedWords[0]?.id || "");
    setReady(true);

    let cancelled = false;
    Promise.all([
      loadActiveWordsForSync(),
      loadWordsImportBackupFromIndexedDB()
    ]).then(([loaded, backup]) => {
      if (cancelled) return;
      const mainWords = Array.isArray(loaded?.words) ? loaded.words : [];
      if (!mainWords.length) {
        setMainLexiconStatus({
          status: "error",
          count: 0,
          message: "浏览器主词库为空，已停止自动同步；阅读生词仍可查看和导出。"
        });
        return;
      }
      const mainIndex = buildMainWordIndex(mainWords);
      mainLexiconRef.current = {
        words: mainWords,
        meta: loaded?.meta || {},
        index: mainIndex
      };
      setWords((current) => current.map((word) => {
        const linked = mainIndex.get(normalizeReadingWordKey(word.word))?.entry;
        return linked ? applyMainEntryToReadingWord(word, linked) : word;
      }));
      setMainLexiconStatus({
        status: "ready",
        count: mainWords.length,
        message: `已连接浏览器主词库 ${mainWords.length.toLocaleString("zh-CN")} 词`
      });
      setRollbackAvailable(backup?.status === "cache-hit" || Boolean(readReadingWordsRollback()));
    }).catch((error) => {
      if (cancelled) return;
      setMainLexiconStatus({
        status: "error",
        count: 0,
        message: `主词库读取失败：${error?.message || error}`
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const saved = writeReadingWords(words);
    setStorageError(saved ? "" : "浏览器存储写入失败，请先导出备份并检查可用空间。");
  }, [ready, words]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const incompleteWords = useMemo(
    () => words.filter(isReadingWordIncomplete),
    [words]
  );
  const highFrequencyWords = useMemo(
    () => words.filter((word) => word.highFrequency === true || Number(word.importCount) >= 2),
    [words]
  );
  const aiTargetWords = useMemo(() => {
    const mainIndex = mainLexiconRef.current.index;
    return words.filter((word) => {
      const mainEntry = mainIndex.get(normalizeReadingWordKey(word.word))?.entry;
      return needsReadingAiProcessing(word, mainEntry);
    });
  }, [words]);
  const mainClassificationPending = useMemo(() => {
    const mainIndex = mainLexiconRef.current.index;
    return words.filter((word) => {
      const mainEntry = mainIndex.get(normalizeReadingWordKey(word.word))?.entry;
      return isMainEntryClassificationIncomplete(mainEntry);
    });
  }, [words]);

  const visibleWords = useMemo(
    () => words.filter((word) => (
      wordMatchesSearch(word, search) &&
      (!onlyIncomplete || isReadingWordIncomplete(word)) &&
      (!onlyFrequent || word.highFrequency === true || Number(word.importCount) >= 2)
    )),
    [onlyFrequent, onlyIncomplete, search, words]
  );

  useEffect(() => {
    if (!visibleWords.length) return;
    if (!visibleWords.some((word) => word.id === selectedId)) {
      setSelectedId(visibleWords[0].id);
    }
  }, [selectedId, visibleWords]);

  const selectedWord = visibleWords.find((word) => word.id === selectedId) || visibleWords[0] || null;
  const selectedIndex = selectedWord
    ? visibleWords.findIndex((word) => word.id === selectedWord.id)
    : -1;
  const missingFields = selectedWord ? getReadingWordMissingFields(selectedWord) : [];
  const aiRunning = aiRun.status === "running";
  const mainReady = mainLexiconStatus.status === "ready";
  const actionsDisabled = aiRunning || mainWriteBusy || !mainReady;

  const parsedBatch = useMemo(() => {
    if (!batchText.trim()) return { words: [], error: "" };
    try {
      return { words: parseReadingWordsTable(batchText), error: "" };
    } catch (error) {
      return { words: [], error: error?.message || "表格内容无法解析" };
    }
  }, [batchText]);

  const moveSelection = (offset) => {
    if (!visibleWords.length) return;
    const nextIndex = (Math.max(0, selectedIndex) + offset + visibleWords.length) % visibleWords.length;
    setSelectedId(visibleWords[nextIndex].id);
  };

  const patchSelectedWord = (patch) => {
    if (!selectedWord) return;
    setWords(words.map((word) => (
      word.id === selectedWord.id
        ? { ...word, ...patch, updatedAt: new Date().toISOString() }
        : word
    )));
  };

  const updateMainLexiconMemory = (nextWords) => {
    mainLexiconRef.current = {
      ...mainLexiconRef.current,
      words: nextWords,
      index: buildMainWordIndex(nextWords)
    };
    setMainLexiconStatus((current) => ({
      ...current,
      status: "ready",
      count: nextWords.length,
      message: `已连接浏览器主词库 ${nextWords.length.toLocaleString("zh-CN")} 词`
    }));
  };

  const commitReadingImport = async (incoming, sourceLabel) => {
    if (!mainReady || mainMutationInFlightRef.current) {
      setNotice(mainLexiconStatus.message || "主词库尚未准备好，请稍后再试。");
      return null;
    }
    mainMutationInFlightRef.current = true;
    setMainWriteBusy(true);
    const previousMainWords = mainLexiconRef.current.words;

    try {
      const result = reconcileReadingImportsWithMain(
        words,
        incoming,
        previousMainWords,
        { now: new Date().toISOString() }
      );
      if (result.mainChanged) {
        await saveWordsToIndexedDBWithBackup(
          result.mainWords,
          previousMainWords,
          mainLexiconRef.current.meta,
          { reason: sourceLabel }
        );
      }
      const readingSaved = writeReadingWordsWithBackup(result.words, words);
      if (!readingSaved) {
        if (result.mainChanged) {
          await saveWordsToIndexedDB(previousMainWords, mainLexiconRef.current.meta);
        }
        throw new Error("阅读生词栏写入失败，主词库已自动回退");
      }

      if (result.mainChanged) updateMainLexiconMemory(result.mainWords);
      setWords(result.words);
      setRollbackAvailable(true);
      return result;
    } catch (error) {
      setStorageError(`导入未完成：${error?.message || error}`);
      return null;
    } finally {
      mainMutationInFlightRef.current = false;
      setMainWriteBusy(false);
    }
  };

  const submitSingleWord = async (event) => {
    event.preventDefault();
    if (actionsDisabled) return;
    const normalized = normalizeReadingWord(draft);
    if (!normalized.word) {
      setNotice("请先填写单词。");
      return;
    }

    const result = await commitReadingImport([normalized], "personal-reading-single-import");
    if (!result) return;
    const imported = result.words.find(
      (word) => normalizeReadingWordKey(word.word) === normalizeReadingWordKey(normalized.word)
    );
    setSelectedId(imported?.id || selectedId);
    setDraft(EMPTY_DRAFT);
    setAddOpen(false);
    setNotice(result.added
      ? `已添加 ${normalized.word}；${result.addedToMain ? "同时加入浏览器主词库。" : "已复用主词库资料。"}`
      : `“${normalized.word}”再次导入，累计 ${imported?.importCount || 2} 次，已标记为高频词。`);
  };

  const importBatch = async () => {
    if (actionsDisabled || parsedBatch.error || !parsedBatch.words.length) return;
    const result = await commitReadingImport(parsedBatch.words, "personal-reading-table-import");
    if (!result) return;
    if (result.added) {
      const firstKey = normalizeReadingWordKey(parsedBatch.words[0]?.word);
      setSelectedId(result.words.find((word) => normalizeReadingWordKey(word.word) === firstKey)?.id || selectedId);
    }
    setBatchText("");
    setBatchOpen(false);
    setNotice(
      `新增 ${result.added} 个，重复累计 ${result.duplicates} 次；` +
      `复用主词库 ${result.reusedMain} 个，新加入主词库 ${result.addedToMain} 个` +
      (result.promoted ? `，新增高频词 ${result.promoted} 个。` : "。")
    );
  };

  const loadImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setBatchText(await file.text());
    } catch {
      setNotice("文件读取失败，请改用复制粘贴。");
    }
  };

  const exportBackup = () => {
    const blob = new Blob(
      [JSON.stringify(buildReadingWordsBackup(words), null, 2)],
      { type: "application/json;charset=utf-8" }
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `阅读生词栏备份-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice("阅读生词栏备份已导出。");
  };

  const exportTransferPackage = () => {
    if (!mainReady) {
      setNotice("主词库尚未准备好，暂时不能生成跨设备迁移包。");
      return;
    }
    const payload = buildReadingWordsTransferPackage(
      words,
      mainLexiconRef.current.words,
      mainLexiconRef.current.meta
    );
    const blob = new Blob(
      [JSON.stringify(payload, null, 2)],
      { type: "application/json;charset=utf-8" }
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `阅读生词-跨设备迁移包-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice("完整迁移包已导出；可复制到新设备后从本页导入。");
  };

  const importTransferFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || actionsDisabled || mainMutationInFlightRef.current) return;
    mainMutationInFlightRef.current = true;
    setMainWriteBusy(true);
    const previousMainWords = mainLexiconRef.current.words;

    try {
      const payload = JSON.parse(await file.text());
      const result = importReadingWordsTransferPackage(
        payload,
        words,
        previousMainWords,
        { now: new Date().toISOString() }
      );
      await saveWordsToIndexedDBWithBackup(
        result.mainWords,
        previousMainWords,
        mainLexiconRef.current.meta,
        { reason: "personal-reading-cross-device-import" }
      );
      if (!writeReadingWordsWithBackup(result.words, words)) {
        await saveWordsToIndexedDB(previousMainWords, mainLexiconRef.current.meta);
        throw new Error("阅读生词写入失败，浏览器主词库已自动回退");
      }
      updateMainLexiconMemory(result.mainWords);
      setWords(result.words);
      setSelectedId(result.words[0]?.id || "");
      setRollbackAvailable(true);
      setNotice(
        `跨设备导入完成：生词新增 ${result.readingAdded}、合并 ${result.readingMerged}；` +
        `主词库补充新增 ${result.mainAdded}、学习状态合并 ${result.mainMerged}。`
      );
    } catch (error) {
      setStorageError(`跨设备导入失败：${error?.message || error}`);
    } finally {
      mainMutationInFlightRef.current = false;
      setMainWriteBusy(false);
    }
  };

  const restoreLastSyncBackup = async () => {
    if (aiRunning || mainMutationInFlightRef.current) return;
    const [mainBackup, readingBackup] = await Promise.all([
      loadWordsImportBackupFromIndexedDB(),
      Promise.resolve(readReadingWordsRollback())
    ]);
    if (mainBackup?.status !== "cache-hit" || !readingBackup?.words) {
      setNotice("没有找到完整的同步前备份。");
      return;
    }
    const confirmed = window.confirm(
      "将恢复到上一次导入或 AI 写回前的阅读生词和浏览器主词库。当前修改会被替换，是否继续？"
    );
    if (!confirmed) return;

    mainMutationInFlightRef.current = true;
    setMainWriteBusy(true);
    try {
      await saveWordsToIndexedDB(mainBackup.words, mainBackup.meta || {});
      if (!writeReadingWords(readingBackup.words)) {
        throw new Error("阅读生词备份恢复失败");
      }
      updateMainLexiconMemory(mainBackup.words);
      setWords(readingBackup.words);
      setSelectedId(readingBackup.words[0]?.id || "");
      setNotice("已恢复到上一次同步前的本地备份。");
    } catch (error) {
      setStorageError(`恢复失败：${error?.message || error}`);
    } finally {
      mainMutationInFlightRef.current = false;
      setMainWriteBusy(false);
    }
  };

  const stopAiRun = () => {
    aiControlRef.current.stopped = true;
    aiControlRef.current.controller?.abort();
    setAiRun((current) => ({
      ...current,
      status: "stopped",
      message: "已停止；停止后收到的结果不会写入阅读生词栏。"
    }));
  };

  const runAiCompletion = async () => {
    if (aiRunning || !aiConfirmed) return;
    if (!mainReady || mainMutationInFlightRef.current) {
      setAiRun({
        status: "error",
        processed: 0,
        total: 0,
        filled: 0,
        failed: 0,
        message: "浏览器主词库尚未准备好，未发起 AI 请求。"
      });
      return;
    }
    const targets = aiTargetWords;
    if (!targets.length) {
      setAiRun({
        status: "done",
        processed: 0,
        total: 0,
        filled: 0,
        failed: 0,
        message: "当前阅读生词栏没有需要补全的词。"
      });
      return;
    }

    const controller = new AbortController();
    aiControlRef.current = { controller, stopped: false };
    let workingWords = words;
    let workingMainWords = mainLexiconRef.current.words;
    let firstWrite = true;
    let processed = 0;
    let filled = 0;
    let failed = 0;
    setAiRun({
      status: "running",
      processed: 0,
      total: targets.length,
      filled: 0,
      failed: 0,
      message: "正在检查阅读生词栏，不会扫描正式词库。"
    });

    for (let start = 0; start < targets.length; start += 10) {
      if (aiControlRef.current.stopped) break;
      const batch = targets.slice(start, start + 10);
      let payload;

      try {
        const response = await fetch("/api/generate-words", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            items: batch.map((word) => ({ inputId: word.id, word: word.word })),
            force: false,
            maxSplitDepth: 0
          })
        });
        payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.detail || payload?.error || `HTTP ${response.status}`);
      } catch (error) {
        if (error?.name === "AbortError" || aiControlRef.current.stopped) break;
        processed += batch.length;
        failed += batch.length;
        setAiRun({
          status: "running",
          processed,
          total: targets.length,
          filled,
          failed,
          message: `本批失败且未重试：${error?.message || "AI 请求失败"}`
        });
        continue;
      }

      if (aiControlRef.current.stopped) break;
      const profileById = new Map(
        (Array.isArray(payload?.items) ? payload.items : [])
          .map((item) => [String(item?.inputId || ""), item])
          .filter(([id]) => id)
      );
      let batchFilled = 0;
      let batchFailed = 0;
      const mainIndex = buildMainWordIndex(workingMainWords);
      const nextMainWords = [...workingMainWords];

      workingWords = workingWords.map((word) => {
        if (!batch.some((entry) => entry.id === word.id)) return word;
        const profile = profileById.get(word.id);
        if (!profile) {
          batchFailed += 1;
          return word;
        }
        const mainLocation = mainIndex.get(normalizeReadingWordKey(word.word));
        if (!mainLocation) {
          batchFailed += 1;
          return word;
        }
        const merged = mergeReadingWordAiProfile(word, profile);
        const mergedMain = mergeAiProfileIntoMainEntry(mainLocation.entry, profile);
        nextMainWords[mainLocation.index] = mergedMain;
        if (isReadingWordIncomplete(merged) || isMainEntryClassificationIncomplete(mergedMain)) {
          batchFailed += 1;
        } else {
          batchFilled += 1;
        }
        return merged;
      });

      if (aiControlRef.current.stopped) break;
      try {
        if (firstWrite) {
          await saveWordsToIndexedDBWithBackup(
            nextMainWords,
            workingMainWords,
            mainLexiconRef.current.meta,
            { reason: "personal-reading-ai-completion" }
          );
          if (aiControlRef.current.stopped) {
            await saveWordsToIndexedDB(workingMainWords, mainLexiconRef.current.meta);
            return;
          }
          if (!writeReadingWordsWithBackup(workingWords, words)) {
            await saveWordsToIndexedDB(workingMainWords, mainLexiconRef.current.meta);
            throw new Error("阅读生词写入失败，主词库已自动回退");
          }
        } else {
          await saveWordsToIndexedDB(nextMainWords, mainLexiconRef.current.meta);
          if (aiControlRef.current.stopped) {
            await saveWordsToIndexedDB(workingMainWords, mainLexiconRef.current.meta);
            return;
          }
          if (!writeReadingWords(workingWords)) {
            await saveWordsToIndexedDB(workingMainWords, mainLexiconRef.current.meta);
            throw new Error("阅读生词写入失败，本批主词库写回已自动回退");
          }
        }
      } catch (error) {
        aiControlRef.current.controller = null;
        setAiRun({
          status: "error",
          processed,
          total: targets.length,
          filled,
          failed: failed + batch.length,
          message: `本批未写入且已停止：${error?.message || error}`
        });
        return;
      }
      workingMainWords = nextMainWords;
      firstWrite = false;
      updateMainLexiconMemory(workingMainWords);
      setRollbackAvailable(true);
      processed += batch.length;
      filled += batchFilled;
      failed += batchFailed;
      setWords(workingWords);
      setAiRun({
        status: "running",
        processed,
        total: targets.length,
        filled,
        failed,
        message: `已完成 ${processed} / ${targets.length}；只写入原来缺失的字段。`
      });
    }

    if (aiControlRef.current.stopped) return;
    aiControlRef.current.controller = null;
    setAiRun({
      status: "done",
      processed,
      total: targets.length,
      filled,
      failed,
      message: failed
        ? `补全结束：${filled} 个重新校验通过，${failed} 个仍不完整。`
        : `补全结束：${filled} 个重新校验通过。`
    });
  };

  if (!ready) {
    return (
      <main className={styles.page}>
        <div className={styles.loading}>正在读取阅读生词栏…</div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <div className={styles.titleLine}>
            <BookOpenText aria-hidden="true" />
            <h1>阅读生词栏</h1>
          </div>
          <p>阅读生词独立学习；已有主词直接复用资料，新词安全加入浏览器主词库补充层。</p>
        </div>
        <div className={styles.headerStats} aria-label="阅读生词统计">
          <strong>{words.length}</strong>
          <span>全部生词</span>
          <strong>{highFrequencyWords.length}</strong>
          <span>高频词</span>
          <strong>{incompleteWords.length}</strong>
          <span>待补全</span>
        </div>
      </header>

      <div className={`${styles.syncBanner} ${mainLexiconStatus.status === "error" ? styles.syncError : ""}`} role="status">
        <span>{mainLexiconStatus.message}</span>
        {mainClassificationPending.length ? <em>主词库待分类 {mainClassificationPending.length} 个</em> : null}
      </div>

      <section className={styles.toolbar} aria-label="阅读生词工具栏">
        <label className={styles.searchBox}>
          <Search aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索单词、释义或同义替换"
          />
        </label>
        <button
          type="button"
          className={onlyIncomplete ? styles.activeTool : styles.secondaryButton}
          onClick={() => setOnlyIncomplete((value) => !value)}
          aria-pressed={onlyIncomplete}
        >
          <AlertTriangle aria-hidden="true" />待补全 {incompleteWords.length}
        </button>
        <button
          type="button"
          className={onlyFrequent ? styles.activeTool : styles.secondaryButton}
          onClick={() => setOnlyFrequent((value) => !value)}
          aria-pressed={onlyFrequent}
        >
          <Star aria-hidden="true" />高频词 {highFrequencyWords.length}
        </button>
        <button type="button" className={styles.secondaryButton} onClick={() => setAddOpen((value) => !value)} disabled={actionsDisabled}>
          <BookPlus aria-hidden="true" />单个添加
        </button>
        <button type="button" className={styles.secondaryButton} onClick={() => setBatchOpen((value) => !value)} disabled={actionsDisabled}>
          <FileSpreadsheet aria-hidden="true" />表格批量添加
        </button>
        <button type="button" className={styles.secondaryButton} onClick={exportTransferPackage} disabled={!words.length || actionsDisabled}>
          <Download aria-hidden="true" />跨设备导出
        </button>
        <label className={`${styles.secondaryButton} ${styles.portableImport}`} aria-disabled={actionsDisabled}>
          <Upload aria-hidden="true" />跨设备导入
          <input type="file" accept=".json,application/json" onChange={importTransferFile} disabled={actionsDisabled} />
        </label>
        <button type="button" className={styles.secondaryButton} onClick={exportBackup} disabled={!words.length || aiRunning || mainWriteBusy}>
          <Download aria-hidden="true" />仅导出生词
        </button>
        <button type="button" className={styles.secondaryButton} onClick={restoreLastSyncBackup} disabled={!rollbackAvailable || aiRunning || mainWriteBusy}>
          恢复上次同步
        </button>
        <button type="button" className={styles.aiButton} onClick={() => setAiOpen((value) => !value)}>
          <Sparkles aria-hidden="true" />AI 工具
        </button>
      </section>

      {storageError ? <div className={styles.errorBanner}>{storageError}</div> : null}

      {addOpen ? (
        <section className={styles.editorPanel} aria-label="单个添加单词">
          <div className={styles.panelHeading}>
            <div><strong>添加一个阅读生词</strong><span>只填单词也可以，其他空项稍后交给 AI 补全。</span></div>
            <button type="button" onClick={() => setAddOpen(false)} aria-label="关闭单词添加"><X aria-hidden="true" /></button>
          </div>
          <form className={styles.wordForm} onSubmit={submitSingleWord}>
            <label><span>单词 *</span><input value={draft.word} onChange={(event) => setDraft({ ...draft, word: event.target.value })} placeholder="例如：allocate" /></label>
            <label><span>中文释义</span><input value={draft.meaning} onChange={(event) => setDraft({ ...draft, meaning: event.target.value })} placeholder="例如：分配" /></label>
            <label><span>词性</span><input value={draft.pos} onChange={(event) => setDraft({ ...draft, pos: event.target.value })} placeholder="例如：verb" /></label>
            <label><span>音标</span><input value={draft.phonetic} onChange={(event) => setDraft({ ...draft, phonetic: event.target.value })} placeholder="/ˈæləkeɪt/" /></label>
            <label className={styles.wideField}><span>英文释义</span><input value={draft.definition} onChange={(event) => setDraft({ ...draft, definition: event.target.value })} /></label>
            <label className={styles.wideField}><span>英文例句</span><input value={draft.example} onChange={(event) => setDraft({ ...draft, example: event.target.value })} /></label>
            <label className={styles.wideField}><span>例句翻译</span><input value={draft.exampleCn} onChange={(event) => setDraft({ ...draft, exampleCn: event.target.value })} /></label>
            <label className={styles.wideField}><span>同义替换</span><input value={draft.synonyms} onChange={(event) => setDraft({ ...draft, synonyms: event.target.value })} placeholder="多个词用逗号或分号分开" /></label>
            <div className={styles.formActions}><button type="submit" className={styles.primaryButton}>加入阅读生词栏</button></div>
          </form>
        </section>
      ) : null}

      {batchOpen ? (
        <section className={styles.editorPanel} aria-label="表格批量添加单词">
          <div className={styles.panelHeading}>
            <div><strong>表格批量添加</strong><span>可直接粘贴 Excel / WPS 表格，或上传 CSV、TSV、TXT、JSON 备份。</span></div>
            <button type="button" onClick={() => setBatchOpen(false)} aria-label="关闭批量添加"><X aria-hidden="true" /></button>
          </div>
          <textarea
            className={styles.batchTextarea}
            value={batchText}
            onChange={(event) => setBatchText(event.target.value)}
            placeholder={"单词\t中文释义\t词性\t英文释义\t英文例句\t例句翻译\t同义替换\nallocate\t分配\tverb\tto distribute resources\t...\t...\tassign; distribute"}
          />
          <div className={styles.batchFooter}>
            <label className={styles.uploadButton}>
              <Upload aria-hidden="true" />选择文件
              <input type="file" accept=".csv,.tsv,.txt,.json,text/csv,text/plain,application/json" onChange={loadImportFile} />
            </label>
            <span className={parsedBatch.error ? styles.batchError : ""}>
              {parsedBatch.error || `已识别 ${parsedBatch.words.length} 行；重复导入会累计次数，第 2 次起标记为高频词。`}
            </span>
            <button type="button" className={styles.primaryButton} onClick={importBatch} disabled={actionsDisabled || !parsedBatch.words.length || Boolean(parsedBatch.error)}>
              添加识别到的单词
            </button>
          </div>
        </section>
      ) : null}

      {aiOpen ? (
        <section className={styles.aiPanel} aria-label="阅读生词 AI 工具">
          <div className={styles.aiIntro}>
            <div className={styles.aiIcon}><Bot aria-hidden="true" /></div>
            <div>
              <strong>阅读生词专用 AI 补全</strong>
              <p>扫描范围固定为本页 {words.length} 个词，只处理其中 {aiTargetWords.length} 个待补全或主词库待分类词；阅读生词不保存分类。</p>
            </div>
          </div>
          <div className={styles.aiRules}>
            <span>每批最多 10 词</span>
            <span>并发 1</span>
            <span>自动重试 0</span>
            <span>可随时停止</span>
            <span>只补空字段</span>
          </div>
          <p className={styles.aiCost}>
            缓存命中不调用付费模型；缓存未命中时会调用 DeepSeek，预计最多 {Math.ceil(aiTargetWords.length / 10)} 次批量请求。
            实际费用取决于你当前 DeepSeek 模型和控制台单价，本页面无法准确换算金额。
          </p>
          <label className={styles.confirmRow}>
            <input type="checkbox" checked={aiConfirmed} onChange={(event) => setAiConfirmed(event.target.checked)} disabled={aiRunning} />
            <span>我确认只补全上述阅读生词，并了解缓存未命中可能产生费用。</span>
          </label>
          {aiRun.total || aiRun.message ? (
            <div className={styles.aiProgress}>
              <div><span style={{ width: `${aiRun.total ? (aiRun.processed / aiRun.total) * 100 : 0}%` }} /></div>
              <p>{aiRun.message || "准备开始"} {aiRun.total ? `· 通过 ${aiRun.filled} · 仍不完整 ${aiRun.failed}` : ""}</p>
            </div>
          ) : null}
          <div className={styles.aiActions}>
            <button type="button" className={styles.aiButton} onClick={runAiCompletion} disabled={!aiConfirmed || aiRunning || !aiTargetWords.length || !mainReady}>
              <Sparkles aria-hidden="true" />开始处理 {aiTargetWords.length} 个词
            </button>
            {aiRunning ? <button type="button" className={styles.stopButton} onClick={stopAiRun}>停止补全</button> : null}
          </div>
        </section>
      ) : null}

      <div className={styles.workspace}>
        <aside className={styles.wordList} aria-label="阅读生词列表">
          <div className={styles.listHeading}>
            <strong>{onlyFrequent ? "高频阅读生词" : onlyIncomplete ? "待补全生词" : "全部阅读生词"}</strong>
            <span>{visibleWords.length} 个</span>
          </div>
          {visibleWords.length ? (
            <div className={styles.listRows}>
              {visibleWords.map((word) => {
                const missing = getReadingWordMissingFields(word);
                return (
                  <button
                    type="button"
                    key={word.id}
                    className={`${styles.wordRow}${selectedWord?.id === word.id ? ` ${styles.selectedRow}` : ""}`}
                    onClick={() => setSelectedId(word.id)}
                  >
                    <span><strong>{word.word}</strong><small>{word.meaning || "暂无释义"}</small></span>
                    <span className={styles.rowBadges}>
                      {word.highFrequency || Number(word.importCount) >= 2 ? <b>高频 ×{word.importCount}</b> : null}
                      {missing.length ? <em>{missing.length} 项待补</em> : <i>完整</i>}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyList}>
              <BookPlus aria-hidden="true" />
              <strong>{words.length ? "当前筛选没有单词" : "还没有阅读生词"}</strong>
              <span>{words.length ? "可清空搜索或关闭待补全筛选。" : "点击“单个添加”或“表格批量添加”开始建立自己的词库。"}</span>
            </div>
          )}
        </aside>

        <article className={`page--word-flash ${styles.wordCard}`} aria-label="阅读生词详情">
          {selectedWord ? (
            <>
              <div className="word-canvas-tools">
                <span>
                  阅读生词 · {selectedIndex + 1} / {visibleWords.length}
                  {selectedWord.highFrequency || Number(selectedWord.importCount) >= 2 ? ` · 高频 ×${selectedWord.importCount}` : ""}
                </span>
                <button
                  type="button"
                  className={`word-canvas-icon${selectedWord.favorite ? " is-active" : ""}`}
                  onClick={() => patchSelectedWord({ favorite: !selectedWord.favorite })}
                  aria-pressed={selectedWord.favorite}
                  aria-label={selectedWord.favorite ? "取消收藏" : "收藏"}
                >
                  <Bookmark aria-hidden="true" />
                </button>
              </div>

              {missingFields.length ? (
                <div className={styles.missingBanner}>
                  <AlertTriangle aria-hidden="true" />
                  待补全：{missingFields.map((field) => MISSING_FIELD_LABELS[field]).join("、")}
                </div>
              ) : null}

              <WordStudyContent
                item={selectedWord}
                audioInfo={{ phonetic: selectedWord.phonetic }}
                displayForms={(Array.isArray(selectedWord.forms) ? selectedWord.forms : []).map((form) => (
                  typeof form === "string" ? { word: form } : form
                ))}
                fallback={(value, fallbackValue) => String(value || "").trim() || fallbackValue}
                speakExample={() => speak(selectedWord.example)}
                speakWord={() => speak(selectedWord.word)}
              />

              <div className={styles.detailGrid}>
                <DetailList
                  title="变形"
                  items={Array.isArray(selectedWord.forms) ? selectedWord.forms : []}
                  emptyText="暂无重要变形"
                  renderItem={(item, index) => (
                    <div className={styles.detailItem} key={`${item?.word || item}-${index}`}>
                      <strong>{item?.word || item}</strong><span>{item?.type || item?.note || ""}</span>
                    </div>
                  )}
                />
                <DetailList
                  title="词族"
                  items={Array.isArray(selectedWord.wordFamily) ? selectedWord.wordFamily : []}
                  emptyText="暂无词族信息"
                  renderItem={(item, index) => (
                    <div className={styles.detailItem} key={`${item?.word || item}-${index}`}>
                      <strong>{item?.word || item}</strong><span>{item?.meaning || item?.pos || ""}</span>
                    </div>
                  )}
                />
                <DetailList
                  title="同义替换"
                  items={Array.isArray(selectedWord.synonyms) ? selectedWord.synonyms : []}
                  emptyText="当前词暂无可靠同义替换"
                  renderItem={(item) => (
                    <button type="button" className={styles.synonymItem} key={item} onClick={() => speak(item)}>
                      <Volume2 aria-hidden="true" />{item}
                    </button>
                  )}
                />
              </div>

              <WordStudyActions
                item={selectedWord}
                isStudyEmpty={false}
                isExternalIdictationItem={false}
                prevWord={() => moveSelection(-1)}
                nextWord={() => moveSelection(1)}
                markStatus={(status) => patchSelectedWord({
                  status: selectedWord.status === status ? "" : status
                })}
              />
            </>
          ) : (
            <div className={styles.cardEmpty}>
              <BookOpenText aria-hidden="true" />
              <strong>选择一个阅读生词查看详情</strong>
              <span>详情中不会出现词组搭配和短语搭配。</span>
            </div>
          )}
        </article>
      </div>

      {notice ? <div className={styles.toast} role="status">{notice}</div> : null}
    </main>
  );
}
