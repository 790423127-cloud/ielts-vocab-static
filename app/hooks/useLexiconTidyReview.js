"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadLexiconTidyAuditFromIndexedDB, saveLexiconTidyAuditToIndexedDB } from "../lib/vocab/word-store.mjs";
import {
  LEXICON_TIDY_FILTERS,
  buildLexiconTidyReview,
  buildRemovableWordKeySet,
  createEmptyLexiconTidyAudit,
  findTidyCandidate,
  getTidyAuditKey,
  matchesTidyScope,
  mergeTidyAuditRecords,
  mergeLexiconTidyAudits,
  normalizeLexiconTidyAudit,
  normalizeTidyWordKey
} from "../lib/vocab/lexicon-tidy-review.mjs";

export function useLexiconTidyReview({ words, setToast }) {
  const [audit, setAudit] = useState(() => createEmptyLexiconTidyAudit());
  const [referenceData, setReferenceData] = useState(null);
  const [ready, setReady] = useState(false);
  const auditRef = useRef(audit);
  const saveQueueRef = useRef(Promise.resolve());

  const persistAudit = useCallback((nextAudit) => {
    saveQueueRef.current = saveQueueRef.current.catch(() => {}).then(() => saveLexiconTidyAuditToIndexedDB(nextAudit)).catch(() => {
      setToast?.("词库整理记录暂时保存失败，请稍后重试");
    });
  }, [setToast]);

  const commitAudit = useCallback((updater) => {
    const next = normalizeLexiconTidyAudit(typeof updater === "function" ? updater(auditRef.current) : updater);
    auditRef.current = next;
    setAudit(next);
    persistAudit(next);
    return next;
  }, [persistAudit]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadLexiconTidyAuditFromIndexedDB().catch(() => createEmptyLexiconTidyAudit()),
      fetch("/data/basic-words.json").then((response) => response.ok ? response.json() : null).catch(() => null),
      fetch("/data/lexicon-tidy-audit.json").then((response) => response.ok ? response.json() : null).catch(() => null)
    ]).then(([savedAudit, source, defaultAudit]) => {
      if (cancelled) return;
      const nextAudit = mergeLexiconTidyAudits(defaultAudit, savedAudit);
      auditRef.current = nextAudit;
      setAudit(nextAudit);
      setReferenceData(source);
      setReady(true);
      if (!source) setToast?.("基础词候选参考暂时加载失败，已仅使用主词库低价值名词规则");
    });
    return () => { cancelled = true; };
  }, [setToast]);

  const removableKeys = useMemo(() => buildRemovableWordKeySet(referenceData, words), [referenceData, words]);
  const review = useMemo(() => buildLexiconTidyReview(words, { audit, removableKeys }), [words, audit, removableKeys]);

  const getCandidate = useCallback((index) => findTidyCandidate(review, Number.isInteger(index) ? words[index] : null, index), [review, words]);
  const matchesWord = useCallback((word, index, scope = LEXICON_TIDY_FILTERS.REVIEW) =>
    Boolean(ready && word && Number.isInteger(index) && matchesTidyScope(findTidyCandidate(review, word, index), scope)), [ready, review]);

  const keepWord = useCallback((word, index) => {
    const candidate = findTidyCandidate(review, word, index);
    commitAudit((current) => mergeTidyAuditRecords(current, [{
      auditKey: candidate?.auditKey || getTidyAuditKey(word, index),
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
    const reasonCodes = findTidyCandidate(review, currentWord, currentIndex)?.reasonCodes || [];
    const entries = list.flatMap((word, index) => normalizeTidyWordKey(word?.word) === targetKey ? [{
      auditKey: getTidyAuditKey(word, index),
      record: {
        sourceLexicon: "main",
        wordId: word?.wordId || word?.id || "",
        word: word?.word || "",
        decision: "deleted",
        reasonCodes,
        deletedAt: Date.now(),
        snapshot: word
      }
    }] : []);
    if (entries.length) commitAudit((current) => mergeTidyAuditRecords(current, entries));
    return entries.length;
  }, [review, commitAudit]);

  return { ready, review, matchesWord, getCandidate, keepWord, recordDeletedWords };
}
