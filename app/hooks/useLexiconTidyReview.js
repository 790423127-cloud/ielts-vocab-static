"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadLexiconTidyAuditFromIndexedDB,
  saveLexiconTidyAuditToIndexedDB
} from "../lib/vocab/word-store.mjs";
import {
  LEXICON_TIDY_FILTERS,
  buildLexiconTidyReview,
  createEmptyLexiconTidyAudit,
  findTidyCandidate,
  getTidyAuditKey,
  matchesTidyScope,
  mergeTidyAuditRecords,
  normalizeLexiconTidyAudit,
  normalizeTidyWordKey
} from "../lib/vocab/lexicon-tidy-review.mjs";

export function useLexiconTidyReview({ words, setToast }) {
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

    loadLexiconTidyAuditFromIndexedDB()
      .then((value) => {
        if (cancelled) return;
        const nextAudit = normalizeLexiconTidyAudit(value);
        auditRef.current = nextAudit;
        setAudit(nextAudit);
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        const nextAudit = createEmptyLexiconTidyAudit();
        auditRef.current = nextAudit;
        setAudit(nextAudit);
        setReady(true);
        setToast?.("词库整理记录读取失败，已先使用当前主词库继续");
      });

    return () => {
      cancelled = true;
    };
  }, [setToast]);

  const review = useMemo(
    () => buildLexiconTidyReview(words, { audit }),
    [words, audit]
  );

  useEffect(() => {
    if (!ready || !review.autoKeepRecords.length) return;
    commitAudit((current) => mergeTidyAuditRecords(current, review.autoKeepRecords));
  }, [ready, review.autoKeepRecords, commitAudit]);

  const getCandidate = useCallback((index) => {
    const word = Number.isInteger(index) ? words[index] : null;
    return findTidyCandidate(review, word, index);
  }, [review, words]);

  const matchesWord = useCallback((word, index, scope = LEXICON_TIDY_FILTERS.REVIEW) => {
    if (!ready || !word || !Number.isInteger(index)) return false;
    return matchesTidyScope(findTidyCandidate(review, word, index), scope);
  }, [ready, review]);

  const keepWord = useCallback((word, index) => {
    const candidate = findTidyCandidate(review, word, index);
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
  }, [review, commitAudit]);

  const recordDeletedWords = useCallback((sourceWords, currentIndex) => {
    const list = Array.isArray(sourceWords) ? sourceWords : [];
    const currentWord = list[currentIndex];
    const targetKey = normalizeTidyWordKey(currentWord?.word);
    if (!targetKey) return 0;

    const currentCandidate = findTidyCandidate(review, currentWord, currentIndex);
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
  }, [review, commitAudit]);

  return {
    ready,
    review,
    matchesWord,
    getCandidate,
    keepWord,
    recordDeletedWords
  };
}
