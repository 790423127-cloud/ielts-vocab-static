"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Trash2,
  Upload,
  X
} from "lucide-react";
import WordStudyActions from "../components/WordStudyActions.jsx";
import WordStudyContent from "../components/WordStudyContent.jsx";
import WordDetailGrid from "../components/WordDetailGrid.jsx";
import WordStudyProgress from "../components/WordStudyProgress.jsx";
import WordStudyWorkspace from "../components/WordStudyWorkspace.jsx";
import StudyMeaningToggle from "../components/StudyMeaningToggle.jsx";
import WordStudyOrderControls from "../components/WordStudyOrderControls.jsx";
import VirtualList from "../components/VirtualList.jsx";
import { useOrderedStudyRows } from "../hooks/useOrderedStudyRows.js";
import {
  applyMainEntryToReadingWord,
  backfillReadingWordsIntoMain,
  buildReadingMainLookup,
  buildReadingSynonymDisplay,
  ensureReadingWordMainEntry,
  isMainEntryClassificationIncomplete,
  mergeAiProfileIntoMainEntry,
  needsReadingAiProcessing,
  reconcileReadingImportsWithMain,
  resolveReadingMainEntry,
  suggestCanonicalReadingHeadword
} from "../lib/reading-words/main-lexicon-sync.mjs";
import {
  buildReadingWordsTransferPackage,
  importReadingWordsTransferPackage
} from "../lib/reading-words/transfer.mjs";
import { mergePublishedReadingWordsWithLocal } from "../lib/reading-words/published-merge.mjs";
import {
  buildReadingWordsBackup,
  getReadingWordContext,
  getReadingWordMissingFields,
  isReadingWordIncomplete,
  loadPersistedReadingWords,
  mergeReadingWordAiProfile,
  normalizeReadingWord,
  normalizeReadingWordKey,
  parseReadingWordsTable,
  persistReadingWords,
  readPersistedReadingWordsRollback,
  readReadingWordsSession,
  writeReadingWordsSession
} from "../lib/reading-words/storage.mjs";
import {
  applyReadingSynonymDetailPatches,
  enrichReadingWordsSynonymDetails,
  normalizeReadingSynonymDetails
} from "../lib/reading-words/synonym-details.mjs";
import {
  removeLinkedMainEntry,
  removeReadingWordEntry,
  shouldHandleReadingWordDeleteShortcut
} from "../lib/reading-words/delete.mjs";
import { mergeWordContentWithUserState } from "../lib/vocab/word-cache-meta.mjs";
import {
  loadActiveWordsForSync,
  loadWordsImportBackupFromIndexedDB,
  postExportCache,
  saveWordsToIndexedDB,
  saveWordsToIndexedDBWithBackup
} from "../lib/vocab/word-store.mjs";
import {
  buildLexiconDeletionIntent,
  formalLexiconWords
} from "../lib/vocab/lexicon-delete-intent.mjs";
import { getStudyKeyboardAction } from "../lib/vocab/study-keyboard-shortcuts.mjs";
import { createStudyHoldStepper, isStudyHoldArrowKey } from "../lib/vocab/study-hold-step.mjs";
import { DELETE_CURRENT_WORD_EVENT } from "../lib/vocab/delete-current-word-request.mjs";
import { WORD_CARD_SWIPE_EVENT } from "../lib/vocab/word-flashcard-swipe.mjs";
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

const EMPTY_AI_RUN = {
  status: "idle",
  processed: 0,
  total: 0,
  filled: 0,
  failed: 0,
  message: ""
};

const AI_DONE_VISIBLE_MS = 6000;
const AI_DONE_WITH_FAILURES_VISIBLE_MS = 12000;

