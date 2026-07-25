"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { sanitizeAiWordCollocations } from "../lib/vocab/admin-ai-content-profile.mjs";
import { hasLexiconContentChange } from "../lib/vocab/lexicon-content-change.mjs";
import { LEXICON_VERSION_WITHOUT_CONFIRMED_PERSON_NAMES } from "../lib/vocab/lexicon-guard-shared.mjs";
import { PHRASE_FLASH_STUDY_MODE_KEY } from "../lib/vocab/phrase-flashcard-keys.mjs";
import {
  isWordCacheCurrent,
  mergeWordContentWithUserState
} from "../lib/vocab/word-cache-meta.mjs";
import {
  applyStoredUserState,
  loadWordsFromIndexedDB,
  postExportCache,
  saveWordUserStateToIndexedDB,
  saveWordsToIndexedDB
} from "../lib/vocab/word-store.mjs";
import {
  compactBrowserStorageForCurrentWords,
  cleanupOldLargeLocalStorageKeys,
  isProbablyFullVocab,
  runWhenBrowserIdle,
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
  withTimeout
} from "../lib/vocab/page-word-helpers.mjs";
import {
  cleanExampleCnField,
  cleanExampleField,
  exampleFieldsNeedCleanup
} from "../lib/vocab/example-clean.mjs";

/** Repair noisy examples and invalid/duplicated collocations when hydrating client cache. */
function sanitizeRuntimeWords(words = []) {
  if (!Array.isArray(words) || !words.length) return words;
  let changed = 0;
  const next = words.map((word) => {
    if (!word || typeof word !== "object") return word;

    let nextWord = sanitizeAiWordCollocations(word);
    if (nextWord !== word) changed += 1;

    if (!exampleFieldsNeedCleanup(nextWord.example || "", nextWord.exampleCn || "", { maxWords: 36 })) {
      return nextWord;
    }

    const cleaned = cleanExampleField(nextWord.example || "", nextWord.word || "", {
      entryType: "word",
      meaningZh: nextWord.meaning || nextWord.definition || "",
      synthesizeIfEmpty: false,
      maxWords: 36
    });
    const exampleCn = cleanExampleCnField(nextWord.exampleCn || "");
    if (!cleaned.repaired && exampleCn === (nextWord.exampleCn || "")) return nextWord;

    if (nextWord === word) changed += 1;
    nextWord = {
      ...nextWord,
      example: cleaned.example || nextWord.example || "",
      exampleCn
    };
    return nextWord;
  });
  return changed ? next : words;
}

/**
 * Home page vocab bootstrap: flash mode, catalog counts, IndexedDB/API load, user-state persist.
 */
export async function persistWordsWithLocalStore(nextWords, options = {}) {
  const {
    sourceMeta = {},
    saveWords = saveWordsToIndexedDB,
    compactAndRetry = compactBrowserStorageForCurrentWords,
    isFullVocab = isProbablyFullVocab,
    onStatus
  } = options;

  if (!isFullVocab(nextWords)) {
    const error = new Error(
      `已阻止少量词覆盖大词库：当前只有 ${Array.isArray(nextWords) ? nextWords.length : 0} 个词，请先恢复词库`
    );
    error.code = "LOCAL_SAVE_REJECTED";
    error.status = "local-save-failed";
    onStatus?.(error.message);
    throw error;
  }

  try {
    await saveWords(nextWords, sourceMeta);
    return { ok: true, status: "local-saved", recovered: false };
  } catch (initialError) {
    try {
      await compactAndRetry(nextWords, sourceMeta);
      onStatus?.("已清理浏览器旧缓存并重新保存大词库");
      return { ok: true, status: "local-saved", recovered: true };
    } catch (retryError) {
      const error = new Error("本地保存失败：请先恢复词库，再点“清理浏览器存储空间”");
      error.code = "LOCAL_SAVE_FAILED";
      error.status = "local-save-failed";
      error.cause = retryError || initialError;
      onStatus?.(error.message);
      throw error;
    }
  }
}

