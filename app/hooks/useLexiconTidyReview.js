"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadLexiconTidyAuditFromIndexedDB, saveLexiconTidyAuditToIndexedDB } from "../lib/vocab/word-store.mjs";
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

const REMOVABLE_TOPICS = new Set([
  "问候", "礼貌", "基础应答", "人称", "指示", "疑问词", "连接词", "数字", "序数", "时间", "颜色",
  "星期", "月份", "家庭", "人物", "身体", "学校", "家", "国家", "物品", "动物", "职业", "衣服", "地点",
  "自然", "交通", "方向", "天气", "购物", "数量", "基础名词", "季节", "食物"
]);

function pickRemovableKeys(data) {
  const source = Array.isArray(data?.words) ? data.words : [];
  const selected = source.filter((item) => item?.topics?.some((topic) => REMOVABLE_TOPICS.has(topic))).slice(0, 1000);
  return new Set(selected.map((item) => normalizeTidyWordKey(item?.word)).filter(Boolean));
}

export function useLexiconTidyReview({ words, setToast }) {
  const [audit, setAudit] = useState(() => createEmptyLexiconTidyAudit());
  const [removableKeys, setRemovableKeys] = useState(() => new Set());
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
      fetch("/data/basic-words.json").then((response) => response.ok ? response.json() : null).catch(() => null)
    ]).then(([savedAudit, source]) => {
      if (cancelled) return;
      const nextAudit = normalizeLexiconTidyAudit(savedAudit);
      auditRef.current = nextAudit;
      setAudit(nextAudit);
      setRemovableKeys(pickRemovableKeys(source));
      setReady(true);
      if (!source) setToast?.("基础词候选暂时加载失败");
    });
    return () => { cancelled = true; };
  }, [setToast]);

  const review = useMemo(() => buildLexiconTidyReview(words, { audit, removableKeys }), [words, audit, removableKeys]);

  useEffect(() => {
    if (ready && review.autoKeepRecords.length) commitAudit((current) => mergeTidyAuditRecords(current, review.autoKeepRecords));
  }, [ready, review.autoKeepRecords, commitAudit]);

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
