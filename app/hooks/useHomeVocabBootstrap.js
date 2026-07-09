"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { LEXICON_VERSION_WITHOUT_CONFIRMED_PERSON_NAMES } from "../lib/vocab/lexicon-guard-shared.mjs";
import { PHRASE_FLASH_STUDY_MODE_KEY } from "../lib/vocab/phrase-flashcard-keys.mjs";
import {
  isWordCacheCurrent,
  mergeWordContentWithUserState
} from "../lib/vocab/word-cache-meta.mjs";
import {
  loadWordsFromIndexedDB,
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

/**
 * Home page vocab bootstrap: flash mode, catalog counts, IndexedDB/API load, user-state persist.
 */
export function useHomeVocabBootstrap({ setToast }) {
  const [words, setWords] = useState([]);
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
  const cacheMetaRef = useRef({
    version: LEXICON_VERSION_WITHOUT_CONFIRMED_PERSON_NAMES,
    lexiconHash: "",
    savedAt: ""
  });

  function persistWordsImmediately(nextWords) {
    if (!isProbablyFullVocab(nextWords)) {
      setToast?.(`已阻止少量词覆盖大词库：当前只有 ${Array.isArray(nextWords) ? nextWords.length : 0} 个词，请先恢复词库`);
      return;
    }

    saveWordsToIndexedDB(nextWords, cacheMetaRef.current).catch(() => {
      compactBrowserStorageForCurrentWords(nextWords, cacheMetaRef.current)
        .then(() => setToast?.("已清理浏览器旧缓存并重新保存大词库"))
        .catch(() => setToast?.("本地保存失败：请先恢复词库，再点“清理浏览器存储空间”"));
    });
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
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length) {
          loadedWords = parsed;
          hydratedWordsRef.current = parsed;
          setWords(parsed);
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

      try {
        const stored = await withTimeout(loadWordsFromIndexedDB().catch(() => null), 2500, null);
        if (stored?.words?.length) {
          cachedWords = stored.words;
          cachedMeta = stored.meta || null;

          if (!cancelled) {
            if (cachedMeta) cacheMetaRef.current = cachedMeta;
            hydratedWordsRef.current = stored.words;
            startTransition(() => setWords(stored.words));
            setVocabRuntime({
              status: "loading",
              count: cachedMeta?.count || stored.words.length,
              version: cachedMeta?.version || "",
              lexiconHash: cachedMeta?.lexiconHash || "",
              savedAt: cachedMeta?.savedAt || ""
            });
          }
        }

        const metaResponse = await fetch("/api/vocab-meta", { cache: "no-store" });
        const apiMeta = metaResponse?.ok ? await metaResponse.json().catch(() => null) : null;

        if (cachedWords?.length && apiMeta?.lexiconHash && isWordCacheCurrent(cachedMeta || {}, apiMeta)) {
          if (!cancelled) {
            cacheMetaRef.current = { ...(cachedMeta || {}), ...apiMeta };
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
        const onlineWords = mergeWordContentWithUserState(payload.words, cachedWords || []);

        cacheMetaRef.current = mergedMeta;
        if (!cancelled) {
          hydratedWordsRef.current = onlineWords;
          startTransition(() => setWords(onlineWords));
          setVocabRuntime({ status: "online", ...mergedMeta });
        }

        runWhenBrowserIdle(async () => {
          if (cancelled) return;

          const wordsForCache = mergeWordContentWithUserState(payload.words, cachedWords || onlineWords);
          if (!isWordCacheCurrent(cachedMeta || {}, mergedMeta) || !stored?.words?.length) {
            await saveWordsToIndexedDB(wordsForCache, mergedMeta);
          }
        });
      } catch {
        if (cancelled) return;
        const stored = await withTimeout(loadWordsFromIndexedDB().catch(() => null), 2500, null);
        if (stored?.words?.length) {
          cachedWords = stored.words;
          cachedMeta = stored.meta || null;
          if (cachedMeta) cacheMetaRef.current = cachedMeta;
          hydratedWordsRef.current = stored.words;
          startTransition(() => setWords(stored.words));
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
          setVocabRuntime({ status: "error", count: null, version: "", lexiconHash: "" });
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

    // Learning actions only update the compact user-state record. Content edits
    // call persistWordsImmediately explicitly.
    if (!isProbablyFullVocab(words)) {
      return;
    }

    saveWordUserStateToIndexedDB(words).catch(() => {});
    cleanupOldLargeLocalStorageKeys();
  }, [words]);

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
    persistWordsImmediately
  };
}
