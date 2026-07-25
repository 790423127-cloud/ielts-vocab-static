"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadBasicWords } from "../lib/basic-vocab/load-basic-words.mjs";
import {
  loadLexiconTidyAuditFromIndexedDB,
  saveLexiconTidyAuditToIndexedDB
} from "../lib/vocab/word-store.mjs";
import {
  LEXICON_TIDY_FILTERS,
  buildLexiconTidyReview,
  createEmptyLexiconTidyAudit,
  getTidyAuditKey,
  matchesTidyScope,
  mergeTidyAuditRecords,
  normalizeLexiconTidyAudit,
  normalizeTidyWordKey
} from "../lib/vocab/lexicon-tidy-review.mjs";

const FALLBACK_BASIC_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "i", "you", "he", "she", "it", "we", "they",
  "am", "is", "are", "was", "were", "be", "do", "go", "come", "get", "make", "have",
  "good", "bad", "big", "small", "new", "old", "yes", "no", "one", "two", "three"
]);

export function useLexiconTidyReview({ words, setToast }) {
  const [basicWordKeys, setBasicWordKeys] = useState(FALLBACK_BASIC_WORDS);
  const [audit, setAudit] = useState(() => createEmptyLexiconTidyAudit());
  const [ready, setReady] = useState(false);
  const auditRef = useRef(audit);
  const saveQueueRef = useRef(Promise.resolve());

  const persistAudit = useCallback((nextAudit) => {
    saveQueueRef.current = saveQueueRef.current
      .catch(() => {})
      .then(() => saveLexiconTidyAuditToIndexedDB(nextAudit))
      .catch(() => {
        setToast?.("词库整理记录暂时保存失败，请稍后重试");
      });
  }, [setToast]);

  const commitAudit = useCallback((updater) => {
    const current = auditRef.current;
    const next = normalizeLexiconTidyAudit(
      typeof updater === "function" ? updater(current) : updater
    );
    auditRef.current = next;
    setAudit(next);
    persistAudit(next);
    return next;
  }, [persistAudit]);

  useEffect(() => {
    let cancelled = false;

    async function loadReviewData() {
      const [basicResult, auditResult] = await Promise.allSettled([
        loadBasicWords(),
        loadLexiconTidyAuditFromIndexedDB()
      ]);
      if (cancelled) return;

      if (basicResult.status === "fulfilled") {
        const nextKeys = new Set(FALLBACK_BASIC_WORDS);
        for (const word of basicResult.value?.words || []) {
          const key = normalizeTidyWordKey(word?.word);
          if (key) nextKeys.add(key);
        }
        setBasicWordKeys(nextKeys);
      }

      const nextAudit = auditResult.status === "fulfilled"
        ? normalizeLexiconTidyAudit(auditResult.value)
        : createEmptyLexiconTidyAudit();
      auditRef.current = nextAudit;
      setAudit(nextAudit);
      setReady(true);
    }

    loadReviewData();
    return () => {
      cancelled = true;
    };
  }, []);

  const review = useMemo(
    () => buildLexiconTidyReview(words, { basicWordKeys, audit }),
    [words, basicWordKeys, audit]
  );

  useEffect(() => {
    if (!ready || !review.autoKeepRecords.length) return;
    commitAudit((current) => mergeTidyAuditRecords(current, review.autoKeepRecords));
  }, [ready, review.autoKeepRecords, commitAudit]);

  const matchesWord = useCallback((word, index, scope = LEXICON_TIDY_FILTERS.REVIEW) => {
    if (!ready || !word || !Number.isInteger(index)) return false;
    return matchesTidyScope(review.candidateByIndex.get(index), scope);
  }, [ready, review.candidateByIndex]);

  const keepWord = useCallback((word, index) => {
    const candidate = review.candidateByIndex.get(index);
    const auditKey = candidate?.auditKey || getTidyAuditKey(word, index);
    commitAudit((current) => mergeTidyAuditRecords(current, [{
      auditKey,
      record: {
        sourceLexicon: "main",
        wordId: word?.wordId || word?.id || "",
        word: word?.word || "",
        decision: "keep",
        reasonCodes: candidate?.reasonCodes || [],
        reviewedAt: Date.now()
      }
    }]));
    return candidate;
  }, [review.candidateByIndex, commitAudit]);

  const recordDeletedWords = useCallback((sourceWords, currentIndex) => {
    const list = Array.isArray(sourceWords) ? sourceWords : [];
    const currentWord = list[currentIndex];
    const targetKey = normalizeTidyWordKey(currentWord?.word);
    if (!targetKey) return 0;

    const currentCandidate = review.candidateByIndex.get(currentIndex);
    const entries = [];
    for (let index = 0; index < list.length; index += 1) {
      const word = list[index];
      if (normalizeTidyWordKey(word?.word) !== targetKey) continue;
      entries.push({
        auditKey: getTidyAuditKey(word, index),
        record: {
          sourceLexicon: "main",
          wordId: word?.wordId || word?.id || "",
          word: word?.word || "",
          decision: "deleted",
          reasonCodes: currentCandidate?.reasonCodes || [],
          deletedAt: Date.now(),
          snapshot: word
        }
      });
    }

    if (entries.length) {
      commitAudit((current) => mergeTidyAuditRecords(current, entries));
    }
    return entries.length;
  }, [review.candidateByIndex, commitAudit]);

  return {
    ready,
    review,
    matchesWord,
    getCandidate: (index) => review.candidateByIndex.get(index) || null,
    keepWord,
    recordDeletedWords
  };
}