export function useHomeVocabBootstrap({ setToast }) {
  const [words, setWordsState] = useState([]);
  const [flashStudyMode, setFlashStudyMode] = useState("word");
  const [vocabRuntime, setVocabRuntime] = useState({
    status: "loading",
    count: null,
    version: "",
    lexiconHash: ""
  });
  const [phraseRuntimeCount, setPhraseRuntimeCount] = useState(null);
  const [lrSynonymCount, setLrSynonymCount] = useState(null);

  const storageReadyRef = useRef(false);
  const hydratedWordsRef = useRef(null);
  const contentSnapshotRef = useRef(new WeakSet());
  const persistPromiseBySnapshotRef = useRef(new WeakMap());
  const cacheMetaRef = useRef({
    version: LEXICON_VERSION_WITHOUT_CONFIRMED_PERSON_NAMES,
    lexiconHash: "",
    savedAt: ""
  });

  const persistWordsImmediately = useCallback((nextWords) => {
    if (!Array.isArray(nextWords)) return Promise.resolve({ ok: false, status: "invalid-words" });
    const existing = persistPromiseBySnapshotRef.current.get(nextWords);
    if (existing) return existing;

    const task = (async () => {
      try {
        const localResult = await persistWordsWithLocalStore(nextWords, {
          sourceMeta: cacheMetaRef.current,
          onStatus(message) {
            setToast?.(message);
          }
        });
        const serverResult = await postExportCache(nextWords, cacheMetaRef.current, {
          source: "main-lexicon-content-edit",
          forceRefresh: true
        });

        if (!serverResult?.ok) {
          const detail = [serverResult?.error, serverResult?.detail].filter(Boolean).join("：");
          setToast?.(`改动已保存在当前浏览器，但正式主词库文件写入失败：${detail || "请在本地工作台中操作"}`);
          return {
            ok: false,
            status: "server-publish-failed",
            localSaved: true,
            serverPublished: false,
            localResult,
            serverResult
          };
        }

        cacheMetaRef.current = { ...cacheMetaRef.current, ...serverResult };
        setVocabRuntime({ status: "online", ...cacheMetaRef.current });
        return {
          ok: true,
          status: "published",
          localSaved: true,
          serverPublished: true,
          localResult,
          serverResult
        };
      } catch (error) {
        setToast?.(`词库改动保存失败：${error?.message || "未知错误"}`);
        return {
          ok: false,
          status: error?.status || "save-failed",
          localSaved: false,
          serverPublished: false,
          error
        };
      }
    })();

    persistPromiseBySnapshotRef.current.set(nextWords, task);
    task.then((result) => {
      if (!result?.ok) persistPromiseBySnapshotRef.current.delete(nextWords);
    });
    return task;
  }, [setToast]);

  const setWords = useCallback((updater) => {
    setWordsState((previousWords) => {
      const nextWords = typeof updater === "function" ? updater(previousWords) : updater;
      if (hasLexiconContentChange(previousWords, nextWords)) contentSnapshotRef.current.add(nextWords);
      return nextWords;
    });
  }, []);

  function markContentSnapshot(nextWords) {
    if (Array.isArray(nextWords)) contentSnapshotRef.current.add(nextWords);
  }

  useEffect(() => {
    const savedMode = safeLocalStorageGet(PHRASE_FLASH_STUDY_MODE_KEY);
    if (savedMode === "word" || savedMode === "phrase" || savedMode === "paraphrase") {
      setFlashStudyMode(savedMode);
    }
  }, []);

  useEffect(() => {
    safeLocalStorageSet(PHRASE_FLASH_STUDY_MODE_KEY, flashStudyMode);
  }, [flashStudyMode]);

  useEffect(() => {
    let cancelled = false;

    async function loadRuntimeCounts() {
      const meta = await fetch("/api/catalog-meta", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);

      if (cancelled) return;

      setPhraseRuntimeCount(Number.isFinite(meta?.phraseCount) ? meta.phraseCount : null);
      setLrSynonymCount(Number.isFinite(meta?.lrSynonymCount) ? meta.lrSynonymCount : null);
    }

    loadRuntimeCounts();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let loadedWords = null;
    let cancelled = false;

    const saved = safeLocalStorageGet("ielts_vocab_words_deepseek");
    if (saved) {
      try {
        const parsed = sanitizeRuntimeWords(JSON.parse(saved));
        if (Array.isArray(parsed) && parsed.length) {
          loadedWords = parsed;
          hydratedWordsRef.current = parsed;
          setWordsState(parsed);
          saveWordsToIndexedDB(parsed).catch(() => {});
        }
      } catch {
        safeLocalStorageRemove("ielts_vocab_words_deepseek");
      }

      // 大词库不适合长期放 localStorage，迁移后清理旧数据，避免 quota 报错。
      safeLocalStorageRemove("ielts_vocab_words_deepseek");
    }

    async function loadActiveWords() {
      let cachedWords = loadedWords;
      let cachedMeta = null;
      let cachedNeedsRepair = false;

      try {
        const stored = await withTimeout(loadWordsFromIndexedDB(), 2500, null);
        if (stored?.words?.length) {
          cachedWords = sanitizeRuntimeWords(stored.words);
          cachedNeedsRepair = cachedWords !== stored.words;
          cachedMeta = stored.meta || null;

          if (!cancelled) {
            if (cachedMeta) cacheMetaRef.current = cachedMeta;
            hydratedWordsRef.current = cachedWords;
            startTransition(() => setWordsState(cachedWords));
            setVocabRuntime({
              status: "loading",
              count: cachedMeta?.count || cachedWords.length,
              version: cachedMeta?.version || "",
              lexiconHash: cachedMeta?.lexiconHash || "",
              savedAt: cachedMeta?.savedAt || ""
            });
          }
        }

        const metaResponse = await fetch("/api/vocab-meta", { cache: "no-store" });
        const apiMeta = metaResponse?.ok ? await metaResponse.json().catch(() => null) : null;

        if (
          cachedWords?.length === Number(apiMeta?.count) &&
          apiMeta?.lexiconHash &&
          isWordCacheCurrent(cachedMeta || {}, apiMeta)
        ) {
          const currentMeta = { ...(cachedMeta || {}), ...apiMeta };
          if (cachedNeedsRepair) {
            await saveWordsToIndexedDB(cachedWords, currentMeta).catch(() => {});
          }
          if (!cancelled) {
            cacheMetaRef.current = currentMeta;
            setVocabRuntime({ status: "online", ...apiMeta });
          }
          return;
        }

        const response = await fetch("/api/vocab-data", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (!payload?.words?.length || Number(payload.count) !== payload.words.length) {
          throw new Error("词库响应数量不一致");
        }
        if (!payload.version || !payload.lexiconHash || !payload.savedAt) {
          throw new Error("词库响应缺少版本元数据");
        }

        const mergedMeta = {
          count: payload.count,
          version: payload.version,
          lexiconHash: payload.lexiconHash,
          savedAt: payload.savedAt,
          fileHash: payload.fileHash || "",
          wordsHash: payload.wordsHash || ""
        };
        const onlineWordsWithStoredState = applyStoredUserState(payload.words, stored);
        const mergedOnlineWords = mergeWordContentWithUserState(onlineWordsWithStoredState, cachedWords || [], {
          includePersonalSupplements: false
        });
        const onlineWords = sanitizeRuntimeWords(mergedOnlineWords);
        const onlineNeedsRepair = onlineWords !== mergedOnlineWords;

        cacheMetaRef.current = mergedMeta;
        if (!cancelled) {
          hydratedWordsRef.current = onlineWords;
          startTransition(() => setWordsState(onlineWords));
          setVocabRuntime({ status: "online", ...mergedMeta });
        }

        runWhenBrowserIdle(async () => {
          if (cancelled) return;

          const mergedWordsForCache = mergeWordContentWithUserState(payload.words, cachedWords || onlineWords, {
            includePersonalSupplements: false
          });
          const wordsForCache = sanitizeRuntimeWords(mergedWordsForCache);
          if (
            cachedNeedsRepair ||
            onlineNeedsRepair ||
            wordsForCache !== mergedWordsForCache ||
            !isWordCacheCurrent(cachedMeta || {}, mergedMeta) ||
            !stored?.words?.length
          ) {
            await saveWordsToIndexedDB(wordsForCache, mergedMeta);
          }
        });
      } catch {
        if (cancelled) return;
        const stored = await withTimeout(loadWordsFromIndexedDB(), 2500, null);
        if (stored?.words?.length) {
          cachedWords = sanitizeRuntimeWords(stored.words);
          cachedNeedsRepair = cachedWords !== stored.words;
          cachedMeta = stored.meta || null;
          if (cachedMeta) cacheMetaRef.current = cachedMeta;
          hydratedWordsRef.current = cachedWords;
          startTransition(() => setWordsState(cachedWords));
          if (cachedNeedsRepair) saveWordsToIndexedDB(cachedWords, cachedMeta || {}).catch(() => {});
        }

        if (cachedWords?.length) {
          const offlineMeta = {
            count: cachedMeta?.count || cachedWords.length,
            version: cachedMeta?.version || "未知版本",
            lexiconHash: cachedMeta?.lexiconHash || "",
            savedAt: cachedMeta?.savedAt || ""
          };
          cacheMetaRef.current = offlineMeta;
          setVocabRuntime({ status: "offline", ...offlineMeta });
        } else {
          const cacheStatus = stored?.status || "cache-miss";
          if (cacheStatus === "cache-invalid" || cacheStatus === "cache-version-mismatch") {
            setToast?.("本地词库缓存不完整或版本不兼容，离线时无法加载；学习状态已保留");
          } else if (cacheStatus === "storage-error") {
            setToast?.("本地词库存储读取失败，离线时无法加载");
          }
          setVocabRuntime({
            status: "error",
            cacheStatus,
            count: null,
            version: "",
            lexiconHash: ""
          });
        }
      }
    }

    loadActiveWords();

    // 音频状态表可能非常大，不能放 localStorage；旧版本缓存会导致 quota 报错，启动时清掉。
    safeLocalStorageRemove("ielts_vocab_audio_status_v1");

    storageReadyRef.current = true;

    return () => {
      cancelled = true;
    };
  }, [setToast]);

  useEffect(() => {
    if (!storageReadyRef.current) return;

    // Loading API/IndexedDB content must not be treated as a user edit or rewrite words.json metadata.
    if (hydratedWordsRef.current === words) {
      hydratedWordsRef.current = null;
      return;
    }

    if (!isProbablyFullVocab(words)) return;

    if (contentSnapshotRef.current.has(words)) {
      contentSnapshotRef.current.delete(words);
      persistWordsImmediately(words);
    } else {
      saveWordUserStateToIndexedDB(words).catch(() => {});
    }
    cleanupOldLargeLocalStorageKeys();
  }, [words, persistWordsImmediately]);

  return {
    words,
    setWords,
    flashStudyMode,
    setFlashStudyMode,
    vocabRuntime,
    setVocabRuntime,
    phraseRuntimeCount,
    lrSynonymCount,
    storageReadyRef,
    hydratedWordsRef,
    cacheMetaRef,
    persistWordsImmediately,
    markContentSnapshot
  };
}
