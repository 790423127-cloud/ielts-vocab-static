"use client";
/**
 * Ai ops factory — split from useHomeLexiconAdmin (v2026-07-10.3)
 */
import {
  applyEditDraftToWord,
  buildLocalCleanResult,
  buildLocalExactDedupeResult,
  buildLocalFormFamilyResult,
  buildLocalOptimizeResult,
  cleanTtsSymbolsInWord,
  collectObscureDerivedCandidates,
  emergencyDefaultCloudUrl,
  getLocalWrongReasons,
  hasHeadwordRepair,
  isCompleteAiWord,
  isLikelyWrongAiWord,
  isMissingAiFields,
  isMissingClassification,
  isProbablyFullVocab,
  isSimpleDictionaryWord,
  mergeWord,
  normalizePhraseItems,
  normalizeStringArray,
  normalizeWord,
  parseImportText,
  repairHeadwordLocally,
  repairObviousWrongWordLocally,
  wordToEditDraft
} from "../lib/vocab/page-word-helpers.mjs";
import { buildLocalChangeLog } from "../lib/vocab/local-change-log.mjs";
import {
  buildBlankVocabTemplateCsvText,
  buildBlankVocabTemplateJsonPayload,
  csvToObjects,
  mergeBasicTemplateWord,
  normalizeTemplateWord
} from "../lib/vocab/vocab-template-io.mjs";
import {
  loadWordsFromIndexedDB,
  postExportCache,
  saveWordsToIndexedDB
} from "../lib/vocab/word-store.mjs";
import { filterKey, isIdictationFlashFilter } from "../lib/vocab/word-flashcard-study-pool.mjs";
import { LEXICON_VERSION_WITHOUT_CONFIRMED_PERSON_NAMES } from "../lib/vocab/lexicon-guard-shared.mjs";