const MISSING_FIELD_LABELS = {
  pos: "词性",
  meaning: "中文释义",
  definition: "英文释义",
  example: "英文例句",
  exampleCn: "例句翻译",
  forms: "变形",
  wordFamily: "词族",
  synonyms: "同义替换",
  synonymDetails: "同义替换释义",
  multiPosSenses: "多词性义项"
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

function findLinkedMainEntry(word, words = [], index = null, mainLookup = null) {
  const direct = index?.get(normalizeReadingWordKey(word?.word));
  const linkedId = String(word?.mainWordId || word?.baseWordId || "").trim();
  const directId = String(direct?.entry?.id || direct?.entry?.wordId || "").trim();
  if (
    direct
    && direct.entry?.studyMode !== "reference"
    && (!linkedId || linkedId === directId)
  ) return direct;
  return resolveReadingMainEntry(word, words, mainLookup) || direct;
}

async function restorePublishedReadingWords(localWords) {
  try {
    const response = await fetch("/data/personal-reading-words.json", { cache: "no-store" });
    if (!response.ok) return localWords;
    const payload = await response.json();
    const transfer = payload?.transfer;
    if (
      transfer?.type !== "ielts-reading-words-transfer" ||
      Number(transfer?.version) !== 1 ||
      !Array.isArray(transfer?.readingWords) ||
      !Array.isArray(transfer?.linkedMainEntries)
    ) {
      return localWords;
    }
    return mergePublishedReadingWordsWithLocal(transfer.readingWords, localWords);
  } catch {
    return localWords;
  }
}

async function readJsonResponse(response, fallbackMessage) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(fallbackMessage);
  }
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
  const [staticPublishState, setStaticPublishState] = useState({
    status: "waiting",
    message: "静态发布包：等待主词库就绪"
  });
  const [mainLexiconStatus, setMainLexiconStatus] = useState({
    status: "loading",
    count: 0,
    message: "正在核对正式主词库…"
  });
  const [rollbackAvailable, setRollbackAvailable] = useState(false);
  const [mainWriteBusy, setMainWriteBusy] = useState(false);
  const [aiConfirmed, setAiConfirmed] = useState(false);
  const [aiRun, setAiRun] = useState(EMPTY_AI_RUN);
  const aiControlRef = useRef({ controller: null, stopped: false });
  const aiConfirmRef = useRef(null);
  const mainLexiconRef = useRef({ words: [], meta: {}, index: new Map(), lookup: null });
  const mainMutationInFlightRef = useRef(false);
  const selectedWordRef = useRef(null);
  const selectedIdRef = useRef("");
  const visibleWordsRef = useRef([]);
  const selectedStudyWordRef = useRef(null);
  const staticPublishSignatureRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      const mainResourcesPromise = Promise.all([
        loadActiveWordsForSync(),
        loadWordsImportBackupFromIndexedDB()
      ]);
      const savedReading = await loadPersistedReadingWords();
      const savedWords = await restorePublishedReadingWords(savedReading.words);
      const savedSession = readReadingWordsSession();
      if (!cancelled) {
        if (savedReading.warning) setNotice(savedReading.warning);
        setWords(savedWords);
        setSelectedId(savedWords.some((word) => word.id === savedSession.selectedId)
          ? savedSession.selectedId
          : savedWords[0]?.id || "");
        setSearch(savedSession.search);
        setOnlyIncomplete(savedSession.onlyIncomplete);
        setOnlyFrequent(savedSession.onlyFrequent);
        setReady(true);
      }

      const [loaded, backup] = await mainResourcesPromise;
      if (cancelled) return;
      const activeMainWords = Array.isArray(loaded?.words) ? loaded.words : [];
      // loadActiveWordsForSync has already compared the IndexedDB snapshot with
      // /api/vocab-meta and downloads /api/vocab-data when it is stale. Reuse
      // that verified snapshot instead of downloading and parsing the 30+ MB
      // master payload a second time on every visit to this page.
      const formalMainWords = formalLexiconWords(activeMainWords);
      if (!activeMainWords.length || !formalMainWords.length) {
        setMainLexiconStatus({
          status: "error",
          count: 0,
          message: "正式主词库为空，已停止自动同步；阅读生词仍可查看和导出。"
        });
        return;
      }

      const migration = backfillReadingWordsIntoMain(savedWords, formalMainWords, {
        now: new Date().toISOString()
      });
      const nextMeta = { ...(loaded?.meta || {}) };
      const formalDisplayMainWords = mergeWordContentWithUserState(
        formalMainWords,
        activeMainWords,
        { includePersonalSupplements: false }
      );
      let nextMainWords = mergeWordContentWithUserState(
        migration.mainWords,
        activeMainWords,
        { includePersonalSupplements: false }
      );
      let nextReadingWords = migration.words;
      let publishedMeta = null;
      let syncIssue = "";
      let syncIssueStatus = "readonly";

      if (migration.mainChanged) {
        try {
          await saveWordsToIndexedDBWithBackup(
            nextMainWords,
            activeMainWords,
            nextMeta,
            { reason: "personal-reading-legacy-main-backfill" }
          );
          const savedReading = await persistReadingWords(nextReadingWords, savedWords);
          if (!savedReading.ok) {
            throw new Error(`旧阅读生词关联写入失败：${savedReading.error?.message || "未知错误"}`);
          }
          const result = await postExportCache(
            migration.mainWords,
            nextMeta,
            {
              source: "personal-reading-legacy-main-backfill",
              forceRefresh: true
            }
          );
          if (!result?.ok) {
            const detail = [result?.error, result?.detail].filter(Boolean).join("：");
            throw new Error(`旧阅读生词写入正式主词库失败：${detail || "未知错误"}`);
          }
          publishedMeta = result;
        } catch (error) {
          const rollbackIssues = [];
          try {
            await saveWordsToIndexedDB(activeMainWords, loaded?.meta || {});
          } catch (rollbackError) {
            rollbackIssues.push(`主词库本地缓存回退失败：${rollbackError?.message || rollbackError}`);
          }
          const restoredReading = await persistReadingWords(savedWords);
          if (!restoredReading.ok) {
            rollbackIssues.push(`阅读生词本地记录回退失败：${restoredReading.error?.message || "未知错误"}`);
          }
          nextMainWords = formalDisplayMainWords;
          nextReadingWords = savedWords;
          syncIssue = `旧阅读生词未写回正式主词库：${error?.message || error}`;
          if (rollbackIssues.length) {
            syncIssue += `；${rollbackIssues.join("；")}`;
            syncIssueStatus = "error";
          }
        }
        if (!syncIssue) {
          setNotice(
            migration.correctedHeadwords
              ? `已纠正 ${migration.correctedHeadwords} 个断词，并将 ${migration.addedToMain} 个旧阅读生词补入正式主词库。`
              : `已将 ${migration.addedToMain} 个旧阅读生词补入正式主词库；等待 AI 扫描分类。`
          );
        }
      } else {
        const readingSyncResult = migration.readingChanged
          ? await persistReadingWords(nextReadingWords, savedWords)
          : { ok: true };
        const readingSyncFailed = !readingSyncResult.ok;
        if (readingSyncFailed) {
          nextReadingWords = savedWords;
          syncIssue = "阅读生词断词纠正未写入，本地原记录已保留";
        }
        const activeLookup = buildReadingMainLookup(nextMainWords);
        const activeIndex = activeLookup.byKey;
        nextReadingWords = nextReadingWords.map((word) => {
          const linked = findLinkedMainEntry(word, nextMainWords, activeIndex, activeLookup)?.entry;
          return linked ? applyMainEntryToReadingWord(word, linked) : word;
        });
        if (migration.correctedHeadwords && !readingSyncFailed) {
          setNotice(`已自动纠正 ${migration.correctedHeadwords} 个阅读断词，并复用正式主词库资料。`);
        }
      }

      if (cancelled) return;
      nextReadingWords = enrichReadingWordsSynonymDetails(nextReadingWords, {
        mainWords: nextMainWords
      }).words;
      const mainLookup = buildReadingMainLookup(nextMainWords);
      const mainIndex = mainLookup.byKey;
      mainLexiconRef.current = {
        words: nextMainWords,
        meta: { ...nextMeta, ...(publishedMeta || {}) },
        index: mainIndex,
        lookup: mainLookup
      };
      // Do not publish immediately after hydration.  A browser may contain an
      // older local copy, and its initial render must never overwrite the
      // cross-device static package before the learner actually changes data.
      const initialTransfer = buildReadingWordsTransferPackage(
        nextReadingWords,
        nextMainWords,
        { ...nextMeta, ...(publishedMeta || {}) }
      );
      staticPublishSignatureRef.current = JSON.stringify({
        readingWords: initialTransfer.readingWords,
        linkedMainEntries: initialTransfer.linkedMainEntries,
        sourceMainMeta: initialTransfer.sourceMainMeta
      });
      setWords(nextReadingWords);
      setMainLexiconStatus({
        status: syncIssue ? syncIssueStatus : "ready",
        count: nextMainWords.length,
        message: syncIssue
          ? `已连接正式主词库 ${nextMainWords.length.toLocaleString("zh-CN")} 词并用于补全显示；${syncIssue}`
          : `已连接正式主词库 ${nextMainWords.length.toLocaleString("zh-CN")} 词`
      });
      setRollbackAvailable(
        migration.mainChanged ||
        migration.readingChanged ||
        backup?.status === "cache-hit" ||
        Boolean(await readPersistedReadingWordsRollback(nextReadingWords))
      );
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
    if (!ready) return undefined;
    let cancelled = false;
    void persistReadingWords(words).then((result) => {
      if (cancelled) return;
      setStorageError(
        result.ok
          ? result.warning || ""
          : `阅读生词保存失败：${result.error?.message || "未知错误"}`
      );
    });
    return () => {
      cancelled = true;
    };
  }, [ready, words]);

  useEffect(() => {
    if (!ready) return;
    writeReadingWordsSession({ selectedId, search, onlyIncomplete, onlyFrequent });
  }, [onlyFrequent, onlyIncomplete, ready, search, selectedId]);

  useEffect(() => {
    if (!ready || mainLexiconStatus.status !== "ready" || mainWriteBusy) return undefined;

    const transfer = buildReadingWordsTransferPackage(
      words,
      mainLexiconRef.current.words,
      mainLexiconRef.current.meta
    );
    const signature = JSON.stringify({
      readingWords: transfer.readingWords,
      linkedMainEntries: transfer.linkedMainEntries,
      sourceMainMeta: transfer.sourceMainMeta
    });
    if (staticPublishSignatureRef.current === signature) return undefined;

    let active = true;
    const controller = new AbortController();
    setStaticPublishState({
      status: "saving",
      message: "静态发布包：正在写入"
    });
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/reading-words/publish-static", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            transfer,
            sourceUpdatedAt: new Date().toISOString()
          }),
          signal: controller.signal
        });
        const result = await readJsonResponse(
          response,
          "服务器返回格式异常，请刷新页面后重试。"
        );
        if (!response.ok || !result?.ok) {
          throw new Error(result?.error || "静态发布包写入失败");
        }
        if (!active) return;
        staticPublishSignatureRef.current = signature;
        if (Array.isArray(result.synonymDetails) && result.synonymDetails.length) {
          setWords((currentWords) => {
            const patched = applyReadingSynonymDetailPatches(currentWords, result.synonymDetails);
            return patched.changed ? patched.words : currentWords;
          });
        }
        setStaticPublishState({
          status: "saved",
          message: `静态发布包：已更新 · ${result.wordCount || 0} 词`
        });
      } catch (error) {
        if (!active || error?.name === "AbortError") return;
        setStaticPublishState({
          status: "error",
          message: `静态发布包写入失败：${error?.message || error}`
        });
      }
    }, 700);

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [mainLexiconStatus.status, mainWriteBusy, ready, words]);

  useEffect(() => {
    if (!notice) return;
    // AI 结果文案较长，多留一会儿；普通提示仍约 3 秒
    const ms = notice.includes("补全") || notice.includes("AI") ? 12000 : 3200;
    const timer = window.setTimeout(() => setNotice(""), ms);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (aiRun.status !== "done") return;
    const visibleMs = aiRun.failed > 0
      ? AI_DONE_WITH_FAILURES_VISIBLE_MS
      : AI_DONE_VISIBLE_MS;
    const timer = window.setTimeout(() => {
      setAiRun((current) => (current.status === "done" ? EMPTY_AI_RUN : current));
    }, visibleMs);
    return () => window.clearTimeout(timer);
  }, [aiRun.failed, aiRun.status]);

  const readingOrderPool = useMemo(() => {
    const mainAvailable = mainLexiconStatus.count > 0
      && mainLexiconRef.current.words.length > 0;
    const mainIndex = mainLexiconRef.current.index;
    const mainLookup = mainLexiconRef.current.lookup;
    return words.map((word) => {
      const mainEntry = mainAvailable
        ? findLinkedMainEntry(word, mainLexiconRef.current.words, mainIndex, mainLookup)?.entry
        : null;
      // 勿 {...main, ...word}：生词本空 example 会盖住主词库例句
      const merged = mainEntry
        ? applyMainEntryToReadingWord(word, mainEntry)
        : word;
      return {
        ...merged,
        difficulty: mainEntry?.difficulty || word.difficulty || ""
      };
    });
  }, [mainLexiconStatus.count, words]);
  const readingDisplayById = useMemo(
    () => new Map(readingOrderPool.map((word) => [word.id, word])),
    [readingOrderPool]
  );
  const incompleteWords = useMemo(
    () => readingOrderPool.filter(isReadingWordIncomplete),
    [readingOrderPool]
  );
  // 生词本会先从轻量本地记录绘制，随后再用正式主词库补齐资料。
  // 主词库尚在载入时，空字段不能代表真正“待补全”，否则会先显示橙色
  // 待补标签，主词库到达后又跳成绿色完整标签。
  const isReadingCompletenessPending = mainLexiconStatus.status === "loading";
  const onlyIncompleteActive = onlyIncomplete && !isReadingCompletenessPending;
  const highFrequencyWords = useMemo(
    () => readingOrderPool.filter(
      (word) => word.highFrequency === true || Number(word.importCount) >= 2
    ),
    [readingOrderPool]
  );
  const aiTargetWords = useMemo(() => {
    const mainIndex = mainLexiconRef.current.index;
    const mainWords = mainLexiconRef.current.words;
    const mainLookup = mainLexiconRef.current.lookup;
    return words.filter((word, index) => {
      const mainEntry = findLinkedMainEntry(word, mainWords, mainIndex, mainLookup)?.entry;
      return needsReadingAiProcessing(
        readingOrderPool[index] || word,
        mainEntry,
        mainWords,
        {
          requireMainClassification: mainLexiconStatus.status === "ready",
          mainLookup
        }
      );
    });
  }, [mainLexiconStatus.status, readingOrderPool, words]);
  const baseVisibleRows = useMemo(
    () => readingOrderPool
      .map((word, originalIndex) => ({ entry: word, originalIndex }))
      .filter(({ entry: word }) => (
      (!onlyIncompleteActive || isReadingWordIncomplete(word)) &&
      (!onlyFrequent || word.highFrequency === true || Number(word.importCount) >= 2)
    )),
    [onlyFrequent, onlyIncompleteActive, readingOrderPool]
  );
  const selectedPoolIndex = words.findIndex((word) => word.id === selectedId);
  const wordOrdering = useOrderedStudyRows({
    orderKey: `reading-words:${onlyIncompleteActive ? "incomplete" : "all"}:${onlyFrequent ? "frequent" : "all"}`,
    rows: baseVisibleRows,
    pool: readingOrderPool,
    currentIndex: selectedPoolIndex
  });
  const visibleWords = useMemo(
    () => wordOrdering.rows
      .map((row) => {
        const word = words[row.originalIndex];
        const displayWord = readingOrderPool[row.originalIndex] || word;
        return word && wordMatchesSearch(displayWord, search) ? word : null;
      })
      .filter(Boolean),
    [readingOrderPool, search, wordOrdering.rows, words]
  );
  const readingListRows = useMemo(
    () => visibleWords.map((word) => {
      const displayWord = readingDisplayById.get(word.id) || word;
      const completenessPending = isReadingCompletenessPending;
      const missingCount = completenessPending
        ? null
        : getReadingWordMissingFields(displayWord).length;
      const mainEntry = findLinkedMainEntry(
        word,
        mainLexiconRef.current.words,
        mainLexiconRef.current.index,
        mainLexiconRef.current.lookup
      )?.entry;
      return {
        word,
        meaning: displayWord.meaning || "暂无释义",
        missingCount,
        completenessPending,
        mainStatus: completenessPending
          ? ""
          : !mainEntry
          ? "主词库未收录"
          : isMainEntryClassificationIncomplete(mainEntry)
            ? "主词库待分类"
            : ""
      };
    }),
    [isReadingCompletenessPending, readingDisplayById, visibleWords]
  );
  const changeWordOrderMode = useCallback((nextMode) => {
    const nextIndex = wordOrdering.changeMode(nextMode);
    if (Number.isInteger(nextIndex) && words[nextIndex]) {
      setSelectedId(words[nextIndex].id);
    }
  }, [wordOrdering, words]);
  const changeWordDifficultyMode = useCallback((nextMode) => {
    const nextIndex = wordOrdering.changeDifficultyMode(nextMode);
    if (Number.isInteger(nextIndex) && words[nextIndex]) {
      setSelectedId(words[nextIndex].id);
    }
  }, [wordOrdering, words]);
  const toggleIncompleteFilter = useCallback(() => {
    if (isReadingCompletenessPending) return;
    if (onlyIncomplete) {
      setOnlyIncomplete(false);
      return;
    }
    if (!incompleteWords.length) {
      setNotice("没有待补全的阅读生词。");
      return;
    }
    setOnlyIncomplete(true);
  }, [incompleteWords.length, isReadingCompletenessPending, onlyIncomplete]);

  useEffect(() => {
    if (!visibleWords.length) {
      // 筛选把列表筛空时自动解除，避免「明明有词却像丢了记录」
      // （例如 AI 补全后仍开着「仅待补全」，或残留搜索词）
      if (words.length && (onlyIncomplete || onlyFrequent || search)) {
        if (onlyIncomplete) setOnlyIncomplete(false);
        if (onlyFrequent) setOnlyFrequent(false);
        if (search) setSearch("");
        setNotice("当前筛选没有生词，已自动显示全部阅读生词。");
      }
      return;
    }
    if (!visibleWords.some((word) => word.id === selectedId)) {
      setSelectedId(visibleWords[0].id);
    }
  }, [onlyFrequent, onlyIncomplete, search, selectedId, visibleWords, words.length]);

  // 展示用：优先当前筛选列表；列表为空时回退到全库，避免补全后卡片整页空白
  const selectedWord = (
    visibleWords.find((word) => word.id === selectedId)
    || visibleWords[0]
    || words.find((word) => word.id === selectedId)
    || words[0]
    || null
  );
  selectedWordRef.current = selectedWord;
  selectedIdRef.current = selectedWord?.id || "";
  visibleWordsRef.current = visibleWords;
  const selectedIndex = selectedWord
    ? visibleWords.findIndex((word) => word.id === selectedWord.id)
    : -1;
  const studyPosition = selectedIndex >= 0 ? selectedIndex + 1 : (selectedWord ? 1 : 0);
  const selectedMainEntry = selectedWord
    ? findLinkedMainEntry(
      selectedWord,
      mainLexiconRef.current.words,
      mainLexiconRef.current.index,
      mainLexiconRef.current.lookup
    )?.entry
    : null;
  // 展示层：用主词库补全空的例句/释义/变形等（与参考图 A 一致）
  const selectedStudyWord = useMemo(() => {
    if (!selectedWord) return null;
    return readingDisplayById.get(selectedWord.id) || selectedWord;
  }, [readingDisplayById, selectedWord]);
  selectedStudyWordRef.current = selectedStudyWord;
  const selectedSynonymItems = useMemo(() => {
    const synonyms = Array.isArray(selectedStudyWord?.synonyms) ? selectedStudyWord.synonyms : [];
    const synonymDetails = normalizeReadingSynonymDetails(
      selectedStudyWord?.synonymDetails,
      synonyms,
      selectedStudyWord?.word
    );
    const detailByWord = new Map(
      synonymDetails.map((detail) => [normalizeReadingWordKey(detail.word), detail])
    );
    return synonyms
      .map((synonym) => {
        const synonymWord = typeof synonym === "string"
          ? synonym
          : synonym?.word || synonym?.replacement || "";
        const linkedMainEntry = mainLexiconRef.current.index.get(
          normalizeReadingWordKey(synonymWord)
        )?.entry;
        const detail = detailByWord.get(normalizeReadingWordKey(synonymWord));
        return buildReadingSynonymDisplay(detail || synonym, linkedMainEntry);
      })
      .filter((synonym) => synonym.word);
  }, [selectedStudyWord]);
  const missingFields = selectedStudyWord ? getReadingWordMissingFields(selectedStudyWord) : [];
  const selectedMainStatus = selectedWord && !selectedMainEntry
    ? "主词库未收录"
    : selectedMainEntry && isMainEntryClassificationIncomplete(selectedMainEntry)
      ? "主词库待分类"
      : "";
  const aiRunning = aiRun.status === "running";
  const mainReadable = mainLexiconStatus.count > 0
    && ["ready", "readonly"].includes(mainLexiconStatus.status);
  const mainReady = mainLexiconStatus.status === "ready";
  const readingImportDisabled = aiRunning || mainWriteBusy || !mainReadable;
  const actionsDisabled = aiRunning || mainWriteBusy || !mainReady;

  const parsedBatch = useMemo(() => {
    if (!batchText.trim()) return { words: [], error: "" };
    try {
      return { words: parseReadingWordsTable(batchText), error: "" };
    } catch (error) {
      return { words: [], error: error?.message || "表格内容无法解析" };
    }
  }, [batchText]);

  const moveSelection = useCallback((offset) => {
    const list = visibleWordsRef.current;
    if (!list.length) return;
    const currentIndex = list.findIndex((word) => word.id === selectedIdRef.current);
    const nextIndex = (Math.max(0, currentIndex) + offset + list.length) % list.length;
    const nextId = list[nextIndex].id;
    selectedIdRef.current = nextId;
    setSelectedId(nextId);
  }, []);

  const patchSelectedWord = useCallback((patch) => {
    const target = selectedWordRef.current;
    if (!target) return;
    setWords((currentWords) => currentWords.map((word) => {
      if (word.id !== target.id) return word;
      const resolvedPatch = typeof patch === "function" ? patch(word) : patch;
      const nextWord = { ...word, ...resolvedPatch, updatedAt: new Date().toISOString() };
      selectedWordRef.current = nextWord;
      return nextWord;
    }));
  }, []);

  const markSelectedStatus = useCallback((status) => {
    const target = selectedWordRef.current;
    if (!target) return;
    patchSelectedWord((word) => ({
      status: word.status === status ? "" : status,
      lastReviewedAt: new Date().toISOString()
    }));
    moveSelection(1);
  }, [moveSelection, patchSelectedWord]);

  useEffect(() => {
    const holdStepper = createStudyHoldStepper({
      step(direction) {
        moveSelection(direction);
      }
    });

    function handleReadingWordNavigation(event) {
      const action = getStudyKeyboardAction(event);
      if (!action || !selectedWordRef.current) return;

      if ((action === "previous" || action === "next") && visibleWordsRef.current.length < 2) {
        return;
      }

      event.preventDefault();
      if (action === "word-audio") {
        speak(selectedStudyWordRef.current?.word || selectedWordRef.current.word);
      } else if (action === "example-audio") {
        speak(selectedStudyWordRef.current?.example || selectedWordRef.current.example);
      } else if (action === "previous") {
        holdStepper.start(-1);
      } else if (action === "next") {
        holdStepper.start(1);
      } else if (action === "known") {
        markSelectedStatus("熟悉");
      } else if (action === "blurry") {
        markSelectedStatus("模糊");
      } else if (action === "unknown") {
        markSelectedStatus("不熟");
      }
    }

    function handleReadingWordHoldRelease(event) {
      if (isStudyHoldArrowKey(event)) holdStepper.stop();
    }

    function stopHoldOnBlur() {
      holdStepper.stop();
    }

    window.addEventListener("keydown", handleReadingWordNavigation, true);
    window.addEventListener("keyup", handleReadingWordHoldRelease, true);
    window.addEventListener("blur", stopHoldOnBlur);
    return () => {
      window.removeEventListener("keydown", handleReadingWordNavigation, true);
      window.removeEventListener("keyup", handleReadingWordHoldRelease, true);
      window.removeEventListener("blur", stopHoldOnBlur);
      holdStepper.stop();
    };
  }, [markSelectedStatus, moveSelection]);

  useEffect(() => {
    function handleWordCardSwipe(event) {
      if (!selectedWord || visibleWords.length < 2) return;
      moveSelection(event.detail?.direction === "previous" ? -1 : 1);
    }
    window.addEventListener(WORD_CARD_SWIPE_EVENT, handleWordCardSwipe);
    return () => window.removeEventListener(WORD_CARD_SWIPE_EVENT, handleWordCardSwipe);
  }, [moveSelection, selectedWord, visibleWords.length]);

  const updateMainLexiconMemory = useCallback((nextWords, nextMeta = null) => {
    const lookup = buildReadingMainLookup(nextWords);
    mainLexiconRef.current = {
      ...mainLexiconRef.current,
      words: nextWords,
      ...(nextMeta ? { meta: { ...mainLexiconRef.current.meta, ...nextMeta } } : {}),
      index: lookup.byKey,
      lookup
    };
    setMainLexiconStatus((current) => ({
      ...current,
      status: "ready",
      count: nextWords.length,
      message: `已连接正式主词库 ${nextWords.length.toLocaleString("zh-CN")} 词`
    }));
  }, []);

  const publishFormalMainWords = useCallback(async (
    nextWords,
    previousWords,
    source,
    { confirmedDeletion = false } = {}
  ) => {
    const deletionIntent = buildLexiconDeletionIntent(previousWords, nextWords, {
      action: source,
      confirmed: confirmedDeletion
    });
    const result = await postExportCache(
      formalLexiconWords(nextWords),
      mainLexiconRef.current.meta,
      {
        source,
        forceRefresh: true,
        ...(deletionIntent ? { deletionIntent } : {})
      }
    );
    if (!result?.ok) {
      const detail = [result?.error, result?.detail].filter(Boolean).join("：");
      throw new Error(`正式主词库文件写入失败：${detail || "未知错误"}`);
    }
    return result;
  }, []);

  const deleteSelectedWord = useCallback(async () => {
    if (!selectedWord || aiRunning || mainWriteBusy || mainMutationInFlightRef.current) return;

    const previousMainWords = mainLexiconRef.current.words;
    const linkedLocation = findLinkedMainEntry(
      selectedWord,
      previousMainWords,
      mainLexiconRef.current.index,
      mainLexiconRef.current.lookup
    );
    const canSyncMain = mainReady && Boolean(linkedLocation?.entry);
    const mainDeletion = canSyncMain
      ? removeLinkedMainEntry(previousMainWords, linkedLocation.entry)
      : { words: previousMainWords, removed: [] };
    const linkedMainWord = mainDeletion.removed[0]?.word || "";
    const mainDeleteNotice = linkedMainWord
      ? `将同时从正式主词库删除关联主词“${linkedMainWord}”。`
      : mainReady
        ? "正式主词库没有对应词条，只删除阅读生词记录。"
        : "主词库当前不能写回，这次只删除阅读生词记录。";
    const confirmed = window.confirm(
      `确定删除阅读生词“${selectedWord.word}”吗？\n\n` +
      `${mainDeleteNotice}\n删除前会自动备份；任一步失败都会回退。`
    );
    if (!confirmed) return;

    const readingResult = removeReadingWordEntry(words, selectedWord.id, visibleWords);
    if (!readingResult.removed) {
      setNotice("当前阅读生词已不存在，无需重复删除。");
      return;
    }

    mainMutationInFlightRef.current = true;
    setMainWriteBusy(true);
    let mainSavedLocally = false;
    let readingSaved = false;
    try {
      if (mainDeletion.removed.length) {
        await saveWordsToIndexedDBWithBackup(
          mainDeletion.words,
          previousMainWords,
          mainLexiconRef.current.meta,
          { reason: "personal-reading-linked-delete" }
        );
        mainSavedLocally = true;
      }

      const savedReading = await persistReadingWords(readingResult.words, words);
      readingSaved = savedReading.ok;
      if (!readingSaved) {
        throw new Error(`阅读生词写入失败：${savedReading.error?.message || "未知错误"}`);
      }

      let publishedMeta = null;
      if (mainDeletion.removed.length) {
        publishedMeta = await publishFormalMainWords(
          mainDeletion.words,
          previousMainWords,
          "personal-reading-linked-delete",
          { confirmedDeletion: true }
        );
        updateMainLexiconMemory(mainDeletion.words, publishedMeta);
      }

      setWords(readingResult.words);
      setSelectedId(readingResult.nextSelectedId);
      setRollbackAvailable(true);
      setStorageError("");
      setNotice(
        linkedMainWord
          ? `已删除阅读生词：${readingResult.removed.word}；主词库同步删除：${linkedMainWord}。`
          : `已删除阅读生词：${readingResult.removed.word}；主词库原本没有对应词条。`
      );
    } catch (error) {
      const rollbackErrors = [];
      if (mainSavedLocally) {
        try {
          await saveWordsToIndexedDB(previousMainWords, mainLexiconRef.current.meta);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError?.message || "主词库本地回退失败");
        }
      }
      if (readingSaved) {
        const restoredReading = await persistReadingWords(words);
        if (!restoredReading.ok) {
          rollbackErrors.push(`阅读生词回退失败：${restoredReading.error?.message || "未知错误"}`);
        }
      }
      setStorageError(
        `删除未完成：${error?.message || error}；原数据已尽量回退` +
        (rollbackErrors.length ? `（${rollbackErrors.join("；")}）` : "。")
      );
    } finally {
      mainMutationInFlightRef.current = false;
      setMainWriteBusy(false);
    }
  }, [
    aiRunning,
    mainReady,
    mainWriteBusy,
    publishFormalMainWords,
    selectedWord,
    updateMainLexiconMemory,
    visibleWords,
    words
  ]);

  useEffect(() => {
    function handleReadingWordDeleteShortcut(event) {
      if (!shouldHandleReadingWordDeleteShortcut(event)) return;
      if (!selectedWord || aiRunning || mainWriteBusy) return;
      event.preventDefault();
      event.stopPropagation();
      deleteSelectedWord();
    }
    function handleReadingWordDeleteRequest() {
      deleteSelectedWord();
    }

    window.addEventListener("keydown", handleReadingWordDeleteShortcut);
    window.addEventListener(DELETE_CURRENT_WORD_EVENT, handleReadingWordDeleteRequest);
    return () => {
      window.removeEventListener("keydown", handleReadingWordDeleteShortcut);
      window.removeEventListener(DELETE_CURRENT_WORD_EVENT, handleReadingWordDeleteRequest);
    };
  }, [aiRunning, deleteSelectedWord, mainWriteBusy, selectedWord]);

  const commitReadingImport = async (incoming, sourceLabel) => {
    if (!mainReadable || mainMutationInFlightRef.current) {
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
        {
          now: new Date().toISOString(),
          allowMainWrites: mainReady
        }
      );
      if (result.mainChanged) {
        await saveWordsToIndexedDBWithBackup(
          result.mainWords,
          previousMainWords,
          mainLexiconRef.current.meta,
          { reason: sourceLabel }
        );
      }
      const savedReading = await persistReadingWords(result.words, words);
      if (!savedReading.ok) {
        if (result.mainChanged) {
          await saveWordsToIndexedDB(previousMainWords, mainLexiconRef.current.meta);
        }
        throw new Error(
          `阅读生词本写入失败，主词库已自动回退：${savedReading.error?.message || "未知错误"}`
        );
      }

      let publishedMeta = null;
      if (result.mainChanged) {
        try {
          publishedMeta = await publishFormalMainWords(
            result.mainWords,
            previousMainWords,
            sourceLabel
          );
        } catch (error) {
          await saveWordsToIndexedDB(previousMainWords, mainLexiconRef.current.meta);
          await persistReadingWords(words);
          throw error;
        }
        updateMainLexiconMemory(result.mainWords, publishedMeta);
      }
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
    if (readingImportDisabled) return;
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
      ? `已添加 ${normalized.word}；${result.addedToMain
        ? "同时加入正式主词库。"
        : result.reusedMain
          ? "已复用主词库资料。"
          : "主词库暂无可复用资料，已保存在阅读生词本，可继续用本页 AI 补全。"}`
      : `“${normalized.word}”再次导入，累计 ${imported?.importCount || 2} 次，已标记为高频词。`);
  };

  const importBatch = async () => {
    if (readingImportDisabled || parsedBatch.error || !parsedBatch.words.length) return;
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
      (result.localOnly && result.missingMain
        ? `，另有 ${result.missingMain} 个主词库未收录词仅保存在阅读生词本，可继续用本页 AI 补全`
        : "") +
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
    anchor.download = `阅读生词本备份-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice("阅读生词本备份已导出。");
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
      const savedReading = await persistReadingWords(result.words, words);
      if (!savedReading.ok) {
        await saveWordsToIndexedDB(previousMainWords, mainLexiconRef.current.meta);
        throw new Error(
          `阅读生词写入失败，正式主词库已自动回退：${savedReading.error?.message || "未知错误"}`
        );
      }
      let publishedMeta;
      try {
        publishedMeta = await publishFormalMainWords(
          result.mainWords,
          previousMainWords,
          "personal-reading-cross-device-import"
        );
      } catch (error) {
        await saveWordsToIndexedDB(previousMainWords, mainLexiconRef.current.meta);
        await persistReadingWords(words);
        throw error;
      }
      updateMainLexiconMemory(result.mainWords, publishedMeta);
      setWords(result.words);
      setSelectedId(result.words[0]?.id || "");
      setRollbackAvailable(true);
      setNotice(
        `跨设备导入完成：生词新增 ${result.readingAdded}、合并 ${result.readingMerged}；` +
        `正式主词库新增 ${result.mainAdded}、学习状态合并 ${result.mainMerged}。`
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
      readPersistedReadingWordsRollback(words)
    ]);
    if (mainBackup?.status !== "cache-hit" || !readingBackup?.words) {
      setNotice("没有找到完整的同步前备份。");
      return;
    }
    const confirmed = window.confirm(
      "将恢复到上一次导入或 AI 写回前的阅读生词和正式主词库。当前修改会被替换，是否继续？"
    );
    if (!confirmed) return;

    mainMutationInFlightRef.current = true;
    setMainWriteBusy(true);
    try {
      const previousMainWords = mainLexiconRef.current.words;
      await saveWordsToIndexedDB(mainBackup.words, mainBackup.meta || {});
      const restoredReading = await persistReadingWords(readingBackup.words, words);
      if (!restoredReading.ok) {
        throw new Error(`阅读生词备份恢复失败：${restoredReading.error?.message || "未知错误"}`);
      }
      const publishedMeta = await publishFormalMainWords(
        mainBackup.words,
        previousMainWords,
        "restore-reading-sync-backup",
        { confirmedDeletion: true }
      );
      updateMainLexiconMemory(mainBackup.words, publishedMeta);
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
    const message = "已停止；停止后收到的结果不会写入阅读生词本。";
    setAiRun((current) => ({
      ...current,
      status: "stopped",
      message
    }));
    setNotice(message);
  };

  /** 补全结束后保证结果可见：提示条 + 打开 AI 面板 + 必要时关掉「仅待补全」 */
  const finalizeAiRunUi = useCallback((nextRun) => {
    setAiRun(nextRun);
    if (nextRun?.message) setNotice(nextRun.message);
    setAiOpen(true);
    // 待补全筛开着时，补全成功的词会立刻从列表消失，卡片变空——自动切回全部以便查看结果
    if (nextRun?.status === "done" && Number(nextRun.filled) > 0) {
      setOnlyIncomplete(false);
    }
  }, []);

  const runAiCompletion = async () => {
    if (aiRunning) return;
    if (!aiConfirmed) {
      setAiRun({
        status: "confirm-required",
        processed: 0,
        total: aiTargetWords.length,
        filled: 0,
        failed: 0,
        message: "请先勾选付费确认，再开始处理；未确认前不会发起 AI 请求。"
      });
      aiConfirmRef.current?.focus();
      return;
    }
    if (!mainReadable || mainMutationInFlightRef.current) {
      setAiRun({
        status: "error",
        processed: 0,
        total: 0,
        filled: 0,
        failed: 0,
        message: "正式主词库尚未准备好，未发起 AI 请求。"
      });
      return;
    }
    const localOnlyAi = mainLexiconStatus.status === "readonly";
    const targets = aiTargetWords;
    if (!targets.length) {
      setAiRun({
        status: "done",
        processed: 0,
        total: 0,
        filled: 0,
        failed: 0,
        message: "当前阅读生词本没有需要补全的词。"
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
      message: localOnlyAi
        ? "正在先复用正式主词库和本机 AI 缓存；新结果只写入当前阅读生词本。"
        : "正在先复用正式主词库和本机 AI 缓存，只补全剩余缺项。"
    });

    const failureNotes = [];

    function describeAiFetchError(error) {
      const raw = String(error?.message || error || "");
      // Browser TypeError when local Next server is down / wrong host / offline.
      if (/failed to fetch|networkerror|load failed|network request failed/i.test(raw)) {
        return "无法连接本地词库服务（Failed to fetch）。请确认已打开 http://127.0.0.1:3000，可在项目目录运行 restart-vocab-service.ps1 重启后再试。";
      }
      return raw || "AI 请求失败";
    }

    async function requestProfiles(items, { force = false, maxSplitDepth = 2 } = {}) {
      // items: [{ id, requestWord }] — requestWord may already be canonically corrected.
      let response;
      try {
        response = await fetch("/api/generate-words", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            items: items.map((item) => ({
              inputId: item.id,
              word: item.requestWord || item.word,
              requestedSynonyms: item.requestedSynonyms || [],
              existingMeaning: item.existingMeaning || "",
              existingPos: item.existingPos || "",
              contextSentence: item.contextSentence || "",
              contextLabel: item.contextLabel || ""
            })),
            force,
            maxSplitDepth,
            // Reading notebook only needs core sense + classification, not full collocation packs.
            profileQuality: "reading"
          })
        });
      } catch (error) {
        throw new Error(describeAiFetchError(error));
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.detail || payload?.error || `HTTP ${response.status}`);
      }
      return payload;
    }

    for (let start = 0; start < targets.length; start += 10) {
      if (aiControlRef.current.stopped) break;
      const batch = targets.slice(start, start + 10);
      const batchMainLookup = buildReadingMainLookup(workingMainWords);
      // Fix import/OCR typos against master lexicon BEFORE AI (ncestors → ancestors).
      const batchPlans = batch.map((word) => {
        const reusableWord = readingDisplayById.get(word.id) || word;
        const suggestion = suggestCanonicalReadingHeadword(word.word, workingMainWords, word, {
          mainLookup: batchMainLookup
        });
        const readingContext = getReadingWordContext(word);
        return {
          id: word.id,
          originalWord: word.word,
          requestWord: suggestion.word || word.word,
          requestedSynonyms: Array.isArray(reusableWord.synonyms) ? reusableWord.synonyms : [],
          existingMeaning: reusableWord.meaning || reusableWord.meaningZh || "",
          existingPos: reusableWord.pos || "",
          contextSentence: readingContext.sentence,
          contextLabel: readingContext.label,
          corrected: Boolean(suggestion.corrected),
          mainEntry: suggestion.mainEntry || null
        };
      });
      for (const plan of batchPlans) {
        if (plan.corrected) {
          failureNotes.push(`${plan.originalWord} → 已纠正为 ${plan.requestWord}`);
        }
      }

      let payload;
      try {
        // 已通过质量校验的缓存优先复用；未命中才可能调用 AI。
        payload = await requestProfiles(batchPlans, { force: false, maxSplitDepth: 2 });
      } catch (error) {
        if (error?.name === "AbortError" || aiControlRef.current.stopped) break;
        processed += batch.length;
        failed += batch.length;
        const failMsg = describeAiFetchError(error);
        failureNotes.push(failMsg);
        setAiRun({
          status: "running",
          processed,
          total: targets.length,
          filled,
          failed,
          message: `本批失败：${failMsg}`
        });
        continue;
      }

      if (aiControlRef.current.stopped) break;
      let profileById = new Map(
        (Array.isArray(payload?.items) ? payload.items : [])
          .map((item) => [String(item?.inputId || ""), item])
          .filter(([id]) => id)
      );

      // Retry missing/invalid words one-by-one — batch invalid often hides a single hard word.
      const missing = batchPlans.filter((plan) => !profileById.has(plan.id));
      for (const plan of missing) {
        if (aiControlRef.current.stopped) break;
        try {
          const retryPayload = await requestProfiles([plan], { force: false, maxSplitDepth: 2 });
          for (const item of Array.isArray(retryPayload?.items) ? retryPayload.items : []) {
            if (item?.inputId) profileById.set(String(item.inputId), item);
          }
          const invalidItems = retryPayload?.stats?.invalidItems;
          if (Array.isArray(invalidItems) && invalidItems.length) {
            failureNotes.push(
              ...invalidItems.map((item) => `${item.word || plan.requestWord}: ${item.reason || "invalid"}`)
            );
          }
        } catch (error) {
          if (error?.name === "AbortError" || aiControlRef.current.stopped) break;
          failureNotes.push(`${plan.requestWord}: ${error?.message || "单词重试失败"}`);
        }
      }

      if (Array.isArray(payload?.stats?.invalidItems)) {
        failureNotes.push(
          ...payload.stats.invalidItems.map((item) => `${item.word || "?"}: ${item.reason || "invalid"}`)
        );
      }

      let batchFilled = 0;
      let batchFailed = 0;
      const mainIndex = batchMainLookup.byKey;
      const usedMainIds = new Set(
        workingMainWords.flatMap((entry) => [entry?.id, entry?.wordId]).filter(Boolean)
      );
      let nextMainWords = [...workingMainWords];
      const previousBatchReadingWords = workingWords;
      const planById = new Map(batchPlans.map((plan) => [plan.id, plan]));

      workingWords = workingWords.map((word) => {
        if (!batch.some((entry) => entry.id === word.id)) return word;
        const plan = planById.get(word.id);
        let working = word;
        // Rename notebook headword before merge when lexicon has a better spelling.
        if (plan?.corrected && plan.requestWord) {
          working = {
            ...working,
            word: plan.requestWord,
            updatedAt: new Date().toISOString()
          };
        }

        let profile = profileById.get(word.id);
        // If AI still echoed a bad spelling, force profile headword to the corrected form.
        if (profile && plan?.corrected && plan.requestWord) {
          profile = {
            ...profile,
            word: plan.requestWord,
            correctedFrom: plan.originalWord
          };
        }

        // Prefer reusing a complete master-lexicon entry for the corrected headword.
        const preferredKey = normalizeReadingWordKey(plan?.requestWord || working.word);
        let mainLocation = findLinkedMainEntry(
          working,
          nextMainWords,
          mainIndex,
          batchMainLookup
        );
        if (!mainLocation && plan?.mainEntry) {
          const ensuredIndex = nextMainWords.findIndex(
            (entry) => normalizeReadingWordKey(entry?.word) === preferredKey
          );
          if (ensuredIndex >= 0) {
            mainLocation = { entry: nextMainWords[ensuredIndex], index: ensuredIndex };
            mainIndex.set(preferredKey, mainLocation);
          }
        }

        if (!profile && mainLocation?.entry && !plan?.contextSentence) {
          // Seed a synthetic profile from the master entry so correction alone can complete.
          profile = {
            ...mainLocation.entry,
            word: mainLocation.entry.word,
            correctedFrom: plan?.originalWord || word.word,
            aiGenerated: true,
            source: "main-lexicon"
          };
        }

        if (!profile) {
          batchFailed += 1;
          failureNotes.push(`${working.word}: AI 未返回可用资料（可能词形特殊/模型校验未通过）`);
          return working;
        }

        if (!mainLocation) {
          const ensured = ensureReadingWordMainEntry(working, nextMainWords, {
            usedIds: usedMainIds,
            now: new Date().toISOString()
          });
          nextMainWords = ensured.mainWords;
          mainLocation = {
            entry: ensured.mainEntry,
            index: ensured.mainIndex
          };
          mainIndex.set(normalizeReadingWordKey(working.word), mainLocation);
        }

        // Pull existing master content first (ancestors already in main lexicon).
        working = applyMainEntryToReadingWord(working, mainLocation.entry);
        const merged = mergeReadingWordAiProfile(working, profile, {
          contextSentence: plan?.contextSentence || "",
          contextLabel: plan?.contextLabel || ""
        });
        let mergedMain = mergeAiProfileIntoMainEntry(mainLocation.entry, profile);
        if (
          merged.word &&
          normalizeReadingWordKey(merged.word) !== normalizeReadingWordKey(mergedMain.word || "")
        ) {
          const previousKey = normalizeReadingWordKey(mergedMain.word || word.word);
          mergedMain = { ...mergedMain, word: merged.word };
          mainIndex.delete(previousKey);
          mainIndex.set(normalizeReadingWordKey(merged.word), {
            entry: mergedMain,
            index: mainLocation.index
          });
        }
        // Mark relation reviews when master entry already has empty-but-known relations.
        if (Array.isArray(merged.forms) || merged.formsReviewed) {
          merged.formsReviewed = true;
          merged.formsReviewSource = merged.formsReviewSource || "reading-ai";
        }
        if (Array.isArray(merged.wordFamily) || merged.wordFamilyReviewed) {
          merged.wordFamilyReviewed = true;
          merged.wordFamilyReviewSource = merged.wordFamilyReviewSource || "reading-ai";
        }
        if (Array.isArray(merged.synonyms) || merged.synonymsReviewed) {
          merged.synonymsReviewed = true;
          merged.synonymsReviewSource = merged.synonymsReviewSource || "reading-ai";
        }

        nextMainWords[mainLocation.index] = mergedMain;
        const readingMissing = getReadingWordMissingFields(merged);
        const mainClassIncomplete = isMainEntryClassificationIncomplete(mergedMain);
        if (readingMissing.length || mainClassIncomplete) {
          batchFailed += 1;
          const reasons = [
            ...readingMissing.map((field) => `缺${field}`),
            ...(mainClassIncomplete ? ["主库缺用途/主题/难度"] : [])
          ];
          failureNotes.push(`${merged.word}: 写入后仍不完整（${reasons.join("、")}）`);
        } else {
          batchFilled += 1;
          if (plan?.corrected) {
            failureNotes.push(`已将 ${plan.originalWord} 纠正并补全为 ${merged.word}`);
          }
        }
        return merged;
      });

      if (aiControlRef.current.stopped) break;
      try {
        if (localOnlyAi) {
          const readingSaved = firstWrite
            ? await persistReadingWords(workingWords, words)
            : await persistReadingWords(workingWords);
          if (!readingSaved.ok) {
            throw new Error(
              `阅读生词保存失败，未修改正式主词库：${readingSaved.error?.message || "未知错误"}`
            );
          }
        } else {
          if (firstWrite) {
            await saveWordsToIndexedDBWithBackup(
              nextMainWords,
              workingMainWords,
              mainLexiconRef.current.meta,
              { reason: "personal-reading-ai-completion" }
            );
            if (aiControlRef.current.stopped) {
              await saveWordsToIndexedDB(workingMainWords, mainLexiconRef.current.meta);
              // 已写入阅读本的中间结果保留在 workingWords 时尽量回显
              setWords(workingWords);
              finalizeAiRunUi({
                status: "stopped",
                processed,
                total: targets.length,
                filled,
                failed,
                message: "已停止；本批主词库未发布，已尽量保留已写入的阅读生词。"
              });
              return;
            }
            const readingSaved = await persistReadingWords(workingWords, words);
            if (!readingSaved.ok) {
              await saveWordsToIndexedDB(workingMainWords, mainLexiconRef.current.meta);
              throw new Error(
                `阅读生词写入失败，主词库已自动回退：${readingSaved.error?.message || "未知错误"}`
              );
            }
          } else {
            await saveWordsToIndexedDB(nextMainWords, mainLexiconRef.current.meta);
            if (aiControlRef.current.stopped) {
              await saveWordsToIndexedDB(workingMainWords, mainLexiconRef.current.meta);
              setWords(workingWords);
              finalizeAiRunUi({
                status: "stopped",
                processed,
                total: targets.length,
                filled,
                failed,
                message: "已停止；本批主词库未发布，已尽量保留已写入的阅读生词。"
              });
              return;
            }
            const readingSaved = await persistReadingWords(workingWords);
            if (!readingSaved.ok) {
              await saveWordsToIndexedDB(workingMainWords, mainLexiconRef.current.meta);
              throw new Error(
                `阅读生词写入失败，本批主词库写回已自动回退：${readingSaved.error?.message || "未知错误"}`
              );
            }
          }
          let publishedMeta;
          try {
            publishedMeta = await publishFormalMainWords(
              nextMainWords,
              workingMainWords,
              "personal-reading-ai-completion"
            );
          } catch (error) {
            await saveWordsToIndexedDB(workingMainWords, mainLexiconRef.current.meta);
            await persistReadingWords(previousBatchReadingWords);
            throw error;
          }
          updateMainLexiconMemory(nextMainWords, publishedMeta);
        }
      } catch (error) {
        aiControlRef.current.controller = null;
        finalizeAiRunUi({
          status: "error",
          processed,
          total: targets.length,
          filled,
          failed: failed + batch.length,
          message: `本批未写入且已停止：${describeAiFetchError(error)}`
        });
        return;
      }
      workingMainWords = nextMainWords;
      firstWrite = false;
      setRollbackAvailable(true);
      processed += batch.length;
      filled += batchFilled;
      failed += batchFailed;
      setWords(workingWords);
      // 保持当前选中词仍能在全量列表中找到，避免补全后筛选导致卡片空白
      if (workingWords.some((word) => word.id === selectedWordRef.current?.id)) {
        setSelectedId(selectedWordRef.current.id);
      } else if (workingWords[0]?.id) {
        setSelectedId(workingWords[0].id);
      }
      setAiRun({
        status: "running",
        processed,
        total: targets.length,
        filled,
        failed,
        message: `已完成 ${processed} / ${targets.length}；有阅读原句时按原句校正主释义，其他常见义保留在后。`
      });
    }

    if (aiControlRef.current.stopped) {
      aiControlRef.current.controller = null;
      return;
    }
    aiControlRef.current.controller = null;
    const uniqueNotes = [...new Set(failureNotes)].slice(0, 8);
    const noteText = uniqueNotes.length ? ` 详情：${uniqueNotes.join("；")}` : "";
    const persistenceText = localOnlyAi
      ? " 正式主词库当前只读，本次结果仅保存到当前浏览器的阅读生词本。"
      : "";
    const doneMessage = failed
      ? `补全结束：${filled} 个通过，${failed} 个仍待处理。${noteText}${persistenceText}`
      : `补全结束：${filled} 个重新校验通过。${noteText}${persistenceText}`;
    // 先写入 words，再收尾 UI（关掉「仅待补全」并弹出结果）
    setWords((current) => (current === workingWords ? current : workingWords));
    finalizeAiRunUi({
      status: "done",
      processed,
      total: targets.length,
      filled,
      failed,
      message: doneMessage
    });
  };

  if (!ready) {
    return (
      <main className={styles.page} data-study-surface="reading-words">
        <div className={styles.loading}>正在读取阅读生词本…</div>
      </main>
    );
  }

  const studyToolbar = (
    <header className={`topbar ${styles.toolbar}`} aria-label="阅读生词工具栏">
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
        className={`${onlyIncompleteActive ? styles.activeTool : styles.secondaryButton} top-pill`}
        onClick={toggleIncompleteFilter}
        aria-pressed={onlyIncompleteActive}
        disabled={isReadingCompletenessPending}
        title={isReadingCompletenessPending ? "正在核对正式主词库，完成后显示待补全数量。" : undefined}
      >
        <AlertTriangle aria-hidden="true" />待补全 {isReadingCompletenessPending ? "—" : incompleteWords.length}
      </button>
      <button
        type="button"
        className={`${onlyFrequent ? styles.activeTool : styles.secondaryButton} top-pill`}
        onClick={() => setOnlyFrequent((value) => !value)}
        aria-pressed={onlyFrequent}
      >
        <Star aria-hidden="true" />高频词 {highFrequencyWords.length}
      </button>
      <WordStudyOrderControls
        mode={wordOrdering.mode}
        difficultyMode={wordOrdering.difficultyMode}
        onModeChange={changeWordOrderMode}
        onDifficultyModeChange={changeWordDifficultyMode}
        difficultyAvailable={wordOrdering.difficultyAvailable}
        difficultyProfile={wordOrdering.difficultyProfile}
      />
      <StudyMeaningToggle className={`top-pill ${styles.secondaryButton}`} />
      <details className={styles.manageMenu} data-reading-words-manager>
        <summary className="top-pill">词库管理</summary>
        <div>
          <button type="button" className={styles.secondaryButton} onClick={() => setAddOpen((value) => !value)} disabled={readingImportDisabled}>
            <BookPlus aria-hidden="true" />单个添加
          </button>
          <button type="button" className={styles.secondaryButton} onClick={() => setBatchOpen((value) => !value)} disabled={readingImportDisabled}>
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
        </div>
      </details>
      <button type="button" className={`${styles.aiButton} top-pill`} onClick={() => setAiOpen((value) => !value)}>
        <Sparkles aria-hidden="true" />AI 工具
      </button>
    </header>
  );

  return (
    <main className={`${styles.page} page--word-flash`} data-study-surface="reading-words">
      {["error", "readonly"].includes(mainLexiconStatus.status) ? (
        <div
          className={`${styles.syncBanner} ${mainLexiconStatus.status === "error" ? styles.syncError : styles.syncWarning}`}
          role={mainLexiconStatus.status === "error" ? "alert" : "status"}
        >
          <span>{mainLexiconStatus.message}</span>
        </div>
      ) : null}
      {staticPublishState.status === "error" ? (
        <div className={`${styles.staticPublishBanner} ${styles.staticPublishError}`} role="alert">
          {staticPublishState.message}
        </div>
      ) : null}

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
            <div className={styles.formActions}><button type="submit" className={styles.primaryButton}>加入阅读生词本</button></div>
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
            <button type="button" className={styles.primaryButton} onClick={importBatch} disabled={readingImportDisabled || !parsedBatch.words.length || Boolean(parsedBatch.error)}>
              添加识别到的单词
            </button>
          </div>
        </section>
      ) : null}

      {/* 运行中始终可见；完成结果短暂展示后自动收起，不依赖 AI 面板是否展开。 */}
      {aiRun.message && ["done", "error", "stopped", "running", "confirm-required"].includes(aiRun.status) ? (
        <div
          className={`${styles.aiResultBanner}${
            aiRun.status === "error" ? ` ${styles.aiResultError}` : ""
          }${aiRun.status === "done" && aiRun.failed ? ` ${styles.aiResultWarn}` : ""}${
            aiRun.status === "done" && !aiRun.failed ? ` ${styles.aiResultOk}` : ""
          }`}
          role="status"
          aria-live="polite"
        >
          <strong>
            {aiRun.status === "running"
              ? "AI 补全进行中"
              : aiRun.status === "error"
                ? "AI 补全失败"
                : aiRun.status === "stopped"
                  ? "AI 补全已停止"
                  : aiRun.status === "confirm-required"
                    ? "需要确认"
                    : "AI 补全结束"}
          </strong>
          <p>{aiRun.message}</p>
          {aiRun.total ? (
            <span>
              进度 {aiRun.processed}/{aiRun.total} · 通过 {aiRun.filled} · 仍待处理 {aiRun.failed}
            </span>
          ) : null}
        </div>
      ) : null}

      {aiOpen ? (
        <section className={styles.aiPanel} aria-label="阅读生词 AI 工具">
          <div className={styles.aiIntro}>
            <div className={styles.aiIcon}><Bot aria-hidden="true" /></div>
            <div>
              <strong>阅读生词专用 AI 补全</strong>
              <p>扫描范围固定为本页 {words.length} 个词，只处理其中 {aiTargetWords.length} 个阅读资料待补全、原句义待核查、常见义待复核、主词库未收录或待分类词；阅读生词不保存分类。</p>
            </div>
          </div>
          <div className={styles.aiRules}>
            <span>每批最多 10 词</span>
            <span>并发 1</span>
            <span>自动重试 0</span>
            <span>可随时停止</span>
            <span>原句主释义优先</span>
            <span>其他常见义详细保留</span>
            <span>详解必须说明语义或用法</span>
          </div>
          <p className={styles.aiCost}>
            缓存命中不调用付费模型；缓存未命中时会调用 DeepSeek，预计最多 {Math.ceil(aiTargetWords.length / 10)} 次批量请求。
            实际费用取决于你当前 DeepSeek 模型和控制台单价，本页面无法准确换算金额。
          </p>
          <label className={styles.confirmRow}>
            <input ref={aiConfirmRef} type="checkbox" checked={aiConfirmed} onChange={(event) => setAiConfirmed(event.target.checked)} disabled={aiRunning} />
            <span>我确认只补全上述阅读生词，并了解缓存未命中可能产生费用。</span>
          </label>
          {aiRun.total || aiRun.message ? (
            <div className={styles.aiProgress}>
              <div><span style={{ width: `${aiRun.total ? Math.min(100, (aiRun.processed / aiRun.total) * 100) : 0}%` }} /></div>
              <p className={aiRun.status === "error" ? styles.aiProgressError : undefined}>
                {aiRun.message || "准备开始"}
                {aiRun.total ? ` · 通过 ${aiRun.filled} · 仍待处理 ${aiRun.failed}` : ""}
              </p>
            </div>
          ) : null}
          <div className={styles.aiActions}>
            <button type="button" className={styles.aiButton} onClick={runAiCompletion} disabled={aiRunning || !aiTargetWords.length || !mainReadable}>
              <Sparkles aria-hidden="true" />开始处理 {aiTargetWords.length} 个词
            </button>
            {aiRunning ? <button type="button" className={styles.stopButton} onClick={stopAiRun}>停止补全</button> : null}
          </div>
        </section>
      ) : null}

      <WordStudyWorkspace
        className={styles.workspace}
        studyColumnClassName={styles.studyColumn}
        overview={(
        <aside className={`word-insight-panel word-insight-panel--persistent ${styles.wordList}`} aria-label="阅读生词列表">
          <div className={styles.listHeading}>
            <strong>{onlyFrequent ? "高频阅读生词" : onlyIncompleteActive ? "待补全生词" : "全部阅读生词"}</strong>
            <span>{visibleWords.length} 个</span>
          </div>
          {visibleWords.length ? (
            <VirtualList
              className={styles.listRows}
              items={readingListRows}
              itemHeight={64}
              fill
              overscan={5}
              resetKey={`${onlyIncompleteActive ? "incomplete" : "all"}:${onlyFrequent ? "frequent" : "all"}:${search}:${wordOrdering.mode}:${wordOrdering.difficultyMode}:${readingListRows.length}`}
              scrollToIndex={selectedIndex}
              getKey={(row) => row.word.id}
              renderItem={(row) => {
                const word = row.word;
                return (
                  <button
                    type="button"
                    className={`${styles.wordRow}${selectedWord?.id === word.id ? ` ${styles.selectedRow}` : ""}`}
                    onClick={() => setSelectedId(word.id)}
                  >
                    <span><strong>{word.word}</strong><small className="study-answer-content">{row.meaning}</small></span>
                    <span className={styles.rowBadges}>
                      {word.highFrequency || Number(word.importCount) >= 2 ? <b>高频 ×{word.importCount}</b> : null}
                      {row.completenessPending
                        ? <i className={styles.completenessPending} title="正在核对正式主词库">核对</i>
                        : row.missingCount
                        ? <em>阅读资料 {row.missingCount} 项待补</em>
                        : row.mainStatus
                          ? <em>{row.mainStatus}</em>
                          : <i>完整</i>}
                    </span>
                  </button>
                );
              }}
            />
          ) : (
            <div className={styles.emptyList}>
              <BookPlus aria-hidden="true" />
              <strong>{words.length ? "当前筛选没有单词" : "还没有阅读生词"}</strong>
              <span>{words.length ? "可清空搜索或关闭待补全筛选。" : "点击“单个添加”或“表格批量添加”开始建立自己的词库。"}</span>
              {!words.length ? (
                <div className={styles.emptyListActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setAddOpen(true)}
                    disabled={readingImportDisabled}
                  >
                    <BookPlus aria-hidden="true" />单个添加
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setBatchOpen(true)}
                    disabled={readingImportDisabled}
                  >
                    <FileSpreadsheet aria-hidden="true" />表格批量添加
                  </button>
                  <label
                    className={`${styles.secondaryButton} ${styles.portableImport}`}
                    aria-disabled={actionsDisabled}
                  >
                    <Upload aria-hidden="true" />跨设备导入
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={importTransferFile}
                      disabled={actionsDisabled}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          )}
        </aside>
        )}
      >
        {selectedWord ? (
          <WordStudyProgress
            label="阅读进度"
            title={onlyIncompleteActive ? "待补全生词" : onlyFrequent ? "高频阅读生词" : "全部阅读生词"}
            current={studyPosition}
            total={visibleWords.length}
            percent={visibleWords.length ? (studyPosition / visibleWords.length) * 100 : 0}
            onPositionCommit={(position) => {
              const target = visibleWords[position - 1];
              if (target) setSelectedId(target.id);
            }}
            getPositionPreview={(position) => visibleWords[position - 1]?.word || ""}
            actions={studyToolbar}
          />
        ) : null}
        {/* 与主词库刷词同一套 class：word-study-card + WordStudyContent + WordDetailGrid */}
        <article className="word-study-card" aria-label="阅读生词详情" data-word-swipe-card>
          {selectedWord ? (
            <>
              <div className="word-canvas-tools">
                <span>
                  阅读生词 · {selectedIndex + 1} / {visibleWords.length}
                  {selectedWord.highFrequency || Number(selectedWord.importCount) >= 2
                    ? ` · 高频 ×${selectedWord.importCount}`
                    : ""}
                </span>
                <div>
                  <button
                    type="button"
                    className={`word-canvas-icon${selectedWord.favorite ? " is-active" : ""}`}
                    onClick={() => patchSelectedWord((word) => ({ favorite: !word.favorite }))}
                    aria-pressed={selectedWord.favorite}
                    aria-label={selectedWord.favorite ? "取消收藏" : "收藏"}
                    title="收藏"
                  >
                    <Bookmark aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="word-canvas-icon"
                    onClick={deleteSelectedWord}
                    disabled={aiRunning || mainWriteBusy}
                    aria-label="从阅读生词本和主词库删除"
                    title="同时删除阅读生词和关联主词（D / Delete）"
                    data-testid="reading-word-delete"
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
              </div>

              {!isReadingCompletenessPending && missingFields.length ? (
                <div className={styles.missingBanner} role="status">
                  <AlertTriangle aria-hidden="true" />
                  待补全：{missingFields.map((field) => MISSING_FIELD_LABELS[field]).join("、")}
                </div>
              ) : null}
              {!isReadingCompletenessPending && selectedMainStatus ? (
                <div className={styles.missingBanner} role="status">
                  <AlertTriangle aria-hidden="true" />
                  {selectedMainStatus}；AI 处理时会先建立正式主词条，再补充分类。
                </div>
              ) : null}

              <WordStudyContent
                item={selectedStudyWord || selectedWord}
                audioInfo={{ phonetic: (selectedStudyWord || selectedWord).phonetic }}
                displayForms={(Array.isArray((selectedStudyWord || selectedWord).forms)
                  ? (selectedStudyWord || selectedWord).forms
                  : []).map((form) => (typeof form === "string" ? { word: form } : form))}
                fallback={(value, fallbackValue) => String(value || "").trim() || fallbackValue}
                speakExample={() => speak((selectedStudyWord || selectedWord).example)}
                speakWord={() => speak((selectedStudyWord || selectedWord).word)}
              />

              {/* 阅读生词只展示有资料的 变形 / 词族 / 同义替换，空卡由共享组件统一隐藏。 */}
              <WordDetailGrid
                item={selectedStudyWord || selectedWord}
                variant="reading-words"
                displayForms={(Array.isArray((selectedStudyWord || selectedWord).forms)
                  ? (selectedStudyWord || selectedWord).forms
                  : []).map((form) => (typeof form === "string" ? { word: form } : form))}
                displayFamily={(Array.isArray((selectedStudyWord || selectedWord).wordFamily)
                  ? (selectedStudyWord || selectedWord).wordFamily
                  : []).map((family) => (typeof family === "string" ? { word: family } : family))}
                synonymItems={selectedSynonymItems}
                speakSmallText={(text) => speak(text)}
              />
            </>
          ) : (
            <div className={styles.cardEmpty}>
              <BookOpenText aria-hidden="true" />
              <strong>选择一个阅读生词查看详情</strong>
              <span>学习区排列与例句显示与主词库刷词一致。</span>
            </div>
          )}
        </article>
        {selectedWord ? (
          <WordStudyActions
            item={selectedWord}
            isStudyEmpty={false}
            isExternalIdictationItem={false}
            prevWord={() => moveSelection(-1)}
            nextWord={() => moveSelection(1)}
            showDirectionArrows
            markStatus={markSelectedStatus}
          />
        ) : null}
      </WordStudyWorkspace>

      {notice ? <div className={styles.toast} role="status">{notice}</div> : null}
    </main>
  );
}