export function createAiOps(ctx) {
  const {
    words, setWords, index, setIndex, filter,
    lastLocalChange, setLastLocalChange,
    setLoading, setToast, setBatchInfo, setDuplicateInfo,
    setEditOpen, setEditDraft, editDraft,
    item, isExternalIdictationItem, pasteText, setPasteText,
    persistWordsImmediately, resetWordStudySessionState,
    cacheMetaRef, latestStateRef, entryPositionsRef, persistWordFlashSessionNow,
    compactBrowserStorageForCurrentWords,
    applyLocalResult, recordLocalChange, localOptimizeWordList
  } = ctx;

  async function cleanWordList() {
    try {
      setLoading(true);
      setBatchInfo("");

      const targets = words
        .map((w, i) => ({ id: String(i), text: w.word, i }))
        .filter((item) => item.text && item.text.trim());

      if (!targets.length) {
        setToast("没有可整理的词条");
        return;
      }

      const batchSize = 100;
      const concurrency = 5;
      const chunks = [];

      for (let start = 0; start < targets.length; start += batchSize) {
        chunks.push(targets.slice(start, start + batchSize));
      }

      let nextChunkIndex = 0;
      let completedWords = 0;
      let failedWords = [];
      const cleanResults = new Map();

      async function runOneChunk(chunk, workerId, retry = 0) {
        const preview = chunk.map(({ text }) => text).slice(0, 6).join(", ");

        setBatchInfo(
          `AI深度整理词表：${completedWords} / ${targets.length} ｜ 第 ${workerId} 路：${preview}${chunk.length > 6 ? "..." : ""}`
        );

        const res = await fetch("/api/clean-words", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: chunk.map(({ id, text }) => ({ id, text }))
          })
        });

        const data = await res.json();

        if (!res.ok) {
          if (retry < 1) {
            return runOneChunk(chunk, workerId, retry + 1);
          }

          failedWords.push(...chunk.map(({ text }) => text));
          return;
        }

        (data.items || []).forEach((entry) => {
          cleanResults.set(String(entry.id), entry);
        });
      }

      async function worker(workerId) {
        while (nextChunkIndex < chunks.length) {
          const chunkIndex = nextChunkIndex;
          nextChunkIndex += 1;
          const chunk = chunks[chunkIndex];

          try {
            await runOneChunk(chunk, workerId);
          } catch {
            failedWords.push(...chunk.map(({ text }) => text));
          } finally {
            completedWords += chunk.length;
            setBatchInfo(
              `AI深度整理词表：${Math.min(completedWords, targets.length)} / ${targets.length} ｜ 失败 ${failedWords.length} 个 ｜ 剩余批次 ${Math.max(0, chunks.length - nextChunkIndex)}`
            );
          }
        }
      }

      const workerCount = Math.min(concurrency, chunks.length);
      await Promise.all(
        Array.from({ length: workerCount }, (_, i) => worker(i + 1))
      );

      let cleanedCount = 0;
      let changedCount = 0;
      let removedCount = 0;
      let mergedCount = 0;

      setWords((prev) => {
        const cleaned = prev
          .map((word, i) => {
            const entry = cleanResults.get(String(i));
            if (!entry) return word;

            const clean = String(entry.clean || "").trim();

            if (!clean) {
              removedCount += 1;
              return null;
            }

            cleanedCount += 1;

            const changed = normalizeWord(clean) !== normalizeWord(word.word);

            if (!changed) {
              return word;
            }

            changedCount += 1;

            return {
              ...word,
              word: clean,
              phonetic: "",
              pos: entry.type === "phrase" ? "phrase" : "",
              meaning: "",
              definition: "",
              example: "",
              exampleCn: "",
              collocations: [],
              phraseCollocations: [],
              ieltsUse: [],
              topics: [],
              difficulty: "",
              category: entry.type === "phrase" ? "AI深度整理词表 · 短语" : "AI深度整理词表 · 单词",
              status: word.status || "",
              favorite: Boolean(word.favorite)
            };
          })
          .filter(Boolean);

        const map = new Map();

        cleaned.forEach((word) => {
          const key = normalizeWord(word.word);
          if (!key) return;

          if (map.has(key)) {
            mergedCount += 1;
            map.set(key, mergeWord(map.get(key), word));
          } else {
            map.set(key, word);
          }
        });

        return Array.from(map.values());
      });

      resetWordStudySessionState();
      setBatchInfo("");

      if (failedWords.length) {
        setToast(`AI深度整理词表完成，但有 ${failedWords.length} 个失败；改写 ${changedCount} 个，合并重复 ${mergedCount} 个`);
      } else {
        setToast(`AI深度整理词表完成：处理 ${cleanedCount} 个，改写 ${changedCount} 个，合并重复 ${mergedCount} 个`);
      }
    } catch (error) {
      setBatchInfo("");
      setToast(error.message || "AI 深度整理词表失败");
    } finally {
      setLoading(false);
    }
  }

  async function generateForIndex(targetIndex, options = {}) {
    const target = words[targetIndex];
    if (!target?.word) return null;

    const force = !!options.force;

    if (!force && isCompleteAiWord(target)) {
      setToast("这个词已经补全，不需要调用 AI");
      return target;
    }

    const res = await fetch("/api/generate-word", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: target.word, force })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error || data?.detail || "AI 生成失败");
    }

    setWords((prev) => {
      const next = [...prev];
      next[targetIndex] = {
        ...next[targetIndex],
        ...data,
        ieltsUse: normalizeStringArray(data.ieltsUse || data.ielts_use),
        topics: normalizeStringArray(data.topics),
        difficulty: data.difficulty || next[targetIndex].difficulty || "",
        collocations: normalizePhraseItems(data.collocations),
        phraseCollocations: normalizePhraseItems(data.phraseCollocations),
        status: next[targetIndex].status || ""
      };
      return next;
    });

    return data;
  }

  function confirmAiCost(actionName) {
    return window.confirm(
      `${actionName}\n\n这个操作会调用 DeepSeek API，可能产生费用。\n\n建议：平时优先使用“一键本地优化 / 本地归并词形 / 修改当前单词 / 继续补全全部音频”。\n\n确定继续吗？`
    );
  }

  async function generateCurrent(options = {}) {
    const force = options.force !== false;

    try {
      setLoading(true);
      setBatchInfo("");
      await generateForIndex(index, { force });
      setToast(force ? "AI已修复当前词" : "DeepSeek 已补全当前词");
    } catch (error) {
      setToast(error.message || "AI 生成失败");
    } finally {
      setLoading(false);
    }
  }

  async function aiRepairCurrentWordSymbol() {
    const currentWord = words[index];

    if (!currentWord?.word) {
      setToast("没有当前单词");
      return;
    }

    try {
      setLoading(true);
      setBatchInfo("AI 正在判断并修复当前词条符号...");

      const res = await fetch("/api/repair-word-symbol", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          word: currentWord.word
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || data?.detail || "AI 修复当前词条符号失败");
      }

      const repairedWord = String(data.repairedWord || "").trim();

      if (!repairedWord) {
        throw new Error("AI 返回了空词条");
      }

      if (repairedWord === currentWord.word) {
        setToast(`AI判断无需修改：${currentWord.word}${data.reason ? "｜" + data.reason : ""}`);
        return;
      }

      const nextWords = [...words];
      nextWords[index] = {
        ...currentWord,
        word: repairedWord,
        aiSymbolRepairedAt: Date.now(),
        aiSymbolRepairReason: data.reason || ""
      };

      recordLocalChange("AI修复当前单词符号", words, nextWords);
      setWords(nextWords);
      persistWordsImmediately(nextWords);

      setToast(`AI已修复当前单词符号：${currentWord.word} → ${repairedWord}${data.reason ? "｜" + data.reason : ""}`);
    } catch (error) {
      setToast(error.message || "AI修复当前单词符号失败");
    } finally {
      setBatchInfo("");
      setLoading(false);
    }
  }

  async function generateMissingBatch(options = {}) {
    const repairWrong = options.repairWrong !== false;
    const onlyWrong = !!options.onlyWrong;
    const modeName = onlyWrong
      ? "AI批量修复确定错词"
      : repairWrong
        ? "AI批量补全缺失+修复错词"
        : "AI批量补全缺失资料";

    try {
      setLoading(true);

      const wrongTargets = words
        .map((w, i) => ({
          w,
          i,
          missing: !isCompleteAiWord(w),
          wrong: repairWrong && isLikelyWrongAiWord(w)
        }))
        .filter(({ wrong }) => wrong);

      const missingTargets = words
        .map((w, i) => ({
          w,
          i,
          missing: !isCompleteAiWord(w),
          wrong: repairWrong && isLikelyWrongAiWord(w)
        }))
        .filter(({ missing, wrong }) => missing && !wrong);

      const targets = onlyWrong ? wrongTargets : [...wrongTargets, ...missingTargets];

      if (!targets.length) {
        setToast(onlyWrong ? "没有发现确定错词" : repairWrong ? "没有发现缺失资料或明显错词" : "没有发现缺失资料");
        return { total: 0, failed: 0, repaired: 0 };
      }

      const batchSize = 20;
      const concurrency = 5;
      const chunks = [];

      for (let start = 0; start < targets.length; start += batchSize) {
        const chunk = targets.slice(start, start + batchSize);
        chunks.push({
          items: chunk,
          force: chunk.some((item) => item.wrong) || onlyWrong
        });
      }

      let nextChunkIndex = 0;
      let completedWords = 0;
      let failedWords = [];
      let repairedWords = 0;
      let completedMissing = 0;

      function applyGeneratedItems(chunk, items) {
        const itemMap = new Map();

        (items || []).forEach((entry) => {
          itemMap.set(normalizeWord(entry.word), entry);
        });

        setWords((prev) => {
          const next = [...prev];

          chunk.items.forEach(({ i, wrong, missing }) => {
            const entry = itemMap.get(normalizeWord(next[i].word));

            if (!entry) {
              failedWords.push(next[i].word);
              return;
            }

            if (wrong) repairedWords += 1;
            if (missing) completedMissing += 1;

            next[i] = {
              ...next[i],
              ...entry,
              ieltsUse: normalizeStringArray(entry.ieltsUse || entry.ielts_use),
              topics: normalizeStringArray(entry.topics),
              difficulty: entry.difficulty || next[i].difficulty || "",
              collocations: normalizePhraseItems(entry.collocations || entry.common_collocations),
              phraseCollocations: normalizePhraseItems(entry.phraseCollocations || entry.phrase_collocations),
              status: next[i].status || "",
              aiWrongRepairedAt: wrong ? Date.now() : next[i].aiWrongRepairedAt
            };
          });

          return next;
        });
      }

      async function runOneChunk(chunk, workerId, retry = 0) {
        const wordList = chunk.items.map(({ w }) => w.word);
        const preview = wordList.slice(0, 5).join(", ");

        setBatchInfo(
          `${modeName} 20×5：${completedWords} / ${targets.length} ｜ 第 ${workerId} 路：${preview}${wordList.length > 5 ? "..." : ""}`
        );

        const res = await fetch("/api/generate-words", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            words: wordList,
            force: chunk.force
          })
        });

        const data = await res.json();

        if (!res.ok) {
          const reason = data?.detail || data?.error || `HTTP ${res.status}`;

          if (retry < 1) {
            setBatchInfo(`第 ${workerId} 路失败，正在重试：${reason}`);
            return runOneChunk(chunk, workerId, retry + 1);
          }

          failedWords.push(...wordList);
          setBatchInfo(`第 ${workerId} 路失败：${reason}`);
          return;
        }

        if (!Array.isArray(data.items) || !data.items.length) {
          failedWords.push(...wordList);
          setBatchInfo(`第 ${workerId} 路没有返回有效词条`);
          return;
        }

        applyGeneratedItems(chunk, data.items || []);
      }

      async function worker(workerId) {
        while (nextChunkIndex < chunks.length) {
          const chunkIndex = nextChunkIndex;
          nextChunkIndex += 1;
          const chunk = chunks[chunkIndex];

          try {
            await runOneChunk(chunk, workerId);
          } catch {
            failedWords.push(...chunk.items.map(({ w }) => w.word));
          } finally {
            completedWords += chunk.items.length;
            setBatchInfo(
              `${modeName} 20×5：${Math.min(completedWords, targets.length)} / ${targets.length} ｜ 已修错 ${repairedWords} 个 ｜ 失败 ${failedWords.length} 个 ｜ 剩余批次 ${Math.max(0, chunks.length - nextChunkIndex)}`
            );
          }
        }
      }

      const workerCount = Math.min(concurrency, chunks.length);

      await Promise.all(
        Array.from({ length: workerCount }, (_, i) => worker(i + 1))
      );

      setBatchInfo("");

      setToast(
        `${modeName}完成：处理 ${targets.length} 个，修错 ${repairedWords} 个，补缺 ${completedMissing} 个，失败 ${failedWords.length} 个`
      );

      return {
        total: targets.length,
        repaired: repairedWords,
        completed: completedMissing,
        failed: failedWords.length
      };
    } catch (error) {
      setToast(error.message || "AI补全/修复失败");
    } finally {
      setLoading(false);
    }
  }

  async function aiCompletePendingAndUnclassifiedOneByOne() {
    try {
      setLoading(true);

      const targets = words
        .map((w, i) => ({
          w,
          i,
          missing: isMissingAiFields(w),
          unclassified: isMissingClassification(w),
          wrong: isLikelyWrongAiWord(w),
          truncated: hasHeadwordRepair(w.word)
        }))
        .filter(({ missing, unclassified, wrong, truncated }) => missing || unclassified || wrong || truncated);

      if (!targets.length) {
        setToast("没有发现待补全、未归类或可修复错词");
        return { total: 0, failed: 0, filled: 0, repairedWordCount: 0 };
      }

      let filled = 0;
      let repairedWordCount = 0;
      const failed = [];
      const failedDetails = [];

      function normalizeCompletionEntry(entry, originalWord, existingWord) {
        const aiWord = String(entry?.word || "").trim();
        const localRepair = repairHeadwordLocally(existingWord || originalWord);
        const repairedWord = aiWord || localRepair || existingWord || originalWord;

        return {
          ...entry,
          // 逐个模式允许修正 word，用来查错词和补资料。
          word: repairedWord,
          ieltsUse: normalizeStringArray(entry.ieltsUse || entry.ielts_use),
          topics: normalizeStringArray(entry.topics),
          difficulty: entry.difficulty || "",
          collocations: normalizePhraseItems(entry.collocations || entry.common_collocations),
          phraseCollocations: normalizePhraseItems(entry.phraseCollocations || entry.phrase_collocations)
        };
      }

      function applyEntry(target, entry) {
        let applied = false;

        setWords((prev) => {
          const next = [...prev];
          const beforeWord = String(next[target.i]?.word || target.w.word || "").trim();

          if (!entry) return next;

          const normalized = normalizeCompletionEntry(entry, target.w.word, beforeWord);
          const afterWord = String(normalized.word || beforeWord).trim();

          next[target.i] = {
            ...next[target.i],
            ...normalized,
            word: afterWord || beforeWord,
            difficulty: normalized.difficulty || next[target.i].difficulty || "",
            status: next[target.i].status || "",
            aiOneByOneCompletedAt: Date.now(),
            aiOneByOneWordRepairedAt: afterWord && normalizeWord(afterWord) !== normalizeWord(beforeWord) ? Date.now() : next[target.i].aiOneByOneWordRepairedAt,
            originalBrokenWord: afterWord && normalizeWord(afterWord) !== normalizeWord(beforeWord) ? (next[target.i].originalBrokenWord || beforeWord) : next[target.i].originalBrokenWord
          };

          if (afterWord && normalizeWord(afterWord) !== normalizeWord(beforeWord)) {
            repairedWordCount += 1;
          }

          applied = true;
          return next;
        });

        if (applied) filled += 1;
        return applied;
      }

      for (let position = 0; position < targets.length; position += 1) {
        const target = targets[position];
        const reasonText = [
          target.missing ? "待补全" : "",
          target.unclassified ? "未归类" : "",
          target.wrong ? "疑似错词" : "",
          target.truncated ? "截断词" : ""
        ].filter(Boolean).join("+");

        setBatchInfo(
          `AI逐个补全+查错词 1×1：${position + 1} / ${targets.length} ｜ ${target.w.word} ｜ ${reasonText}`
        );

        try {
          const res = await fetch("/api/generate-word", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              word: target.w.word,
              force: target.wrong || target.truncated
            })
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
          }

          const ok = applyEntry(target, data);

          if (!ok) {
            throw new Error("AI返回内容无法写入当前词");
          }
        } catch (error) {
          failed.push(target.w.word);
          failedDetails.push(`${target.w.word}: ${error.message || "逐个补全/查错失败"}`);
        }

        // 给 API 一点缓冲，避免连续请求太密。
        await new Promise((resolve) => setTimeout(resolve, 350));
      }

      setBatchInfo("");
      setToast(
        `AI逐个补全+查错词完成：处理 ${targets.length} 个，补全 ${filled} 个，改词 ${repairedWordCount} 个，失败 ${failed.length} 个${failedDetails[0] ? "｜失败示例：" + failedDetails.slice(0, 3).join("；") : ""}`
      );

      return {
        total: targets.length,
        filled,
        repairedWordCount,
        failed: failed.length,
        failedDetails
      };
    } catch (error) {
      setToast(error.message || "AI逐个补全+查错词失败");
    } finally {
      setLoading(false);
    }
  }

  async function aiSlowCompleteMissing10x1() {
    try {
      setLoading(true);

      const targets = words
        .map((w, i) => ({ w, i }))
        .filter(({ w }) => isMissingAiFields(w) || isLikelyWrongAiWord(w) || hasHeadwordRepair(w.word));

      if (!targets.length) {
        setToast("没有发现缺失资料或可修复错字，不需要调用 AI");
        return { total: 0, failed: 0 };
      }

      const batchSize = 10;
      const chunks = [];

      for (let start = 0; start < targets.length; start += batchSize) {
        chunks.push(targets.slice(start, start + batchSize));
      }

      let completed = 0;
      let filled = 0;
      let repairedWordCount = 0;
      const failed = [];
      const failedDetails = [];

      function normalizeCompletionEntry(entry, originalWord, existingWord) {
        const aiWord = String(entry?.word || "").trim();
        const localRepair = repairHeadwordLocally(existingWord || originalWord);
        const repairedWord = aiWord || localRepair || existingWord || originalWord;

        return {
          ...entry,
          // 慢速模式允许自动修正 word，例如 injur → injure。
          word: repairedWord,
          ieltsUse: normalizeStringArray(entry.ieltsUse || entry.ielts_use),
          topics: normalizeStringArray(entry.topics),
          difficulty: entry.difficulty || "",
          collocations: normalizePhraseItems(entry.collocations || entry.common_collocations),
          phraseCollocations: normalizePhraseItems(entry.phraseCollocations || entry.phrase_collocations)
        };
      }

      function applyEntries(chunk, items) {
        const list = Array.isArray(items) ? items : [];
        const usedIndexes = new Set();
        const missing = [];

        setWords((prev) => {
          const next = [...prev];

          chunk.forEach(({ i, w }, orderIndex) => {
            const current = next[i]?.word || w.word;
            let entryIndex = list.findIndex((entry, idx) => !usedIndexes.has(idx) && normalizeWord(entry.word) === normalizeWord(current));

            // 如果 AI 把 injur 返回成 injure，按同批次顺序兜底匹配。
            if (entryIndex < 0 && list[orderIndex] && !usedIndexes.has(orderIndex)) {
              entryIndex = orderIndex;
            }

            if (entryIndex < 0) {
              missing.push({ i, w, reason: "AI没有返回可匹配词条" });
              return;
            }

            const entry = list[entryIndex];
            usedIndexes.add(entryIndex);

            const beforeWord = String(current || "").trim();
            const normalized = normalizeCompletionEntry(entry, w.word, current);
            const afterWord = String(normalized.word || beforeWord).trim();

            next[i] = {
              ...next[i],
              ...normalized,
              word: afterWord || beforeWord,
              difficulty: normalized.difficulty || next[i].difficulty || "",
              status: next[i].status || "",
              aiSlowCompletedAt: Date.now(),
              aiWordAutoRepairedAt: afterWord && normalizeWord(afterWord) !== normalizeWord(beforeWord) ? Date.now() : next[i].aiWordAutoRepairedAt,
              originalBrokenWord: afterWord && normalizeWord(afterWord) !== normalizeWord(beforeWord) ? (next[i].originalBrokenWord || beforeWord) : next[i].originalBrokenWord
            };

            if (afterWord && normalizeWord(afterWord) !== normalizeWord(beforeWord)) {
              repairedWordCount += 1;
            }

            filled += 1;
          });

          return next;
        });

        return missing;
      }

      async function completeSingle(item, reason = "") {
        try {
          const res = await fetch("/api/generate-word", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              word: item.w.word,
              force: isLikelyWrongAiWord(item.w) || hasHeadwordRepair(item.w.word)
            })
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
          }

          const missing = applyEntries([item], [data]);

          if (missing.length) {
            throw new Error("AI返回词条无法写入");
          }
        } catch (error) {
          failed.push(item.w.word);
          failedDetails.push(`${item.w.word}: ${error.message || reason || "单词级补全/修错失败"}`);
        }
      }

      async function runChunk(chunk, chunkIndex, retry = 0) {
        const wordList = chunk.map(({ w }) => w.word);
        const preview = wordList.slice(0, 5).join(", ");

        setBatchInfo(
          `AI慢速补全+修错字 10×1：${completed} / ${targets.length} ｜ 第 ${chunkIndex + 1} 批：${preview}${wordList.length > 5 ? "..." : ""}`
        );

        try {
          const res = await fetch("/api/generate-words", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              words: wordList,
              // 慢速模式允许修错字，所以开启 force。
              force: true
            })
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
          }

          if (!Array.isArray(data.items) || !data.items.length) {
            throw new Error("批量没有返回有效词条");
          }

          const missing = applyEntries(chunk, data.items);

          for (const item of missing) {
            await completeSingle(item, item.reason || "批量返回缺少这个词");
          }
        } catch (error) {
          if (retry < 2) {
            await new Promise((resolve) => setTimeout(resolve, 1500 * (retry + 1)));
            return runChunk(chunk, chunkIndex, retry + 1);
          }

          for (const item of chunk) {
            await completeSingle(item, error.message || "批量失败后单词级补救");
          }
        }
      }

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        const chunk = chunks[chunkIndex];

        await runChunk(chunk, chunkIndex);

        completed += chunk.length;
        setBatchInfo(
          `AI慢速补全+修错字 10×1：${Math.min(completed, targets.length)} / ${targets.length} ｜ 已补全 ${filled} 个 ｜ 改词 ${repairedWordCount} 个 ｜ 失败 ${failed.length} 个`
        );
      }

      setBatchInfo("");
      setToast(`AI慢速补全+修错字完成：处理 ${targets.length} 个，补全 ${filled} 个，改词 ${repairedWordCount} 个，失败 ${failed.length} 个${failedDetails[0] ? "｜失败示例：" + failedDetails.slice(0, 3).join("；") : ""}`);

      return {
        total: targets.length,
        filled,
        repairedWordCount,
        failed: failed.length,
        failedDetails
      };
    } catch (error) {
      setToast(error.message || "AI慢速补全+修错字失败");
    } finally {
      setLoading(false);
    }
  }

  async function aiStableRepairWrongWords10x2() {
    try {
      setLoading(true);

      const targets = words
        .map((w, i) => ({ w, i }))
        .filter(({ w }) => isLikelyWrongAiWord(w));

      if (!targets.length) {
        setToast("没有发现确定错词");
        return { total: 0, failed: 0 };
      }

      const batchSize = 10;
      const concurrency = 2;
      const chunks = [];

      for (let start = 0; start < targets.length; start += batchSize) {
        chunks.push(targets.slice(start, start + batchSize));
      }

      let nextChunkIndex = 0;
      let completed = 0;
      let repaired = 0;
      const failed = [];
      const failedDetails = [];

      function applyEntries(chunk, items) {
        const itemMap = new Map();

        (items || []).forEach((entry) => {
          itemMap.set(normalizeWord(entry.word), entry);
        });

        const missing = [];

        setWords((prev) => {
          const next = [...prev];

          chunk.forEach(({ i, w }) => {
            const current = next[i]?.word || w.word;
            const entry = itemMap.get(normalizeWord(current));

            if (!entry) {
              missing.push({ i, w });
              return;
            }

            next[i] = {
              ...next[i],
              ...entry,
              ieltsUse: normalizeStringArray(entry.ieltsUse || entry.ielts_use),
              topics: normalizeStringArray(entry.topics),
              difficulty: entry.difficulty || next[i].difficulty || "",
              collocations: normalizePhraseItems(entry.collocations || entry.common_collocations),
              phraseCollocations: normalizePhraseItems(entry.phraseCollocations || entry.phrase_collocations),
              status: next[i].status || "",
              aiWrongRepairedAt: Date.now()
            };

            repaired += 1;
          });

          return next;
        });

        return missing;
      }

      async function repairSingle(item, reason = "") {
        try {
          const res = await fetch("/api/generate-word", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              word: item.w.word,
              force: true
            })
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
          }

          applyEntries([item], [data]);
        } catch (error) {
          failed.push(item.w.word);
          failedDetails.push(`${item.w.word}: ${error.message || reason || "单词级修复失败"}`);
        }
      }

      async function runChunk(chunk, workerId, retry = 0) {
        const wordList = chunk.map(({ w }) => w.word);
        const preview = wordList.slice(0, 5).join(", ");

        setBatchInfo(
          `AI稳定修复确定错词 10×2：${completed} / ${targets.length} ｜ 第 ${workerId} 路：${preview}${wordList.length > 5 ? "..." : ""}`
        );

        try {
          const res = await fetch("/api/generate-words", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              words: wordList,
              force: true
            })
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
          }

          if (!Array.isArray(data.items) || !data.items.length) {
            throw new Error("批量没有返回有效词条");
          }

          const missing = applyEntries(chunk, data.items);

          for (const item of missing) {
            await repairSingle(item, "批量返回缺少这个词");
          }
        } catch (error) {
          if (retry < 2) {
            await new Promise((resolve) => setTimeout(resolve, 1200 * (retry + 1)));
            return runChunk(chunk, workerId, retry + 1);
          }

          for (const item of chunk) {
            await repairSingle(item, error.message || "批量失败后单词级补救");
          }
        }
      }

      async function worker(workerId) {
        while (nextChunkIndex < chunks.length) {
          const chunk = chunks[nextChunkIndex];
          nextChunkIndex += 1;

          try {
            await runChunk(chunk, workerId);
          } finally {
            completed += chunk.length;
            setBatchInfo(
              `AI稳定修复确定错词 10×2：${Math.min(completed, targets.length)} / ${targets.length} ｜ 已修复 ${repaired} 个 ｜ 失败 ${failed.length} 个`
            );
          }
        }
      }

      const workerCount = Math.min(concurrency, chunks.length);
      await Promise.all(Array.from({ length: workerCount }, (_, i) => worker(i + 1)));

      setBatchInfo("");
      setToast(`AI稳定修复确定错词完成：处理 ${targets.length} 个，修复 ${repaired} 个，失败 ${failed.length} 个${failedDetails[0] ? "｜失败示例：" + failedDetails.slice(0, 3).join("；") : ""}`);

      return {
        total: targets.length,
        repaired,
        failed: failed.length,
        failedDetails
      };
    } catch (error) {
      setToast(error.message || "AI稳定修复确定错词失败");
    } finally {
      setLoading(false);
    }
  }

  async function generateHundredByFiveBatch(options = {}) {
    const { keepLoading = false, quiet = false } = options;

    try {
      if (!keepLoading) setLoading(true);
      setBatchInfo("");

      const targets = words
        .map((w, i) => ({ w, i }))
        .filter(({ w }) => isMissingAiFields(w));

      if (!targets.length) {
        if (!quiet) setToast("没有发现缺失资料，不需要调用 AI");
        return { total: 0, failed: 0 };
      }

      const batchSize = 100;
      const concurrency = 5;
      const chunks = [];

      for (let start = 0; start < targets.length; start += batchSize) {
        chunks.push(targets.slice(start, start + batchSize));
      }

      let nextChunkIndex = 0;
      let completedWords = 0;
      let failedWords = [];

      let filledWords = 0;

      function normalizeCompletionEntry(entry, originalWord, existingWord) {
        return {
          ...entry,
          // 快速补全模式不改 word。AI 返回 injure，也只拿资料，不把 injur 自动改掉。
          word: existingWord || originalWord,
          ieltsUse: normalizeStringArray(entry.ieltsUse || entry.ielts_use),
          topics: normalizeStringArray(entry.topics),
          difficulty: entry.difficulty || "",
          collocations: normalizePhraseItems(entry.collocations || entry.common_collocations),
          phraseCollocations: normalizePhraseItems(entry.phraseCollocations || entry.phrase_collocations)
        };
      }

      function applyGeneratedItems(chunk, items) {
        const list = Array.isArray(items) ? items : [];
        const usedIndexes = new Set();

        setWords((prev) => {
          const next = [...prev];

          chunk.forEach(({ i, w }, orderIndex) => {
            const current = next[i]?.word || w.word;
            let entryIndex = list.findIndex((entry, idx) => !usedIndexes.has(idx) && normalizeWord(entry.word) === normalizeWord(current));

            // 如果 AI 把 injur 返回成 injure，按同批次顺序兜底写回资料。
            if (entryIndex < 0 && list[orderIndex] && !usedIndexes.has(orderIndex)) {
              entryIndex = orderIndex;
            }

            if (entryIndex < 0) {
              failedWords.push(current);
              return;
            }

            const entry = list[entryIndex];
            usedIndexes.add(entryIndex);
            const normalized = normalizeCompletionEntry(entry, w.word, current);

            next[i] = {
              ...next[i],
              ...normalized,
              word: current,
              difficulty: normalized.difficulty || next[i].difficulty || "",
              status: next[i].status || ""
            };

            filledWords += 1;
          });

          return next;
        });
      }

      async function runOneChunk(chunk, workerId, retry = 0) {
        const wordList = chunk.map(({ w }) => w.word);
        const preview = wordList.slice(0, 5).join(", ");

        setBatchInfo(
          `AI快速补全缺失资料 100×5：${completedWords} / ${targets.length} ｜ 第 ${workerId} 路：${preview}${wordList.length > 5 ? "..." : ""}`
        );

        const res = await fetch("/api/generate-words", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ words: wordList })
        });

        const data = await res.json();

        if (!res.ok) {
          const reason = data?.detail || data?.error || `HTTP ${res.status}`;

          if (retry < 1) {
            setBatchInfo(`第 ${workerId} 路失败，正在重试：${reason}`);
            return runOneChunk(chunk, workerId, retry + 1);
          }

          failedWords.push(...wordList);
          setBatchInfo(`第 ${workerId} 路失败：${reason}`);
          return;
        }

        if (!Array.isArray(data.items) || !data.items.length) {
          failedWords.push(...wordList);
          setBatchInfo(`第 ${workerId} 路没有返回有效词条`);
          return;
        }

        applyGeneratedItems(chunk, data.items || []);
      }

      async function worker(workerId) {
        while (nextChunkIndex < chunks.length) {
          const chunkIndex = nextChunkIndex;
          nextChunkIndex += 1;
          const chunk = chunks[chunkIndex];

          try {
            await runOneChunk(chunk, workerId);
          } catch {
            failedWords.push(...chunk.map(({ w }) => w.word));
          } finally {
            completedWords += chunk.length;
            setBatchInfo(
              `AI快速补全缺失资料 100×5：${Math.min(completedWords, targets.length)} / ${targets.length} ｜ 已补全 ${filledWords} 个 ｜ 失败 ${failedWords.length} 个 ｜ 剩余批次 ${Math.max(0, chunks.length - nextChunkIndex)}`
            );
          }
        }
      }

      const workerCount = Math.min(concurrency, chunks.length);
      await Promise.all(
        Array.from({ length: workerCount }, (_, i) => worker(i + 1))
      );

      setBatchInfo("");

      if (failedWords.length) {
        if (!quiet) setToast(`AI快速补全完成：处理 ${targets.length} 个，补全 ${filledWords} 个，失败 ${failedWords.length} 个，可再次点击补剩余`);
      } else {
        if (!quiet) setToast(`AI快速补全完成：处理 ${targets.length} 个，补全 ${filledWords} 个`);
      }

      return { total: targets.length, failed: failedWords.length, filled: filledWords };
    } catch (error) {
      setToast(error.message || "AI快速补全缺失资料 100×5失败");
    } finally {
      setLoading(false);
    }
  }

  async function completeMeaningAndAudio() {
    try {
      setLoading(true);
      setBatchInfo("AI补全释义+音频：正在补全单词释义...");

      const meaningResult = await generateHundredByFiveBatch({
        keepLoading: true,
        quiet: true
      });

      setBatchInfo("AI补全释义+音频：释义完成，正在继续补全全部音频...");

      const audioResult = await prefillWordAudio({
        keepLoading: true,
        quiet: true
      });

      setBatchInfo("");

      setToast(
        `AI补全释义+音频完成：释义 ${meaningResult?.total || 0} 个，释义失败 ${meaningResult?.failed || 0} 个；音频成功 ${audioResult?.success || 0} 个，音频失败 ${audioResult?.failed || 0} 个`
      );
    } catch (error) {
      setBatchInfo("");
      setToast(error.message || "AI补全释义+音频失败");
    } finally {
      setLoading(false);
    }
  }

  async function categorizeWords() {
    try {
      setLoading(true);
      setBatchInfo("");

      const targets = words
        .map((w, i) => ({ w, i }))
        .filter(({ w }) => isMissingClassification(w));

      if (!targets.length) {
        setToast("没有需要归纳的单词");
        return;
      }

      const batchSize = 20;
      const concurrency = 5;
      const chunks = [];

      for (let start = 0; start < targets.length; start += batchSize) {
        chunks.push(targets.slice(start, start + batchSize));
      }

      let nextChunkIndex = 0;
      let completedWords = 0;
      let failedWords = [];

      function applyCategorizedItems(chunk, items) {
        const itemMap = new Map();

        (items || []).forEach((item) => {
          itemMap.set(normalizeWord(item.word), item);
        });

        setWords((prev) => {
          const next = [...prev];

          chunk.forEach(({ i }) => {
            const match = itemMap.get(normalizeWord(next[i].word));

            if (!match) {
              failedWords.push(next[i].word);
              return;
            }

            next[i] = {
              ...next[i],
              ieltsUse: normalizeStringArray(match.ieltsUse || match.ielts_use),
              topics: normalizeStringArray(match.topics),
              difficulty: match.difficulty || next[i].difficulty || "中级核心"
            };
          });

          return next;
        });
      }

      async function runOneChunk(chunk, workerId, retry = 0) {
        const preview = chunk.map(({ w }) => w.word).slice(0, 6).join(", ");

        setBatchInfo(
          `AI归纳分类：${completedWords} / ${targets.length} ｜ 第 ${workerId} 路：${preview}${chunk.length > 6 ? "..." : ""}`
        );

        const res = await fetch("/api/categorize-words", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            words: chunk.map(({ w }) => ({
              word: w.word,
              pos: w.pos,
              meaning: w.meaning,
              example: w.example
            }))
          })
        });

        const data = await res.json();

        if (!res.ok) {
          if (retry < 1) {
            return runOneChunk(chunk, workerId, retry + 1);
          }

          failedWords.push(...chunk.map(({ w }) => w.word));
          return;
        }

        applyCategorizedItems(chunk, data.items || []);
      }

      async function worker(workerId) {
        while (nextChunkIndex < chunks.length) {
          const chunkIndex = nextChunkIndex;
          nextChunkIndex += 1;
          const chunk = chunks[chunkIndex];

          try {
            await runOneChunk(chunk, workerId);
          } catch {
            failedWords.push(...chunk.map(({ w }) => w.word));
          } finally {
            completedWords += chunk.length;
            setBatchInfo(
              `AI归纳分类：${Math.min(completedWords, targets.length)} / ${targets.length} ｜ 失败 ${failedWords.length} 个 ｜ 剩余批次 ${Math.max(0, chunks.length - nextChunkIndex)}`
            );
          }
        }
      }

      const workerCount = Math.min(concurrency, chunks.length);
      await Promise.all(
        Array.from({ length: workerCount }, (_, i) => worker(i + 1))
      );

      setBatchInfo("");

      if (failedWords.length) {
        setToast(`AI归纳完成，但有 ${failedWords.length} 个失败，可再次点击归纳`);
      } else {
        setToast(`AI归纳完成：${targets.length} 个单词`);
      }
    } catch (error) {
      setToast(error.message || "AI 归纳分类失败");
    } finally {
      setLoading(false);
    }
  }

  async function aiDedupe() {
    try {
      setLoading(true);
      setDuplicateInfo("正在本地快速扫描重复词...");

      const localMap = new Map();
      let localRemoved = 0;

      const localDeduped = words.filter((word) => {
        const key = normalizeWord(word.word);
        if (!key) return false;

        if (localMap.has(key)) {
          const existingIndex = localMap.get(key);
          localRemoved += 1;

          setWords((prev) => {
            const next = [...prev];
            next[existingIndex] = mergeWord(next[existingIndex], word);
            return next;
          });

          return false;
        }

        localMap.set(key, localMap.size);
        return true;
      });

      const workingWords = localDeduped;
      setWords(workingWords);

      setDuplicateInfo(`本地去重完成：删除/合并 ${localRemoved} 个。AI 正在检查疑似重复...`);

      const res = await fetch("/api/dedupe-words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          words: workingWords.map((w) => w.word)
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || data?.detail || "AI 去重失败");
      }

      const groups = Array.isArray(data.groups) ? data.groups : [];

      if (!groups.length) {
        setDuplicateInfo(`AI 检查完成：没有发现需要合并的疑似重复词。本地已处理 ${localRemoved} 个。`);
        setToast("AI 去重完成");
        return;
      }

      const duplicateSet = new Set();

      groups.forEach((group) => {
        (group.duplicates || []).forEach((word) => duplicateSet.add(normalizeWord(word)));
      });

      setWords((prev) => prev.filter((word) => !duplicateSet.has(normalizeWord(word.word))));
      resetWordStudySessionState();

      setDuplicateInfo(
        `AI 检查完成：发现 ${groups.length} 组疑似重复，AI 删除 ${duplicateSet.size} 个；本地已处理 ${localRemoved} 个。`
      );
      setToast(`AI 去重完成：删除 ${duplicateSet.size + localRemoved} 个重复项`);
    } catch (error) {
      setDuplicateInfo("");
      setToast(error.message || "AI 去重失败");
    } finally {
      setLoading(false);
    }
  }

  return { cleanWordList, generateForIndex, confirmAiCost, generateCurrent, aiRepairCurrentWordSymbol, generateMissingBatch, aiCompletePendingAndUnclassifiedOneByOne, aiSlowCompleteMissing10x1, aiStableRepairWrongWords10x2, generateHundredByFiveBatch, completeMeaningAndAudio, categorizeWords, aiDedupe };
}
